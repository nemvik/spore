/** C1: native production UI continuation of an unchanged, actually played civilization.
 * No production imports, prepared progress, live setters, test clock, trace or video.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-011c1/browser');
const finalReplay = process.argv.includes('--final');
const lifecycleIndex = process.argv.indexOf('--lifecycle'), lifecycleOnly = lifecycleIndex >= 0;
assert.ok(!lifecycleOnly || process.argv[lifecycleIndex + 1] && !finalReplay, '--lifecycle requires a real played export, without --final');
assert.ok(process.argv.slice(2).every((arg, i) => arg === '--final' || arg === '--lifecycle' || process.argv[i + 1] === '--lifecycle'), 'Use --final or --lifecycle <played-export>');
const source = path.resolve(lifecycleOnly ? process.argv[lifecycleIndex + 1] : 'tests/fixtures/civilization/native-civic-campaign.save.json');
const timeout = Number(process.env.LUMAVORA_NATIVE_TIMEOUT_MS ?? 120000);
assert.ok(Number.isFinite(timeout) && timeout >= 15000);
assert.equal(new URL(base).searchParams.has('test'), false);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(original.stage, 5); assert.ok(original.civilization.completed);
if (lifecycleOnly) {assert.ok(original.space.ship); assert.equal(original.space.location, null);}
else {assert.ok(original.machines.resource > 140); assert.equal(original.planet.activeMachine, 12);}
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk();
console.log(`C1 native flight: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);

const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true});
const page = await context.newPage(), checks = [], errors = [], images = [], assets = [], movements = [], transitions = [], lifecycle = [];
let frozenPublic = null, launchedExport = null, purchased = null, flightPerformance = null, phase = 'import';
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet',
  'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization', 'rootDispersal'];
const homePublic = s => Object.fromEntries(homeKeys.filter(k => Object.hasOwn(s, k)).map(k => [k, s[k]]));
function homeExport(s) {
  const home = structuredClone(s); delete home.id; delete home.space;
  if (home.checkpoint) {const cp = JSON.parse(home.checkpoint); delete cp.id; home.checkpoint = cp;}
  return home;
}
function intact(s) {
  assert.equal(s.deathReason, null); assert.deepEqual(errors, []);
  if (frozenPublic) assert.deepEqual(homePublic(s), frozenPublic, 'Domestic state advanced or changed in flight');
  if (purchased) {
    assert.deepEqual(s.space.ship.creation, purchased.creation, 'Paid geometry changed with library or flight');
    assert.deepEqual(s.space.ship.purchase, purchased.purchase, 'Ship payment changed');
  }
}
async function until(label, predicate) {
  const start = performance.now(); let s;
  while (performance.now() - start < timeout) {
    s = await read(); intact(s); if (predicate(s)) return s;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label}: native wall ceiling; ${JSON.stringify({mode: s?.mode, space: s?.space, worldTime: s?.world.time})}`);
}
async function pause() {if ((await read()).mode === 'game') await act('pause');}
async function resume() {if ((await read()).mode !== 'game') await act('close'); await until('Resume', s => s.mode === 'game');}
async function download(action, filename) {
  const pending = page.waitForEvent('download'); await act(action); const d = await pending;
  const stream = await d.createReadStream(); assert.ok(stream); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks); if (filename) await writeFile(path.join(out, filename), bytes);
  return {bytes, value: JSON.parse(bytes.toString()), sha256: hash(bytes)};
}
async function exported(filename) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const result = await download('export', filename); assert.equal(result.value.format, 'lumavora'); return result;
}
async function importCampaign(file) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  intact(await read());
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const build = await page.evaluate(() => ({url: location.href,
    modules: [...document.querySelectorAll('script[type="module"][src]')].map(e => e.src),
    styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(e => e.href)}));
  assert.ok(build.modules.length && build.modules.every(url => new URL(url).pathname.includes('/assets/')));
  if (assets.length) assert.deepEqual(build.modules, assets[0].modules, 'Build changed during native run');
  assets.push(build);
}
async function shot(name) {
  assert.ok(images.length < 3, 'Maximum three milestone PNGs');
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
}
async function openDock() {
  if (await page.locator('#space-dock').getAttribute('open') === null) await page.locator('#space-dock > summary').click();
}
async function field(key, value) {
  const input = page.locator(`[data-ship="${key}"]`); await input.fill(String(value)); await input.press('Tab');
}
async function hold(key, label, predicate) {
  const before = await read(); await page.keyboard.down(key); let after;
  try {after = await until(label, predicate);} finally {await page.keyboard.up(key);}
  movements.push({key, from: before.space.location, to: after.space.location, elapsed: after.space.elapsed - before.space.elapsed});
  return after;
}
async function scale(key, expected) {
  const before = await read(); await page.keyboard.press(key);
  const travelling = await until(`Start transition to ${expected}`, s => !!s.space.leg);
  assert.equal(travelling.space.leg.to.scale, expected); assert.equal(travelling.space.leg.duration, 3);
  const after = await until(`Native transition to ${expected}`, s => !s.space.leg && s.space.location.scale === expected);
  assert.ok(after.space.elapsed - before.space.elapsed >= 3);
  transitions.push({from: before.space.location.scale, to: expected, elapsed: after.space.elapsed - before.space.elapsed,
    energyPaid: travelling.space.leg.energyPaid}); return after;
}
const stats = values => {const a = [...values].sort((x, y) => x - y); return {count: a.length, p50: a[Math.floor(a.length * .5)], p95: a[Math.floor(a.length * .95)], max: a.at(-1)};};
async function nativeFrames(count = 90) {
  return page.evaluate(count => new Promise((resolve, reject) => {
    const values = []; let last; const timer = setTimeout(() => reject(new Error('Native RAF stalled')), 60000);
    function sample(t) {if (last !== undefined) values.push(t - last); last = t;
      if (values.length === count) {clearTimeout(timer); resolve(values);} else requestAnimationFrame(sample);}
    requestAnimationFrame(sample);
  }), count);
}
try {
  if (lifecycleOnly) {
    phase = 'paired lifecycle'; await importCampaign(source); purchased = structuredClone((await read()).space.ship);
    const resources = s => Object.fromEntries(['geometries', 'textures', 'programs'].map(key => [key, s.render[key]]));
    const homeCounts = s => ({tick: s.tick, time: s.world.time, resources: s.world.resources.length,
      resourceIds: s.world.resources.map(r => r.id).sort((a, b) => a - b), creatureIds: s.world.creatures.map(c => c.id).sort((a, b) => a - b),
      births: s.world.births, deaths: s.world.deaths, obstacles: s.world.obstacles.length});
    for (let cycle = 1; cycle <= 6; cycle++) {
      await openDock(); await nativeFrames(12); const before = await read(); intact(before);
      await act('space-launch'); await until('Paired launch', value => value.space.location?.scale === 'surface');
      await nativeFrames(12); const flying = await read(); intact(flying);
      await page.keyboard.press('v'); await until('Paired dock', value => value.space.location === null);
      await nativeFrames(12); const docked = await read(); intact(docked);
      lifecycle.push({cycle, before: resources(before), flying: resources(flying), docked: resources(docked),
        flightDelta: flying.render.geometries - before.render.geometries, retainedDelta: docked.render.geometries - before.render.geometries,
        beforeHome: homeCounts(before), afterHome: homeCounts(docked)});
    }
    const final = await exported('active-campaign.save.json');
    assert.equal(hash(await readFile(source)), sourceHash); assert.deepEqual(errors, []);
    const stable = lifecycle.every(row => row.retainedDelta === 0);
    await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, assets, lifecycle, stable,
      source: {file: source, sha256: sourceHash}, activeCampaign: {file: path.join(out, 'active-campaign.save.json'), sha256: final.sha256},
      disk: {before: diskBefore, after: await disk()},
      provenance: 'Short native continuation of the unchanged R2 played export. Six ordinary launch/dock cycles,12RAF before launch/in flight/after dock; no editor, map, state writes, debug clock, screenshots or resource tolerance.'}, null, 2));
    assert.equal(stable, true, 'Paired post-dock versus pre-launch geometry count changed; inspect exact per-cycle evidence');
    check('Six paired native cycles release all extra flight geometries relative to their own pre-launch home baseline');
  } else {
  await importCampaign(source); let s = await read();
  assert.ok(s.space); assert.equal(s.space.ship, null); assert.equal(s.space.location, null);
  assert.deepEqual(s.civilization, original.civilization);
  await openDock(); await act('ship-open');
  const editorHome = homePublic(await read()); assert.equal((await read()).mode, 'ships');
  phase = 'custom ship'; await act('ship:new');
  const seedDraft = structuredClone((await read()).shipStudio.draft);
  await field('name', 'Jantarová vážka'); await field('scale.x', 1.5); await field('scale.z', 2.1);
  await act('ship:select,left'); await field('position.x', -2.2); await field('yaw', -25);
  await act('ship:select,right'); await field('position.x', 2.2); await field('yaw', 25);
  await act('ship:add,fin'); await field('position.y', 1.5); await field('position.z', .8); await field('scale.x', .6);
  const ownDraft = structuredClone((await read()).shipStudio.draft);
  assert.notDeepEqual(ownDraft.parts, seedDraft.parts); assert.equal(ownDraft.parts.length, 7);
  if (finalReplay) assert.equal(await page.locator('.building-heading h2').innerText(), ownDraft.name);
  await act('ship:undo'); assert.notDeepEqual((await read()).shipStudio.draft, ownDraft);
  await act('ship:redo'); assert.deepEqual((await read()).shipStudio.draft, ownDraft);
  await act('ship:camera-right'); await shot('custom-ship-editor-1024');
  await act('ship:save'); s = await read(); const design = s.shipStudio.entries[0];
  assert.deepEqual(design.blueprint, ownDraft); assert.equal(design.revision, 1);
  const shipFile = await download(`ship:export,${design.id}`, 'jantarova-vazka.ship.json');
  await act(`ship:delete,${design.id}`); assert.equal((await read()).shipStudio.entries.length, 0);
  await page.locator('#import-ship').setInputFiles({name: 'jantarova-vazka.json', mimeType: 'application/json', buffer: shipFile.bytes});
  await until('Public ship import', value => value.shipStudio.entries.length === 1);
  assert.deepEqual((await read()).shipStudio.entries[0], design);
  assert.deepEqual(homePublic(await read()), editorHome, 'Ship library modified the paused campaign');
  check('Custom named geometry, undo/redo, library save, actual export, delete and byte-identical public import work without advancing the campaign');

  phase = 'purchase'; await act(`ship:use,${design.id}`);
  const offer = await page.locator('.ship-offer').innerText(), price = Number(offer.match(/Stavba (\d+) ◈/u)?.[1]);
  assert.ok(price > 0 && price < original.machines.resource); assert.equal(await page.locator('[data-action="ship-confirm"]').isDisabled(), false);
  const beforePurchase = (await read()).machines.resource; await act('ship-confirm');
  s = await until('Paid ship', value => !!value.space.ship); purchased = structuredClone(s.space.ship);
  assert.equal(purchased.purchase.paid, price); assert.equal(purchased.purchase.after, purchased.purchase.before - price);
  assert.ok(purchased.purchase.before >= beforePurchase); assert.ok(purchased.purchase.before - beforePurchase < 5);
  assert.deepEqual(purchased.creation, design);
  await act('ship-open'); const paidEditorHome = homePublic(await read());
  await act(`ship:edit,${design.id}`); await field('name', 'Jantarová vážka II'); await field('scale.x', 1.8); await act('ship:save');
  s = await read(); intact(s); assert.equal(s.shipStudio.entries[0].revision, 2);
  assert.notDeepEqual(s.shipStudio.entries[0].blueprint, purchased.creation.blueprint);
  assert.deepEqual(homePublic(s), paidEditorHome);
  await act('ship:close');
  check(`Construction paid exactly ${price} earned amber; editing library revision2 leaves the paid revision1 instance unchanged`);

  phase = 'launch'; await openDock(); await act('space-launch');
  await until('Surface flight', value => value.space.location?.scale === 'surface');
  assert.equal((await read()).planet.toolOn, false);
  launchedExport = await exported(); frozenPublic = homePublic(await read());
  const frozenHome = homeExport(launchedExport.value.state), homeHash = hash(JSON.stringify(frozenHome));
  await resume(); await page.keyboard.press('r');
  s = await read(); assert.equal(s.space.leg, null); assert.match(s.space.notice, /20/);
  await hold('q', 'Ascend above20', value => value.space.location.pos.y >= 21);
  await scale('r', 'orbit'); await scale('r', 'system');
  check('Real Q ascent and two three-second R transitions reach orbit and the home system; low-altitude ascent is rejected');

  phase = 'system flight';
  await hold('w', 'W flight', value => value.space.location.pos.z <= -8);
  await hold('d', 'D flight', value => value.space.location.pos.x >= 24);
  await page.keyboard.press('v'); s = await read(); assert.equal(s.space.leg, null); assert.match(s.space.notice, /16/);
  await hold('s', 'S flight', value => value.space.location.pos.z >= 6);
  await hold('a', 'A flight', value => value.space.location.pos.x <= 9);
  assert.ok((await read()).spaceCamera?.renderedHomeAtlas);
  const beforeFrames = await read(), wallStart = performance.now();
  const frameValues = await nativeFrames(), afterFrames = await read(); intact(afterFrames);
  flightPerformance = {scene: 'C1 own custom ship, home system, native RAF, 1024x640', frames: stats(frameValues),
    wallSeconds: (performance.now() - wallStart) / 1000, activeSeconds: afterFrames.space.elapsed - beforeFrames.space.elapsed,
    camera: afterFrames.spaceCamera, render: afterFrames.render};
  await shot('custom-ship-system-1024');
  check('All four WASD directions move the owned ship; distant return is rejected;90 native RAF intervals observed in the home system');

  phase = 'flight persistence'; await pause();
  if (finalReplay) {
    await act('vehicle-open'); assert.equal((await read()).mode, 'vehicles');
    await page.getByText('Uložit konstrukci z této kampaně', {exact: true}).click(); await act('vehicle-capture:0');
    assert.ok((await read()).vehicleLibrary.length > 0, 'Check manufacturing guard with a real saved vehicle design');
    assert.equal(await page.locator('[data-action^="vehicle-use:"]').count(), 0, 'Manufacturing must not be offered in flight');
    intact(await read()); await resume(); await pause(); await act('help');
    assert.equal((await read()).mode, 'help');
    const help = await page.locator('.modal').innerText();
    for (const text of ['Řízení vlastní lodi', 'WASD', 'Q stoupá', 'C klesá', '16 kroků', 'výškou 8', 'rozpracovaný let']) assert.ok(help.includes(text), `Missing space help: ${text}`);
    intact(await read()); await resume(); await page.keyboard.press('j');
    await page.getByRole('heading', {name: 'Výprava ke hvězdám', exact: true}).waitFor();
    const journal = await page.locator('.modal').innerText();
    for (const text of ['Lodní deník', 'Jantarová vážka', 'zaplacená revize 1', 'Domácí dílna → Nad domovem', 'Orbita → Domovská soustava']) assert.ok(journal.includes(text), `Missing flight journal: ${text}`);
    assert.match(await page.locator('.civilization-history').innerText(), /uzavřené sjednocení/);
    intact(await read()); await resume(); await pause();
    check('Paused flight vehicle library retains real designs but offers no manufacturing; help documents ship controls and J shows the flight log plus civilization inheritance');
  }
  const paused = await read(); await page.waitForTimeout(450); assert.deepEqual((await read()).space, paused.space);
  await act('save'); intact(await read()); assert.match((await read()).space.notice, /uložen/iu);
  const inFlight = await exported('in-flight.save.json');
  assert.deepEqual(homeExport(inFlight.value.state), frozenHome, 'Full domestic save changed during flight/save');
  const savedId = inFlight.value.state.id;
  await page.reload(); await act('saves'); await act(`load:${savedId}`);
  await until('Load saved flight', value => value.mode === 'game' && value.space.location?.scale === 'system');
  s = await read(); assert.deepEqual(s.space.location, inFlight.value.state.space.location); intact(s);
  if (finalReplay) {
    phase = 'menu lifecycle'; await pause(); await act('menu'); assert.equal((await read()).mode, 'menu');
    await act('ship-open'); assert.equal((await read()).mode, 'ships');
    assert.equal((await read()).shipStudio.entries.find(e => e.id === design.id).revision, 2);
    await act('ship:close'); assert.equal((await read()).mode, 'menu');
    const heldHome = frozenPublic, heldPurchase = purchased; frozenPublic = null; purchased = null;
    await act('new'); await until('New lineage from former flight menu', value => value.mode === 'game' && value.stage === 0);
    s = await read(); assert.notEqual(s.homePlanet.id, inFlight.value.state.homePlanet.id);
    assert.ok(!s.space?.ship && !s.space?.location);
    await importCampaign(path.join(out, 'in-flight.save.json')); frozenPublic = heldHome; purchased = heldPurchase; intact(await read());
    check('Leaving an in-flight campaign for menu keeps the ship library usable and allows a genuinely new lineage; public import returns to the unchanged paid flight');
    phase = 'flight persistence';
  }
  await importCampaign(path.join(out, 'in-flight.save.json')); await pause();
  const rekey = await exported(); assert.notEqual(rekey.value.state.id, savedId);
  assert.equal(JSON.parse(rekey.value.state.checkpoint).id, rekey.value.state.id);
  assert.equal(rekey.value.state.homePlanet.id, inFlight.value.state.homePlanet.id);
  assert.deepEqual(rekey.value.state.space.location, inFlight.value.state.space.location);
  assert.deepEqual(homeExport(rekey.value.state), frozenHome, 'Import/rekey changed the frozen domestic branch');
  check('Native pause freezes flight; UI save/reload/load and export/import rekey preserve location, paid ship, checkpoint and full domestic state');

  phase = 'return'; await resume();
  await hold('a', 'Approach beacon X', value => value.space.location.pos.x <= .5);
  await hold('w', 'Approach beacon Z', value => value.space.location.pos.z <= .5);
  assert.ok(Math.hypot((await read()).space.location.pos.x, (await read()).space.location.pos.z) < 16);
  await scale('v', 'orbit'); await scale('v', 'surface');
  await hold('c', 'Descend below8', value => value.space.location.pos.y <= 5);
  s = await read(); assert.ok(Math.hypot(s.space.location.pos.x, s.space.location.pos.z) <= 10);
  const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), frozenHome);
  intact(await read()); await resume(); frozenPublic = null;
  await page.keyboard.press('v'); await until('Dock', value => value.space.location === null);
  s = await read(); intact(s);
  assert.deepEqual(s.space.log.map(e => [e.from, e.to]), [['dock', 'surface'], ['surface', 'orbit'], ['orbit', 'system'], ['system', 'orbit'], ['orbit', 'surface'], ['surface', 'dock']]);
  assert.deepEqual(s.civilization, original.civilization);
  await openDock(); await shot('returned-dock-1024');
  if (finalReplay) {
    phase = 'renderer lifecycle';
    const resources = value => Object.fromEntries(['geometries', 'textures', 'programs'].map(key => [key, value.render[key]]));
    for (let cycle = 1; cycle <= 6; cycle++) {
      await openDock(); await act('space-launch'); await until('Repeated launch', value => value.space.location?.scale === 'surface');
      await nativeFrames(12); const flying = await read(); intact(flying);
      await page.keyboard.press('v'); await until('Repeated dock', value => value.space.location === null);
      await nativeFrames(12); const docked = await read(); intact(docked);
      lifecycle.push({cycle, flying: resources(flying), docked: resources(docked), logEntries: docked.space.log.length});
    }
    // Compare after warm-up. A steady per-launch increment must be investigated;
    // a broad allowance would hide the starfield geometry leak this run detected.
    for (const view of ['flying', 'docked']) {
      const warm = lifecycle.slice(0, 2).map(value => value[view]), last = lifecycle.at(-1)[view];
      assert.ok(last.geometries <= Math.max(...warm.map(value => value.geometries)), `${view}: repeated scene geometry growth`);
      assert.ok(last.textures <= Math.max(...warm.map(value => value.textures)) + 1, `${view}: repeated texture growth`);
      assert.ok(last.programs <= Math.max(...warm.map(value => value.programs)) + 1, `${view}: repeated shader growth`);
    }
    check('Six additional normal launch/dock cycles render at least12 native RAF frames per scene and retain bounded geometry, texture and program counts');
  }
  const final = await exported('active-campaign.save.json');
  assert.equal(final.value.state.space.location, null); assert.deepEqual(final.value.state.space.ship.creation, purchased.creation);
  assert.equal(hash(await readFile(source)), sourceHash); assert.deepEqual(errors, []);
  check('V returns through orbit and surface, C descends and V docks; complete domestic save remains byte-equivalent modulo rekey from launch until immediately before return');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {file: source, sha256: sourceHash, earnedAmber: original.machines.resource},
    assets, finalReplay, paid: purchased, libraryExport: {file: path.join(out, 'jantarova-vazka.ship.json'), sha256: shipFile.sha256},
    frozenHome: {sha256: homeHash, startTick: launchedExport.value.state.tick, endTick: beforeReturn.value.state.tick,
      startWorldTime: launchedExport.value.state.world.time, endWorldTime: beforeReturn.value.state.world.time,
      comparison: 'Every state field except space and legitimate imported save id; checkpoint compared with only checkpoint.id normalized.'},
    rekey: {from: savedId, to: rekey.value.state.id}, movements, transitions, lifecycle, performance: flightPerformance, images,
    activeCampaign: {file: path.join(out, 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Unchanged truly played trade civilization imported publicly. Own ship created, paid and flown through normal UI and native RAF. Public diagnostics and actual export bytes are read-only observations. No game setters, test clock, fixture preparation, injected resources, trace or video. Historical continuation only; not a complete new campaign, interstellar C2 proof or human playtest/listening acceptance.'}, null, 2));
  }
} catch (error) {
  let recovery = null;
  try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Preserve diagnostic state when normal export is unavailable. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors,
    assets, images, movements, transitions, lifecycle, performance: flightPerformance, recovery,
    frozenHome: launchedExport ? {sha256: hash(JSON.stringify(homeExport(launchedExport.value.state))), tick: launchedExport.value.state.tick,
      worldTime: launchedExport.value.state.world.time} : null, state: await read().catch(() => null)}, null, 2));
  console.error(error); process.exitCode = 1;
} finally {await browser.close();}
