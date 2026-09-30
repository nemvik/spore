/** D3c: actual ecological quarantine and cargo-triggered pirates.
 * Public UI and native RAF only. --retreat imports the exact pending encounter
 * as a separate branch and never replaces the completed main campaign. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const branch = process.argv.includes('--retreat');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const rootOut = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-014d3c/browser'), out = branch ? path.join(rootOut, 'retreat-branch') : rootOut;
const source = path.resolve('tests/fixtures/space/native-d3b-campaign.save.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, 'e66caf26dd3184661b97688b51eace5bc27bb9c69580d5a434d0ea2b01685f24');
assert.equal(original.space.events, undefined); assert.equal(original.space.economy.version, 5); assert.equal(original.space.ship.health, 67); assert.equal(original.space.economy.balance, 222);
assert.ok(process.env.LUMAVORA_ASSET, 'Require the explicitly approved D3c asset'); assert.equal(new URL(base).searchParams.has('test'), false);
const canonical = path.join(rootOut, 'active-campaign.save.json'), canonicalBefore = branch ? hash(await readFile(canonical)) : null;
await mkdir(out, { recursive: true }); const disk = async () => { const d = await statfs(out); return d.bavail * d.bsize; }, diskBefore = await disk();
console.log(`D3c ${branch ? 'independent retreat' : 'main'} public UI; ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free`);
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1' });
const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, acceptDownloads: true }), page = await context.newPage();
const errors = [], checks = [], assets = [], images = [], legs = [], transactions = [], rekeys = [], lifecycle = [], observations = [], biologicalActions = [], shots = [];
const frozenWorlds = new Map(), hotId = `${original.space.homePlanetId}:star-2:planet`;
let phase = 'activation', frozenHome = null, home = null, activation = null, performanceSample = null, departure = null, previous = null;
page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition = s => s.space.expedition, economy = s => s.space.economy, outfit = s => s.space.outfit, expansion = s => s.space.expansion, combat = s => s.space.combat, events = s => s.space.events;
const battle = s => combat(s).battles.at(-1), ally = s => expansion(s).allies[0], colony = s => economy(s).colonies.find(c => c.planetId === hotId), stock = c => c.produced - c.loaded;
const activeWorld = s => expedition(s).worlds.find(w => w.id === s.space.location?.planetId);
const hot = s => expedition(s).worlds.find(w => w.id === hotId);
const quarantine = s => { const c = events(s).current.colonies.find(c => c.planetId === hotId); return c && c.quarantines > c.resumes ? c.lastQuarantine : null; };
const watch = s => events(s).watches.find(w => w.planetId === hotId);
const check = text => { checks.push(text); console.log(text); };
const homeKeys = ['stage','tick','seed','player','campaign','world','tribe','machines','planet','homePlanet','lineageHistory','cities','states','military','maritime','commerce','mobilization'];
const homePublic = s => Object.fromEntries(homeKeys.filter(k => Object.hasOwn(s, k)).map(k => [k, s[k]]));
function homeExport(s) { const v = structuredClone(s); delete v.id; delete v.space; if (v.checkpoint) { v.checkpoint = JSON.parse(v.checkpoint); delete v.checkpoint.id; } return v; }
const summary = w => ({ id: w.id, elapsed: w.elapsed, population: w.life.length, climate: [w.temperature,w.atmosphere], stableFor: w.biosphere.stableFor });
const distance3 = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function intact(s) {
  assert.deepEqual(errors, []); assert.equal(s.deathReason, null); assert.ok(s.player.health > 0); assert.ok(s.space.ship.health > 0);
  for (const k of ['id','creation','purchase']) assert.deepEqual(s.space.ship[k], original.space.ship[k]);
  for (const k of ['empires','outfit','wars']) assert.deepEqual(s.space[k], original.space[k]);
  assert.deepEqual(expansion(s).actions, original.space.expansion.actions);
  const e = economy(s), l = e.ledger; assert.equal(e.version, 6); assert.equal(combat(s).version, 2); assert.equal(events(s).version, 1);
  assert.equal(e.balance, l.deposits+l.revenue-l.construction-l.upgrades-l.repairs-l.charging-l.equipment-l.alliance-l.territory);
  assert.deepEqual(e.actions.slice(0, original.space.economy.actions.length), original.space.economy.actions);
  assert.deepEqual(combat(s).battles.slice(0, original.space.combat.battles.length), original.space.combat.battles);
  for (const k of ['deposits','construction','upgrades','charging','equipment','alliance','territory','energyRestored']) assert.equal(l[k], original.space.economy.ledger[k]);
  assert.equal(e.colonies.length, original.space.economy.colonies.length);
  for (const old of original.space.economy.colonies) { const now = e.colonies.find(c => c.id === old.id); for (const k of ['id','planetId','product','paid','level','upgraded','foundedAt','permission','militaryPermission']) assert.deepEqual(now[k],old[k]); }
  for (const row of e.actions.filter(r => r.serial >= original.space.economy.nextAction)) assert.ok(['repair','load','sell'].includes(row.kind));
  const damage = combat(s).battles.slice(original.space.combat.battles.length).reduce((n,b) => n+b.damage,0);
  assert.equal(s.space.ship.health, original.space.ship.health+l.healthRestored-original.space.economy.ledger.healthRestored-damage);
  for (const k of ['id','empireId','paidSerial']) assert.equal(ally(s)[k], original.space.expansion.allies[0][k]);
  assert.ok(Math.abs(ally(s).energy-(12+ally(s).generated-ally(s).delivered))<1e-7);
  if (previous) { const dt=s.space.elapsed-previous.elapsed; assert.ok(dt>=-1e-7); assert.ok(ally(s).generated-previous.generated<=.8*dt+1e-7); assert.ok(ally(s).delivered-previous.delivered<=2*dt+1e-7); }
  previous={elapsed:s.space.elapsed,generated:ally(s).generated,delivered:ally(s).delivered};
  for (const [id,w] of frozenWorlds) assert.deepEqual(expedition(s).worlds.find(v=>v.id===id),w,`Inactive world changed: ${id}`);
  if (frozenHome) { assert.notEqual(s.space.location,null,'Unexpected forced home return'); assert.deepEqual(homePublic(s),frozenHome,'Home changed before physical docking'); }
}

// Shared native input, camera, navigation and safe download helpers follow.
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
async function shot(name, selector = '#space-events') {
  assert.ok(images.length < 4); await frames(6); if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
  const state = await read(); observations.push({kind: 'event-screenshot', file, location: state.space.location, camera: state.spaceCamera, health: state.space.ship.health, battle: battle(state)});
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
async function gotoIndex(index, target='orbit') {
  let s=await read(); if(s.space.location.scale==='surface')await ascend(); else if(s.space.location.scale==='orbit') {await near({x:0,z:0}); await scale('r','system');}
  let current=Number((await read()).space.location.systemId.match(/:star-(\d+)$/)?.[1]??0);
  while(current!==index) {
    const row=await mapRow(index), text=await row.innerText(), q=text.match(/(?:^|\n)(\d+(?:\.\d+)?) · (\d+) energie/);
    assert.ok(q,text); const next=Number(q[1])<=32?index:current+Math.sign(index-current); await jump(next); current=next;
  }
  if(target!=='system')await scale('v','orbit'); if(target==='surface') {await scale('v','surface'); await hold('c','Surface service altitude',v=>v.space.location.pos.y<=2.8);}
}


async function flush() {
  await writeFile(path.join(out,'progress.json'),JSON.stringify({phase,checks,errors,assets,activation,departure,shots,transactions,biologicalActions,observations,rekeys,legs,lifecycle,performance:performanceSample,images},null,2));
}
async function checkpoint(label) {
  await pause(); const stopped=await read(); await page.waitForTimeout(200); assert.deepEqual((await read()).space,stopped.space); await act('save');
  const before=await exported(`${label}.save.json`); assert.deepEqual(homeExport(before.value.state),home);
  const actions=await page.locator('button[data-action^="delete:"]:visible').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-action'))),removed=[];
  for (const action of actions) if(action!==`delete:${before.value.state.id}`){await act(action);removed.push(action.slice(7));}
  if(removed.length)observations.push({kind:'public-isolated-import-slot-cleanup',kept:before.value.state.id,removed});
  await importCampaign(path.join(out,`${label}.save.json`)); await pause(); const after=await exported(),a=before.value.state.space,b=after.value.state.space;
  assert.notEqual(before.value.state.id,after.value.state.id); assert.equal(JSON.parse(after.value.state.checkpoint).id,after.value.state.id);
  for(const k of ['empires','outfit','wars'])assert.deepEqual(b[k],a[k]);
  for(const k of ['actions','nextAction','archive','current','candidate'])assert.deepEqual(b.events[k],a.events[k]);
  for(const k of ['balance','ledger','counts','actions','nextAction','cargo','sales'])assert.deepEqual(b.economy[k],a.economy[k]);
  assert.deepEqual(b.expedition.cargo,a.expedition.cargo); assert.deepEqual(homeExport(after.value.state),home);
  for(const old of a.combat.battles){const now=b.combat.battles.find(x=>x.serial===old.serial);if(old.end)assert.deepEqual(now,old);else for(const k of ['serial','kind','start','economyAt','origin','shots','lastShot','end'])assert.deepEqual(now[k],old[k]);}
  rekeys.push({label,path:path.join(out,`${label}.save.json`),sha256:before.sha256,from:before.value.state.id,to:after.value.state.id,eventAction:a.events.nextAction,economyAction:a.economy.nextAction,health:[a.ship.health,b.ship.health]});
  await resume(); await flush(); return before;
}
async function lifeAction(kind,id) {
  await until('Actual biological energy',s=>s.space.ship.energy>=(kind==='scan'?1:2));
  const before=await read(),serial=expedition(before).nextAction,button=page.locator(`button[data-action="space-${kind}:${id}"]:visible`).first();
  assert.equal(await button.isDisabled(),false,await page.locator('#space-biology').innerText()); await button.click();
  const after=await until(`Paid ${kind} ${id}`,s=>expedition(s).actions.some(a=>a.serial>=serial&&a.kind===kind&&a.lifeId===id));
  const receipt=expedition(after).actions.find(a=>a.serial>=serial&&a.kind===kind&&a.lifeId===id); assert.equal(receipt.energyPaid,kind==='scan'?1:2);
  if(kind!=='scan')assert.equal(receipt.band,1); biologicalActions.push(receipt); return after;
}
async function approachLife(id) {
  for(let retry=0;retry<4;retry++){const s=await read(),life=activeWorld(s).life.find(l=>l.id===id);assert.ok(life);await near(life.pos);const now=await read(),current=activeWorld(now).life.find(l=>l.id===id);if(Math.hypot(now.space.location.pos.x-current.pos.x,now.space.location.pos.z-current.pos.z)<4.5)return;}
  throw new Error('Actual specimen moved out of transfer range');
}
async function pulse() {
  await until('Actual pulse range cadence and energy',s=>!battle(s).end&&s.space.ship.energy>=3&&distance3(s.space.location.pos,battle(s).enemy.pos)<=24&&(!battle(s).lastShot||s.space.elapsed-battle(s).lastShot.at>=.65+1e-7),30000,30);
  const before=await read(),n=battle(before).shots;await act('space-pulse');const after=await until('One paid pulse',s=>battle(s).shots===n+1,10000,20);
  assert.equal(battle(after).enemy.health,battle(before).enemy.health-12);const dt=after.space.elapsed-before.space.elapsed,transfer=ally(after).delivered-ally(before).delivered;assert.ok(after.space.ship.energy<=Math.min(105,before.space.ship.energy-3+4.82*dt+transfer)+1e-6);shots.push({battle:battle(after).serial,shot:n+1,lastShot:battle(after).lastShot,energyBefore:before.space.ship.energy,energyAfter:after.space.ship.energy});
}
async function activate() {
  await importCampaign(source);const saved=await exported('events-activation.save.json'),s=saved.value.state,p=s.space,e=p.events;
  assert.deepEqual(e.actions,[]);assert.deepEqual(e.watches,[]);assert.equal(e.candidate,null);assert.equal(e.nextAction,1);assert.ok(Object.values(e.current.totals).every(v=>v===0));
  for(const k of ['balance','ledger','counts','actions','nextAction','cargo','sales'])assert.deepEqual(p.economy[k],original.space.economy[k]);
  for(const k of ['ship','expedition','empires','outfit','expansion','combat','wars'])assert.deepEqual(p[k],original.space[k]);
  const cp=JSON.parse(s.checkpoint),oldCp=JSON.parse(original.checkpoint);assert.equal(cp.space.economy.version,6);assert.equal(cp.space.events.nextAction,1);delete cp.space.events;cp.space.economy.version=5;delete cp.id;delete oldCp.id;assert.deepEqual(cp,oldCp);
  activation={path:path.join(out,'events-activation.save.json'),sha256:saved.sha256,live:e.activated,checkpoint:JSON.parse(s.checkpoint).space.events.activated};
  for(const w of p.expedition.worlds)frozenWorlds.set(w.id,structuredClone(w));
  check('Exact D3b public import activates empty events and economy6 independently in live and old checkpoint, with no incident, healing, grant or old receipt rewrite');await resume();
}
async function launch() {
  await detail('space-dock');await act('space-launch');await until('Actual launch',s=>s.space.location?.scale==='surface');
  const saved=await exported('departure.save.json');home=homeExport(saved.value.state);frozenHome=homePublic(await read());departure={path:path.join(out,'departure.save.json'),sha256:saved.sha256,fullHomeSha256:hash(JSON.stringify(home))};await resume();
}
async function finishHome() {
  await gotoIndex(0,'surface');const before=await exported();assert.deepEqual(homeExport(before.value.state),home);observations.push({kind:'pre-dock-whole-home-equality',sha256:hash(JSON.stringify(home))});await resume();frozenHome=null;
  await page.locator('.space-heading h2').click();await page.keyboard.press('v');await until('Physical home docking',s=>s.space.location===null);
  await detail('space-dock');if(economy(await read()).cargo.some(c=>c.planetId===hotId))await economyAction('sell',hotId);
  if(!branch){await nextExpedition();await shot('returned-event-ledger-1024','#space-events');}
  return exported(branch?'retreat-branch.save.json':'active-campaign.save.json');
}
async function nextExpedition() {
  const before=await read(),totals=structuredClone(events(before).current.totals);assert.equal(events(before).candidate,null);assert.deepEqual(totals,{quarantines:1,resumes:1,pirates:1,victories:1,retreats:0,defeats:0});
  await act('space-launch');await until('Next voluntary expedition launch',s=>s.space.location?.scale==='surface');
  const departureExport=await exported();home=homeExport(departureExport.value.state);frozenHome=homePublic(await read());const secondHomeHash=hash(JSON.stringify(home));await resume();await gotoIndex(1);
  assert.deepEqual(events(await read()).current.totals,totals);assert.equal(events(await read()).current.pirate,null);assert.equal(events(await read()).candidate,null);
  await gotoIndex(0,'surface');const returned=await exported();assert.deepEqual(homeExport(returned.value.state),home);await resume();frozenHome=null;
  await page.locator('.space-heading h2').click();await page.keyboard.press('v');await until('Next voluntary expedition returns',s=>s.space.location===null);await detail('space-dock');
  const after=await read();assert.deepEqual(events(after).current.totals,totals);observations.push({kind:'next-voluntary-expedition-without-extra-incident',startEconomyAt:economy(before).elapsed,endEconomyAt:economy(after).elapsed,totals,secondHomeSha256:secondHomeHash,forcedReturns:0});
  check('After the first voluntary home sale, another actual foreign-orbit expedition remains available: no old load is reused, no extra incident opens and no forced home return occurs');
}
async function scenes() {
  await near({x:0,z:0});await hold('q','Actual scene-cycle ascent',s=>s.space.location.pos.y>=21);await scale('r','orbit');
  for(let cycle=1;cycle<=4;cycle++){await frames(12);const a=await read();await scale('v','surface');await frames(12);const b=await read();await hold('q','Ordinary cycle ascent',s=>s.space.location.pos.y>=21);await scale('r','orbit');await frames(12);const c=await read();
    const row={cycle,before:resources(a),surface:resources(b),after:resources(c),retainedGeometry:c.render.geometries-a.render.geometries};lifecycle.push(row);await flush();console.log('Paired scene',JSON.stringify(row));if(cycle>1){assert.equal(row.retainedGeometry,0);assert.equal(row.before.programs,row.after.programs);assert.equal(row.before.textures,row.after.textures);}}
  await scale('v','surface');await hold('c','Load height after scene cycles',s=>s.space.location.pos.y<=2.8);
}
async function mainRoute() {
  await activate();await launch();phase='actual lost role and quarantine';await gotoIndex(2,'surface');await until('Stable colony actually observed',s=>!!watch(s)?.armedAt&&hot(s).biosphere.stableFor[0]>=10);
  await detail('space-biology');const specimens=hot(await read()).life.filter(l=>l.habitat.band===1&&l.taxonKey==='species:crest');assert.equal(specimens.length,3);
  for(const life of specimens){await page.locator('#space-specimen').selectOption(life.id);await approachLife(life.id);if(!expedition(await read()).scans.some(r=>r.lifeId===life.id))await lifeAction('scan',life.id);await lifeAction('collect',life.id);}
  assert.equal(hot(await read()).life.filter(l=>l.habitat.band===1&&l.taxonKey==='species:crest').length,0);
  await near({x:0,z:0});const preload=await economyAction('load');assert.equal(preload.amount,9);assert.equal(preload.eventAction,1);
  const opened=await until('Twelve real local seconds create quarantine',s=>!!quarantine(s),30000,80),q=structuredClone(quarantine(opened)),stopped=structuredClone(colony(opened));
  assert.ok(q.watch.unstableFor>=12-1e-6);assert.ok(stock(stopped)<16);assert.equal(events(opened).current.totals.quarantines,1);assert.equal(events(opened).current.totals.pirates,0);
  await detail('space-economy');assert.equal(await page.locator('button[data-action^="space-economy:load|"]:visible').isDisabled(),true);assert.match(await page.locator('#space-events').innerText(),/Karanténa/);
  await shot('actual-colony-quarantine-1024','#space-events');
  const r1=await economyAction('repair'),r2=await economyAction('repair');assert.deepEqual([r1.paid,r1.before,r1.after,r2.paid,r2.before,r2.after],[5,67,107,5,107,115]);assert.equal(economy(await read()).balance,212);
  await checkpoint('quarantine-carried-life');phase='quarantine persists through real departure and return';await gotoIndex(1);const inactive=structuredClone(hot(await read())),at=economy(await read()).elapsed;
  await until('Remote quarantine and biology stasis',s=>economy(s).elapsed-at>=3,10000,80);assert.deepEqual(hot(await read()),inactive);assert.deepEqual(colony(await read()),stopped);assert.deepEqual(quarantine(await read()),q);
  const row=await mapRow(2);assert.match(await row.innerText(),/karanténa/i);await detail('space-star-map',false);await gotoIndex(2,'surface');await detail('space-biology');await page.locator('#space-habitat-band').selectOption('1');
  for(const life of specimens){await lifeAction('release',life.id);const actual=hot(await read()).life.find(l=>l.id===life.id);assert.equal(actual.originPlanetId,life.originPlanetId);assert.equal(actual.taxonKey,life.taxonKey);assert.deepEqual(actual.habitat.birth,life.habitat.birth);}
  const stable=await until('Same returned predators restore ten seconds stability',s=>hot(s).biosphere.stableFor[0]>=10,90000,100),stableAt=economy(stable).elapsed;
  await until('Stable ecology alone does not clear quarantine',s=>economy(s).elapsed-stableAt>=3,10000,80);assert.deepEqual(colony(await read()),stopped);assert.ok(quarantine(await read()));assert.equal(expedition(await read()).cargo.length,0);
  await near({x:0,z:0});const before=await read(),serial=events(before).nextAction;await act(`space-event:resume|${hotId}|${serial}`);
  const resumed=await until('Explicit free local restart',s=>events(s).nextAction===serial+1);assert.equal(quarantine(resumed),null);assert.deepEqual(economy(resumed).ledger,economy(before).ledger);assert.equal(resumed.space.ship.health,before.space.ship.health);
  await until('Real new product after personal restart',s=>colony(s).produced>stopped.produced,20000,80);await checkpoint('colony-explicitly-restored');await shot('restored-colony-and-event-history-1024','#space-economy');
  observations.push({kind:'quarantine-and-actual-repair',specimens,opening:q,stopped,resumed:colony(await read()),preload,localRestart:events(resumed).actions.at(-1)});
  check('Three actual paid predator pickups create a12-local-second crisis; stock and paid colony survive flight/import, service costs10, returning the same IDs and stable ecology still require explicit local restart before new production');
  phase='new cargo and automatically caused pirate';await scenes();await near({x:0,z:0});const load=await economyAction('load');assert.equal(load.amount,3);assert.equal(economy(await read()).cargo[0].amount,12);assert.ok(load.eventAction>=3);await checkpoint('fresh-event-cargo');
  await gotoIndex(1);const arrived=await read();assert.ok(economy(arrived).elapsed-q.economyAt<300,'Route should expose the actual remaining shared event rest');assert.equal(events(arrived).current.pirate,null);
  const encounter=await until('Actual300-second shared rest then automatic cargo pirate',s=>!!events(s).current.pirate,360000,120),pirate=structuredClone(events(encounter).current.pirate);
  assert.ok(pirate.economyAt-q.economyAt>=300-1e-6);assert.deepEqual(pirate.candidate.receipt,load);assert.equal(pirate.planetId,encounter.space.location.planetId);assert.notEqual(pirate.planetId,hotId);assert.equal(pirate.battleSerial,battle(encounter).serial);assert.equal(battle(encounter).kind,'pirate');
  await pulse();const raf=await frames(),measured=await read();performanceSample={frames:stats(raf),render:measured.render,camera:measured.spaceCamera,location:measured.space.location,battle:battle(measured),event:pirate};await flush();console.log('Native automatic battle90RAF',JSON.stringify(performanceSample.frames));
  await pulse();await checkpoint('cargo-ambush');await shot('automatic-cargo-pirate-1024','#space-events');
  while(!battle(await read()).end)await pulse();const won=await read();assert.equal(battle(won).end.outcome,'won');assert.equal(events(won).current.pirate,null);assert.equal(events(won).current.totals.victories,1);assert.equal(economy(won).cargo[0].amount,12);assert.equal(economy(won).balance,212);
  observations.push({kind:'automatic-paid-cargo-pirate',load,pirate,result:events(won).current.lastPirateResult});check('A real new receipt and physical foreign orbit trigger one automatic pirate only after300 economy seconds; five paid pulses win without changing the cargo or giving money');
  phase='actual return with preserved event history';return finishHome();
}
async function retreatRoute() {
  phase='independent actual automatic pirate retreat';const file=path.join(rootOut,'cargo-ambush.save.json'),b=await readFile(file),saved=JSON.parse(b).state,main=JSON.parse(await readFile(path.join(rootOut,'result.json')));
  const ref=main.rekeys.find(r=>r.label==='cargo-ambush');assert.equal(hash(b),ref.sha256);assert.ok(saved.space.events.current.pirate);assert.equal(saved.space.combat.battles.at(-1).shots,2);
  const dep=JSON.parse(await readFile(path.join(rootOut,'departure.save.json'))).state;home=homeExport(dep);assert.deepEqual(homeExport(saved),home);departure=main.departure;
  for(const w of saved.space.expedition.worlds)frozenWorlds.set(w.id,structuredClone(w));await importCampaign(file);frozenHome=homePublic(await read());
  const before=await read(),cargo=structuredClone(economy(before).cargo),balance=economy(before).balance;await scale('r','system');
  const after=await read();assert.equal(battle(after).end.outcome,'retreated');assert.equal(events(after).current.totals.retreats,1);assert.equal(events(after).current.pirate,null);assert.deepEqual(economy(after).cargo,cargo);assert.equal(economy(after).balance,balance);
  await checkpoint('automatic-pirate-retreated');const final=await finishHome();assert.equal(hash(await readFile(canonical)),canonicalBefore);check('Independent ordinary orbital retreat records the existing automatic encounter without deleting cargo or forcing home, then voluntarily returns; canonical main bytes remain unchanged');return final;
}
try {
  const final=await(branch?retreatRoute():mainRoute()),s=await read();intact(s);assert.equal(hash(await readFile(source)),sourceHash);
  await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,branch:branch?'independent-retreat':'main',source:{path:source,sha256:sourceHash},assets,activation,departure,shots,transactions,biologicalActions,observations,rekeys,legs,lifecycle,performance:performanceSample,images,
    events:events(s),eventCadence:{automaticOpenings:events(s).current.totals.quarantines+events(s).current.totals.pirates,economyElapsed:economy(s).elapsed-original.space.economy.elapsed,voluntaryHomeDockings:branch?1:2,forcedHomeReturns:0},account:economy(s),combat:combat(s),worlds:expedition(s).worlds.map(summary),ship:{health:s.space.ship.health,energy:s.space.ship.energy},homeFacts:{departure,fullHomeSha256:hash(JSON.stringify(home))},finalCampaign:{path:path.join(out,branch?'retreat-branch.save.json':'active-campaign.save.json'),sha256:final.sha256},canonicalPreserved:canonicalBefore,disk:{before:diskBefore,after:await disk()},
    provenance:'Exact played D3b continuation via ordinary public UI/native RAF. No setters, artificial clocks, grants, edited payloads or production helper imports. Unit fixtures and this continuation do not prove a fresh-lineage campaign, all milestone D/core or human playtest/audio acceptance.'},null,2));
}catch(error){
  console.error('Original failure',phase,error);await flush().catch(()=>{});await writeFile(path.join(out,'initial-failure.json'),JSON.stringify({phase,error:String(error),stack:error.stack,performance:performanceSample,state:await read().catch(()=>null)},null,2));
  let recovery=null;try{recovery=(await exported('failure-campaign.save.json')).sha256;}catch(recoveryError){console.error('Public recovery failed',String(recoveryError));}
  await writeFile(path.join(out,'failure.json'),JSON.stringify({phase,error:String(error),stack:error.stack,checks,errors,assets,activation,departure,shots,transactions,biologicalActions,observations,rekeys,legs,lifecycle,performance:performanceSample,images,recovery,state:await read().catch(()=>null)},null,2));process.exitCode=1;
}finally{await context.close();await browser.close();console.log('Browser close completed');}
