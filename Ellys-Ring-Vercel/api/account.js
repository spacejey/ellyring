'use strict';

function config() {
  return {
    url:(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY || '',
    serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  };
}

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw Object.assign(new Error('Use 3–24 letters, numbers, or underscores for your ID.'), {status:400});
  return username;
}

function requestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function supabaseRequest(path, options = {}) {
  const settings = config();
  const key = options.admin ? settings.serviceRoleKey : settings.publishableKey;
  const headers = {apikey:key, Accept:'application/json'};
  if (options.admin) headers.Authorization = 'Bearer ' + key;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(settings.url + path, {
    method:options.method || 'GET', headers, cache:'no-store',
    ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)})
  });
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = {message:raw}; } }
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || data?.error || 'Supabase request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function deleteAuthUser(userId) {
  try { await supabaseRequest('/auth/v1/admin/users/' + encodeURIComponent(userId), {method:'DELETE', admin:true}); }
  catch { /* The original failure is more useful; a later cleanup can remove an orphaned auth user. */ }
}

async function signUp(body) {
  const username = normalizeUsername(body.username);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!name || name.length > 60) throw Object.assign(new Error('Enter a name of up to 60 characters.'), {status:400});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Object.assign(new Error('Enter a valid email address.'), {status:400});
  if (password.length < 10 || password.length > 128) throw Object.assign(new Error('Use a password with 10–128 characters.'), {status:400});

  const encodedUsername = encodeURIComponent(username);
  const existing = await supabaseRequest(`/rest/v1/username_accounts?select=user_id&username=eq.${encodedUsername}&limit=1`, {admin:true});
  if (existing.length) throw Object.assign(new Error('That ID is already taken.'), {status:409});

  let authResult;
  try {
    authResult = await supabaseRequest('/auth/v1/signup', {
      method:'POST', body:{email, password, data:{name, username}}
    });
  } catch (error) {
    if (error.status === 429) throw Object.assign(new Error('Too many attempts. Please try again later.'), {status:429});
    throw Object.assign(new Error('Unable to create this account. Check the email and password, then try again.'), {status:400});
  }

  const user = authResult?.user;
  if (!user?.id || (Array.isArray(user.identities) && user.identities.length === 0)) {
    throw Object.assign(new Error('Unable to create this account. Check the email and password, then try again.'), {status:400});
  }

  try {
    await supabaseRequest('/rest/v1/username_accounts', {
      method:'POST', admin:true, prefer:'return=minimal', body:{username, user_id:user.id}
    });
  } catch (error) {
    await deleteAuthUser(user.id);
    if (error.status === 409) throw Object.assign(new Error('That ID is already taken.'), {status:409});
    throw error;
  }
  return authResult;
}

async function signIn(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!password || password.length > 128) throw Object.assign(new Error('ID or password is incorrect.'), {status:401});

  const rows = await supabaseRequest(`/rest/v1/username_accounts?select=user_id&username=eq.${encodeURIComponent(username)}&limit=1`, {admin:true});
  if (!rows.length) throw Object.assign(new Error('ID or password is incorrect.'), {status:401});

  const userId = rows[0].user_id;
  const adminUser = await supabaseRequest('/auth/v1/admin/users/' + encodeURIComponent(userId), {admin:true});
  const email = (adminUser?.user || adminUser)?.email;
  if (!email) throw Object.assign(new Error('ID or password is incorrect.'), {status:401});

  try {
    return await supabaseRequest('/auth/v1/token?grant_type=password', {
      method:'POST', body:{email, password}
    });
  } catch (error) {
    if (error.status === 429) throw Object.assign(new Error('Too many attempts. Please try again later.'), {status:429});
    throw Object.assign(new Error('ID or password is incorrect.'), {status:401});
  }
}

module.exports = async function accountHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error:'Method not allowed.'});
  }

  const settings = config();
  if (!settings.url || !settings.publishableKey || !settings.serviceRoleKey) {
    return res.status(503).json({error:'Account login is not configured yet. Add the Supabase project settings in Vercel.'});
  }

  try {
    const body = requestBody(req);
    const result = body.action === 'signup' ? await signUp(body) : body.action === 'login' ? await signIn(body) : null;
    if (!result) return res.status(400).json({error:'Unsupported account action.'});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({error:error.status ? error.message : 'Unable to complete the account request. Please try again.'});
  }
};
