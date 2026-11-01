import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { TokenRevokedError } from '@atproto/oauth-client-node';
import { AuthStore } from '../store.mjs';
import { createHandler, digest } from '../service.mjs';

const token = () => randomBytes(32).toString('base64url');
const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const callback = 'studio.zojer.jera.exact:/oauth';

// Stub only the already-verified OAuth boundary. These tests do not prove real
// PDS authorization; they exercise Jera's handoff and session custody over HTTP.
async function fixture(t) {
  const store = new AuthStore(':memory:');
  let minted = 0, revoked = 0, authority = true;
  const client = {
    clientMetadata: { scope: 'atproto' }, jwks: { keys: [] },
    authorize: async (handle, options) => {
      // A fresh browser has no provider sessions. Bluesky refuses select_account
      // in that case; ordinary interactive authorization must remain possible.
      if (options.prompt === 'select_account' || options.prompt === 'none') throw new Error('account_selection_required');
      return new URL(`https://identity.example/authorize?state=${options.state}`);
    },
    callback: async params => {
      if (params.get('proof') !== 'verified-by-test-sdk') throw Object.assign(new Error('invalid OAuth callback'), { status: 2 });
      return { session: { did }, state: params.get('state') };
    },
    restore: async sub => { assert.equal(sub, did); if (!authority) throw new TokenRevokedError(did); },
  };
  const upstream = async (url, options) => {
    if (url.endsWith('/auth/session')) {
      assert.equal(options.headers.authorization, 'Bearer server-only');
      assert.equal(JSON.parse(options.body).principal, did);
      minted++;
      return Response.json({ session: { principal: did, token: 'private-session', kind: 'account', expiresAt: Date.now() + 86400000 } });
    }
    if (url.endsWith('/auth/revoke')) { revoked++; return Response.json({ revoked: 1 }); }
    if (url.endsWith('/q/currentIdentity')) {
      if (options.headers.authorization !== 'Bearer private-session') return Response.json({ denied: { code: 'E_AUTH' } }, { status: 401 });
      return Response.json({ data: { did } });
    }
    throw new Error('Unexpected backend operation');
  };
  const server = createServer(createHandler({ client, store, publicOrigin: 'http://127.0.0.1', callbacks: [callback], snapbackOrigin: 'http://backend.test', serviceToken: 'server-only', fetcher: upstream }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
  async function start() {
    const verifier = token(), state = token();
    const response = await fetch(`${origin}/oauth/start?handle=alice.test&state=${state}&challenge=${digest(verifier)}&callback=${encodeURIComponent(callback)}`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    return { state, verifier, cookie: response.headers.get('set-cookie').split(';')[0] };
  }
  async function finish(flow, cookie = flow.cookie) {
    return fetch(`${origin}/oauth/callback?state=${flow.state}&proof=verified-by-test-sdk`, { headers: { cookie }, redirect: 'manual' });
  }
  return { store, origin, post, start, finish, minted: () => minted, revoked: () => revoked, revoke: () => { authority = false; } };
}

test('only verified callback + original device verifier can mint the DID; handoff is single-use', async t => {
  const f = await fixture(t), flow = await f.start();
  assert.equal((await f.post('/oauth/exchange', { state: flow.state, verifier: flow.verifier, code: token(), did })).status, 400);
  const back = await f.finish(flow); assert.equal(back.status, 302);
  const code = new URL(back.headers.get('location')).searchParams.get('code');
  assert.equal((await f.post('/oauth/exchange', { state: flow.state, verifier: token(), code })).status, 400);
  const payload = { state: flow.state, verifier: flow.verifier, code };
  const replies = await Promise.all([f.post('/oauth/exchange', payload), f.post('/oauth/exchange', payload)]);
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 400]);
  assert.equal(f.minted(), 1);
  const session = (await replies.find(r => r.status === 200).json()).session;
  assert.equal(session.principal, did);
  assert.equal((await f.post('/oauth/check', {}, { authorization: `Bearer ${session.token}` })).status, 200);
  assert.equal((await f.post('/oauth/check', { did }, { authorization: 'Bearer forged' })).status, 401);
  f.revoke();
  assert.equal((await f.post('/oauth/check', {}, { authorization: `Bearer ${session.token}` })).status, 401);
  assert.equal(f.revoked(), 1);
});

test('callback rejects another browser, forged OAuth evidence and replay', async t => {
  const f = await fixture(t), flow = await f.start();
  assert.equal((await f.finish(flow, 'unrelated=cookie')).status, 400);
  assert.equal((await fetch(`${f.origin}/oauth/callback?state=${flow.state}`, { headers: { cookie: flow.cookie } })).status, 400);
  assert.equal((await f.finish(flow)).status, 302);
  assert.equal((await f.finish(flow)).status, 400);
  assert.equal(f.minted(), 0);
});

test('redirect allowlist, CORS and expiration cannot be bypassed', async t => {
  const f = await fixture(t);
  const response = await fetch(`${f.origin}/oauth/start?handle=alice.test&state=${token()}&challenge=${token()}&callback=https://attacker.test/`);
  assert.equal(response.status, 400);
  assert.equal((await f.post('/oauth/exchange', {}, { origin: 'https://attacker.test' })).status, 403);
  const flow = await f.start();
  f.store.set('flow', flow.state, f.store.get('flow', flow.state), -1);
  assert.equal((await f.finish(flow)).status, 400);
  assert.equal(f.minted(), 0);
});


test('SDK failures with a non-HTTP status cannot crash the server or expose details', async t => {
  const f = await fixture(t);
  // An unverified callback is handled as a generic failure, never an account.
  const r = await fetch(`${f.origin}/oauth/callback?state=${token()}&secret=not-for-errors`);
  assert.equal(r.status, 400);
  assert.ok(!(await r.text()).includes('not-for-errors'));
  assert.equal((await fetch(f.origin + '/oauth/health')).status, 200);
});
