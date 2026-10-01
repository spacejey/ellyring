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
    fs.writeFileSync(target, html.replace('</head>', '<script>window.ELLY_STATIC_PREVIEW=true;</script></head>'));
  } else fs.copyFileSync(path.join(root, file), target);
}
console.log('Built Vercel guest preview in dist. Account data is not included.');
