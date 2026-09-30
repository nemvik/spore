/** D3b native military ownership, paid colony, defense, occupation and peace.
 * UI/RAF only: no state setters, injected clocks, edited payloads or production
 * helper imports. --ally is an independent branch, never the canonical result. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const branch = process.argv.includes('--ally'), resumeDefense = process.argv.includes('--resume-defense'), resumeHome = process.argv.includes('--resume-home');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const rootOut = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-014d3b/browser'), out = branch ? path.join(rootOut, 'ally-branch') : rootOut;
const source = path.resolve('evidence/sp-014d3a/browser/active-campaign.save.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, '608b238c20d8e7c50fa51069b9b0b84cffae4ea6be8954b9e937ca767c4e3500');
assert.equal(original.space.wars, undefined); assert.equal(original.space.location, null); assert.equal(original.space.economy.balance, 102);
assert.equal(original.space.combat.version, 1); assert.equal(original.space.combat.battles.length, 3);
assert.ok(process.env.LUMAVORA_ASSET, 'Require the explicitly approved D3b production asset'); assert.equal(new URL(base).searchParams.has('test'), false);
const canonical = path.join(rootOut, 'active-campaign.save.json'), canonicalBefore = branch ? hash(await readFile(canonical)) : null;
await mkdir(out, {recursive: true}); const disk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await disk(); console.log(`Native D3b ${branch ? 'independent ally branch' : 'main campaign'}: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transactions = [], rekeys = [], lifecycle = [], observations = [], shots = [];
const frozenWorlds = new Map(), rootsId = original.space.empires.entries.find(e => e.id === 'roots').capitalId;
let priorEvidence = null;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null, departure = null, previous = null;
page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => {if (m.type() === 'error') errors.push(m.text());}); page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = s => s.space.expedition, economy = s => s.space.economy, outfit = s => s.space.outfit, expansion = s => s.space.expansion, combat = s => s.space.combat, wars = s => s.space.wars;
const battle = s => combat(s).battles.at(-1), ally = s => expansion(s).allies[0], relation = (s, id = 'roots') => wars(s).current.relations.find(r => r.empireId === id);
const colony = s => economy(s).colonies.find(c => c.planetId === rootsId), stock = c => c.produced - c.loaded;
const owner = (s, id) => wars(s).current.territories.find(t => t.planetId === id)?.owner;
const activeWorld = s => expedition(s).worlds.find(w => w.id === s.space.location?.planetId);
const check = text => {checks.push(text); console.log(text);};
const homeKeys = ['stage','tick','seed','player','campaign','world','tribe','machines','planet','homePlanet','lineageHistory','cities','states','military','maritime','commerce','mobilization'];
const homePublic = s => Object.fromEntries(homeKeys.filter(k => Object.hasOwn(s, k)).map(k => [k, s[k]]));
function homeExport(s) {const v = structuredClone(s); delete v.id; delete v.space; if (v.checkpoint) {v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id;} return v;}
const summary = w => ({id: w.id, elapsed: w.elapsed, population: w.life.length, climate: [w.temperature,w.atmosphere]});
const distance3 = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const militaryKeys = ['invasionVictories','invasionRetreats','invasionDefeats','defenseVictories','defenseRetreats','defenseDefeats'];
function preWarShape(s) {const v = structuredClone(s); delete v.id; delete v.space.wars; v.space.economy.version = 4; v.space.combat.version = 1; for (const k of militaryKeys) delete v.space.combat.archive[k]; return v;}
function intact(s) {
  assert.deepEqual(errors, []); assert.equal(s.deathReason, null); assert.ok(s.player.health > 0);
  for (const k of ['id','creation','purchase']) assert.deepEqual(s.space.ship[k], original.space.ship[k]);
  for (const k of ['empires','outfit']) assert.deepEqual(s.space[k], original.space[k]);
  assert.deepEqual(expansion(s).actions, original.space.expansion.actions); assert.deepEqual(expansion(s).activated, original.space.expansion.activated);
  for (const k of ['id','empireId','paidSerial']) assert.equal(ally(s)[k], original.space.expansion.allies[0][k]);
  assert.ok(Math.abs(ally(s).energy - (12 + ally(s).generated - ally(s).delivered)) < 1e-7);
  const e = economy(s), l = e.ledger; assert.equal(e.version, 5); assert.equal(combat(s).version, 2); assert.equal(wars(s).version, 1);
  assert.equal(e.balance,l.deposits+l.revenue-l.construction-l.upgrades-l.repairs-l.charging-l.equipment-l.alliance-l.territory);
  assert.deepEqual(e.actions.slice(0,original.space.economy.actions.length), original.space.economy.actions);
  assert.deepEqual(combat(s).battles.slice(0,3),original.space.combat.battles);
  for (const k of ['deposits','upgrades','equipment','alliance','territory','charging','energyRestored']) assert.equal(l[k],original.space.economy.ledger[k]);
  for (const old of original.space.economy.colonies) {const now=e.colonies.find(c=>c.id===old.id); for(const k of ['id','planetId','product','paid','level','upgraded','foundedAt','permission','loaded']) assert.deepEqual(now[k],old[k]);}
  for (const row of e.actions.filter(r=>r.serial>=original.space.economy.nextAction)) {assert.ok(['found','load','sell','repair'].includes(row.kind)); assert.ok(Number.isInteger(row.warAction));}
  const added = combat(s).battles.slice(3), damage=added.reduce((n,b)=>n+b.damage,0);
  assert.equal(s.space.ship.health,original.space.ship.health + l.healthRestored-original.space.economy.ledger.healthRestored-damage);
  for(const b of added) {assert.equal(b.enemy.health,60-12*b.shots); if(b.lastShot)assert.ok(distance3(b.lastShot.from,b.lastShot.to)<=24+1e-7);}
  for(const r of wars(s).current.relations) if(r.active && r.declaration.escort) {assert.equal(ally(s).location,null); assert.deepEqual({energy:ally(s).energy,generated:ally(s).generated,delivered:ally(s).delivered},r.declaration.escort);}
  if(previous) {const dt=s.space.elapsed-previous.elapsed; assert.ok(dt>=-1e-7); assert.ok(ally(s).generated-previous.generated<=.8*dt+1e-7); assert.ok(ally(s).delivered-previous.delivered<=2*dt+1e-7);}
  previous={elapsed:s.space.elapsed,generated:ally(s).generated,delivered:ally(s).delivered};
  for(const[id,w]of frozenWorlds) assert.deepEqual(expedition(s).worlds.find(v=>v.id===id),w,`Inactive world changed: ${id}`);
  if(frozenHome)assert.deepEqual(homePublic(s),frozenHome,'Home changed before actual docking');
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
  const pending = page.waitForEvent('download').then(download=>({download}),error=>({error})); await act('export'); const event=await pending; if(event.error)throw event.error; const stream = await event.download.createReadStream(); assert.ok(stream);
  const chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks), value = JSON.parse(bytes.toString());
  assert.equal(value.format, 'lumavora'); if (filename) await writeFile(path.join(out, filename), bytes); return {bytes, value, sha256: hash(bytes)};
}
async function importCampaign(file) {
  previous = null; await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(file);
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
async function shot(name, selector = '#space-war') {
  assert.ok(images.length < 4); await frames(6); if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
  const state = await read(); observations.push({kind: 'war-screenshot', file, location: state.space.location, camera: state.spaceCamera, health: state.space.ship.health, battle: battle(state)});
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
  await detail('space-star-map'); for (const row of await page.locator('.space-star-list > section').all()) if ((await row.locator('b').first().innerText()).startsWith(`${index === 0 ? '⌂' : index} ·`)) return row;
  throw new Error(`Missing public map row ${index}`);
}
async function jump(index) {
  const row = await mapRow(index), text = await row.innerText(), mapText = await page.locator('#space-star-map').innerText();
  const quote = text.match(/(?:^|\n)(\d+(?:\.\d+)?) · (\d+) energie/); assert.ok(quote, text);
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
  if(!(await read()).space.location)await detail('space-dock');
  await detail('space-economy'); const before = await read(), revision = economy(before).nextAction;
  const action = `space-economy:${kind}|${revision}${origin ? `|${origin}` : ''}`, button = page.locator(`button[data-action="${action}"]:visible`).first();
  assert.equal(await button.isDisabled(), false, `${kind}: ${await button.getAttribute('title')}`); const quote = await button.getAttribute('title'); await button.click();
  const after = await until(`${kind} receipt`, s => economy(s).nextAction === revision + 1), receipt = economy(after).actions.find(a => a.serial === revision);
  assert.equal(receipt.kind, kind); assert.equal(receipt.balanceBefore, economy(before).balance); assert.equal(receipt.balanceAfter, economy(after).balance);
  transactions.push({quote, receipt}); console.log(kind, JSON.stringify(receipt)); return receipt;
}
async function checkpoint(label, kind = 'political') {
  await pause(); const paused=await read(); await page.waitForTimeout(200); assert.deepEqual((await read()).space,paused.space); await act('save');
  const before=await exported(`${label}.save.json`); if(home)assert.deepEqual(homeExport(before.value.state),home);
  // Isolated context contains only this driver's imports; remove stale UI slots
  // after their exact external exports exist, keeping the current active slot.
  const removed=[], staleActions=await page.locator('button[data-action^="delete:"]:visible').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('data-action')));
  for(const action of staleActions)if(action!==`delete:${before.value.state.id}`){removed.push(action.slice(7));await act(action);}
  if(removed.length)observations.push({kind:'public-stale-import-slot-cleanup',kept:before.value.state.id,removed});
  await importCampaign(path.join(out,`${label}.save.json`)); await pause(); const after=await exported(), a=before.value.state.space,b=after.value.state.space;
  assert.notEqual(before.value.state.id,after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id,after.value.state.id);
  for(const k of ['empires','outfit','wars'])assert.deepEqual(b[k],a[k]); assert.deepEqual(b.expansion.actions,a.expansion.actions); assert.deepEqual(b.expedition.cargo,a.expedition.cargo);
  for(const k of ['version','balance','ledger','counts','actions','nextAction','cargo','sales','pricingActivatedAction'])assert.deepEqual(b.economy[k],a.economy[k]);
  for(const old of a.combat.battles) {const next=b.combat.battles.find(v=>v.serial===old.serial); if(old.end)assert.deepEqual(next,old); else for(const k of ['serial','kind','war','start','economyAt','planetId','origin','shots','lastShot','end'])assert.deepEqual(next[k],old[k]);}
  if(home)assert.deepEqual(homeExport(after.value.state),home);
  rekeys.push({label,kind,path:path.join(out,`${label}.save.json`),sha256:before.sha256,from:before.value.state.id,to:after.value.state.id,
    spaceElapsed:[a.elapsed,b.elapsed],economyElapsed:[a.economy.elapsed,b.economy.elapsed],warAction:a.wars.nextAction,battleSerial:a.combat.battles.at(-1).serial,health:[a.ship.health,b.ship.health]});
  await resume(); return before;
}
async function gotoIndex(index, target='orbit') {
  let s=await read(); if(s.space.location.scale==='surface')await ascend(); else if(s.space.location.scale==='orbit') {await near({x:0,z:0}); await scale('r','system');}
  let current=Number((await read()).space.location.systemId.match(/:star-(\d+)$/)?.[1]??0);
  while(current!==index) {
    const row=await mapRow(index), text=await row.innerText(), q=text.match(/(?:^|\n)(\d+(?:\.\d+)?) · (\d+) energie/);
    assert.ok(q,text); const next=Number(q[1])<=32?index:current+Math.sign(index-current); await jump(next); current=next;
  }
  if(target!=='system')await scale('v','orbit'); if(target==='surface') {await scale('v','surface'); await hold('c','Surface service altitude',v=>v.space.location.pos.y<=2.8);}
}
async function war(kind,id='roots') {
  const panel=page.locator('#space-war'); if(await panel.evaluate(e=>e.tagName==='DETAILS'))await detail('space-war');
  const button=page.locator(`button[data-action^="space-war:${kind}|${id}|"]:visible`).first();
  assert.equal(await button.isDisabled(),false,await panel.innerText()); const before=await read(), action=await button.getAttribute('data-action'); await button.click();
  const after=await until(`Accepted ${kind}`,s=>wars(s).nextAction>wars(before).nextAction);
  const row=wars(after).actions.find(r=>r.serial>=wars(before).nextAction&&r.kind===(kind==='invasion'||kind==='defense'?'engage':kind)&&r.empireId===id); assert.ok(row);
  observations.push({kind:'public-war-order',action,row,location:after.space.location,health:after.space.ship.health}); return after;
}
async function readyForCombat() {await near({x:0,z:0}); await until('Actual 90-space-second battle rest',s=>!battle(s).end||s.space.elapsed>=battle(s).end.at+90.02,150000,100);}
async function pulse() {
  await until('Real pulse range, cadence and energy',s=>!battle(s).end&&s.space.ship.energy>=3&&distance3(s.space.location.pos,battle(s).enemy.pos)<=24&&(!battle(s).lastShot||s.space.elapsed-battle(s).lastShot.at>=.65+1e-7),30000,30);
  const before=await read(), n=battle(before).shots; await act('space-pulse'); const after=await until('One actual paid pulse',s=>battle(s).shots===n+1,10000,20);
  assert.equal(battle(after).enemy.health,battle(before).enemy.health-12);
  const dt=after.space.elapsed-before.space.elapsed, transferred=ally(after).delivered-ally(before).delivered;
  assert.ok(after.space.ship.energy<=Math.min(105,before.space.ship.energy-3+4.82*dt+transferred)+1e-6);
  shots.push({battle:battle(after).serial,shot:n+1,lastShot:battle(after).lastShot,beforeEnergy:before.space.ship.energy,afterEnergy:after.space.ship.energy,dt,transferred}); return after;
}
async function win(kind, saveBattle=false) {
  await readyForCombat(); await war(kind); assert.equal(battle(await read()).kind,kind); await pulse();
  if(resumeDefense&&!performanceSample){const raf=await frames(),s=await read();performanceSample={frames:stats(raf),render:s.render,camera:s.spaceCamera,location:s.space.location,battle:battle(s),ship:{health:s.space.ship.health,energy:s.space.ship.energy},source:'fresh native recapture after recovery; original invasion sample was lost'};await flushProgress();console.log('Fresh native active battle performance',JSON.stringify(performanceSample.frames));}
  if(saveBattle) {
    const raf=await frames(), s=await read(); performanceSample={frames:stats(raf),render:s.render,camera:s.spaceCamera,location:s.space.location,battle:battle(s),ship:{health:s.space.ship.health,energy:s.space.ship.energy},ally:ally(s)};
    await flushProgress(); await shot('actual-empire-guard-1024','#space-combat'); await pulse(); await checkpoint('invasion-two-pulses','battle');
  }
  while(!battle(await read()).end)await pulse(); const s=await read(); assert.equal(battle(s).end.outcome,'won'); assert.equal(battle(s).shots,5); assert.ok(s.space.ship.health>0);
  observations.push({kind:'native-war-victory',battle:battle(s),territories:wars(s).current.territories,raid:wars(s).current.raid}); return s;
}
async function sceneCycles() {
  await near({x:0,z:0});
  for(let cycle=1;cycle<=4;cycle++) {
    await frames(12); const before=await read(); await scale('v','surface'); await frames(12); const below=await read();
    await hold('q','Actual scene-cycle ascent',s=>s.space.location.pos.y>=21); await scale('r','orbit'); await frames(12); const after=await read();
    const row={cycle,before:resources(before),surface:resources(below),after:resources(after),retainedGeometry:after.render.geometries-before.render.geometries}; lifecycle.push(row);
    await flushProgress(); console.log('Native paired scene',JSON.stringify(row)); if(cycle>1){assert.equal(row.retainedGeometry,0);assert.equal(row.after.textures,row.before.textures);assert.equal(row.after.programs,row.before.programs);}
  }
}
async function launch() {
  await detail('space-dock'); await act('space-launch'); await until('Actual launch',s=>s.space.location?.scale==='surface');
  const saved=await exported('departure.save.json'); home=homeExport(saved.value.state); frozenHome=homePublic(await read()); departure={path:path.join(out,'departure.save.json'),sha256:saved.sha256,fullHomeSha256:hash(JSON.stringify(home))}; await resume();
}
async function returnHome() {
  await gotoIndex(0,'surface'); const before=await exported(); assert.deepEqual(homeExport(before.value.state),home); await resume(); frozenHome=null;
  await page.locator('.space-heading h2').click(); await page.keyboard.press('v'); await until('Actual home docking',s=>s.space.location===null);
}
async function activate() {
  await importCampaign(source); const saved=await exported('war-activation.save.json'),s=saved.value.state,p=s.space;
  assert.equal(p.wars.nextAction,1); assert.deepEqual(p.wars.actions,[]); assert.deepEqual(p.wars.current.territories,[]); assert.ok(Object.values(p.wars.current.totals).every(v=>v===0));
  assert.deepEqual(p.combat.battles,original.space.combat.battles); assert.deepEqual(p.combat.archive,{...original.space.combat.archive,...Object.fromEntries(militaryKeys.map(k=>[k,0]))});
  for(const k of ['balance','ledger','counts','actions','nextAction','cargo','sales','activated','pricingActivatedAction'])assert.deepEqual(p.economy[k],original.space.economy[k]);
  for(const k of ['ship','expedition','empires','outfit','expansion'])assert.deepEqual(p[k],original.space[k]);
  assert.deepEqual(preWarShape(JSON.parse(s.checkpoint)),preWarShape(JSON.parse(original.checkpoint)));
  const dt=p.economy.elapsed-original.space.economy.elapsed;
  for(const old of original.space.economy.colonies){const now=p.economy.colonies.find(c=>c.id===old.id);assert.ok(now.productiveElapsed>=old.productiveElapsed&&now.productiveElapsed-old.productiveElapsed<=dt+1e-6);assert.ok(stock(now)<=now.level*8);}
  activation={path:path.join(out,'war-activation.save.json'),sha256:saved.sha256,live:p.wars.activated,checkpoint:JSON.parse(s.checkpoint).space.wars.activated};
  for(const w of p.expedition.worlds)frozenWorlds.set(w.id,structuredClone(w));
  check('Public D3a import activates empty live/checkpoint wars, combat2 and economy5 without a grant, new political event or any old receipt/pirate/ship/biology rewrite'); await resume();
}
async function mainRoute() {
  phase='physical roots arrival, deliberate war and actual invasion'; await launch(); await gotoIndex(4); await readyForCombat(); await war('declare'); await checkpoint('war-declared'); await win('invasion',true);
  assert.equal(owner(await read(),rootsId),'player'); await checkpoint('military-title');
  await scale('v','surface'); await hold('c','Founding altitude',s=>s.space.location.pos.y<=2.8); await economyAction('found');
  let s=await read(); assert.equal(economy(s).balance,62); assert.equal(colony(s).paid,40); assert.equal(colony(s).permission,undefined); assert.ok(colony(s).militaryPermission); const permission=structuredClone(colony(s).militaryPermission),colonyId=colony(s).id;
  await checkpoint('paid-military-colony');
  phase='genuine production, neutral sale and timely defense';
  await until('Eight actual newly produced colony goods',v=>stock(colony(v))>=8,150000,120); await hold('q','Colony overview',v=>v.space.location.pos.y>=6.5,25);
  await detail('space-economy'); assert.match(await page.locator('#space-economy').innerText(),/Válečné embargo/); await shot('paid-colony-and-embargo-1024','#space-economy'); await hold('c','Actual loading altitude',v=>v.space.location.pos.y<=2.8);
  const loaded=await economyAction('load'); assert.equal(loaded.amount,8); await checkpoint('real-colony-cargo');
  await until('First actual announced raid after the declaration',v=>!!wars(v).current.raid,120000,100); const raidBefore=wars(await read()).current.raid; assert.equal(raidBefore.planetId,rootsId);
  await gotoIndex(1,'surface'); const sell=await economyAction('sell',rootsId); assert.equal(sell.amount,8); assert.ok(sell.earned>0); await checkpoint('war-time-neutral-sale');
  await gotoIndex(4); const pending=await read(),raid=wars(pending).current.raid; assert.equal(raid.serial,raidBefore.serial); assert.ok(economy(pending).elapsed<raid.deadline);
  const target=await mapRow(4); assert.match(await target.innerText(),/Napadená kolonie/); observations.push({kind:'mapped-raid',raid,mapText:await target.innerText(),remaining:raid.deadline-economy(pending).elapsed});
  await shot('announced-colony-defense-1024','#space-war'); await detail('space-star-map',false); await checkpoint('announced-raid');
  await win('defense'); assert.equal(wars(await read()).current.raid,null); assert.equal(owner(await read(),rootsId),'player'); await checkpoint('colony-defended');
  check('A deliberate real invasion earns military title; only then40 credits found the same colony. Eight genuinely produced goods sell at a peaceful foreign market, and the announced mapped raid is physically defeated before its deadline');
  return continueAfterDefense(permission,colonyId);
}
async function continueAfterDefense(permission,colonyId) {
  let s;
  phase='ordinary scenes then second announced attack'; await sceneCycles();
  await until('Next actual raid after180 economic seconds',v=>!!wars(v).current.raid,260000,120); s=await read(); const ignored=structuredClone(wars(s).current.raid); assert.equal(ignored.planetId,rootsId);
  await checkpoint('second-announced-raid'); await scale('v','surface'); await hold('c','Occupied-world service altitude',v=>v.space.location.pos.y<=2.8);
  await until('Five seconds before ignored deadline',v=>economy(v).elapsed>=ignored.deadline-5,260000,100);
  assert.ok(stock(colony(await read()))>0); await economyAction('load');
  const lost=await until('First ordinary step expires the actual deadline',v=>owner(v,rootsId)==='roots',20000,30),occupied=structuredClone(colony(lost));
  assert.equal(wars(lost).current.raid,null); assert.equal(occupied.id,colonyId); assert.deepEqual(occupied.militaryPermission,permission); assert.ok(stock(occupied)<8,'Leave storage room to prove occupied production really stops');
  await detail('space-economy'); const occupiedText=await page.locator('#space-economy').innerText(); assert.match(occupiedText,/obsazená/i);
  for(const kind of ['load','upgrade','repair','charge'])assert.equal(await page.locator(`button[data-action^="space-economy:${kind}|"]:visible`).first().isDisabled(),true);
  await shot('occupied-colony-preserved-1024','#space-economy'); const start=economy(await read()).elapsed;
  await until('Ten actual seconds with occupied production stopped',v=>economy(v).elapsed-start>=10,20000,80); assert.deepEqual(colony(await read()),occupied);
  observations.push({kind:'genuine-ignored-raid-occupation',raid:ignored,expiredAt:wars(lost).current.territories.find(t=>t.planetId===rootsId).change.economyAt,occupied,after:colony(await read()),ui:occupiedText});
  await checkpoint('occupied-colony');
  phase='actual recapture, original colony restoration and peace'; await hold('q','Recapture ascent',v=>v.space.location.pos.y>=21); await scale('r','orbit'); await win('invasion');
  s=await read(); assert.equal(owner(s,rootsId),'player'); assert.equal(colony(s).id,colonyId); assert.deepEqual(colony(s).militaryPermission,permission); assert.equal(economy(s).colonies.length,4); assert.equal(colony(s).loaded,occupied.loaded);
  const produced=colony(s).produced; await until('Restored ownership permits a new real product',v=>colony(v).produced>produced,20000,80);
  await war('peace'); await checkpoint('recaptured-and-peace');
  s=await read(); assert.equal(relation(s).active,false); assert.equal(wars(s).current.raid,null); assert.deepEqual(colony(s).militaryPermission,permission);
  check('A second actual180-second warning expires without defense. The same paid colony, cargo and stock survive, services disable and production stays exact for10 real seconds. A second physical invasion restores that same colony, new production resumes, then free explicit peace preserves the earned ownership');
  phase='physical home return and genuine final sale'; await returnHome(); return finishHome();
}
async function finishHome() {
  const carried=economy(await read()).cargo.find(c=>c.planetId===rootsId); if(carried)await economyAction('sell',rootsId);
  await detail('space-dock'); await detail('space-war'); const declare=page.locator('button[data-action^="space-war:declare|roots|"]:visible'); assert.equal(await declare.isDisabled(),true);
  const saved=await exported('active-campaign.save.json'); check('Original home snapshot remains exact until actual docking; cargo sells for the displayed domestic price, all D3a/D1/D2 receipts survive and the next declaration is visibly blocked by the global180-second peace'); return saved;
}
async function allyRoute() {
  phase='independent resin-ally suspension'; await launch(); await gotoIndex(1); const before=await read(); await war('declare','resin'); const declared=await read(),escort=structuredClone(relation(declared,'resin').declaration.escort),decl=relation(declared,'resin').declaration;
  assert.ok(escort); assert.equal(ally(declared).location,null); assert.deepEqual(ally(declared).id,ally(before).id); await checkpoint('paid-ally-suspended');
  await hold('d','Real movement while allied service is suspended',s=>s.space.location.pos.x>=20,30); await near({x:0,z:0});
  await until('Sixty genuine economic seconds before ceasefire',s=>economy(s).elapsed>=decl.economyAt+60.02,100000,100);
  const waiting=await read(); assert.deepEqual({energy:ally(waiting).energy,generated:ally(waiting).generated,delivered:ally(waiting).delivered},escort); assert.equal(ally(waiting).location,null);
  const embargo=await mapRow(1); assert.match(await embargo.innerText(),/embargem/); await detail('space-star-map',false); await war('peace','resin');
  const peace=await read(),r=relation(peace,'resin'),dt=peace.space.elapsed-r.peace.cut.at; assert.ok(ally(peace).location); assert.ok(Math.abs(r.suspendedSeconds-(r.peace.cut.at-decl.cut.at))<1e-6);
  assert.ok(ally(peace).generated-escort.generated<=.8*dt+1e-6); assert.ok(ally(peace).delivered-escort.delivered<=2*dt+1e-6);
  assert.ok(Math.abs(ally(peace).energy-(escort.energy+ally(peace).generated-escort.generated-ally(peace).delivered+escort.delivered))<1e-6);
  observations.push({kind:'paid-ally-suspension-and-return',before:ally(before),declaration:decl,suspended:escort,peace:r.peace,suspendedSeconds:r.suspendedSeconds,after:ally(peace),actualPostPeaceDt:dt});
  await checkpoint('paid-ally-restored'); await returnHome(); const saved=await exported('ally-branch.save.json');
  assert.equal(economy(await read()).balance,102); assert.equal(hash(await readFile(canonical)),canonicalBefore);
  check('Independent branch suspends the actually paid resin escort through real movement and public rekey. Sixty actual seconds permit peace; the same ID/account returns without an energy gift. The main canonical campaign remains byte-identical'); return saved;
}
async function flushProgress() {
  await writeFile(path.join(out,'progress.json'),JSON.stringify({phase,checks,errors,assets,activation,departure,shots,transactions,observations,rekeys,legs,lifecycle,performance:performanceSample,images,priorEvidence},null,2));
}
async function resumeDefended() {
  const file=path.join(rootOut,'colony-defended.save.json'),bytes=await readFile(file),saved=JSON.parse(bytes).state;
  assert.equal(hash(bytes),'2ac6163808a543f6f0d5caee31bc30638bd5bdfe0f31e79fa1f13d7514d0ff37');
  const depFile=path.join(rootOut,'departure.save.json'),depBytes=await readFile(depFile),dep=JSON.parse(depBytes).state; home=homeExport(dep); assert.deepEqual(homeExport(saved),home);
  departure={path:depFile,sha256:hash(depBytes),fullHomeSha256:hash(JSON.stringify(home))};
  priorEvidence={reason:'Original driver reached and publicly exported the first won defense, then its recovery download had an unhandled promise which hid the original exception. A separate unchanged-export public UI reproduction established that eight duplicate rekey slots fill isolated browser storage and the ninth import is correctly refused; this is a supported harness cause, not a recovered original exception. The original 90RAF sample was not flushed and is not claimed.',source:{path:file,sha256:hash(bytes)},initialLog:path.join(rootOut,'run-initial.log'),exports:[]};
  for(const label of ['war-activation','war-declared','invasion-two-pulses','military-title','paid-military-colony','real-colony-cargo','war-time-neutral-sale','announced-raid','colony-defended']) {const f=path.join(rootOut,`${label}.save.json`);try{const b=await readFile(f);priorEvidence.exports.push({path:f,sha256:hash(b)});}catch(error){if(error.code!=='ENOENT')throw error;const manifest=JSON.parse(await readFile(path.join(rootOut,'artifact-cleanup.json'))),entry=manifest.removed.find(r=>r.path===f);assert.ok(entry,`Missing export without cleanup provenance: ${f}`);priorEvidence.exports.push({...entry,removedByCleanup:true});}}
  for(const name of ['actual-empire-guard-1024','paid-colony-and-embargo-1024','announced-colony-defense-1024'])images.push(path.join(rootOut,`${name}.png`));
  for(const row of saved.space.economy.actions.filter(r=>r.serial>=original.space.economy.nextAction))transactions.push({source:'actual prior public export',receipt:row});
  for(const w of saved.space.expedition.worlds)frozenWorlds.set(w.id,structuredClone(w));
  await importCampaign(file); const resumed=await exported(); assert.deepEqual(homeExport(resumed.value.state),home); assert.deepEqual(resumed.value.state.space.wars,saved.space.wars);
  rekeys.push({label:'resume-defended',from:saved.id,to:resumed.value.state.id,sourceSha256:hash(bytes),warAction:saved.space.wars.nextAction}); frozenHome=homePublic(await read()); await resume();
  check('Continuation publicly imports the exact genuinely defended colony export: invasion+defense victories, paid colony40, prior neutral sale96, account158 and frozen home survive. No earlier progress is replayed or injected');
  await flushProgress(); return continueAfterDefense(structuredClone(colony(await read()).militaryPermission),colony(await read()).id);
}

async function resumeAtHome() {
  const failurePath=path.join(rootOut,'failure-return.json'),prior=JSON.parse(await readFile(failurePath)),file=path.join(rootOut,'return-recovery.save.json'),bytes=await readFile(file),saved=JSON.parse(bytes).state;
  assert.equal(hash(bytes),'41c23e1c8f9baac168a04f81b1b8ac919c833d3b7d02eb35e85f4b060e36ff83'); assert.equal(saved.space.location,null); assert.equal(saved.space.economy.balance,158);
  assert.equal(prior.phase,'physical home return and genuine final sale'); assert.match(prior.error,/#space-economy/); assert.equal(prior.lifecycle.length,4); assert.equal(prior.performance.frames.count,90);
  for(const[key,list]of Object.entries({checks,assets,images,legs,transactions,rekeys,lifecycle,observations,shots}))list.push(...prior[key]);
  performanceSample=prior.performance; departure=prior.departure; priorEvidence={...JSON.parse(await readFile(path.join(rootOut,'failure-return-initial.json'))).priorEvidence,homeContinuation:{failurePath,source:{path:file,sha256:hash(bytes)},reason:'After the actual return and successful pre-dock full-home equality check, the driver tried the home economy summary inside a closed space-dock. Only the public opening of this parent details panel was missing. This continuation completes the genuine pending sale without repeating or altering prior milestones.'}};
  previous=null; await importCampaign(file); await detail('space-dock'); phase='pending genuine home sale after public recovery import'; await flushProgress(); return finishHome();
}
try {
  if(!resumeDefense&&!resumeHome)await activate(); const final=await(resumeHome?resumeAtHome():resumeDefense?resumeDefended():branch?allyRoute():mainRoute()),s=await read(); intact(s); assert.equal(hash(await readFile(source)),sourceHash);
  await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,branch:branch?'independent-paid-ally':'main',priorEvidence,source:{path:source,sha256:sourceHash},assets,activation,departure,shots,transactions,observations,rekeys,legs,lifecycle,performance:performanceSample,images,
    wars:wars(s),combat:combat(s),account:economy(s),expansion:expansion(s),ship:{health:s.space.ship.health,energy:s.space.ship.energy},worlds:expedition(s).worlds.map(summary),homeFacts:{fullHomeSha256:home?hash(JSON.stringify(home)):departure?.fullHomeSha256,departure},
    finalCampaign:{path:path.join(out,branch?'ally-branch.save.json':'active-campaign.save.json'),sha256:final.sha256},canonicalPreserved:branch?{path:canonical,sha256:canonicalBefore}:null,disk:{before:diskBefore,after:await disk()},
    provenance:'Continuation of the exact genuinely played D3a campaign through public UI/import/export and ordinary native RAF. No state setters, debug clocks, grants, production helper imports or edited payloads. Independent ally branch never replaces the main campaign. Does not claim a new-lineage campaign, all milestone D, human playtest or audio acceptance.'},null,2));
} catch(error) {
  console.error('Original failure',phase,error); await flushProgress().catch(()=>{});
  await writeFile(path.join(out,'initial-failure.json'),JSON.stringify({phase,error:String(error),stack:error.stack,performance:performanceSample,priorEvidence,state:await read().catch(()=>null)},null,2));
  let recovery=null; try{if(await page.locator('button[data-action="pause"]:visible,button[data-action="export"]:visible,button[data-action="saves"]:visible').count())recovery=(await exported('failure-campaign.save.json')).sha256;}catch{}
  await writeFile(path.join(out,'failure.json'),JSON.stringify({phase,error:String(error),stack:error.stack,branch,source:{path:source,sha256:sourceHash},checks,errors,assets,activation,departure,shots,transactions,observations,rekeys,legs,lifecycle,performance:performanceSample,images,
    homeFacts:{fullHomeSha256:home&&hash(JSON.stringify(home)),departure,publicSnapshot:frozenHome,frozenWorlds:[...frozenWorlds].map(([id,w])=>({id,sha256:hash(JSON.stringify(w))}))},recovery,state:await read().catch(()=>null)},null,2)); console.error(error);process.exitCode=1;
} finally {await context.close();await browser.close();console.log('Browser close completed');}
