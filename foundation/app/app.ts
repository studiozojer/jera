import type { Answer, Sources, Store, Storage, NativeModule } from './app.contract.d.ts';
import { Snapback, refused } from './snapback4/snapback.ts';
import { parseLoginInput } from './login-input.ts';
import { loadAccountProfile } from './account-profile.ts';

const origin = 'http://127.0.0.1:4417';
export const appId = 'studio.zojer.jera.exact';
// Exact rewrites origin when baking. Never share credentials or drafts across servers.
function storageKey(value: string): string {
  if (value === 'https://snapback.jera.ink') return 'jera-https-snapback-jera-ink';
  if (value === 'http://127.0.0.1:4417') return 'jera-http-127.0.0.1-4417';
  throw new Error('Unconfigured Jera backend: add an origin-specific storage key and grant before using it.');
}
const sessionKey = storageKey(origin) + '-atproto-v1';
const pendingKey = sessionKey + '-login';
export const grants = `net.fetch ${origin}\nnet.fetch https://public.api.bsky.app\nauth.session ${origin}\nauth.callback studio.zojer.jera.exact:/oauth\nsqlite.open app:/data\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1\nsecret.keep jera-https-snapback-jera-ink-atproto-v1\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1-login\nsecret.keep jera-https-snapback-jera-ink-atproto-v1-login\nfs.read app:/data\nfs.write app:/data`;

function randomToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function prepareLogin(store: Store, replace = false): Promise<void> {
  if (!replace && store.get(pendingKey)) return;
  const verifier = randomToken(), state = randomToken();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  store.set(pendingKey, JSON.stringify({ verifier, state, challenge }));
}
async function authRequest(path: string, body: unknown, token?: string): Promise<any> {
  // Exact's host deadline stays integral on the native live clock. The pinned
  // runtime can turn AbortSignal.timeout's remaining time into a fraction.
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), exactTimeout: 15000 });
  const result = await response.json();
  if (!response.ok) throw refused(result.denied ?? { code: 'E_AUTH', message: 'Sign-in could not complete. Try again.' });
  return result;
}

function reject(code: string, message: string): never { throw refused({ code, message }); }
async function using<T>(store: Store, storage: Storage, native: NativeModule | null | undefined, now: number, fn: (db: Snapback) => Promise<T>): Promise<T> {
  const db = await Snapback.open({ app: appId, name: sessionKey, origin, storage, native, auth: { store, key: sessionKey, now } });
  try { return await fn(db); } finally { await db.close(); }
}
const sources: Sources = {
  accountProfile: ([principal], store, storage) => loadAccountProfile(principal, storage),
  logout: ([now], store, storage, native) => using(store, storage, native, now, async db => {
    await db.logout(); return { state: 'sent', id: '' };
  }),
  loginInput: ([input]) => parseLoginInput(input),
  lookupAccounts: async ([query]) => {
    if (query.trim().replace(/^@/, '').length < 2 || query.trim().startsWith('did:')) return { query, items: [], available: true, complete: true };
    try {
      const result = await authRequest('/oauth/accounts', { query });
      return { ...result, items: result.items.map((actor: { avatar?: string }) => ({ ...actor, avatar: actor.avatar ?? '' })) };
    } catch {
      return { query, items: [], available: false, complete: false };
    }
  },
  restore: async ([now], store, storage, native) => {
    // Prepare before the press so web hosts can open their popup synchronously.
    await prepareLogin(store);
    return using(store, storage, native, now, async db => {
      if (!db.session) return { principal: '' };
      const raw = store.get(sessionKey);
      try {
        const { did } = await authRequest('/oauth/check', {}, db.session.token);
        if (store.get(sessionKey) !== raw) reject('E_STALE', 'The account changed while checking authorization.');
        if (did !== db.session.principal) reject('E_AUTH', 'The account changed. Sign in again.');
      } catch (error) {
        if (store.get(sessionKey) !== raw) throw error;
        if ((error as { code?: string }).code === 'E_AUTH') { await db.logout(); return { principal: '' }; }
        // Offline restoration preserves this account's partition and draft.
        // Online operations still require a valid backend session.
      }
      return { principal: db.session?.principal ?? '' };
    });
  },
  login: async ([handle, now], store, storage, native) => {
    const input = parseLoginInput(handle);
    if (!input.valid) reject('E_INPUT', 'Enter your full ATproto handle or DID.');
    if (store.get(sessionKey)) reject('E_AUTH', 'Sign out before changing accounts.');
    const pending = store.get(pendingKey);
    if (!pending) reject('E_AUTH', 'Refresh before signing in.');
    const flow = { ...JSON.parse(pending), callback: authCallback() };
    const url = `${origin}/oauth/start?handle=${encodeURIComponent(input.value)}&state=${flow.state}&challenge=${flow.challenge}&callback=${encodeURIComponent(flow.callback)}`;
    try {
      const back = new URL(await openAuthSession(url, { callback: flow.callback, state: flow.state }));
      if (back.searchParams.get('state') !== flow.state || !back.searchParams.get('code')) reject('E_AUTH', 'Sign-in could not be verified.');
      const result = await authRequest('/oauth/exchange', { state: flow.state, code: back.searchParams.get('code'), verifier: flow.verifier });
      if (store.get(pendingKey) !== pending || store.get(sessionKey)) reject('E_AUTH', 'The sign-in attempt changed. Try again.');
      const session = result.session;
      if (!session || !/^did:(plc|web):/.test(session.principal) || typeof session.token !== 'string' || !session.token || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) reject('E_AUTH', 'The server returned an invalid account session.');
      store.set(sessionKey, JSON.stringify(session));
      return { state: 'sent', id: session.principal };
    } finally {
      if (store.get(pendingKey) === pending) await prepareLogin(store, true);
    }
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
