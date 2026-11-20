import { validAccess, type Access } from './remembered-session.ts';
import type { Store } from './app.contract.d.ts';
export type { Access };

type Gateway = (path: string, body: unknown, token?: string) => Promise<any>;

export function refused(why: { code: string; message: string }) {
  const error = Object.assign(new Error(why.message), { refusal: why, code: why.code, reason: why.code });
  if (why.code === 'E_OFFLINE') Object.defineProperties(error, {
    name: { value: 'FetchError' }, kind: { value: 'Network', enumerable: true },
  });
  return error;
}

// Older installations hold only a short-lived gateway bearer. Serialize renewal
// of the same bearer: the gateway retires it when it issues the replacement.
const renewals = new Map<string, Promise<Access | null>>();

export async function accessSession(store: Store, key: string, now: number, request: Gateway): Promise<Access | null> {
  const before = store.get(key);
  if (!before) return null;
  let session: Access | null;
  try { session = JSON.parse(before); } catch { session = null; }
  if (!validAccess(session, now)) {
    store.forget(key);
    return null;
  }
  if (session.expiresAt - now > 60_000) return session;
  const token = session.token;
  let renewed = renewals.get(token);
  if (!renewed) {
    renewed = request('/auth/refresh', {}, token).then(result => {
      if (!validAccess(result.session, now) || result.session.principal !== session.principal)
        throw refused({ code: 'E_SESSION', message: 'Could not verify the renewed session.' });
      return result.session as Access;
    }).catch(error => {
      if (error.code === 'E_AUTH') return null;
      if (error.code === 'E_SESSION') throw error;
      return session;
    }).finally(() => renewals.delete(token));
    renewals.set(token, renewed);
  }
  const next = await renewed;
  const serialized = next && JSON.stringify(next);
  const current = store.get(key);
  if (current !== before && current !== serialized) throw refused({ code: 'E_STALE', message: 'The signed-in account changed.' });
  if (!next) store.forget(key);
  else if (next.token !== token) store.set(key, JSON.stringify(next));
  return next;
}

export async function forgetAccess(store: Store, key: string, request: Gateway) {
  const raw = store.get(key);
  store.forget(key);
  if (!raw) return;
  try {
    const session = JSON.parse(raw);
    if (session.token) await request('/auth/logout', {}, session.token);
  } catch { /* Local sign-out also completes while the gateway is unreachable. */ }
}
