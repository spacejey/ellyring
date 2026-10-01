'use strict';
let currentUser = null, authMode = 'login', categoryDraft = [], saveTimer = null, pendingSave = null, saveChain = Promise.resolve(), switchingAccount = false, saveVersion = 0;
const welcome = document.getElementById('welcome'), planner = document.getElementById('app'), authForm = document.getElementById('auth-form'), categoryDialog = document.getElementById('categories-dialog');
const statusNode = document.getElementById('save-status');
function storageRead(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function setStatus(text, error = false) { statusNode.textContent = text; statusNode.classList.toggle('error', error); }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let result; try { result = await response.json(); } catch { throw new Error('The account server is unavailable. Please try again.'); }
  if (!response.ok) throw new Error(result.error || 'Please try again.');
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
  document.getElementById('name-field').hidden = !signup; authForm.elements.name.required = signup;
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
    const result = await api(authMode === 'signup' ? '/api/signup' : '/api/login', { method:'POST', body:JSON.stringify({ name:authForm.elements.name.value.trim(), email:authForm.elements.email.value.trim(), password:authForm.elements.password.value }) });
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
  if (pendingSave && currentUser?.id === pendingSave.userId) fetch('/api/data', { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{"data":'+pendingSave.data+'}', keepalive:true }).catch(() => {});
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
