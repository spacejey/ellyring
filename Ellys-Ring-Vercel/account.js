'use strict';
let currentUser = null, authMode = 'login', categoryDraft = [], saveTimer = null, pendingSave = null, saveChain = Promise.resolve(), switchingAccount = false, saveVersion = 0;
const welcome = document.getElementById('welcome'), planner = document.getElementById('app'), authForm = document.getElementById('auth-form'), categoryDialog = document.getElementById('categories-dialog');
const statusNode = document.getElementById('save-status');
const SESSION_KEY = 'elly.supabase.session';
function storageRead(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function setStatus(text, error = false) { statusNode.textContent = text; statusNode.classList.toggle('error', error); }
function supabaseConfig() {
  const config = window.ELLY_SUPABASE_CONFIG || {};
  return { url:String(config.url || '').replace(/\/+$/, ''), key:String(config.publishableKey || '') };
}
function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function writeSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); return session; }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function accountUser(user) {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  return { id:user.id, email:user.email || '', name:metadata.name || metadata.full_name || user.email?.split('@')[0] || 'Guest' };
}
function saveAuthResult(result) {
  if (!result?.access_token || !result?.refresh_token) return null;
  const expiresAt = Number(result.expires_at) || Math.floor(Date.now() / 1000) + (Number(result.expires_in) || 3600);
  return writeSession({ access_token:result.access_token, refresh_token:result.refresh_token, expires_at:expiresAt, user:accountUser(result.user) });
}
async function supabaseRequest(path, options = {}) {
  const {url, key} = supabaseConfig();
  if (!url || !key) throw new Error('Supabase is not connected yet. Add its URL and publishable key in Vercel.');
  const headers = { apikey:key, Accept:'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers.Authorization = 'Bearer ' + options.accessToken;
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(url + path, { method:options.method || 'GET', headers, cache:'no-store', ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)}), keepalive:!!options.keepalive });
  const raw = await response.text(); let result = null;
  if (raw) { try { result = JSON.parse(raw); } catch { result = { message:raw }; } }
  if (!response.ok) {
    const error = new Error(result?.msg || result?.message || result?.error_description || result?.error || 'Please try again.');
    error.status = response.status; throw error;
  }
  return result;
}
async function refreshSession(session) {
  try {
    const result = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{refresh_token:session.refresh_token} });
    return saveAuthResult(result);
  } catch (error) {
    if (error.status === 400 || error.status === 401) clearSession();
    throw error;
  }
}
async function activeSession(validateUser = false) {
  let session = readSession();
  if (!session?.access_token || !session?.refresh_token) return null;
  if (!session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    session = await refreshSession(session);
    if (!session) return null;
  }
  if (validateUser) {
    try { session.user = accountUser(await supabaseRequest('/auth/v1/user', {accessToken:session.access_token})); }
    catch (error) {
      if (error.status !== 401) throw error;
      session = await refreshSession(session);
      if (!session) return null;
      session.user = accountUser(await supabaseRequest('/auth/v1/user', {accessToken:session.access_token}));
    }
    writeSession(session);
  }
  return session;
}
async function api(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  if (url === '/api/me') {
    const session = await activeSession(true);
    return { user:session?.user || null };
  }
  if (url === '/api/signup') {
    const result = await accountRequest({action:'signup', username:body.username, name:body.name, email:body.email, password:body.password});
    const session = saveAuthResult(result);
    return { user:session?.user || accountUser(result?.user), confirmationRequired:!session };
  }
  if (url === '/api/login') {
    const result = await accountRequest({action:'login', username:body.username, password:body.password});
    const session = saveAuthResult(result);
    if (!session?.user) throw new Error('The sign-in response did not include a user session.');
    return { user:session.user };
  }
  if (url === '/api/logout') {
    const session = readSession();
    try { if (session?.access_token) await supabaseRequest('/auth/v1/logout', {method:'POST', accessToken:session.access_token}); }
    catch { /* Clear the local session even if the remote token has already expired. */ }
    clearSession(); return {};
  }
  if (url === '/api/data') {
    const session = await activeSession();
    if (!session?.user?.id) throw new Error('Your session expired. Please log in again.');
    const userFilter = encodeURIComponent(session.user.id);
    if (method === 'GET') {
      const rows = await supabaseRequest(`/rest/v1/planner_data?select=data&user_id=eq.${userFilter}&limit=1`, {accessToken:session.access_token});
      return { data:rows?.[0]?.data && typeof rows[0].data === 'object' ? rows[0].data : {} };
    }
    if (method === 'PUT') {
      await supabaseRequest('/rest/v1/planner_data?on_conflict=user_id', {
        method:'POST', accessToken:session.access_token, prefer:'resolution=merge-duplicates,return=minimal', keepalive:options.keepalive,
        body:{user_id:session.user.id, data:body.data || {}}
      });
      return {};
    }
  }
  throw new Error('Unsupported account request.');
}
async function accountRequest(body) {
  const {url, key} = supabaseConfig();
  if (!url || !key) throw new Error('Supabase is not connected yet. Add its URL and publishable key in Vercel.');
  const response = await fetch('/api/account', {
    method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  const raw = await response.text(); let result = null;
  if (raw) { try { result = JSON.parse(raw); } catch { result = { message:raw }; } }
  if (!response.ok) {
    const error = new Error(result?.error || result?.message || 'Please try again.');
    error.status = response.status; throw error;
  }
  return result;
}
function updateAccountMenu() {
  document.getElementById('account-name').textContent = currentUser ? currentUser.name : 'Guest';
  document.getElementById('account-action').textContent = currentUser ? 'Log out' : 'Log in';
}
function showPlanner() { welcome.hidden = true; planner.hidden = false; updateAccountMenu(); render(); }
function showLogin() { authMode = 'login'; updateAuthForm(); planner.hidden = true; welcome.hidden = false; }
function updateAuthForm() {
  const signup = authMode === 'signup';
  document.getElementById('login-tab').setAttribute('aria-selected', String(!signup));
  document.getElementById('signup-tab').setAttribute('aria-selected', String(signup));
  document.getElementById('email-field').hidden = !signup; authForm.elements.email.required = signup;
  document.getElementById('name-field').hidden = !signup; authForm.elements.name.required = signup;
  authForm.elements.username.autocomplete = 'username';
  authForm.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
  document.getElementById('auth-submit').textContent = signup ? 'Create account' : 'Log in';
  document.getElementById('auth-error').textContent = '';
}
function freshCategories() { return [{ id:'0', name:'Home', color:'#e6d9fb' }, { id:'1', name:'Work', color:'#dbe9fd' }, { id:'2', name:'Personal', color:'#dcf3e2' }, { id:'3', name:'Health', color:'#fde3d3' }, { id:'4', name:'Learning', color:'#fbf0a6' }]; }
async function enterAccount(user) {
  // Fetch before switching: a failed request must not save guest data to an account.
  const { data } = await api('/api/data');
  currentUser = user; window.accountStorageKey = 'alley.user.' + user.id;
  S = data; if (!S.settings?.categories) set('settings.categories', freshCategories());
  V = { sel:TODAY, R:'m', qo:0, col:0, dr:{t:'',s:'',e:''}, editRef:null, range:null, todoPage:0 };
  connectLegacyEvents(); showPlanner(); setStatus('Saved');
  save();
}
window.queuePlannerSave = function () {
  if (!currentUser) { setStatus(''); return; }
  pendingSave = { userId: currentUser.id, data: JSON.stringify(S), version:++saveVersion }; setStatus('Saving…'); clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushPlannerSave().catch(() => {}), 350);
};
async function flushPlannerSave() {
  clearTimeout(saveTimer);
  const item = pendingSave; pendingSave = null;
  if (item) {
    saveChain = saveChain.catch(() => {}).then(async () => {
      if (currentUser?.id !== item.userId) return;
      try { await api('/api/data', { method:'PUT', body:'{"data":' + item.data + '}' }); if (!pendingSave && item.version === saveVersion) setStatus('Saved'); }
      catch (e) { if (!pendingSave && item.version === saveVersion) pendingSave = item; if (item.version === saveVersion) setStatus('Save failed · Retry', true); throw e; }
    });
  }
  await saveChain;
}
statusNode.addEventListener('click', () => { if (statusNode.classList.contains('error')) flushPlannerSave().catch(() => {}); });
document.getElementById('login-tab').addEventListener('click', () => { authMode = 'login'; updateAuthForm(); });
document.getElementById('signup-tab').addEventListener('click', () => { authMode = 'signup'; updateAuthForm(); });
authForm.addEventListener('submit', async e => {
  e.preventDefault(); const submit = document.getElementById('auth-submit'); submit.disabled = true; document.getElementById('auth-error').textContent = '';
  try {
    const result = await api(authMode === 'signup' ? '/api/signup' : '/api/login', { method:'POST', body:JSON.stringify({ username:authForm.elements.username.value.trim(), name:authForm.elements.name.value.trim(), email:authForm.elements.email.value.trim(), password:authForm.elements.password.value }) });
    if (result.confirmationRequired) {
      authForm.reset(); authMode = 'login'; updateAuthForm();
      document.getElementById('auth-error').textContent = 'Check your email to confirm your account, then log in.';
      return;
    }
    await enterAccount(result.user); authForm.reset();
  } catch (error) { document.getElementById('auth-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
document.getElementById('account-action').addEventListener('click', async () => {
  if (!currentUser) { showLogin(); return; }
  if (switchingAccount) return; switchingAccount = true;
  const button = document.getElementById('account-action'); button.disabled = true;
  try { await flushPlannerSave(); await api('/api/logout', { method:'POST', body:'{}' }); currentUser = null; window.accountStorageKey = 'alley'; S = storageRead('alley'); showLogin(); authForm.reset(); }
  catch (error) { setStatus(error.message, true); }
  finally { switchingAccount = false; button.disabled = false; updateAccountMenu(); }
});
window.addEventListener('pagehide', () => {
  if (pendingSave && currentUser?.id === pendingSave.userId) api('/api/data', { method:'PUT', body:'{"data":'+pendingSave.data+'}', keepalive:true }).catch(() => {});
});

function readCategoryDraft() {
  for (const row of document.querySelectorAll('.category-editor-row')) {
    const cat = categoryDraft.find(c => c.id === row.dataset.id); if (cat) { cat.name = row.querySelector('input[type=text]').value; cat.color = row.querySelector('input[type=color]').value; }
  }
}
function drawCategoryEditor() {
  document.getElementById('category-editor').innerHTML = categoryDraft.map((cat,i) => `<div class="category-editor-row" data-id="${esc(cat.id)}"><input type="color" value="${cat.color}" aria-label="Color for category ${i+1}"><input type="text" value="${esc(cat.name)}" placeholder="Category name" aria-label="Category ${i+1} name" required maxlength="40"><button type="button" data-remove-category="${esc(cat.id)}" aria-label="Remove category ${i+1}">Remove</button></div>`).join('');
  document.getElementById('category-add').disabled = categoryDraft.length >= 20;
}
document.getElementById('category-settings').addEventListener('click', () => {
  categoryDraft = categories().map(c => ({...c})); document.getElementById('categories-error').textContent = ''; drawCategoryEditor(); categoryDialog.showModal();
});
for (const id of ['categories-close','categories-cancel']) document.getElementById(id).addEventListener('click', () => categoryDialog.close());
document.getElementById('category-add').addEventListener('click', () => {
  readCategoryDraft(); if (categoryDraft.length >= 20) return;
  categoryDraft.push({ id:crypto.randomUUID(), name:'', color:'#ffd1e1' }); drawCategoryEditor(); document.querySelector('.category-editor-row:last-child input[type=text]').focus();
});
document.getElementById('category-editor').addEventListener('click', e => {
  const button = e.target.closest('[data-remove-category]'); if (!button) return;
  readCategoryDraft(); categoryDraft = categoryDraft.filter(c => c.id !== button.dataset.removeCategory); drawCategoryEditor();
});
document.getElementById('categories-form').addEventListener('submit', e => {
  e.preventDefault(); readCategoryDraft(); const next = categoryDraft.map(c => ({...c, name:c.name.trim()}));
  if (next.some(c => !c.name || c.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(c.color))) { document.getElementById('categories-error').textContent = 'Enter a name and valid color for each category.'; return; }
  if (new Set(next.map(c => c.name.toLowerCase())).size !== next.length) { document.getElementById('categories-error').textContent = 'Give each category a different name.'; return; }
  const ids = new Set(next.map(c => String(c.id)));
  for (const list of Object.values(get('todos') || {})) for (const task of list) if (task.c != null && !ids.has(String(task.c))) task.c = '';
  for (const week of Object.values(get('wk') || {})) for (const task of week.items || []) if (task.c != null && !ids.has(String(task.c))) task.c = '';
  set('settings.categories', next); save(); render(); categoryDialog.close();
});

(async function bootstrapAccount() {
  const submit = document.getElementById('auth-submit'); submit.disabled = true;
  try { const {user} = await api('/api/me'); if (user) await enterAccount(user); else showLogin(); }
  catch { showLogin(); }
  finally { submit.disabled = false; }
})();
