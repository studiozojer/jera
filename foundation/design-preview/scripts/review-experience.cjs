// Run against the standalone preview. Uses the SDK's development browser package.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve(__dirname, '../../../tooling/exact2/node_modules/playwright-core'));
const output = path.resolve(__dirname, '../.exact/experience-review');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const at = id => page.locator(`[data-testid="${id}"]:visible`).last();
    const capture = name => page.screenshot({ path: path.join(output, `${name}.png`) });
    const canvas = () => page.locator('main').evaluate(e => getComputedStyle(e).backgroundColor);
    const expectCanvas = color => page.waitForFunction(color => getComputedStyle(document.querySelector('main')).backgroundColor === color, color);
    const choose = async mode => {
      await at(`experience-${mode}`).click();
      await page.waitForFunction(mode => document.querySelector(`[data-testid="experience-${mode}"]`)?.getAttribute('aria-checked') === 'true', mode);
      await expectCanvas(mode === 'private' ? 'rgb(9, 6, 4)' : 'rgb(26, 23, 20)');
    };
    await page.goto(process.env.JERA_PREVIEW_URL || 'http://127.0.0.1:3034/');
    await at('body-seed-2').waitFor();
    await expectCanvas('rgb(26, 23, 20)');
    await capture('public-feed-phone');
    await at('write').click();
    await page.waitForTimeout(600);
    for (const mode of ['private', 'public']) {
      const box = await at(`experience-${mode}`).boundingBox();
      assert(box.width >= 44 && box.height >= 44, `${mode} has a minimum 44px target`);
    }
    const composer = await at('composer').elementHandle();
    await at('composer').fill('A public draft ♍︎ ♍️ :virgo:');
    await capture('public-composer-phone');
    // Keyboard selection must preserve the same mounted editor and radio focus.
    await at('experience-public').focus();
    await page.keyboard.press('ArrowLeft');
    await expectCanvas('rgb(9, 6, 4)');
    assert(await composer.evaluate(e => e.isConnected));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'experience-private');
    assert.equal(await at('composer').inputValue(), '');
    await page.keyboard.press('End');
    await expectCanvas('rgb(26, 23, 20)');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'experience-public');
    assert.equal(await at('composer').inputValue(), 'A public draft ♍︎ ♍️ :virgo:');
    await page.keyboard.press('Home');
    await expectCanvas('rgb(9, 6, 4)');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'experience-private');
    assert(await composer.evaluate(e => e.isConnected));
    await capture('private-composer-keyboard');
    await at('composer').fill('A separate private draft');
    await page.mouse.click(5, 300); // Inspect without a keyboard-focus decoration.
    await capture('private-composer-phone');
    await at('cancel').click();
    await page.locator('[data-testid="composer"]').waitFor({ state: 'hidden' });
    assert(page.url().endsWith('/'));
    assert.equal(await at('body-seed-2').count(), 0);
    await at('body-seed-35').waitFor();
    const privateHeader = await at('reading-header').evaluate(e => getComputedStyle(e).backgroundColor);
    assert.equal(privateHeader, await canvas());
    const writeSurface = await at('write').evaluate(e => getComputedStyle(e).backgroundColor);
    assert.equal(writeSurface, await canvas());
    await capture('private-feed-phone');
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
      if (width === 1280) {
        const capFill = await at('reading-cap').locator('svg path').first().evaluate(e => getComputedStyle(e).fill);
        assert.equal(capFill, await canvas());
        await capture('private-feed-desktop');
      }
    }
    await at('write').click();
    await page.waitForTimeout(600);
    assert.equal(await at('composer').inputValue(), 'A separate private draft');
    await capture('private-composer-desktop');
    await choose('public');
    assert.equal(await at('composer').inputValue(), 'A public draft ♍︎ ♍️ :virgo:');
    await capture('public-composer-desktop');
    await at('cancel').click();
    await page.locator('[data-testid="composer"]').waitFor({ state: 'hidden' });
    await at('thread-seed-2').click();
    await at('reply-to-seed-3').click();
    await page.waitForTimeout(600);
    await at('composer').fill('Public reply remains with Kepler');
    await choose('private');
    assert.equal(await at('reply-context').count(), 1);
    assert.equal(await at('composer').inputValue(), 'Public reply remains with Kepler');
    await page.goBack();
    await page.waitForTimeout(600);
    assert(page.url().endsWith('/thread/seed-3'), 'Browser Back keeps the reply parent in the selected experience');
    await at('thread-body-seed-3').waitFor();
    assert.equal(await at('thread-experience').innerText(), 'Private');
    await at('back').click();
    await at('body-seed-35').waitFor();
    await at('write').click();
    await page.waitForTimeout(600);
    await at('composer').fill('A post from the private experience');
    await at('post').click();
    await at('thread-body-post-61').waitFor();
    assert.equal(await at('thread-experience').innerText(), 'Private');
    await capture('private-posted-desktop');
    await at('back').click();
    assert(page.url().endsWith('/'));
    await at('body-post-61').waitFor();
    const result = { passed: true, publicCanvas: 'rgb(26, 23, 20)', privateCanvas: privateHeader, keyboardFocus: 'experience-private', composerRetained: true, nativeHostSurfaces: 'unverified' };
    fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
