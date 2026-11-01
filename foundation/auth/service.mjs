import { TokenRefreshError, TokenRevokedError } from '@atproto/oauth-client-node';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ttl = 10 * 60_000;
const nonce = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validNonce = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const validDid = value => typeof value === 'string' && /^did:(plc:[a-z2-7]{24}|web:[A-Za-z0-9._:%-]+)$/.test(value);
function fail(message = 'Sign-in expired or could not be verified. Start again.', status = 400) { throw Object.assign(new Error(message), { status, jeraSafe: true }); }
function cookie(req, name) { return (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail('Expected JSON.', 415);
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 4096) fail('Request too large.', 413); }
  try { return JSON.parse(text); } catch { fail('Invalid JSON.'); }
}
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }

export function createHandler({ client, store, publicOrigin, callbacks, snapbackOrigin, serviceToken, fetcher = fetch }) {
  const limits = new Map();
  async function upstream(path, token, payload) {
    const reply = await fetcher(`${snapbackOrigin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    const data = await reply.json();
    if (!reply.ok || data.denied) fail('The Jera session could not be verified.', reply.status === 401 ? 401 : 503);
    return data;
  }
  async function check(token) {
    if (!token) fail('Sign in again.', 401);
    const { data } = await upstream('/q/currentIdentity', token, { args: {} });
    const did = data?.did;
    if (!validDid(did)) fail('Sign in with your ATproto account.', 401);
    // Force a refresh to observe revocation on restore/renewal. Transport errors
    // preserve the local session; only definite loss of OAuth authority revokes it.
    try { await client.restore(did, true); }
    catch (error) {
      if (error instanceof TokenRefreshError || error instanceof TokenRevokedError) {
        await upstream('/auth/revoke', serviceToken, { principal: did });
        fail('Account authorization ended. Sign in again.', 401);
      }
      fail('Could not check account authorization. Try again when connected.', 503);
    }
    return did;
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const url = new URL(req.url, publicOrigin);
    const origin = req.headers.origin;
    const allowedOrigins = new Set([publicOrigin, ...callbacks.filter(c => c.startsWith('http')).map(c => new URL(c).origin)]);
    if (origin && !allowedOrigins.has(origin)) return json(res, 403, { denied: { code: 'E_ORIGIN', message: 'Origin not allowed.' } });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.writeHead(204); return res.end();
    }
    try {
      if (req.method === 'GET' && url.pathname === '/oauth/client-metadata.json') return json(res, 200, client.clientMetadata);
      if (req.method === 'GET' && url.pathname === '/oauth/jwks.json') return json(res, 200, client.jwks);
      if (req.method === 'GET' && url.pathname === '/oauth/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/oauth/start') {
        // This service is loopback-only behind Caddy, which replaces this header.
        const peer = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress;
        const now = Date.now();
        for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
        const limit = limits.get(peer) ?? { count: 0, until: now + 60000 };
        if (++limit.count > 20 || limits.size > 4096) fail('Too many sign-in attempts. Try again shortly.', 429);
        limits.set(peer, limit);
        const handle = (url.searchParams.get('handle') ?? '').trim().replace(/^@/, '');
        const state = url.searchParams.get('state'), challenge = url.searchParams.get('challenge'), callback = url.searchParams.get('callback');
        if (!validNonce(state) || !validNonce(challenge) || !callbacks.includes(callback)) fail();
        if (!validDid(handle) && !/^(?=.{3,253}$)[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(handle)) fail('Enter your full ATproto handle or DID.');
        const browser = nonce();
        if (!store.insert('flow', state, { challenge, callback, browser: digest(browser), phase: 'authorizing' }, ttl)) fail();
        // select_account requires an existing provider session and rejects first-time browsers.
        const authorization = await client.authorize(handle, { state, scope: 'atproto', prompt: 'consent' });
        res.setHeader('Set-Cookie', `jera_${state}=${browser}; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=600${publicOrigin.startsWith('https:') ? '; Secure' : ''}`);
        res.writeHead(302, { location: authorization.toString() }); return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        const { session, state } = await client.callback(url.searchParams);
        const flow = store.get('flow', state);
        if (!flow || flow.phase !== 'authorizing' || !equal(flow.browser, digest(cookie(req, `jera_${state}`) ?? '')) || !validDid(session.did)) fail();
        const code = nonce();
        store.set('flow', state, { ...flow, phase: 'complete', did: session.did, code: digest(code) }, 60000);
        const back = new URL(flow.callback); back.searchParams.set('state', state); back.searchParams.set('code', code);
        res.setHeader('Set-Cookie', `jera_${state}=; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=0${publicOrigin.startsWith('https:') ? '; Secure' : ''}`);
        res.writeHead(302, { location: back.toString() }); return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/oauth/exchange') {
        const { state, code, verifier } = await body(req);
        if (![state, code, verifier].every(validNonce)) fail();
        const flow = store.get('flow', state);
        if (!flow || flow.phase !== 'complete' || !equal(flow.code, digest(code)) || !equal(flow.challenge, digest(verifier))) fail();
        // No await between read and consume: concurrent requests cannot both mint.
        store.del('flow', state);
        const result = await upstream('/auth/session', serviceToken, { principal: flow.did, kind: 'account', days: 1 });
        if (result.session?.principal !== flow.did) fail('Unexpected account binding.', 502);
        return json(res, 200, { session: result.session });
      }
      if (req.method === 'POST' && ['/oauth/check', '/auth/refresh'].includes(url.pathname)) {
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const did = await check(token);
        return json(res, 200, url.pathname === '/auth/refresh' ? await upstream('/auth/refresh', token, {}) : { did });
      }
      return json(res, 404, { denied: { code: 'E_NOT_FOUND', message: 'Not found.' } });
    } catch (error) {
      // OAuth errors can contain credentials/callbacks: never log their raw value.
      if (!error.jeraSafe) console.error('Authorization failure', JSON.stringify({ type: error.constructor?.name, cause: error.cause?.constructor?.name, code: error.error, causeCode: error.cause?.error, issues: error.issues?.map(i => ({ path: i.path, code: i.code })) }));
      const status = error.jeraSafe === true ? error.status : 400;
      return json(res, status, { denied: { code: status === 401 ? 'E_AUTH' : 'E_SIGN_IN', message: error.jeraSafe === true ? error.message : 'Account authorization did not complete. Close this window and try again.' } });
    }
  };
}
