"use strict";

/* =========================================================
   LOGIN PAGE LOGIC
   Uses Auth from shared.js to create/verify accounts, then
   hands off to home.html by putting the signed-in username
   in the URL. home.js reads that on load and pulls that
   account's data from Store — so login.html never touches
   the ledger itself, it only proves who's signing in.
   ========================================================= */

let loginMode = 'signin'; // 'signin' | 'create'

function showLoginError(msg){
  document.getElementById('login-error').textContent = msg;
}

function setLoginMode(mode){
  loginMode = mode;
  document.getElementById('tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('tab-create').classList.toggle('active', mode === 'create');
  document.getElementById('login-submit').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('login-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  showLoginError('');
}

function goToHome(username){
  window.location.href = 'menu.html?user=' + encodeURIComponent(username);
}

function handleLoginSubmit(){
  try{
    const usernameEl = document.getElementById('login-username');
    const passwordEl = document.getElementById('login-password');
    const username = usernameEl.value.trim().toLowerCase().replace(/\s+/g, '_');
    const password = passwordEl.value;

    if(!username){ showLoginError('Enter a username'); usernameEl.focus(); return; }
    if(!password){ showLoginError('Enter a password'); passwordEl.focus(); return; }

    if(loginMode === 'create'){
      if(Auth.exists(username)){
        showLoginError('That username is already taken');
        return;
      }
      Auth.createAccount(username, password);
      goToHome(username);
    } else {
      if(!Auth.exists(username)){
        showLoginError('No account with that username yet — try Create Account');
        return;
      }
      if(!Auth.verify(username, password)){
        showLoginError('Wrong password');
        passwordEl.focus();
        return;
      }
      goToHome(username);
    }
  }catch(err){
    console.error('Login failed:', err);
    showLoginError('Something went wrong: ' + err.message);
  }
}

function wireLoginScreen(){
  document.getElementById('tab-signin').addEventListener('click', () => setLoginMode('signin'));
  document.getElementById('tab-create').addEventListener('click', () => setLoginMode('create'));
  document.getElementById('login-submit').addEventListener('click', handleLoginSubmit);
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if(e.key === 'Enter') handleLoginSubmit();
    });
  });
}

async function boot(){
  wireLoginScreen();
  await Auth.loadAccounts();
  document.getElementById('login-username').focus();

  const storageOk = await Persistence.isWorking();
  if(!storageOk){
    document.getElementById('storage-warning').style.display = 'block';
  }
}
boot();
