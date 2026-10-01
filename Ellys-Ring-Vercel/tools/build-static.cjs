'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Only this generated directory is removed; never touch the local account store.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const files = ['index.html', 'account.js', 'manifest.webmanifest', 'fonts/Monda-VariableFont_wght.ttf', 'fonts/OFL.txt', 'assets/elly-pigeon-walk.webp', 'assets/elly-pigeon-poster.png', 'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png'];
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (file === 'index.html') {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    fs.writeFileSync(target, html);
  } else fs.copyFileSync(path.join(root, file), target);
}
const supabaseConfig = {
  url: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
  publishableKey: (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()
};
if (Boolean(supabaseConfig.url) !== Boolean(supabaseConfig.publishableKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or leave both empty.');
}
if (supabaseConfig.publishableKey && !supabaseConfig.publishableKey.startsWith('sb_publishable_')) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY must be a Supabase sb_publishable_ key. Never expose a secret or service_role key.');
}
fs.writeFileSync(path.join(output, 'supabase-config.js'), `window.ELLY_SUPABASE_CONFIG = Object.freeze(${JSON.stringify(supabaseConfig)});\n`);
console.log('Built the Vercel frontend and generated its public Supabase config.');
