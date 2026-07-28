"use strict";

/* =========================================================
   HISTORY PAGE LOGIC
   Purely a viewer — everything here comes from the History
   module in shared.js, which is append-only. This page never
   calls History.append, Store.add, Store.update, or
   Store.remove; it just displays what's already been logged.
   ========================================================= */

let actionFilter = 'all'; // 'all' | 'add' | 'update' | 'remove'
let typeFilter = 'all';   // 'all' | 'income' | 'expense'

const ACTION_LABELS = { add: 'Entered', update: 'Altered', remove: 'Deleted', achieved: 'Achieved' };
const ACTION_CLASSES = { add: 'action-add', update: 'action-update', remove: 'action-remove', achieved: 'action-achieved' };

function describeRecord(record){
  if(!record) return '—';
  if(record.type === 'income'){
    return record.source || '—';
  }
  if(record.type === 'goal'){
    return record.name || '—';
  }
  if(record.type === 'contribution'){
    return record.goalName ? `Contribution → ${record.goalName}` : 'Goal contribution';
  }
  return record.description || '—';
}

function fmtWhen(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function renderHistory(){
  const root = document.getElementById('view-root');
  const all = History.all().slice().sort((a,b) => a.at < b.at ? 1 : -1);

  const counts = { add: 0, update: 0, remove: 0 };
  all.forEach(e => { counts[e.action] = (counts[e.action] || 0) + 1; });

  const visible = all.filter(e => {
    if(actionFilter !== 'all' && e.action !== actionFilter) return false;
    if(typeFilter !== 'all' && e.txType !== typeFilter) return false;
    return true;
  });

  root.innerHTML = `
    <div class="cards">
      <div class="card"><div class="k">Total Entries</div><div class="v">${all.length}</div></div>
      <div class="card"><div class="k">Entered</div><div class="v">${counts.add}</div></div>
      <div class="card"><div class="k">Altered</div><div class="v">${counts.update}</div></div>
      <div class="card"><div class="k">Deleted</div><div class="v">${counts.remove}</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Log</h2>
        <div class="filter-row">
          <div class="filter-group">
            <span class="filter-label">Action</span>
            <button class="filter-tab ${actionFilter==='all'?'active':''}" data-kind="action" data-val="all">All</button>
            <button class="filter-tab ${actionFilter==='add'?'active':''}" data-kind="action" data-val="add">Entered</button>
            <button class="filter-tab ${actionFilter==='update'?'active':''}" data-kind="action" data-val="update">Altered</button>
            <button class="filter-tab ${actionFilter==='remove'?'active':''}" data-kind="action" data-val="remove">Deleted</button>
          </div>
          <div class="filter-group">
            <span class="filter-label">Type</span>
            <button class="filter-tab ${typeFilter==='all'?'active':''}" data-kind="type" data-val="all">All</button>
            <button class="filter-tab ${typeFilter==='income'?'active':''}" data-kind="type" data-val="income">Income</button>
            <button class="filter-tab ${typeFilter==='expense'?'active':''}" data-kind="type" data-val="expense">Expenses</button>
            <button class="filter-tab ${typeFilter==='goal'?'active':''}" data-kind="type" data-val="goal">Goals</button>
            <button class="filter-tab ${typeFilter==='contribution'?'active':''}" data-kind="type" data-val="contribution">Contributions</button>
          </div>
        </div>
      </div>
      ${visible.length ? `
      <table class="ledger">
        <thead>
          <tr>
            <th>When</th><th>Action</th><th>Type</th><th>Details</th><th>Category</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody id="history-body"></tbody>
      </table>` : `<div class="empty">No history entries match this filter${all.length ? ' yet' : ''}.</div>`}
      <div class="immutable-note">
        This log only grows — editing or deleting an entry in Income or Expenses adds a new "Altered" or "Deleted" line here, it never changes or removes what's already recorded.
      </div>
    </div>
  `;

  if(visible.length){
    const tbody = root.querySelector('#history-body');
    visible.forEach(e => {
      const r = e.record || {};
      let amountClass, sign, amountValue, categoryCell, typeBadgeClass, typeLabel;
      if(e.txType === 'goal'){
        amountClass = 'goal';
        sign = '';
        amountValue = Number(r.targetAmount) || 0;
        categoryCell = (r.startDate && r.endDate) ? `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}` : '—';
        typeBadgeClass = 'type-goal';
        typeLabel = 'Goal';
      } else if(e.txType === 'contribution'){
        amountClass = 'expense';
        sign = '-';
        amountValue = Number(r.amount) || 0;
        categoryCell = '—';
        typeBadgeClass = 'type-contribution';
        typeLabel = 'Contribution';
      } else {
        amountClass = e.txType === 'income' ? 'income' : 'expense';
        sign = e.txType === 'income' ? '+' : '-';
        amountValue = Number(r.amount) || 0;
        categoryCell = r.category || '—';
        typeBadgeClass = e.txType === 'income' ? 'type-income' : 'type-expense';
        typeLabel = e.txType === 'income' ? 'Income' : 'Expense';
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="date">${fmtWhen(e.at)}</td>
        <td><span class="pill ${ACTION_CLASSES[e.action] || ''}">${ACTION_LABELS[e.action] || e.action}</span></td>
        <td><span class="pill ${typeBadgeClass}">${typeLabel}</span></td>
        <td>${describeRecord(r)}${r.frequency ? ` <span style="color:var(--ink-faint)">(${r.frequency})</span>` : ''}</td>
        <td>${categoryCell}</td>
        <td class="amount ${amountClass}">${sign}${fmtMoney(amountValue)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  root.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.dataset.kind === 'action') actionFilter = btn.dataset.val;
      else typeFilter = btn.dataset.val;
      renderHistory();
    });
  });
}

Bus.on('history:changed', renderHistory);

/* =========================================================
   SESSION HANDLING — same pattern as the other pages
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
  document.getElementById('nav-expenses').href = 'expenses.html' + qs;
  document.getElementById('nav-goals').href = 'goals.html' + qs;

  await History.loadForAccount(username);
  renderHistory();
}
boot();
