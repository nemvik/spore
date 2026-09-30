/** C3a1: native continuation of the actual C2 campaign, public UI only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const presentationOnly = process.argv.includes('--presentation');
const out = path.resolve(process.env.LUMAVORA_OUT ?? (presentationOnly ? 'evidence/sp-012a1/final-browser' : 'evidence/sp-012a1/browser'));
const source = path.resolve(process.env.LUMAVORA_SOURCE ?? (presentationOnly ? 'evidence/sp-012a1/browser/climate-off.save.json' : 'evidence/sp-011c2/final-browser/active-campaign.save.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, process.env.LUMAVORA_SOURCE_SHA ?? (presentationOnly ? '7b8c359b8c5e7286b95403bafd40bb59e03ae8fc346ae948b84cc552bd33e022' : '3f83884800c58691f87a694750f17a32564c4d82eab6aec01285bf87439ed137'));
if (presentationOnly) {assert.equal(original.space.location.scale, 'surface'); assert.equal(original.space.expedition.version, 2); assert.equal(original.space.expedition.biosphere.tool, 'off');}
else {assert.equal(original.space.location, null); assert.equal(original.space.expedition.version, 1);}
assert.equal(original.space.expedition.cargo.length, 1); assert.equal(new URL(base).searchParams.has('test'), false);
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`C3a1 native climate: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], changes = [], rekeys = [], transfers = [], lifecycle = [], frozenWorlds = new Map();
let phase = 'import C2', frozenHome = null, home = null, activation = null, hotId = null, coldId = null, rateSample = null, performanceSample = null, finalExport = null;
const specimen = original.space.expedition.cargo[0];
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error))); page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = state => state.space.expedition;
const activeWorld = state => expedition(state).worlds.find(world => world.id === state.space.location?.planetId);
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function homeExport(state) {const v = structuredClone(state); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function coreLife(life) {const value = structuredClone(life); delete value.pos; delete value.habitat; return value;}
function withoutElapsed(world) {const value = structuredClone(world); delete value.elapsed; return value;}
function legacyExpedition(e) {
  const value = structuredClone(e); value.version = 1; delete value.biosphere;
  for (const world of value.worlds) {delete world.biosphere; for (const life of world.life) delete life.habitat;}
  for (const life of value.cargo) delete life.habitat;
  return value;
}
function assertClimate(world) {
  const {initial, work} = world.biosphere;
  assert.ok(Math.abs(world.temperature - (initial.temperature + work.warm - work.cool + work.temperatureDrift)) < 1e-8);
  assert.ok(Math.abs(world.atmosphere - (initial.atmosphere + work.thicken - work.thin + work.atmosphereDrift)) < 1e-8);
  assert.deepEqual(world.biosphere.stableFor, [0, 0, 0], 'Climate alone cannot certify ecological stability');
}
function intact(state) {
  assert.equal(state.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(state.space.ship.creation, original.space.ship.creation); assert.deepEqual(state.space.ship.purchase, original.space.ship.purchase);
  const e = expedition(state); assert.equal(e.version, 2);
  const copies = [...e.cargo, ...e.worlds.flatMap(world => world.life)].filter(life => life.id === specimen.id);
  assert.equal(copies.length, 1); assert.deepEqual(coreLife(copies[0]), coreLife(specimen));
  assert.equal(e.cargo.length + e.worlds.reduce((sum, world) => sum + world.life.length, 0), 36, 'Climate must not create life');
  for (const world of e.worlds) assertClimate(world);
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(e.worlds.find(world => world.id === id), snapshot, 'Inactive planet advanced');
  if (frozenHome) assert.deepEqual(homePublic(state), frozenHome, 'Domestic state advanced during flight');
}
async function until(label, predicate, ceiling = 120000) {
  const started = performance.now(); let state;
  while (performance.now() - started < ceiling) {state = await read(); intact(state); if (predicate(state)) return state; await page.waitForTimeout(50);}
  throw new Error(`${label}: native wall ceiling; ${JSON.stringify({mode: state?.mode, location: state?.space.location, leg: state?.space.leg, notice: state?.space.notice, tool: state?.space.expedition.biosphere.tool})}`);
}
async function detail(id, open = true) {if ((await page.locator(`#${id}`).getAttribute('open') !== null) !== open) await page.locator(`#${id} > summary`).click();}
async function pause() {if ((await read()).mode === 'game') await act('pause');}
async function resume() {if ((await read()).mode !== 'game') await act('close'); await until('Resume', state => state.mode === 'game');}
async function exported(filename) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const pending = page.waitForEvent('download'); await act('export'); const download = await pending, stream = await download.createReadStream(); assert.ok(stream);
  const chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks), value = JSON.parse(bytes.toString());
  assert.equal(value.format, 'lumavora'); if (filename) await writeFile(path.join(out, filename), bytes); return {bytes, value, sha256: hash(bytes)};
}
async function importCampaign(file) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); intact(await read());
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const asset = await page.evaluate(() => ({url: location.href, modules: [...document.querySelectorAll('script[type="module"][src]')].map(node => node.src), styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(node => node.href)}));
  assert.ok(asset.modules.length && asset.modules.every(url => new URL(url).pathname.includes('/assets/')));
  if (assets.length) assert.deepEqual(asset.modules, assets[0].modules); assets.push(asset);
}
async function shot(name) {
  assert.ok(images.length < 4); await page.locator('#space-climate svg').scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
}
async function frames(count = 90) {
  return page.evaluate(count => new Promise((resolve, reject) => {const values = []; let last;
    const timer = setTimeout(() => reject(new Error('Native RAF stalled')), 60000);
    function frame(time) {if (last !== undefined) values.push(time - last); last = time; if (values.length === count) {clearTimeout(timer); resolve(values);} else requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
  }), count);
}
const stats = values => {const v = [...values].sort((a, b) => a - b); return {count: v.length, p50: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1)};};
const resources = state => Object.fromEntries(['geometries', 'textures', 'programs', 'drawCalls'].map(key => [key, state.render[key]]));
async function hold(key, label, predicate) {
  await page.locator('.space-heading h2').click(); await page.keyboard.down(key);
  try {return await until(label, predicate);} finally {await page.keyboard.up(key);}
}
async function scale(key, target) {
  const before = await read(); await page.keyboard.press(key);
  const during = await until(`Start ${target}`, state => !!state.space.leg);
  assert.equal(during.space.leg.to.scale, target); assert.equal(during.space.leg.duration, 3); assert.equal(expedition(during).biosphere.tool, 'off');
  const after = await until(`Arrive ${target}`, state => !state.space.leg && state.space.location.scale === target);
  assert.ok(after.space.elapsed - before.space.elapsed >= 3); legs.push({from: before.space.location, to: after.space.location, duration: 3, toolBefore: expedition(before).biosphere.tool, toolDuring: expedition(during).biosphere.tool}); return after;
}
async function ascend() {await hold('q', 'Ascend above 20', state => state.space.location.pos.y >= 21); await scale('r', 'orbit'); await scale('r', 'system');}
async function surface() {await scale('v', 'orbit'); return scale('v', 'surface');}
async function jump(index) {
  await detail('space-star-map'); const rows = await page.locator('.space-star-list > section').all(); let row;
  for (const item of rows) if ((await item.locator('b').innerText()).startsWith(`${index === 0 ? '⌂' : index} ·`)) {row = item; break;}
  assert.ok(row); const button = row.locator('button'), action = await button.getAttribute('data-action'), started = performance.now();
  assert.ok(action?.startsWith('space-jump:'));
  while (await button.isDisabled()) {assert.ok(performance.now() - started < 60000, await row.innerText()); await page.waitForTimeout(200);}
  const before = await read(); await button.click(); const during = await until('Interstellar leg', state => !!state.space.leg);
  assert.equal(during.space.leg.duration, 6); assert.equal(expedition(during).biosphere.tool, 'off');
  const target = during.space.leg.to.systemId; assert.equal(target, action.slice('space-jump:'.length)); await detail('space-star-map', false);
  const after = await until('Interstellar arrival', state => !state.space.leg && state.space.location.systemId === target);
  assert.ok(after.space.elapsed - before.space.elapsed >= 6); legs.push({from: before.space.location, to: after.space.location, duration: 6, paid: during.space.leg.energyPaid});
}
async function climate(tool) {
  await detail('space-climate'); await act(`space-climate:${tool}`);
  const state = await until(`Climate ${tool}`, value => expedition(value).biosphere.tool === tool);
  assert.equal(expedition(state).biosphere.toolPlanetId, tool === 'off' ? null : state.space.location.planetId); return state;
}
async function change(tool, axis, condition) {
  await climate(tool); await frames(12); const before = await read();
  const after = await until(`${tool} reaches target`, state => condition(activeWorld(state)[axis]));
  assert.equal(after.render.geometries, before.render.geometries, 'Climate work allocated additional geometries');
  changes.push({planetId: activeWorld(after).id, tool, before: {climate: {temperature: activeWorld(before).temperature, atmosphere: activeWorld(before).atmosphere}, elapsed: activeWorld(before).elapsed, resources: resources(before)}, after: {climate: {temperature: activeWorld(after).temperature, atmosphere: activeWorld(after).atmosphere}, elapsed: activeWorld(after).elapsed, work: activeWorld(after).biosphere.work, resources: resources(after)}});
  await climate('off');
}
async function roundtrip(label, expectedTool) {
  await pause(); const stopped = await read(); await page.waitForTimeout(350); assert.deepEqual((await read()).space, stopped.space);
  await act('save'); const before = await exported(`${label}.save.json`); assert.equal(before.value.state.space.expedition.biosphere.tool, expectedTool);
  assert.deepEqual(homeExport(before.value.state), home);
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported();
  assert.notEqual(after.value.state.id, before.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  const a = before.value.state.space.expedition, b = after.value.state.space.expedition;
  assert.equal(b.biosphere.tool, expectedTool); assert.deepEqual(b.cargo, a.cargo); assert.deepEqual(homeExport(after.value.state), home);
  const currentId = before.value.state.space.location.planetId;
  for (const world of a.worlds) {
    const other = b.worlds.find(candidate => candidate.id === world.id);
    if (world.id !== currentId) assert.deepEqual(other, world);
    else if (expectedTool === 'off') assert.deepEqual(withoutElapsed(other), withoutElapsed(world));
    else {assert.deepEqual(other.biosphere.initial, world.biosphere.initial); assert.ok(other.biosphere.work[expectedTool] >= world.biosphere.work[expectedTool]); assertClimate(other);}
  }
  rekeys.push({label, from: before.value.state.id, to: after.value.state.id, tool: expectedTool, export: path.join(out, `${label}.save.json`), sha256: before.sha256}); await resume();
}
try {
  if (presentationOnly) {
    phase = 'final presentation'; await importCampaign(source); const initial = await read(); home = homeExport(original); frozenHome = homePublic(initial);
    for (const world of expedition(initial).worlds) if (world.id !== initial.space.location.planetId) frozenWorlds.set(world.id, structuredClone(world));
    await detail('space-climate');
    const bounds = async () => page.evaluate(() => {
      const rect = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};};
      return {navigation: rect('.space-navigation'), map: rect('#space-star-map'), graph: rect('#space-climate svg'), controls: rect('.space-controls')};
    });
    const observedBounds = [];
    async function visibleGraph() {
      await page.locator('#space-climate svg').scrollIntoViewIfNeeded(); const b = await bounds();
      assert.ok(b.navigation.bottom <= b.map.top - 4, 'Map overlaps the scrollable navigation panel');
      assert.ok(b.graph.top >= b.navigation.top && b.graph.bottom <= b.navigation.bottom, 'Climate graph or its numeric row is clipped');
      assert.ok(b.map.bottom <= b.controls.top, 'Map overlaps flight controls'); observedBounds.push(b);
    }
    await visibleGraph(); await shot('climate-layout-1024');
    for (const tool of ['warm', 'cool', 'thicken', 'thin']) {
      await climate(tool); const before = await read();
      const after = await until(`Public ${tool} control`, value => activeWorld(value).elapsed - activeWorld(before).elapsed >= 1);
      assert.ok(activeWorld(after).biosphere.work[tool] > activeWorld(before).biosphere.work[tool]);
      changes.push({tool, before: activeWorld(before).biosphere.work, after: activeWorld(after).biosphere.work});
      if (tool === 'warm') {await visibleGraph(); await shot('climate-tool-1024'); performanceSample = {scene: 'Final CSS, active climate tool', frames: stats(await frames()), render: (await read()).render};}
      await climate('off');
    }
    await visibleGraph(); const final = await exported('presentation-campaign.save.json'); assert.deepEqual(homeExport(final.value.state), home);
    assert.equal(hash(await readFile(source)), sourceHash); assert.deepEqual(errors, []);
    check('Final production UI keeps map, scrollable navigation, complete climate graph/numeric row and flight controls separate; all four climate actions plus off are reachable through real clicks');
    await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, assets, images, observedBounds, changes, performance: performanceSample,
      presentationCampaign: {path: path.join(out, 'presentation-campaign.save.json'), sha256: final.sha256},
      canonicalActiveCampaign: 'evidence/sp-012a1/browser/active-campaign.save.json',
      provenance: 'Short normal UI continuation of the unchanged actual climate-OFF export. No setters, artificial time or injected resources. Complements the full native climate expedition; does not replace its route, ON/OFF import, band, stasis or lifecycle evidence.'}, null, 2));
  } else {
  await importCampaign(source); let state = await read();
  assert.deepEqual(legacyExpedition(expedition(state)), original.space.expedition);
  activation = structuredClone(expedition(state).biosphere); assert.equal(activation.activatedAt, original.space.elapsed);
  for (const world of expedition(state).worlds) {
    const old = original.space.expedition.worlds.find(candidate => candidate.id === world.id);
    assert.deepEqual(world.biosphere.initial, {temperature: old.temperature, atmosphere: old.atmosphere}); assert.equal(world.biosphere.activatedElapsed, old.elapsed);
  }
  frozenWorlds.set(specimen.originPlanetId, structuredClone(expedition(state).worlds.find(world => world.id === specimen.originPlanetId)));
  await detail('space-dock'); await act('space-launch'); await until('Launch', value => value.space.location?.scale === 'surface');
  const launched = await exported(); home = homeExport(launched.value.state); frozenHome = homePublic(await read()); await resume();
  check('Public import activates v2 habitat metadata without changing any legacy C2 organism, design, receipt, climate or planet time; the original living planet remains in stasis');
  phase = 'hot planet'; await ascend(); await jump(1); await jump(2); await surface();
  state = await read(); hotId = activeWorld(state).id; assert.equal(activeWorld(state).temperature, .8); assert.equal(activeWorld(state).atmosphere, -.7);
  await detail('space-climate'); await shot('hot-before-1024');
  const instruments = await page.locator('.space-instruments').innerText(), solarShown = Number(instruments.match(/dobíjí \+([\d.]+)/)?.[1]), capacity = Number(instruments.match(/ENERGIE [\d.]+ \/ ([\d.]+)/)?.[1]); assert.ok(solarShown > 2); assert.ok(capacity > 0);
  const offBefore = await read(), offAfter = await until('Three active seconds of solar only', value => activeWorld(value).elapsed - activeWorld(offBefore).elapsed >= 3);
  assert.equal(expedition(offAfter).biosphere.tool, 'off'); assert.deepEqual(withoutElapsed(activeWorld(offAfter)), withoutElapsed(activeWorld(offBefore)));
  assert.ok(offAfter.space.ship.energy < capacity - .1, 'Solar sample must not hit the energy cap');
  const solarSeconds = activeWorld(offAfter).elapsed - activeWorld(offBefore).elapsed, solar = (offAfter.space.ship.energy - offBefore.space.ship.energy) / solarSeconds;
  assert.ok(Math.abs(solar - solarShown) <= .05, 'Measured solar must agree with the rounded public UI');
  await climate('cool'); await frames(12); const rateBefore = await read();
  const rateAfter = await until('Six active seconds of cooling', value => activeWorld(value).elapsed - activeWorld(rateBefore).elapsed >= 6);
  const dt = activeWorld(rateAfter).elapsed - activeWorld(rateBefore).elapsed, work = activeWorld(rateAfter).biosphere.work.cool - activeWorld(rateBefore).biosphere.work.cool;
  const paid = work * 2 / .03;
  rateSample = {seconds: dt, work, paid, solar, solarShown, solarSeconds, capacity, energyBefore: rateBefore.space.ship.energy, energyAfter: rateAfter.space.ship.energy};
  assert.ok(Math.abs(work - .03 * dt) < 1e-8);
  assert.ok(rateBefore.space.ship.energy + solar * dt < capacity, 'Uncapped interval required for exact energy accounting');
  assert.ok(Math.abs(rateAfter.space.ship.energy - (rateBefore.space.ship.energy + solar * dt - paid)) < 1e-6);
  await roundtrip('climate-on', 'cool');
  await change('cool', 'temperature', value => value <= .025); await climate('thicken');
  const measuredFrames = await frames(), measured = await read(); performanceSample = {scene: 'Native hot-planet atmosphere work, physical cargo preserved,1024x640', frames: stats(measuredFrames), render: measured.render};
  await change('thicken', 'atmosphere', value => value >= -.025);
  state = await read(); assert.ok(Math.hypot(activeWorld(state).temperature, activeWorld(state).atmosphere) <= .3);
  assert.ok((await page.locator('#space-climate > summary').innerText()).includes('T3'));
  await shot('hot-restored-1024'); await roundtrip('climate-off', 'off');
  check('Hot/thin planet reaches climate T3 by paid cooling and atmospheric thickening; native rate and uncapped energy accounting match 0.03 axis/s and 2 energy/s; ON/OFF exports both rekey correctly');

  phase = 'habitat band'; await detail('space-biology'); await hold('c', 'Low transfer altitude', value => value.space.location.pos.y <= 2.8);
  await page.locator('#space-habitat-band').selectOption('2');
  const transferBefore = expedition(await read()).biosphere.paidTransfers;
  for (const kind of ['release', 'collect']) {
    await act(`space-${kind}:${specimen.id}`); state = await read(); intact(state);
    const receipt = expedition(state).actions.at(-1); assert.equal(receipt.kind, kind); assert.equal(receipt.lifeId, specimen.id); assert.equal(receipt.energyPaid, 2);
    if (kind === 'release') {assert.equal(receipt.band, 2); assert.equal(activeWorld(state).life[0].habitat.band, 2); assert.ok((await page.locator('.space-specimen').innerText()).includes('pás 2'));}
    transfers.push(receipt);
  }
  assert.equal(expedition(state).biosphere.paidTransfers, transferBefore + 2); assert.equal(expedition(state).cargo[0].habitat.band, 2); assert.equal(activeWorld(state).life.length, 0);
  await climate('warm'); await ascend(); assert.equal(expedition(await read()).biosphere.tool, 'off');
  frozenWorlds.set(hotId, structuredClone(expedition(await read()).worlds.find(world => world.id === hotId)));
  check('The actual C2 exemplar is released into selected band 2 and collected again, with two paid receipts; real ascent switches the active climate tool off');

  phase = 'cold planet'; await jump(3); await surface(); state = await read(); coldId = activeWorld(state).id;
  assert.equal(activeWorld(state).temperature, -.75); assert.equal(activeWorld(state).atmosphere, .8); assert.equal(activeWorld(state).life.length, 0);
  await detail('space-climate'); await shot('cold-before-1024');
  await change('warm', 'temperature', value => value >= -.025); await change('thin', 'atmosphere', value => value <= .025);
  state = await read(); assert.ok(Math.hypot(activeWorld(state).temperature, activeWorld(state).atmosphere) <= .3); await shot('cold-restored-1024');
  check('Cold/dense planet requires the opposite pair: warming and thinning; both repaired planets retain distinct immutable climate origins and no life is created by climate');
  await hold('q', 'Lifecycle ascent', value => value.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 2; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read();
    await hold('q', 'Repeated ascent', value => value.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row); assert.equal(row.retainedGeometry, 0);
  }
  frozenWorlds.set(coldId, structuredClone(expedition(await read()).worlds.find(world => world.id === coldId)));
  phase = 'home return'; await scale('r', 'system'); await jump(2); await jump(1); await jump(0); await surface();
  await hold('c', 'Dock altitude', value => value.space.location.pos.y <= 5); const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenHome = null;
  await page.keyboard.press('v'); await until('Home dock', value => value.space.location === null); finalExport = await exported('active-campaign.save.json');
  state = await read(); intact(state); assert.equal(expedition(state).biosphere.tool, 'off'); assert.equal(expedition(state).cargo[0].habitat.band, 2);
  assert.equal(hash(await readFile(source)), sourceHash); assert.deepEqual(errors, []);
  check('Actual route returns through intermediate systems to the home dock; both changed planets and the source planet stay in stasis, two paired scenes release geometry, and complete domestic save state stayed frozen');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, assets, activation, legs, changes, rateSample, rekeys, transfers, lifecycle, performance: performanceSample, images,
    planets: expedition(state).worlds.map(world => ({id: world.id, temperature: world.temperature, atmosphere: world.atmosphere, elapsed: world.elapsed, population: world.life.length, biosphere: world.biosphere})),
    frozenHomeSha256: hash(JSON.stringify(home)), cargo: expedition(state).cargo, activeCampaign: {path: path.join(out, 'active-campaign.save.json'), sha256: finalExport.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Unchanged actual C2 final campaign continued by public import and normal UI/native RAF. No debug time, state setters, injected resources, production helper imports, trace or video. This proves C3a1 climate and habitat metadata only; no ecological food/reproduction/stability, colonies, whole C3, new-lineage completion or human listening/playtest acceptance is claimed.'}, null, 2));
  }
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Preserve diagnostic even when public export fails. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors, assets, images, legs, changes, rateSample, rekeys, transfers, lifecycle, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
