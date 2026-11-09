// Normal-browser evidence over simulated OAuth/PDS and real Snapback storage.
import { chromium } from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import { chromium as browserBinary } from '../tooling/exact2/scripts/agent-launch.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.JERA_REVIEW_URL || 'http://127.0.0.1:3039';
const output = new URL('../../.local/public-index-review/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: browserBinary().executable });
const contexts = [];
const ownerDid = 'did:plc:' + 'a'.repeat(24);
const root = `at://${ownerDid}/app.bsky.feed.post/root`;
const ownReply = `at://${ownerDid}/app.bsky.feed.post/selfreply`;
const privateBody = 'Private fixture must stay private ' + crypto.randomUUID();
async function device(handle) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(context);
  await context.route('https://public.api.bsky.app/**', route => {
    const did = new URL(route.request().url()).searchParams.get('actor');
    return route.fulfill({ json: { did, handle: did === ownerDid ? 'owner.test' : 'other.test', displayName: did === ownerDid ? 'Test Owner' : 'Other Account' } });
  });
  await context.route('https://cdn.bsky.app/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect width="600" height="240" fill="#71695f"/><circle cx="300" cy="120" r="65" fill="#ded5c5"/></svg>' }));
  const page = await context.newPage();
  const at = id => page.locator(`[data-testid="${id}"]:visible`).last();
  await page.goto(base + '/'); await at('handle').fill(handle); await at('login').click(); await at('account-avatar').waitFor();
  return { page, at };
}
try {
  const { page, at } = await device('owner.test');
  await at('feed-write').click(); await at('composer').fill(privateBody); await at('post').click();
  await page.waitForURL(/\/thread\//); await at('back').click();
  await at('header-experience-public').click(); await at('public-feed-title').waitFor();
  await page.waitForTimeout(800); await at('refresh-public').click();
  await at(`body-${root}`).waitFor({ timeout: 20000 });
  assert.equal(await at(`body-${root}`).textContent(), 'My Bluesky post ♍︎ ♍️ :virgo:');
  assert.equal(await page.locator('[data-testid^="post-row-"]:visible').count(), 50);
  assert.equal(await page.getByText(privateBody, { exact: true }).filter({ visible: true }).count(), 0);
  assert.equal(await page.getByText('My own thread continuation', { exact: true }).filter({ visible: true }).count(), 0);
  assert.equal(await at('feed-write').count(), 0); assert.equal(await at('write').count(), 0);
  assert.equal(await page.locator('[data-testid^="like-"]:visible').count(), 0);
  await at('public-load-more').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="post-row-"]').length >= 51);
  assert.equal(await page.locator('[data-testid^="post-row-"]:visible').count(), 51);
  await page.waitForFunction(() => [...document.images].some(image => image.alt === 'Synthetic public image' && image.naturalWidth > 0));
  await page.locator('[data-testid="stream"]').evaluate(element => { element.scrollTop = 0; });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.locator('[data-testid^="post-row-"]').evaluateAll(rows => rows.slice(0, 12).map(row => {
    const body = row.querySelector('[data-testid^="body-"]'), source = row.querySelector('[data-testid^="public-source-"]');
    const rect = element => { const range = document.createRange(); range.selectNodeContents(element); const r = range.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height}; };
    return {body:rect(body),source:rect(source),rowHeight:row.getBoundingClientRect().height,gap:getComputedStyle(body.parentElement).gap,display:getComputedStyle(body.parentElement).display};
  }));
  await writeFile(output + 'phone-row-geometry.json', JSON.stringify(geometry, null, 2));
  assert(geometry.every(row => row.source.top >= row.body.bottom + 8), 'source links must remain below the actual body text after fonts settle');
  await page.screenshot({ path: output + 'public-feed-phone.png' });
  await at(`post-row-${root}`).click(); await at(`thread-body-${root}`).waitFor(); await at(`thread-body-${ownReply}`).waitFor();
  await at(`missing-parent-at://${ownerDid}/app.bsky.feed.post/gap-reply`).waitFor();
  await at(`thread-body-at://${ownerDid}/app.bsky.feed.post/gap-reply`).waitFor();
  await at(`thread-body-at://${ownerDid}/app.bsky.feed.post/gap-child`).waitFor();
  assert.equal(await at('reply').count(), 0); assert.equal(await at(`thread-reply-entry-${root}`).count(), 0);
  assert.equal(await at(`public-source-${root}`).getAttribute('href'), 'https://bsky.app/profile/did%3Aplc%3Aaaaaaaaaaaaaaaaaaaaaaaaa/post/root');
  await page.screenshot({ path: output + 'public-self-thread-phone.png' });
  await at('back').click(); await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-testid="stream"]').evaluate(element => { element.scrollTop = 0; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: output + 'public-feed-desktop.png' });
  await page.route('http://127.0.0.1:4417/q/publicIndexStatus', route => route.abort());
  await at('refresh-public').click(); await page.getByText('Couldn’t load posts.', { exact: true }).filter({ visible: true }).waitFor();
  assert.equal(await at(`body-${root}`).count(), 1, 'failed refresh keeps the last successful indexed feed');
  await page.unroute('http://127.0.0.1:4417/q/publicIndexStatus');
  await at('retry-posts').click(); await at(`body-${root}`).waitFor();
  await at('header-experience-private').click(); await at('feed-write').waitFor();
  await page.getByText(privateBody, { exact: true }).filter({ visible: true }).waitFor();
  const other = await device('other.test');
  await other.at('header-experience-public').click(); await other.page.waitForTimeout(800); await other.at('refresh-public').click();
  await other.page.getByText('Another account’s Bluesky post', { exact: true }).filter({ visible: true }).waitFor();
  assert.equal(await other.page.getByText('My Bluesky post ♍︎ ♍️ :virgo:', { exact: true }).count(), 0);
  console.log('PASS: own roots, pagination, Unicode, images, self-thread, source links, read-only actions, private/public separation, retained feed after failed refresh, recovery and independent DID indexes. Captures:', output);
} finally { for (const context of contexts) await context.close(); await browser.close(); }
