import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLoginInput } from '../app/login-input.ts';

test('sign-in accepts full handles and supported DIDs, with harmless input normalization', () => {
  for (const value of ['pageofswrds.kairos.solar', '8.cn', 'owner.test', 'did:plc:cffpoqxi7xulcvhguzyluwdj', 'did:web:example.com']) {
    assert.equal(parseLoginInput(value).valid, true, value);
  }
  assert.deepEqual(parseLoginInput('  @PageOfSwrds.Kairos.Solar  '), {
    input: '  @PageOfSwrds.Kairos.Solar  ', value: 'pageofswrds.kairos.solar', valid: true,
  });
});

test('partial names, URLs, malformed labels and incomplete DIDs cannot submit', () => {
  for (const value of ['', ' ', '@', 'pageofswrds', 'Alice Example', 'https://alice.test', 'alice..test', '-alice.test', 'alice-.test', 'alice.123', 'alice.test.', 'a'.repeat(64) + '.test', 'a.'.repeat(125) + 'test', 'did:plc:short', 'did:plc:' + '0'.repeat(24), 'did:web:', 'did:web:example.com:path', 'did:key:abc', 'handle.invalid']) {
    assert.equal(parseLoginInput(value).valid, false, value);
  }
});
