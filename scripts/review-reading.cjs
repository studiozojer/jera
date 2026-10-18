// Synthetic browser review. Install Playwright separately or set PLAYWRIGHT_MODULE to an existing installation.
// No native typing/accessibility claim follows from this browser pass.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.JERA_PREVIEW_URL || "http://localhost:8091";
const out = ".local/design/foundation";
fs.mkdirSync(out, { recursive: true });
const reports = [];
const pass = (s) => {
  reports.push(s);
  console.log("PASS", s);
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const shown = (text, opts) =>
      page
        .getByText(text, opts)
        .and(page.locator(':not([aria-hidden="true"] *)'));
    await page.goto(base);
    await page.getByRole("heading", { name: "Feed", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/feed-stream.png` });
    await page
      .getByRole("button", { name: "Save post", exact: true })
      .first()
      .click();
    await page.getByRole("tab", { name: "Saved", exact: true }).click();
    await shown("Rowan", { exact: true }).waitFor();
    await page.reload();
    await shown("Rowan", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Unsave post", exact: true })
      .click();
    await shown("Keep a thought close").waitFor();
    pass("Bookmark survives reload; removing it shows the empty state");
    await page.getByRole("tab", { name: "Explore", exact: true }).click();
    await page.getByRole("textbox", { name: "Search posts" }).fill("attention");
    await shown("Room for the unfinished", { exact: true }).waitFor();
    assert.equal(await shown("Rowan", { exact: true }).count(), 0);
    await page
      .getByRole("textbox", { name: "Search posts" })
      .fill("no-result-123");
    await shown("Nothing here yet").waitFor();
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.screenshot({ path: `${out}/explore.png` });
    pass(
      "Shared search field retains filtering, clear and empty-result behavior",
    );
    await page.getByRole("button", { name: /Record playground/ }).click();
    const json = page.getByRole("textbox", { name: "Record JSON" });
    await json.fill("{invalid");
    assert(
      await page
        .getByRole("button", { name: "Add to local feed" })
        .isDisabled(),
    );
    const record = {
      $type: "studio.zojer.jera.note",
      title: "A test of new shapes",
      body: "This custom note arrived through the shared shell.",
      topics: ["experiment"],
      untouched: { count: 7 },
    };
    await json.fill(JSON.stringify(record, null, 2));
    await shown("A test of new shapes", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Add to local feed" }).click();
    await page
      .getByRole("button", { name: "Open post by You" })
      .first()
      .click();
    await page
      .getByRole("button", { name: "View record", exact: true })
      .click();
    await shown(/"untouched":/).waitFor();
    await page.screenshot({ path: `${out}/detail.png` });
    pass(
      "Custom-record preview and original fields survive shared composition",
    );
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Write", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Post text" });
    const exact = "Draft recovery :virgo: ♍︎ ♍️";
    await editor.fill(exact);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Write", exact: true }).click();
    await editor.waitFor();
    assert.equal(await editor.inputValue(), exact);
    await page.waitForFunction((length) => {
      const e = document.querySelector("textarea");
      return e && e.selectionStart === length && e.selectionEnd === length;
    }, exact.length);
    await editor.press("ArrowLeft");
    // ArrowLeft crosses a grapheme, not one UTF-16 unit: the final symbol includes FE0F.
    const lastGrapheme = [
      ...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(exact),
    ].at(-1).index;
    assert.equal(await editor.evaluate((e) => e.selectionStart), lastGrapheme);
    await page.getByRole("button", { name: "Add post", exact: true }).click();
    await shown(exact, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Write", exact: true }).click();
    await editor.waitFor();
    assert.equal(await editor.inputValue(), "");
    await editor.fill("Hello :vir");
    await page
      .getByRole("button", { name: "Zodiac symbols", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Insert Virgo symbol", exact: true })
      .click();
    assert.equal(await editor.inputValue(), "Hello ♍︎");
    assert.equal(
      await editor.evaluate((e) => e.selectionStart),
      "Hello ♍︎".length,
    );
    await page.getByRole("button", { name: "Add post", exact: true }).click();
    await shown("Hello ♍︎", { exact: true }).waitFor();
    await page.getByRole("button", { name: "virgo ×", exact: true }).waitFor();
    await page.screenshot({ path: `${out}/filtered.png` });
    await page.getByRole("button", { name: "virgo ×", exact: true }).click();
    pass(
      "Draft recovery, initial caret, user caret, exact symbol forms, post/clear and family reset",
    );
    await page.getByRole("button", { name: "Write", exact: true }).focus();
    await page.keyboard.press("Enter");
    await editor.waitFor();
    await page.getByRole("button", { name: "Add post", exact: true }).waitFor();
    assert(
      await page
        .getByRole("button", { name: "Add post", exact: true })
        .isDisabled(),
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    pass("Keyboard activates Write; empty draft cannot be submitted");

    // Clean context for comparable captures, separate from interaction fixtures above.
    const visual = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const v = await visual.newPage();
    v.on("pageerror", (e) => errors.push(e.message));
    for (const [name, url, width, height, scheme] of [
      ["feed-stream", "/", 390, 844, "light"],
      ["feed-cards", "/?layout=cards", 390, 844, "light"],
      ["feed-wide", "/", 1280, 900, "light"],
      ["feed-dark", "/", 390, 844, "dark"],
      ["feed-narrow", "/", 320, 740, "light"],
    ]) {
      await v.setViewportSize({ width, height });
      await v.emulateMedia({ colorScheme: scheme });
      await v.goto(base + url);
      await v.getByRole("heading", { name: "Feed", exact: true }).waitFor();
      await v.evaluate(() => document.fonts.ready);
      assert(
        await v.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} horizontal overflow`,
      );
      await v.screenshot({ path: `${out}/${name}.png` });
    }
    await v.setViewportSize({ width: 390, height: 844 });
    await v.goto(base + "/compose");
    await v
      .getByRole("textbox", { name: "Post text" })
      .fill("A little room for a new thought.\n\nWhat are you noticing today?");
    await v.screenshot({ path: `${out}/composer.png` });
    await v
      .getByRole("button", { name: "Zodiac symbols", exact: true })
      .click();
    await v.screenshot({ path: `${out}/composer-symbols.png` });
    // Browser-only live text enlargement smoke: does not simulate native Dynamic Type.
    await v.evaluate(() => {
      for (const e of document.querySelectorAll(
        '[dir="auto"], textarea, input',
      )) {
        const s = getComputedStyle(e);
        const size = parseFloat(s.fontSize),
          height = parseFloat(s.lineHeight);
        e.style.fontSize = `${size * 1.5}px`;
        if (height) e.style.lineHeight = `${height * 1.5}px`;
      }
    });
    await v.screenshot({ path: `${out}/composer-enlarged-web.png` });
    assert(
      await v.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    pass(
      "Captured stream/cards, 320/390/1280 layouts, dark mode, composer and browser text enlargement",
    );

    const legacy = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await legacy.addInitScript(() => {
      localStorage.setItem(
        "astrofeed.posts.v1",
        JSON.stringify([
          {
            id: "legacy",
            author: "You",
            text: "Legacy ♍️ stays exact",
            createdAt: "2026-10-07T12:00:00Z",
          },
        ]),
      );
      localStorage.setItem("astrofeed.draft.v1", "Existing draft :virgo:");
    });
    const old = await legacy.newPage();
    await old.goto(base);
    await old.getByText("Legacy ♍️ stays exact", { exact: true }).waitFor();
    await old.getByRole("button", { name: "Write", exact: true }).click();
    await old.getByRole("textbox", { name: "Post text" }).waitFor();
    assert.equal(
      await old.getByRole("textbox", { name: "Post text" }).inputValue(),
      "Existing draft :virgo:",
    );
    pass("Legacy posts and drafts remain readable");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      `${out}/verification.json`,
      JSON.stringify(
        { base, checkedAt: new Date().toISOString(), reports, errors },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
