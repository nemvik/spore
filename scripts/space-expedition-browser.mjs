/** C2 native continuation: real C1 ship, public UI, finite life and foreign persistence. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const finalReplay = process.argv.includes('--final');
const out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-011c2/browser');
const source = path.resolve('tests/fixtures/space/native-c1-campaign.save.json');
const hash = data => createHash('sha256').update(data).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, 'a1d2bfb8fc821621447f05d368252d8b62d79f7fdf5f9893580d4216806e7c34');
assert.equal(original.stage, 5); assert.ok(original.space.ship); assert.equal(original.space.location, null);
assert.equal(new URL(base).searchParams.has('test'), false);
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`C2 native expedition: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], tools = [], lifecycle = [], presentation = [];
let phase = 'import', frozenPublic = null, launched = null, specimen = null, originId = null, destinationId = null, originDesigns = null, performanceSample = null;
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const check = text => {checks.push(text); console.log(text);};
const expedition = s => s.space.expedition;
const activeWorld = s => expedition(s).worlds.find(w => w.id === s.space.location?.planetId);
const resources = s => Object.fromEntries(['geometries', 'textures', 'programs', 'drawCalls'].map(k => [k, s.render[k]]));
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = s => Object.fromEntries(homeKeys.filter(k => Object.hasOwn(s, k)).map(k => [k, s[k]]));
function homeExport(s) {const v = structuredClone(s); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function identity(life) {const copy = structuredClone(life); delete copy.pos; return copy;}
function intact(s) {
  assert.equal(s.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(s.space.ship.creation, original.space.ship.creation); assert.deepEqual(s.space.ship.purchase, original.space.ship.purchase);
  if (frozenPublic) assert.deepEqual(homePublic(s), frozenPublic, 'Domestic state changed while away');
  if (specimen) {
    const e = expedition(s), copies = [...e.cargo, ...e.worlds.flatMap(w => w.life)].filter(l => l.id === specimen.id);
    assert.equal(copies.length, 1, 'Transferred specimen must exist exactly once'); assert.deepEqual(identity(copies[0]), identity(specimen));
    assert.deepEqual(e.worlds.find(w => w.id === originId).designs, originDesigns, 'Saved origin models changed');
  }
}
async function until(label, predicate, ceiling = 120000) {
  const started = performance.now(); let s;
  while (performance.now() - started < ceiling) {s = await read(); intact(s); if (predicate(s)) return s; await page.waitForTimeout(50);}
  throw new Error(`${label}: native wall ceiling; ${JSON.stringify({mode: s?.mode, location: s?.space.location, leg: s?.space.leg, notice: s?.space.notice})}`);
}
async function detail(id, open = true) {if ((await page.locator(`#${id}`).getAttribute('open') !== null) !== open) await page.locator(`#${id} > summary`).click();}
async function pause() {if ((await read()).mode === 'game') await act('pause');}
async function resume() {if ((await read()).mode !== 'game') await act('close'); await until('Resume', s => s.mode === 'game');}
async function exported(filename) {
  await pause(); if ((await read()).mode !== 'saves') await act('saves');
  const pending = page.waitForEvent('download'); await act('export'); const d = await pending, stream = await d.createReadStream(); assert.ok(stream);
  const chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks), value = JSON.parse(bytes.toString());
  assert.equal(value.format, 'lumavora'); if (filename) await writeFile(path.join(out, filename), bytes); return {bytes, value, sha256: hash(bytes)};
}
async function importCampaign(file) {
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); intact(await read());
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const asset = await page.evaluate(() => ({url: location.href, modules: [...document.querySelectorAll('script[type="module"][src]')].map(e => e.src), styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(e => e.href)}));
  assert.ok(asset.modules.length && asset.modules.every(url => new URL(url).pathname.includes('/assets/')));
  if (assets.length) assert.deepEqual(asset.modules, assets[0].modules); assets.push(asset);
}
async function shot(name) {assert.ok(images.length < 4); const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);}
async function frames(count = 90) {
  return page.evaluate(count => new Promise((resolve, reject) => {const values = []; let last;
    const timer = setTimeout(() => reject(new Error('Native RAF stalled')), 60000);
    function frame(t) {if (last !== undefined) values.push(t - last); last = t; if (values.length === count) {clearTimeout(timer); resolve(values);} else requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
  }), count);
}
const stats = values => {const v = [...values].sort((a, b) => a - b); return {count: v.length, p50: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1)};};
async function hold(key, label, predicate) {
  await page.locator('.space-heading h2').click(); await page.keyboard.down(key);
  try {return await until(label, predicate);} finally {await page.keyboard.up(key);}
}
async function near(point) {
  await page.locator('.space-heading h2').click(); const started = performance.now();
  while (performance.now() - started < 90000) {
    const s = await read(); intact(s); const pos = s.space.location.pos, dx = point.x - pos.x, dz = point.z - pos.z;
    if (Math.hypot(dx, dz) <= 1.8) return s;
    const yaw = s.camera.yaw, x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const key = Math.abs(x) > Math.abs(z) ? x > 0 ? 'd' : 'a' : z > 0 ? 's' : 'w';
    await page.keyboard.down(key); try {await page.waitForTimeout(Math.min(160, Math.max(35, Math.hypot(dx, dz) * 12)));} finally {await page.keyboard.up(key);}
  }
  throw new Error('Normal WASD approach did not reach organism');
}
async function scale(key, target) {
  const before = await read(); await page.keyboard.press(key);
  const during = await until(`Transition to ${target}`, s => !!s.space.leg);
  assert.equal(during.space.leg.to.scale, target); assert.equal(during.space.leg.duration, 3);
  const after = await until(`Arrive ${target}`, s => !s.space.leg && s.space.location.scale === target);
  assert.ok(after.space.elapsed - before.space.elapsed >= 3); legs.push({from: before.space.location, to: after.space.location, duration: 3, paid: during.space.leg.energyPaid}); return after;
}
async function ascend() {
  if ((await read()).space.location.pos.y < 21) await hold('q', 'Ascend above20', s => s.space.location.pos.y >= 21);
  await scale('r', 'orbit'); await scale('r', 'system');
}
async function surface() {await scale('v', 'orbit'); return scale('v', 'surface');}
async function jump(index, mapShot = false) {
  await detail('space-star-map'); const rows = await page.locator('.space-star-list > section').all(); let row;
  for (const item of rows) {if ((await item.locator('b').innerText()).startsWith(`${index === 0 ? '⌂' : index} ·`)) {row = item; break;}}
  assert.ok(row, `Public map must expose system${index}`); const button = row.locator('button'), action = await button.getAttribute('data-action');
  assert.ok(action?.startsWith('space-jump:')); const started = performance.now();
  while (await button.isDisabled()) {assert.ok(performance.now() - started < 60000, await row.innerText()); await page.waitForTimeout(200);}
  if (mapShot) await shot('stellar-route-1024');
  const before = await read(); await button.click(); const during = await until('Interstellar leg', s => !!s.space.leg);
  assert.equal(during.space.leg.duration, 6); assert.equal(during.space.leg.to.systemId, action.slice('space-jump:'.length));
  const target = during.space.leg.to.systemId; await detail('space-star-map', false);
  const after = await until('Interstellar arrival', s => !s.space.leg && s.space.location.systemId === target);
  assert.ok(after.space.elapsed - before.space.elapsed >= 6); legs.push({from: before.space.location, to: after.space.location, duration: 6, paid: during.space.leg.energyPaid});
  return after;
}
async function tool(kind, id) {
  const before = await read(), count = expedition(before).actions.length;
  await act(`space-${kind}:${id}`); const after = await until(`${kind} receipt`, s => expedition(s).actions.length > count);
  const receipt = expedition(after).actions.at(-1); assert.equal(receipt.kind, kind); assert.equal(receipt.lifeId, id);
  assert.equal(receipt.energyPaid, kind === 'scan' ? 1 : 2); tools.push(receipt); return after;
}
async function originCopy(selector, id) {
  if (!finalReplay) return;
  const text = await page.locator(selector).innerText();
  assert.ok(text.includes('Původ: Jantarový háj · I')); assert.ok(text.includes(`exemplář #${id.split(':life-').at(-1)}`));
  presentation.push({selector, text});
}
try {
  await importCampaign(source); let s = await read(); assert.ok(expedition(s)); assert.equal(expedition(s).worlds.length, 0); assert.equal(expedition(s).cargo.length, 0);
  await detail('space-dock'); await act('space-launch'); await until('Launch', value => value.space.location?.scale === 'surface');
  launched = await exported(); frozenPublic = homePublic(await read()); const home = homeExport(launched.value.state);
  await resume(); await ascend(); phase = 'living destination'; await jump(1, true); await surface();
  s = await read(); originId = s.space.location.planetId; assert.equal(activeWorld(s).life.length, 36); originDesigns = structuredClone(activeWorld(s).designs);
  const target = s.spaceTargets.find(t => t.key.startsWith('species:') && t.distance >= 12 && t.distance <= 22); assert.ok(target);
  await detail('space-biology'); await page.locator('#space-specimen').selectOption(target.id);
  await hold('c', 'Approach living surface', value => value.space.location.pos.y <= 2.8); await near(target.pos);
  s = await read(); assert.ok(s.spaceTargets.find(t => t.id === target.id).distance <= 6);
  await tool('scan', target.id); assert.equal(activeWorld(await read()).life.length, 36, 'Scan cannot remove or create life');
  await originCopy('.space-specimen', target.id);
  if (finalReplay) {
    const text = await page.locator('.space-navigation').innerText();
    assert.ok(text.includes('Jantarový háj · I')); assert.ok(text.includes('vystoupej do 20 a stiskni R.')); assert.ok(!text.includes('Domovská'));
    presentation.push({selector: '.space-navigation', text});
    assert.ok((await page.locator('#space-specimen option:checked').innerText()).includes(`#${target.id.split(':life-').at(-1)}`));
  }
  await shot('living-specimen-1024'); specimen = structuredClone(activeWorld(await read()).life.find(l => l.id === target.id));
  await tool('collect', specimen.id); s = await read(); assert.equal(activeWorld(s).life.length, 35); assert.deepEqual(expedition(s).cargo, [specimen]);
  await originCopy('.space-cargo', specimen.id);
  const originModel = originDesigns.find(d => d.species === specimen.taxonKey.split(':')[1]); assert.ok(originModel);
  const values = await frames(), measured = await read(); intact(measured);
  performanceSample = {scene: 'foreign living surface,35residents and1physical cargo,1024x640', frames: stats(values), camera: measured.spaceCamera, render: measured.render};
  check('Native Q/R/R, public star map and six-second jump reach the living foreign world; normal low WASD flight scans and physically removes one of36 saved animals');

  phase = 'cargo persistence'; await pause(); const paused = await read(); await page.waitForTimeout(350); assert.deepEqual((await read()).space, paused.space);
  await act('save'); const carried = await exported('carried-life.save.json');
  assert.deepEqual(homeExport(carried.value.state), home); await importCampaign(path.join(out, 'carried-life.save.json')); await pause(); const rekey = await exported();
  assert.notEqual(rekey.value.state.id, carried.value.state.id); assert.equal(JSON.parse(rekey.value.state.checkpoint).id, rekey.value.state.id);
  assert.deepEqual(rekey.value.state.space.expedition.cargo, [specimen]); assert.deepEqual(homeExport(rekey.value.state), home);
  check('Public save/export/import rekeys the campaign while preserving the exact cargo instance, origin models, foreign world and complete frozen domestic state');

  phase = 'barren destination'; await resume(); await ascend(); const originAway = structuredClone(expedition(await read()).worlds.find(w => w.id === originId));
  await jump(2); await surface(); s = await read(); destinationId = s.space.location.planetId; assert.notEqual(destinationId, originId); assert.equal(activeWorld(s).life.length, 0);
  assert.deepEqual(expedition(s).worlds.find(w => w.id === originId), originAway, 'Inactive origin planet advanced');
  await detail('space-biology'); await hold('c', 'Approach barren surface', value => value.space.location.pos.y <= 2.8);
  await tool('release', specimen.id); s = await read(); assert.equal(expedition(s).cargo.length, 0); assert.equal(activeWorld(s).life.length, 1);
  assert.deepEqual(identity(activeWorld(s).life[0]), identity(specimen));
  await page.locator('#space-specimen').selectOption(specimen.id); await shot('transplanted-animal-1024');
  await originCopy('.space-specimen', specimen.id);
  await tool('scan', specimen.id); await tool('collect', specimen.id);
  s = await read(); assert.equal(activeWorld(s).life.length, 0); assert.equal(expedition(s).cargo.length, 1); assert.deepEqual(identity(expedition(s).cargo[0]), identity(specimen));
  const carriedAgain = structuredClone(expedition(s).cargo[0]);
  if (finalReplay) {
    await page.locator('.space-heading h2').click(); await page.keyboard.press('j'); await until('Expedition journal', value => value.mode === 'journal');
    const text = await page.locator('.modal').innerText();
    for (const expected of ['Lodní deník', 'Jantarová vážka', 'Jantarový háj → Žhavá slza', 'Dědictví']) assert.ok(text.includes(expected), `Journal missing ${expected}`);
    assert.ok(!text.includes('Nad domovem')); assert.ok(!text.includes('Domovská soustava'));
    presentation.push({selector: '.modal journal', text}); await resume();
    check('Final presentation exposes specimen origin and short ID on surface and in cargo; J opens a neutral foreign-place journal with actual jump history and lineage');
  }
  check('A second foreign system starts barren; release, rediscovery, scan and collection move the same ID/model exactly once, with no new animal or restored health/nutrition');

  phase = 'revisit and scene lifecycle'; await ascend(); const destinationAway = structuredClone(expedition(await read()).worlds.find(w => w.id === destinationId));
  await jump(1); await surface(); s = await read(); assert.equal(activeWorld(s).life.length, 35); assert.ok(!activeWorld(s).life.some(l => l.id === specimen.id));
  assert.deepEqual(expedition(s).worlds.find(w => w.id === destinationId), destinationAway); assert.deepEqual(expedition(s).cargo, [carriedAgain]);
  assert.deepEqual(activeWorld(s).designs, originDesigns);
  await hold('q', 'Lifecycle ascent', value => value.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const foreign = await read();
    await hold('q', 'Repeated foreign ascent', value => value.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    lifecycle.push({cycle, before: resources(before), foreign: resources(foreign), after: resources(after), retainedGeometry: after.render.geometries - before.render.geometries});
  }
  for (const row of lifecycle.slice(1)) assert.equal(row.retainedGeometry, 0, 'Repeated foreign surface scene retained geometry after warm-up');
  check('Return to the living source preserves35residents and its exact origin designs; four additional foreign surface/orbit cycles measure paired resource release');

  phase = 'home return'; await scale('r', 'system'); await jump(0); await surface();
  await hold('c', 'Home landing altitude', value => value.space.location.pos.y <= 5);
  const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenPublic = null;
  await page.keyboard.press('v'); await until('Domestic dock', value => value.space.location === null); await detail('space-dock'); await shot('expedition-home-1024');
  const final = await exported('active-campaign.save.json'); s = await read(); intact(s);
  assert.deepEqual(expedition(s).cargo, [carriedAgain]); assert.equal(expedition(s).worlds.find(w => w.id === originId).life.length, 35);
  assert.equal(expedition(s).worlds.find(w => w.id === destinationId).life.length, 0);
  const systems = new Set(legs.flatMap(l => [l.from.systemId, l.to.systemId])); assert.equal(systems.size, 3);
  assert.equal(hash(await readFile(source)), sourceHash); assert.deepEqual(errors, []);
  check('Home docking preserves the paid ship, same physical cargo and both visited planets; every domestic save field stayed frozen from launch until immediately before return');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {file: source, sha256: sourceHash}, assets, legs, tools, lifecycle, presentation,
    specimen: {id: specimen.id, originId, destinationId, identity: identity(specimen), originModelSha256: hash(JSON.stringify(originModel))},
    population: {originBefore: 36, originAfter: 35, barrenBefore: 0, barrenAfterRelease: 1, barrenAfterCollection: 0, cargoAfter: 1},
    rekey: {from: carried.value.state.id, to: rekey.value.state.id}, frozenHome: {sha256: hash(JSON.stringify(home)), tick: launched.value.state.tick, worldTime: launched.value.state.world.time},
    performance: performanceSample, images, activeCampaign: {file: path.join(out, 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Unchanged actual C1 campaign continued through normal UI and native RAF. No production helper imports, setters, injected resources, prepared progress, test clock, trace or video. Three reachable systems, actual six-second jumps, three-second scale transitions and conserved physical life. Does not claim a fresh birth campaign, C3 terraform/colonies, D completion or human playtest/listening.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Keep read-only diagnostic if export itself fails. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors, assets, images, legs, tools, lifecycle, presentation,
    specimen, originId, destinationId, performance: performanceSample, recovery, frozenHome: launched ? {sha256: hash(JSON.stringify(homeExport(launched.value.state))), tick: launched.value.state.tick} : null,
    state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await browser.close(); console.log('Browser close completed');}
