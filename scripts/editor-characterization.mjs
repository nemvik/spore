/**
 * Pre-refactor organism-editor characterization; run the SAME script afterwards.
 * Fixtures are deliberately prepared through Vite SSR or copied byte-for-byte
 * from a historical v2 export. The browser imports through Saves and edits only
 * with ordinary UI input. ?test=1 freezes simulation; no browser state is set.
 * LUMAVORA_URL=http://127.0.0.1:5180 EDITOR_OUTPUT=evidence/era-p2/editor-before
 *   node scripts/editor-characterization.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-p0-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-p0-browsers';
const { chromium } = await import('playwright');
const url = new URL(process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5180'); url.searchParams.set('test', '1');
const output = path.resolve(process.env.EDITOR_OUTPUT ?? 'evidence/era-p2/editor-characterization');
const historicalPath = path.resolve('tests/fixtures/saves/legacy-initial.fixture.json');
const digest = value => createHash('sha256').update(value).digest('hex');
const started = new Date(), results = [], errors = [], externalRequests = [], timeline = [];
await mkdir(output, { recursive: true });
const fixtures = {}, provenance = [];
let parseGame;
const ssr = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const { createGame, makeCheckpoint } = await ssr.ssrLoadModule('/src/game/simulation.ts');
  const { createWorld } = await ssr.ssrLoadModule('/src/game/world.ts');
  const { initializeJourneyStage } = await ssr.ssrLoadModule('/src/game/journey.ts');
  const persistence = await ssr.ssrLoadModule('/src/game/persistence.ts');
  parseGame = persistence.parseGame;
  for (const stage of [0, 1]) {
    const state = createGame(481516, false, true, true);
    state.id = `prepared-editor-journey-${stage}`;
    if (stage === 1) {
      state.stage = stage; state.world = createWorld(state.seed, stage); state.worlds[stage] = state.world;
      initializeJourneyStage(state);
      state.player.pos = { ...state.world.landmarks[0].pos };
      state.player.totalDna = 160; state.player.dna = 160;
    }
    makeCheckpoint(state);
    const bytes = persistence.serializeGame(state);
    assert.deepEqual(parseGame(bytes), state);
    const name = `journey-${stage}`;
    fixtures[name] = path.join(output, `${name}.fixture.json`);
    await writeFile(fixtures[name], bytes);
    provenance.push({ name, stage, sha256: digest(bytes), preparation: stage === 0
      ? 'Current createGame(481516,false,true,true), initial 22-body allocation + 14 learned DNA. No earned progression.'
      : 'Prepared current Journey reef via createWorld + initializeJourneyStage, initial body at nest, 160 learned DNA. No earned progression.' });
  }
  const historical = await readFile(historicalPath, 'utf8');
  assert.equal(digest(historical), '31a7ab3de8bf37bb24815e133d58de63ed41a0f6dabc09029fb1459a1d9e3a34');
  assert.equal(JSON.parse(historical).version, 2); assert.equal(parseGame(historical).journey.legacy, true);
  fixtures.legacy = path.join(output, 'historical-v2.fixture.json'); await writeFile(fixtures.legacy, historical);
  provenance.push({ name: 'legacy', source: path.relative(process.cwd(), historicalPath), sha256: digest(historical),
    preparation: 'Unchanged byte copy of real pre-P0 v2 export, itself an initial legacy game (tick 0), not a played campaign.' });
} finally { await ssr.close(); }
const sources = {};
for (const file of ['scripts/editor-characterization.mjs', 'src/main.ts', 'src/game/genome.ts', 'src/game/journey-evolution.ts', 'src/render/renderer.ts']) sources[file] = digest(await readFile(file));
await writeFile(path.join(output, 'provenance.json'), JSON.stringify({ provenance, sources, input: 'normal UI only', simulation: 'DEV test=1; no advanceTime, simulation-state writes, or internal editor calls', knownBehavior: ['An organ click with no drag creates one undo entry.', 'No-op scalar input creates none.', 'Filter+jaw may coexist in the draft; confirm is disabled.', 'Tab opens the editor from game; Escape cancels when focus is not in an input.', 'Undo/redo keep an existing selected ID after remove; selection is not itself an undo transaction.'] }, null, 2));
await writeFile(path.join(output, 'FIXTURE.md'), '# Organism editor characterization\n\nPrepared UI regression, not an earned campaign or play-duration measurement. Current Journey stage 0 has its exact initial 36 DNA capacity; prepared stage 1 has 182 DNA capacity. Historical v2 is a byte-identical initial legacy export with provenance.json hashes. The test imports all fixtures through the real Saves UI. Read-only render_game_to_text observations inspect drafts, and downloaded UI exports verify the full committed state and checkpoint. Manual simulation mode freezes time; no browser state or internal editor method is written or called. The same script and assertions must run after the shared-editor refactor.\n');

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
context.on('page', page => {
  page.on('pageerror', e => errors.push({ kind: 'pageerror', message: e.message, stack: e.stack }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', message: m.text() }); });
  page.on('request', r => { if (!r.url().startsWith(url.origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externalRequests.push(r.url()); });
});
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function frames(page, count = 2) { for (let i = 0; i < count; i++) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))); }
async function action(page, name) {
  timeline.push({ action: name }); await page.locator(`[data-action="${name}"]`).first().click(); await frames(page);
}
async function key(page, value) { timeline.push({ key: value }); await page.keyboard.press(value); await frames(page); }
async function capture(page, name) {
  await frames(page); const file = path.join(output, `${name}.png`); await page.screenshot({ path: file });
  await writeFile(path.join(output, `${name}.json`), JSON.stringify(await read(page), null, 2));
  return path.relative(process.cwd(), file);
}
async function load(page, name) {
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await action(page, 'saves'); await page.locator('#import-save').setInputFiles(fixtures[name]);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); await frames(page);
  timeline.push({ import: name }); return read(page);
}
async function open(page) {
  await key(page, 'Tab'); assert.equal((await read(page)).mode, 'editor');
  assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true);
  assert.equal(await page.locator('[data-action="redo"]').isDisabled(), true);
}
async function blur(page) { await page.locator('.editor-right > .eyebrow').click(); await frames(page); }
async function cancel(page) { await blur(page); await key(page, 'Escape'); assert.equal((await read(page)).mode, 'game'); }
async function resetEditor(page) { await cancel(page); await open(page); }
async function quote(page, cost, available) {
  assert.equal((await read(page)).editor.cost, cost);
  assert.equal((await page.locator('.editor-footer .cost').innerText()).replace(/\s+/g, ' ').trim(), `${cost} / ${available} DNA`);
}
async function exportState(page, name) {
  if ((await read(page)).mode === 'game') await key(page, 'Escape');
  if ((await read(page)).mode === 'pause') await action(page, 'saves');
  const pending = page.waitForEvent('download'); await action(page, 'export');
  const file = path.join(output, `${name}.export.json`); await (await pending).saveAs(file);
  const bytes = await readFile(file, 'utf8'), state = parseGame(bytes);
  await action(page, 'close'); assert.equal((await read(page)).mode, 'game');
  return state;
}
async function scenario(name, task) {
  const page = await context.newPage(); const begin = performance.now();
  try { const detail = await task(page); results.push({ name, status: 'passed', seconds: (performance.now() - begin) / 1000, ...detail }); console.log(`PASS ${name}`); }
  catch (error) {
    const screenshot = await capture(page, `${name}-failure`).catch(() => null);
    results.push({ name, status: 'failed', error: error.message, stack: error.stack, screenshot }); console.error(`FAIL ${name}: ${error.message}`);
  } finally { await page.mouse.up().catch(() => {}); await page.close(); }
}

try {
  await scenario('journey-exact-budget-validation-cancel', async page => {
    await load(page, 'journey-0'); const before = await exportState(page, 'journey-before-cancel');
    await open(page); await quote(page, 22, 36);
    await action(page, 'add:eyes'); await quote(page, 34, 36);
    assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), false);
    await action(page, 'add:shell'); await quote(page, 52, 36);
    assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), true);
    const budget = await capture(page, '01-current-over-budget');
    await action(page, 'undo'); await action(page, 'undo'); await quote(page, 22, 36);
    await action(page, 'add:jaw');
    const invalid = (await read(page)).editor.draft;
    assert.ok(invalid.parts.some(p => p.kind === 'filter') && invalid.parts.some(p => p.kind === 'jaw'));
    assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), true);
    assert.match(await page.locator('.editor-validation').innerText(), /filtr|čelist/i);
    const forbidden = await capture(page, '02-filter-jaw-blocked');
    await cancel(page);
    assert.deepEqual(await exportState(page, 'journey-after-cancel'), before, 'Escape/cancel must preserve the entire committed save');
    return { screenshots: [budget, forbidden], exactQuotes: [[22, 36], [34, 36], [52, 36]], verified: ['no legacy +6 fee', 'over-budget rejection', 'filter+jaw confirm blocked', 'Tab and Escape', 'full-state cancel'] };
  });

  await scenario('journey-input-history-transactions', async page => {
    await load(page, 'journey-1'); await open(page); const initial = (await read(page)).editor.draft;
    const slider = page.locator('[data-genome="width"]'); await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width * .36, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .84, box.y + box.height / 2, { steps: 18 }); await frames(page);
    const during = (await read(page)).editor.draft;
    assert.ok(during.width > initial.width); assert.equal(await page.locator('[data-action="undo"]').isDisabled(), false);
    await page.mouse.up(); await frames(page); const changed = (await read(page)).editor.draft;
    await action(page, 'undo'); assert.deepEqual((await read(page)).editor.draft, initial);
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, 'One long slider drag must create exactly one transaction');
    await action(page, 'redo'); assert.deepEqual((await read(page)).editor.draft, changed);
    await action(page, 'undo');
    await page.locator('[data-genome="name"]').fill(''); await page.keyboard.type(`${initial.name} Nova`, { delay: 25 });
    assert.equal((await read(page)).editor.draft.name, `${initial.name} Nova`);
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), false);
    assert.equal(await page.locator('[data-action="redo"]').isDisabled(), true, 'Pending input must already invalidate redo');
    await action(page, 'undo'); assert.deepEqual((await read(page)).editor.draft, initial);
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, 'All typed characters must undo together');
    await action(page, 'redo'); assert.equal((await read(page)).editor.draft.name, `${initial.name} Nova`);
    assert.equal((await read(page)).editor.draft.width, initial.width, 'The discarded width redo must not be reachable');
    assert.equal(await page.locator('[data-action="redo"]').isDisabled(), true);
    await resetEditor(page);
    await page.locator('[data-genome="name"]').fill(initial.name); await blur(page);
    await page.locator('[data-genome="width"]').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await blur(page);
    assert.deepEqual((await read(page)).editor.draft, initial);
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, 'No-op input and a net-zero focused edit must not create history');
    await page.locator('[data-genome="name"]').fill('Two fields');
    await page.locator('[data-genome="width"]').focus(); await page.keyboard.press('ArrowRight'); await blur(page);
    await action(page, 'undo'); assert.equal((await read(page)).editor.draft.name, 'Two fields'); assert.equal((await read(page)).editor.draft.width, initial.width);
    await action(page, 'undo'); assert.deepEqual((await read(page)).editor.draft, initial);
    const image = await capture(page, '03-current-input-history');
    await resetEditor(page);
    for (let i = 1; i <= 41; i++) { await page.locator('[data-genome="name"]').fill(`History ${i}`); await blur(page); }
    for (let i = 0; i < 40; i++) await action(page, 'undo');
    assert.equal((await read(page)).editor.draft.name, 'History 1');
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, 'Committed history must retain exactly the latest 40 changes');
    await cancel(page);
    return { screenshots: [image], verified: ['pointer slider one transaction', 'typed field one transaction', 'pending undo', 'new edit clears redo', 'no-op input', 'separate field transactions', 'history limit 40'] };
  });

  await scenario('journey-symmetry-selection-allocation-confirm', async page => {
    const before = await load(page, 'journey-1'); await open(page); await quote(page, 22, 182);
    await action(page, 'add:fins'); const finId = (await read(page)).editor.selected;
    await quote(page, 48, 182); assert.equal((await read(page)).editor.draft.parts.find(p => p.id === finId).mirrored, true);
    await page.locator('[data-part="mirrored"]').uncheck(); await frames(page); await quote(page, 38, 182);
    await action(page, 'undo'); await quote(page, 48, 182); await action(page, 'redo'); await quote(page, 38, 182);
    const draft = (await read(page)).editor.draft;
    await action(page, 'remove'); const fallback = (await read(page)).editor.selected;
    assert.equal(fallback, before.player.genome.parts.at(-1).id);
    await action(page, 'undo'); assert.deepEqual((await read(page)).editor.draft, draft);
    assert.equal((await read(page)).editor.selected, fallback, 'Undo restores the part but keeps an existing selection');
    await action(page, 'redo'); assert.equal((await read(page)).editor.draft.parts.some(p => p.id === finId), false);
    assert.equal((await read(page)).editor.selected, fallback);
    await action(page, 'undo'); await action(page, `select:${finId}`);
    await page.locator('[data-part="mirrored"]').check(); await frames(page); await quote(page, 48, 182);
    await action(page, 'medium:2'); assert.equal((await read(page)).stage, 1); await quote(page, 48, 182);
    assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), false, 'Land preview must not change the real reef validation stage');
    await action(page, 'medium:1'); await action(page, 'preview:move'); await action(page, 'preview:idle');
    const expected = (await read(page)).editor.draft, image = await capture(page, '04-current-paired-fin-confirm');
    await action(page, 'confirm-editor');
    const after = await exportState(page, 'current-confirmed');
    assert.deepEqual(after.player.genome, expected); assert.equal(after.player.dna, 134); assert.equal(after.player.totalDna, 160);
    assert.equal(after.player.generation, before.player.generation + 1); assert.equal(after.campaign.stageReproductions, before.campaign.stageReproductions + 1);
    assert.deepEqual(JSON.parse(after.checkpoint).player.genome, expected); assert.equal(JSON.parse(after.checkpoint).player.dna, 134);
    await page.reload({ waitUntil: 'networkidle' }); await action(page, 'saves'); await action(page, `load:${after.id}`);
    assert.deepEqual((await read(page)).player.genome, expected); await open(page); await action(page, `select:${finId}`); await action(page, 'remove');
    await quote(page, 22, 182); await action(page, 'confirm-editor');
    const reallocated = await exportState(page, 'current-reallocated');
    assert.equal(reallocated.player.dna, 160); assert.equal(reallocated.player.totalDna, 160);
    assert.deepEqual(reallocated.player.genome, before.player.genome);
    return { screenshots: [image], verified: ['paired fin 26 DNA', 'single fin 16 DNA', 'symmetry undo/redo', 'selection after remove/undo/redo', 'preview preserves real stage', 'exact commit allocation', 'checkpoint and reload', 'removal restores allocation without minting knowledge'] };
  });

  await scenario('journey-no-op-organ-click', async page => {
    await load(page, 'journey-1'); await open(page); const original = (await read(page)).editor.draft;
    let point = null;
    for (let y = 360; y <= 640 && !point; y += 25) for (let x = 480; x <= 1080 && !point; x += 25) {
      await page.mouse.click(x, y);
      if (!await page.locator('[data-action="undo"]').isDisabled()) point = { x, y };
    }
    assert.ok(point, 'A visible organ must be reachable by the actual canvas raycast');
    assert.deepEqual((await read(page)).editor.draft, original, 'A stationary organ click must not move it');
    await action(page, 'undo'); assert.deepEqual((await read(page)).editor.draft, original);
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, 'Known pre-refactor behavior: one stationary organ click creates one no-op history entry');
    const image = await capture(page, '05-current-no-op-organ-click'); await cancel(page);
    return { point, screenshots: [image], verified: ['real canvas raycast', 'stationary organ click creates one no-op history entry'] };
  });

  await scenario('historical-v2-editor-export-reload', async page => {
    const before = await load(page, 'legacy'); await open(page); await quote(page, 6, 14);
    await page.locator('[data-genome="name"]').fill('Luma v2 preserved'); await blur(page); await quote(page, 6, 14);
    const expected = (await read(page)).editor.draft, image = await capture(page, '06-historical-v2-editor');
    await action(page, 'confirm-editor'); const saved = await exportState(page, 'historical-confirmed');
    assert.equal(saved.version, 3); assert.deepEqual(saved.player.genome, expected); assert.equal(saved.player.dna, 8);
    assert.equal(saved.player.totalDna, before.player.totalDna); assert.equal(saved.player.generation, before.player.generation + 1);
    assert.deepEqual(JSON.parse(saved.checkpoint).player.genome, expected);
    assert.deepEqual(Object.keys(saved.player.genome).sort(), ['version', 'name', 'length', 'width', 'hue', 'pattern', 'parts'].sort());
    await page.reload({ waitUntil: 'networkidle' }); await action(page, 'saves'); await action(page, `load:${saved.id}`);
    assert.deepEqual((await read(page)).player.genome, expected);
    assert.deepEqual(await exportState(page, 'historical-reloaded'), saved);
    return { screenshots: [image], verified: ['actual v2 import', 'legacy +6 reproduction fee', 'compatible exact genome keys', 'checkpoint genome', 'save reload preserves complete committed state'] };
  });
} finally {
  if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({ path: path.join(output, 'trace.zip') }); await browser.close();
  const passed = results.every(r => r.status === 'passed') && errors.length === 0 && externalRequests.length === 0;
  await writeFile(path.join(output, 'timeline.json'), JSON.stringify(timeline, null, 2));
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, started: started.toISOString(), finished: new Date().toISOString(), results, errors, externalRequests, sourceHashes: sources }, null, 2));
  console.log(JSON.stringify({ passed, scenarios: results.length, failed: results.filter(r => r.status !== 'passed').map(r => r.name), errors: errors.length, externalRequests: externalRequests.length, output }, null, 2));
  if (!passed) process.exitCode = 1;
}
