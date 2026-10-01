const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

function createServer({ dataDir = path.join(__dirname, '.data'), secureCookies = process.env.COOKIE_SECURE === 'true', siteOrigin = process.env.SITE_ORIGIN } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const accountsFile = path.join(dataDir, 'accounts.json');
  const accounts = fs.existsSync(accountsFile) ? JSON.parse(fs.readFileSync(accountsFile, 'utf8')) : [];
  const sessions = new Map(), attempts = new Map();
  const ttl = 7 * 24 * 60 * 60 * 1000;
  const write = (file, value) => {
    const tmp = file + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const publicUser = u => ({ id: u.id, name: u.name, email: u.email });
  const reply = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
  const cookie = (res, value, age) => res.setHeader('Set-Cookie', `alley_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secureCookies ? '; Secure' : ''}`);
  const current = req => {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('alley_session='))?.slice(14);
    if (!token) return null;
    const key = hashToken(token), session = sessions.get(key);
    if (!session || session.expires <= Date.now()) { sessions.delete(key); return null; }
    return accounts.find(u => u.id === session.userId) || null;
  };
  const startSession = (res, user) => {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(hashToken(token), { userId: user.id, expires: Date.now() + ttl });
    cookie(res, token, ttl / 1000);
  };
  const limited = key => {
    const now = Date.now(), item = attempts.get(key);
    if (!item || item.until < now) { attempts.set(key, { count: 1, until: now + 15 * 60 * 1000 }); return false; }
    item.count++; return item.count > 10;
  };
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of sessions) if (item.expires < now) sessions.delete(key);
    for (const [key, item] of attempts) if (item.until < now) attempts.delete(key);
  }, 60000);
  cleanup.unref();
  const body = async req => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON content is required.'), { status: 415 });
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) throw Object.assign(new Error('Your data is too large to save.'), { status: 413 }); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { reply(res, 400, { error: 'Invalid URL.' }); return; }
    const api = url.pathname.startsWith('/api/');
    try {
      if (api) {
        const origin = siteOrigin || `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
        if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin) { reply(res, 403, { error: 'This request must come from this app.' }); return; }
        if (req.method === 'GET' && url.pathname === '/api/me') { const user = current(req); reply(res, 200, { user: user ? publicUser(user) : null }); return; }
        if (req.method === 'POST' && ['/api/signup', '/api/login'].includes(url.pathname)) {
          if (limited('ip:' + req.socket.remoteAddress)) { reply(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); return; }
          const input = await body(req), email = String(input.email || '').trim().toLowerCase(), password = input.password;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 10 || password.length > 128) { reply(res, 400, { error: 'Enter a valid email and a password of 10–128 characters.' }); return; }
          if (limited('email:' + email)) { reply(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); return; }
          let user = accounts.find(u => u.email === email);
          if (url.pathname === '/api/signup') {
            const name = String(input.name || '').trim();
            if (!name || name.length > 60) { reply(res, 400, { error: 'Enter a name of up to 60 characters.' }); return; }
            if (user) { reply(res, 409, { error: 'Unable to create this account. Try signing in.' }); return; }
            const salt = crypto.randomBytes(16).toString('hex'), hash = (await scrypt(password, salt, 64)).toString('hex');
            // Recheck after hashing, so concurrent requests cannot create duplicate emails.
            if (accounts.some(u => u.email === email)) { reply(res, 409, { error: 'Unable to create this account. Try signing in.' }); return; }
            user = { id: crypto.randomUUID(), email, name, salt, hash };
            accounts.push(user); try { write(accountsFile, accounts); } catch (e) { accounts.pop(); throw e; }
          } else {
            // Hash unknown users too, avoiding an obvious timing difference.
            const hash = await scrypt(password, user?.salt || 'missing-user-salt', 64);
            const expected = user ? Buffer.from(user.hash, 'hex') : Buffer.alloc(64);
            if (!crypto.timingSafeEqual(hash, expected) || !user) { reply(res, 401, { error: 'Email or password is incorrect.' }); return; }
          }
          startSession(res, user); reply(res, 200, { user: publicUser(user) }); return;
        }
        if (req.method === 'POST' && url.pathname === '/api/logout') {
          const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('alley_session='))?.slice(14);
          if (token) sessions.delete(hashToken(token)); cookie(res, '', 0); reply(res, 200, { ok: true }); return;
        }
        const user = current(req);
        if (!user) { reply(res, 401, { error: 'Please sign in again.' }); return; }
        const userFile = path.join(dataDir, user.id + '.json');
        if (url.pathname === '/api/data' && req.method === 'GET') { reply(res, 200, { data: fs.existsSync(userFile) ? JSON.parse(fs.readFileSync(userFile, 'utf8')) : {} }); return; }
        if (url.pathname === '/api/data' && req.method === 'PUT') {
          const input = await body(req);
          if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) { reply(res, 400, { error: 'Invalid planner data.' }); return; }
          const cats = input.data.settings?.categories;
          if (cats !== undefined && (!Array.isArray(cats) || cats.length > 20 || cats.some(c => !c || typeof c.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(c.color)) || new Set(cats.map(c => c.id)).size !== cats.length)) { reply(res, 400, { error: 'Invalid category settings.' }); return; }
          write(userFile, input.data); reply(res, 200, { ok: true }); return;
        }
        reply(res, 404, { error: 'Not found.' }); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      // Explicitly allow public assets only; never serve accounts, data, or server source.
      const files = { '/': 'index.html', '/index.html': 'index.html', '/account.js': 'account.js', '/fonts/Monda-VariableFont_wght.ttf': 'fonts/Monda-VariableFont_wght.ttf', '/fonts/OFL.txt': 'fonts/OFL.txt', '/assets/elly-pigeon.gif': 'assets/elly-pigeon.gif', '/assets/elly-pigeon-poster.png': 'assets/elly-pigeon-poster.png', '/assets/elly-pigeon-walk.webp': 'assets/elly-pigeon-walk.webp' };
      const filename = files[url.pathname];
      if (!filename) { res.writeHead(404); res.end('Not found'); return; }
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp' };
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') { res.end(); return; } fs.createReadStream(path.join(__dirname, filename)).pipe(res);
    } catch (e) { if (!res.headersSent) reply(res, e.status || 500, { error: e.status ? e.message : 'Unable to complete this request. Please try again.' }); else res.end(); }
  });
  server.on('close', () => clearInterval(cleanup));
  return server;
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 5173), process.env.HOST || '127.0.0.1', () => console.log(`Elly's Ring: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 5173}`));
module.exports = { createServer };

