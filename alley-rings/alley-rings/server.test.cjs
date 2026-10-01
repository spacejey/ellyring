const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('./server.cjs');

test('accounts authenticate and isolate planner data and categories', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alley-auth-test-'));
  const server = createServer({ dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, { method='GET', body, cookie, origin=base }={}) => {
    const res = await fetch(base+url, { method, headers:{ 'Content-Type':'application/json', Origin:origin, ...(cookie ? { Cookie:cookie } : {}) }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch {}
    return { status:res.status, cookie:res.headers.get('set-cookie'), json, text };
  };
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir, {recursive:true,force:true}); });
  assert.equal((await call('/api/data')).status,401);
  const alice = await call('/api/signup',{method:'POST',body:{name:'Alice',email:'alice@example.test',password:'A-strong-password'}});
  assert.equal(alice.status,200); assert(alice.cookie.includes('HttpOnly')); assert(alice.cookie.includes('SameSite=Lax')); assert(!('hash' in alice.json.user));
  const aliceCookie=alice.cookie.split(';')[0];
  assert.equal((await call('/api/me',{cookie:aliceCookie})).json.user.name,'Alice');
  const aliceData={mantra:'Only Alice',settings:{categories:[{id:'0',name:'Studio',color:'#ffd1e1'}]},todos:{'2026-10-01':[{t:'Private task',c:'0'}]}};
  assert.equal((await call('/api/data',{method:'PUT',cookie:aliceCookie,body:{data:aliceData}})).status,200);
  assert.equal((await call('/api/data',{method:'PUT',cookie:aliceCookie,body:{data:{}},origin:'https://untrusted.test'})).status,403);
  const bob=await call('/api/signup',{method:'POST',body:{name:'Bob',email:'bob@example.test',password:'Another-password'}}),bobCookie=bob.cookie.split(';')[0];
  assert.equal(bob.status,200); assert.deepEqual((await call('/api/data',{cookie:bobCookie})).json.data,{});
  assert.equal((await call('/api/data',{method:'PUT',cookie:bobCookie,body:{data:{settings:{categories:[{id:'1',name:'Research',color:'#87ceeb'}]}}}})).status,200);
  assert.deepEqual((await call('/api/data',{cookie:aliceCookie})).json.data,aliceData);
  assert.equal((await call('/api/login',{method:'POST',body:{email:'alice@example.test',password:'wrong-password'}})).status,401);
  assert.equal((await call('/api/signup',{method:'POST',body:{name:'Duplicate',email:'ALICE@example.test',password:'A-strong-password'}})).status,409);
  assert.equal((await call('/api/data',{method:'PUT',cookie:aliceCookie,body:{data:{settings:{categories:[{id:'0',name:'Bad',color:'red; background:url(x)'}]}}}})).status,400);
  assert.equal((await call('/.data/accounts.json')).status,404); assert.equal((await call('/server.cjs')).status,404); assert.equal((await call('/../.data/accounts.json')).status,404);
  const diskAccounts=JSON.parse(fs.readFileSync(path.join(dataDir,'accounts.json'),'utf8'));
  assert.equal(diskAccounts[0].password,undefined);assert.notEqual(diskAccounts[0].hash,'A-strong-password');assert.equal(diskAccounts[0].hash.length,128);
  assert.equal((await call('/api/logout',{method:'POST',cookie:aliceCookie,body:{}})).status,200);assert.equal((await call('/api/data',{cookie:aliceCookie})).status,401);
  const login=await call('/api/login',{method:'POST',body:{email:'alice@example.test',password:'A-strong-password'}});
  assert.equal(login.status,200);assert.deepEqual((await call('/api/data',{cookie:login.cookie.split(';')[0]})).json.data,aliceData);
  await new Promise(resolve=>server.close(resolve));
  const restarted=createServer({dataDir});await new Promise(resolve=>restarted.listen(0,'127.0.0.1',resolve));
  try {const res=await fetch(`http://127.0.0.1:${restarted.address().port}/api/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${restarted.address().port}`},body:JSON.stringify({email:'alice@example.test',password:'A-strong-password'})});assert.equal(res.status,200);} finally {await new Promise(resolve=>restarted.close(resolve));}
});
