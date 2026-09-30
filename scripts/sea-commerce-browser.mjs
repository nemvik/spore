/** J sea continuation: unchanged historical save, public UI and native RAF only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const out = path.resolve(process.env.SEA_COMMERCE_OUTPUT ?? 'evidence/sp-009j-sea/browser');
const input = path.resolve('tests/fixtures/saves/machines-restoration-completed.save.json');
const timeout = Number(process.env.SEA_COMMERCE_TIMEOUT_MS ?? 300000);
assert.ok(Number.isFinite(timeout) && timeout >= 30000);
await mkdir(out, {recursive: true});
const bytes = await readFile(input), source = JSON.parse(bytes.toString()).state;
const hash = b => createHash('sha256').update(b).digest('hex');
const sourceHash = hash(bytes);
assert.equal(sourceHash, '7dffc69f9d073c8046783be74ba9fde13b5ece2282eb6357dcc8a7267cc53dec');
const disk = async () => {const s = await statfs(out); return s.bavail * s.bsize;};
const diskBefore = await disk();
const route = [1614, 1613, 1541], ownName = 'Tyrkysová přílivnice';
console.log(`Sea commerce native UI: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free, source ${sourceHash}`);

const browser = await chromium.launch({headless: true, channel: 'chrome'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true});
// Long native income waiting deliberately has no trace or video.
const page = await context.newPage(), checks = [], errors = [], events = [], screenshots = [];
let targetId, vessel, crossing, active, frames = [], terrain = [], income, modelProof, receipt;
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = name => page.locator(`[data-action="${name}"]:visible`).first().click();
const check = message => {checks.push(message); console.log(message);};
const city = s => s.cities.entries.find(c => c.id === targetId);
const contract = s => s.commerce.contracts.find(c => c.cityId === targetId && c.status !== 'cancelled');
const delivery = s => contract(s)?.deliveries.at(-1);
const pause = async () => {if ((await read()).mode === 'game') await act('pause');};
const resume = async () => {if ((await read()).mode !== 'game') await act('close');};
const shot = async name => {const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); screenshots.push(file);};
const compact = s => ({mode: s.mode, stage: s.stage, clock: s.states?.clock, amber: s.machines?.resource,
  location: s.homePlanet?.currentLocationId, navigation: {mode: s.navigation?.mode, cell: s.navigation?.field?.cellId},
  city: targetId && city(s), commerce: s.commerce, maritime: s.maritime});
async function waitFor(label, predicate) {
  const start = performance.now(); let nextLog = start + 15000, s;
  while (performance.now() - start < timeout) {
    s = await read(); assert.deepEqual(errors, []);
    if (predicate(s)) {events.push({label, nativeSeconds: (performance.now() - start) / 1000, clock: s.states.clock}); return s;}
    if (performance.now() >= nextLog) {
      console.log(`${label}: turn ${s.states.clock.turn}, amber ${s.machines.resource.toFixed(2)}, delivery ${delivery(s)?.phase ?? 'none'} ${delivery(s)?.progress ?? ''}`);
      nextLog = performance.now() + 15000;
    }
    await page.waitForTimeout(100);
  }
  throw Error(`${label} timed out after ${timeout / 1000}s: ${JSON.stringify(compact(s))}`);
}
async function imported(file, freeze = true) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  if (freeze) await pause();
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  return read();
}
async function exported(name) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const pending = page.waitForEvent('download'); await act('export');
  const file = path.join(out, `${name}.save.json`); await (await pending).saveAs(file);
  return {file, state: JSON.parse(await readFile(file, 'utf8')).state};
}
async function atlas() {
  await resume(); if ((await read()).navigation.mode !== 'global') await page.keyboard.press('n');
  await page.locator('#travel-map').waitFor();
}
async function select(cellId) {
  await page.locator('#atlas-cell').fill(String(cellId)); await page.locator('#atlas-cell').press('Tab');
  await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).navigation.selectedCell === id, cellId);
}
async function earlyVisit(cellId) {
  await atlas(); await select(cellId); assert.equal(await page.locator('[data-action="travel-enter"]').isDisabled(), false);
  await act('travel-enter'); await page.locator('.field-panel').waitFor(); await page.keyboard.press('n');
  const s = await read(); assert.equal(s.states.clock.turn, 0, 'The two ordinary early visits must precede the first native strategic turn');
  assert.ok(s.homePlanet.navigation.fields.some(f => f.cellId === cellId));
  events.push({label: `Ordinary unmeasured visit ${cellId}`, clock: s.states.clock});
}
async function home() {
  await resume(); if ((await read()).navigation.mode === 'global') await page.keyboard.press('n');
  if ((await read()).navigation.field) await act('travel-home');
  assert.equal((await read()).navigation.field, null);
}
async function visitCity() {
  await atlas(); await act(`city-select:${targetId}`); await act(`city-enter:${targetId}`);
  await page.locator('#trade-panel').waitFor(); assert.equal((await read()).navigation.field.cellId, route.at(-1));
}
async function range(selector, steps) {
  await page.locator(selector).focus();
  for (let i = 0; i < Math.abs(steps); i++) await page.keyboard.press(steps > 0 ? 'ArrowRight' : 'ArrowLeft');
  await page.keyboard.press('Tab');
}
function assertBoat(s) {
  assert.deepEqual(s.maritime.vessel.blueprint, vessel.blueprint);
  assert.deepEqual(s.maritime.vessel.payment, vessel.payment);
  assert.equal(s.maritime.vessel.health, vessel.health);
  assert.equal(s.maritime.vessel.mooring, route[0]);
  assert.deepEqual(s.machines.blueprints, source.machines.blueprints);
  assert.equal(s.military.raids.length, 0); assert.equal(s.mobilization.raids.length, 0);
}
async function dispatch() {
  const before = await read(), c = contract(before);
  const details = page.locator('.commerce-contract details').first();
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  const button = page.locator(`[data-action="commerce:offer,${c.id},boat"]`);
  assert.equal(await button.isDisabled(), false, 'The own paid vessel must have a real sea route');
  await button.click(); await act('commerce:confirm'); await page.locator('#commerce-status').waitFor();
  const s = await read(), d = delivery(s); assertBoat(s);
  assert.equal(d.carrier.kind, 'boat'); assert.equal(d.carrier.id, s.maritime.vessel.id);
  assert.deepEqual(d.blueprint, vessel.blueprint); assert.equal(d.home, null); assert.deepEqual(d.route, route);
  assert.equal(d.payment.amount, 20); assert.equal(d.payment.before, before.machines.resource);
  assert.equal(d.payment.after, before.machines.resource - 20); assert.equal(s.machines.resource, d.payment.after);
  assert.equal(d.phase, 'outbound'); assert.equal(d.delivered, false);
  return s;
}
async function finishDelivery() {
  await waitFor('Native outbound sea cargo', s => delivery(s).progress >= route.length - 1 - 1e-8);
  await act('commerce:unload'); const unloaded = await read();
  assert.equal(delivery(unloaded).phase, 'returning'); assert.equal(delivery(unloaded).delivered, true);
  await waitFor('Native return sea cargo', s => delivery(s).progress <= 1e-8);
  await act('commerce:dock'); await page.locator('#trade-panel').waitFor();
  const s = await read(), d = delivery(s); assertBoat(s);
  assert.equal(d.phase, 'returned'); assert.equal(d.progress, 0); assert.equal(d.distance, 2); assert.equal(d.elapsed, 4);
  assert.equal(d.refund, null); assert.equal(s.machines.resource, d.payment.after);
  check(`Paid boat delivery ${contract(s).deliveries.length}/3 completed both real legs; cargo20 retained in escrow`);
}

try {
  await imported(input, false); await page.keyboard.press('n'); const initial = await read();
  assert.equal(initial.stage, 4); assert.equal(initial.states.clock.turn, 0); assert.equal(initial.navigation.fields?.length ?? initial.homePlanet.navigation.fields.length, 0);
  assert.ok(initial.mobilization, 'Current production import activates the compatible K2 slice');
  assert.equal(initial.cities.entries.length, 0); assert.equal(initial.maritime.vessel, null);
  await earlyVisit(1542); await earlyVisit(1615); await home();
  const earningStart = await read(), incomeStarted = performance.now();
  await waitFor('Natural AI settlement and home income', s => s.cities.entries.some(c => c.address.locationId.endsWith(':field-1541') && c.owner.kind === 'state') && s.machines.resource >= 350);
  await pause(); const earned = await read();
  targetId = earned.cities.entries.find(c => c.address.locationId.endsWith(':field-1541')).id;
  assert.ok(earned.cities.entries.some(c => c.address.locationId.endsWith(':field-1470')));
  income = {before: earningStart.machines.resource, after: earned.machines.resource, nativeSeconds: (performance.now() - incomeStarted) / 1000,
    clockBefore: earningStart.states.clock, clockAfter: earned.states.clock};
  assert.ok(income.after > source.machines.resource);
  check(`Natural cities at1470/1541 and earned home income ${income.before.toFixed(2)} → ${income.after.toFixed(2)} amber`);

  await act('vehicle-open'); await act('vehicle-new:boat');
  const originalDraft = structuredClone((await read()).editor.draft);
  await page.locator('[data-genome="name"]').fill(ownName);
  await page.locator('#vehicle-description').fill('Vlastní námořní obchodní konstrukce této linie.');
  await range('[data-genome="hue"]', 120); await act('select:sea-propeller'); await range('[data-part="scale"]', 5);
  await act('confirm-editor'); const creation = (await read()).vehicleLibrary.find(e => e.blueprint.name === ownName);
  assert.ok(creation); assert.notEqual(creation.blueprint.hue, originalDraft.hue);
  assert.notEqual(creation.blueprint.parts.find(p => p.id === 'sea-propeller').scale, originalDraft.parts.find(p => p.id === 'sea-propeller').scale);
  await act(`vehicle-use:${creation.id}`); const manufacturing = await read(), cost = manufacturing.editor.cost;
  await act('confirm-editor'); vessel = structuredClone((await read()).maritime.vessel);
  assert.deepEqual(vessel.blueprint, manufacturing.editor.draft); assert.equal(vessel.payment.amount, cost);
  assert.equal(vessel.payment.before, manufacturing.machines.resource); assert.equal(vessel.payment.after, vessel.payment.before - cost);
  check(`Own named/color/propeller model manufactured through library UI for ${cost} earned amber`);

  await atlas();
  for (const cellId of route) {
    await select(cellId);
    terrain.push({cellId, availability: await page.locator('.travel-availability').innerText()});
  }
  assert.match(terrain.find(t => t.cellId === 1613).availability, /Vodní lokalita/, 'The actual interior atlas cell must be water');
  assert.match(terrain.find(t => t.cellId === 1541).availability, /pevninská výprava/, 'Visit the coastal destination through normal land travel');
  await visitCity(); await act('commerce:open'); assert.equal(contract(await read()).deliveries.length, 0);
  await dispatch(); await waitFor('First boat actually leaves home', s => delivery(s).progress > 0 && delivery(s).progress < 2);
  await pause(); const frozen = structuredClone(delivery(await read())); await page.waitForTimeout(400);
  assert.deepEqual(delivery(await read()), frozen); crossing = await exported('crossing-checkpoint');
  const savedContract = crossing.state.commerce.contracts.find(c => c.cityId === targetId);
  await imported(crossing.file); const restored = await read();
  // Rekeying an imported save changes lineage-derived IDs. Use the same target field.
  targetId = restored.cities.entries.find(c => c.address.locationId.endsWith(':field-1541')).id;
  assert.equal(delivery(restored).id, savedContract.deliveries.at(-1).id);
  assert.deepEqual(delivery(restored).payment, savedContract.deliveries.at(-1).payment);
  assert.deepEqual(delivery(restored).route, route); assert.ok(delivery(restored).progress >= frozen.progress);
  assert.equal(restored.machines.resource, crossing.state.machines.resource); assertBoat(restored);
  check('Actual outbound sea export/import/rekey preserves payment, route, own model and paused progress');
  await resume(); await finishDelivery();

  const samplingStart = await dispatch();
  modelProof = {blueprint: delivery(samplingStart).blueprint, commerceCamera: samplingStart.commerceCamera, render: samplingStart.render,
    visibleStatus: await page.locator('#commerce-status').innerText(), firstProgress: delivery(samplingStart).progress};
  await shot('own-boat-commerce-1024');
  frames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous;
    const frame = t => {if (previous !== undefined) samples.push(t - previous); previous = t;
      if (samples.length === 90) resolve(samples); else requestAnimationFrame(frame);}; requestAnimationFrame(frame);
  }));
  modelProof.lastProgress = delivery(await read()).progress;
  assert.equal(frames.length, 90); assert.ok(modelProof.lastProgress > modelProof.firstProgress);
  await finishDelivery(); await dispatch(); await finishDelivery();
  const complete = await read(), completed = contract(complete);
  assert.equal(completed.deliveries.length, 3); assert.ok(completed.deliveries.every(d => d.delivered && d.phase === 'returned' && d.payment.amount === 20));
  assert.equal(completed.deliveries.reduce((n, d) => n + d.payment.amount, 0), 60);
  assert.equal(city(complete).owner.kind, 'state'); assert.equal(city(complete).transfers.length, 0);
  await page.locator('.commerce-contract h3').scrollIntoViewIfNeeded(); await shot('three-sea-deliveries-1024');

  await act('trade:offer'); const quoted = await read();
  assert.equal(await page.locator('[data-action="trade:confirm"]').isDisabled(), false, 'Earned funds and three returned deliveries must enable the normal quote');
  await act('trade:confirm'); const acquired = await read(); receipt = structuredClone(city(acquired).transfers.at(-1));
  assert.equal(city(acquired).owner.kind, 'lineage'); assert.equal(city(acquired).capture, null);
  assert.equal(receipt.method, 'trade'); assert.equal(receipt.version, 2); assert.equal(receipt.credit, 60);
  assert.equal(receipt.payment.before, quoted.machines.resource); assert.equal(receipt.payment.after, receipt.payment.before - (receipt.price - 60));
  assert.equal(receipt.payment.receivedAfter - receipt.payment.receivedBefore, receipt.price);
  assert.equal(contract(acquired).status, 'settled'); assert.equal(contract(acquired).receiptId, receipt.id); assertBoat(acquired);
  check(`Coastal city bought peacefully: price${receipt.price}, escrow60, due${receipt.price - 60}, state had${receipt.decision.cities} cities; no fixed expansion count assumed`);
  await act('city-camera'); await shot('acquired-coastal-city-1024'); await home();
  const returnedHome = await read(); assertBoat(returnedHome);
  assert.equal(returnedHome.navigation.field, null); assert.equal(returnedHome.maritime.journeys.length, 0);
  active = await exported('active-campaign');
  const finalBefore = active.state.commerce.contracts.find(c => c.cityId === targetId);
  await imported(active.file); const final = await read(); targetId = final.cities.entries.find(c => c.address.locationId.endsWith(':field-1541')).id;
  assertBoat(final); assert.equal(final.navigation.field, null); assert.equal(city(final).owner.kind, 'lineage');
  assert.deepEqual(contract(final).deliveries.map(d => ({payment: d.payment, phase: d.phase, delivered: d.delivered, route: d.route})),
    finalBefore.deliveries.map(d => ({payment: d.payment, phase: d.phase, delivered: d.delivered, route: d.route})));
  check('Final home return and normal import preserve acquired coastal city, all three closed voyages and paid own vessel');
  assert.equal(hash(await readFile(input)), sourceHash); assert.deepEqual(errors, []);
  const sorted = [...frames].sort((a, b) => a - b);
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, events, screenshots, source: {file: input, sha256: sourceHash},
    build: await page.locator('script[type="module"]').getAttribute('src'), income, terrain, vessel, modelProof, receipt,
    performance: {scene: 'Native commerce boat rendered at1024x640', frames, p50: sorted[45], p95: sorted[85], max: sorted.at(-1), isolatedBenchmark: false},
    final: compact(final), activeCampaign: active.file, crossingCheckpoint: crossing.file, disk: {before: diskBefore, after: await disk()},
    provenance: 'Unchanged historical restoration-completed source; it originally used prepared coast and DEV advanceTime. This run proves only its native continuation through ordinary early visits, AI settlement, earned income, own paid boat, three paid sea roundtrips and peaceful purchase. No fresh birth-to-space campaign claim, live setters, offline prep, localStorage writes or clock acceleration.'}, null, 2));
  console.log(JSON.stringify({checks: checks.length, errors, performanceFrames: frames.length, acquired: targetId, activeCampaign: active.file}));
} catch (error) {
  let interrupted, exportError;
  try {interrupted = (await exported('interrupted-campaign')).file;} catch (e) {exportError = String(e);}
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({error: String(error), stack: error.stack, checks, errors, events, interrupted, exportError,
    state: await read().then(compact).catch(() => null)}, null, 2));
  if (screenshots.length < 3) await shot('failure').catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {await browser.close();}
