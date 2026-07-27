"use strict";

/* =========================================================
   EXPENSES PAGE LOGIC
   Same session pattern as home.js (read ?user= from the URL,
   verify against Auth, load that account's data via Store).
   Expense records use the SAME Store as Income — just with
   type:'expense' (already treated as negative by
   signedAmount() in shared.js) plus a 'frequency' field
   ('weekly' | 'monthly' | 'yearly') that's unique to expenses.
   ========================================================= */

const EXPENSE_CATEGORIES = ['Housing', 'Utilities', 'Subscriptions', 'Food', 'Transportation', 'Insurance', 'Debt', 'Other'];
const FREQUENCIES = [
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly',  label: 'Yearly'  },
];

let freqFilter = 'all'; // 'all' | 'weekly' | 'monthly' | 'yearly'
let editingId = null; // id of the expense currently being edited, or null

// Converts any frequency to a monthly-equivalent figure, so weekly and
// yearly expenses can be compared/summed on the same footing.
function monthlyEquivalent(tx){
  const amt = Number(tx.amount) || 0;
  if(tx.frequency === 'weekly') return amt * 52 / 12;
  if(tx.frequency === 'yearly') return amt / 12;
  return amt; // monthly
}

function freqLabel(id){
  const f = FREQUENCIES.find(f => f.id === id);
  return f ? f.label : id;
}

function renderBalance(){
  const total = Store.all().reduce((sum, t) => sum + signedAmount(t), 0);
  document.getElementById('balance-figure').textContent = fmtMoney(total);
}

function renderExpenses(){
  const root = document.getElementById('view-root');
  const all = Store.byType('expense');
  const totalsByFreq = { weekly: 0, monthly: 0, yearly: 0 };
  all.forEach(t => { totalsByFreq[t.frequency] = (totalsByFreq[t.frequency] || 0) + Number(t.amount || 0); });
  const combinedMonthly = all.reduce((s, t) => s + monthlyEquivalent(t), 0);

  const byCategory = {};
  all.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + monthlyEquivalent(t); });

  const visible = (freqFilter === 'all' ? all : all.filter(t => t.frequency === freqFilter))
    .slice()
    .sort((a,b) => a.date < b.date ? 1 : -1);

  const editingEntry = editingId ? all.find(t => t.id === editingId) : null;
  if(editingId && !editingEntry) editingId = null;

  root.innerHTML = `
    <div class="cards">
      <div class="card"><div class="k">Weekly Total</div><div class="v bad">${fmtMoney(totalsByFreq.weekly)}</div></div>
      <div class="card"><div class="k">Monthly Total</div><div class="v bad">${fmtMoney(totalsByFreq.monthly)}</div></div>
      <div class="card"><div class="k">Yearly Total</div><div class="v bad">${fmtMoney(totalsByFreq.yearly)}</div></div>
      <div class="card"><div class="k">Combined / Month</div><div class="v bad">${fmtMoney(combinedMonthly)}</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>${editingEntry ? 'Edit Expense' : 'Add Expense'}</h2>
        ${editingEntry ? '<button class="btn ghost small" id="cancel-edit-btn">Cancel</button>' : ''}
      </div>
      <div class="form-grid" id="expense-form">
        <div class="field">
          <label>Amount</label>
          <input type="number" step="0.01" min="0" id="f-amount" placeholder="0.00" value="${editingEntry ? editingEntry.amount : ''}" />
        </div>
        <div class="field">
          <label>Description</label>
          <input type="text" id="f-desc" placeholder="e.g. Rent" value="${editingEntry ? editingEntry.description : ''}" />
        </div>
        <div class="field">
          <label>Category</label>
          <select id="f-category">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${editingEntry && editingEntry.category===c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Frequency</label>
          <select id="f-frequency">
            ${FREQUENCIES.map(f => `<option value="${f.id}" ${editingEntry && editingEntry.frequency===f.id ? 'selected' : ''}>${f.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="f-date" value="${editingEntry ? editingEntry.date : new Date().toISOString().slice(0,10)}" />
        </div>
        <button class="btn" type="button" id="add-expense-btn">${editingEntry ? 'Save Changes' : 'Add Expense'}</button>
      </div>
    </div>

    ${Object.keys(byCategory).length ? `
    <div class="panel">
      <div class="panel-head"><h2>By Category (monthly equivalent)</h2></div>
      <div class="breakdown-list">
        ${Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([name, amt]) => {
          const pct = combinedMonthly ? (amt/combinedMonthly*100) : 0;
          return `<div class="b-row">
            <div class="name">${name}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
            <div class="pct">${pct.toFixed(0)}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head">
        <h2>Expenses</h2>
        <div class="freq-tabs" id="freq-tabs">
          <button class="freq-tab ${freqFilter==='all'?'active':''}" data-freq="all">All</button>
          ${FREQUENCIES.map(f => `<button class="freq-tab ${freqFilter===f.id?'active':''}" data-freq="${f.id}">${f.label}</button>`).join('')}
        </div>
      </div>
      ${visible.length ? `
      <table class="ledger">
        <thead>
          <tr>
            <th>Date</th><th>Description</th><th>Category</th><th>Frequency</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right">Monthly Equiv.</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="expense-body"></tbody>
      </table>` : `<div class="empty">No expenses in this view yet. <b>Add one above</b> to get started.</div>`}
    </div>
  `;

  if(visible.length){
    const tbody = root.querySelector('#expense-body');
    visible.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="date">${fmtDate(t.date)}</td>
        <td>${t.description || ''}</td>
        <td><span class="pill">${t.category}</span></td>
        <td><span class="pill freq">${freqLabel(t.frequency)}</span></td>
        <td class="amount">-${fmtMoney(Number(t.amount)).replace('$','$')}</td>
        <td class="equiv">${fmtMoney(monthlyEquivalent(t))}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="edit" data-id="${t.id}" title="Edit">✎</button>
            <button class="icon-btn" data-action="delete" data-id="${t.id}" title="Delete">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="edit"]');
      if(editBtn){
        editingId = editBtn.dataset.id;
        renderExpenses();
        return;
      }
      const delBtn = e.target.closest('[data-action="delete"]');
      if(delBtn){
        if(editingId === delBtn.dataset.id) editingId = null;
        Store.remove(delBtn.dataset.id);
        toast('Expense removed');
        renderExpenses();
        renderBalance();
      }
    });
  }

  const cancelBtn = root.querySelector('#cancel-edit-btn');
  if(cancelBtn){
    cancelBtn.addEventListener('click', () => {
      editingId = null;
      renderExpenses();
    });
  }

  root.querySelectorAll('#freq-tabs .freq-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      freqFilter = btn.dataset.freq;
      renderExpenses();
    });
  });

  function handleAddExpense(){
    const amountEl = root.querySelector('#f-amount');
    const descEl = root.querySelector('#f-desc');
    const categoryEl = root.querySelector('#f-category');
    const frequencyEl = root.querySelector('#f-frequency');
    const dateEl = root.querySelector('#f-date');

    const amount = parseFloat(amountEl.value);
    if(!amount || amount <= 0){
      toast('Enter an amount greater than 0');
      amountEl.focus();
      return;
    }
    const description = (descEl.value || '').trim();
    if(!description){
      toast('Add a short description');
      descEl.focus();
      return;
    }
    if(!dateEl.value){
      toast('Pick a date');
      dateEl.focus();
      return;
    }

    const payload = {
      type: 'expense',
      amount: amount,
      description: description,
      category: categoryEl.value,
      frequency: frequencyEl.value,
      date: dateEl.value
    };

    if(editingEntry){
      const id = editingEntry.id;
      editingId = null;
      Store.update(id, payload);
      toast('Expense updated');
    } else {
      Store.add(payload);
      toast('Expense added');
    }
    renderExpenses();
    renderBalance();
  }

  root.querySelector('#add-expense-btn').addEventListener('click', handleAddExpense);
  root.querySelectorAll('#expense-form input').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') handleAddExpense();
    });
  });
}

Bus.on('store:changed', () => { renderExpenses(); renderBalance(); });

/* =========================================================
   SESSION HANDLING — same pattern as home.js's boot()
   ========================================================= */

function currentUsernameFromUrl(){
  const params = new URLSearchParams(window.location.search);
  return (params.get('user') || '').trim().toLowerCase();
}

async function logout(){
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn.disabled = true;
  logoutBtn.textContent = 'Saving…';
  await Promise.all([Store.flush(), History.flush()]);
  Store.unload();
  History.unload();
  window.location.href = 'login.html';
}

async function boot(){
  const username = currentUsernameFromUrl();
  if(!username){
    window.location.href = 'login.html';
    return;
  }

  await Auth.loadAccounts();
  if(!Auth.exists(username)){
    window.location.href = 'login.html';
    return;
  }

  Auth.setCurrentUser(username);
  document.getElementById('account-name-label').textContent = username;
  document.getElementById('logout-btn').addEventListener('click', logout);

  const qs = '?user=' + encodeURIComponent(username);
  document.getElementById('nav-menu').href = 'menu.html' + qs;
  document.getElementById('nav-income').href = 'home.html' + qs;
  document.getElementById('nav-history').href = 'history.html' + qs;

  await Store.loadForAccount(username);
  await History.loadForAccount(username);
  renderExpenses();
  renderBalance();
}
boot();
