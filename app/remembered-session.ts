// All values live in Exact's origin-scoped secret store. On iOS this is the
// app Keychain. Store the device proof separately so the data driver's expiry
// cleanup cannot also discard the means to renew it.
type Store = { get(key: string): string | null; set(key: string, value: string): void; forget(key: string): void };
export type Access = { token: string; principal: string; kind: string; expiresAt: number };
type Device = { credential: string; principal: string; expiresAt: number };
type Request = (path: string, body: unknown, token?: string) => Promise<any>;

export function validAccess(value: Access | null, now: number): value is Access {
  return Boolean(value && /^did:(plc|web):/.test(value.principal) && value.kind === 'account' &&
    typeof value.token === 'string' && value.token && Number.isFinite(value.expiresAt) && value.expiresAt > now);
}

export function rememberedSession(store: Store, key: string, request: Request) {
  const deviceKey = key + '-device';
  function clear() {
    store.forget(deviceKey);
    store.forget(key);
  }
  return {
    present() { return Boolean(store.get(deviceKey)); },
    async restore(now: number, browser: boolean, force: boolean) {
      const saved = store.get(deviceKey);
      if (!saved) return null;
      const device: Device = JSON.parse(saved);
      const before = store.get(key);
      const access: Access | null = before ? JSON.parse(before) : null;
      const renewBefore = (browser ? 7 : 0.5) * 86400000;
      if (!force && access?.principal === device.principal && access.expiresAt - now > renewBefore) return device.principal;
      let result;
      try { result = await request('/oauth/device/session', {}, device.credential); }
      catch (error) {
        if (store.get(deviceKey) !== saved || store.get(key) !== before) throw error;
        if ((error as { code?: string }).code === 'E_AUTH') { clear(); return ''; }
        // A failed check can show this device's local account and drafts.
        // Every remote read/write still needs an accepted data bearer.
        if (force && device.expiresAt > now) return device.principal;
        throw error;
      }
      const session = result.session;
      if (!validAccess(session, now) || session.principal !== device.principal || !Number.isFinite(result.deviceExpiresAt))
        throw new Error('Could not verify the renewed account session.');
      const current = store.get(deviceKey);
      // Other answers may have renewed the same grant. Logout or switching
      // grants fences every response admitted under the previous credential.
      if (!current || JSON.parse(current).credential !== device.credential) throw new Error('The signed-in account changed.');
      const latest = store.get(key);
      if (latest !== before && latest && JSON.parse(latest).expiresAt > session.expiresAt) return device.principal;
      const serialized = JSON.stringify(session);
      if (latest !== serialized) store.set(key, serialized);
      // Exact re-evaluates sources reading a changed secret. Avoid a
      // restore/write/restore loop just to advance an offline hint by ms.
      const currentDevice: Device = JSON.parse(current);
      if (result.deviceExpiresAt - currentDevice.expiresAt >= 60_000) {
        store.set(deviceKey, JSON.stringify({ ...currentDevice, expiresAt: result.deviceExpiresAt }));
      }
      return device.principal;
    },
    keep(result: { session: Access; deviceCredential?: string; deviceExpiresAt?: number }) {
      if (result.deviceCredential) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(result.deviceCredential) || !Number.isFinite(result.deviceExpiresAt))
          throw new Error('Could not verify the device authorization.');
        store.set(deviceKey, JSON.stringify({ credential: result.deviceCredential, principal: result.session.principal, expiresAt: result.deviceExpiresAt }));
      }
      store.set(key, JSON.stringify(result.session));
    },
    async logout(retireAccess: () => Promise<unknown>) {
      const saved = store.get(deviceKey);
      if (!saved) return false;
      const before = store.get(key);
      store.forget(deviceKey);
      try {
        await Promise.all([
          retireAccess(),
          request('/oauth/device/logout', {}, JSON.parse(saved).credential).catch(() => {
            // Offline logout can only confirm that this installation forgot its grant.
          }),
        ]);
      } finally {
        if (store.get(key) === before) store.forget(key);
      }
      return true;
    },
  };
}
