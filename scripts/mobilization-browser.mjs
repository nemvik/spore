/** K2 continuation of the played K1 campaign. Native UI/RAF; no state setters or test clock. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const out = path.resolve(process.env.MOBILIZATION_OUTPUT ?? 'evidence/sp-009k2/browser');
const input = path.resolve(process.env.MOBILIZATION_INPUT ?? 'tests/fixtures/city-defense/native-defense-campaign.save.json');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const timeout = Number(process.env.MOBILIZATION_TIMEOUT_MS ?? 300000);
assert.ok(Number.isFinite(timeout) && timeout >= 30000, 'Use a native per-step timeout of at least 30 seconds');
await mkdir(out, {recursive: true});
const inputBytes = await readFile(input), original = JSON.parse(inputBytes.toString()).state;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const freeDisk = async () => {const s = await statfs(out); return s.bavail * s.bsize;};
const diskBefore = await freeDisk();
console.log(`K2 native browser: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB available; ${timeout / 1000}s per-step timeout`);

const originalCity = original.cities.entries.find(c => c.capture && c.economy?.buildings.some(b => b.kind === 'tower'));
assert.ok(originalCity, 'The played K1 input must contain its acquired city and paid tower');
const targetId = originalCity.id, stateId = originalCity.foundingOwner.id;
const towerId = originalCity.economy.buildings.find(b => b.kind === 'tower').id;
const unitId = originalCity.capture.unitId;
const originalUnit = original.machines.fleet.find(u => u.id === unitId);
assert.ok(originalUnit?.health > 0, 'The original K1 tank must still exist');
const fullTankHealth = 88; // Actual unchanged K1 cannon construction; never assigned to live state.
const originalRaids = structuredClone(original.military.raids);
assert.ok(originalRaids.some(r => r.stateId === stateId && r.phase === 'destroyed'));
const sourceId = originalRaids.find(r => r.stateId === stateId).sourceCityId;
const originalState = original.states.entries.find(r => r.id === stateId);
assert.equal(originalState.reserve, 0, 'K1 already spent the original state reserve');

const browser = await chromium.launch({headless: true, channel: 'chrome'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true});
// This long native-income proof intentionally records no trace or video.
const page = await context.newPage(), checks = [], errors = [], events = [], repairReceipts = [], images = [];
let frames = [], firstPurchase, firstResolved, secondPurchase;
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const city = (s, id = targetId) => s.cities.entries.find(c => c.id === id);
const tower = s => city(s).economy.buildings.find(b => b.id === towerId);
const tank = s => s.machines.fleet.find(u => u.id === unitId);
const army = (s, id) => s.mobilization.raids.find(r => r.id === id);
const terminal = r => r && ['destroyed', 'returned', 'withdrawn'].includes(r.phase);
const act = a => page.locator(`[data-action="${a}"]:visible`).first().click();
const check = message => {checks.push(message); console.log(message);};
const pause = async () => {if ((await read()).mode === 'game') await act('pause');};
const resume = async () => {if ((await read()).mode !== 'game') await act('close');};
const assertHistory = s => {
  assert.deepEqual(city(s).capture, originalCity.capture, 'Original E capture changed');
  assert.deepEqual(city(s).transfers, originalCity.transfers, 'Defense must retain the original ownership history');
  assert.deepEqual(s.military.raids, originalRaids, 'Original F raid must remain in its original ledger unchanged');
  assert.deepEqual(tower(s).appearance, originalCity.economy.buildings.find(b => b.id === towerId).appearance);
  assert.equal(city(s).owner.kind, 'lineage', 'The actual defense lost the city');
  const r = s.states.entries.find(r => r.id === stateId);
  assert.equal(r.reserve, originalState.reserve, 'New armies must not replenish/spend the exhausted legacy reserve');
  assert.equal(r.tradeReserve, originalState.tradeReserve, 'Civil sale receipts are not new army income');
  assert.deepEqual(r.transactions, originalState.transactions, 'New army purchases belong to their separate ledger');
  assert.notEqual(s.homePlanet.currentLocationId, city(s, sourceId).address.locationId, 'The source city must remain unvisited throughout this proof');
  assert.deepEqual(errors, [], 'Browser reported an error');
};
const compact = s => {
  if (!s) return null;
  const target = s.cities?.entries.find(c => c.id === targetId), source = s.cities?.entries.find(c => c.id === sourceId);
  const unit = s.machines?.fleet.find(u => u.id === unitId);
  return {mode: s.mode, stage: s.stage, turn: s.states?.clock, location: s.homePlanet?.currentLocationId,
    homeAmber: s.machines?.resource, tank: unit && {id: unitId, health: unit.health},
    target: target && {id: targetId, owner: target.owner, treasury: target.economy?.treasury, tower: target.economy?.buildings.find(b => b.id === towerId)?.defense},
    source: source && {id: sourceId, treasury: source.economy?.treasury, cycle: source.economy?.cycle, ledger: source.economy?.ledger},
    deployment: s.military?.deployment, mobilization: s.mobilization};
};

/** Polls observable game state while native RAF runs; does not advance any clock. */
async function waitFor(label, predicate, observe = () => {}) {
  const start = performance.now(); let nextLog = start + 15000, latest;
  while (performance.now() - start < timeout) {
    latest = await read(); assertHistory(latest); observe(latest);
    if (predicate(latest)) {
      events.push({label, nativeSeconds: (performance.now() - start) / 1000, turn: latest.states.clock.turn});
      return latest;
    }
    if (performance.now() >= nextLog) {
      console.log(`${label}: turn ${latest.states.clock.turn}, purchases ${latest.mobilization.purchases.length}, source cycle ${city(latest, sourceId).economy.cycle}`);
      nextLog = performance.now() + 15000;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out after ${timeout / 1000}s of native waiting: ${JSON.stringify(compact(latest))}`);
}
async function imported(file) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined', 'Native proof must not expose a test clock');
  await pause();
  const s = await read(); assert.ok(s.mobilization, 'Production import must activate mobilization'); assertHistory(s);
  return s;
}
async function exported(name) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const pending = page.waitForEvent('download'); await act('export');
  const file = path.join(out, `${name}.save.json`); await (await pending).saveAs(file);
  return {file, state: JSON.parse(await readFile(file, 'utf8')).state};
}
async function visitTarget() {
  await resume();
  if ((await read()).navigation.mode !== 'global') await page.keyboard.press('n');
  await act(`city-select:${targetId}`); await act(`city-enter:${targetId}`);
  await page.locator('#city-economy').waitFor(); assertHistory(await read());
}
async function home() {
  await resume();
  if ((await read()).navigation.mode === 'global') await page.keyboard.press('n');
  if ((await read()).navigation.field) await act('travel-home');
  assert.equal((await read()).navigation.field, null);
}
async function operations() {
  const details = page.locator('#city-economy details').filter({has: page.locator('summary', {hasText: 'Provozy a náklady'})});
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}
async function cityCommand(command) {
  await act(`city-econ:${command}`); await page.locator('.city-confirm:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-action="city-econ:confirm"]').isDisabled(), false,
    await page.locator('.city-confirm:not([hidden])').innerText());
  await act('city-econ:confirm');
}
async function repairTower() {
  assert.equal((await read()).military.deployment, null, 'Return the actual tank before repairing the tower');
  for (let i = 0; tower(await read()).defense.health < 100; i++) {
    assert.ok(i < 3, 'A tower needs at most three paid +40 repairs');
    if (city(await read()).economy.treasury < 15) {
      const before = await read(); assert.ok(before.machines.resource >= 20, 'Earn repair funds at home first');
      await cityCommand('fund'); const after = await read();
      assert.equal(city(after).economy.ledger.transfers, city(before).economy.ledger.transfers + 20);
      assert.equal(after.machines.resource, before.machines.resource - 20, 'Remote funding must debit real home amber');
    }
    await operations(); const before = await read(); await cityCommand(`repair,${towerId}`); const after = await read();
    assert.equal(city(after).economy.ledger.repairs, city(before).economy.ledger.repairs + 10);
    assert.equal(tower(after).defense.repaired, tower(before).defense.repaired + 10);
    assert.equal(tower(after).defense.health, Math.min(100, tower(before).defense.health + 40));
    assert.equal(city(after).economy.treasury, city(before).economy.treasury - 10
      + city(after).economy.ledger.income - city(before).economy.ledger.income
      - city(after).economy.ledger.upkeep + city(before).economy.ledger.upkeep);
    repairReceipts.push({kind: 'tower',turn: after.states.clock.turn, cost: 10, before: tower(before).defense.health, after: tower(after).defense.health});
  }
}
async function repairTank() {
  const before = await read(); assert.ok(tank(before)?.health > 0, 'The actual original tank must survive this defense');
  if (tank(before).health === fullTankHealth) return;
  await act(`machine-select:${unitId}`); await act('machine-repair'); const after = await read();
  assert.equal(tank(after).health, fullTankHealth);
  // Native home income may run between clicks. The final paused exports retain exact accounts.
  assert.ok(after.machines.resource <= before.machines.resource - 10 + 3, 'Repair must debit ten amber, allowing native income during the click');
  repairReceipts.push({kind: 'tank', turn: after.states.clock.turn, cost: 10, before: tank(before).health, after: tank(after).health});
}
function assertPurchase(s, index) {
  const p = s.mobilization.purchases[index]; assert.ok(p, 'Each new army needs its own purchase');
  const b = s.mobilization.baselines.find(b => b.cityId === p.sourceCityId && b.stateId === p.stateId && b.epoch === p.sourceEpoch);
  assert.ok(b, 'Each new army needs its own earning baseline');
  assert.equal(p.stateId, stateId); assert.equal(p.sourceCityId, sourceId); assert.equal(p.cityId, targetId); assert.equal(p.cost, 40);
  assert.equal(p.economy.military, index * 40, 'A second army must pay after the first, not reuse its receipt');
  assert.ok(p.economy.income - b.income - (p.economy.upkeep - b.upkeep) - (p.economy.military - b.military) >= 40, 'Army cost must be covered by newly earned net production');
  assert.ok(p.economy.treasury - p.cost >= p.economy.operatingReserve && p.economy.operatingReserve > 0, 'Leave the recorded operating reserve');
  assert.ok(p.economy.last.funded && p.economy.last.income > p.economy.last.upkeep && p.economy.last.hungry === 0);
  const e = city(s, p.sourceCityId).economy;
  assert.equal(e.ledger.military, s.mobilization.purchases.filter(v => v.sourceCityId === p.sourceCityId).reduce((sum, v) => sum + v.cost, 0));
  assert.equal(e.treasury, e.ledger.transfers + e.ledger.income - e.ledger.construction - e.ledger.immigration - e.ledger.supplies - e.ledger.upkeep - e.ledger.repairs - e.ledger.military);
  assert.equal(army(s, p.id).id, p.id); assert.ok(!originalRaids.some(r => r.id === p.id));
  return structuredClone(p);
}
async function shot(name) {
  if (images.length >= 3) return;
  await page.locator('.city-panel,.field-panel').evaluateAll(es => es.forEach(e => {e.scrollTop = 0;}));
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
}
async function fight(p, index) {
  await visitTarget(); await act(`military:deploy,${unitId}`);
  await waitFor(`Army ${index}: original tank arrives`, s => s.military.deployment?.phase === 'field');
  await act('military:defend'); await act('military:camera');
  const contact = await waitFor(`Army ${index}: actual damage`, s => army(s, p.id).unit.health < 62);
  assert.ok(tank(contact)?.health > 0); await shot(`army-${index}-combat-1024`);
  if (!frames.length) frames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let last;
    function frame(t) {if (last !== undefined) samples.push(t - last); last = t;
      if (samples.length === 90) resolve(samples); else requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
  }));
  let s = await waitFor(`Army ${index}: combat and return resolve`, s => terminal(army(s, p.id)));
  assert.ok(army(s, p.id).unit.health < 62, 'A timer alone is not combat evidence');
  assert.ok(tank(s)?.health > 0, 'No prepared replacement is allowed');
  await act('military:retreat'); await waitFor(`Army ${index}: own physical return`, s => s.military.deployment === null);
  s = await waitFor(`Army ${index}: resolution receipt`, s => s.mobilization.resolved.some(r => r.raidId === p.id));
  assert.equal(city(s).owner.kind, 'lineage'); await repairTower();
  check(`New army ${index} paid from remote production, fought and resolved; original E/F history and owned city retained`);
  return structuredClone(s.mobilization.resolved.find(r => r.raidId === p.id));
}

try {
  let s = await imported(input);
  assert.deepEqual(s.mobilization.purchases, [], 'This proof begins before either new army purchase');
  await resume(); await repairTower(); await home();
  await waitFor('Earn real home repair reserve', s => s.machines.resource >= 100);
  await repairTank();
  s = await waitFor('First new army paid without visiting its source', s => s.mobilization.purchases.length === 1,
    s => assert.equal(s.navigation.field, null, 'Wait for remote production at the original home'));
  firstPurchase = assertPurchase(s, 0);
  check('First new army has a distinct 40-amber purchase, newly earned net income and preserved operating reserve');
  firstResolved = await fight(firstPurchase, 1);

  const beforeImport = await exported('first-resolved');
  s = await imported(beforeImport.file);
  assert.deepEqual(s.mobilization, beforeImport.state.mobilization, 'Import/rekey must retain both original and new military histories');
  await act('save'); const between = await exported('between-waves');
  await page.reload(); await act('saves'); await act(`load:${between.state.id}`);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); await pause();
  s = await read(); assertHistory(s); assert.deepEqual(s.mobilization, between.state.mobilization, 'Reload must keep purchase, baseline, raid and resolution');
  check('Between-wave export/import/rekey plus save/reload/load preserves the completed first new attack');

  await home(); await repairTank();
  const restStart = await read(), sourceIncome = city(restStart, sourceId).economy.ledger.income;
  await waitFor('Six strategic turns of recovery after the resolved army', s => s.states.clock.turn >= firstResolved.turn + 6,
    s => {assert.equal(s.mobilization.purchases.length, 1, 'No second purchase during the six-turn rest'); assert.equal(s.navigation.field, null);});
  s = await read(); assert.ok(city(s, sourceId).economy.ledger.income > sourceIncome, 'Remote production continues during recovery');
  check('Recovery spans six strategic turns (nominal 60 seconds), with fresh recorded income and no premature replacement');
  s = await waitFor('Second separately paid army without visiting its source', s => s.mobilization.purchases.length === 2,
    s => {assert.equal(s.navigation.field, null); assert.deepEqual(s.mobilization.purchases[0], firstPurchase);});
  secondPurchase = assertPurchase(s, 1);
  assert.notEqual(secondPurchase.id, firstPurchase.id); assert.ok(secondPurchase.turn >= firstResolved.turn + 6);
  assert.ok(secondPurchase.economy.income > firstPurchase.economy.income);
  await fight(secondPurchase, 2);
  await home(); await repairTank(); await visitTarget(); await act(`city-tower-camera:${towerId}`);
  s = await read(); assertHistory(s); assert.equal(s.mobilization.purchases.length, 2);
  assert.ok(s.mobilization.raids.every(terminal)); assert.equal(frames.length, 90);
  assert.ok(repairReceipts.filter(r => r.kind === 'tower').length >= 2, 'The played initial 40-health tower needs two paid repairs');
  await shot('two-paid-armies-resolved-1024'); await pause();
  const final = await exported('active-campaign');
  assert.deepEqual(final.state.mobilization.purchases, [firstPurchase, secondPurchase]);
  assert.equal(hash(await readFile(input)), hash(inputBytes), 'Never modify the played K1 fixture');
  check('Both paid attacks, repairs and final campaign exported; compact evidence retained');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, events, images, frames, repairReceipts,
    purchases: [firstPurchase, secondPurchase], firstResolved, final: compact(s),
    input: {file: input, sha256: hash(inputBytes)}, disk: {before: diskBefore, after: await freeDisk()},
    artifacts: {active: final.file, checkpointEvidence: between.file, firstResolved: beforeImport.file},
    provenance: 'Unchanged played K1 campaign imported through normal UI. Two new raids of the same state are paid from post-activation net city production while that source is never visited. Original tank, tower and paid repairs fight on native RAF. Recovery is six strategic turns; no exact wall-clock guarantee is inferred from turn rounding. No live state/localStorage setters, prepared money, debug clocks or newly born full-campaign claim. Only 90 RAF intervals and at most three screenshots.'}, null, 2));
} catch (error) {
  await pause().catch(() => {});
  let continuation = null;
  try {
    const s = await read();
    if (s.mobilization && city(s)) continuation = (await exported('interrupted-campaign')).file;
  } catch (exportError) {console.error('Could not export the interrupted native campaign:', String(exportError));}
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({error: String(error), checks, errors, events, repairReceipts,
    continuation, state: compact(await read().catch(() => null)), diskFree: await freeDisk()}, null, 2));
  await shot('failure').catch(() => {}); console.error(error); process.exitCode = 1;
} finally {
  await browser.close();
}
