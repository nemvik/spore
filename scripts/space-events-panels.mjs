/** Short public-UI presentation check of exact played D3c exports. No state edits. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const root = path.resolve('evidence/sp-014d3c/browser'), out = path.join(root, 'presentation');
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(new URL(base).searchParams.has('test'), false);
const canonical = await readFile(path.join(root, 'active-campaign.save.json'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true }), results = [], errors = [];
try {
  for (const [file, panel, image] of [
    ['colony-explicitly-restored.save.json', 'space-economy', 'restored-colony-storage-1024.png'],
    ['active-campaign.save.json', 'space-events', 'returned-event-history-1024.png'],
  ]) {
    const bytes = await readFile(path.join(root, file)), source = JSON.parse(bytes).state;
    const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    try {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base); await page.locator('button[data-action="saves"]').click();
      await page.locator('#import-save').setInputFiles(path.join(root, file));
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
      assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
      const assets = await page.locator('script[type="module"][src]').evaluateAll(nodes => nodes.map(n => n.src));
      assert.ok(assets.some(url => url.endsWith('/assets/index-Cfpb0r0Z.js')));
      const open = async id => { if (await page.locator(`#${id}`).getAttribute('open') === null) await page.locator(`#${id} > summary`).click(); };
      if (!source.space.location) await open('space-dock');
      await open(panel); await page.locator(`#${panel}`).scrollIntoViewIfNeeded();
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.deepEqual(state.space.events.current, source.space.events.current);
      assert.deepEqual(state.space.economy.actions, source.space.economy.actions);
      assert.equal(state.space.economy.balance, source.space.economy.balance);
      assert.equal(state.space.ship.health, source.space.ship.health);
      const text = await page.locator(`#${panel}`).innerText();
      assert.match(text, panel === 'space-events' ? /Obnovené kolonie 1 · pirátská setkání 1 · výhry 1 · ústupy 0/ : /Výroba 2 ks \/ 10 s/);
      await page.screenshot({ path: path.join(out, image) });
      results.push({ file, sourceSha256: hash(bytes), panel, image, text, assets });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []); assert.equal(hash(await readFile(path.join(root, 'active-campaign.save.json'))), hash(canonical));
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ results, errors, canonicalSha256: hash(canonical), provenance: 'Unmodified played public exports, imported into separate empty browser contexts. Panels opened through normal controls; no setters or clock hooks.' }, null, 2));
} finally { await browser.close(); }
