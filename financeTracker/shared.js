"use strict";

/* =========================================================
   PERSISTENCE: uses Claude's window.storage when it's
   available (inside a Claude artifact preview). Outside
   Claude — e.g. opening these files locally in a browser, or
   hosting them yourself — window.storage doesn't exist, so
   this falls back to the browser's own localStorage instead.
   Both Store and Auth talk to THIS object, never to
   window.storage directly, so the rest of the app doesn't
   need to care which backend is actually saving the data.
   ========================================================= */
const Persistence = (() => {
  const hasCloudStorage = typeof window.storage !== 'undefined'
    && typeof window.storage.get === 'function'
    && typeof window.storage.set === 'function';

  let backend;
  if(hasCloudStorage){
    backend = window.storage;
  } else {
    console.warn('[Ledger] window.storage is not available here, so switching to the browser\'s localStorage instead. Data will persist on this device/browser but not inside Claude.');
    backend = {
      async get(key){
        let raw;
        try{
          raw = localStorage.getItem(key);
        }catch(e){
          throw e; // e.g. localStorage blocked for this origin — let callers' try/catch handle it
        }
        if(raw === null) return null;
        return { key, value: raw };
      },
      async set(key, value){
        localStorage.setItem(key, value);
        return { key, value };
      }
    };
  }

  // Actually try a real write+read once, up front, instead of assuming the
  // backend works just because it exists. Both window.storage AND
  // localStorage can silently refuse to save (e.g. localStorage is blocked
  // entirely on some browsers for file:// pages), and every failure so far
  // has been swallowed by a try/catch with nothing visible to show for it.
  const TEST_KEY = 'ledger:__persistence_selftest__';
  const ready = (async () => {
    try{
      await backend.set(TEST_KEY, '1');
      const res = await backend.get(TEST_KEY);
      return !!(res && res.value === '1');
    }catch(e){
      console.error('[Ledger] Persistence self-test failed:', e);
      return false;
    }
  })();

  return {
    get: (key) => backend.get(key),
    set: (key, value) => backend.set(key, value),
    // Resolves true/false once we actually know whether saving works.
    isWorking: () => ready
  };
})();

/* =========================================================
   SHARED CORE — loaded by both login.html and home.html.
   This is the extensibility backbone: a tiny event bus, an
   account-scoped transaction store, and a basic account
   registry. Both pages talk to the SAME Store/Auth objects,
   so a change made in the app is exactly what login.html's
   Auth check and home.html's Store see.
   ========================================================= */

const Bus = (() => {
  const listeners = {};
  return {
    on(evt, fn){ (listeners[evt] ||= []).push(fn); return () => Bus.off(evt, fn); },
    off(evt, fn){ if(listeners[evt]) listeners[evt] = listeners[evt].filter(f => f!==fn); },
    emit(evt, payload){ (listeners[evt]||[]).forEach(fn => fn(payload)); }
  };
})();

const Store = (() => {
  // Each account gets its own storage key, so balances/ledgers never bleed
  // across accounts. storageKey is null until an account logs in.
  let storageKey = null;
  let transactions = []; // {id, type, amount, category, source, date, note}
  let loaded = false;

  // Writes are queued and run strictly one-at-a-time. Without this, two
  // rapid changes (e.g. add an entry, then immediately log out) could
  // resolve out of order and let an older snapshot overwrite a newer one,
  // silently dropping the most recent change from storage.
  let writeChain = Promise.resolve();
  // Bumped on every loadForAccount call so a slow/out-of-order read from a
  // previous account can never clobber the account that's active now.
  let loadToken = 0;

  function keyFor(username){ return 'ledger:data:' + username; }

  async function loadForAccount(username){
    // Make sure any writes still in flight for the PREVIOUS account are
    // fully flushed before we read the NEXT account's data, so a quick
    // "change balance, then log out, then log back in" always sees the change.
    await writeChain;

    const myToken = ++loadToken;
    storageKey = keyFor(username);
    transactions = [];
    loaded = false;
    try{
      const res = await Persistence.get(storageKey);
      if(myToken !== loadToken) return; // a newer load started; discard this stale result
      transactions = res && res.value ? JSON.parse(res.value) : [];
    }catch(e){
      if(myToken !== loadToken) return;
      transactions = [];
    }
    if(myToken !== loadToken) return;
    loaded = true;
    Bus.emit('store:loaded', transactions);
  }

  function unload(){
    storageKey = null;
    transactions = [];
    loaded = false;
  }

  function persist(){
    // Chain onto the previous write instead of firing in parallel, and
    // snapshot `transactions` only once this write actually runs, so the
    // value saved is always whatever is current at that point.
    writeChain = writeChain.then(async () => {
      if(!storageKey) return;
      const key = storageKey;
      const snapshot = JSON.stringify(transactions);
      try{
        await Persistence.set(key, snapshot);
      }catch(e){
        console.error('Could not save to storage', e);
        Bus.emit('store:save-error', e);
      }
    });
    return writeChain;
  }

  function uid(){ return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

  return {
    isLoaded: () => loaded,
    flush: () => writeChain,
    loadForAccount,
    unload,
    all: () => transactions.slice(),
    byType: (type) => transactions.filter(t => t.type === type),
    add(tx){
      const record = Object.assign({ id: uid() }, tx);
      transactions.push(record);
      persist();
      Bus.emit('store:changed', { action:'add', record });
      return record;
    },
    update(id, patch){
      const idx = transactions.findIndex(t => t.id === id);
      if(idx === -1) return null;
      transactions[idx] = Object.assign({}, transactions[idx], patch);
      persist();
      Bus.emit('store:changed', { action:'update', record: transactions[idx] });
      return transactions[idx];
    },
    remove(id){
      const removed = transactions.find(t => t.id === id) || null;
      transactions = transactions.filter(t => t.id !== id);
      persist();
      Bus.emit('store:changed', { action:'remove', id, record: removed });
    }
  };
})();

/* =========================================================
   HISTORY: an append-only audit log of every income/expense
   entered, altered, or deleted. This is intentionally NOT
   editable or deletable through the app — entries are never
   mutated once written, only ever appended.

   It hooks into Store's existing 'store:changed' event, so
   ANY current or future code path that goes through
   Store.add/update/remove is logged automatically — nobody
   has to remember to call History themselves.
   ========================================================= */
const History = (() => {
  let historyKey = null;
  let entries = [];
  let loaded = false;
  let writeChain = Promise.resolve();
  let loadToken = 0;

  function keyFor(username){ return 'ledger:history:' + username; }

  async function loadForAccount(username){
    await writeChain;
    const myToken = ++loadToken;
    historyKey = keyFor(username);
    entries = [];
    loaded = false;
    try{
      const res = await Persistence.get(historyKey);
      if(myToken !== loadToken) return;
      entries = res && res.value ? JSON.parse(res.value) : [];
    }catch(e){
      if(myToken !== loadToken) return;
      entries = [];
    }
    if(myToken !== loadToken) return;
    loaded = true;
    Bus.emit('history:loaded', entries);
  }

  function unload(){
    historyKey = null;
    entries = [];
    loaded = false;
  }

  function persist(){
    writeChain = writeChain.then(async () => {
      if(!historyKey) return;
      const key = historyKey;
      const snapshot = JSON.stringify(entries);
      try{
        await Persistence.set(key, snapshot);
      }catch(e){
        console.error('Could not save history', e);
      }
    });
    return writeChain;
  }

  function hid(){ return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

  function append(action, record){
    if(!historyKey || !record) return; // no account loaded, or nothing to log
    entries.push({
      id: hid(),
      at: new Date().toISOString(),
      action, // 'add' | 'update' | 'remove'
      txType: record.type, // 'income' | 'expense'
      record: Object.assign({}, record) // frozen snapshot at the moment of the action
    });
    persist();
    Bus.emit('history:changed');
  }

  return {
    isLoaded: () => loaded,
    flush: () => writeChain,
    loadForAccount,
    unload,
    all: () => entries.slice(), // a copy — nothing returned here should ever be mutated in place
    append
  };
})();

// Auto-log every Store change, in the order they actually happened.
Bus.on('store:changed', (payload) => {
  if(!payload) return;
  History.append(payload.action, payload.record);
});

/* =========================================================
   AUTH: simple account registry, separate from Store.
   NOTE: this gives each person their own data partition, but
   it is NOT real security — passwords are only lightly
   obscured, not cryptographically hashed. Good enough to keep
   accounts' ledgers apart on one shared device, not a login
   system for sensitive data.
   ========================================================= */
const Auth = (() => {
  const ACCOUNTS_KEY = 'ledger:accounts';
  let accounts = {}; // { username: obscuredPassword }
  let current = null;

  function obscure(pw){
    let h = 0;
    for(let i = 0; i < pw.length; i++){ h = (h * 31 + pw.charCodeAt(i)) | 0; }
    return String(h);
  }

  async function loadAccounts(){
    try{
      const res = await Persistence.get(ACCOUNTS_KEY);
      accounts = res && res.value ? JSON.parse(res.value) : {};
    }catch(e){
      accounts = {};
    }
  }

  async function persistAccounts(){
    try{
      await Persistence.set(ACCOUNTS_KEY, JSON.stringify(accounts));
    }catch(e){
      console.error('Could not save accounts', e);
    }
  }

  return {
    loadAccounts,
    exists(username){ return Object.prototype.hasOwnProperty.call(accounts, username); },
    createAccount(username, password){
      if(this.exists(username)) return false;
      accounts[username] = obscure(password);
      persistAccounts();
      return true;
    },
    verify(username, password){
      return this.exists(username) && accounts[username] === obscure(password);
    },
    currentUser: () => current,
    setCurrentUser(username){ current = username; }
  };
})();

/* ---------- small formatting helpers, used on both pages ---------- */
// signed amount helper: income is positive, future expense-type txns
// can be negative so the running balance stays generalized across modules
function signedAmount(tx){
  const n = Number(tx.amount) || 0;
  return tx.type === 'expense' ? -Math.abs(n) : Math.abs(n);
}

function fmtMoney(n){
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month:'short', day:'2-digit', year:'numeric' });
}

// shared toast helper — both pages include a <div class="toast" id="toast"></div>
function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
