"use strict";

/* =========================================================
   HOME (INCOME) PAGE LOGIC
   Reads the signed-in username from the URL (set by
   login.html), verifies it against Auth, then loads that
   account's data via Store. This page now does exactly one
   thing — Income — since Expenses moved to its own page
   (expenses.html) and Menu (menu.html) is the hub that links
   everything together.
   ========================================================= */

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Refund', 'Gift', 'Investment', 'Other'];

let editingId = null; // id of the income entry currently being edited, or null

function renderBalance(){
  const total = Store.all().reduce((sum, t) => sum + signedAmount(t), 0);
  document.getElementById('balance-figure').textContent = fmtMoney(total);
}

function renderIncome(){
  const root = document.getElementById('view-root');
  const entries = Store.byType('income').sort((a,b) => a.date < b.date ? 1 : -1);
  const total = entries.reduce((s,t) => s + Number(t.amount || 0), 0);
  const thisMonth = entries.filter(t => t.date.slice(0,7) === new Date().toISOString().slice(0,7))
                            .reduce((s,t) => s + Number(t.amount||0), 0);
  const avg = entries.length ? total / entries.length : 0;
  const bySource = {};
  entries.forEach(t => { bySource[t.source] = (bySource[t.source]||0) + Number(t.amount||0); });
  const topSource = Object.entries(bySource).sort((a,b) => b[1]-a[1])[0];

  // If we're editing an entry that's since been deleted out from under us
  // (e.g. from another tab), fall back to "add" mode instead of erroring.
  const editingEntry = editingId ? entries.find(t => t.id === editingId) : null;
  if(editingId && !editingEntry) editingId = null;

  root.innerHTML = `
    <div class="cards">
      <div class="card"><div class="k">Total Income</div><div class="v good">${fmtMoney(total)}</div></div>
      <div class="card"><div class="k">This Month</div><div class="v">${fmtMoney(thisMonth)}</div></div>
      <div class="card"><div class="k">Avg / Entry</div><div class="v">${fmtMoney(avg)}</div></div>
      <div class="card"><div class="k">Top Source</div><div class="v" style="font-size:16px">${topSource ? topSource[0] : '—'}</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>${editingEntry ? 'Edit Income' : 'Add Income'}</h2>
        ${editingEntry ? '<button class="btn ghost small" id="cancel-edit-btn">Cancel</button>' : ''}
      </div>
      <div class="form-grid" id="income-form">
        <div class="field">
          <label>Amount</label>
          <input type="number" step="0.01" min="0" id="f-amount" placeholder="0.00" value="${editingEntry ? editingEntry.amount : ''}" />
        </div>
        <div class="field">
          <label>Source</label>
          <input type="text" id="f-source" placeholder="e.g. Neumont Payroll" value="${editingEntry ? editingEntry.source : ''}" />
        </div>
        <div class="field">
          <label>Category</label>
          <select id="f-category">
            ${INCOME_CATEGORIES.map(c => `<option value="${c}" ${editingEntry && editingEntry.category===c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="f-date" value="${editingEntry ? editingEntry.date : new Date().toISOString().slice(0,10)}" />
        </div>
        <div class="field">
          <label>Note (optional)</label>
          <input type="text" id="f-note" placeholder="Add a detail..." value="${editingEntry ? (editingEntry.note || '') : ''}" />
        </div>
        <button class="btn" type="button" id="add-income-btn">${editingEntry ? 'Save Changes' : 'Add Entry'}</button>
      </div>
    </div>

    ${Object.keys(bySource).length ? `
    <div class="panel">
      <div class="panel-head"><h2>By Source</h2></div>
      <div class="breakdown-list">
        ${Object.entries(bySource).sort((a,b)=>b[1]-a[1]).map(([name, amt]) => {
          const pct = total ? (amt/total*100) : 0;
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
        <h2>Ledger</h2>
        <button class="btn ghost small" id="export-btn">Export CSV</button>
      </div>
      ${entries.length ? `
      <table class="ledger">
        <thead>
          <tr>
            <th>Date</th><th>Source</th><th>Category</th><th>Note</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right">Balance</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="ledger-body"></tbody>
      </table>` : `<div class="empty">No income logged yet. <b>Add your first entry above</b> to start the ledger.</div>`}
    </div>
  `;

  // running balance across ALL transaction types (income AND expenses),
  // computed chronologically then displayed newest-first
  if(entries.length){
    const chronological = Store.all().slice().sort((a,b) => a.date < b.date ? -1 : 1);
    let running = 0;
    const balanceAtId = {};
    chronological.forEach(t => { running += signedAmount(t); balanceAtId[t.id] = running; });

    const tbody = root.querySelector('#ledger-body');
    entries.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="date">${fmtDate(t.date)}</td>
        <td>${t.source}</td>
        <td><span class="pill">${t.category}</span></td>
        <td style="color:var(--ink-faint)">${t.note || ''}</td>
        <td class="amount">+${fmtMoney(Number(t.amount)).replace('$','$')}</td>
        <td class="running">${fmtMoney(balanceAtId[t.id])}</td>
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
        renderIncome();
        return;
      }
      const delBtn = e.target.closest('[data-action="delete"]');
      if(delBtn){
        if(editingId === delBtn.dataset.id) editingId = null;
        Store.remove(delBtn.dataset.id);
        toast('Entry removed');
      }
    });
  }

  const cancelBtn = root.querySelector('#cancel-edit-btn');
  if(cancelBtn){
    cancelBtn.addEventListener('click', () => {
      editingId = null;
      renderIncome();
    });
  }

  function handleAddIncome(){
    const amountEl = root.querySelector('#f-amount');
    const sourceEl = root.querySelector('#f-source');
    const categoryEl = root.querySelector('#f-category');
    const dateEl = root.querySelector('#f-date');
    const noteEl = root.querySelector('#f-note');

    const amount = parseFloat(amountEl.value);
    if(!amount || amount <= 0){
      toast('Enter an amount greater than 0');
      amountEl.focus();
      return;
    }
    const source = (sourceEl.value || '').trim();
    if(!source){
      toast('Add a source for this income');
      sourceEl.focus();
      return;
    }
    if(!dateEl.value){
      toast('Pick a date');
      dateEl.focus();
      return;
    }

    const payload = {
      type: 'income',
      amount: amount,
      source: source,
      category: categoryEl.value,
      date: dateEl.value,
      note: (noteEl.value || '').trim()
    };

    if(editingEntry){
      const id = editingEntry.id;
      editingId = null;
      Store.update(id, payload);
      toast('Income updated');
    } else {
      Store.add(payload);
      toast('Income added');
    }
  }

  root.querySelector('#add-income-btn').addEventListener('click', handleAddIncome);

  root.querySelectorAll('#income-form input').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') handleAddIncome();
    });
  });

  const exportBtn = root.querySelector('#export-btn');
  if(exportBtn){
    exportBtn.addEventListener('click', () => {
      const rows = [['Date','Source','Category','Note','Amount']];
      entries.forEach(t => rows.push([t.date, t.source, t.category, t.note||'', t.amount]));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type:'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'income.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  }
}

Bus.on('store:changed', () => { renderIncome(); renderBalance(); });

/* =========================================================
   SESSION HANDLING
   ========================================================= */

function currentUsernameFromUrl(){
  const params = new URLSearchParams(window.location.search);
  return (params.get('user') || '').trim().toLowerCase();
}

async function logout(){
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn.disabled = true;
  logoutBtn.textContent = 'Saving…';
  await Promise.all([Store.flush(), History.flush()]); // make sure the last change is actually written before we leave
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
    // someone hit home.html directly without signing in through login.html
    window.location.href = 'login.html';
    return;
  }

  Auth.setCurrentUser(username);
  document.getElementById('account-name-label').textContent = username;
  document.getElementById('logout-btn').addEventListener('click', logout);

  const qs = '?user=' + encodeURIComponent(username);
  document.getElementById('nav-menu').href = 'menu.html' + qs;
  document.getElementById('nav-expenses').href = 'expenses.html' + qs;
  document.getElementById('nav-history').href = 'history.html' + qs;

  await Store.loadForAccount(username);
  await History.loadForAccount(username);
  renderIncome();
  renderBalance();
}
boot();
