/**
 * Targeted browser scenarios with openly prepared save fixtures.
 * This is NOT a fresh-game campaign playthrough and MUST NOT be used to measure
 * natural campaign duration. State preparation occurs in Node through Vite SSR;
 * the browser only imports saves through the real UI and uses normal controls.
 *
 * Start Vite separately, then: node scripts/fixtures-test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

// Respect an explicit registry; use the local benchmark cache only when present.
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const { chromium } = await import('playwright');
const BASE_URL = process.env.LUMAVORA_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.resolve(process.env.FIXTURES_OUTPUT ?? 'evidence/quality/regression/fixtures-test');
const started = new Date();
const results = [], errors = [], externalRequests = [], timeline = [];
await mkdir(OUTPUT, { recursive: true });
const ssr = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const simulation = await ssr.ssrLoadModule('/src/game/simulation.ts');
const persistence = await ssr.ssrLoadModule('/src/game/persistence.ts');
const genomeModule = await ssr.ssrLoadModule('/src/game/genome.ts');
const worldModule = await ssr.ssrLoadModule('/src/game/world.ts');
const { CHAPTERS } = await ssr.ssrLoadModule('/src/game/content.ts');
const { createGame, evolve, makeCheckpoint, tryTransition, statsFor } = simulation;
const { serializeGame, parseGame } = persistence;
const { cloneGenome } = genomeModule;
const { spawnCreature, surfaceY } = worldModule;

function addPart(genome, kind, overrides = {}) {
  const next = cloneGenome(genome);
  if (kind === 'jaw') next.parts = next.parts.filter(p => p.kind !== 'filter');
  next.parts.push({ id: `fixture-${kind}-${next.parts.length}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false, ...overrides });
  return next;
}
function fund(s) { s.player.dna = 1000; s.player.totalDna = Math.max(s.player.totalDna, 1000); }
function discover(s) {
  for (const p of s.world.patches) {
    p.discovered = true;
    const key = `${s.stage}:${p.id}`;
    if (!s.campaign.discoveries.includes(key)) s.campaign.discoveries.push(key);
    // Explicit prepared readiness, never evidence of earned field experience.
    const field = `field:${s.stage}:${p.id}:prepared-fixture`;
    if (!s.campaign.journals.some(j => j.startsWith(`field:${s.stage}:${p.id}:`))) s.campaign.journals.push(field);
  }
}
function reproduce(s, next = cloneGenome(s.player.genome)) {
  s.player.pos = { ...s.world.landmarks[0].pos };
  fund(s);
  const outcome = evolve(s, next);
  assert.equal(outcome.ok, true, `Fixture reproduction failed: ${outcome.errors.join(' ')}`);
}
function fixture(stage, name, parts = []) {
  const s = createGame(481516, true);
  s.id = `fixture-${name}`;
  s.player.genome.name = `Scénář ${name}`;
  // Prepared requirements are intentionally explicit, then public transitions apply
  // their normal world/lineage/checkpoint effects. They are not earned-play evidence.
  while (s.stage < stage) {
    let next = cloneGenome(s.player.genome);
    if (s.stage === 1) next = addPart(addPart(next, 'legs'), 'lungs');
    reproduce(s, next); reproduce(s);
    discover(s);
    s.campaign.stageMeals = CHAPTERS[s.stage].meals;
    s.player.meals += CHAPTERS[s.stage].meals;
    s.player.pos = { ...s.world.landmarks[1].pos };
    assert.equal(tryTransition(s), true, 'Prepared transition failed');
  }
  for (const part of parts) reproduce(s, addPart(s.player.genome, part));
  fund(s);
  s.player.pos = { ...s.world.landmarks[0].pos };
  s.player.velocity = { x: 0, y: 0, z: 0 };
  s.player.health = statsFor(s.player.genome).maxHealth;
  s.player.energy = 100;
  s.player.cooldown = 0;
  s.player.invulnerable = 5;
  s.messages = [];
  makeCheckpoint(s);
  return s;
}
function clearEncounter(s) {
  s.world.creatures = [];
  s.world.obstacles = [];
  s.world.resources = [];
  discover(s);
}
function addFood(s, kind = 'algae', amount = 8) {
  s.world.resources.push({ id: s.world.nextId++, kind, pos: { ...s.player.pos }, amount, max: amount, patch: 0, regen: 0 });
}
async function saveFixture(name, s) {
  makeCheckpoint(s);
  const text = serializeGame(s);
  parseGame(text);
  const filename = path.join(OUTPUT, `${name}.fixture.json`);
  await writeFile(filename, text);
  return filename;
}
const fixtures = {};
fixtures.editor = await saveFixture('editor', fixture(1, 'editor'));
fixtures.malformedControl = await saveFixture('import-control', fixture(0, 'import'));
const ecology = fixture(1, 'ekologie');
clearEncounter(ecology);
ecology.player.pos = { ...ecology.world.patches[0].center };
ecology.player.invulnerable = 0;
addFood(ecology, 'algae', 8);
ecology.world.resources[0].pos.x += 2;
ecology.world.resources[0].pos.z -= 2;
fixtures.ecology = await saveFixture('ecology', ecology);

const dying = fixture(0, 'obnova', ['eyes']);
clearEncounter(dying);
dying.world.patches[0].harvested = 4;
dying.world.patches[0].fertility = .85;
addFood(dying, 'detritus', 2);
makeCheckpoint(dying);
const deathExpected = { generation: dying.player.generation, genome: cloneGenome(dying.player.genome), fertility: dying.world.patches[0].fertility, harvested: dying.world.patches[0].harvested, resources: structuredClone(dying.world.resources) };
dying.player.pos = { x: 25, y: surfaceY(0, 25, 0), z: 0 };
dying.player.energy = 0;
dying.player.health = .1;
dying.player.invulnerable = 0;
fixtures.death = path.join(OUTPUT, 'starvation.fixture.json');
await writeFile(fixtures.death, serializeGame(dying)); // Retain viable generation checkpoint.
const restoration = fixture(2, 'obnova-pramenu');
clearEncounter(restoration);
for (const l of restoration.world.landmarks) if (l.kind === 'spring') l.charge = 9;
restoration.player.pos = { ...restoration.world.landmarks[2].pos };
restoration.player.invulnerable = 0;
fixtures.restoration = await saveFixture('restoration', restoration);
const symbiosis = fixture(2, 'symbioza', ['symbiote', 'reservoir']);
clearEncounter(symbiosis);
symbiosis.player.pos = { ...symbiosis.world.landmarks[1].pos };
for (let i = 0; i < 2; i++) {
  const c = spawnCreature(symbiosis.world, 'gloom', 0);
  c.pos = { x: symbiosis.player.pos.x + (i ? 1.6 : -1.6), y: symbiosis.player.pos.y, z: symbiosis.player.pos.z };
  c.hunger = 0; c.intent = 'rest'; c.velocity = { x: 0, y: 0, z: 0 };
  symbiosis.world.creatures.push(c);
}
addFood(symbiosis);
fixtures.symbiosis = await saveFixture('symbiosis', symbiosis);
const predator = fixture(2, 'rovnovaha', ['jaw']);
clearEncounter(predator);
predator.player.pos = { x: 0, y: surfaceY(2, 0, 0), z: 0 };
predator.campaign.stageKills = 11; predator.player.kills = 11;
const gnaw = spawnCreature(predator.world, 'gnaw', 0);
gnaw.pos = { x: 0, y: predator.player.pos.y, z: -1.5 };
gnaw.health = statsFor(predator.player.genome).damage * 1.5;
gnaw.hunger = 0; gnaw.intent = 'rest'; gnaw.velocity = { x: 0, y: 0, z: 0 };
predator.world.creatures.push(gnaw);
fixtures.predator = await saveFixture('predator', predator);
await ssr.close();
await writeFile(path.join(OUTPUT, 'FIXTURES.md'), `# Targeted legacy fixtures\n\nThese saves use legacy campaign rules and contain deliberately prepared state. They are **not evidence of reaching the stage from a fresh current-journey game**, and their runtime is **not natural campaign duration**.\n\nStage-entry meals, discoveries, niche-activity journal markers (field:<stage>:<patch>:prepared-fixture) and reproduction funding are deliberately prepared. Scenario actions themselves use ordinary controls.\n\n- Editor: aquatic stage, 1,000 fixture DNA for interaction coverage.\n- Starvation: healthy second-generation checkpoint, then prepared low health/zero energy away from the nursery.\n- Restoration: terrestrial stage, empty isolated encounters, each spring prepared at 9/10; actual movement and paid tending finish them.\n- Symbiosis: terrestrial stage, two available partner NPCs and food at the migration destination; real bonding, feeding and 120 seconds of fixed-step upkeep precede migration.\n- Predator: terrestrial stage, 11 prior invasive kills prepared; the final invasive is attacked through ordinary controls.\n\nFixtures are generated by this script through Vite SSR, checked by the production save validator, and imported through the normal browser file input. The browser does not write player, genome, stage, health or world state directly.\n`);

if (process.argv.includes('--prepare-only')) { console.log(`Validated ${Object.keys(fixtures).length} prepared save fixtures; no browser launched.`); process.exit(0); }

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1 });
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
context.on('page', page => {
  page.on('pageerror', error => errors.push({ page: page.url(), message: error.message, stack: error.stack }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ page: page.url(), message: message.text(), kind: 'console' }); });
  page.on('request', request => { if (!request.url().startsWith(BASE_URL) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) externalRequests.push(request.url()); });
});
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function waitFrames(page, frames = 3) {
  for (let i = 0; i < frames; i++) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}
async function action(page, name) {
  timeline.push({ at: new Date().toISOString(), action: name });
  await page.locator(`[data-action="${name}"]`).first().click();
  await waitFrames(page);
}
async function advance(page, ms) {
  await page.evaluate(async duration => { await window.advanceTime(duration); }, ms);
  await waitFrames(page, 1);
}
async function press(page, key, ms = 34) {
  await page.keyboard.down(key);
  await advance(page, ms);
  await page.keyboard.up(key);
  timeline.push({ at: new Date().toISOString(), key, simulatedMs: ms });
}
async function screenshot(page, name) {
  await waitFrames(page);
  const filename = path.join(OUTPUT, `${name}.png`);
  await page.screenshot({ path: filename });
  return path.relative(process.cwd(), filename);
}
async function importFixture(page, name) {
  await page.goto(`${BASE_URL}/?test=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await action(page, 'saves');
  await page.locator('#import-save').setInputFiles(fixtures[name]);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  await waitFrames(page);
  timeline.push({ at: new Date().toISOString(), fixture: name, operation: 'normal UI file import' });
  return read(page);
}
async function range(page, selector, fraction) {
  const slider = page.locator(selector);
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  assert.ok(box, `No box for ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + (box.width - 16) * fraction, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await waitFrames(page);
}
async function travel(page, target, tolerance = 2) {
  for (let i = 0; i < 800; i++) {
    const s = await read(page);
    assert.equal(s.mode, 'game', `Travel interrupted by ${s.mode}`);
    const dx = target.x - s.player.pos.x, dz = target.z - s.player.pos.z;
    if (Math.hypot(dx, dz) <= tolerance) { await advance(page, 160); return; }
    const active = [];
    if (Math.abs(dx) > .55) active.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dz) > .55) active.push(dz > 0 ? 's' : 'w');
    for (const key of active) await page.keyboard.down(key);
    await advance(page, Math.hypot(dx, dz) < 5 ? 100 : 250);
    for (const key of active) await page.keyboard.up(key);
  }
  throw new Error('Travel did not reach its fixture target within 200 simulated seconds');
}
async function scenario(name, task) {
  const page = await context.newPage();
  const start = performance.now();
  try {
    const details = await task(page);
    results.push({ name, status: 'passed', seconds: (performance.now() - start) / 1000, ...details });
    console.log(`PASS ${name}`);
  } catch (error) {
    const image = await screenshot(page, `${name}-failure`).catch(() => null);
    results.push({ name, status: 'failed', seconds: (performance.now() - start) / 1000, error: error.message, stack: error.stack, screenshot: image });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await page.mouse.up().catch(() => {});
    await page.close();
  }
}

try {
  await scenario('editor-interaction', async page => {
    const original = await importFixture(page, 'editor');
    const beforeGame = await screenshot(page, 'editor-game-before');
    await press(page, 'Tab');
    assert.equal((await read(page)).mode, 'editor');
    const initialCanvas = await page.locator('#world').screenshot();
    await page.mouse.move(760, 450); await page.mouse.down({ button: 'right' });
    await page.mouse.move(880, 402, { steps: 12 }); await page.mouse.up({ button: 'right' }); await waitFrames(page);
    const rotatedCanvas = await page.locator('#world').screenshot();
    assert.notEqual(createHash('sha256').update(initialCanvas).digest('hex'), createHash('sha256').update(rotatedCanvas).digest('hex'), '3D rotation did not change the rendered organism');
    await page.mouse.move(760, 450); await page.mouse.wheel(0, -270); await waitFrames(page);
    const zoomedCanvas = await page.locator('#world').screenshot();
    assert.notEqual(createHash('sha256').update(rotatedCanvas).digest('hex'), createHash('sha256').update(zoomedCanvas).digest('hex'), 'Editor zoom did not change the rendered view');
    const orbitEvidence = await screenshot(page, 'editor-orbit-zoom');

    await action(page, 'add:fins');
    let edited = await read(page); const finId = edited.editor.selected;
    assert.equal(edited.editor.draft.parts.length, original.player.genome.parts.length + 1);
    assert.ok(edited.editor.cost > 6); assert.deepEqual(edited.player.genome, original.player.genome);
    // Find the rendered fin through actual raycast clicks, then drag that organ.
    await action(page, `select:${original.player.genome.parts[0].id}`);
    let finPoint = null;
    for (let y = 310; y <= 660 && !finPoint; y += 35) {
      for (let x = 470; x <= 1100; x += 35) {
        await page.mouse.click(x, y);
        if ((await read(page)).editor.selected === finId) { finPoint = { x, y }; break; }
      }
    }
    assert.ok(finPoint, 'The visible fin could not be selected on the 3D organism');
    const beforeDragPart = (await read(page)).editor.draft.parts.find(p => p.id === finId);
    // Fins extend beyond the body: an arbitrary outward offset can miss the
    // attachment surface throughout the drag. The editor camera targets the
    // torso, so drag inward to the actual canvas centre after orbit and zoom.
    const canvasBox = await page.locator('#world').boundingBox();
    assert.ok(canvasBox, 'The editor canvas must have a visible bounding box');
    await page.mouse.move(finPoint.x, finPoint.y); await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2, { steps: 6 }); await page.mouse.up(); await waitFrames(page);
    const afterDragPart = (await read(page)).editor.draft.parts.find(p => p.id === finId);
    assert.ok(afterDragPart.axial !== beforeDragPart.axial || afterDragPart.angle !== beforeDragPart.angle, 'Dragging a selected 3D organ did not move it');

    await range(page, '[data-part="scale"]', .82);
    assert.ok((await read(page)).editor.draft.parts.find(p => p.id === finId).scale > 1.3);
    const pairedCost = (await read(page)).editor.cost;
    await page.locator('[data-part="mirrored"]').uncheck(); await waitFrames(page);
    edited = await read(page);
    assert.equal(edited.editor.draft.parts.find(p => p.id === finId).mirrored, false);
    assert.ok(edited.editor.cost < pairedCost, 'Symmetry did not change the price');
    await range(page, '[data-part="axial"]', .32);
    await range(page, '[data-part="angle"]', .30);
    const moved = await read(page), movedGenome = moved.editor.draft;
    assert.ok(movedGenome.parts.find(p => p.id === finId).axial < -.2);
    assert.ok(movedGenome.parts.find(p => p.id === finId).angle < -.8);
    await action(page, 'undo'); assert.notDeepEqual((await read(page)).editor.draft, movedGenome);
    await action(page, 'redo'); assert.deepEqual((await read(page)).editor.draft, movedGenome);
    await action(page, 'remove'); assert.equal((await read(page)).editor.draft.parts.some(p => p.id === finId), false);
    await action(page, 'undo'); assert.deepEqual((await read(page)).editor.draft, movedGenome);
    await action(page, 'add:eyes');
    assert.ok((await page.locator('.stat-row').allTextContents()).some(text => text.includes('Vnímání') && text.includes('+10.0')));
    const editedEvidence = await screenshot(page, 'editor-edited-parts');
    await action(page, 'cancel-editor');
    assert.deepEqual((await read(page)).player.genome, original.player.genome, 'Cancel changed the committed organism');
    assert.equal((await read(page)).player.dna, original.player.dna);

    await action(page, 'editor'); await action(page, 'add:fins'); await action(page, 'add:eyes');
    // Read-only checks during an actual pointer drag verify preview prices and
    // phenotype, not just values after committing the slider.
    const widthSlider = page.locator('[data-genome="width"]'); await widthSlider.scrollIntoViewIfNeeded();
    const box = await widthSlider.boundingBox(); assert.ok(box);
    const textBeforeDrag = await page.locator('.stat-row').allTextContents();
    await page.mouse.move(box.x + box.width * .35, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .78, box.y + box.height / 2, { steps: 7 }); await waitFrames(page);
    const duringDrag = await read(page);
    const visiblePrice = Number((await page.locator('.editor-footer .cost').innerText()).trim().split(/\s/)[0]);
    const liveStatsChanged = JSON.stringify(textBeforeDrag) !== JSON.stringify(await page.locator('.stat-row').allTextContents());
    const livePriceCorrect = visiblePrice === duringDrag.editor.cost;
    await page.mouse.up(); await waitFrames(page);
    const confirmed = await read(page); const expectedGenome = confirmed.editor.draft, expectedCost = confirmed.editor.cost;
    const confirmedEditorEvidence = await screenshot(page, 'editor-confirmed-phenotype');
    await action(page, 'confirm-editor');
    const inGame = await read(page);
    assert.equal(inGame.mode, 'game'); assert.deepEqual(inGame.player.genome, expectedGenome);
    assert.equal(inGame.player.dna, original.player.dna - expectedCost);
    assert.equal(inGame.player.generation, original.player.generation + 1);
    const afterGame = await screenshot(page, 'editor-game-after');
    const finalCanvas = await page.locator('#world').screenshot();
    assert.ok(finalCanvas.byteLength > 10000, 'The evolved 3D scene was not rendered');
    assert.ok(livePriceCorrect, `Price was stale during body drag: displayed ${visiblePrice}, actual ${duringDrag.editor.cost}`);
    assert.ok(liveStatsChanged, 'Phenotype statistics did not update during the body slider drag');
    return { screenshots: [beforeGame, orbitEvidence, editedEvidence, confirmedEditorEvidence, afterGame], verified: ['3D rotation', 'zoom', 'raycast part selection', '3D organ drag', 'add', 'move', 'resize', 'mirror', 'remove', 'undo', 'redo', 'cancel', 'live cost', 'live phenotype', 'exact committed genome', 'paid reproduction'], expectedCost, genome: expectedGenome };
  });

  await scenario('malformed-import-isolation', async page => {
    const baseline = await importFixture(page, 'malformedControl');
    const slotsBefore = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lumavora:save:')).length);
    await action(page, 'pause'); await action(page, 'saves');
    await page.locator('#import-save').setInputFiles({ name: 'broken-save.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"lumavora","version":1,"state":') });
    await page.locator('.error').waitFor();
    assert.match(await page.locator('.error').innerText(), /JSON|poškozen|platná/i);
    assert.equal((await read(page)).mode, 'saves');
    assert.deepEqual((await read(page)).player.genome, baseline.player.genome);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lumavora:save:')).length), slotsBefore);
    const image = await screenshot(page, 'malformed-save-rejected');
    // A rejected file must not poison the next valid import.
    await page.locator('#import-save').setInputFiles(fixtures.malformedControl);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
    assert.deepEqual((await read(page)).player.genome, baseline.player.genome);
    return { screenshots: [image], verified: ['malformed JSON rejected visibly', 'existing save slots preserved', 'valid import still works'] };
  });

  await scenario('death-generation-recovery', async page => {
    const alive = await importFixture(page, 'death');
    assert.equal(alive.player.energy, 0); assert.ok(alive.player.health > 0);
    await advance(page, 2000);
    const dead = await read(page);
    assert.equal(dead.mode, 'death'); assert.equal(dead.player.health, 0); assert.match(dead.deathReason, /energii/i);
    const deathImage = await screenshot(page, 'starvation-death');
    await action(page, 'recover');
    const restored = await read(page);
    assert.equal(restored.mode, 'game'); assert.equal(restored.player.generation, deathExpected.generation);
    assert.deepEqual(restored.player.genome, deathExpected.genome);
    assert.ok(restored.player.health > 0); assert.ok(restored.player.energy > 0);
    assert.equal(restored.world.patches[0].fertility, deathExpected.fertility);
    assert.equal(restored.world.patches[0].harvested, deathExpected.harvested);
    assert.deepEqual(restored.world.resources, deathExpected.resources);
    const recoveryImage = await screenshot(page, 'generation-restored');
    await action(page, 'save'); await page.reload({ waitUntil: 'networkidle' }); await action(page, 'saves');
    const recoverySlot = page.locator('.save-row').filter({ hasText: 'Scénář obnova' }).first();
    await recoverySlot.locator('[data-action^="load:"]').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
    assert.equal((await read(page)).player.generation, deathExpected.generation);
    assert.equal((await read(page)).world.patches[0].harvested, deathExpected.harvested);
    return { screenshots: [deathImage, recoveryImage], verified: ['actual starvation step', 'death stops play', 'generation restored', 'ecological checkpoint retained', 'save refresh reload'], prepared: 'Viable generation checkpoint followed by a low-energy/low-health starvation fixture' };
  });

  await scenario('causal-ecology-save-reconstruction', async page => {
    const start = await importFixture(page, 'ecology');
    await action(page, 'pause'); await page.locator('[data-setting="reducedMotion"]').check(); await action(page, 'close');
    const foodId = start.world.resources[0].id;
    const beforeImage = await screenshot(page, 'ecology-before-harvest');
    const beforeCanvas = await page.locator('#world').screenshot();
    for (let i = 0; i < 4; i++) { await press(page, 'Space'); await advance(page, 1134); }
    const harvested = await read(page);
    assert.equal(harvested.world.resources.find(r => r.id === foodId).amount, 4);
    assert.equal(harvested.world.patches[0].harvested, start.world.patches[0].harvested + 4);
    assert.ok(harvested.world.patches[0].fertility < start.world.patches[0].fertility);
    const harvestImage = await screenshot(page, 'ecology-after-harvest');
    const harvestedCanvas = await page.locator('#world').screenshot();
    assert.notEqual(createHash('sha256').update(beforeCanvas).digest('hex'), createHash('sha256').update(harvestedCanvas).digest('hex'), 'World canvas did not visibly change after resource depletion');
    for (let i = 0; i < 4; i++) { await press(page, 't'); await advance(page, 2034); }
    const restored = await read(page);
    assert.equal(restored.world.resources.find(r => r.id === foodId).amount, 5);
    assert.ok(restored.world.patches[0].fertility > harvested.world.patches[0].fertility);
    assert.equal(restored.world.patches[0].restored, start.world.patches[0].restored + 4);
    const restoredImage = await screenshot(page, 'ecology-after-tending');
    const restoredCanvas = await page.locator('#world').screenshot();
    assert.notEqual(createHash('sha256').update(harvestedCanvas).digest('hex'), createHash('sha256').update(restoredCanvas).digest('hex'), 'World canvas did not visibly change after nutrient restoration');
    await action(page, 'save'); await action(page, 'pause'); await action(page, 'saves');
    const downloadEvent = page.waitForEvent('download'); await action(page, 'export');
    const download = await downloadEvent, exportedPath = path.join(OUTPUT, 'causal-ecology.export.json'); await download.saveAs(exportedPath);
    await page.locator('#import-save').setInputFiles(exportedPath);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); await waitFrames(page);
    const loaded = await read(page);
    assert.deepEqual(loaded.world.patches, restored.world.patches);
    assert.deepEqual(loaded.world.resources, restored.world.resources);
    assert.deepEqual(loaded.player.genome, restored.player.genome);
    const loadedImage = await screenshot(page, 'ecology-after-save-import-reconstruction');
    return { screenshots: [beforeImage, harvestImage, restoredImage, loadedImage], verified: ['four actual harvests', 'depleted resource geometry visible', 'soil fertility decreased', 'four paid nutrient returns', 'resource amount and vegetation recovered', 'export and normal file import', 'exact causal world state retained'], camera: loaded.camera, before: { amount: 8, fertility: start.world.patches[0].fertility }, harvested: { amount: 4, fertility: harvested.world.patches[0].fertility }, restored: { amount: 5, fertility: restored.world.patches[0].fertility }, prepared: 'Only the initial encounter is prepared; harvesting, restoration and save/import are browser inputs' };
  });

  await scenario('nonaggressive-restoration', async page => {
    const start = await importFixture(page, 'restoration');
    assert.equal(start.player.genome.parts.some(p => p.kind === 'jaw'), false);
    const springs = start.world.landmarks.filter(l => l.kind === 'spring');
    for (let i = 0; i < springs.length; i++) {
      await travel(page, springs[i].pos);
      await advance(page, 2100);
      const before = await read(page);
      await press(page, 't');
      const after = await read(page);
      assert.equal(after.world.landmarks.find(l => l.id === springs[i].id).charge, 10);
      assert.ok(after.player.energy < before.player.energy - 9.8, 'Restoration did not spend its energy cost');
    }
    const end = await read(page);
    assert.equal(end.mode, 'won'); assert.equal(end.campaign.finale, 'restoration'); assert.equal(end.player.kills, 0);
    const victory = await screenshot(page, 'restoration-ending');
    await action(page, 'sandbox');
    assert.equal((await read(page)).mode, 'game'); assert.equal((await read(page)).campaign.sandbox, true);
    const ecology = await screenshot(page, 'restored-spring-sandbox');
    await action(page, 'save');
    return { screenshots: [victory, ecology], verified: ['movement between three springs', 'three paid tending actions', 'noncombat victory', 'sandbox continuation'], prepared: 'Each spring was prepared at 9/10; this is an ending scenario, not a campaign run', simulatedSeconds: end.tick / 60, finalCharges: end.world.landmarks.filter(l => l.kind === 'spring').map(l => l.charge) };
  });

  await scenario('symbiotic-migration', async page => {
    const start = await importFixture(page, 'symbiosis');
    assert.equal(start.player.bonds.length, 0);
    await press(page, 'r'); await advance(page, 1100); await press(page, 'r');
    const bonded = await read(page);
    assert.equal(bonded.player.bonds.length, 2);
    assert.equal(bonded.world.creatures.length, 0);
    assert.ok(bonded.player.energy < start.player.energy - 49);
    await press(page, 'g'); assert.equal((await read(page)).mode, 'game', 'Immature, hungry migration incorrectly won');
    await advance(page, 1100); await press(page, 'Space'); await advance(page, 1200); await press(page, 'Space');
    const fed = await read(page);
    assert.ok(fed.player.energy >= 70); assert.ok(fed.player.bonds.every(b => b.hunger < 10));
    const bondImage = await screenshot(page, 'symbiotic-organism');
    await advance(page, 121000);
    const mature = await read(page);
    assert.ok(mature.player.bonds.every(b => b.age >= 120 && b.loyalty >= 35));
    assert.ok(mature.player.bonds.every(b => b.hunger > fed.player.bonds[0].hunger), 'Partners did not consume nourishment over time');
    await press(page, 'g');
    const end = await read(page);
    assert.equal(end.mode, 'won'); assert.equal(end.campaign.finale, 'migration'); assert.equal(end.player.kills, 0);
    return { screenshots: [bondImage, await screenshot(page, 'migration-ending')], verified: ['two real bond actions', 'partner NPCs removed from world', '50 energy cost', 'feeding and upkeep', 'immature migration rejected', '120 second maturation', 'noncombat migration'], prepared: 'The terrestrial host, compatible NPCs and destination placement were prepared', partnerState: mature.player.bonds };
  });

  await scenario('predator-balance', async page => {
    const start = await importFixture(page, 'predator');
    assert.equal(start.campaign.stageKills, 11);
    await press(page, 'Space');
    const hit = await read(page);
    assert.equal(hit.mode, 'game'); assert.ok(hit.world.creatures[0].health < start.world.creatures[0].health);
    await advance(page, 720); await press(page, 'Space');
    const end = await read(page);
    assert.equal(end.mode, 'won'); assert.equal(end.campaign.finale, 'predator'); assert.equal(end.campaign.stageKills, 12);
    assert.equal(end.world.creatures.length, 0);
    assert.ok(end.world.resources.some(r => r.kind === 'meat'));
    assert.ok(end.world.patches[0].fertility > start.world.patches[0].fertility);
    assert.equal(end.world.patches[0].hunted, start.world.patches[0].hunted + 1);
    assert.equal(end.player.dna, start.player.dna + 5);
    return { screenshots: [await screenshot(page, 'predator-ending')], verified: ['two actual jaw attacks', 'invasive removal', 'meat drop', 'DNA reward', 'soil change', 'predator victory'], prepared: 'Eleven prior invasive kills were prepared; the twelfth was performed by browser input' };
  });
} finally {
  if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({ path: path.join(OUTPUT, 'targeted-scenarios.trace.zip') });
  await context.close(); await browser.close();
  const report = { kind: 'targeted prepared-state browser scenarios; not a fresh-game campaign run', campaignRules: 'legacy', freshCurrentCampaign: false, acceleratedTimeStepping: true, startedAt: started.toISOString(), endedAt: new Date().toISOString(), url: BASE_URL, viewport: { width: 1536, height: 960 }, browser: `Playwright Chromium ${browser.version()} / ${process.platform === 'darwin' ? 'ANGLE Metal requested' : 'default graphics backend'}; renderer must be measured separately`, browserStateWrites: 'none; prepared saves imported through the real file input', timeControl: 'DEV advanceTime fixed steps while actual keyboard keys are held; not natural wall-clock gameplay', results, browserErrors: errors, externalRequests: [...new Set(externalRequests)], timeline, trace: process.env.LUMAVORA_TRACE === '1' ? path.relative(process.cwd(), path.join(OUTPUT, 'targeted-scenarios.trace.zip')) : null };
  await writeFile(path.join(OUTPUT, 'scenario-results.json'), JSON.stringify(report, null, 2));
  if (results.some(r => r.status !== 'passed') || errors.length || externalRequests.length) process.exitCode = 1;
}
