import { isHandle, parseLoginInput } from './login-input.ts';

export const identityOrigin = 'https://slingshot.microcosm.blue';

// Slingshot returns bidirectionally verified public ATproto identities.
export async function resolveAudienceIdentity(identifier: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(
    `${identityOrigin}/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${encodeURIComponent(identifier)}`,
    { exactTimeout: 5000, redirect: 'error' },
  );
  if (!response.ok) throw new Error('Could not verify this handle.');
  const result = await response.json();
  const did = typeof result?.did === 'string' ? parseLoginInput(result.did) : null;
  const handle = typeof result?.handle === 'string' && isHandle(result.handle) ? result.handle.toLowerCase() : '';
  if (!did?.valid || !did.value.startsWith('did:') || !handle ||
      (identifier.startsWith('did:') ? did.value !== identifier : handle !== identifier)) {
    throw new Error('Could not verify this handle.');
  }
  return { did: did.value, handle };
}
