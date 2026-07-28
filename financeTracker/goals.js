"use strict";

/* =========================================================
   GOALS PAGE LOGIC
   Goals are stored in the SAME Store as income/expense — with
   type:'goal'. shared.js's signedAmount() treats type:'goal'
   as balance-neutral (0), so setting a goal never touches the
   balance by itself.

   Progress no longer happens automatically from income/expense
   dates. It only comes from manual "contribution" records
   (type:'contribution', tied to a goal via goalId) that the
   user explicitly creates on this page. A contribution is
   treated like an expense by signedAmount() — it's real money
   leaving the general balance and being set aside for the goal.

   Both goal edits and contributions flow through Store, so
   History picks up "Entered / Altered / Deleted" automatically.
   The one thing that ISN'T a normal Store action is a goal
   crossing its target for the first time — that's detected
   here and logged explicitly as an "achieved" History entry.
   ========================================================= */

let editingId = null;       // id of the goal currently being edited, or null
let contributingId = null;  // id of the goal currently showing the "add money" mini-form, or null
let statusFilter = 'all';   // 'all' | 'active' | 'achieved' | 'expired'

function todayISO(){
  return new Date().toISOString().slice(0,10);
}

function contributionsFor(goalId){
  return Store.all().filter(t => t.type === 'contribution' && t.goalId === goalId);
}

function progressAmount(goal){
  return contributionsFor(goal.id).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

function goalStatus(goal){
  const progress = progressAmount(goal);
  if(goal.targetAmount > 0 && progress >= goal.targetAmount) return 'achieved';
  if(todayISO() > goal.endDate) return 'expired';
  return 'active';
}

function daysLeft(goal){
  const end = new Date(goal.endDate + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return Math.round((end - today) / 86400000);
}

function timeLeftLabel(goal, status){
  if(status === 'achieved') return 'Goal reached';
  const days = daysLeft(goal);
  if(days < 0) return Math.abs(days) + (Math.abs(days) === 1 ? ' day overdue' : ' days overdue');
  if(days === 0) return 'Due today';
  if(days === 1) return '1 day left';
  if(days < 14) return days + ' days left';
  if(days < 60) return Math.round(days/7) + ' weeks left';
  return Math.round(days/30) + ' months left';
}

function renderBalance(){
  const total = Store.all().reduce((sum, t) => sum + signedAmount(t), 0);
  const el = document.getElementById('balance-figure');
  if(el) el.textContent = fmtMoney(total);
}

function renderGoals(){
  const root = document.getElementById('view-root');
  const all = Store.byType('goal').map(g => Object.assign({}, g, {
    _progress: progressAmount(g),
    _status: goalStatus(g)
  }));

  const counts = { active: 0, achieved: 0, expired: 0 };
  all.forEach(g => { counts[g._status] = (counts[g._status] || 0) + 1; });

  const visible = (statusFilter === 'all' ? all : all.filter(g => g._status === statusFilter))
    .slice()
    .sort((a,b) => a.endDate < b.endDate ? -1 : 1);

  const editingGoal = editingId ? all.find(g => g.id === editingId) : null;
  if(editingId && !editingGoal) editingId = null;
  if(contributingId && !all.find(g => g.id === contributingId)) contributingId = null;

  root.innerHTML = `
    <div class="cards">
      <div class="card"><div class="k">Total Goals</div><div class="v">${all.length}</div></div>
      <div class="card"><div class="k">Active</div><div class="v">${counts.active}</div></div>
      <div class="card"><div class="k">Achieved</div><div class="v">${counts.achieved}</div></div>
      <div class="card"><div class="k">Expired</div><div class="v">${counts.expired}</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>${editingGoal ? 'Edit Goal' : 'Set a New Goal'}</h2>
        ${editingGoal ? '<button class="btn ghost small" id="cancel-edit-btn">Cancel</button>' : ''}
      </div>
      <div class="form-grid" id="goal-form">
        <div class="field">
          <label>Goal Name</label>
          <input type="text" id="f-name" placeholder="e.g. Emergency Fund" value="${editingGoal ? editingGoal.name : ''}" />
        </div>
        <div class="field">
          <label>Target Amount</label>
          <input type="number" step="0.01" min="0" id="f-target" placeholder="0.00" value="${editingGoal ? editingGoal.targetAmount : ''}" />
        </div>
        <div class="field">
          <label>Start Date</label>
          <input type="date" id="f-start" value="${editingGoal ? editingGoal.startDate : todayISO()}" />
        </div>
        <div class="field">
          <label>Target Date</label>
          <input type="date" id="f-end" value="${editingGoal ? editingGoal.endDate : ''}" />
        </div>
        <button class="btn" type="button" id="save-goal-btn">${editingGoal ? 'Save Changes' : 'Set Goal'}</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Your Goals</h2>
        <div class="filter-row">
          <button class="filter-tab ${statusFilter==='all'?'active':''}" data-val="all">All</button>
          <button class="filter-tab ${statusFilter==='active'?'active':''}" data-val="active">Active</button>
          <button class="filter-tab ${statusFilter==='achieved'?'active':''}" data-val="achieved">Achieved</button>
          <button class="filter-tab ${statusFilter==='expired'?'active':''}" data-val="expired">Expired</button>
        </div>
      </div>
      ${visible.length ? `<div class="goal-list" id="goal-list"></div>` : `<div class="empty">No goals ${statusFilter==='all' ? 'set yet' : 'in this view'}. <b>Set one above</b> to start tracking.</div>`}
    </div>
  `;

  if(visible.length){
    const list = root.querySelector('#goal-list');
    visible.forEach(g => {
      const pct = g.targetAmount > 0 ? Math.max(0, Math.min(100, (g._progress / g.targetAmount) * 100)) : 0;
      const fillClass = g._status === 'achieved' ? 'achieved' : (g._progress < 0 ? 'behind' : '');
      const tl = timeLeftLabel(g, g._status);
      const urgent = g._status === 'active' && daysLeft(g) <= 7;
      const isContributing = contributingId === g.id;

      const card = document.createElement('div');
      card.className = 'goal-card';
      card.innerHTML = `
        <div class="goal-head">
          <div>
            <div class="goal-name">${g.name}</div>
            <div class="goal-range">${fmtDate(g.startDate)} → ${fmtDate(g.endDate)}</div>
          </div>
          <span class="goal-status ${g._status}">${g._status}</span>
        </div>
        <div class="goal-progress-track">
          <div class="goal-progress-fill ${fillClass}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="goal-stats">
          <div class="amounts"><b>${fmtMoney(g._progress)}</b> of ${fmtMoney(g.targetAmount)} (${pct.toFixed(0)}%)</div>
          <div class="time-left ${urgent ? 'urgent' : ''}">${tl}</div>
        </div>
        ${isContributing ? `
        <div class="contribute-row">
          <input type="number" step="0.01" min="0" class="contribute-amount" placeholder="Amount to add" />
          <button class="btn small" data-action="confirm-contribute" data-id="${g.id}">Add</button>
          <button class="btn ghost small" data-action="cancel-contribute">Cancel</button>
        </div>` : `
        <div class="goal-actions">
          <button class="btn ghost small" data-action="start-contribute" data-id="${g.id}">+ Add Money</button>
          <span style="flex:1"></span>
          <button class="icon-btn" data-action="edit" data-id="${g.id}" title="Edit">✎</button>
          <button class="icon-btn" data-action="delete" data-id="${g.id}" title="Delete">✕</button>
        </div>`}
      `;
      list.appendChild(card);
    });

    list.addEventListener('click', (e) => {
      const startBtn = e.target.closest('[data-action="start-contribute"]');
      if(startBtn){
        contributingId = startBtn.dataset.id;
        editingId = null;
        renderGoals();
        const input = root.querySelector('.contribute-amount');
        if(input) input.focus();
        return;
      }
      const cancelContribBtn = e.target.closest('[data-action="cancel-contribute"]');
      if(cancelContribBtn){
        contributingId = null;
        renderGoals();
        return;
      }
      const confirmBtn = e.target.closest('[data-action="confirm-contribute"]');
      if(confirmBtn){
        const goal = all.find(x => x.id === confirmBtn.dataset.id);
        const input = confirmBtn.closest('.contribute-row').querySelector('.contribute-amount');
        const amount = parseFloat(input.value);
        if(!amount || amount <= 0){
          toast('Enter an amount greater than 0');
          input.focus();
          return;
        }
        addContribution(goal, amount);
        return;
      }
      const editBtn = e.target.closest('[data-action="edit"]');
      if(editBtn){
        editingId = editBtn.dataset.id;
        contributingId = null;
        renderGoals();
        return;
      }
      const delBtn = e.target.closest('[data-action="delete"]');
      if(delBtn){
        if(editingId === delBtn.dataset.id) editingId = null;
        if(contributingId === delBtn.dataset.id) contributingId = null;
        Store.remove(delBtn.dataset.id);
        toast('Goal removed');
      }
    });
  }

  root.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      statusFilter = btn.dataset.val;
      renderGoals();
    });
  });

  const cancelBtn = root.querySelector('#cancel-edit-btn');
  if(cancelBtn){
    cancelBtn.addEventListener('click', () => {
      editingId = null;
      renderGoals();
    });
  }

  function handleSaveGoal(){
    const nameEl = root.querySelector('#f-name');
    const targetEl = root.querySelector('#f-target');
    const startEl = root.querySelector('#f-start');
    const endEl = root.querySelector('#f-end');

    const name = (nameEl.value || '').trim();
    if(!name){ toast('Give the goal a name'); nameEl.focus(); return; }

    const targetAmount = parseFloat(targetEl.value);
    if(!targetAmount || targetAmount <= 0){ toast('Enter a target amount greater than 0'); targetEl.focus(); return; }

    if(!startEl.value){ toast('Pick a start date'); startEl.focus(); return; }
    if(!endEl.value){ toast('Pick a target date'); endEl.focus(); return; }
    if(endEl.value < startEl.value){ toast('Target date needs to be after the start date'); endEl.focus(); return; }

    const payload = {
      type: 'goal',
      name,
      targetAmount,
      startDate: startEl.value,
      endDate: endEl.value
    };

    if(editingGoal){
      const id = editingGoal.id;
      editingId = null;
      Store.update(id, payload);
      toast('Goal updated');
    } else {
      Store.add(payload);
      toast('Goal set');
    }
  }

  root.querySelector('#save-goal-btn').addEventListener('click', handleSaveGoal);
  root.querySelectorAll('#goal-form input').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') handleSaveGoal();
    });
  });
}

function addContribution(goal, amount){
  const prevProgress = progressAmount(goal);

  // The contribution record carries its own snapshot of the goal's name, so
  // History stays meaningful even if the goal itself is edited or deleted later.
  Store.add({
    type: 'contribution',
    goalId: goal.id,
    goalName: goal.name,
    amount: amount,
    date: todayISO()
  });

  const newProgress = prevProgress + amount;
  const justAchieved = goal.targetAmount > 0 && prevProgress < goal.targetAmount && newProgress >= goal.targetAmount;
  if(justAchieved){
    // Not a normal add/update/remove on the goal itself, so it needs its own
    // explicit History entry — this is the one thing addContribution logs directly.
    History.append('achieved', Object.assign({}, goal));
  }

  toast(justAchieved
    ? `${fmtMoney(amount)} added — "${goal.name}" reached! 🎉`
    : `${fmtMoney(amount)} added toward "${goal.name}"`);

  contributingId = null;
  renderGoals();
  renderBalance();
}

Bus.on('store:changed', renderGoals);

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
  document.getElementById('nav-history').href = 'history.html' + qs;

  await Store.loadForAccount(username);
  await History.loadForAccount(username);
  renderGoals();
}
boot();
