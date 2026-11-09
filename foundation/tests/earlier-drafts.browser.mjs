// Explicit draft recovery over simulated OAuth and disposable real Snapback.
import { chromium } from '../../tooling/exact2/node_modules/playwright-core/index.mjs';
import { chromium as browserBinary } from '../../tooling/exact2/scripts/agent-launch.mjs';
import { JeraClient } from '../scripts/client.mjs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.JERA_REVIEW_URL || 'http://127.0.0.1:3039';
const output = new URL('../../.local/public-index-review/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: browserBinary().executable });
const contexts = [], did = 'did:plc:' + 'a'.repeat(24);
const body = 'Earlier public writing ♍︎ ♍️ :virgo: ' + crypto.randomUUID();
const secondBody = 'Another device’s earlier draft ' + crypto.randomUUID();
async function device(handle) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(context);
  await context.route('https://public.api.bsky.app/**', route => route.fulfill({ json: { did, handle, displayName: 'Draft Review' } }));
  const page = await context.newPage(), at = id => page.locator(`[data-testid="${id}"]:visible`).last();
  await page.goto(base + '/'); await at('handle').fill(handle);
  const exchange = page.waitForResponse(response => response.url().endsWith('/oauth/exchange') && response.request().method() === 'POST');
  await at('login').click();
  const { session } = await (await exchange).json(); await at('account-avatar').waitFor();
  return { page, at, client: new JeraClient('http://127.0.0.1:4417', session.token) };
}
async function openRecovery(at) {
  await at('account-avatar').click(); await at('earlier-public-drafts').click(); await at('refresh-earlier-drafts').waitFor();
}
try {
  const { page, at, client } = await device('owner.test');
  const first = (await client.mutate('saveSocialDraft', { deviceKey: 'R'.repeat(26), scope: 'root:public', body, revision: 1 })).result;
  const second = (await client.mutate('saveSocialDraft', { deviceKey: 'S'.repeat(26), scope: 'root:public', body: secondBody, revision: 1 })).result;
  await at('header-experience-public').click(); await at('public-feed-title').waitFor();
  await openRecovery(at);
  await page.getByText(body, { exact: true }).filter({ visible: true }).waitFor();
  await page.getByText(secondBody, { exact: true }).filter({ visible: true }).waitFor();
  await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: output + 'earlier-drafts-phone.png' });
  await at(`recover-cloud:${first.id}`).click(); await at('composer').waitFor();
  await page.waitForFunction(value => document.querySelector('textarea')?.value === value, body);
  assert.equal(await at('reply-private-only').textContent(), 'Private');
  assert.equal(await at('post').isDisabled(), false);
  assert.equal((await client.query('earlierPublicDraft', { id: first.id })).data.body, body, 'copy preserves the synced original');
  await page.screenshot({ path: output + 'earlier-draft-private-copy.png' });
  await at('cancel').click(); await at('feed-write').waitFor();
  await openRecovery(at); await at(`recover-cloud:${second.id}`).click();
  await at('earlier-drafts-error').waitFor();
  assert.match(await at('earlier-drafts-error').textContent(), /occupied/);
  await at('open-private-draft').click(); await at('composer').waitFor();
  await page.waitForFunction(value => document.querySelector('textarea')?.value === value, body);
  assert.equal(await at('composer').inputValue(), body, 'conflicting recovery never replaces the current private draft');
  await at('cancel').click(); await at('feed-write').waitFor();
  await openRecovery(at); await at('refresh-earlier-drafts').click();
  await page.getByText(body, { exact: true }).filter({ visible: true }).waitFor();
  await page.getByText(secondBody, { exact: true }).filter({ visible: true }).waitFor();
  const other = await device('other.test'); await openRecovery(other.at); await other.at('earlier-drafts-empty').waitFor();
  assert.equal(await other.page.getByText(body, { exact: true }).count(), 0);
  console.log('PASS: normal account entry, all synced branches, explicit private copy, preserved originals, occupied-draft refusal, cancel/reopen, Unicode and DID isolation.');
} finally { for (const context of contexts) await context.close(); await browser.close(); }
