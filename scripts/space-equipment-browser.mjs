/** D2a paid equipment: actual D1 campaign, public UI/native RAF only.
 * No production helper imports, live setters or artificial clocks. Wait for the
 * approved production asset and exclusive native-test CPU before running. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-014d2a/browser');
const source = path.resolve('evidence/sp-013d1/browser/continuation/active-campaign.save.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, 'b2cf84538fea52c2e243affcbc2e0896507ccabe63d287d68a307e8986f8972e');
assert.equal(original.space.economy.version, 2); assert.equal(original.space.outfit, undefined); assert.equal(original.space.location, null);
assert.equal(original.space.economy.balance, 425); assert.equal(original.space.economy.pricingActivatedAction, 15);
assert.equal(new URL(base).searchParams.has('test'), false);
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native paid equipment: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transactions = [], biologicalActions = [], rekeys = [], lifecycle = [], observations = [];
const frozenWorlds = new Map();
const hotId = original.space.expedition.worlds.find(w => w.id.includes(':star-2:')).id;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null, departure = null, baselineSolar = null, equippedSolar = null;
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = state => state.space.expedition;
const economy = state => state.space.economy;
const outfit = state => state.space.outfit;
const activeWorld = state => expedition(state).worlds.find(world => world.id === state.space.location?.planetId);
const cargoCount = state => economy(state).cargo.reduce((n, c) => n + c.amount, 0) + expedition(state).cargo.length;
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function homeExport(state) {const v = structuredClone(state); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function beforeActivation(text) {const cp = JSON.parse(text); delete cp.id; delete cp.space.outfit; cp.space.economy.version = 2; delete cp.space.economy.ledger.equipment; delete cp.space.economy.counts.equipment; return cp;}
const summary = world => ({id: world.id, elapsed: world.elapsed, population: world.life.length, climate: [world.temperature, world.atmosphere]});
function intact(state) {
  assert.equal(state.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(state.space.ship.creation, original.space.ship.creation); assert.deepEqual(state.space.ship.purchase, original.space.ship.purchase);
  assert.deepEqual(state.space.empires, original.space.empires, 'Completed D1 diplomacy changed');
  const e = expedition(state), account = economy(state), installed = outfit(state); assert.equal(e.biosphere.version, 2); assert.equal(account.version, 3); assert.equal(installed.version, 1); assert.equal(installed.catalog, 1);
  const l = account.ledger; assert.equal(account.balance, l.deposits + l.revenue - l.construction - l.upgrades - l.repairs - l.charging - l.equipment);
  assert.equal(l.deposits, original.space.economy.ledger.deposits); assert.equal(account.pricingActivatedAction, 15);
  assert.equal(l.equipment, installed.purchases.reduce((n, receipt) => n + receipt.paid, 0)); assert.equal(account.counts.equipment, installed.purchases.length);
  assert.deepEqual(account.actions.slice(0, original.space.economy.actions.length), original.space.economy.actions, 'Historical economic receipts changed');
  for (const receipt of installed.purchases) assert.deepEqual(account.actions.find(row => row.serial === receipt.serial), receipt);
  for (const old of original.space.economy.colonies) {const c = account.colonies.find(v => v.id === old.id); for (const key of ['id', 'planetId', 'product', 'paid', 'level', 'upgraded', 'foundedAt']) assert.equal(c[key], old[key]);}
  assert.equal(account.colonies.length, 2); assert.ok(cargoCount(state) <= (installed.purchases.some(row => row.equipment === 'hold') ? 12 : 8));
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(e.worlds.find(w => w.id === id), snapshot, `Inactive biology advanced: ${id}`);
  if (frozenHome) assert.deepEqual(homePublic(state), frozenHome, 'Domestic state advanced during equipment flight');
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
async function shot(name, selector = '#space-outfit > p', overview = true) {
  assert.ok(images.length < 3); if (overview) {await near({x: 0, z: 0}); await hold('q', 'Physical equipment overview', s => s.space.location.pos.y >= 6.5, 20);} await frames(12);
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
  const state = await read(); observations.push({kind: 'equipment-screenshot', file, location: state.space.location, camera: state.spaceCamera});
  if (overview) await hold('c', 'Physical descent before further actions', s => s.space.location.pos.y <= 2.8);
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
  if (target === 'surface') frozenWorlds.delete((await read()).space.location.planetId);
  await page.locator('.space-heading h2').click(); const before = await read(); await page.keyboard.press(key);
  const during = await until(`Start ${target}`, s => !!s.space.leg); assert.equal(during.space.leg.to.scale, target); assert.equal(during.space.leg.duration, 3); assert.equal(expedition(during).biosphere.tool, 'off');
  const after = await until(`Arrive ${target}`, s => !s.space.leg && s.space.location.scale === target); assert.ok(after.space.elapsed - before.space.elapsed >= 3);
  if (before.space.location.scale === 'surface' && activeWorld(after)) frozenWorlds.set(after.space.location.planetId, structuredClone(activeWorld(after)));
  legs.push({from: before.space.location, to: after.space.location, duration: 3, paid: during.space.leg.energyPaid}); return after;
}
async function ascend() {
  await near({x: 0, z: 0}); if ((await read()).space.location.pos.y < 21) await hold('q', 'Ascend', s => s.space.location.pos.y >= 21);
  await scale('r', 'orbit'); await scale('r', 'system');
}
async function surface() {await scale('v', 'orbit'); await scale('v', 'surface'); await hold('c', 'Transfer altitude', s => s.space.location.pos.y <= 2.8);}
async function mapRow(index) {
  await detail('space-star-map'); for (const row of await page.locator('.space-star-list > section').all()) if ((await row.locator('b').innerText()).startsWith(`${index === 0 ? '⌂' : index} ·`)) return row;
  throw new Error(`Missing public map row ${index}`);
}
async function jump(index, options = {}) {
  const row = await mapRow(index), text = await row.innerText(), mapText = await page.locator('#space-star-map').innerText();
  const quote = (await row.locator('p').first().innerText()).match(/^(\d+(?:\.\d+)?) · (\d+) energie/); assert.ok(quote, text);
  const distance = Number(quote[1]), price = Number(quote[2]); assert.match(mapText, /Dosah lodi 32/);
  if (options.long) assert.ok(distance > 18 && distance <= 32, `Public distance ${distance}`);
  const button = row.locator('button'), action = await button.getAttribute('data-action'); assert.ok(action.startsWith('space-jump:'));
  await until('Solar energy for published jump price', s => s.space.ship.energy >= price);
  assert.equal(await button.isDisabled(), false, await row.innerText());
  if (options.screenshot) {await row.scrollIntoViewIfNeeded(); await shot(options.screenshot, null, false);}
  const before = await read(); await button.click(); const during = await until('Interstellar leg', s => !!s.space.leg);
  assert.equal(during.space.leg.duration, 6); assert.equal(during.space.leg.energyPaid, price); const target = during.space.leg.to.systemId;
  assert.equal(target, action.slice('space-jump:'.length)); await detail('space-star-map', false);
  if (options.checkpoint) await checkpoint(options.checkpoint, true);
  const after = await until('Interstellar arrival', s => !s.space.leg && s.space.location.systemId === target); assert.ok(after.space.elapsed - before.space.elapsed >= 6);
  const flight = {from: before.space.location, to: after.space.location, duration: 6, paid: price, publicDistance: distance, publicQuote: text, cargo: economy(before).cargo, installed: outfit(before).purchases.map(p => p.equipment)};
  legs.push(flight); observations.push({kind: 'physical-jump', ...flight}); return after;
}
async function checkpoint(label, inLeg = false) {
  await pause(); const stopped = await read(); await page.waitForTimeout(250); assert.deepEqual((await read()).space, stopped.space);
  await act('save'); const before = await exported(`${label}.save.json`); if (home) assert.deepEqual(homeExport(before.value.state), home);
  if (inLeg) {assert.ok(before.value.state.space.leg); assert.equal(before.value.state.space.leg.duration, 6); assert.equal(cargoCount(stopped), 12);}
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported(), a = before.value.state.space, b = after.value.state.space;
  assert.notEqual(before.value.state.id, after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  assert.deepEqual(b.outfit, a.outfit); assert.deepEqual(b.empires, a.empires); assert.deepEqual(b.expedition.cargo, a.expedition.cargo);
  for (const key of ['version', 'pricingActivatedAction', 'balance', 'ledger', 'cargo', 'sales', 'counts', 'actions', 'nextAction', 'activated']) assert.deepEqual(b.economy[key], a.economy[key]);
  if (home) assert.deepEqual(homeExport(after.value.state), home);
  if (inLeg) {
    assert.ok(b.leg); for (const key of ['from', 'to', 'duration', 'energyPaid']) assert.deepEqual(b.leg[key], a.leg[key]);
    assert.ok(b.leg.elapsed >= a.leg.elapsed && b.leg.elapsed - a.leg.elapsed <= b.elapsed - a.elapsed + 1e-8);
    assert.equal(b.ship.energy, a.ship.energy); assert.equal(b.nextSerial, a.nextSerial);
  }
  rekeys.push({label, path: path.join(out, `${label}.save.json`), sha256: before.sha256, from: before.value.state.id, to: after.value.state.id, inLeg,
    legBefore: a.leg, legAfter: b.leg, cargo: a.economy.cargo, outfit: a.outfit}); await resume();
}
async function buy(equipment, price, badge) {
  await detail('space-dock'); await detail('space-outfit'); const before = await read(), revision = economy(before).nextAction;
  assert.equal(before.space.location, null); const button = page.locator(`button[data-action="space-equipment:${equipment}|${revision}"]:visible`);
  assert.equal(await button.isDisabled(), false, await button.getAttribute('title')); const text = await page.locator('#space-outfit').innerText();
  await button.click(); const after = await until(`Paid equipment ${equipment}`, s => outfit(s).purchases.some(row => row.equipment === equipment));
  const receipt = outfit(after).purchases.find(row => row.equipment === equipment); assert.equal(receipt.serial, revision); assert.equal(receipt.paid, price);
  assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(before).balance - price); assert.equal(economy(after).balance, receipt.balanceAfter);
  assert.deepEqual(receipt.unlock, badge); assert.equal(after.space.ship.energy, before.space.ship.energy); assert.equal(after.space.ship.health, before.space.ship.health);
  assert.deepEqual(after.space.ship.creation, before.space.ship.creation); assert.deepEqual(after.space.ship.purchase, before.space.ship.purchase);
  transactions.push({text, receipt}); console.log('Paid equipment', JSON.stringify(receipt));
}
async function measureIdle(label) {
  await page.locator('.space-heading h2').click(); const before = await read(); assert.equal(before.space.leg, null); assert.equal(expedition(before).biosphere.tool, 'off'); assert.ok(before.space.ship.energy < 90, 'Solar measurement must not hit its ceiling');
  const after = await until(label, s => s.space.elapsed - before.space.elapsed >= 1.25, 30000, 30);
  const elapsed = after.space.elapsed - before.space.elapsed, energy = after.space.ship.energy - before.space.ship.energy;
  assert.deepEqual(after.space.location, before.space.location); assert.ok(elapsed >= 1.25 && elapsed <= 3); assert.ok(after.space.ship.energy < 105);
  const text = await page.locator('.space-instruments').innerText(), shown = text.match(/dobíjí \+(\d+(?:\.\d+)?) energie\/s/); assert.ok(shown, text);
  const measured = {label, elapsed, energy, rate: energy / elapsed, roundedHudRate: Number(shown[1]), before: before.space.ship.energy, after: after.space.ship.energy, text};
  assert.ok(Math.abs(measured.rate - measured.roundedHudRate) <= .051); observations.push({kind: 'native-solar-rate', ...measured}); console.log(label, JSON.stringify(measured)); return measured;
}
async function economyAction(kind, origin) {
  await detail('space-economy'); const before = await read(), revision = economy(before).nextAction;
  const action = `space-economy:${kind}|${revision}${origin ? `|${origin}` : ''}`, button = page.locator(`button[data-action="${action}"]:visible`).first();
  assert.equal(await button.isDisabled(), false, `${kind}: ${await button.getAttribute('title')}`); const quote = await button.getAttribute('title'); await button.click();
  const after = await until(`${kind} receipt`, s => economy(s).nextAction === revision + 1), receipt = economy(after).actions.find(a => a.serial === revision);
  assert.equal(receipt.kind, kind); assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(after).balance);
  transactions.push({quote, receipt}); console.log(kind, JSON.stringify(receipt)); return receipt;
}
async function fullSharedCargo() {
  await detail('space-biology'); const s = await read(), life = activeWorld(s).life[0]; await page.locator('#space-specimen').selectOption(life.id); await near(life.pos);
  if (!expedition(await read()).scans.some(row => row.lifeId === life.id)) {
    await until('Scanner energy', x => x.space.ship.energy >= 1); const serial = expedition(await read()).nextAction;
    await act(`space-scan:${life.id}`); const after = await until('New paid scan', x => expedition(x).actions.some(row => row.serial >= serial && row.kind === 'scan' && row.lifeId === life.id));
    const receipt = expedition(after).actions.find(row => row.serial >= serial && row.kind === 'scan' && row.lifeId === life.id); assert.equal(receipt.energyPaid, 1); biologicalActions.push(receipt);
  }
  assert.equal(await page.locator(`button[data-action="space-collect:${life.id}"]`).isDisabled(), true);
  const text = await page.locator('#space-biology').innerText(); assert.match(text, /Náklad je plný \(12\)/);
  assert.equal(expedition(await read()).cargo.length, 0); assert.ok(activeWorld(await read()).life.some(row => row.id === life.id));
  observations.push({kind: 'full-shared-cargo', lifeId: life.id, text}); await near({x: 0, z: 0}); await detail('space-biology', false);
}
async function sceneCycles() {
  await near({x: 0, z: 0}); await hold('q', 'Equipment scene ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read();
    await hold('q', 'Equipment repeated ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), cargo: cargoCount(after), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row);
    if (cycle > 1) {assert.equal(row.retainedGeometry, 0); assert.equal(row.after.programs, row.before.programs); assert.equal(row.after.textures, row.before.textures);}
  }
  await scale('r', 'system');
}
try {
  await importCampaign(source); const activated = await exported('outfit-activation.save.json'), state = activated.value.state, e = state.space.economy, o = state.space.outfit;
  for (const key of ['balance', 'cargo', 'sales', 'actions', 'nextAction', 'activated', 'pricingActivatedAction']) assert.deepEqual(e[key], original.space.economy[key]);
  assert.deepEqual(e.ledger, {...original.space.economy.ledger, equipment: 0}); assert.deepEqual(e.counts, {...original.space.economy.counts, equipment: 0});
  assert.deepEqual(o.purchases, []); assert.deepEqual(o.activated, {at: original.space.elapsed, tick: original.tick, travelAction: original.space.nextSerial, lifeAction: original.space.expedition.nextAction, economyAction: original.space.economy.nextAction});
  const homeElapsed = e.elapsed - original.space.economy.elapsed; assert.ok(homeElapsed >= 0);
  for (const old of original.space.economy.colonies) {
    const c = e.colonies.find(row => row.id === old.id); for (const key of ['id', 'planetId', 'product', 'foundedAt', 'paid', 'level', 'upgraded', 'loaded']) assert.equal(c[key], old[key]);
    assert.ok(c.productiveElapsed >= old.productiveElapsed && c.productiveElapsed - old.productiveElapsed <= homeElapsed + 1e-7);
    const cycles = Math.floor((c.productiveElapsed + 1e-8) / 10) - Math.floor((old.productiveElapsed + 1e-8) / 10); assert.ok(c.produced >= old.produced && c.produced - old.produced <= cycles * c.level);
    assert.ok(c.produced - c.loaded <= c.level * 8); if (old.produced - old.loaded === old.level * 8) assert.equal(c.produced, old.produced);
  }
  assert.deepEqual(state.space.ship, original.space.ship); assert.deepEqual(state.space.expedition, original.space.expedition); assert.deepEqual(state.space.empires, original.space.empires);
  assert.deepEqual(beforeActivation(state.checkpoint), beforeActivation(original.checkpoint)); const cp = JSON.parse(state.checkpoint);
  assert.equal(cp.space.economy.version, 3); assert.equal(cp.space.economy.ledger.equipment, 0); assert.equal(cp.space.economy.counts.equipment, 0); assert.deepEqual(cp.space.outfit.purchases, []);
  activation = {path: path.join(out, 'outfit-activation.save.json'), sha256: activated.sha256, live: o.activated, checkpoint: cp.space.outfit.activated}; console.log('Public activation export', JSON.stringify(activation));
  for (const world of state.space.expedition.worlds) frozenWorlds.set(world.id, structuredClone(world));
  check('Public D1 import activates empty outfit/live-checkpoint v3 accounts; prior pricing cut15, paid ship, colonies, life, diplomacy and historical receipts remain intact');
  phase = 'native original solar baseline'; await resume(); await detail('space-dock'); await detail('space-outfit');
  const initialText = await page.locator('#space-outfit').innerText(); assert.match(initialText, /Náklad 8 · dosah 18/); for (const badge of ['Kupec cest', 'Hvězdný zvěd', 'Správce života']) assert.ok(initialText.includes(`◆ ${badge}`));
  observations.push({kind: 'original-badges-and-capabilities', text: initialText}); await act('space-launch'); await until('Baseline launch', s => s.space.location?.scale === 'surface');
  frozenHome = homePublic(await read()); baselineSolar = await measureIdle('Original solar charging'); frozenHome = null;
  await page.keyboard.press('v'); await until('Baseline home dock', s => s.space.location === null);
  phase = 'three actual paid modules'; await buy('hold', 80, {empireId: 'resin', completedSerial: 3}); await buy('drive', 120, {empireId: 'basalt', completedSerial: 11}); await buy('solar', 60, {empireId: 'roots', completedSerial: 7});
  assert.equal(economy(await read()).balance, 165); assert.equal(economy(await read()).ledger.equipment, 260); await checkpoint('equipment-installed');
  check('Three earned mission kinds unlock exactly three paid modules:425→165, equipment ledger260; every installation preserves current energy/health and immutable paid blueprint, and survives public rekey');
  phase = 'equipped native solar and model'; await detail('space-dock'); await act('space-launch'); await until('Equipped launch', s => s.space.location?.scale === 'surface');
  const departureExport = await exported('departure.save.json'); home = homeExport(departureExport.value.state); frozenHome = homePublic(await read());
  departure = {path: path.join(out, 'departure.save.json'), sha256: departureExport.sha256, fullHomeSha256: hash(JSON.stringify(home))}; await resume();
  equippedSolar = await measureIdle('Equipped solar charging'); assert.ok(Math.abs(equippedSolar.rate - baselineSolar.rate - 2) < 1e-6);
  await detail('space-outfit'); assert.match(await page.locator('#space-outfit').innerText(), /Náklad 12 · dosah 32/); await shot('paid-equipment-model-1024');
  check('Two genuine idle flight samples use actual space.elapsed; photosynthetic leaves add exactly2 energy per second above the measured original baseline without filling energy on purchase');
  phase = 'actual longer jump'; await ascend(); await jump(2, {long: true, screenshot: 'extended-range-map-1024'}); await surface();
  phase = 'twelve actual goods'; await until('Twelve actual hot products', s => {const c = economy(s).colonies.find(row => row.planetId === hotId); return c.produced - c.loaded >= 12;});
  const loaded = await economyAction('load'); assert.equal(loaded.amount, 12); assert.equal(cargoCount(await read()), 12);
  await fullSharedCargo(); await detail('space-economy'); await shot('twelve-products-equipped-1024', '.space-product-cargo');
  const raf = await frames(), measured = await read(); performanceSample = {frames: stats(raf), render: measured.render, camera: measured.spaceCamera, world: summary(activeWorld(measured)), outfit: outfit(measured), cargo: economy(measured).cargo};
  await sceneCycles(); const homeRow = await mapRow(0), homeMarketText = await homeRow.innerText(), price = homeMarketText.match(/Měsíční sůl (\d+)/); assert.ok(price, homeMarketText);
  observations.push({kind: 'published-destination-market', text: homeMarketText, unitPrice: Number(price[1])}); await detail('space-star-map', false);
  phase = 'laden long flight persistence'; await jump(0, {long: true, checkpoint: 'laden-long-flight'}); await surface();
  check('The paid drive completes real jumps beyond18; twelve produced goods fill the shared hold and block an additional life transfer, then cargo/equipment/paid leg survive public save-import-rekey during flight');
  const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenHome = null;
  phase = 'home market and final save'; await page.keyboard.press('v'); await until('Physical home dock', s => s.space.location === null); await detail('space-dock'); await detail('space-economy');
  const saleText = await page.locator('.space-product-cargo').innerText(); assert.ok(saleText.includes(`${Number(price[1])} ◈/ks`), saleText);
  const sold = await economyAction('sell', hotId); assert.equal(sold.amount, 12); assert.equal(sold.unitPrice, Number(price[1])); assert.equal(sold.earned, sold.amount * sold.unitPrice);
  assert.ok(sold.priceBasis); assert.equal(sold.priceBasis.version, 1); assert.equal(sold.priceBasis.base + sold.priceBasis.bonus, sold.unitPrice);
  const final = await exported('active-campaign.save.json'), finalState = await read(); intact(finalState); assert.equal(cargoCount(finalState), 0); assert.equal(economy(finalState).balance, 165 + sold.earned);
  assert.equal(hash(await readFile(source)), sourceHash); check('Actual12-unit delivery sells at the previously visible v3 market price; all old receipts remain exact, both colonies persist and the full domestic save stays frozen until physical docking');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, assets, activation, departure, baselineSolar, equippedSolar, transactions, biologicalActions, observations, rekeys, legs, lifecycle, performance: performanceSample, images,
    account: economy(finalState), outfit: outfit(finalState), worlds: expedition(finalState).worlds.map(summary), homeFacts: {fullHomeSha256: hash(JSON.stringify(home)), departure}, activeCampaign: {path: path.join(out, 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Real D1 campaign continued by public UI/native RAF. No live setters, debug time, invented badges/funds, production helper imports or edited campaign payloads. Three genuine purchases, native original/equipped solar comparison, actual jumps beyond18,12-unit physical trade, shared full-cargo rejection, paid-leg save/import and return. Does not claim all D2 or human playtest/listening acceptance.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Retain read-only diagnostics when public export itself is blocked. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, source: {path: source, sha256: sourceHash}, checks, errors, assets, activation, departure, baselineSolar, equippedSolar, images, legs, transactions, biologicalActions, observations, rekeys, lifecycle, performance: performanceSample,
    homeFacts: {fullHomeSha256: home && hash(JSON.stringify(home)), departure, publicSnapshot: frozenHome, frozenWorlds: [...frozenWorlds].map(([id, world]) => ({id, sha256: hash(JSON.stringify(world))}))}, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
