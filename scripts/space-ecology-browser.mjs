/** C3a2 native ecology continuation: public UI, actual RAF, actual descendants. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const resumeHot = process.argv.includes('--resume-hot');
const out = path.resolve(process.env.LUMAVORA_OUT ?? (resumeHot ? 'evidence/sp-012a2/continuation' : 'evidence/sp-012a2/browser'));
const source = path.resolve('evidence/sp-012a1/browser/active-campaign.save.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
const continuationFile = path.resolve('evidence/sp-012a2/browser/failure-campaign.save.json');
const continuationBytes = resumeHot ? await readFile(continuationFile) : null;
if (resumeHot) assert.equal(hash(continuationBytes), 'efc83ac3625e7653b4e57a8b25c8e7c9f83966b53362e4f44f14bbc550f597a9');
assert.equal(sourceHash, 'c9ceea1f68c9c5d0392ee202be04046ac9792b077fbe781b468df56f345d0009');
assert.equal(original.space.location, null); assert.equal(original.space.expedition.biosphere.version, 1);
assert.equal(original.space.expedition.cargo.length, 1); assert.ok(original.space.expedition.cargo[0].id.endsWith(':life-11'));
assert.equal(new URL(base).searchParams.has('test'), false);
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native ecology: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transfers = [], batches = [], rekeys = [], observations = [], lifecycle = [];
const frozenWorlds = new Map(), heldCargo = new Map();
const roles = ['culture:7', 'culture:8', 'culture:6', 'species:bell', 'species:gnaw', 'species:crest'];
const specimen = original.space.expedition.cargo[0], originId = specimen.originPlanetId;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null, finalExport = null;
let hotId = null, coldId = null;
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = state => state.space.expedition;
const activeWorld = state => expedition(state).worlds.find(world => world.id === state.space.location?.planetId);
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function homeExport(state) {const v = structuredClone(state); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function priorEcology(e) {const value = structuredClone(e); value.biosphere.version = 1; delete value.biosphere.ecology; for (const w of value.worlds) delete w.biosphere.ecologyElapsed; return value;}
const counts = world => [1, 2, 3].map(band => roles.map(key => world.life.filter(life => life.habitat.band === band && life.taxonKey === key).length));
const capacity = world => {let n = 0; for (const time of world.biosphere.stableFor) {if (time < 10 - 1e-8) break; n++;} return n;};
function summary(world) {return {id: world.id, elapsed: world.elapsed, population: world.life.length, counts: counts(world), capacity: capacity(world), climate: [world.temperature, world.atmosphere], minimumHealth: Math.min(...world.life.map(l => l.health)), minimumNutrition: Math.min(...world.life.map(l => l.nutrition)), descendants: world.life.filter(l => l.habitat.birth).length};}
function intact(state) {
  assert.equal(state.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(state.space.ship.creation, original.space.ship.creation); assert.deepEqual(state.space.ship.purchase, original.space.ship.purchase);
  const e = expedition(state); assert.equal(e.version, 2); assert.equal(e.biosphere.version, 2);
  const all = [...e.cargo, ...e.worlds.flatMap(w => w.life)]; assert.equal(new Set(all.map(l => l.id)).size, all.length);
  for (const origin of e.biosphere.origins) for (let role = 0; role < roles.length; role++)
    assert.equal(all.filter(l => l.originPlanetId === origin.planetId && l.taxonKey === roles[role]).length, 6 + origin.births[role] - origin.deaths[role], 'Paid transfers and actual births/deaths must conserve physical life');
  assert.equal(e.energySpent, e.biosphere.paidScans + 2 * e.biosphere.paidTransfers);
  for (const life of e.cargo) {if (heldCargo.has(life.id)) assert.deepEqual(life, heldCargo.get(life.id), 'Cargo physiology advanced'); else heldCargo.set(life.id, structuredClone(life));}
  for (const id of heldCargo.keys()) if (!e.cargo.some(l => l.id === id)) heldCargo.delete(id);
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(e.worlds.find(w => w.id === id), snapshot, `Inactive planet advanced: ${id}`);
  for (const old of original.space.expedition.worlds) assert.deepEqual(e.worlds.find(w => w.id === old.id).designs, old.designs, 'Origin model changed');
  if (frozenHome) assert.deepEqual(homePublic(state), frozenHome, 'Domestic state advanced during flight');
}
async function until(label, predicate, ceiling = 120000, interval = 80) {
  const start = performance.now(); let state, reportAt = 15000;
  while (performance.now() - start < ceiling) {
    state = await read(); intact(state); if (predicate(state)) return state;
    if (performance.now() - start > reportAt) {console.log(label, JSON.stringify(activeWorld(state) ? summary(activeWorld(state)) : state.space.location)); reportAt += 15000;}
    await page.waitForTimeout(interval);
  }
  throw new Error(`${label}: native wall ceiling; ${JSON.stringify({location: state?.space.location, notice: state?.space.notice, world: activeWorld(state) ? summary(activeWorld(state)) : null})}`);
}
async function detail(id, open = true) {if ((await page.locator(`#${id}`).getAttribute('open') !== null) !== open) await page.locator(`#${id} > summary`).click();}
async function pause() {if ((await read()).mode === 'game') await act('pause');}
async function resume() {if ((await read()).mode !== 'game') await act('close'); await until('Resume', s => s.mode === 'game');}
async function exported(filename) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const pending = page.waitForEvent('download'); await act('export'); const stream = await (await pending).createReadStream(); assert.ok(stream);
  const chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks), value = JSON.parse(bytes.toString());
  assert.equal(value.format, 'lumavora'); if (filename) await writeFile(path.join(out, filename), bytes); return {bytes, value, sha256: hash(bytes)};
}
async function importCampaign(file) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); intact(await read());
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const asset = await page.evaluate(() => ({url: location.href, modules: [...document.querySelectorAll('script[type="module"][src]')].map(n => n.src), styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(n => n.href)}));
  assert.ok(asset.modules.length && asset.modules.every(url => new URL(url).pathname.includes('/assets/')));
  if (assets.length) assert.deepEqual(asset.modules, assets[0].modules); assets.push(asset); console.log('Production asset', asset.modules);
}
async function frames(count = 90) {return page.evaluate(count => new Promise((resolve, reject) => {const values = []; let last; const timer = setTimeout(() => reject(new Error('Native RAF stalled')), 60000); function frame(t) {if (last !== undefined) values.push(t - last); last = t; if (values.length === count) {clearTimeout(timer); resolve(values);} else requestAnimationFrame(frame);} requestAnimationFrame(frame);}), count);}
const stats = values => {const v = [...values].sort((a, b) => a - b); return {count: v.length, p50: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1)};};
const resources = state => Object.fromEntries(['geometries', 'textures', 'programs', 'drawCalls'].map(key => [key, state.render[key]]));
async function shot(name, selector = '#space-climate .space-habitats') {assert.ok(images.length < 4); if (selector) await page.locator(selector).scrollIntoViewIfNeeded(); const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);}
async function hold(key, label, predicate) {await page.locator('.space-heading h2').click(); await page.keyboard.down(key); try {return await until(label, predicate);} finally {await page.keyboard.up(key);}}
async function near(point) {
  await page.locator('.space-heading h2').click(); const started = performance.now();
  while (performance.now() - started < 90000) {const s = await read(); intact(s); const pos = s.space.location.pos, dx = point.x - pos.x, dz = point.z - pos.z; if (Math.hypot(dx, dz) <= 1.8) return s;
    const yaw = s.camera.yaw, x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const key = Math.abs(x) > Math.abs(z) ? x > 0 ? 'd' : 'a' : z > 0 ? 's' : 'w';
    await page.keyboard.down(key); try {await page.waitForTimeout(Math.min(160, Math.max(35, Math.hypot(dx, dz) * 12)));} finally {await page.keyboard.up(key);}
  } throw new Error('Normal WASD approach failed');
}
async function scale(key, target) {
  await page.locator('.space-heading h2').click(); const before = await read(); await page.keyboard.press(key);
  const during = await until(`Start ${target}`, s => !!s.space.leg); assert.equal(during.space.leg.to.scale, target); assert.equal(during.space.leg.duration, 3); assert.equal(expedition(during).biosphere.tool, 'off');
  const after = await until(`Arrive ${target}`, s => !s.space.leg && s.space.location.scale === target); assert.ok(after.space.elapsed - before.space.elapsed >= 3);
  legs.push({from: before.space.location, to: after.space.location, duration: 3}); return after;
}
async function ascend() {
  if ((await read()).space.location.pos.y < 21) await hold('q', 'Ascend', s => s.space.location.pos.y >= 21);
  await scale('r', 'orbit'); const s = await read(), w = activeWorld(s); if (w) frozenWorlds.set(w.id, structuredClone(w)); await scale('r', 'system');
}
async function surface() {await scale('v', 'orbit'); frozenWorlds.delete((await read()).space.location.planetId); await scale('v', 'surface'); await hold('c', 'Transfer altitude', s => s.space.location.pos.y <= 2.8);}
async function jump(index) {
  await detail('space-star-map'); let row; for (const item of await page.locator('.space-star-list > section').all()) if ((await item.locator('b').innerText()).startsWith(`${index === 0 ? '⌂' : index} ·`)) {row = item; break;}
  assert.ok(row); const button = row.locator('button'), action = await button.getAttribute('data-action'), start = performance.now(); assert.ok(action.startsWith('space-jump:'));
  while (await button.isDisabled()) {assert.ok(performance.now() - start < 90000, await row.innerText()); await page.waitForTimeout(200);}
  const before = await read(); await button.click(); const during = await until('Interstellar leg', s => !!s.space.leg); assert.equal(during.space.leg.duration, 6);
  const target = during.space.leg.to.systemId; assert.equal(target, action.slice('space-jump:'.length)); await detail('space-star-map', false);
  const after = await until('Interstellar arrival', s => !s.space.leg && s.space.location.systemId === target); assert.ok(after.space.elapsed - before.space.elapsed >= 6);
  legs.push({from: before.space.location, to: after.space.location, duration: 6, paid: during.space.leg.energyPaid});
}
async function travel(index) {await ascend(); await jump(index); await surface();}
async function tool(kind, id, band) {
  const before = await read(), serial = expedition(before).nextAction, button = page.locator(`button[data-action="space-${kind}:${id}"]:visible`).first();
  await until(`Energy for ${kind}`, s => s.space.ship.energy >= (kind === 'scan' ? 1 : 2));
  assert.equal(await button.isDisabled(), false, `${kind} disabled: ${await page.locator('#space-biology').innerText()}`);
  await button.click(); const after = await until(`${kind} receipt`, s => expedition(s).actions.some(a => a.serial >= serial && a.kind === kind && a.lifeId === id));
  const receipt = expedition(after).actions.find(a => a.serial >= serial && a.kind === kind && a.lifeId === id);
  assert.equal(receipt.energyPaid, kind === 'scan' ? 1 : 2); if (band) assert.equal(receipt.band, band); transfers.push(receipt); return after;
}
async function waitStock(label) {return until(label, s => counts(activeWorld(s)).every(row => row.every(n => n >= 3)) && capacity(activeWorld(s)) === 3, 300000, 250);}
async function gather(label, newbornPlace) {
  await detail('space-biology'); await waitStock(`${label} real replacement offspring`); const initial = await read(), chosen = [];
  for (const role of [0, 1, 2, 3, 4, 3, 4, 5]) {
    const s = await until(`${label} healthy surplus ${roles[role]}`, s => activeWorld(s).life.some(l => l.taxonKey === roles[role] && l.health >= 60 && l.nutrition >= .3 && counts(activeWorld(s))[l.habitat.band - 1][role] > 2), 180000, 250);
    const w = activeWorld(s), p = s.space.location.pos;
    const candidates = w.life.filter(l => l.taxonKey === roles[role] && l.health >= 60 && l.nutrition >= .3 && counts(w)[l.habitat.band - 1][role] > 2);
    candidates.sort((a, b) => Number(!!b.habitat.birth && (!newbornPlace || b.habitat.birth.planetId === newbornPlace)) - Number(!!a.habitat.birth && (!newbornPlace || a.habitat.birth.planetId === newbornPlace)) || Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
    const life = candidates[0]; await page.locator('#space-specimen').selectOption(life.id); await near(life.pos);
    if (!expedition(await read()).scans.some(scan => scan.lifeId === life.id)) await tool('scan', life.id);
    const collected = await tool('collect', life.id, life.habitat.band); const physical = expedition(collected).cargo.find(item => item.id === life.id); assert.ok(physical); chosen.push(structuredClone(physical));
    console.log(`${label} cargo ${chosen.length}/8: ${life.id}, band ${life.habitat.band}`);
  }
  const final = await read(); assert.equal(expedition(final).cargo.length, 8); assert.ok(counts(activeWorld(final)).every(row => row.every(n => n >= 2)));
  if (newbornPlace) assert.ok(chosen.some(l => l.habitat.birth?.planetId === newbornPlace), 'Destination must receive an actual locally born descendant');
  batches.push({label, source: summary(activeWorld(initial)), after: summary(activeWorld(final)), specimens: chosen}); return chosen;
}
const centers = [{x: -14, z: 0}, {x: 14, z: 0}, {x: 0, z: 18}];
async function seedBand(band, label) {
  await detail('space-biology'); await page.locator('#space-habitat-band').selectOption(String(band)); await near(centers[band - 1]);
  const cargo = [...expedition(await read()).cargo]; let shift = 0;
  for (const life of cargo) {
    const button = page.locator(`button[data-action="space-release:${life.id}"]:visible`).first();
    await until('Release energy', s => s.space.ship.energy >= 2);
    while (await button.isDisabled()) {assert.ok(++shift <= 5, 'No release location reachable by normal movement'); await near({x: centers[band - 1].x + shift * 4, z: centers[band - 1].z + 5});}
    const after = await tool('release', life.id, band), placed = activeWorld(after).life.find(l => l.id === life.id); assert.ok(placed); assert.equal(placed.originPlanetId, life.originPlanetId); assert.equal(placed.taxonKey, life.taxonKey); assert.deepEqual(placed.habitat.birth, life.habitat.birth);
  }
  const stable = await until(`${label} band ${band} truly stable`, s => capacity(activeWorld(s)) >= band, 180000, 250); assert.equal(expedition(stable).cargo.length, 0);
  observations.push({label: `${label} planted band ${band}`, world: summary(activeWorld(stable)), demography: structuredClone(expedition(stable).biosphere.origins)});
  console.log(`${label} planted band ${band}`, JSON.stringify(summary(activeWorld(stable))));
}
async function stableObservation(label, seconds = 30) {
  await detail('space-climate'); await act('space-climate:off'); const before = await until(`${label} initially stable`, s => capacity(activeWorld(s)) === 3, 180000, 250);
  let stableSince = activeWorld(before).elapsed;
  const after = await until(`${label} ${seconds} consecutive stable seconds with tools off`, s => {const w = activeWorld(s); if (capacity(w) !== 3) stableSince = w.elapsed; return capacity(w) === 3 && w.elapsed - stableSince >= seconds;}, 240000, 250);
  assert.equal(expedition(after).biosphere.tool, 'off'); assert.equal(capacity(activeWorld(after)), 3);
  const text = await page.locator('#space-climate').innerText(); assert.match(text, /Stabilní kapacita: 3 \/ 3 pásy/);
  assert.ok(activeWorld(after).life.some(l => l.taxonKey === 'species:crest' && l.habitat.sinceHunt < 20), 'Actual prey meals must support predators');
  observations.push({label, stableSince, stableSeconds: activeWorld(after).elapsed - stableSince, before: summary(activeWorld(before)), after: summary(activeWorld(after)), demography: structuredClone(expedition(after).biosphere.origins), text}); return after;
}
async function checkpoint(label) {
  await pause(); const stopped = await read(); await page.waitForTimeout(350); assert.deepEqual((await read()).space, stopped.space);
  await act('save'); const before = await exported(`${label}.save.json`); assert.deepEqual(homeExport(before.value.state), home);
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported();
  assert.notEqual(after.value.state.id, before.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  const a = before.value.state.space.expedition, b = after.value.state.space.expedition; assert.deepEqual(b.cargo, a.cargo); assert.deepEqual(homeExport(after.value.state), home);
  for (const w of a.worlds) if (w.id !== before.value.state.space.location.planetId) assert.deepEqual(b.worlds.find(other => other.id === w.id), w);
  for (const oa of a.biosphere.origins) {const ob = b.biosphere.origins.find(v => v.planetId === oa.planetId); for (let r = 0; r < 6; r++) {assert.ok(ob.births[r] >= oa.births[r]); assert.ok(ob.deaths[r] >= oa.deaths[r]);}}
  rekeys.push({label, from: before.value.state.id, to: after.value.state.id, file: path.join(out, `${label}.save.json`), sha256: before.sha256, population: a.worlds.map(summary)}); await resume();
}

try {
  let state;
  if (resumeHot) {
    const prior = JSON.parse(await readFile(path.resolve('evidence/sp-012a2/browser/failure.json'), 'utf8'));
    for (const [array, key] of [[checks, 'checks'], [assets, 'assets'], [images, 'images'], [legs, 'legs'], [transfers, 'transfers'], [batches, 'batches'], [rekeys, 'rekeys'], [observations, 'observations']]) array.push(...prior[key]);
    const saved = JSON.parse(continuationBytes).state;
    assert.equal(saved.space.expedition.cargo.length, 0); hotId = saved.space.location.planetId;
    assert.equal(saved.space.location.scale, 'surface'); assert.equal(saved.space.expedition.worlds.find(w => w.id === hotId).life.length, 42);
    for (const w of saved.space.expedition.worlds) if (w.id !== hotId) frozenWorlds.set(w.id, structuredClone(w));
    home = homeExport(saved); await importCampaign(continuationFile); frozenHome = homePublic(await read());
    check('Continued the exact public failure export; prior attempt failed a harness race with a real newborn predator, not a browser/runtime error. Its failed diagnostics remain preserved');
  } else {
  await importCampaign(source); const imported = await exported('ecology-activation.save.json'), e = imported.value.state.space.expedition;
  assert.deepEqual(priorEcology(e), original.space.expedition); assert.deepEqual(e.cargo[0], specimen);
  assert.equal(e.biosphere.ecology.activatedAt, original.space.elapsed); assert.equal(e.biosphere.ecology.activatedAction, original.space.expedition.nextAction);
  const cp = JSON.parse(imported.value.state.checkpoint); assert.equal(cp.space.expedition.biosphere.version, 2);
  assert.deepEqual(priorEcology(cp.space.expedition), JSON.parse(original.checkpoint).space.expedition);
  activation = {live: e.biosphere.ecology, checkpoint: cp.space.expedition.biosphere.ecology, cargoBefore: specimen, cargoAfter: e.cargo[0], file: path.join(out, 'ecology-activation.save.json'), sha256: imported.sha256};
  for (const w of e.worlds) frozenWorlds.set(w.id, structuredClone(w)); await resume();
  check('Public A1 import activates ecology v2 in live and checkpoint without modifying cargo #11, source genome, physiology, receipts, climate or foreign clocks');
  await detail('space-dock'); await act('space-launch'); await until('Launch', s => s.space.location?.scale === 'surface');
  home = homeExport((await exported()).value.state); frozenHome = homePublic(await read()); await resume(); await ascend(); await jump(1); await surface();
  phase = 'restore and breed source'; await detail('space-biology'); await page.locator('#space-habitat-band').selectOption('2'); await tool('release', specimen.id, 2);
  state = await waitStock('Source actual reproduction to 54'); assert.equal(activeWorld(state).life.length, 54);
  assert.ok(expedition(state).biosphere.origins[0].births.reduce((a, b) => a + b, 0) >= 18);
  await checkpoint('source-breeding'); await detail('space-climate'); await shot('source-offspring-1024');
  check('Restored physical #11 and waited for 18 actual source descendants; all three bands contain six feeding roles and remain genuinely stable');
  for (let band = 1; band <= 3; band++) {
    phase = `hot band ${band}`; await gather(`source → hot band ${band}`, originId); await travel(2); hotId = activeWorld(await read()).id; await seedBand(band, 'Hot planet');
    if (band < 3) await travel(1);
  }
  }
  phase = 'hot mature stability'; await waitStock('Hot actual offspring before continuous stability');
  await stableObservation('Hot planet established without tools'); await checkpoint('hot-stable'); await detail('space-climate'); await shot('hot-three-bands-1024');
  check('Three physical cargo batches establish six distinct roles in every hot-planet band, with real plants, prey, nutrition, reproduction and paid band receipts');
  for (let band = 1; band <= 3; band++) {
    phase = `cold band ${band}`; await gather(`hot → cold band ${band}`, hotId); await travel(3); coldId = activeWorld(await read()).id; await seedBand(band, 'Cold planet');
    if (band < 3) await travel(2);
  }
  await waitStock('Cold actual offspring and steady scene'); await stableObservation('Cold planet established without tools'); await checkpoint('cold-stable'); await detail('space-climate'); await shot('cold-three-bands-1024');
  const measuredFrames = await frames(), measured = await read(); performanceSample = {scene: 'Cold planet, 54 physical organisms, six roles in all three stable bands, 1024x640', frames: stats(measuredFrames), render: measured.render, population: summary(activeWorld(measured))};
  check('Actual hot-planet descendants seed the cold world; stable capacity survives 30 active tool-free seconds and public save/import/rekey without demographic loss');
  phase = 'ecological scene lifecycle'; await hold('q', 'Lifecycle ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read(); await hold('q', 'Repeated ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), population: summary(activeWorld(surfaceState)), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row); if (cycle > 1) assert.equal(row.retainedGeometry, 0);
  }
  frozenWorlds.set(coldId, structuredClone(activeWorld(await read()))); await scale('r', 'system'); await jump(2); await surface(); await stableObservation('Hot revisit after cold founding'); await ascend(); await jump(1); await surface(); await stableObservation('Source revisit after two ecological founding campaigns');
  phase = 'home return'; await ascend(); await jump(0); await surface(); const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenHome = null;
  await page.keyboard.press('v'); await until('Home dock', s => s.space.location === null); await detail('space-dock'); await shot('ecology-home-1024', '#space-dock');
  finalExport = await exported('active-campaign.save.json'); state = await read(); intact(state); assert.equal(expedition(state).cargo.length, 0);
  assert.equal(hash(await readFile(source)), sourceHash); assert.deepEqual(errors, []);
  check('All three ecological worlds persist through revisits, inactive worlds and cargo remain frozen, four paired scenes release resources, and complete domestic save state stays frozen until actual docking');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, continuation: resumeHot ? {path: continuationFile, sha256: hash(continuationBytes), preservedFailure: 'evidence/sp-012a2/browser/failure.json'} : null, assets, activation, legs, transfers, batches, rekeys, observations, lifecycle, performance: performanceSample, images,
    planets: expedition(state).worlds.map(summary), demography: expedition(state).biosphere.origins, frozenHomeSha256: hash(JSON.stringify(home)), activeCampaign: {path: path.join(out, 'active-campaign.save.json'), sha256: finalExport.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Unchanged actual A1 campaign continued by public UI and native RAF. Actual breeding, physical transfers, six roles per band, real nutrition and predation, tool-free stability and ecology persistence. No setters, artificial time, injected life/resources, production helper imports, traces or video. Does not claim colonies, complete milestone C, new-lineage completion or human playtest/listening acceptance.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Public export can itself fail; retain diagnostics regardless. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors, assets, images, legs, transfers, batches, rekeys, observations, lifecycle, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
