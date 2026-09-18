/** Targeted UI regression. Prepared encounters are imports, not earned progression. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/private/tmp/lumavora-p0-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-p0-browsers';
const { chromium } = await import('playwright');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5181';
const output = path.resolve(process.env.FEEDBACK_OUTPUT ?? 'evidence/player-feedback/browser');
await mkdir(output, { recursive: true });
const fixtures = {}, errors = [], results = [];
const ssr = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
let parseGame;
try {
  const { createGame, makeCheckpoint } = await ssr.ssrLoadModule('/src/game/simulation.ts');
  const { createWorld } = await ssr.ssrLoadModule('/src/game/world.ts');
  const { initializeJourneyStage } = await ssr.ssrLoadModule('/src/game/journey.ts');
  const persistence = await ssr.ssrLoadModule('/src/game/persistence.ts'); parseGame = persistence.parseGame;
  for (const scenario of ['garden', 'oxygen']) {
    const s = createGame(67, false, true, true, true); s.id = `feedback-${scenario}`;
    if (scenario === 'garden') s.player.pos = { ...s.journey.sites[0].source };
    else {
      s.stage = 1; s.world = createWorld(67, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
      s.player.pos = { x: -60, y: 6, z: -60 }; s.player.oxygen = 22;
    }
    makeCheckpoint(s);
    fixtures[scenario] = path.join(output, `${scenario}.fixture.json`);
    await writeFile(fixtures[scenario], persistence.serializeGame(s));
  }
} finally { await ssr.close(); }
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const action = name => page.locator(`[data-action="${name}"]`).first().click();
async function frame() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function shot(name) { await frame(); await page.screenshot({ path: path.join(output, `${name}.png`) }); }
async function range(key, value) {
  const input = page.locator(`[data-spine="${key}"]`); await input.focus();
  await input.press('Home'); const minimum = Number(await input.getAttribute('min'));
  for (let i = 0; i < Math.round((value - minimum) / .05); i++) await input.press('ArrowRight');
  await page.locator('.editor-right > .eyebrow').click(); await frame();
}
async function importFixture(file) {
  await page.goto(`${base}/?test=1`); await action('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
}
try {
  await page.goto(`${base}/?test=1`); await page.locator('#seed').fill('67'); await action('new');
  assert.equal((await read()).seed, 67); assert.match(await page.locator('#requirements').innerText(), /1 · Prozkoumej/i);
  assert.equal(await page.locator('#oxygen-wrap').isVisible(), false); await shot('seed-67-first-step');
  await page.keyboard.press('Tab'); assert.equal((await read()).mode, 'editor');
  const baseline = (await read()).editor.draft;
  for (const preset of ['pear', 'ray', 'arch']) {
    await action(`spine-preset:${preset}`); const changed = (await read()).editor.draft;
    assert.equal(changed.spine.length, 7); assert.notDeepEqual(changed, baseline);
    await action('undo'); assert.deepEqual((await read()).editor.draft, baseline);
    await action('redo'); assert.deepEqual((await read()).editor.draft, changed);
    if (preset === 'pear') await shot('body-pear');
    await action('spine-preset:original'); assert.deepEqual((await read()).editor.draft, baseline);
  }
  await action('spine-preset:arch'); await action('spine-select:4');
  await range('width', 1.6); await range('height', .55); await range('bend', .45);
  const custom = (await read()).editor.draft;
  assert.deepEqual(custom.spine[4], { width: 1.6, height: .55, bend: .45 });
  await action('undo'); assert.equal((await read()).editor.draft.spine[4].bend, .4);
  await action('redo'); assert.deepEqual((await read()).editor.draft, custom);
  await action('preview:move'); await shot('body-custom');
  await page.setViewportSize({ width: 1280, height: 720 }); await shot('body-compact');
  assert.ok(await page.locator('[data-action="confirm-editor"]').isVisible());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await action('confirm-editor'); assert.equal((await read()).mode, 'game');
  assert.deepEqual((await read()).player.genome, custom);
  await page.keyboard.down('w'); await page.evaluate(() => window.advanceTime(500)); await page.keyboard.up('w'); await shot('body-in-world');
  await page.keyboard.press('Escape'); await action('saves');
  const downloaded = page.waitForEvent('download'); await action('export'); const download = await downloaded;
  const save = path.join(output, 'custom-body.save.json'); await download.saveAs(save);
  assert.deepEqual(parseGame(await readFile(save, 'utf8')).player.genome, custom);
  await importFixture(save); assert.deepEqual((await read()).player.genome, custom);
  await page.keyboard.press('Tab'); assert.deepEqual((await read()).editor.draft, custom);
  await action('spine-preset:ray'); await action('cancel-editor'); assert.deepEqual((await read()).player.genome, custom);
  results.push({ scenario: 'new seed 67 and body editor', passed: true, checks: '3 presets, 7 segments, independent sliders, grouped undo/redo, moving preview, confirm, actual movement, export/import, cancel' });

  await importFixture(fixtures.garden);
  await action('tend'); await page.evaluate(() => window.advanceTime(1000));
  assert.match(await page.locator('#requirements').innerText(), /2 · Odeber/i);
  await action('tend'); await page.evaluate(() => window.advanceTime(1000));
  assert.match(await page.locator('#requirements').innerText(), /3 · Zasaď/i); assert.equal((await read()).cargo.purpose, 'culture');
  await shot('garden-carry-step');
  const target = (await read()).journeyGuide.target;
  // Move through actual camera-relative keys and collisions, only DEV time is stepped.
  for (let i = 0; i < 70; i++) {
    const s = await read(), p = s.player.pos, dx = target.x - p.x, dz = target.z - p.z;
    if (Math.hypot(dx, dz) < 2.5) break;
    const keys = [Math.abs(dx) > 1 ? dx > 0 ? 'd' : 'a' : null, Math.abs(dz) > 1 ? dz > 0 ? 's' : 'w' : null].filter(Boolean);
    for (const key of keys) await page.keyboard.down(key);
    await page.evaluate(() => window.advanceTime(200));
    for (const key of keys) await page.keyboard.up(key);
  }
  const arrived = (await read()).player.pos;
  assert.ok(Math.hypot(arrived.x - target.x, arrived.z - target.z) < 3.7, 'Reach the marked refuge through actual movement');
  await action('tend'); await page.evaluate(() => window.advanceTime(100));
  assert.equal((await read()).cargo, null);
  assert.match(await page.locator('#requirements').innerText(), /4 · Přiveď|Pokračuj/i); await shot('garden-planted-step');
  results.push({ scenario: 'prepared garden, then real T inputs and movement', passed: true, target });

  await importFixture(fixtures.oxygen); await page.evaluate(() => window.advanceTime(500));
  assert.match(await page.locator('#oxygen-wrap').innerText(), /ZÁSOBA DECHU/);
  assert.match(await page.locator('#oxygen-help').innerText(), /Drž Q/); await shot('oxygen-low');
  await page.keyboard.down('q'); await page.evaluate(() => window.advanceTime(3000)); await page.keyboard.up('q');
  assert.match(await page.locator('#oxygen-help').innerText(), /U hladiny dýcháš/);
  assert.ok((await read()).player.oxygen > 22); await shot('oxygen-refill');
  results.push({ scenario: 'prepared low breath reef, Q to surface', passed: true, oxygen: (await read()).player.oxygen });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, results, errors, limitation: 'DEV stepped UI regression; source and reef are prepared fixtures, not an earned full campaign.' }, null, 2));
  console.log(JSON.stringify({ passed: true, results, errors }, null, 2));
} catch (error) {
  await shot('failure'); await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), results, errors, state: await read() }, null, 2)); throw error;
} finally { await browser.close(); }
