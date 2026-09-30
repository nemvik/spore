/** C3b native colony trade continuation. Public UI and read-only diagnostics only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-013c/browser');
const source = path.resolve('evidence/sp-012a2/continuation/active-campaign.save.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, '5745841b9804cf2e6871e096e8df215cab66fc6ba8ac34ebaa7866fb1006c175');
assert.equal(original.space.economy, undefined); assert.equal(original.space.location, null); assert.equal(original.space.expedition.cargo.length, 0);
assert.ok(original.machines.resource >= 60); assert.equal(new URL(base).searchParams.has('test'), false);
await mkdir(out, {recursive: true});
const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native colony trade: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transactions = [], biologicalActions = [], rekeys = [], prices = [], lifecycle = [], observations = [];
const frozenWorlds = new Map(), heldCargo = new Map();
const roles = ['culture:7', 'culture:8', 'culture:6', 'species:bell', 'species:gnaw', 'species:crest'];
const productNames = {'sun-resin': 'Sluneční pryskyřice', 'moon-salt': 'Měsíční sůl', 'spore-silk': 'Výtrusové vlákno'};
const hotId = original.space.expedition.worlds.find(w => w.id.includes(':star-2:')).id;
const coldId = original.space.expedition.worlds.find(w => w.id.includes(':star-3:')).id;
const originId = original.space.expedition.worlds.find(w => w.id.includes(':star-1:')).id;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null;
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = state => state.space.expedition;
const economy = state => state.space.economy;
const activeWorld = state => expedition(state).worlds.find(world => world.id === state.space.location?.planetId);
const colony = (state, id = state.space.location.planetId) => economy(state).colonies.find(c => c.planetId === id);
const stock = c => c.produced - c.loaded;
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
function homeExport(state) {const v = structuredClone(state); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function oldCheckpoint(text) {const cp = JSON.parse(text); delete cp.id; delete cp.space.economy; return cp;}
const capacity = world => {let n = 0; for (const time of world.biosphere.stableFor) {if (time < 10 - 1e-8) break; n++;} return n;};
const summary = world => ({id: world.id, elapsed: world.elapsed, population: world.life.length, capacity: capacity(world), climate: [world.temperature, world.atmosphere]});
function intact(state) {
  assert.equal(state.deathReason, null); assert.deepEqual(errors, []);
  assert.deepEqual(state.space.ship.creation, original.space.ship.creation); assert.deepEqual(state.space.ship.purchase, original.space.ship.purchase);
  const e = expedition(state), account = economy(state); assert.equal(e.biosphere.version, 2); assert.equal(account.version, 1);
  const l = account.ledger; assert.equal(account.balance, l.deposits + l.revenue - l.construction - l.upgrades - l.repairs - l.charging);
  const goods = account.cargo.reduce((sum, item) => sum + item.amount, 0); assert.ok(goods + e.cargo.length <= 8);
  for (const c of account.colonies) {assert.ok(stock(c) >= 0 && stock(c) <= 24); assert.equal(c.loaded, account.cargo.filter(x => x.planetId === c.planetId).reduce((n, x) => n + x.amount, 0) + account.sales.filter(x => x.planetId === c.planetId).reduce((n, x) => n + x.amount, 0));}
  const all = [...e.cargo, ...e.worlds.flatMap(w => w.life)]; assert.equal(new Set(all.map(l => l.id)).size, all.length);
  for (const origin of e.biosphere.origins) for (let r = 0; r < roles.length; r++) assert.equal(all.filter(l => l.originPlanetId === origin.planetId && l.taxonKey === roles[r]).length, 6 + origin.births[r] - origin.deaths[r]);
  for (const life of e.cargo) {if (heldCargo.has(life.id)) assert.deepEqual(life, heldCargo.get(life.id), 'Carried physiology advanced'); else heldCargo.set(life.id, structuredClone(life));}
  for (const id of heldCargo.keys()) if (!e.cargo.some(l => l.id === id)) heldCargo.delete(id);
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(e.worlds.find(w => w.id === id), snapshot, `Inactive biology advanced: ${id}`);
  for (const old of original.space.expedition.worlds) assert.deepEqual(e.worlds.find(w => w.id === old.id).designs, old.designs);
  if (frozenHome) assert.deepEqual(homePublic(state), frozenHome, 'Domestic state advanced during space trade');
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
async function shot(name, selector = '#space-economy > summary') {assert.ok(images.length < 4); if (selector) await page.locator(selector).scrollIntoViewIfNeeded(); const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);}
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
async function lifeAction(kind, id, band) {
  const before = await read(), serial = expedition(before).nextAction;
  const button = page.locator(`button[data-action="space-${kind}:${id}"]:visible`).first();
  await until('Biological transfer energy', s => s.space.ship.energy >= (kind === 'scan' ? 1 : 2));
  assert.equal(await button.isDisabled(), false, await page.locator('#space-biology').innerText()); await button.click();
  const after = await until(`${kind} biological receipt`, s => expedition(s).actions.some(a => a.serial >= serial && a.kind === kind && a.lifeId === id));
  const receipt = expedition(after).actions.find(a => a.serial >= serial && a.kind === kind && a.lifeId === id);
  assert.equal(receipt.energyPaid, kind === 'scan' ? 1 : 2); if (band) assert.equal(receipt.band, band); biologicalActions.push(receipt); return after;
}
async function marketRows(product) {
  await detail('space-star-map'); const rows = [];
  for (const item of await page.locator('.space-star-list > section').all()) {
    const title = await item.locator('b').innerText(), text = await item.innerText();
    if (!title.startsWith('⌂ ·') && !title.startsWith('1 ·')) continue;
    const match = text.match(new RegExp(`${productNames[product]} (\\d+)`)); assert.ok(match, text);
    rows.push({title, text, unitPrice: Number(match[1]), home: title.startsWith('⌂ ·')});
  }
  assert.equal(rows.length, 2); prices.push({product, rows}); return rows;
}
async function checkpoint(label) {
  await pause(); const stopped = await read(); await page.waitForTimeout(350); assert.deepEqual((await read()).space, stopped.space);
  await act('save'); const before = await exported(`${label}.save.json`); assert.deepEqual(homeExport(before.value.state), home);
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported();
  assert.notEqual(before.value.state.id, after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  const a = before.value.state.space.economy, b = after.value.state.space.economy;
  for (const key of ['balance', 'ledger', 'cargo', 'sales', 'counts', 'actions', 'nextAction', 'activated']) assert.deepEqual(b[key], a[key]);
  assert.deepEqual(after.value.state.space.expedition.cargo, before.value.state.space.expedition.cargo);
  assert.deepEqual(homeExport(after.value.state), home); assert.ok(b.elapsed >= a.elapsed);
  for (const c of a.colonies) {const other = b.colonies.find(v => v.id === c.id); for (const key of ['planetId', 'product', 'paid', 'level', 'upgraded', 'loaded', 'foundedAt']) assert.equal(other[key], c[key]); assert.ok(other.produced >= c.produced);}
  rekeys.push({label, file: path.join(out, `${label}.save.json`), sha256: before.sha256, from: before.value.state.id, to: after.value.state.id, balance: a.balance, cargo: a.cargo, colonies: a.colonies}); await resume();
}
async function waitStock(id, amount = 8) {return until(`Colony production to ${amount}`, s => stock(colony(s, id)) >= amount, 180000, 250);}
async function chargePaid() {
  await detail('space-economy'); let button = page.locator('button[data-action^="space-economy:charge|"]:visible'); await button.scrollIntoViewIfNeeded();
  if (await button.isDisabled()) {
    // Genuine ordinary flight burns energy; no artificial health/energy assignment.
    await page.keyboard.down('Shift'); try {for (let lap = 0; lap < 3; lap++) {await near({x: 8, z: 0}); await near({x: -8, z: 0}); await near({x: 0, z: 0});}} finally {await page.keyboard.up('Shift');}
  }
  const receipt = await economyAction('charge'); assert.equal(receipt.paid, 3); assert.ok(receipt.after > receipt.before && receipt.after - receipt.before <= 60 + 1e-8); assert.ok(receipt.after <= 105);
}
async function productionLossAndRestore() {
  phase = 'physical ecological loss and repair'; assert.equal(economy(await read()).cargo.length, 0); await waitStock(hotId); await detail('space-biology');
  const predators = activeWorld(await read()).life.filter(l => l.habitat.band === 1 && l.taxonKey === 'species:crest'); assert.ok(predators.length > 0 && predators.length <= 3);
  for (const life of predators) {await page.locator('#space-specimen').selectOption(life.id); await near(life.pos); if (!expedition(await read()).scans.some(row => row.lifeId === life.id)) await lifeAction('scan', life.id); await lifeAction('collect', life.id, 1);}
  let state = await read(); assert.equal(capacity(activeWorld(state)), 0); assert.equal(expedition(state).cargo.length, predators.length);
  const stopped = structuredClone(colony(state)), beforeElapsed = economy(state).elapsed;
  const later = await until('Ten active seconds of paused colony production', s => economy(s).elapsed - beforeElapsed >= 10, 60000, 250);
  assert.equal(colony(later).productiveElapsed, stopped.productiveElapsed); assert.equal(colony(later).produced, stopped.produced); assert.equal(stock(colony(later)), stock(stopped)); assert.equal(colony(later).id, stopped.id);
  await detail('space-economy'); const text = await page.locator('#space-economy').innerText(); assert.match(text, /Výroba čeká na obnovu prvního stabilního pásu/);
  await near({x: 0, z: 0}); await shot('colony-production-halted-1024', '#space-economy > summary');
  await detail('space-biology'); await page.locator('#space-habitat-band').selectOption('1');
  for (const life of predators) {await lifeAction('release', life.id, 1); const physical = activeWorld(await read()).life.find(l => l.id === life.id); assert.equal(physical.originPlanetId, life.originPlanetId); assert.equal(physical.taxonKey, life.taxonKey); assert.deepEqual(physical.habitat.birth, life.habitat.birth);}
  state = await until('Restored actual predation and stability', s => capacity(activeWorld(s)) >= 1, 120000, 250);
  assert.equal(expedition(state).cargo.length, 0); assert.equal(colony(state).id, stopped.id); assert.equal(colony(state).paid, stopped.paid); assert.equal(colony(state).loaded, stopped.loaded);
  const restored = structuredClone(colony(state));
  // Preserved storage is full: ordinary loading must free capacity before a
  // new produced unit can demonstrate restored output.
  await near({x: 0, z: 0}); const preservedLoad = await economyAction('load'); assert.equal(preservedLoad.amount, 8);
  state = await until('Actual new unit after unloading preserved stock', s => colony(s).produced > stopped.produced, 60000, 250);
  observations.push({kind: 'ecological-production-loss-and-restoration', predators: predators.map(l => l.id), stopped, restored, preservedLoad, resumed: structuredClone(colony(state)), pausedSeconds: economy(later).elapsed - beforeElapsed, text});
  check('Actual paid predator removal halts colony production without deleting stock or the paid colony; returning the same animals and loading preserved stock restores a real new production cycle');
  await travel(1); const secondSale = await economyAction('sell', hotId); assert.equal(secondSale.amount, 8); assert.ok(secondSale.earned > 0);
  await travel(2);
}
try {
  await importCampaign(source); const activated = await exported('economy-activation.save.json'), value = activated.value.state, e = value.space.economy;
  assert.equal(e.balance, 0); assert.deepEqual(e.colonies, []); assert.deepEqual(e.cargo, []); assert.equal(e.nextAction, 1); assert.ok(Object.values(e.ledger).every(n => n === 0));
  assert.deepEqual(e.activated, {spaceAt: original.space.elapsed, planetAt: original.planet.elapsed, tick: original.tick});
  assert.deepEqual(value.space.expedition, original.space.expedition); assert.deepEqual(value.space.ship, original.space.ship);
  assert.deepEqual(oldCheckpoint(value.checkpoint), oldCheckpoint(original.checkpoint)); assert.equal(JSON.parse(value.checkpoint).space.economy.version, 1);
  activation = {live: e.activated, checkpoint: JSON.parse(value.checkpoint).space.economy.activated, file: path.join(out, 'economy-activation.save.json'), sha256: activated.sha256};
  for (const w of value.space.expedition.worlds) frozenWorlds.set(w.id, structuredClone(w)); await resume(); await detail('space-dock'); await detail('space-economy');
  phase = 'real domestic funding';
  for (let i = 0; i < 3; i++) {const receipt = await economyAction('deposit'); assert.equal(receipt.paid, 20); assert.ok(Math.abs(receipt.homeBefore - receipt.homeAfter - 20) < 1e-8);}
  assert.equal(economy(await read()).balance, 60); assert.equal(economy(await read()).ledger.deposits, 60);
  check('Public A2 activation adds an empty live/checkpoint account without altering existing life/models; three real20 deposits move60 from the domestic treasury with no grant');
  await act('space-launch'); await until('Launch', s => s.space.location?.scale === 'surface'); home = homeExport((await exported()).value.state); frozenHome = homePublic(await read()); await resume();
  phase = 'first paid colony'; await ascend(); await jump(1); await jump(2); await surface(); await until('Stable first band', s => capacity(activeWorld(s)) >= 1);
  const found = await economyAction('found'); assert.equal(found.paid, 40); assert.equal(economy(await read()).balance, 20);
  const first = structuredClone(colony(await read())); assert.equal(first.produced, 0); assert.equal(first.level, 1);
  await waitStock(hotId); await detail('space-economy'); await hold('q', 'Colony overview altitude', s => s.space.location.pos.y >= 6.5); await shot('hot-colony-stock-1024');
  await hold('c', 'Trade altitude after overview', s => s.space.location.pos.y <= 2.8);
  const load = await economyAction('load'); assert.equal(load.amount, 8); assert.equal(economy(await read()).cargo[0].amount, 8);
  const product = economy(await read()).cargo[0].product;
  await detail('space-biology'); await hold('c', 'Biology cargo limit altitude', s => s.space.location.pos.y <= 2.8);
  const target = activeWorld(await read()).life[0]; await page.locator('#space-specimen').selectOption(target.id); await near(target.pos);
  if (!expedition(await read()).scans.some(row => row.lifeId === target.id)) await lifeAction('scan', target.id);
  const collect = page.locator(`button[data-action="space-collect:${target.id}"]`); assert.equal(await collect.isDisabled(), true);
  assert.match(await page.locator('#space-biology').innerText(), /Náklad je plný/); assert.ok(activeWorld(await read()).life.some(l => l.id === target.id));
  check('Paid hot colony manufactures eight real units, loads its bounded stock, and a nearby scanned animal cannot bypass the shared full cargo capacity');
  await ascend(); const publicMarkets = await marketRows(product); const foreignPrice = publicMarkets.find(row => !row.home).unitPrice;
  const sourceRow = page.locator('.space-star-list > section').filter({has: page.locator('b', {hasText: /^1 ·/})}); await sourceRow.scrollIntoViewIfNeeded(); await shot('colony-markets-cargo-1024', null); await detail('space-star-map', false);
  phase = 'first actual market sale'; await jump(1); await surface();
  await checkpoint('carried-production'); await detail('space-economy'); const saleText = await page.locator('.space-product-cargo').innerText(); assert.ok(saleText.includes(`${foreignPrice} ◈/ks`));
  const sale = await economyAction('sell', hotId); assert.equal(sale.amount, 8); assert.equal(sale.unitPrice, foreignPrice); assert.equal(sale.earned, 8 * foreignPrice); assert.equal(economy(await read()).cargo.length, 0);
  observations.push({kind: 'first-market', saleText, publicMarkets, sale});
  const remoteBefore = structuredClone(colony(await read(), hotId)), remoteTime = economy(await read()).elapsed;
  await until('Remote ordinary production clock', s => economy(s).elapsed - remoteTime >= 3);
  const remoteAfter = colony(await read(), hotId); assert.ok(remoteAfter.productiveElapsed > remoteBefore.productiveElapsed); observations.push({kind: 'remote-production-with-biology-stasis', before: remoteBefore, after: structuredClone(remoteAfter)});
  check('Cargo survives public save/import/rekey, sells on the living source for its previously visible price, and remote colony production advances while its biological planet remains frozen');
  phase = 'income-funded service and recovery'; await travel(2); await chargePaid(); await productionLossAndRestore();
  if (economy(await read()).balance >= 65) {const upgrade = await economyAction('upgrade'); assert.equal(upgrade.paid, 20); assert.equal(upgrade.level, 2);}
  await checkpoint('restored-colony');
  phase = 'second income-funded colony'; await travel(3); assert.ok(economy(await read()).balance >= 40); const second = await economyAction('found'); assert.equal(second.paid, 40);
  if (economy(await read()).balance >= 25) {const upgrade = await economyAction('upgrade'); assert.equal(upgrade.paid, 20); assert.equal(upgrade.level, 2);}
  assert.ok(economy(await read()).ledger.construction + economy(await read()).ledger.upgrades + economy(await read()).ledger.charging > 60, 'Actual sale revenue must fund spending beyond all deposits');
  await waitStock(coldId); await detail('space-economy'); await hold('q', 'Second colony overview altitude', s => s.space.location.pos.y >= 6.5); await shot('cold-colony-expanded-1024');
  const raf = await frames(), measured = await read(); performanceSample = {frames: stats(raf), render: measured.render, camera: measured.spaceCamera, colony: colony(measured), biology: summary(activeWorld(measured))};
  await checkpoint('two-colonies');
  phase = 'colony scene lifecycle'; await hold('q', 'Lifecycle ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read(); await hold('q', 'Repeated ascent', s => s.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), colony: colony(surfaceState, coldId), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row); if (cycle > 1) assert.equal(row.retainedGeometry, 0);
  }
  await scale('v', 'surface'); await hold('c', 'Load second harvest', s => s.space.location.pos.y <= 2.8); const secondLoad = await economyAction('load'); assert.equal(secondLoad.amount, 8);
  await ascend(); const homeMarkets = await marketRows(colony(await read(), coldId).product), homePrice = homeMarkets.find(row => row.home).unitPrice; await detail('space-star-map', false);
  phase = 'return and home market'; await jump(2); await jump(1); await jump(0); await surface(); const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenHome = null;
  await page.keyboard.press('v'); await until('Home dock', s => s.space.location === null); await detail('space-dock'); await detail('space-economy');
  const homeSale = await economyAction('sell', coldId); assert.equal(homeSale.amount, 8); assert.equal(homeSale.unitPrice, homePrice); assert.equal(homeSale.earned, 8 * homePrice);
  const homeText = await page.locator('#space-economy').innerText(); const final = await exported('active-campaign.save.json'), state = await read(); intact(state);
  assert.equal(economy(state).colonies.length, 2); assert.equal(economy(state).cargo.length, 0); assert.equal(expedition(state).cargo.length, 0); assert.equal(economy(state).ledger.deposits, 60); assert.equal(hash(await readFile(source)), sourceHash);
  check('Actual revenue pays service, upgrades and the second colony; its physical harvest reaches the home market, both colonies persist and the whole domestic save stayed frozen until docking');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, assets, activation, transactions, biologicalActions, observations, prices, rekeys, legs, lifecycle, performance: performanceSample, images, homeText,
    account: economy(state), worlds: expedition(state).worlds.map(summary), frozenHomeSha256: hash(JSON.stringify(home)), activeCampaign: {path: path.join(out, 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'Actual A2 campaign continued solely through ordinary public UI and native RAF. No state setters, injected funds/life, artificial time or production helper imports. Real deposits, colonies, capped shared cargo, visible market prices, physical sales, paid service, ecological production loss and repair, remote production, persistence and return. Does not claim all SP013, galactic empires/diplomacy, whole milestones C/D, fresh-lineage completion or human playtest/listening acceptance.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Keep read-only failure evidence if public export itself fails. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors, assets, images, legs, transactions, biologicalActions, observations, prices, rekeys, lifecycle, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
