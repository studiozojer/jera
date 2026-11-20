import { test, expect } from 'bun:test';
import { rememberedSession } from './remembered-session.ts';

const day = 86400000;
const access = { token:'fixture', principal:'did:web:fixture.test', kind:'account', expiresAt:day };
const enrollment = { session:access, deviceCredential:'a'.repeat(43), deviceExpiresAt:90*day };
function memory() {
  const keys = new Map<string,string>();
  return {get:(key:string)=>keys.get(key) ?? null, set:(key:string,value:string)=>{keys.set(key,value);}, forget:(key:string)=>{keys.delete(key);}};
}

test('a remembered phone restores its local account after an outage and renews the expired bearer on return', async () => {
  const store = memory();
  let offline = true;
  const device = rememberedSession(store, 'account', async () => {
    if (offline) throw Object.assign(new Error('Temporarily unavailable'), { code:'E_SIGN_IN' });
    return { session:{...access, token:'replacement', expiresAt:4*day}, deviceExpiresAt:93*day };
  });
  device.keep(enrollment);
  expect(await device.restore(3*day,false,true)).toBe(access.principal);
  expect(device.present()).toBe(true);
  offline=false;
  expect(await device.restore(3*day,false,true)).toBe(access.principal);
  expect(JSON.parse(store.get('account')!).token).toBe('replacement');
});

test('device revocation clears this installation and a late restore cannot undo logout', async () => {
  const store = memory();
  let finish!: (value:unknown)=>void;
  const device = rememberedSession(store, 'account', path => path.endsWith('/logout') ? Promise.resolve({}) : new Promise(resolve=>{finish=resolve;}));
  device.keep(enrollment);
  const pending=device.restore(100,false,true);
  await device.logout(async () => {});
  finish({ session:access, deviceExpiresAt:90*day });
  await expect(pending).rejects.toThrow('changed');
  expect(store.get('account')).toBeNull();
  const revoked = rememberedSession(store, 'account', async () => { throw Object.assign(new Error('Ended'),{code:'E_AUTH'}); });
  revoked.keep(enrollment);
  expect(await revoked.restore(100,false,true)).toBe('');
  expect(revoked.present()).toBe(false);
});
