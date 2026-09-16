/**
 * Prepared-state P0 regression, not an earned campaign playthrough.
 * Vite SSR prepares a valid current-journey coastal victory as an inheritance
 * reference. The browser imports actual P0 v1 exports, using only normal UI.
 * New victory opt-in starts P1 v2 and is covered by the active-tribe scenario.
 * Run against pnpm dev: node scripts/era-browser.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const { chromium } = await import('playwright');
const BASE_URL = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5173';
const testUrl = new URL(BASE_URL); testUrl.searchParams.set('test', '1');
const OUTPUT = path.resolve(process.env.ERA_OUTPUT ?? 'evidence/quality/regression/era-browser');
const HISTORICAL = path.resolve('tests/fixtures/saves');
assert.notEqual(OUTPUT, HISTORICAL, 'Keep the original P0 evidence immutable; choose a different ERA_OUTPUT');
const started = new Date(), errors = [], requests = [], timeline = [], screenshots = [];
const sources = [];
const sha256 = text => createHash('sha256').update(text).digest('hex');
await mkdir(OUTPUT, { recursive: true });
const ssr = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
let prepared, parseGame;
try {
  const { createGame, makeCheckpoint, statsFor, continueToTribeEra } = await ssr.ssrLoadModule('/src/game/simulation.ts');
  const { createWorld } = await ssr.ssrLoadModule('/src/game/world.ts');
  const { initializeJourneyStage } = await ssr.ssrLoadModule('/src/game/journey.ts');
  const { genomeCost, initialGenome } = await ssr.ssrLoadModule('/src/game/genome.ts');
  const persistence = await ssr.ssrLoadModule('/src/game/persistence.ts');
  parseGame = persistence.parseGame;
  prepared = createGame(481516, false, true, true);
  prepared.id = 'prepared-era-current-journey';
  prepared.player.genome.name = 'Připravený náhled kmene';
  for (const stage of [1, 2]) {
    prepared.stage = stage;
    prepared.world = createWorld(prepared.seed, stage);
    prepared.worlds[stage] = prepared.world;
    initializeJourneyStage(prepared);
  }
  prepared.player.genome.parts.push(
    { id: 'era-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
    { id: 'era-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
    { id: 'era-symbiote', kind: 'symbiote', axial: -0.3, angle: 0, scale: 1, mirrored: false },
  );
  prepared.player.totalDna = 200;
  prepared.player.dna = genomeCost(initialGenome()) + prepared.player.totalDna - genomeCost(prepared.player.genome);
  prepared.player.health = statsFor(prepared.player.genome).maxHealth;
  prepared.player.pos = { ...prepared.world.landmarks[0].pos };
  prepared.player.velocity = { x: 0, y: 0, z: 0 };
  prepared.player.bonds = [{ species: 'gloom', loyalty: 88, hunger: 12, benefit: 'recycle', age: 240 }];
  prepared.journey.cargo = { kind: 'nectar', purpose: 'culture', site: 8, vitality: 72, distance: 12 };
  Object.assign(prepared.campaign, { won: true, finale: 'restoration' });
  makeCheckpoint(prepared);
  const text = persistence.serializeGame(prepared);
  prepared = parseGame(text);
  await writeFile(path.join(OUTPUT, 'won-current-coast.fixture.json'), text);
  const currentEntry = parseGame(text);
  assert.equal(continueToTribeEra(currentEntry), true, 'The prepared coast must meet the explicit era-entry boundary');
  assert.equal(currentEntry.tribe.version, 2, 'Current opt-in must start the active tribe, not recreate P0');
  for (const [sourceName, fixtureName, members] of [
    ['tribe-preview.export.json', 'historical-tribe-preview.fixture.json', 0],
    ['populated-tribe.fixture.json', 'populated-tribe.fixture.json', 1],
  ]) {
    const sourcePath = path.join(HISTORICAL, sourceName), historicalText = await readFile(sourcePath, 'utf8');
    const envelope = JSON.parse(historicalText), historical = parseGame(historicalText);
    assert.equal(historical.stage, 3); assert.equal(historical.tribe.version, 1);
    assert.equal(historical.tribe.members.length, members);
    assertInherited(historical, sourceName);
    assert.equal(historical.lineage.filter(entry => entry.stage === 3).length, 1);
    assert.equal(JSON.parse(historical.checkpoint).tribe.version, 1);
    assert.deepEqual(parseGame(persistence.serializeGame(historical)), historical);
    await writeFile(path.join(OUTPUT, fixtureName), historicalText);
    sources.push({ sourcePath: path.relative(process.cwd(), sourcePath), sha256: sha256(historicalText), formatVersion: envelope.version, tribeVersion: historical.tribe.version, fixtureName, preparation: 'unchanged byte copy of historical P0 evidence from a prepared coastal victory; not an earned campaign' });
  }
} finally { await ssr.close(); }
await writeFile(path.join(OUTPUT, 'FIXTURE.md'), '# Historical P0 preview regression\n\nThe two v1 tribe fixtures are unchanged byte copies of actual P0 evidence. Those historical exports originated from a deliberately prepared current-journey coastal victory, not an earned campaign or campaign-duration measurement. The current preparation recreates that coastal inheritance and checks the era-entry boundary, then compares its worlds, journey, genome and bonds against the historical fixtures. Victory, DNA, land anatomy, a symbiotic partner and carried culture are prepared. Root dispersal and reef physiology are enabled. Current victory opt-in starts an active v2 tribe; this scenario deliberately imports the historical v1 preview instead and never rewrites a browser state. DEV advanceTime verifies that v1 stays frozen until explicit activation. After returning to the coast, the original v1 export is imported again to check retained history; this is not a fresh v1 era entry. Active P1 gameplay is tested separately.\n\n' + sources.map(source => `- ${source.sourcePath}: SHA256 ${source.sha256}; envelope v${source.formatVersion}, tribe v${source.tribeVersion}.\n`).join(''));
await writeFile(path.join(OUTPUT, 'fixture-provenance.json'), JSON.stringify({ sources }, null, 2));
if (process.argv.includes('--prepare-only')) {
  console.log('Validated the coastal entry boundary and historical P0 v1 preview copies; no browser launched.');
  process.exit(0);
}

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
page.on('pageerror', error => errors.push({ kind: 'pageerror', message: error.message, stack: error.stack }));
page.on('console', message => { if (message.type() === 'error') errors.push({ kind: 'console', message: message.text() }); });
page.on('request', request => {
  const url = request.url();
  if (!url.startsWith(testUrl.origin) && !url.startsWith('data:') && !url.startsWith('blob:')) requests.push(url);
});
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function frames(count = 3) {
  for (let i = 0; i < count; i++) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}
async function action(name) {
  timeline.push({ action: name });
  await page.locator(`[data-action="${name}"]`).first().click();
  await frames();
}
async function advance(ms) {
  await page.evaluate(async duration => window.advanceTime(duration), ms);
  await frames();
}
async function capture(name) {
  await frames();
  const filename = path.join(OUTPUT, `${name}.png`);
  await page.screenshot({ path: filename });
  screenshots.push(path.relative(process.cwd(), filename));
}
function unchangedState(summary) {
  const { stage, tick, player, campaign, world, tribe, deathReason } = summary;
  return { stage, tick, player, campaign, world, tribe, deathReason };
}
function inherited(state) {
  return { genome: state.player.genome, bonds: state.player.bonds, worlds: state.worlds, journey: state.journey };
}
function assertInherited(state, label) {
  assert.deepEqual(inherited(state), inherited(prepared), `${label}: inherited lineage or ecology changed`);
  assert.equal(state.world, state.worlds[2], `${label}: active coast alias was lost`);
  assert.equal(state.world.stage, 2);
  assert.equal(state.worlds.length, 3);
}
function assertCommand(summary) {
  assert.equal(summary.stage, 3);
  assert.equal(summary.mode, 'game');
  assert.equal(summary.controlModel, 'command');
  assert.equal(summary.deathReason, null);
  assert.deepEqual(summary.tribe, { version: 1, food: 0, members: [], huts: [], unlocked: [], neighbours: [] });
  assert.equal(summary.feedSelection, null);
  assert.equal(summary.feedTarget, null);
  assert.ok(Object.values(summary.camera.position).every(Number.isFinite), 'Camera position must remain finite');
}
async function exportState(name) {
  if ((await read()).mode === 'game') await action('pause');
  if ((await read()).mode === 'pause') await action('saves');
  const event = page.waitForEvent('download');
  await action('export');
  const download = await event;
  const filename = path.join(OUTPUT, `${name}.export.json`);
  await download.saveAs(filename);
  const text = await readFile(filename, 'utf8');
  assert.equal(JSON.parse(text).version, 3, 'UI export must use the current envelope version');
  return { state: parseGame(text), filename };
}

let result;
try {
  await page.goto(testUrl.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await action('saves');
  await page.locator('#import-save').setInputFiles(path.join(OUTPUT, 'won-current-coast.fixture.json'));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'won');
  const original = await read();
  assert.equal(original.stage, 2);
  assert.equal(original.controlModel, 'body');
  await capture('01-coastal-victory-opt-in');

  assert.equal(await page.locator('[data-action="continue-era"]').count(), 1, 'Victory must still offer explicit active-tribe opt-in');
  await action('menu');
  await action('saves');
  await page.locator('#import-save').setInputFiles(path.join(OUTPUT, 'historical-tribe-preview.fixture.json'));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  await advance(1000);
  assertCommand(await read());
  assert.equal(await page.locator('[data-action="found-tribe"]').count(), 1, 'Imported empty v1 must offer explicit activation');
  assert.equal(await page.locator('[data-action="return-coast"]').count(), 1, 'Imported empty v1 must retain safe return');
  assert.equal(await page.locator('.modal-backdrop').count(), 0, 'Victory modal reopened in the era');
  assert.equal(await page.locator('[data-action="feed"]').count(), 0, 'Body actions appeared in the command preview');
  await page.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text());
    return s.camera.position.y > s.player.pos.y + 20;
  });
  await capture('02-command-overview');
  const frozen = unchangedState(await read());
  for (const point of [[768, 480], [890, 540], [650, 600]]) {
    await page.mouse.click(...point);
    await advance(100);
    const clicked = await read();
    assertCommand(clicked);
    assert.deepEqual(unchangedState(clicked), frozen, 'A normal world click mutated the preview');
  }
  for (const key of ['Tab', 't', 'e', 'g', 'Space', 'r', 'x', 'w', 'a', 's', 'd']) {
    await page.keyboard.down(key); await advance(100); await page.keyboard.up(key);
    timeline.push({ key, simulatedMs: 100 });
    const after = await read();
    assertCommand(after);
    assert.deepEqual(unchangedState(after), frozen, `${key} mutated the command preview`);
  }
  await advance(60000);
  assert.deepEqual(unchangedState(await read()), frozen, 'The preview simulated body or world state');

  await page.mouse.move(768, 480);
  for (const [delta, zoom] of [[-10000, 18], [10000, 60]]) {
    await page.mouse.wheel(0, delta);
    await page.waitForFunction(value => JSON.parse(window.render_game_to_text()).camera.zoom === value, zoom);
    assertCommand(await read());
  }
  await page.mouse.wheel(0, (34 - 60) / .015);
  await frames();
  await action('save');
  const exported = await exportState('tribe-preview');
  assert.equal(exported.state.stage, 3); assertInherited(exported.state, 'Exported preview');
  assert.equal(JSON.parse(exported.state.checkpoint).stage, 3);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await action('saves');
  await action(`load:${exported.state.id}`);
  assertCommand(await read());
  const reloaded = await exportState('tribe-after-reload');
  assertInherited(reloaded.state, 'Reloaded preview');
  assert.equal(reloaded.state.stage, 3);

  await page.locator('#import-save').setInputFiles(exported.filename);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  assertCommand(await read());
  await capture('03-imported-command-overview');
  await action('return-coast');
  const coast = await read();
  assert.equal(coast.stage, 2); assert.equal(coast.mode, 'game'); assert.equal(coast.controlModel, 'body');
  assert.equal(coast.campaign.sandbox, true); assert.equal(coast.campaign.won, true);
  assert.equal(coast.tribe, undefined);
  assert.deepEqual(coast.player.genome, prepared.player.genome);
  assert.deepEqual(coast.player.bonds, prepared.player.bonds);
  await capture('04-returned-coastal-sandbox');
  const returned = await exportState('returned-coast');
  assertInherited(returned.state, 'Returned coast');
  assert.equal(returned.state.tribe, undefined);
  assert.equal(returned.state.lineage.some(entry => entry.stage > 2), false);
  assert.equal(JSON.parse(returned.state.checkpoint).stage, 2);
  await action('close');
  await action('pause');
  await capture('05-pause-opt-in');
  assert.equal(await page.locator('[data-action="continue-era"]').count(), 1, 'Returned coast must offer explicit active-tribe opt-in');
  await action('saves');
  await page.locator('#import-save').setInputFiles(exported.filename);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  assertCommand(await read());
  await advance(1000);
  assertCommand(await read());
  await capture('06-preview-after-reimport');
  const reentered = await exportState('tribe-after-reimport');
  assertInherited(reentered.state, 'Reimported preview');
  assert.equal(reentered.state.lineage.filter(entry => entry.stage === 3).length, 1);
  await page.locator('#import-save').setInputFiles(path.join(OUTPUT, 'populated-tribe.fixture.json'));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  const populated = await read();
  assert.equal(populated.stage, 3); assert.equal(populated.controlModel, 'command');
  assert.equal(populated.tribe.members.length, 1); assert.equal(populated.tribe.food, 25);
  assert.equal(await page.locator('[data-action="return-coast"]').count(), 0, 'A developed tribe offered a destructive return to coast');
  assert.equal(await page.locator('[data-action="found-tribe"]').count(), 0, 'A populated historical preview offered destructive replacement');
  await advance(1000);
  assert.deepEqual(unchangedState(await read()), unchangedState(populated));
  await capture('07-populated-tribe-no-return');
  assert.equal(errors.length, 0, `Browser errors: ${JSON.stringify(errors)}`);
  assert.equal(requests.length, 0, `External requests: ${JSON.stringify(requests)}`);
  result = { status: 'passed', verified: ['normal UI import of prepared current journey victory', 'victory offers explicit active-tribe opt-in', 'actual historical P0 v1 export imported without activation', 'explicit found-tribe and return-coast controls on empty v1', 'command controls and finite overhead camera', 'zoom limits 18–60', 'no body actions or simulation in P0 preview', 'UI save/export/reload/import', 'complete worlds, journey, genome and bonds retained', 'return to coastal sandbox removes preview history', 'historical reimport retains one preview lineage entry', 'populated historical preview hides destructive return and activation'] };
  console.log('PASS historical P0 v1 preview browser regression');
} catch (error) {
  await capture('failure').catch(() => {});
  result = { status: 'failed', error: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({ path: path.join(OUTPUT, 'era-browser.trace.zip') });
  for (const source of sources) {
    source.sha256After = sha256(await readFile(source.sourcePath, 'utf8'));
    source.unchanged = source.sha256After === source.sha256;
    if (!source.unchanged) { errors.push({ kind: 'fixture', message: `Historical source changed: ${source.sourcePath}` }); result = { status: 'failed', error: 'Historical fixture source changed' }; }
  }
  const report = { kind: 'historical P0 v1 preview regression from prepared-state evidence, not a campaign playthrough', freshCurrentCampaign: false, campaignRules: 'current journey with root dispersal and reef physiology', sources, browserStateWrites: 'none; all browser mutations use real UI controls', timeControl: 'DEV fixed stepping to verify frozen historical preview', startedAt: started.toISOString(), endedAt: new Date().toISOString(), url: testUrl.href, viewport: { width: 1536, height: 960 }, browser: browser.version(), result, screenshots, browserErrors: errors, externalRequests: [...new Set(requests)], timeline };
  await writeFile(path.join(OUTPUT, 'era-browser-results.json'), JSON.stringify(report, null, 2));
  await context.close(); await browser.close();
  if (errors.length || requests.length) process.exitCode = 1;
}
