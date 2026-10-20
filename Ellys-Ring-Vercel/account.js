'use strict';
let categoryDraft = [];
const categoryDialog = document.getElementById('categories-dialog');
const LEGACY_SESSION_KEY = 'elly.supabase.session';
window.accountStorageKey = 'alley';
function restorePlannerData() {
  try {
    let sourceKey = null;
    try {
      const session = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) || 'null');
      if (session?.user?.id) {
        const key = 'alley.user.' + session.user.id;
        if (localStorage.getItem(key) !== null) sourceKey = key;
      }
    } catch {}
    if (!sourceKey) {
      const accountKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('alley.user.')) accountKeys.push(key);
      }
      if (accountKeys.length === 1) sourceKey = accountKeys[0];
    }
    if (sourceKey) {
      const saved = JSON.parse(localStorage.getItem(sourceKey) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved) && Object.keys(saved).length) {
        const existing = JSON.parse(localStorage.getItem('alley') || 'null');
        if (existing && typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length && localStorage.getItem('alley.before-login-removal') === null) {
          localStorage.setItem('alley.before-login-removal', JSON.stringify(existing));
        }
        S = saved;
        localStorage.setItem('alley', JSON.stringify(S));
      }
    }
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {}
}
restorePlannerData();
connectLegacyEvents();
render();
document.getElementById('app').hidden = false;
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
