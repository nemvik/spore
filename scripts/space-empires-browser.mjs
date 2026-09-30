/** D1 native diplomacy continuation. Public UI/native RAF; diagnostics are read-only.
 * --roots-survey is an independent branch from this driver's public preaccept export.
 * Run it only after the main active campaign/result are safely written. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const mainOut = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-013d1/browser');
const branch = process.argv.includes('--roots-survey'), continuation = process.argv.includes('--resume-basalt');
assert.ok(!(branch && continuation));
const out = branch ? path.join(mainOut, 'survey-branch') : continuation ? path.join(mainOut, 'continuation') : mainOut;
const canonicalSource = path.resolve('evidence/sp-013c/browser/active-campaign.save.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalBytes = await readFile(canonicalSource), canonicalHash = hash(canonicalBytes), original = JSON.parse(canonicalBytes).state;
assert.equal(canonicalHash, '01f1c07ae53847a4b4a2d4938d1d22782bb5529ea1696a7e5f05268f242aff5a');
assert.equal(original.space.economy.version, 1); assert.equal(original.space.empires, undefined); assert.equal(original.space.location, null);
assert.equal(original.space.economy.ledger.revenue, 312); assert.equal(original.space.economy.balance, 249);
assert.equal(new URL(base).searchParams.has('test'), false);
let source = canonicalSource, sourceHash = canonicalHash, sourceState = original, preservedMain = null, previous = null;
if (branch) {
  const result = JSON.parse(await readFile(path.join(mainOut, 'result.json')).catch(() => readFile(path.join(mainOut, 'continuation/result.json'))));
  preservedMain = result.activeCampaign;
  assert.equal(hash(await readFile(preservedMain.path)), preservedMain.sha256);
  const checkpoint = result.rekeys.find(row => row.label === 'before-roots-accept'); assert.ok(checkpoint);
  source = checkpoint.file; const bytes = await readFile(source); sourceHash = hash(bytes); assert.equal(sourceHash, checkpoint.sha256);
  sourceState = JSON.parse(bytes).state; const roots = sourceState.space.empires.entries.find(e => e.id === 'roots');
  assert.ok(roots.contact); assert.equal(roots.mission, null);
}
if (continuation) {
  previous = JSON.parse(await readFile(path.join(mainOut, 'failure.json')));
  assert.equal(previous.phase, 'basalt physical survey'); assert.deepEqual(previous.errors, []);
  source = path.join(mainOut, 'failure-campaign.save.json'); const bytes = await readFile(source); sourceHash = hash(bytes); assert.equal(sourceHash, previous.recovery);
  sourceState = JSON.parse(bytes).state; const basalt = sourceState.space.empires.entries.find(e => e.id === 'basalt');
  assert.equal(basalt.mission.kind, 'survey'); assert.equal(basalt.mission.completed, null); assert.equal(basalt.mission.evidence.length, 1);
  assert.equal(sourceState.space.location.planetId, basalt.mission.targetPlanetId); assert.equal(sourceState.space.location.scale, 'surface'); assert.equal(sourceState.space.leg, null);
}
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native empires${branch ? ' survey branch' : ''}: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = previous?.checks ?? [], assets = previous?.assets ?? [], images = previous?.images ?? [], legs = previous?.legs ?? [], transactions = previous?.transactions ?? [], diplomaticActions = previous?.diplomaticActions ?? [], biologicalActions = previous?.biologicalActions ?? [], rekeys = previous?.rekeys ?? [], lifecycle = previous?.lifecycle ?? [], observations = previous?.observations ?? [];
const frozenWorlds = new Map(), roles = ['culture:7', 'culture:8', 'culture:6', 'species:bell', 'species:gnaw', 'species:crest'];
const hotId = original.space.expedition.worlds.find(w => w.id.includes(':star-2:')).id;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null;
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = state => state.space.expedition;
const economy = state => state.space.economy;
const registry = state => state.space.empires;
const empire = (state, id) => registry(state).entries.find(e => e.id === id);
const activeWorld = state => expedition(state).worlds.find(world => world.id === state.space.location?.planetId);
const progress = e => e.mission?.evidence.reduce((sum, proof) => sum + (proof.kind === 'trade' ? proof.receipt.amount : 1), 0) ?? 0;
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function homeExport(state) {const v = structuredClone(state); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function beforeActivation(text) {const cp = JSON.parse(text); delete cp.id; delete cp.space.empires; cp.space.economy.version = 1; delete cp.space.economy.pricingActivatedAction; return cp;}
const summary = world => ({id: world.id, elapsed: world.elapsed, population: world.life.length, climate: [world.temperature, world.atmosphere]});
function intact(state) {
  assert.equal(state.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(state.space.ship.creation, original.space.ship.creation); assert.deepEqual(state.space.ship.purchase, original.space.ship.purchase);
  const e = expedition(state), account = economy(state); assert.equal(e.biosphere.version, 2); assert.equal(account.version, 2); assert.equal(registry(state).version, 1);
  const l = account.ledger; assert.equal(account.balance, l.deposits + l.revenue - l.construction - l.upgrades - l.repairs - l.charging);
  assert.equal(l.deposits, original.space.economy.ledger.deposits); assert.equal(account.pricingActivatedAction, original.space.economy.nextAction);
  assert.deepEqual(account.actions.slice(0, original.space.economy.actions.length), original.space.economy.actions, 'Historical economic receipts changed');
  for (const old of original.space.economy.colonies) {const c = account.colonies.find(v => v.id === old.id); for (const key of ['id', 'planetId', 'product', 'paid', 'level', 'upgraded', 'foundedAt']) assert.equal(c[key], old[key]);}
  assert.equal(account.colonies.length, 2); assert.ok(account.cargo.reduce((n, c) => n + c.amount, 0) + e.cargo.length <= 8);
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(e.worlds.find(w => w.id === id), snapshot, `Inactive biology advanced: ${id}`);
  if (frozenHome) assert.deepEqual(homePublic(state), frozenHome, 'Domestic state advanced during diplomacy');
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
  if (process.env.LUMAVORA_ASSET) assert.ok(asset.modules.some(url => new URL(url).pathname.endsWith(`/assets/${process.env.LUMAVORA_ASSET}`)), 'Unexpected production build');
  if (assets.length) assert.deepEqual(asset.modules, assets[0].modules); assets.push(asset); console.log('Production asset', asset.modules);
}
async function frames(count = 90) {return page.evaluate(count => new Promise((resolve, reject) => {const values = []; let last; const timer = setTimeout(() => reject(new Error('Native RAF stalled')), 60000); function frame(t) {if (last !== undefined) values.push(t - last); last = t; if (values.length === count) {clearTimeout(timer); resolve(values);} else requestAnimationFrame(frame);} requestAnimationFrame(frame);}), count);}
const stats = values => {const v = [...values].sort((a, b) => a - b); return {count: v.length, p50: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1)};};
const resources = state => Object.fromEntries(['geometries', 'textures', 'programs', 'drawCalls'].map(key => [key, state.render[key]]));
async function shot(name, selector = '#space-diplomacy > summary') {
  assert.ok(images.length < 4); await near({x: 0, z: 0});
  await hold('q', 'Physical embassy overview', s => s.space.location.pos.y >= 6.5, 20); await frames(12);
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
  const state = await read(); observations.push({kind: 'embassy-overview', file, location: state.space.location, camera: state.spaceCamera});
  await hold('c', 'Physical descent before further actions', s => s.space.location.pos.y <= 2.8);
}
async function hold(key, label, predicate, interval = 80) {await page.locator('.space-heading h2').click(); await page.keyboard.down(key); try {return await until(label, predicate, 120000, interval);} finally {await page.keyboard.up(key);}}
async function near(point) {
  await page.locator('.space-heading h2').click(); const started = performance.now();
  while (performance.now() - started < 90000) {const s = await read(); intact(s); const pos = s.space.location.pos, dx = point.x - pos.x, dz = point.z - pos.z; if (Math.hypot(dx, dz) <= 1.8) return s;
    const yaw = s.camera.yaw, x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const key = Math.abs(x) > Math.abs(z) ? x > 0 ? 'd' : 'a' : z > 0 ? 's' : 'w';
    await page.keyboard.down(key); try {await page.waitForTimeout(Math.min(160, Math.max(35, Math.hypot(dx, dz) * 12)));} finally {await page.keyboard.up(key);}
  } throw new Error('Normal WASD approach failed');
}
async function scale(key, target) {
  if (key === 'r') await until('Ordinary solar charging before ascent', s => s.space.ship.energy >= 4);
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
const planetIndex = id => id === original.space.homePlanetId ? 0 : Number(id.match(/:star-(\d+):planet$/)?.[1]);
async function chain(index) {
  let current = planetIndex((await read()).space.location.planetId); assert.ok(Number.isInteger(current) && Number.isInteger(index));
  while (current !== index) {current += Math.sign(index - current); await jump(current);}
}
async function travel(index) {await near({x: 0, z: 0}); await ascend(); await chain(index); await surface();}

async function economyAction(kind, origin) {
  await detail('space-economy'); const before = await read(), revision = economy(before).nextAction;
  const action = `space-economy:${kind}|${revision}${origin ? `|${origin}` : ''}`, button = page.locator(`button[data-action="${action}"]:visible`).first();
  assert.equal(await button.isDisabled(), false, `${kind}: ${await button.getAttribute('title')}`);
  const quote = await button.getAttribute('title'); await button.click();
  const after = await until(`${kind} economic receipt`, s => economy(s).nextAction === revision + 1);
  const receipt = economy(after).actions.find(a => a.serial === revision); assert.equal(receipt.kind, kind);
  assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(after).balance);
  transactions.push({quote, receipt}); console.log(kind, JSON.stringify(receipt)); return receipt;
}
async function diplomaticAction(kind, id) {
  await detail('space-diplomacy'); const before = await read(), revision = registry(before).nextAction;
  const button = page.locator(`button[data-action="space-empire:${kind}|${id}|${revision}"]:visible`);
  assert.equal(await button.isDisabled(), false, `${kind}: ${await button.getAttribute('title')}`); const text = await page.locator('#space-diplomacy').innerText();
  await button.click(); const after = await until(`${id} ${kind}`, s => registry(s).nextAction === revision + 1), receipt = registry(after).actions.find(row => row.serial === revision);
  assert.equal(receipt.kind, kind === 'accept-survey' ? 'accept' : kind); assert.equal(receipt.empireId, id);
  assert.equal(economy(after).balance, economy(before).balance); assert.deepEqual(economy(after).actions, economy(before).actions);
  diplomaticActions.push({text, receipt}); console.log(`${id} ${kind}`, JSON.stringify(receipt)); return after;
}
async function scan(id) {
  let before = await read(); const life = activeWorld(before).life.find(row => row.id === id); assert.ok(life, 'Selected organism must still physically live');
  await detail('space-biology'); await page.locator('#space-specimen').selectOption(id); await near(life.pos);
  await until('Scanner energy', s => s.space.ship.energy >= 1); before = await read(); const serial = expedition(before).nextAction, energySpent = expedition(before).energySpent;
  const button = page.locator(`button[data-action="space-scan:${id}"]:visible`); assert.equal(await button.isDisabled(), false, await page.locator('#space-biology').innerText());
  const matches = row => row.serial >= serial && row.kind === 'scan' && row.lifeId === id;
  await button.click(); const after = await until('New paid physical scan', s => expedition(s).actions.some(matches));
  const receipt = expedition(after).actions.find(matches); assert.equal(receipt.energyPaid, 1);
  assert.equal(expedition(after).energySpent, energySpent + 1); biologicalActions.push(receipt); return receipt;
}
async function checkpoint(label) {
  await pause(); const stopped = await read(); await page.waitForTimeout(250); assert.deepEqual((await read()).space, stopped.space);
  await act('save'); const before = await exported(`${label}.save.json`); assert.deepEqual(homeExport(before.value.state), home);
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported();
  assert.notEqual(before.value.state.id, after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  assert.deepEqual(after.value.state.space.empires, before.value.state.space.empires);
  for (const key of ['version', 'pricingActivatedAction', 'balance', 'ledger', 'cargo', 'sales', 'counts', 'actions', 'nextAction', 'activated']) assert.deepEqual(after.value.state.space.economy[key], before.value.state.space.economy[key]);
  assert.deepEqual(homeExport(after.value.state), home);
  rekeys.push({label, file: path.join(out, `${label}.save.json`), sha256: before.sha256, from: before.value.state.id, to: after.value.state.id}); await resume();
}
async function loadHot(expectedPrice) {
  await travel(2); await until('Eight actual units in hot colony', s => {const c = economy(s).colonies.find(row => row.planetId === hotId); return c.produced - c.loaded >= 8;});
  const receipt = await economyAction('load'); assert.equal(receipt.amount, 8); assert.equal(receipt.planetId, hotId);
  await travel(1); await detail('space-economy'); const text = await page.locator('.space-product-cargo').innerText();
  assert.ok(text.includes(`${expectedPrice} ◈/ks`), text); observations.push({kind: 'actual-market-quote', expectedPrice, text}); return economyAction('sell', hotId);
}
async function completeAndTreaty(id, bonus) {
  await near({x: 0, z: 0}); await hold('c', 'Diplomatic altitude', s => s.space.location.pos.y <= 2.8);
  let s = await diplomaticAction('complete', id); assert.ok(empire(s, id).mission.completed);
  s = await diplomaticAction('treaty', id); assert.ok(empire(s, id).treaty);
  const text = await page.locator('#space-diplomacy').innerText(); assert.ok(text.includes(`Obchodní dohoda platí · +${bonus} ◈/ks`)); assert.match(text, id === 'resin' ? /Vztah\s+40/ : /Vztah\s+30/);
  observations.push({kind: 'completed-diplomacy', id, text, entry: structuredClone(empire(s, id))});
}
async function survey(id, acceptKind = 'accept') {
  let state = await diplomaticAction(acceptKind, id); const mission = empire(state, id).mission; assert.equal(mission.kind, 'survey'); assert.equal(progress(empire(state, id)), 0);
  const text = await page.locator('#space-diplomacy').innerText(), match = text.match(/soustava (\d+)/); assert.ok(match, text);
  const targetIndex = Number(match[1]); assert.equal(targetIndex, planetIndex(mission.targetPlanetId));
  const accepted = registry(state).actions.find(row => row.serial === mission.accepted), knownBefore = expedition(state).worlds.some(w => w.id === mission.targetPlanetId);
  await travel(targetIndex); state = await read(); assert.equal(progress(empire(state, id)), 1); assert.equal(empire(state, id).mission.completed, null);
  const proof = empire(state, id).mission.evidence[0]; assert.equal(proof.kind, 'survey'); assert.equal(proof.receipt.to, 'surface'); assert.equal(proof.receipt.planetId, mission.targetPlanetId); assert.ok(proof.receipt.serial >= accepted.cut.travelAction);
  observations.push({kind: 'actual-survey', id, text, knownBefore, accepted, proof});
  await travel(planetIndex(empire(state, id).capitalId)); await completeAndTreaty(id, 1);
}
async function inspectJournal() {
  await act('journal'); assert.equal((await read()).mode, 'journal'); const text = await page.locator('.modal').innerText();
  assert.match(text, /Prostředník/); assert.match(text, /nedostatek úplných dokladů/); assert.match(text, /Lodní deník/); observations.push({kind: 'journal', text}); await resume();
}
async function sceneCycles() {
  await near({x: 0, z: 0}); await hold('q', 'Embassy scene ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read();
    await hold('q', 'Embassy repeated ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row);
    if (cycle > 1) {assert.equal(row.retainedGeometry, 0); assert.equal(row.after.programs, row.before.programs); assert.equal(row.after.textures, row.before.textures);}
  }
  await scale('v', 'surface'); await hold('c', 'Return to diplomatic altitude', s => s.space.location.pos.y <= 2.8);
}
async function returnHome() {
  await near({x: 0, z: 0}); await ascend(); await chain(0); await surface();
  const before = await exported(); assert.deepEqual(homeExport(before.value.state), home); await resume(); frozenHome = null;
  await page.keyboard.press('v'); await until('Home dock', s => s.space.location === null);
}
try {
  await importCampaign(source);
  if (!branch && !continuation) {
    const activated = await exported('empires-activation.save.json'), state = activated.value.state, e = state.space.economy, r = state.space.empires;
    for (const key of ['balance', 'ledger', 'cargo', 'sales', 'counts', 'actions', 'nextAction', 'activated']) assert.deepEqual(e[key], original.space.economy[key]);
    const homeElapsed = e.elapsed - original.space.economy.elapsed; assert.ok(homeElapsed >= 0);
    for (const old of original.space.economy.colonies) {
      const c = e.colonies.find(row => row.id === old.id); assert.ok(c);
      for (const key of ['id', 'planetId', 'product', 'foundedAt', 'paid', 'level', 'upgraded', 'loaded']) assert.equal(c[key], old[key]);
      assert.ok(c.productiveElapsed >= old.productiveElapsed && c.productiveElapsed - old.productiveElapsed <= homeElapsed + 1e-7);
      const cycles = Math.floor((c.productiveElapsed + 1e-8) / 10) - Math.floor((old.productiveElapsed + 1e-8) / 10);
      assert.ok(c.produced >= old.produced && c.produced - old.produced <= cycles * c.level);
      assert.ok(c.produced - c.loaded <= c.level * 8);
      if (old.produced - old.loaded === old.level * 8) assert.equal(c.produced, old.produced, 'Full old storage cannot receive a production grant');
    }
    assert.deepEqual(state.space.expedition, original.space.expedition); assert.deepEqual(state.space.ship, original.space.ship);
    assert.deepEqual(r.actions, []); assert.equal(r.nextAction, 1); assert.equal(r.inheritance, null); assert.ok(r.entries.every(x => x.contact === null && x.mission === null && x.treaty === null));
    assert.deepEqual(r.entries.map(x => planetIndex(x.capitalId)), [1, 4, 7]); assert.deepEqual(r.protectedColonies, original.space.economy.colonies.map(c => c.planetId).sort());
    assert.deepEqual(r.activated, {at: original.space.elapsed, tick: original.tick, travelAction: original.space.nextSerial, lifeAction: original.space.expedition.nextAction, economyAction: original.space.economy.nextAction});
    assert.deepEqual(beforeActivation(state.checkpoint), beforeActivation(original.checkpoint)); const cp = JSON.parse(state.checkpoint);
    assert.equal(cp.space.economy.version, 2); assert.equal(cp.space.economy.pricingActivatedAction, 1); assert.deepEqual(cp.space.empires.actions, []); assert.deepEqual(cp.space.empires.entries, r.entries);
    activation = {path: path.join(out, 'empires-activation.save.json'), sha256: activated.sha256, live: r.activated, checkpoint: cp.space.empires.activated}; console.log('Public activation export', JSON.stringify(activation));
    for (const w of state.space.expedition.worlds) frozenWorlds.set(w.id, structuredClone(w));
    check('Public C3b import activates empty live/checkpoint diplomacy and v2 pricing without a grant, historical contact or altered receipt; genuine colonies and all life/models remain intact');
    await resume(); await detail('space-dock'); await act('space-launch'); await until('Launch', s => s.space.location?.scale === 'surface');
    home = homeExport((await exported()).value.state); frozenHome = homePublic(await read()); await resume();
    phase = 'resin first contact'; await ascend(); await chain(1); await surface();
    let s = await diplomaticAction('contact', 'resin'); const inherited = registry(s).inheritance;
    assert.equal(inherited.philosophy, 'broker'); assert.equal(inherited.diet.kind, 'unknown'); assert.equal(inherited.tribe, 'allied'); assert.deepEqual(inherited.civilization, ['trade']);
    await detail('space-inheritance'); await shot('resin-contact-inheritance-1024', '#space-inheritance > summary'); await detail('space-inheritance', false); await inspectJournal();
    s = await diplomaticAction('accept', 'resin'); assert.equal(progress(empire(s, 'resin')), 0); assert.equal(economy(s).ledger.revenue, 312);
    assert.equal(await page.locator('button[data-action^="space-empire:complete|resin|"]').isDisabled(), true);
    phase = 'new paid trade and treaty'; const first = await loadHot(10); assert.equal(first.amount, 8); assert.equal(first.unitPrice, 10); assert.equal(first.earned, 80);
    assert.deepEqual(first.priceBasis, {version: 1, base: 10, empireId: 'resin', treatySerial: null, relationRevision: null, bonus: 0});
    s = await read(); assert.equal(progress(empire(s, 'resin')), 8); assert.deepEqual(empire(s, 'resin').mission.evidence.map(p => p.receipt.serial), [first.serial]);
    await completeAndTreaty('resin', 2); await checkpoint('resin-treaty'); const second = await loadHot(12); s = await read();
    assert.equal(second.unitPrice, 12); assert.equal(second.earned, 96); assert.equal(second.priceBasis.base, 10); assert.equal(second.priceBasis.bonus, 2); assert.equal(second.priceBasis.treatySerial, empire(s, 'resin').treaty);
    assert.deepEqual(economy(s).actions.find(a => a.serial === first.serial), first); assert.equal(economy(s).balance, 425); assert.equal(economy(s).ledger.revenue, 488);
    await detail('space-economy', false); await detail('space-diplomacy'); await shot('resin-ratified-trade-1024');
    observations.push({kind: 'old-and-new-pricing', first, second, inheritance: inherited});
    check('Old312 revenue grants zero mission progress; eight newly sold units earn80, actual hand-in/treaty survive rekey, and the next real eight earn96 while every earlier price remains unchanged');
    phase = 'roots paid ecological catalogue'; await travel(4); await diplomaticAction('contact', 'roots');
    s = await read(); const exemplar = activeWorld(s).life.find(l => l.taxonKey === roles[0]); assert.ok(exemplar);
    const beforeAcceptScan = await scan(exemplar.id); const knowledge = structuredClone(expedition(await read()).scans.find(row => row.lifeId === exemplar.id));
    await near({x: 0, z: 0}); await checkpoint('before-roots-accept'); s = await diplomaticAction('accept', 'roots');
    assert.equal(progress(empire(s, 'roots')), 0); assert.equal(empire(s, 'roots').mission.kind, 'ecology'); const accepted = registry(s).actions.find(row => row.serial === empire(s, 'roots').mission.accepted);
    for (let role = 0; role < roles.length; role++) {
      s = await read(); const target = role === 0 ? activeWorld(s).life.find(l => l.id === exemplar.id) : activeWorld(s).life.find(l => l.taxonKey === roles[role]); assert.ok(target);
      const receipt = await scan(target.id); assert.ok(receipt.serial >= accepted.cut.lifeAction); s = await read(); assert.equal(progress(empire(s, 'roots')), role + 1);
    }
    s = await read(); assert.deepEqual(expedition(s).scans.find(row => row.lifeId === exemplar.id), knowledge); assert.ok(beforeAcceptScan.serial < accepted.cut.lifeAction);
    assert.deepEqual(empire(s, 'roots').mission.evidence.map(p => p.role).sort(), [0, 1, 2, 3, 4, 5]);
    assert.equal(empire(s, 'roots').mission.evidence[0].receipt.lifeId, exemplar.id); assert.notEqual(empire(s, 'roots').mission.evidence[0].receipt.serial, beforeAcceptScan.serial);
    observations.push({kind: 'known-instance-new-paid-scan', exemplar: exemplar.id, firstKnowledge: knowledge, beforeAcceptScan, accepted, proofs: structuredClone(empire(s, 'roots').mission.evidence)});
    await completeAndTreaty('roots', 1); await detail('space-biology', false); await shot('roots-catalogue-completed-1024'); await checkpoint('roots-catalogue');
    const raf = await frames(), measured = await read(); performanceSample = {frames: stats(raf), render: measured.render, camera: measured.spaceCamera, world: summary(activeWorld(measured)), empire: empire(measured, 'roots')};
    await sceneCycles();
    check('The first roots scan remains permanent knowledge but grants no new mission credit; six new paid physical role scans include that same instance, then personal hand-in ratifies the unrelated +1 treaty');
    phase = 'basalt physical survey'; await travel(7); await diplomaticAction('contact', 'basalt'); await survey('basalt'); await shot('basalt-survey-completed-1024'); await checkpoint('three-empires');
  } else if (continuation) {
    phase = 'resume basalt after genuine landing'; home = homeExport(sourceState); frozenHome = homePublic(await read());
    for (const w of sourceState.space.expedition.worlds) if (w.id !== sourceState.space.location.planetId) frozenWorlds.set(w.id, structuredClone(w));
    const activationFile = path.join(mainOut, 'empires-activation.save.json'), activationBytes = await readFile(activationFile), activated = JSON.parse(activationBytes).state;
    activation = {path: activationFile, sha256: hash(activationBytes), live: activated.space.empires.activated, checkpoint: JSON.parse(activated.checkpoint).space.empires.activated};
    observations.push({kind: 'harness-recovery', originalFailure: path.join(mainOut, 'failure.json'), source, sha256: sourceHash,
      reason: 'The driver pressed R only once without waiting for the genuine4-energy ascent price. It then waited for a leg that the game correctly declined. Public recovery retains the actual landing witness; no game-state repair or progression rewrite.',
      lostMeasurement: 'The original failure payload omitted the first90-RAF sample. It is not reconstructed; a new native90-RAF sample is measured on living basalt capital.'});
    await travel(planetIndex(empire(await read(), 'basalt').capitalId)); await completeAndTreaty('basalt', 1); await shot('basalt-survey-completed-1024');
    await checkpoint('three-empires'); const raf = await frames(), measured = await read();
    performanceSample = {frames: stats(raf), render: measured.render, camera: measured.spaceCamera, world: summary(activeWorld(measured)), empire: empire(measured, 'basalt')};
    check('Exact public recovery resumes from the already-earned basalt landing witness; genuine solar charging precedes R, personal return completes the final treaty, and the original failed run remains recorded');
  } else {
    phase = 'independent roots alternative'; home = homeExport(sourceState); frozenHome = homePublic(await read());
    for (const w of sourceState.space.expedition.worlds) if (w.id !== sourceState.space.location.planetId) frozenWorlds.set(w.id, structuredClone(w));
    await near({x: 0, z: 0}); await survey('roots', 'accept-survey'); await checkpoint('roots-survey');
    check('Independent public preaccept branch completes the explicit roots map alternative by a new physical landing and personal return; preserved main ecological branch remains byte-identical');
  }
  phase = 'physical home return'; await returnHome(); const final = await exported(branch ? 'branch-campaign.save.json' : 'active-campaign.save.json'), state = await read(); intact(state);
  if (!branch) {assert.ok(registry(state).entries.every(e => e.contact !== null && e.mission.completed !== null && e.treaty !== null)); assert.equal(registry(state).actions.length, 12);}
  assert.equal(economy(state).cargo.length, 0); assert.equal(expedition(state).cargo.length, 0); assert.equal(hash(await readFile(canonicalSource)), canonicalHash);
  if (preservedMain) assert.equal(hash(await readFile(preservedMain.path)), preservedMain.sha256);
  check('Ordinary neighbor jumps and physical home docking preserve paid colonies, historical finances and diplomatic witnesses; domestic state stays frozen until dock, no browser errors');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, canonicalSource: {path: canonicalSource, sha256: canonicalHash}, assets, activation, transactions, diplomaticActions, biologicalActions, observations, rekeys, legs, lifecycle, performance: performanceSample, images,
    account: economy(state), empires: registry(state), worlds: expedition(state).worlds.map(summary), frozenHomeSha256: hash(JSON.stringify(home)), preservedMain,
    activeCampaign: {path: path.join(out, branch ? 'branch-campaign.save.json' : 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Actual C3b continuation through public UI and native RAF. No setters, artificial clocks, injected funds/life, production helper imports or debug progression. Old transactions are preserved; only new sales/scans/landings satisfy accepted missions. The optional survey run is an independent ordinary branch of a public played export, not the main campaign. Does not claim whole D/SP013/SP014, fresh-lineage completion, human playtest or listening acceptance.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Keep readable diagnostics even if public export is blocked. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors, assets, images, legs, transactions, diplomaticActions, biologicalActions, observations, rekeys, lifecycle, performance: performanceSample, activation, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
