/**
 * Deliberately prepared, validated saves: this is an interaction regression,
 * never campaign-duration evidence. The browser imports through the ordinary
 * UI, clicks rendered bodies/food, and holds Space under real animation frames.
 * Read-only diagnostics locate the moving mesh and establish causal outcomes.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import * as THREE from 'three';

if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const { chromium } = await import('playwright');
const URL = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:4184';
const OUTPUT = path.resolve(process.env.SELECTION_OUTPUT ?? 'evidence/quality/target-selection');
await mkdir(OUTPUT, { recursive: true });
const results = [], errors = [], timeline = [], started = new Date();
const ssr = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { createGame, makeCheckpoint } = await ssr.ssrLoadModule('/src/game/simulation.ts');
const { serializeGame, parseGame } = await ssr.ssrLoadModule('/src/game/persistence.ts');
const { cloneGenome, computeStats, genomeCost, initialGenome } = await ssr.ssrLoadModule('/src/game/genome.ts');
const { spawnCreature } = await ssr.ssrLoadModule('/src/game/world.ts');

function scene(name) {
  const s = createGame(481516, false); s.id = `fixture-selection-${name}`;
  s.player.genome = cloneGenome(s.player.genome);
  s.player.genome.name = 'Připravený lovec';
  s.player.genome.parts = s.player.genome.parts.filter(p => p.kind !== 'filter');
  s.player.genome.parts.push({ id: 'fixture-jaw', kind: 'jaw', axial: .9, angle: 0, scale: 1, mirrored: false });
  s.player.totalDna = 200; s.player.dna = genomeCost(initialGenome()) + 200 - genomeCost(s.player.genome);
  s.player.heading = 0; s.player.energy = 70; s.player.health = computeStats(s.player.genome).maxHealth;
  s.world.creatures = []; s.world.obstacles = [];
  // Required authored source identities remain intact; incidental food is isolated.
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.sourceId === r.id));
  return s;
}
function prey(s, x, health = 100) {
  const c = spawnCreature(s.world, 'veil', 0);
  Object.assign(c, { pos: { x, y: 1.1, z: 2 }, velocity: { x: .35, y: 0, z: 0 }, health, hunger: 0, fear: 0, cooldown: 20 });
  s.world.creatures.push(c); return c;
}
function food(s, x, z = 1, kind = 'meat') {
  const r = { id: s.world.nextId++, pos: { x, y: 1.1, z }, kind, amount: 4, max: 4, regen: 0, patch: 0 };
  s.world.resources.push(r); return r;
}
async function fixture(s, name) {
  makeCheckpoint(s); const text = serializeGame(s); parseGame(text);
  const file = path.join(OUTPUT, `${name}.fixture.json`); await writeFile(file, text); return file;
}
const hunt = scene('hunting'), hunted = prey(hunt, 2.4, 1), native = prey(hunt, -2.8), nearby = food(hunt, -2.0, 1.8);
const huntFile = await fixture(hunt, 'hunting');
const meal = scene('meal'), selectedMeal = food(meal, 2.7, 2), nearerMeal = food(meal, -1.7, 1.8), mealNative = prey(meal, -3.4);
const mealFile = await fixture(meal, 'meal');
await ssr.close();
await writeFile(path.join(OUTPUT, 'FIXTURES.md'), '# Deliberate target selection — prepared interaction regression\n\nTwo validated current-journey saves isolate a nearby moving grazer, a bystander and food. The hunter genome, DNA funding, one-health wounded prey, positions, initial velocity and absence of incidental encounters/scenery are deliberately prepared in Node. Authored culture source identities remain intact. Saves are imported using the normal file picker. All subsequent selection and feeding uses real LMB/Space input under native animation frames, with no advanceTime or browser world writes. Read-only diagnostics project the visible moving creature and verify IDs, health and portions. This does not measure natural hunting difficulty, campaign completion or campaign duration.\n');
if (process.argv.includes('--prepare-only')) { console.log('Validated both fixtures; no browser launched.'); process.exit(0); }

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1 });
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
page.on('pageerror', e => errors.push({ kind: 'pageerror', message: e.message }));
page.on('console', e => { if (e.type() === 'error') errors.push({ kind: 'console', message: e.text() }); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function shot(name) { await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) }); }
async function importFixture(file) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await page.locator('[data-action="saves"]').first().click();
  await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  timeline.push({ action: 'normal UI import', file: path.basename(file) });
  return read();
}
function screenPoint(s, position) {
  const camera = new THREE.PerspectiveCamera(48, 1536 / 960, .1, 260);
  camera.position.copy(s.camera.position); camera.lookAt(s.player.pos.x, s.player.pos.y + .5, s.player.pos.z); camera.updateMatrixWorld(true);
  const ndc = new THREE.Vector3(position.x, position.y, position.z).project(camera);
  return { x: (ndc.x + 1) * 768, y: (1 - ndc.y) * 480 };
}
async function clickIdentity(kind, id) {
  const before = await read(), entity = (kind === 'creature' ? before.world.creatures : before.world.resources).find(e => e.id === id);
  assert.ok(entity, `Visible ${kind} ${id} exists`);
  const point = screenPoint(before, entity.pos);
  await page.mouse.click(point.x, point.y);
  const after = await read(); timeline.push({ action: 'LMB rendered identity', kind, id, point, before, after });
  assert.deepEqual(after.feedSelection, { kind, id, stage: 0 });
  return after;
}
async function holdSpace(ms) {
  await page.keyboard.down('Space'); await page.waitForTimeout(ms); await page.keyboard.up('Space');
  const state = await read(); timeline.push({ action: 'Space', wallMs: ms, state }); return state;
}

let failure;
try {
  const imported = await importFixture(huntFile);
  const selected = await clickIdentity('creature', hunted.id);
  const moving = selected.world.creatures.find(c => c.id === hunted.id);
  assert.ok(Math.hypot(moving.pos.x - hunted.pos.x, moving.pos.z - hunted.pos.z) > 0, 'Clicked a creature that actually moved');
  assert.equal(selected.feedTarget.kind, 'prey'); assert.equal(selected.feedTarget.ready, true);
  assert.match(await page.locator('#interaction').innerText(), /Zaútočit/);
  assert.match(await page.locator('#interaction').innerText(), /vitalita 1/);
  await shot('01-moving-prey-selected');
  const killed = await holdSpace(1700);
  assert.equal(killed.player.kills, 1); assert.equal(killed.player.meals, 0);
  assert.equal(killed.world.creatures.find(c => c.id === native.id)?.health, 100);
  assert.equal(killed.world.resources.find(r => r.id === nearby.id)?.amount, 4);
  assert.equal(killed.feedTarget, null); assert.equal(killed.feedSelection.id, hunted.id);
  const corpse = killed.world.resources.find(r => r.id !== nearby.id && r.kind === 'meat');
  assert.ok(corpse); assert.equal(corpse.amount, 3);
  assert.match(await page.locator('#interaction').innerText(), /už není přítomen/);
  await shot('02-held-space-after-kill');
  results.push({ scenario: 'moving prey selection and held Space after death', passed: true, importedTick: imported.tick, selectedTick: selected.tick, finalTick: killed.tick, bystanderHealth: 100, meals: 0, untouchedCarcassPortions: 3 });

  await page.mouse.click(768, 235);
  const cleared = await read(); assert.equal(cleared.feedSelection, null);
  assert.equal(cleared.feedTarget.kind, 'food');
  const automatic = await holdSpace(550);
  assert.ok(automatic.player.meals >= 1); assert.equal(automatic.player.kills, 1);
  assert.equal(automatic.world.creatures.find(c => c.id === native.id)?.health, 100);
  await shot('03-empty-ground-restores-automatic');
  results.push({ scenario: 'empty ground restores nearest eligible action', passed: true, meals: automatic.player.meals, kills: automatic.player.kills });

  await importFixture(mealFile);
  const foodSelected = await clickIdentity('food', selectedMeal.id);
  assert.equal(foodSelected.feedTarget.kind, 'food'); assert.equal(foodSelected.feedTarget.ready, true);
  assert.match(await page.locator('#interaction').innerText(), /Jíst/);
  assert.match(await page.locator('#interaction').innerText(), /soust: 4/);
  assert.match(await page.locator('.compass .caption').innerText(), /Klik: vybrat cíl/);
  const fed = await holdSpace(220);
  assert.equal(fed.player.meals, 1); assert.equal(fed.world.resources.find(r => r.id === selectedMeal.id)?.amount, 3);
  assert.equal(fed.world.resources.find(r => r.id === nearerMeal.id)?.amount, 4);
  assert.equal(fed.world.creatures.find(c => c.id === mealNative.id)?.health, 100);
  await shot('04-selected-food-portions');
  results.push({ scenario: 'selected food identity and portions', passed: true, meals: 1, selectedPortions: 3, nearerFoodPortions: 4 });

  const yaw = fed.camera.yaw;
  await page.mouse.move(780, 300); await page.mouse.down({ button: 'right' }); await page.mouse.move(850, 320, { steps: 5 }); await page.mouse.up({ button: 'right' });
  const orbited = await read(); assert.notEqual(orbited.camera.yaw, yaw); assert.equal(orbited.feedSelection.id, selectedMeal.id);
  await page.keyboard.press('Escape'); await page.locator('[data-action="help"]').click();
  assert.match(await page.locator('.controls-grid').innerText(), /Levý klik/);
  assert.match(await page.locator('.controls-grid').innerText(), /Klik do volného prostoru/);
  await shot('05-selection-help');
  results.push({ scenario: 'RMB orbit preserves selection and help documents controls', passed: true });
  assert.deepEqual(errors, []);
} catch (e) { failure = { message: e.message, stack: e.stack }; await shot('failure'); }
finally {
  if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({ path: path.join(OUTPUT, 'selection.trace.zip') });
  await writeFile(path.join(OUTPUT, 'browser-results.json'), JSON.stringify({ disclosure: 'Prepared saves, actual LMB/Space, native RAF, read-only diagnostic projection. Not a campaign.', started: started.toISOString(), finished: new Date().toISOString(), url: URL, results, errors, failure: failure ?? null, timeline }, null, 2));
  await browser.close();
}
if (failure) { console.error(failure); process.exit(1); }
console.log(JSON.stringify({ results, errors }, null, 2));
