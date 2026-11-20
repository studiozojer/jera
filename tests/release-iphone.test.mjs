import test from 'node:test';
import assert from 'node:assert/strict';
import { publicReceipt, verifyWeb } from '../scripts/release-iphone.mjs';

const candidate = { commit: '123abc', buildNumber: '17', sha256: 'digest' };
const update = { url: 'https://appdrop.app/d/vyau9rfizz', bundleId: 'studio.zojer.jera.exact',
  version: '17', updated: true, revision: 2, manageKey: 'private-fixture' };

test('the selected web revision and production gateway must match the phone candidate', () => {
  const web = { commit: candidate.commit, backend: 'https://snapback.jera.ink' };
  verifyWeb(web, candidate.commit);
  assert.throws(() => verifyWeb(web, 'older'));
  assert.throws(() => verifyWeb({ ...web, backend: 'https://other.example' }, candidate.commit));
});

test('a confirmed AppDrop revision produces a receipt with only public release data', () => {
  assert.deepEqual(publicReceipt(update, candidate), { ...candidate, url: update.url, revision: 2 });
  for (const mismatch of [{ updated: false }, { url: 'https://appdrop.app/d/another' },
    { bundleId: 'other.app' }, { version: '1' }, { revision: undefined }]) {
    assert.throws(() => publicReceipt({ ...update, ...mismatch }, candidate));
  }
});
