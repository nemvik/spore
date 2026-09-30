/** Complete, separate native military/conversion continuations of the played pre-J branch.
 * Run one mode at a time. No test clock, live setters, injected progress or prepared saves.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const modes = ['military', 'conversion'].filter(mode => process.argv.includes(`--${mode}`));
assert.equal(modes.length, 1, 'Pass exactly one of --military or --conversion');
const freshFinal = process.argv.includes('--fresh-final');
const mode = modes[0], base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5221';
const out = path.resolve(process.env.CIVILIZATION_PATHS_OUTPUT ?? (freshFinal ? `evidence/final-campaign/alternatives/${mode}` : `evidence/sp-009l/${mode}`));
const input = path.resolve(freshFinal ? 'evidence/final-campaign/civilization/27-earned-home-budget.save.json' : 'evidence/sp-009j/browser/paid-carriers.save.json');
const protectedCampaign = freshFinal ? path.resolve('evidence/final-campaign/organism/active-campaign.save.json') : null;
const protectedBytes = protectedCampaign ? await readFile(protectedCampaign) : null;
const resumeArg = process.argv.indexOf('--resume');
assert.ok(resumeArg < 0 || (process.argv[resumeArg + 1] && !process.argv[resumeArg + 1].startsWith('--')), '--resume needs the actual exported campaign path');
const resumePath = resumeArg < 0 ? process.env.CIVILIZATION_PATHS_RESUME : process.argv[resumeArg + 1];
const resumeFile = resumePath ? path.resolve(resumePath) : null;
assert.ok(!resumeFile || path.dirname(resumeFile) !== out, 'Preserve the original failure export in a separate output directory');
const resumeBytes = resumeFile ? await readFile(resumeFile) : null;
const previousReportPath = resumeFile ? path.join(path.dirname(resumeFile), 'failure.json') : null;
const previousReportBytes = previousReportPath ? await readFile(previousReportPath) : null;
const previousReport = previousReportBytes ? JSON.parse(previousReportBytes) : null;
if (previousReport) {
  assert.equal(previousReport.mode, mode);
  assert.equal(path.resolve(previousReport.recovery), resumeFile);
  assert.deepEqual(previousReport.errors, []);
}
const timeout = Number(process.env.LUMAVORA_NATIVE_TIMEOUT_MS ?? 900000);
assert.ok(Number.isFinite(timeout) && timeout >= 30000, 'Native step timeout must be at least 30 seconds');
assert.equal(new URL(base).searchParams.has('test'), false, 'Use the production URL without test mode');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputBytes = await readFile(input), inputHash = hash(inputBytes);
assert.equal(inputHash, freshFinal ? '8e4ce3837d2a87a3b3b6dd6d668dc4925cebaf9eb4747f0b7486f3f2759e7c0d' : '3f43b7406d6cc68ae33659ee7aa813aad27c64b0624d2f24ed6fc3677fc9e2ee', 'The exact played source changed');

// Read-only host helpers: parse exported state, inspect public rules and plan keyboard
// waypoints against physical city obstacles. None executes inside the live browser.
const ssr = await createServer({server: {middlewareMode: true, hmr: false, watch: null}, appType: 'custom', logLevel: 'error'});
const {parseGame} = await ssr.ssrLoadModule('/src/game/persistence.ts');
const {conversionQuote, conversionSite} = await ssr.ssrLoadModule('/src/game/conversion.ts');
const {cityHall, cityLot} = await ssr.ssrLoadModule('/src/game/city-spatial.ts');
const {CITY_BUILDINGS} = await ssr.ssrLoadModule('/src/game/city-economy.ts');
const {bodyCollisionRadius} = await ssr.ssrLoadModule('/src/game/body-shape.ts');
const {steerToward} = await ssr.ssrLoadModule('/src/game/navigation.ts');
const {vehicleStats} = await ssr.ssrLoadModule('/src/game/blueprint.ts');
const {civilizationInheritance, civilizationReadiness} = await ssr.ssrLoadModule('/src/game/civilization.ts');
await ssr.close();
const original = parseGame(inputBytes.toString()), oldHistory = JSON.stringify(original.lineageHistory.stages[4]);
const foreignIds = original.cities.entries.filter(c => c.owner.kind === 'state').map(c => c.id);
assert.equal(foreignIds.length, 4); assert.equal(original.machines.fleet.length, freshFinal ? 2 : 4);
assert.ok(original.machines.completed && original.machines.resource > (freshFinal ? 2000 : 800));
if(freshFinal){assert.equal(original.seed,8675309);assert.equal(original.player.generation,4);assert.ok(original.cities.entries.some(c=>c.founded.source==='player'&&c.economy.last?.hungry===0));}else assert.ok(original.maritime.vessel);
assert.ok(original.cities.entries.every(c => !c.capture && !c.transfers?.length));
await mkdir(out, {recursive: true});
const freeDisk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await freeDisk();
console.log(`${mode}: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free, ${timeout / 1000}s native timeout per step`);

const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1', ...(freshFinal && process.platform==='darwin' ? {args:['--use-gl=angle','--use-angle=metal']} : {})});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true});
// Long native campaigns intentionally record no trace or video.
const page = await context.newPage(), checks = [], events = [], errors = [], images = [], payments = [];
let tankId, firstFightShown = false, frames = [], downstream, completion, latestWait, build;
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const city = (s, id = s.homePlanet.currentLocationId) => s.cities.entries.find(c => c.id === id || c.address.locationId === id);
const allRaids = s => [...(s.military?.raids ?? []), ...(s.mobilization?.raids ?? [])];
const terminal = r => ['destroyed', 'returned', 'withdrawn'].includes(r.phase);
const unit = (s, id = tankId) => s.machines.fleet.find(u => u.id === id);
const design = (s, id) => s.machines.blueprints.find(b => b.id === unit(s, id).blueprint).blueprint;
const act = a => page.locator(`[data-action="${a}"]:visible`).first().click();
const check = message => {checks.push(message); console.log(message);};
const pause = async () => {if ((await read()).mode === 'game') await act('pause');};
const resume = async () => {if ((await read()).mode !== 'game') await act('close');};
const clean = s => {
  assert.equal(JSON.stringify(s.lineageHistory.stages[4]), oldHistory, 'Frozen regional history changed');
  for (const c of s.cities.entries) for (const t of c.transfers ?? []) {
    if (mode === 'military') assert.equal(t.method, undefined, 'Military branch used a peaceful transfer');
    else assert.equal(t.method, 'conversion', 'Conversion branch used another takeover method');
  }
  if (mode === 'conversion') {assert.ok(s.cities.entries.every(c => !c.capture)); assert.equal(allRaids(s).length, 0);}
  assert.equal(s.deathReason, null); assert.deepEqual(errors, [], 'Browser errors');
};
const compact = s => s && ({mode: s.mode, stage: s.stage, turn: s.states?.clock, amber: s.machines?.resource,
  tick: s.tick, homeElapsed: s.machines?.elapsed, fieldTime: s.navigation?.field?.world.time, planetElapsed: s.planet?.elapsed,
  location: s.homePlanet?.currentLocationId, actor: s.navigation?.field?.position,
  tank: unit(s), deployment: s.military?.deployment, raids: allRaids(s),
  cities: s.cities?.entries.map(c => ({id: c.id, owner: c.owner, fortification: c.fortification, guard: c.defense?.health,
    cycle: c.economy?.cycle, treasury: c.economy?.treasury, transfers: c.transfers?.length, rites: c.conversion?.events.length})),
  notice: s.navigation?.notice ?? s.military?.notice, civilization: s.civilization, planet: s.planet});
async function waitFor(label, predicate, inspect = () => {}) {
  const started = performance.now(), startedAt = new Date().toISOString(); let nextLog = started + 15000, s, first;
  while (performance.now() - started < timeout) {
    s = await read(); clean(s); inspect(s);
    const time = {tick: s.tick, turn: s.states.clock.turn, elapsed: s.states.clock.elapsed, fieldTime: s.navigation?.field?.world.time ?? null, homeElapsed: s.machines.elapsed, deploymentElapsed: s.military.deployment?.elapsed ?? null};
    first ??= time;
    latestWait = {label, startedAt, observedAt: new Date().toISOString(), seconds: (performance.now() - started) / 1000, first, latest: time,
      nativeStrategicSeconds: (time.turn - first.turn) * 10 + time.elapsed - first.elapsed};
    if (predicate(s)) {events.push(latestWait); return s;}
    if (performance.now() >= nextLog) {
      console.log(`${label}: wall ${latestWait.seconds.toFixed(1)}s / strategy ${latestWait.nativeStrategicSeconds.toFixed(1)}s, turn ${s.states.clock.turn}, ${s.cities.entries.filter(c => c.owner.kind === 'state').length} foreign, raid ${allRaids(s).filter(r => !terminal(r)).map(r => r.phase).join(',') || 'none'}`);
      nextLog = performance.now() + 15000;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`${label} timed out: ${JSON.stringify({wait: latestWait, state: compact(s)})}`);
}
async function imported(file) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  const asset = await page.locator('script[type="module"][src]').first().getAttribute('src');
  const response = await page.request.get(new URL(asset, base).href);
  assert.ok(response.ok(), 'Loaded production asset remains readable');
  const loaded = {asset, sha256: hash(await response.body())};
  if (build) assert.deepEqual(loaded, build, 'Production build changed during this native run'); else build = loaded;
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined', 'Native proof forbids a test clock');
  await pause(); const s = await read(); clean(s); assert.ok(s.mobilization && s.civilization); return s;
}
async function exported(name, validate = true) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const pending = page.waitForEvent('download'); await act('export');
  const file = path.join(out, `${name}.save.json`); await (await pending).saveAs(file);
  const bytes = await readFile(file, 'utf8'), saved = validate ? parseGame(bytes) : JSON.parse(bytes).state;
  if (validate) clean(saved); return {file, state: saved};
}
async function shot(name) {
  if (images.length >= 3) return;
  await page.locator('.city-panel,.field-panel').evaluateAll(es => es.forEach(e => {e.scrollTop = 0;}));
  if (mode === 'military' && name.includes('fight')) await page.locator('#military-panel').scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
}
const sampleFrames = () => page.evaluate(() => new Promise(resolve => {
  const values = []; let last;
  function sample(t) {if (last !== undefined) values.push(t - last); last = t;
    if (values.length === 90) resolve(values); else requestAnimationFrame(sample);}
  requestAnimationFrame(sample);
}));
async function visit(id) {
  await resume(); const s = await read();
  if (s.navigation.mode !== 'global') await page.keyboard.press('n');
  await page.locator('#travel-map').waitFor(); await act(`city-select:${id}`); await act(`city-enter:${id}`);
  await page.locator('#city-economy').waitFor(); clean(await read());
}
async function home() {
  await resume(); if ((await read()).navigation.mode === 'global') await page.keyboard.press('n');
  if ((await read()).navigation.field) await act('travel-home');
  assert.equal((await read()).navigation.field, null);
}
async function repairTank() {
  await home(); const before = await read(); assert.equal(before.military.deployment, null);
  assert.ok(unit(before)?.health > 0, 'The paid cannon tank was destroyed');
  const max = vehicleStats(design(before, tankId)).durability;
  if (unit(before).health >= max - 1e-6) return;
  await act(`machine-select:${tankId}`); await act('machine-repair'); const after = await read();
  assert.equal(unit(after).health, max);
  const income = (after.tick - before.tick) / 60 * before.machineIncome;
  assert.ok(Math.abs(after.machines.resource - (before.machines.resource - 10 + income)) < 1e-6, 'Repair must debit exactly ten amber apart from observed native spring income');
  payments.push({kind: 'repair', unitId: tankId, cost: 10, before: unit(before).health, after: max, turn: after.states.clock.turn, incomeDuringClicks: income});
}
async function returnTank() {
  const s = await read(), d = s.military.deployment;
  if (!d) return;
  if (s.homePlanet.currentLocationId !== city(s, d.cityId).address.locationId) await visit(d.cityId);
  if ((await read()).military.deployment.phase === 'outbound') await waitFor('Own tank arrives before retreat', s => s.military.deployment?.phase === 'field');
  if ((await read()).military.deployment.phase === 'field') await act('military:retreat');
  await waitFor('Own tank physically returns', s => s.military.deployment === null, s => assert.ok(unit(s)?.health > 0, 'Tank died while returning'));
}
async function deploy(id) {
  await repairTank(); await visit(id); await act(`military:deploy,${tankId}`);
  await waitFor('Paid cannon tank arrives', s => s.military.deployment?.phase === 'field', s => assert.ok(unit(s)?.health > 0));
  await act('military:camera');
}
async function showFirstFight() {
  if (firstFightShown) return;
  firstFightShown = true; frames = await sampleFrames(); await shot('native-fight-1024');
}
async function captureCity(id) {
  if (city(await read(), id).owner.kind === 'lineage') return;
  await deploy(id); await act('military:attack');
  if (!firstFightShown) {
    await waitFor('Actual reciprocal combat begins', s => city(s, id).defense.health < city(original, id).defense.health
      && unit(s).health < vehicleStats(design(s, tankId)).durability,
    s => assert.ok(unit(s)?.health > 0, 'Paid tank died before the combat sample'));
    await showFirstFight();
  }
  await waitFor('Guard and square genuinely defeated', s => {
    const c = city(s, id), live = allRaids(s).some(r => r.cityId === id && !terminal(r) && ['field', 'occupying', 'garrison', 'retreat'].includes(r.phase));
    return (!c.defense || c.defense.health === 0) && c.fortification === 0 && !live && !(c.economy?.buildings.some(b => b.kind === 'tower' && b.defense.health > 0));
  }, s => assert.ok(unit(s)?.health > 0, 'Paid tank died in city combat'));
  await act('military:occupy');
  const won = await waitFor('Five-second physical occupation completes', s => city(s, id).owner.kind === 'lineage', s => assert.ok(unit(s)?.health > 0));
  assert.ok(city(won, id).transfers.some(t => !t.method && t.to.kind === 'lineage'));
  check(`Military city ${id}: original defense and fortification defeated, actual occupation recorded`);
  await returnTank(); await repairTank();
}
async function resolveRaid(id) {
  let s = await read(), r = allRaids(s).find(r => r.id === id); if (!r || terminal(r)) return;
  const targetId = r.cityId; await deploy(targetId); s = await read();
  await act(city(s, targetId).owner.kind === 'lineage' ? 'military:defend' : 'military:attack');
  const ended = await waitFor('Paid counterraid fights and resolves', s => terminal(allRaids(s).find(r => r.id === id)), s => assert.ok(unit(s)?.health > 0, 'Paid defender died'));
  r = allRaids(ended).find(r => r.id === id);
  assert.ok(r.unit.health < vehicleStats(r.blueprint).durability || r.phase === 'withdrawn', 'A completed timer alone is not proof of combat');
  if (city(ended, targetId).owner.kind === 'state') {
    await act('military:attack'); await waitFor('Recaptured square is cleared', s => city(s, targetId).fortification === 0);
    await act('military:occupy'); await waitFor('Own city physically reclaimed', s => city(s, targetId).owner.kind === 'lineage');
  }
  await showFirstFight(); await returnTank(); await repairTank(); check(`Resolved counterraid ${id}: ${r.phase}, remaining health ${r.unit.health}`);
}
async function militaryPath() {
  if (resumeFile) {
    const s = await read(), existing = s.machines.fleet.find(u => design(s, u.id).name === 'Strážce sjednocení');
    assert.ok(existing && vehicleStats(design(s, existing.id)).module === 'cannon', 'Resume requires the actually paid cannon tank');
    tankId = existing.id; await resume(); await returnTank(); await repairTank();
    check('Continued the exported native military branch, preserving its actual conquests, payments and damaged tank');
  } else {
  await home(); await act('machine-editor:tank'); await act('select:vehicle-drill'); await act('remove'); await act('add:cannon');
  await page.locator('[data-genome="name"]').fill('Strážce sjednocení'); await page.locator('[data-genome="name"]').press('Tab');
  const before = await read(), price = before.editor.cost;
  assert.ok(before.editor.draft.parts.some(p => p.kind === 'cannon')); await act('confirm-editor');
  let s = await read(); tankId = s.machines.fleet.at(-1).id;
  assert.equal(s.machines.fleet.length, before.machines.fleet.length + 1);
  const income = (s.tick - before.tick) / 60 * before.machineIncome;
  assert.ok(Math.abs(s.machines.resource - (before.machines.resource - price + income)) < 1e-6);
  payments.push({kind: 'construction', unitId: tankId, cost: price, blueprint: design(s, tankId)});
  check('Actual cannon created by removing the drill in the editor and paid from the unchanged played carrier branch');
  }
  let s;
  for (const [index, state] of original.states.entries.entries()) {
    const targets = foreignIds.filter(id => city(original, id).owner.id === state.id);
    await captureCity(targets[0]);
    s = await waitFor('Original finite-reserve counterraid is paid', s => allRaids(s).some(r => r.stateId === state.id));
    await resolveRaid(allRaids(s).find(r => r.stateId === state.id && !terminal(r))?.id);
    if (index === 0) {
      // Leave the real remaining source intact until at least one K2 army earns
      // and pays its own forty amber. This is native waiting, not a fixture.
      s = await waitFor('K2 army earns and pays a renewed counterattack', s => s.mobilization.purchases.some(p => p.stateId === state.id));
      const p = s.mobilization.purchases.find(p => p.stateId === state.id);
      assert.equal(p.cost, 40); await resolveRaid(p.id);
    }
    await captureCity(targets[1]);
    for (const r of allRaids(await read()).filter(r => r.stateId === state.id && !terminal(r))) await resolveRaid(r.id);
  }
  // Any city lost during an earlier counterattack is a real military recapture.
  for (let pass = 0; pass < 8; pass++) {
    const s = await read(), pending = allRaids(s).filter(r => !terminal(r)), foreign = s.cities.entries.filter(c => c.owner.kind === 'state');
    if (!pending.length && !foreign.length) break;
    for (const r of pending) await resolveRaid(r.id);
    for (const c of foreign) await captureCity(c.id);
  }
  await returnTank(); await home(); s = await read();
  assert.equal(s.cities.entries.filter(c => c.owner.kind === 'state').length, 0); assert.ok(allRaids(s).every(terminal));
  assert.ok(s.mobilization.purchases.length > 0); assert.ok(payments.some(p => p.kind === 'repair'));
}

/** Keyboard-only locomotion. Read-only route hints mirror the city collision map;
 * all positions are produced by native WASD frames and checked after each burst.
 */
async function walkTo(goal, tolerance = 1.6, planetary = false) {
  const started = performance.now(); let stationarySince = performance.now(), previous;
  await page.locator('canvas').first().click({position: {x: 500, y: 310}});
  while (performance.now() - started < timeout) {
    const s = await read(); clean(s); assert.equal(s.mode, 'game');
    const p = planetary ? unit(s, s.planet.activeMachine).pos : s.navigation.field.position;
    if (Math.hypot(goal.x - p.x, goal.z - p.z) <= tolerance) return;
    if (!previous || Math.hypot(p.x - previous.x, p.z - previous.z) > .02) stationarySince = performance.now();
    assert.ok(performance.now() - stationarySince < 8000, `Native movement blocked: ${JSON.stringify({p, goal})}`); previous = {...p};
    let waypoint = goal;
    if (!planetary) {
      const c = city(s), hall = cityHall(c.address.position);
      const shapes = [hall, ...c.economy.buildings.map(b => ({...cityLot(c, b.lot), radius: CITY_BUILDINGS[b.kind].radius}))];
      const world = {...s.navigation.field.world, stage: 2, obstacles: shapes.map((o, id) => ({id, kind: 'rock', pos: {x: o.x, y: -20, z: o.z}, radius: o.radius, height: 40}))};
      waypoint = steerToward(world, p, {...goal, y: p.y}, bodyCollisionRadius(s.player.genome, 2) + .5, s.navigation.field.heading, true);
    }
    const dx = waypoint.x - p.x, dz = waypoint.z - p.z, yaw = s.camera.yaw;
    const x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw), keys = [];
    if (Math.abs(x) > .08 && Math.abs(x) >= Math.abs(z) * .4) keys.push(x > 0 ? 'd' : 'a');
    if (Math.abs(z) > .08 && Math.abs(z) >= Math.abs(x) * .4) keys.push(z > 0 ? 's' : 'w');
    assert.ok(keys.length, 'Route planner returned no reachable keyboard direction');
    const speed = planetary ? vehicleStats(design(s, s.planet.activeMachine)).speed : 8;
    for (const key of keys) await page.keyboard.down(key);
    try {await page.waitForTimeout(Math.min(140, Math.max(18, Math.hypot(dx, dz) / speed * 650)));}
    finally {for (const key of keys) await page.keyboard.up(key);}
  }
  throw new Error(`Native walking timed out at ${JSON.stringify(goal)}`);
}
async function conversionPath() {
  for (const id of foreignIds) {
    await visit(id);
    for (let attempt = 0; attempt < 10; attempt++) {
      let s = await read(), c = city(s, id), q = conversionQuote(s, c);
      assert.ok(q.available, q.reason); if (q.progress >= q.required) break;
      await walkTo(conversionSite(s, c));
      const text = await page.locator('#conversion-panel .conversion-objection').innerText();
      const response = text.includes('vzájemné pomoci') ? 'sharing' : text.includes('násilného') ? 'peace' : text.includes('místní tradici') ? 'memory' : null;
      assert.ok(response, `Unknown visible objection: ${text}`);
      s = await read(); c = city(s, id); const count = c.conversion.events.length;
      await act(`conversion:${response}`);
      const after = await waitFor('Walked rite is accepted and paid', s => city(s, id).conversion.events.length > count);
      const receipt = city(after, id).conversion.events.at(-1);
      assert.equal(receipt.payment.amount, 20); assert.equal(receipt.payment.before - receipt.payment.after, 20); assert.equal(receipt.after, receipt.before + 1);
      payments.push({kind: 'rite', cityId: id, eventId: receipt.id, turn: receipt.turn, cost: 20, position: receipt.position});
      if (!frames.length) frames = await sampleFrames();
    }
    let s = await read(); assert.ok(conversionQuote(s, city(s, id)).progress >= conversionQuote(s, city(s, id)).required);
    await walkTo(city(s, id).address.position, 4);
    for (let attempt = 0; attempt < 20 && city(await read(), id).owner.kind === 'state'; attempt++) {
      await act('conversion:offer'); await act('conversion:confirm');
      if (city(await read(), id).owner.kind === 'state') {
        const turn = (await read()).states.clock.turn;
        await waitFor('Refresh stale or same-turn final rite', s => s.states.clock.turn > turn);
      }
    }
    s = await read(); assert.equal(city(s, id).owner.kind, 'lineage');
    const receipt = city(s, id).transfers.at(-1); assert.equal(receipt.method, 'conversion');
    assert.equal(city(s, id).defense.health, city(original, id).defense.health); assert.equal(city(s, id).fortification, 80);
    payments.push({kind: 'conversion', cityId: id, spent: receipt.spent, turn: receipt.turn});
    check(`Conversion city ${id}: all physical rites and final receipt, spent ${receipt.spent}; original defense preserved`);
    if (!images.length) {await act('city-camera'); await shot('converted-city-1024');}
  }
  assert.equal((await read()).cities.entries.filter(c => c.owner.kind === 'state').length, 0); await home();
}

async function inheritedEffect() {
  let s = await read(); const inherited = civilizationInheritance(s);
  assert.deepEqual(inherited.methods, [mode]); assert.equal(inherited[mode === 'military' ? 'power' : 'recovery'], 1.2);
  assert.equal(inherited.consumption, 1);
  if (mode === 'military') {
    const drill = s.machines.fleet.find(u => vehicleStats(design(s, u.id)).module === 'drill'); assert.ok(drill);
    await act(`planet-vehicle:${drill.id}`); await act('planet-tool'); const before = await read();
    const sampled = await sampleFrames(); await pause(); const after = await read(), n = after.tick - before.tick, dt = 1 / 60, r = 1 - .035 * dt;
    const power = vehicleStats(design(before, drill.id)).power * 1.2, accumulated = (1 - r ** n) / (1 - r);
    const expectedAtmosphere = -.88 + (before.planet.atmosphere + .88) * r ** n + power * .009 * dt * accumulated;
    assert.ok(n > 30); assert.ok(Math.abs(after.planet.atmosphere - expectedAtmosphere) < 1e-7, 'Actual tool must apply inherited 20% power');
    downstream = {kind: 'tool-power', coefficient: 1.2, nativeSteps: n, seconds: n * dt, before: before.planet.atmosphere, after: after.planet.atmosphere, expected: expectedAtmosphere, frames: sampled};
    await resume(); await act('planet-tool');
  } else {
    const air = s.machines.fleet.find(u => design(s, u.id).carrier === 'air' && vehicleStats(design(s, u.id)).module === 'seeder'); assert.ok(air);
    await act(`planet-vehicle:${air.id}`); s = await read();
    const nursery = s.planet.nursery.sources.find(r => r.key === 'culture:6'), resource = s.world.resources.find(r => r.id === nursery.resourceId);
    await walkTo(resource.pos, 2, true); await act('planet-biome:0');
    const sample = page.locator(`[data-action="planet-sample:culture:${resource.id}"]:visible`); if (await sample.count()) await sample.click();
    await act('planet-tool'); await waitFor('Inherited seeder genuinely reaches T1', s => s.planet.tScore >= 1);
    s = await read(); const biome = s.planet.biomes[0]; await walkTo(biome.pos, 3, true); await act(`planet-biome:${biome.id}`);
    await act(`planet-introduce:${biome.id}:culture:6`); const before = await read(), root = before.planet.stabilizers.find(r => r.key === 'culture:6'); assert.ok(root);
    const sampled = await sampleFrames(); await pause(); const after = await read(), seconds = after.planet.elapsed - before.planet.elapsed;
    const live = after.planet.stabilizers.find(r => r.id === root.id), expected = root.site.vitality + .25 * 1.2 * seconds;
    assert.ok(seconds > 1 && after.planet.tScore >= 1); assert.ok(Math.abs(live.site.vitality - expected) < 1e-7, 'Actual positive root recovery must include inherited 20%');
    downstream = {kind: 'positive-life-recovery', coefficient: 1.2, seconds, rootId: root.id, before: root.site.vitality, after: live.site.vitality, expected, frames: sampled};
    await resume(); await act('planet-tool');
  }
  await page.locator('[data-civilization-effect]').scrollIntoViewIfNeeded(); await shot('inherited-effect-1024');
  check(`${mode} inheritance used by the real next-stage simulation, not just displayed in the journal`);
}

try {
  if (resumeFile) {
    assert.equal(mode, 'military', 'Only the exported military continuation currently has a resume path');
    const resumed = await imported(resumeFile); assert.equal(resumed.stage, 4);
    check(`Resumed real native campaign export ${resumeFile}; original frozen regional history still exact`);
  } else {
    await imported(input); await home(); assert.ok(await page.locator('[data-action="machine-next"]').isDisabled());
    await page.keyboard.press('g'); assert.equal((await read()).stage, 4);
    check(freshFinal ? 'Exact native new-lineage budget prefix imported in a separate branch; four foreign cities still block the gate' : 'Unmodified paid pre-J carrier branch imported; four real foreign cities still block the regional shortcut');
  }
  if (mode === 'military') await militaryPath(); else await conversionPath();
  // If all captured cities lack a fresh funded cycle, operate one through its UI.
  let ready = civilizationReadiness(await read());
  if (!ready.governingCity) {
    const c = (await read()).cities.entries.find(c => c.owner.kind === 'lineage' && c.economy?.residents.length);
    assert.ok(c); await visit(c.id);
    if (city(await read()).economy.treasury < 20) {await act('city-econ:fund'); await act('city-econ:confirm');}
    await waitFor('Owned city completes a funded productive cycle', s => civilizationReadiness(s).governingCity !== null);
    await home(); ready = civilizationReadiness(await read());
  }
  assert.ok(ready.ready, ready.reasons.join('\n'));
  await shot('all-cities-unified-1024'); const checkpoint = await exported('before-space-checkpoint'); await resume();
  await page.keyboard.press('g'); await waitFor('Ordinary G crosses the complete civilization gate', s => s.stage === 5);
  let s = await read(); completion = structuredClone(s.civilization.completed); assert.ok(completion);
  assert.equal(completion.cities.length, original.cities.entries.length); clean(s);
  check('Every city unified, commitments resolved, units returned, functioning economy retained; normal G enters stage five');
  await inheritedEffect();
  const final = await exported('active-campaign');
  if (final.state.checkpoint) await writeFile(path.join(out, 'active-checkpoint.json'), final.state.checkpoint);
  await imported(final.file); await act('save');
  if ((await read()).mode !== 'saves') await act('saves');
  const load = await page.locator('button[data-action^="load:"]').first().getAttribute('data-action'); assert.ok(load);
  await page.reload(); await act('saves'); await act(load); await pause(); s = await read(); clean(s);
  assert.equal(s.stage, 5); assert.deepEqual(s.civilization.completed, completion);
  assert.deepEqual(s.cities.entries.map(c => [c.capture, c.transfers, c.conversion]), final.state.cities.entries.map(c => [c.capture, c.transfers, c.conversion]));
  check('Public export/import/rekey and save/reload/load preserve complete pure-method history and inherited next-stage state');
  assert.equal(hash(await readFile(input)), inputHash); assert.deepEqual(errors, []);
  if(protectedCampaign)assert.deepEqual(await readFile(protectedCampaign),protectedBytes,'Main campaign changed during the isolated alternative');
  const sorted = [...frames].sort((a, b) => a - b), percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
  await writeFile(path.join(out, 'result.json'), JSON.stringify({mode, checks, errors, events, payments, completion, downstream,
    build, images, checkpoint: checkpoint.file, active: final.file, source: {path: input, sha256: inputHash, historySha256: hash(oldHistory), resumed: resumeFile ? {path: resumeFile, sha256: hash(resumeBytes), report: previousReportPath, reportSha256: hash(previousReportBytes)} : null},
    runs: previousReport ? {
      'legacy-run': {outcome: 'native wall timeout; exact export preserved for continuation', report: previousReportPath, reportSha256: hash(previousReportBytes), checks: previousReport.checks, events: previousReport.events, payments: previousReport.payments, recovery: previousReport.recovery, finalClock: previousReport.state.turn},
      'resumed-run': {build, checks, events, payments}
    } : undefined,
    nativeFrames: {count: frames.length, p50: percentile(.5), p95: percentile(.95), max: Math.max(...frames)},
    disk: {before: diskBefore, after: await freeDisk()},
    provenance: 'Unmodified actually played pre-J carrier export. Separate pure-method branch, ordinary UI/keyboard and native RAF throughout. Read-only host helpers only inspect rules and plan collision-safe keyboard routes. No live state writes, injected resources, prepared progress, test clock or time acceleration. This historical continuation is not a new campaign from birth. Human comprehension and listening remain pending.'}, null, 2));
  console.log(JSON.stringify({mode, checks: checks.length, errors, images: images.length}));
} catch (error) {
  for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key).catch(() => {});
  const state = await read().catch(() => null); let recovery;
  try {recovery = (await exported('failure-campaign', false)).file;} catch (exportError) {recovery = `Export failed: ${exportError}`;}
  await shot('failure').catch(() => {});
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({error: String(error), stack: error?.stack, mode, build, checks, errors, events, payments, latestWait, recovery, source: {path: input, sha256: inputHash, historySha256: hash(oldHistory), resumed: resumeFile ? {path: resumeFile, sha256: hash(resumeBytes), report: previousReportPath, reportSha256: hash(previousReportBytes)} : null}, state: compact(state)}, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  await browser.close();
}
