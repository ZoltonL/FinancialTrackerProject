"use strict";

/* =========================================================
   MENU PAGE LOGIC
   Same session pattern as home.js: read the signed-in
   username from the URL, verify it against Auth, then load
   that account's data via Store just to show quick preview
   figures on each option card. Navigating to Income or
   Expenses carries the ?user= along so those pages pick up
   the same session home.js already expects.
   ========================================================= */

function currentUsernameFromUrl(){
  const params = new URLSearchParams(window.location.search);
  return (params.get('user') || '').trim().toLowerCase();
}

// Same monthly-equivalent conversion expenses.js uses, duplicated here
// (rather than editing shared.js) just to preview a total on the card.
function monthlyEquivalent(tx){
  const amt = Number(tx.amount) || 0;
  if(tx.frequency === 'weekly') return amt * 52 / 12;
  if(tx.frequency === 'yearly') return amt / 12;
  return amt; // monthly, or anything unspecified
}

async function logout(){
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn.disabled = true;
  logoutBtn.textContent = 'Saving…';
  await Store.flush();
  Store.unload();
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
  document.getElementById('link-income').href = 'home.html' + qs;
  document.getElementById('link-expenses').href = 'expenses.html' + qs;
  document.getElementById('nav-income').href = 'home.html' + qs;
  document.getElementById('nav-expenses').href = 'expenses.html' + qs;

  await Store.loadForAccount(username);

  const income = Store.byType('income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expenses = Store.byType('expense').reduce((s, t) => s + monthlyEquivalent(t), 0);

  document.getElementById('income-figure').textContent =
    fmtMoney(income) + ' total';
  document.getElementById('expenses-figure').textContent =
    fmtMoney(expenses) + ' / mo';
}
boot();
