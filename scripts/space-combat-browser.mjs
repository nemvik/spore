/** D3a genuine victory, retreat, wreck/rescue and paid repairs.
 * Public UI/import/export and native RAF only; no live setters, artificial time
 * or production helper imports. Requires an explicitly approved final asset. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-014d3a/browser');
const source = path.resolve('evidence/sp-013d2b/browser/active-campaign.save.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, '94f06db656b31db2de2fb720668dcfb725b0d25899da87fcd52338bb7d8faa3c');
assert.equal(original.space.combat, undefined); assert.equal(original.space.location, null); assert.equal(original.space.ship.health, 115);
assert.equal(original.space.economy.balance, 117); assert.equal(original.space.expansion.allies.length, 1); assert.equal(original.space.outfit.purchases.length, 3);
assert.equal(new URL(base).searchParams.has('test'), false); assert.ok(process.env.LUMAVORA_ASSET, 'Pass the approved final D3a asset; never run against an older build');
await mkdir(out, {recursive: true}); const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native space combat: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transactions = [], rekeys = [], lifecycle = [], observations = [], shots = [];
const frozenWorlds = new Map(), resinId = original.space.empires.entries.find(row => row.id === 'resin').capitalId;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null, departure = null, previous = null;
page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(String(error))); page.on('console', message => {if (message.type() === 'error') errors.push(message.text());}); page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = s => s.space.expedition, economy = s => s.space.economy, outfit = s => s.space.outfit, expansion = s => s.space.expansion, combat = s => s.space.combat;
const battle = s => combat(s).battles.at(-1), ally = s => expansion(s).allies[0];
const activeWorld = s => expedition(s).worlds.find(w => w.id === s.space.location?.planetId);
const cargoCount = s => economy(s).cargo.reduce((n, c) => n + c.amount, 0) + expedition(s).cargo.length;
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = s => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(s, key)).map(key => [key, s[key]]));
function homeExport(s) {const v = structuredClone(s); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
function beforeActivation(text) {const cp = JSON.parse(text); delete cp.id; delete cp.space.combat; return cp;}
const summary = w => ({id: w.id, elapsed: w.elapsed, population: w.life.length, climate: [w.temperature, w.atmosphere]});
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const zeroArchive = {battles: 0, victories: 0, retreats: 0, defeats: 0, shots: 0, received: 0, damage: 0, restored: 0, endedAt: 0};
function intact(s) {
  assert.equal(s.deathReason, null); assert.ok(s.player.health > 0); assert.deepEqual(errors, []);
  for (const key of ['creation', 'purchase', 'id']) assert.deepEqual(s.space.ship[key], original.space.ship[key]);
  assert.deepEqual(s.space.empires, original.space.empires); assert.deepEqual(outfit(s), original.space.outfit);
  assert.deepEqual(expansion(s).actions, original.space.expansion.actions); assert.deepEqual(expansion(s).activated, original.space.expansion.activated);
  for (const key of ['id', 'empireId', 'paidSerial']) assert.equal(ally(s)[key], original.space.expansion.allies[0][key]);
  assert.ok(Math.abs(ally(s).energy - (12 + ally(s).generated - ally(s).delivered)) < 1e-7);
  const e = economy(s), l = e.ledger, c = combat(s); assert.equal(e.version, 4); assert.equal(c.version, 1); assert.deepEqual(c.archive, zeroArchive); assert.equal(c.legacyRescue, null);
  assert.equal(e.balance, l.deposits + l.revenue - l.construction - l.upgrades - l.repairs - l.charging - l.equipment - l.alliance - l.territory);
  for (const key of ['deposits', 'construction', 'upgrades', 'charging', 'revenue', 'equipment', 'alliance', 'territory', 'energyRestored']) assert.equal(l[key], original.space.economy.ledger[key]);
  assert.deepEqual(e.actions.slice(0, original.space.economy.actions.length), original.space.economy.actions);
  const repairs = e.actions.slice(original.space.economy.actions.length); assert.ok(repairs.every(row => row.kind === 'repair'));
  assert.equal(l.repairs, original.space.economy.ledger.repairs + repairs.length * 5);
  assert.equal(l.healthRestored, original.space.economy.ledger.healthRestored + repairs.reduce((n, row) => n + row.after - row.before, 0));
  assert.equal(e.balance, 117 - repairs.length * 5); assert.equal(e.pricingActivatedAction, 15); assert.equal(cargoCount(s), 0);
  assert.equal(e.colonies.length, 3); for (const old of original.space.economy.colonies) {const now = e.colonies.find(v => v.id === old.id); for (const key of ['id', 'planetId', 'product', 'paid', 'level', 'upgraded', 'foundedAt', 'permission', 'loaded']) assert.deepEqual(now[key], old[key]);}
  const damage = c.battles.reduce((n, b) => n + b.damage, 0), restored = c.battles.filter(b => b.rescue?.completedAt != null).length * 25;
  assert.equal(s.space.ship.health, 115 + l.healthRestored - original.space.economy.ledger.healthRestored - damage + restored);
  for (const b of c.battles) {assert.equal(b.enemy.health, Math.max(0, 60 - b.shots * 12)); if (b.lastShot) assert.ok(distance3(b.lastShot.from, b.lastShot.to) <= 24 + 1e-7);}
  if (previous) {
    const dt = s.space.elapsed - previous.elapsed; assert.ok(dt >= -1e-8);
    assert.ok(ally(s).generated >= previous.ally.generated - 1e-8 && ally(s).generated - previous.ally.generated <= .8 * dt + 1e-7);
    assert.ok(ally(s).delivered >= previous.ally.delivered - 1e-8 && ally(s).delivered - previous.ally.delivered <= 2 * dt + 1e-7);
    const current = battle(s), old = previous.battle;
    if (current && old?.serial === current.serial) {
      assert.ok(current.shots >= old.shots && current.received >= old.received && current.damage >= old.damage);
      if (!old.end) assert.ok(distance3(current.enemy.pos, old.enemy.pos) <= 8 * dt + 1e-7, 'Enemy exceeded its physical speed');
      if (current.shots > old.shots && old.lastShot) assert.ok(current.lastShot.at - old.lastShot.at >= .65 - 1e-7);
      if (current.received > old.received && old.lastHit) assert.ok(current.lastHit.at - old.lastHit.at >= 1.8 - 1e-7);
      if (old.end) assert.deepEqual(current.end, old.end);
    }
  }
  previous = {elapsed: s.space.elapsed, ally: structuredClone(ally(s)), battle: structuredClone(battle(s))};
  for (const [id, snapshot] of frozenWorlds) assert.deepEqual(expedition(s).worlds.find(w => w.id === id), snapshot, `Inactive biology advanced: ${id}`);
  if (frozenHome) assert.deepEqual(homePublic(s), frozenHome, 'Domestic state changed during combat expedition');
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
async function shot(name, selector = '#space-combat') {
  assert.ok(images.length < 4); await frames(6); if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
  const state = await read(); observations.push({kind: 'combat-screenshot', file, location: state.space.location, camera: state.spaceCamera, health: state.space.ship.health, battle: battle(state)});
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
  const during = await until(`Start ${target}`, s => !!s.space.leg); const transition = structuredClone(during.space); assert.equal(during.space.leg.to.scale, target); assert.equal(during.space.leg.duration, 3); assert.equal(expedition(during).biosphere.tool, 'off');
  const after = await until(`Arrive ${target}`, s => {if (s.space.leg) {assert.equal(s.space.ship.health, transition.ship.health); assert.equal(s.space.ship.energy, transition.ship.energy); assert.deepEqual(s.space.expansion, transition.expansion);} return !s.space.leg && s.space.location.scale === target;}); assert.ok(after.space.elapsed - before.space.elapsed >= 3);
  if (before.space.location.scale === 'surface' && activeWorld(after)) frozenWorlds.set(after.space.location.planetId, structuredClone(activeWorld(after)));
  legs.push({from: before.space.location, to: after.space.location, duration: 3, paid: during.space.leg.energyPaid, healthDuring: transition.ship.health, healthAfter: after.space.ship.health, combatDuring: transition.combat.battles.at(-1)?.end ?? null}); return after;
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
async function jump(index) {
  const row = await mapRow(index), text = await row.innerText(), mapText = await page.locator('#space-star-map').innerText();
  const quote = (await row.locator('p').first().innerText()).match(/^(\d+(?:\.\d+)?) · (\d+) energie/); assert.ok(quote, text);
  const distance = Number(quote[1]), price = Number(quote[2]); assert.match(mapText, /Dosah lodi 32/);
  const button = row.locator('button'), action = await button.getAttribute('data-action'); assert.ok(action.startsWith('space-jump:'));
  await until('Solar energy for published jump price', s => s.space.ship.energy >= price);
  assert.equal(await button.isDisabled(), false, await row.innerText());
  const before = await read(); await button.click(); const during = await until('Interstellar leg', s => !!s.space.leg);
  assert.equal(during.space.leg.duration, 6); assert.equal(during.space.leg.energyPaid, price); const target = during.space.leg.to.systemId;
  assert.equal(target, action.slice('space-jump:'.length)); await detail('space-star-map', false);
  const after = await until('Interstellar arrival', s => !s.space.leg && s.space.location.systemId === target); assert.ok(after.space.elapsed - before.space.elapsed >= 6);
  const flight = {from: before.space.location, to: after.space.location, duration: 6, paid: price, publicDistance: distance, publicQuote: text, cargo: economy(before).cargo, installed: outfit(before).purchases.map(p => p.equipment)};
  legs.push(flight); observations.push({kind: 'physical-jump', ...flight}); return after;
}
async function economyAction(kind, origin) {
  await detail('space-economy'); const before = await read(), revision = economy(before).nextAction;
  const action = `space-economy:${kind}|${revision}${origin ? `|${origin}` : ''}`, button = page.locator(`button[data-action="${action}"]:visible`).first();
  assert.equal(await button.isDisabled(), false, `${kind}: ${await button.getAttribute('title')}`); const quote = await button.getAttribute('title'); await button.click();
  const after = await until(`${kind} receipt`, s => economy(s).nextAction === revision + 1), receipt = economy(after).actions.find(a => a.serial === revision);
  assert.equal(receipt.kind, kind); assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(after).balance);
  transactions.push({quote, receipt}); console.log(kind, JSON.stringify(receipt)); return receipt;
}
async function checkpoint(label, kind) {
  await pause(); const stopped = await read(); await page.waitForTimeout(250); assert.deepEqual((await read()).space, stopped.space);
  await act('save'); const before = await exported(`${label}.save.json`); if (home) assert.deepEqual(homeExport(before.value.state), home);
  await importCampaign(path.join(out, `${label}.save.json`)); await pause(); const after = await exported(), a = before.value.state.space, b = after.value.state.space;
  assert.notEqual(before.value.state.id, after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id, after.value.state.id);
  for (const key of ['outfit', 'empires']) assert.deepEqual(b[key], a[key]);
  assert.deepEqual(b.expansion.actions, a.expansion.actions); assert.deepEqual(b.expedition.cargo, a.expedition.cargo);
  for (const key of ['version', 'pricingActivatedAction', 'balance', 'ledger', 'cargo', 'sales', 'counts', 'actions', 'nextAction', 'activated']) assert.deepEqual(b.economy[key], a.economy[key]);
  assert.deepEqual(b.combat.activated, a.combat.activated); assert.deepEqual(b.combat.archive, a.combat.archive); assert.equal(b.combat.battles.length, a.combat.battles.length);
  for (const old of a.combat.battles) {const current = b.combat.battles.find(row => row.serial === old.serial); for (const key of ['serial', 'kind', 'start', 'economyAt', 'planetId', 'origin', 'startingHealth', 'repaired', 'shots', 'lastShot', 'end', 'rescue']) assert.deepEqual(current[key], old[key]);}
  if (kind === 'wreck' || kind === 'rescue') {
    assert.equal(a.ship.health, 0); assert.equal(b.ship.health, 0); assert.equal(b.ship.energy, a.ship.energy); assert.deepEqual(b.location, a.location); assert.deepEqual(b.expansion, a.expansion);
    assert.deepEqual(b.combat, a.combat); if (kind === 'rescue') {const rescue = b.combat.battles.at(-1).rescue; assert.ok(rescue); assert.equal(rescue.completedAt, null); assert.ok(b.economy.elapsed - rescue.startedAt < 12);}
  }
  if (kind === 'battle') {assert.equal(b.combat.battles.at(-1).shots, 2); assert.equal(b.combat.battles.at(-1).enemy.health, 36); assert.equal(b.combat.battles.at(-1).end, null);}
  if (home) assert.deepEqual(homeExport(after.value.state), home);
  rekeys.push({label, kind, path: path.join(out, `${label}.save.json`), sha256: before.sha256, from: before.value.state.id, to: after.value.state.id,
    spaceElapsed: [a.elapsed, b.elapsed], economyElapsed: [a.economy.elapsed, b.economy.elapsed], shipBefore: {health: a.ship.health, energy: a.ship.energy}, shipAfter: {health: b.ship.health, energy: b.ship.energy}, combatBefore: a.combat, combatAfter: b.combat}); await resume();
}
async function beginBattle() {
  await near({x: 0, z: 0}); await detail('space-combat'); const before = await read(), serial = combat(before).battles.length + 1;
  assert.equal(before.space.location.scale, 'orbit'); assert.equal(before.space.location.planetId, resinId);
  const button = page.locator(`button[data-action="space-pirate:${serial}"]`); assert.equal(await button.isDisabled(), false, await page.locator('#space-combat').innerText());
  await button.click(); const after = await until('Actual pirate encounter', s => battle(s)?.serial === serial);
  assert.equal(battle(after).end, null); assert.equal(battle(after).startingHealth, before.space.ship.health); assert.equal(battle(after).shots, 0);
  observations.push({kind: 'pirate-start', serial, before: {elapsed: before.space.elapsed, ship: before.space.ship, location: before.space.location}, battle: battle(after)}); console.log(`Started real pirate ${serial}`); return after;
}
async function pulse(input = 'button', proveCadence = false) {
  await until('Pulse range, native recharge and real energy', s => {const b = battle(s); return !b.end && s.space.ship.energy >= 3 && distance3(s.space.location.pos, b.enemy.pos) <= 24 && (!b.lastShot || s.space.elapsed - b.lastShot.at >= .65 + 1e-7);}, 30000, 25);
  if (input === 'Space') await page.locator('.space-heading h2').click(); const before = await read(), count = battle(before).shots;
  if (input === 'Space') await page.keyboard.press('Space'); else await act('space-pulse');
  const after = await until('One paid defense pulse', s => battle(s).shots === count + 1, 10000, 20), elapsed = after.space.elapsed - before.space.elapsed;
  assert.equal(battle(after).enemy.health, battle(before).enemy.health - 12); assert.ok(after.space.ship.energy >= before.space.ship.energy - 3 - 1e-7);
  const transferred = ally(after).delivered - ally(before).delivered;
  assert.ok(after.space.ship.energy <= Math.min(105, before.space.ship.energy - 3 + 4.82 * elapsed + transferred) + 1e-6);
  const row = {input, number: count + 1, beforeEnergy: before.space.ship.energy, afterEnergy: after.space.ship.energy, elapsed, transferred, lastShot: battle(after).lastShot, enemyHealth: battle(after).enemy.health}; shots.push(row);
  if (proveCadence) {
    await page.keyboard.press('Space'); const repeated = await read(); intact(repeated);
    const since = repeated.space.elapsed - battle(after).lastShot.at; assert.ok(since < .65, 'Cadence probe was delayed beyond the real recharge window');
    assert.equal(battle(repeated).shots, count + 1); assert.equal(await page.locator('button[data-action="space-pulse"]').isDisabled(), true);
    observations.push({kind: 'real-cadence-rejection', since, shots: battle(repeated).shots, text: await page.locator('#space-combat').innerText()});
  }
  console.log('Actual pulse', JSON.stringify(row)); return after;
}
async function escapeRange() {
  await page.locator('.space-heading h2').click(); const before = await read();
  await hold('d', 'Actual maneuver beyond defensive range', s => distance3(s.space.location.pos, battle(s).enemy.pos) >= 30, 20);
  const after = await read(), text = await page.locator('#space-combat').innerText(); intact(after);
  assert.ok(distance3(after.space.location.pos, battle(after).enemy.pos) > 24); assert.equal(await page.locator('button[data-action="space-pulse"]').isDisabled(), true); assert.match(text, /mimo dosah\s*24/);
  assert.ok(distance3(battle(after).enemy.pos, battle(before).enemy.pos) > 0);
  observations.push({kind: 'actual-range-rejection', elapsed: after.space.elapsed - before.space.elapsed, from: before.space.location, to: after.space.location, enemyBefore: battle(before).enemy.pos, enemyAfter: battle(after).enemy.pos, distance: distance3(after.space.location.pos, battle(after).enemy.pos), text});
}
async function sceneCycles() {
  await near({x: 0, z: 0}); assert.equal((await read()).space.location.scale, 'orbit');
  for (let cycle = 1; cycle <= 4; cycle++) {
    await frames(12); const before = await read(); await scale('v', 'surface'); await frames(12); const surfaceState = await read();
    await hold('q', 'Ordinary ascent during combat rest', s => s.space.location.pos.y >= 21); await scale('r', 'orbit'); await frames(12); const after = await read();
    const row = {cycle, before: resources(before), surface: resources(surfaceState), after: resources(after), retainedGeometry: after.render.geometries - before.render.geometries}; lifecycle.push(row);
    if (cycle > 1) {assert.equal(row.retainedGeometry, 0); assert.equal(row.after.programs, row.before.programs); assert.equal(row.after.textures, row.before.textures);}
  }
}
async function restForNextSignal(label) {
  await near({x: 0, z: 0}); await detail('space-combat'); const start = await read(), end = battle(start).end, next = combat(start).battles.length + 1;
  assert.ok(end); const text = await page.locator('#space-combat').innerText();
  if (start.space.elapsed - end.at < 90 - .1) {assert.equal(await page.locator(`button[data-action="space-pirate:${next}"]`).isDisabled(), true); assert.match(text, /Další signál za/);}
  const after = await until(label, s => s.space.elapsed - end.at >= 90.02, 120000, 100);
  assert.equal(await page.locator(`button[data-action="space-pirate:${next}"]`).isDisabled(), false);
  observations.push({kind: 'actual-ninety-second-rest', outcome: end.outcome, endedAt: end.at, before: start.space.elapsed, availableAt: after.space.elapsed, elapsedSinceResult: after.space.elapsed - end.at, initialText: text});
}
async function blockedWreckInputs() {
  await page.locator('.space-heading h2').click(); const before = await read(); assert.equal(before.space.ship.health, 0);
  await page.keyboard.down('d'); await page.keyboard.down('q');
  try {await until('One actual second of blocked wreck movement', s => s.space.elapsed - before.space.elapsed >= 1, 10000, 30);} finally {await page.keyboard.up('d'); await page.keyboard.up('q');}
  for (const key of ['r', 'v', 'Space']) await page.keyboard.press(key);
  const after = await read(); intact(after); assert.deepEqual(after.space.location, before.space.location); assert.equal(after.space.leg, null); assert.equal(after.space.ship.health, 0); assert.equal(after.space.ship.energy, before.space.ship.energy);
  assert.deepEqual(expansion(after), expansion(before)); assert.deepEqual(combat(after), combat(before)); assert.equal(economy(after).nextAction, economy(before).nextAction);
  observations.push({kind: 'wreck-inputs-blocked', keys: ['d', 'q', 'r', 'v', 'Space'], elapsed: after.space.elapsed - before.space.elapsed, location: after.space.location, energy: after.space.ship.energy, health: 0, bodyHealth: after.player.health, deathReason: after.deathReason});
}
try {
  await importCampaign(source); const activated = await exported('combat-activation.save.json'), s = activated.value.state, c = s.space.combat, e = s.space.economy;
  assert.deepEqual(c.archive, zeroArchive); assert.deepEqual(c.battles, []); assert.equal(c.legacyRescue, null);
  assert.deepEqual(c.activated, {cut: {at: original.space.elapsed, tick: original.tick, travelAction: original.space.nextSerial, lifeAction: original.space.expedition.nextAction, economyAction: original.space.economy.nextAction}, economyAt: original.space.economy.elapsed, health: 115, repaired: original.space.economy.ledger.healthRestored});
  for (const key of ['version', 'balance', 'ledger', 'counts', 'cargo', 'sales', 'actions', 'nextAction', 'activated', 'pricingActivatedAction']) assert.deepEqual(e[key], original.space.economy[key]);
  for (const key of ['ship', 'expedition', 'empires', 'outfit', 'expansion']) assert.deepEqual(s.space[key], original.space[key]);
  const homeElapsed = e.elapsed - original.space.economy.elapsed; assert.ok(homeElapsed >= 0);
  for (const old of original.space.economy.colonies) {
    const now = e.colonies.find(v => v.id === old.id); assert.ok(now.productiveElapsed >= old.productiveElapsed && now.productiveElapsed - old.productiveElapsed <= homeElapsed + 1e-7);
    const cycles = Math.floor((now.productiveElapsed + 1e-8) / 10) - Math.floor((old.productiveElapsed + 1e-8) / 10); assert.ok(now.produced >= old.produced && now.produced - old.produced <= cycles * now.level); assert.ok(now.produced - now.loaded <= now.level * 8);
  }
  assert.deepEqual(beforeActivation(s.checkpoint), beforeActivation(original.checkpoint)); const cp = JSON.parse(s.checkpoint);
  assert.deepEqual(cp.space.combat.battles, []); assert.deepEqual(cp.space.combat.archive, zeroArchive);
  activation = {path: path.join(out, 'combat-activation.save.json'), sha256: activated.sha256, live: c.activated, checkpoint: cp.space.combat.activated};
  for (const world of s.space.expedition.worlds) frozenWorlds.set(world.id, structuredClone(world));
  check('Public D2b import activates empty live/checkpoint combat while preserving actual health, equipment, alliance/title, cargo, biology and every old economic receipt');
  phase = 'native departure and foreign orbit'; await resume(); await detail('space-dock'); await act('space-launch'); await until('Launch', v => v.space.location?.scale === 'surface');
  const departureExport = await exported('departure.save.json'); home = homeExport(departureExport.value.state); frozenHome = homePublic(await read());
  departure = {path: path.join(out, 'departure.save.json'), sha256: departureExport.sha256, fullHomeSha256: hash(JSON.stringify(home))}; await resume();
  await ascend(); await jump(1); await scale('v', 'orbit');
  phase = 'real maneuver and first victory'; await beginBattle(); await escapeRange();
  await until('Enemy physically re-enters pulse range', v => distance3(v.space.location.pos, battle(v).enemy.pos) <= 23, 15000, 30);
  await pulse('Space', true);
  const raf = await frames(), measured = await read(); intact(measured); assert.equal(battle(measured).end, null);
  performanceSample = {frames: stats(raf), render: measured.render, camera: measured.spaceCamera, location: measured.space.location, battle: battle(measured), ship: {health: measured.space.ship.health, energy: measured.space.ship.energy}, ally: ally(measured)};
  await shot('active-pirate-battle-1024'); await pulse('button'); await checkpoint('battle-two-pulses', 'battle');
  while (battle(await read()).shots < 5) await pulse('button');
  const won = await read(); intact(won); assert.equal(battle(won).end.outcome, 'won'); assert.equal(battle(won).shots, 5); assert.equal(battle(won).enemy.health, 0); assert.ok(won.space.ship.health > 0);
  assert.ok(shots.some(row => row.beforeEnergy > row.afterEnergy), 'At least one pulse must visibly spend actual ship energy');
  observations.push({kind: 'native-victory', battle: battle(won), remainingHealth: won.space.ship.health});
  check('The first physical pirate is outrun beyond24, rejected by the range UI, then beaten with five paid pulses; native cadence rejects an immediate second press and a two-shot public rekey preserves the ongoing battle');
  phase = 'ordinary expedition during ninety-second rest'; await sceneCycles(); await restForNextSignal('Ninety genuine space seconds before second signal');
  phase = 'actual paid retreat'; await beginBattle(); await scale('r', 'system');
  const retreated = await read(); assert.equal(battle(retreated).end.outcome, 'retreated'); assert.equal(battle(retreated).shots, 0);
  observations.push({kind: 'native-retreat', battle: battle(retreated), pendingLegProof: legs.at(-1)}); await scale('v', 'orbit');
  await restForNextSignal('Ninety genuine space seconds before third signal');
  check('Four ordinary scene roundtrips remain stable; a separate encounter ends only after an actual paid R retreat, preserves health during the pending leg, and another real90-second rest separates the third encounter');
  phase = 'actual defeat without firing'; await beginBattle();
  const lost = await until('Pirate causes a real zero-health wreck', v => v.space.ship.health === 0, 60000, 100); assert.equal(battle(lost).end.outcome, 'lost'); assert.equal(battle(lost).shots, 0); assert.equal(lost.deathReason, null); assert.ok(lost.player.health > 0);
  observations.push({kind: 'native-defeat', battle: battle(lost), ship: lost.space.ship, bodyHealth: lost.player.health});
  await checkpoint('actual-wreck', 'wreck'); await blockedWreckInputs(); await shot('actual-wreck-1024');
  phase = 'explicit twelve-second rescue'; const beforeRescue = await read(); await act('space-rescue'); await until('Rescue explicitly started', v => !!battle(v).rescue);
  await checkpoint('rescue-in-progress', 'rescue'); const pending = await read(), rescue = battle(pending).rescue; assert.equal(rescue.completedAt, null);
  const stillWreck = await until('Five actual economic rescue seconds', v => economy(v).elapsed - rescue.startedAt >= 5, 15000, 40);
  assert.equal(stillWreck.space.ship.health, 0); assert.equal(stillWreck.space.ship.energy, beforeRescue.space.ship.energy); assert.deepEqual(stillWreck.space.location, beforeRescue.space.location); assert.deepEqual(expansion(stillWreck), expansion(beforeRescue));
  await shot('rescue-countdown-1024');
  const restored = await until('Twelve real economic seconds complete rescue', v => battle(v).rescue.completedAt !== null, 20000, 30), recovery = battle(restored).rescue;
  assert.ok(recovery.completedAt - recovery.startedAt >= 12 - 1e-7); assert.equal(restored.space.ship.health, 25); assert.deepEqual(restored.space.location, beforeRescue.space.location);
  const afterCompletion = Math.max(0, economy(restored).elapsed - recovery.completedAt), transferred = ally(restored).delivered - ally(beforeRescue).delivered;
  assert.ok(restored.space.ship.energy >= beforeRescue.space.ship.energy - 1e-7); assert.ok(restored.space.ship.energy <= Math.min(105, beforeRescue.space.ship.energy + 4.82 * afterCompletion + transferred) + 1e-6);
  observations.push({kind: 'native-rescue', rescue: recovery, shipEnergyBefore: beforeRescue.space.ship.energy, shipEnergyAfter: restored.space.ship.energy, afterCompletion, transferred, health: restored.space.ship.health, location: restored.space.location, balance: economy(restored).balance});
  check('A real no-fire defeat produces a persistable immobile wreck without body death; explicit rescue survives public rekey, stays a wreck before12 economic seconds, then restores25 health at the same location without an energy gift');
  phase = 'paid colony repairs'; await near({x: 0, z: 0}); await scale('v', 'surface'); await hold('c', 'Actual colony service altitude', v => v.space.location.pos.y <= 2.8);
  await detail('space-economy'); const repaired = [];
  for (const [beforeHealth, afterHealth] of [[25, 65], [65, 105], [105, 115]]) {
    assert.equal((await read()).space.ship.health, beforeHealth); const receipt = await economyAction('repair'); assert.equal(receipt.paid, 5); assert.equal(receipt.before, beforeHealth); assert.equal(receipt.after, afterHealth); repaired.push(receipt);
  }
  assert.equal(economy(await read()).balance, 102); assert.deepEqual(repaired.map(row => row.serial), [29, 30, 31]);
  await hold('q', 'Repaired ship overview', v => v.space.location.pos.y >= 6.5, 20); await shot('paid-colony-repairs-1024', '.space-service'); await hold('c', 'Descent after repair overview', v => v.space.location.pos.y <= 2.8);
  phase = 'physical return home'; await ascend(); await jump(0); await surface(); const beforeReturn = await exported(); assert.deepEqual(homeExport(beforeReturn.value.state), home); await resume(); frozenHome = null;
  await page.locator('.space-heading h2').click(); await page.keyboard.press('v'); await until('Actual home dock', v => v.space.location === null);
  const final = await exported('active-campaign.save.json'), finalState = await read(); intact(finalState); assert.equal(finalState.space.ship.health, 115); assert.equal(economy(finalState).balance, 102);
  assert.deepEqual(combat(finalState).battles.map(row => row.end.outcome), ['won', 'retreated', 'lost']); assert.equal(hash(await readFile(source)), sourceHash);
  check('The original paid ship reaches its owned capital colony and pays5+5+5 for25→65→105→115; all D1/D2 receipts survive, account117→102, and the domestic snapshot remains exact until physical docking');
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, source: {path: source, sha256: sourceHash}, assets, activation, departure, shots, transactions, observations, rekeys, legs, lifecycle, performance: performanceSample, images,
    combat: combat(finalState), account: economy(finalState), expansion: expansion(finalState), outfit: outfit(finalState), ship: {health: finalState.space.ship.health, energy: finalState.space.ship.energy}, worlds: expedition(finalState).worlds.map(summary), homeFacts: {fullHomeSha256: hash(JSON.stringify(home)), departure}, activeCampaign: {path: path.join(out, 'active-campaign.save.json'), sha256: final.sha256}, disk: {before: diskBefore, after: await disk()},
    provenance: 'The exact genuinely played D2b campaign continues through ordinary public UI and native RAF. No state setters, debug clocks, funds grants, production helper imports or edited payloads. One won/retreated/lost pirate sequence, actual90-second intervals, mid-battle/wreck/rescue public rekeys, explicit12-second recovery and real colony repairs. Does not claim wars, automatic raids/crises, all ofD, a full new-lineage campaign or human/audio acceptance. The peaceful no-fire defeat naturally fills the energy reserve; the native no-gift observation does not replace a partial-energy wreck unit regression.'}, null, 2));
} catch (error) {
  let recovery = null; try {recovery = (await exported('failure-campaign.save.json')).sha256;} catch { /* Public export failure still leaves read-only diagnostics. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, source: {path: source, sha256: sourceHash}, checks, errors, assets, activation, departure, shots, images, legs, transactions, observations, rekeys, lifecycle, performance: performanceSample,
    homeFacts: {fullHomeSha256: home && hash(JSON.stringify(home)), departure, publicSnapshot: frozenHome, frozenWorlds: [...frozenWorlds].map(([id, w]) => ({id, sha256: hash(JSON.stringify(w))}))}, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
