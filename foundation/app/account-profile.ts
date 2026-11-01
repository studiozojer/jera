// Public presentation data only. The verified session DID remains the identity.
export type AccountProfile = { principal: string; name: string; handle: string; avatar: string };
type ProfileStorage = { fs: { readFile(path: string): Promise<ArrayBuffer>; atomicWriteFile(path: string, data: Uint8Array): Promise<unknown> } };
export const emptyProfile = (principal: string): AccountProfile => ({ principal, name: 'Your account', handle: '', avatar: '' });

function normalized(value: unknown, principal: string): AccountProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  if (profile.did !== principal || typeof profile.handle !== 'string') return null;
  const handle = profile.handle === 'handle.invalid' ? '' : profile.handle.slice(0, 253);
  let avatar = '';
  try {
    const url = new URL(String(profile.avatar ?? ''));
    if (url.protocol === 'https:' && url.hostname === 'cdn.bsky.app' && url.pathname.startsWith('/img/avatar/') && !url.username && !url.password) avatar = url.href;
  } catch { /* No photo uses the same fallback as an unavailable profile. */ }
  const name = typeof profile.displayName === 'string' ? profile.displayName.trim().slice(0, 160) : '';
  return { principal, name: name || handle || 'Your account', handle, avatar };
}

export async function loadAccountProfile(principal: string, storage: ProfileStorage, fetcher: typeof fetch = fetch): Promise<AccountProfile> {
  const fallback = emptyProfile(principal);
  if (!principal) return fallback;
  const path = `app:/data/profile-${encodeURIComponent(principal)}.json`;
  let cached: AccountProfile | null = null;
  try { cached = normalized(JSON.parse(new TextDecoder().decode(await storage.fs.readFile(path))), principal); } catch { /* First launch or an invalid cache. */ }
  try {
    const response = await fetcher(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(principal)}`, { exactTimeout: 5000, redirect: 'error' });
    if (!response.ok) return cached ?? fallback;
    const profile = normalized(await response.json(), principal);
    if (!profile) return cached ?? fallback;
    try { await storage.fs.atomicWriteFile(path, new TextEncoder().encode(JSON.stringify({ did: principal, displayName: profile.name, handle: profile.handle, avatar: profile.avatar }))); } catch { /* A cache failure must not hide a fetched profile. */ }
    return profile;
  } catch { return cached ?? fallback; }
}
