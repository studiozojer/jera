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

// Cache-only presentation reads never wait on network or establish identity.
export async function readCachedAccountProfile(principal: string, storage: ProfileStorage): Promise<AccountProfile> {
  const fallback = emptyProfile(principal);
  if (!principal) return fallback;
  const path = `app:/data/profile-${encodeURIComponent(principal)}.json`;
  try { return normalized(JSON.parse(new TextDecoder().decode(await storage.fs.readFile(path))), principal) ?? fallback; }
  catch { return fallback; }
}

export async function loadAccountProfile(principal: string, storage: ProfileStorage, fetcher: typeof fetch = fetch): Promise<AccountProfile> {
  const cached = await readCachedAccountProfile(principal, storage);
  if (!principal) return cached;
  const path = `app:/data/profile-${encodeURIComponent(principal)}.json`;
  try {
    const response = await fetcher(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(principal)}`, { exactTimeout: 5000, redirect: 'error' });
    if (!response.ok) return cached;
    const profile = normalized(await response.json(), principal);
    if (!profile) return cached;
    try { await storage.fs.atomicWriteFile(path, new TextEncoder().encode(JSON.stringify({ did: principal, displayName: profile.name, handle: profile.handle, avatar: profile.avatar }))); } catch { /* A cache failure must not hide a fetched profile. */ }
    return profile;
  } catch { return cached; }
}
