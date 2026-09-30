/** D2b: real paid escort, sovereign title and a produced-goods return.
 * Public controls/import/export and native RAF only. Never run before the
 * approved production asset and exclusive native-test CPU have been granted. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-013d2b/browser');
const source = path.resolve('evidence/sp-014d2a/browser/active-campaign.save.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, 'a2f91fe0d3123a35c7ecae4672476b01a90ea24268f2d0689cfc11e3a14e61d3');
assert.equal(original.space.economy.version, 3); assert.equal(original.space.expansion, undefined); assert.equal(original.space.location, null);
assert.equal(original.space.economy.balance, 261); assert.equal(original.space.economy.pricingActivatedAction, 15);
assert.equal(new URL(base).searchParams.has('test'), false);
assert.ok(process.env.LUMAVORA_ASSET, 'Explicit final D2b production asset is required; the old D2a build cannot prove this flow');
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native paid escort: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transactions = [], rekeys = [], lifecycle = [], observations = [];
const frozenWorlds = new Map();
const resin = original.space.empires.entries.find(row => row.id === 'resin'), resinId = resin.capitalId;
assert.equal(resin.treaty, 4);
const productNames = {'sun-resin': 'Sluneční pryskyřice', 'moon-salt': 'Měsíční sůl', 'spore-silk': 'Výtrusové vlákno'};
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null, departure = null, allyPrevious = null;
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = state => state.space.expedition;
const economy = state => state.space.economy;
const outfit = state => state.space.outfit;
const expansion = state => state.space.expansion;
const escort = state => expansion(state).allies[0];
const activeWorld = state => expedition(state).worlds.find(world => world.id === state.space.location?.planetId);
const cargoCount = state => economy(state).cargo.reduce((n, c) => n + c.amount, 0) + expedition(state).cargo.length;
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function homeExport(state) {const v = structuredClone(state); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function beforeActivation(text) {const cp = JSON.parse(text); delete cp.id; delete cp.space.expansion; cp.space.economy.version = 3; delete cp.space.economy.ledger.alliance; delete cp.space.economy.ledger.territory; delete cp.space.economy.counts.alliance; delete cp.space.economy.counts.territory; return cp;}
const summary = world => ({id: world.id, elapsed: world.elapsed, population: world.life.length, climate: [world.temperature, world.atmosphere]});
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function allyAccount(state) {
  const p = state.space, current = escort(state); if (!current) return;
  assert.equal(current.empireId, 'resin'); assert.equal(current.id, `${p.homePlanetId}:ally-resin`);
  assert.ok(Math.abs(current.energy - (12 + current.generated - current.delivered)) < 1e-7);
  assert.ok(current.energy >= -1e-8 && current.energy <= 12 + 1e-8);
  const previous = allyPrevious?.ally, elapsed = p.elapsed - (allyPrevious?.elapsed ?? 0);
  if (previous) {
    assert.ok(elapsed >= -1e-8, 'Escort time moved backwards');
    assert.ok(current.generated >= previous.generated - 1e-8 && current.delivered >= previous.delivered - 1e-8);
    assert.ok(current.generated - previous.generated <= .8 * elapsed + 1e-7);
    assert.ok(current.delivered - previous.delivered <= 2 * elapsed + 1e-7);
    const sameLeg = p.leg && allyPrevious.leg && JSON.stringify(p.leg.from) === JSON.stringify(allyPrevious.leg.from) && JSON.stringify(p.leg.to) === JSON.stringify(allyPrevious.leg.to);
    if (sameLeg || (!p.location && !allyPrevious.location)) assert.deepEqual(current, previous, 'Escort ticked during a shared leg or while parked');
  }
  allyPrevious = {elapsed: p.elapsed, ally: structuredClone(current), location: p.location, leg: p.leg};
}
function intact(state) {
  assert.equal(state.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(state.space.ship.creation, original.space.ship.creation); assert.deepEqual(state.space.ship.purchase, original.space.ship.purchase);
  assert.deepEqual(state.space.empires, original.space.empires, 'D1 diplomatic anchors or receipts changed');
  assert.deepEqual(outfit(state), original.space.outfit, 'Historical paid equipment changed');
  const e = expedition(state), account = economy(state), x = expansion(state); assert.equal(e.biosphere.version, 2); assert.equal(account.version, 4); assert.equal(x.version, 1);
  const l = account.ledger; assert.equal(account.balance, l.deposits + l.revenue - l.construction - l.upgrades - l.repairs - l.charging - l.equipment - l.alliance - l.territory);
  for (const key of ['deposits', 'equipment', 'upgrades', 'charging', 'repairs', 'healthRestored', 'energyRestored']) assert.equal(l[key], original.space.economy.ledger[key]);
  assert.equal(account.pricingActivatedAction, 15);
  assert.deepEqual(account.actions.slice(0, original.space.economy.actions.length), original.space.economy.actions, 'Historical economic receipts changed');
  for (const kind of ['alliance', 'territory']) {const rows = x.actions.filter(row => row.kind === kind); assert.equal(l[kind], rows.reduce((n, row) => n + row.paid, 0)); assert.equal(account.counts[kind], rows.length);}
  for (const receipt of x.actions) assert.deepEqual(account.actions.find(row => row.serial === receipt.serial), receipt);
  for (const old of original.space.economy.colonies) {const c = account.colonies.find(v => v.id === old.id); for (const key of ['id', 'planetId', 'product', 'paid', 'level', 'upgraded', 'foundedAt', 'permission', 'loaded']) assert.deepEqual(c[key], old[key]);}
  assert.ok(account.colonies.length >= 2 && account.colonies.length <= 3); assert.ok(cargoCount(state) <= 12); assert.equal(e.cargo.length, 0);
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(e.worlds.find(w => w.id === id), snapshot, `Inactive biology advanced: ${id}`);
  if (frozenHome) assert.deepEqual(homePublic(state), frozenHome, 'Domestic state advanced during allied expedition');
  allyAccount(state);
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
async function shot(name, selector = '#space-allies > p:last-child', overview = true) {
  assert.ok(images.length < 3); if (overview) {await near({x: 0, z: 0}); await hold('q', 'Physical escort overview', s => s.space.location.pos.y >= 6.5, 20);} await frames(12);
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
  const state = await read(); observations.push({kind: 'escort-screenshot', file, location: state.space.location, camera: state.spaceCamera});
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
  const button = row.locator('button'), action = await button.getAttribute('data-action'); assert.ok(action.startsWith('space-jump:'));
  await until('Solar energy for published jump price', s => s.space.ship.energy >= price);
  assert.equal(await button.isDisabled(), false, await row.innerText());
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
  if (inLeg) {assert.ok(before.value.state.space.leg); assert.equal(before.value.state.space.leg.duration, 6); assert.equal(cargoCount(stopped), 8);}
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported(), a = before.value.state.space, b = after.value.state.space;
  assert.notEqual(before.value.state.id, after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  assert.deepEqual(b.outfit, a.outfit); assert.deepEqual(b.expansion.actions, a.expansion.actions); assert.deepEqual(b.expansion.activated, a.expansion.activated); assert.deepEqual(b.empires, a.empires); assert.deepEqual(b.expedition.cargo, a.expedition.cargo);
  for (const key of ['version', 'pricingActivatedAction', 'balance', 'ledger', 'cargo', 'sales', 'counts', 'actions', 'nextAction', 'activated']) assert.deepEqual(b.economy[key], a.economy[key]);
  if (home) assert.deepEqual(homeExport(after.value.state), home);
  for (const colony of a.economy.colonies) assert.deepEqual(b.economy.colonies.find(row => row.id === colony.id).permission, colony.permission);
  if (inLeg) {
    assert.deepEqual(b.expansion, a.expansion); assert.ok(b.leg); for (const key of ['from', 'to', 'duration', 'energyPaid']) assert.deepEqual(b.leg[key], a.leg[key]);
    assert.ok(b.leg.elapsed >= a.leg.elapsed && b.leg.elapsed - a.leg.elapsed <= b.elapsed - a.elapsed + 1e-8);
    assert.equal(b.ship.energy, a.ship.energy); assert.equal(b.nextSerial, a.nextSerial);
  }
  rekeys.push({label, path: path.join(out, `${label}.save.json`), sha256: before.sha256, from: before.value.state.id, to: after.value.state.id, inLeg,
    legBefore: a.leg, legAfter: b.leg, cargo: a.economy.cargo, expansionBefore: a.expansion, expansionAfter: b.expansion}); await resume();
}
async function economyAction(kind, origin) {
  await detail('space-economy'); const before = await read(), revision = economy(before).nextAction;
  const action = `space-economy:${kind}|${revision}${origin ? `|${origin}` : ''}`, button = page.locator(`button[data-action="${action}"]:visible`).first();
  assert.equal(await button.isDisabled(), false, `${kind}: ${await button.getAttribute('title')}`); const quote = await button.getAttribute('title'); await button.click();
  const after = await until(`${kind} receipt`, s => economy(s).nextAction === revision + 1), receipt = economy(after).actions.find(a => a.serial === revision);
  assert.equal(receipt.kind, kind); assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(after).balance);
  transactions.push({quote, receipt}); console.log(kind, JSON.stringify(receipt)); return receipt;
}
async function sceneCycles() {
  await near({x: 0, z: 0}); await hold('q', 'Escorted scene ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read();
    await hold('q', 'Escorted repeated ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), cargo: cargoCount(after), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row);
    if (cycle > 1) {assert.equal(row.retainedGeometry, 0); assert.equal(row.after.programs, row.before.programs); assert.equal(row.after.textures, row.before.textures);}
  }
  await scale('v', 'surface'); await hold('c', 'Colony transfer altitude', s => s.space.location.pos.y <= 2.8);
}
async function ensureEnergyDeficit() {
  if ((await read()).space.ship.energy <= 70) return;
  await page.locator('.space-heading h2').click(); const before = await read(), started = performance.now();
  const yaw = before.camera.yaw, across = s => s.space.location.pos.x * Math.cos(yaw) - s.space.location.pos.z * Math.sin(yaw);
  let key = 'd', direction = 1; await page.keyboard.down('Shift'); await page.keyboard.down(key);
  try {
    while (true) {
      const remaining = 90000 - (performance.now() - started); assert.ok(remaining > 0, 'Native boosted flight did not create an energy deficit');
      const state = await until('Continuous ordinary thrust creates an energy deficit', s => s.space.ship.energy <= 68 || across(s) * direction >= 26, remaining, 40);
      if (state.space.ship.energy <= 68) break;
      const next = key === 'd' ? 'a' : 'd'; await page.keyboard.down(next); await page.keyboard.up(key); key = next; direction *= -1;
    }
  } finally {await page.keyboard.up(key); await page.keyboard.up('Shift');}
  const depleted = await read(); await near({x: 0, z: 0}); const after = await read(); intact(after);
  observations.push({kind: 'ordinary-thrust-before-alliance', before: before.space.ship.energy, depleted: depleted.space.ship.energy, afterReturn: after.space.ship.energy, elapsed: after.space.elapsed - before.space.elapsed});
}
async function purchase(kind, paid) {
  await detail('space-diplomacy'); const before = await read(), revision = economy(before).nextAction;
  const button = page.locator(`button[data-action="space-expansion:${kind}|resin|${revision}"]`);
  assert.equal(await button.isDisabled(), false, await button.getAttribute('title'));
  const text = await page.locator('.space-expansion').innerText(); await button.click();
  const after = await until(`Paid ${kind}`, s => expansion(s).actions.some(row => row.serial === revision));
  const receipt = expansion(after).actions.find(row => row.serial === revision), elapsed = after.space.elapsed - before.space.elapsed;
  assert.equal(receipt.kind, kind); assert.equal(receipt.paid, paid); assert.equal(receipt.treatySerial, 4); assert.equal(receipt.shipId, before.space.ship.id);
  assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(before).balance - paid); assert.equal(economy(after).balance, receipt.balanceAfter);
  assert.equal(after.space.ship.health, before.space.ship.health);
  const delivered = (escort(after)?.delivered ?? 0) - (escort(before)?.delivered ?? 0);
  assert.ok(after.space.ship.energy - before.space.ship.energy <= 4.82 * elapsed + delivered + 1e-6, 'Purchase granted unexplained player energy');
  assert.equal(economy(after).colonies.length, economy(before).colonies.length, 'Purchase created a free colony');
  transactions.push({text, receipt, elapsed, shipEnergyBefore: before.space.ship.energy, shipEnergyAfter: after.space.ship.energy, delivered});
  console.log(`Paid ${kind}`, JSON.stringify(receipt)); return receipt;
}
async function measureTransfer() {
  await page.locator('.space-heading h2').click(); const before = await read();
  assert.ok(before.space.ship.energy < 90, 'Transfer sample must start below the player energy ceiling');
  const after = await until('Actual allied energy sharing', s => s.space.elapsed - before.space.elapsed >= 1.25, 30000, 30);
  const elapsed = after.space.elapsed - before.space.elapsed, delivered = escort(after).delivered - escort(before).delivered, generated = escort(after).generated - escort(before).generated;
  assert.ok(elapsed >= 1.25 && elapsed <= 3); assert.deepEqual(after.space.location, before.space.location);
  assert.ok(delivered > 0 && delivered <= 2 * elapsed + 1e-7); assert.ok(generated > 0 && generated <= .8 * elapsed + 1e-7);
  assert.ok(after.space.ship.energy < 105, 'Unclamped transfer sample required');
  assert.ok(Math.abs((after.space.ship.energy - before.space.ship.energy) - (4.82 * elapsed + delivered)) < 1e-6, 'Player gain differs from own solar plus symmetric ally delivery');
  assert.ok(distance3(escort(after).location.pos, after.space.location.pos) <= 6);
  const row = {kind: 'native-allied-transfer', elapsed, generated, delivered, shipEnergyBefore: before.space.ship.energy, shipEnergyAfter: after.space.ship.energy, allyBefore: escort(before), allyAfter: escort(after)};
  observations.push(row); console.log('Physical energy delivery', JSON.stringify(row));
}
async function physicalFollow() {
  await page.locator('.space-heading h2').click(); const before = await read(); await page.keyboard.down('d'); let early, after;
  try {await frames(2); early = await read(); intact(early); after = await until('Physical escort follows moving player', s => distance3(s.space.location.pos, before.space.location.pos) >= 14, 20000, 40);}
  finally {await page.keyboard.up('d');}
  for (const state of [early, after]) {
    const elapsed = state.space.elapsed - before.space.elapsed, moved = distance3(escort(state).location.pos, escort(before).location.pos);
    assert.ok(moved > 0); assert.ok(moved <= 38.8 * elapsed + 1e-6, 'Escort teleported beyond the maximum physical movement bound');
    assert.equal(escort(state).location.planetId, state.space.location.planetId); assert.equal(escort(state).location.scale, 'surface');
  }
  observations.push({kind: 'native-escort-movement', before: {elapsed: before.space.elapsed, player: before.space.location, ally: escort(before)}, early: {elapsed: early.space.elapsed, player: early.space.location, ally: escort(early)}, after: {elapsed: after.space.elapsed, player: after.space.location, ally: escort(after)}, speedUpperBound: 38.8});
  await near({x: 0, z: 0});
}
async function market(index, product) {
  const row = await mapRow(index), text = await row.innerText(), match = text.match(new RegExp(`${productNames[product]} (\\d+)`));
  assert.ok(match, text); const price = Number(match[1]); observations.push({kind: 'published-market', index, product, price, text}); await detail('space-star-map', false); return {price, text};
}
try {
  await importCampaign(source); const activated = await exported('expansion-activation.save.json'), state = activated.value.state, e = state.space.economy, x = state.space.expansion;
  for (const key of ['balance', 'cargo', 'sales', 'actions', 'nextAction', 'activated', 'pricingActivatedAction']) assert.deepEqual(e[key], original.space.economy[key]);
  assert.deepEqual(e.ledger, {...original.space.economy.ledger, alliance: 0, territory: 0}); assert.deepEqual(e.counts, {...original.space.economy.counts, alliance: 0, territory: 0});
  assert.deepEqual(x.actions, []); assert.deepEqual(x.allies, []);
  assert.deepEqual(x.activated, {at: original.space.elapsed, tick: original.tick, travelAction: original.space.nextSerial, lifeAction: original.space.expedition.nextAction, economyAction: original.space.economy.nextAction});
  const homeElapsed = e.elapsed - original.space.economy.elapsed; assert.ok(homeElapsed >= 0);
  for (const old of original.space.economy.colonies) {
    const c = e.colonies.find(row => row.id === old.id); for (const key of ['id', 'planetId', 'product', 'foundedAt', 'paid', 'level', 'upgraded', 'loaded']) assert.equal(c[key], old[key]);
    assert.ok(c.productiveElapsed >= old.productiveElapsed && c.productiveElapsed - old.productiveElapsed <= homeElapsed + 1e-7);
    const cycles = Math.floor((c.productiveElapsed + 1e-8) / 10) - Math.floor((old.productiveElapsed + 1e-8) / 10); assert.ok(c.produced >= old.produced && c.produced - old.produced <= cycles * c.level);
    assert.ok(c.produced - c.loaded <= c.level * 8); if (old.produced - old.loaded === old.level * 8) assert.equal(c.produced, old.produced);
  }
  for (const key of ['ship', 'expedition', 'empires', 'outfit']) assert.deepEqual(state.space[key], original.space[key]);
  assert.deepEqual(beforeActivation(state.checkpoint), beforeActivation(original.checkpoint)); const cp = JSON.parse(state.checkpoint);
  assert.equal(cp.space.economy.version, 4); for (const key of ['alliance', 'territory']) {assert.equal(cp.space.economy.ledger[key], 0); assert.equal(cp.space.economy.counts[key], 0);}
  assert.deepEqual(cp.space.expansion.actions, []); assert.deepEqual(cp.space.expansion.allies, []);
  activation = {path: path.join(out, 'expansion-activation.save.json'), sha256: activated.sha256, live: x.activated, checkpoint: cp.space.expansion.activated}; console.log('Public activation export', JSON.stringify(activation));
  for (const world of state.space.expedition.worlds) frozenWorlds.set(world.id, structuredClone(world));
  check('Public D2a import activates empty expansion and v4 live/checkpoint accounts; all old pricing, equipment, diplomacy, biological state and paid receipts remain exact without gifts');
  phase = 'physical arrival at resin'; await resume(); await detail('space-dock'); await act('space-launch'); await until('Launch', s => s.space.location?.scale === 'surface');
  const departureExport = await exported('departure.save.json'); home = homeExport(departureExport.value.state); frozenHome = homePublic(await read());
  departure = {path: path.join(out, 'departure.save.json'), sha256: departureExport.sha256, fullHomeSha256: hash(JSON.stringify(home))}; await resume();
  await ascend(); await jump(1); await surface(); await detail('space-economy');
  const foreignFound = page.locator(`button[data-action="space-economy:found|${economy(await read()).nextAction}"]`);
  assert.equal(await foreignFound.isDisabled(), true); const ownershipRejection = await foreignFound.getAttribute('title'); assert.match(ownershipRejection, /patří cizí říši/);
  observations.push({kind: 'foreign-title-required', text: ownershipRejection}); await detail('space-economy', false);
  const oldMarket = await market(1, 'moon-salt'); assert.equal(oldMarket.price, 12); await detail('space-diplomacy');
  phase = 'paid physical ally'; await ensureEnergyDeficit(); const alliance = await purchase('alliance', 40); assert.equal(economy(await read()).balance, 221);
  assert.equal(escort(await read()).paidSerial, alliance.serial); await measureTransfer();
  const relationText = await page.locator('#space-diplomacy').innerText(); assert.match(relationText, /Vztah\s+50/);
  await detail('space-diplomacy', false); await detail('space-allies'); await shot('paid-resin-escort-1024'); await physicalFollow();
  check('Forty actual credits buy a separate resin escort; native movement is speed-bounded, the battery ledger balances, and positive local transfer adds exactly the energy lost by the escort beside the player’s own solar');
  phase = 'paid title and colony'; await detail('space-allies', false); const title = await purchase('territory', 120); assert.equal(economy(await read()).balance, 101);
  const ownedText = await page.locator('#space-diplomacy').innerText(); assert.match(ownedText, /Tvoje soustava/); assert.match(ownedText, /Vztah\s+50/);
  const newMarket = await market(1, 'moon-salt'); assert.equal(newMarket.price, oldMarket.price); assert.match(newMarket.text, /Tvoje soustava · diplomatické vyslanectví/);
  await detail('space-diplomacy', false); await detail('space-economy');
  await until('Genuine stable first band for a paid colony', s => activeWorld(s).biosphere.stableFor[0] >= 10);
  const found = await economyAction('found'); assert.equal(found.paid, 40); assert.equal(economy(await read()).balance, 61);
  const colony = economy(await read()).colonies.find(row => row.planetId === resinId); assert.ok(colony); assert.equal(colony.level, 1);
  assert.deepEqual(colony.permission, {titleSerial: title.serial, foundingSerial: found.serial}); assert.ok(title.serial < found.serial);
  assert.equal(economy(await read()).ledger.construction, original.space.economy.ledger.construction + 40);
  await checkpoint('paid-territory-colony'); await detail('space-diplomacy'); await shot('owned-resin-colony-1024', '.space-expansion'); await detail('space-diplomacy', false);
  check('The original sovereign colony offer is blocked; a distinct120-credit title precedes a40-credit colony with permanent purchase/founding serials, while the embassy, treaty and resin12-unit price survive');
  phase = 'native colony production and scene disposal';
  const raf = await frames(), measured = await read(); performanceSample = {frames: stats(raf), render: measured.render, camera: measured.spaceCamera, world: summary(activeWorld(measured)), expansion: expansion(measured), colony: economy(measured).colonies.find(row => row.planetId === resinId)};
  await sceneCycles(); await until('Eight genuinely produced units from the acquired territory', s => {const c = economy(s).colonies.find(row => row.planetId === resinId); return c.produced - c.loaded === 8;});
  const produced = economy(await read()).colonies.find(row => row.planetId === resinId); assert.ok(produced.productiveElapsed >= 80 - 1e-6); assert.equal(produced.produced, 8);
  const loaded = await economyAction('load'); assert.equal(loaded.amount, 8); assert.equal(cargoCount(await read()), 8); assert.equal(loaded.product, colony.product);
  await shot('acquired-territory-production-1024', '.space-product-cargo');
  observations.push({kind: 'actual-acquired-colony-production', colony: produced, loaded});
  phase = 'joint laden jump persistence'; await ascend(); const homeMarket = await market(0, colony.product); await jump(0, {checkpoint: 'allied-laden-flight'}); await surface();
  assert.equal(escort(await read()).location.planetId, original.space.homePlanetId);
  const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenHome = null;
  await page.locator('.space-heading h2').click(); await page.keyboard.press('v'); await until('Actual home docking with escort', s => s.space.location === null);
  phase = 'parked ally stasis and actual sale'; const parked = await read(); assert.equal(escort(parked).location, null);
  const parkedAfter = await until('Sixty genuine domestic ticks while escort waits', s => s.tick - parked.tick >= 60, 30000);
  assert.equal(parkedAfter.space.elapsed, parked.space.elapsed); assert.deepEqual(expansion(parkedAfter), expansion(parked));
  observations.push({kind: 'parked-escort-stasis', ticks: parkedAfter.tick - parked.tick, spaceElapsed: parkedAfter.space.elapsed, ally: escort(parkedAfter)});
  await detail('space-dock'); await detail('space-allies'); assert.match(await page.locator('#space-allies').innerText(), /Zaparkovaný v domácí dílně/);
  await detail('space-economy'); const saleText = await page.locator('.space-product-cargo').innerText(); assert.ok(saleText.includes(`${homeMarket.price} ◈/ks`), saleText);
  const sold = await economyAction('sell', resinId); assert.equal(sold.amount, 8); assert.equal(sold.unitPrice, homeMarket.price); assert.equal(sold.earned, 8 * homeMarket.price);
  assert.equal(sold.priceBasis.version, 1); assert.equal(sold.priceBasis.base + sold.priceBasis.bonus, sold.unitPrice);
  const final = await exported('active-campaign.save.json'), finalState = await read(); intact(finalState);
  assert.equal(cargoCount(finalState), 0); assert.equal(economy(finalState).balance, 61 + sold.earned); assert.equal(hash(await readFile(source)), sourceHash);
  check('Eight new units cross a real shared six-second leg, whose paid cargo/title/equipment/ally survive public save-import-rekey; actual home sale funds further travel and the parked escort remains frozen during normal domestic time');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, assets, activation, departure, transactions, observations, rekeys, legs, lifecycle, performance: performanceSample, images,
    account: economy(finalState), expansion: expansion(finalState), outfit: outfit(finalState), worlds: expedition(finalState).worlds.map(summary), homeFacts: {fullHomeSha256: hash(JSON.stringify(home)), departure}, activeCampaign: {path: path.join(out, 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Actual completed D2a continued by public UI/native RAF. No state writes, debug time, injected funds or production helper imports. One actual paid ally, native follow/energy transfer, paid sovereign title and permitted colony, real production/export and shared-flight persistence, unchanged prior accounts and equipment, inactive biology and domestic freeze. Does not prove all ally profiles, war, whole D or human playtest/listening acceptance.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Keep read-only diagnostics if public export itself cannot complete. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, source: {path: source, sha256: sourceHash}, checks, errors, assets, activation, departure, images, legs, transactions, observations, rekeys, lifecycle, performance: performanceSample,
    homeFacts: {fullHomeSha256: home && hash(JSON.stringify(home)), departure, publicSnapshot: frozenHome, frozenWorlds: [...frozenWorlds].map(([id, world]) => ({id, sha256: hash(JSON.stringify(world))}))}, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
