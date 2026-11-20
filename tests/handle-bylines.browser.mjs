// Run against an isolated preview on 3049 with its disposable test-server on 4497.
import assert from 'node:assert/strict';
import { chromium } from '../tooling/exact2/node_modules/playwright-core/index.mjs';
import { chromium as browserBinary } from '../tooling/exact2/scripts/agent-launch.mjs';

const preview = 'http://127.0.0.1:3049';
assert.equal((await fetch('http://127.0.0.1:4497/dev/legacy-public', { method: 'POST' })).status, 200);
const browser = await chromium.launch({ executablePath: browserBinary().executable });
try {
  for (const { handle, name, label, icon, fail } of [
    { handle: 'river.kairos.solar', label: 'river', icon: 'kairos' },
    { handle: 'river.bsky.social', label: 'river', icon: 'bluesky' },
    { handle: 'east.river.bsky.social', label: 'east.river', icon: 'bluesky' },
    { handle: 'zojer.studio', label: '@zojer.studio' },
    { handle: 'kairos.solar', label: '@kairos.solar' },
    { handle: 'river.kairos.solar.example.com', label: '@river.kairos.solar.example.com' },
    { handle: 'river.bsky.social', name: 'river.bsky.social', label: 'river.bsky.social' },
    { handle: 'river.bsky.social', label: '@river.bsky.social', fail: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.route('https://public.api.bsky.app/**', route => route.fulfill({ json: {
      did: new URL(route.request().url()).searchParams.get('actor'), handle, displayName: name ?? '',
    } }));
    if (fail) await context.route('**/bluesky-butterfly.svg*', route => route.abort());
    const page = await context.newPage();
    await page.goto(preview);
    await page.getByTestId('handle').fill('owner.test');
    await page.getByTestId('login').click();
    await page.getByTestId('header-experience-public').click();
    const row = page.locator('[data-testid^="post-row-"]:visible').first();
    await row.getByText(label, { exact: true }).waitFor();
    assert.ok((await row.getAttribute('aria-label')).startsWith(`Open thread by ${name || '@' + handle}:`));
    const mark = row.getByRole('img', { name: '@' + handle, exact: true });
    if (icon) {
      const image = mark.locator('img');
      await image.waitFor();
      if (icon === 'kairos') assert.match(await image.getAttribute('data-symbol-source'), /kairos-logo/);
      else await image.evaluate(el => el.decode());
    } else {
      assert.equal(await mark.count(), 0);
    }
    await row.click();
    const thread = page.getByTestId('thread-frame');
    await thread.getByText(label, { exact: true }).first().waitFor();
    if (icon) {
      await thread.getByTestId(/^more-thread-menu-/).first().click();
      await page.getByRole('menuitem', { name: 'Copy @' + handle, exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '@' + handle);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
