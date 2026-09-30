/** D5 genuine core expedition, reward, return and another expedition.
 * Public UI/import/export and read-only telemetry; native RAF only.
 * --force uses the exact played D4 workshop before diplomatic support. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const branch = process.argv.includes('--force'), resumeRepaired = process.argv.includes('--resume-repaired'), resumeLoss = process.argv.includes('--resume-loss') || resumeRepaired;
assert.ok(!resumeLoss || branch);
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const rootOut = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-015d5/browser'), out = branch ? path.join(rootOut, 'force-branch') : rootOut;
const source = path.resolve(branch ? 'tests/fixtures/space/native-d4-workshop.save.json' : 'tests/fixtures/space/native-d4-campaign.save.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, branch ? '94027584f0d517858b3039f723114393be8bdebe195b8ba8b63e86ad3015640e' : 'c62b896de2e54ff1123f04e13877cf0cf32e9a864bd7781812c71bddb34e1da9');
assert.ok(process.env.LUMAVORA_ASSET); assert.equal(new URL(base).searchParams.has('test'), false);
const canonical = path.join(rootOut, 'active-campaign.save.json'), canonicalBefore = branch ? hash(await readFile(canonical)) : null;
await mkdir(out, {recursive:true}); const disk = async () => {const d=await statfs(out);return d.bavail*d.bsize;}, diskBefore=await disk();
console.log(`D5 ${branch ? 'force branch' : 'diplomatic main'} public UI; ${(diskBefore/1024**3).toFixed(2)} GiB free`);
const browser=await chromium.launch({channel:'chrome',headless:process.env.LUMAVORA_HEADED!=='1'});
const context=await browser.newContext({viewport:{width:1024,height:640},acceptDownloads:true}),page=await context.newPage();
const errors=[],checks=[],assets=[],images=[],legs=[],transactions=[],rekeys=[],lifecycle=[],observations=[],shots=[];
const frozenWorlds=new Map(); let allowWreck=resumeLoss&&!resumeRepaired, phase='activation',previous=null,performanceSample=null,home=null,frozenHome=null;
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const act=action=>page.locator(`button[data-action="${action}"]:visible`).first().click();
const expedition=s=>s.space.expedition,economy=s=>s.space.economy,outfit=s=>s.space.outfit,discoveries=s=>s.space.discoveries;
const battle=s=>s.space.combat.battles.at(-1),activeWorld=s=>expedition(s).worlds.find(w=>w.id===s.space.location?.planetId);
const summary=w=>({id:w.id,elapsed:w.elapsed,population:w.life.length,stableFor:w.biosphere.stableFor});
const homeKeys=['stage','tick','seed','player','campaign','world','tribe','machines','planet','homePlanet','lineageHistory','cities','states','military','maritime','commerce','mobilization'];
const homePublic=s=>Object.fromEntries(homeKeys.filter(k=>Object.hasOwn(s,k)).map(k=>[k,s[k]]));
function homeExport(s){const v=structuredClone(s);delete v.id;delete v.space;if(v.checkpoint){v.checkpoint=JSON.parse(v.checkpoint);delete v.checkpoint.id;}return v;}
function intact(s){
 assert.deepEqual(errors,[]);assert.equal(s.deathReason,null);assert.ok(s.player.health>0&&(s.space.ship.health>0||allowWreck));
 const p=s.space,e=economy(s),l=e.ledger;assert.equal(e.version,7);assert.equal(discoveries(s).version,1);
 assert.equal(e.balance,l.deposits+l.revenue-l.construction-l.upgrades-l.repairs-l.charging-l.equipment-l.alliance-l.territory-l.patronage);
 for(const k of ['id','creation','purchase'])assert.deepEqual(p.ship[k],original.space.ship[k]);
 for(const k of ['empires','outfit','wars','discoveries'])assert.deepEqual(p[k],original.space[k]);
 assert.deepEqual(e.colonies.map(c=>[c.id,c.paid,c.level,c.upgraded,c.permission,c.militaryPermission]),original.space.economy.colonies.map(c=>[c.id,c.paid,c.level,c.upgraded,c.permission,c.militaryPermission]));
 assert.deepEqual(e.actions.slice(0,original.space.economy.actions.length),original.space.economy.actions);
 assert.deepEqual(p.expedition.cargo,original.space.expedition.cargo);assert.deepEqual(e.cargo,original.space.economy.cargo);
 assert.deepEqual(p.events.current.totals,original.space.events.current.totals);assert.equal(p.events.candidate,null);
 const newBattles=p.combat.battles.filter(b=>b.serial>original.space.combat.archive.battles+original.space.combat.battles.length);
 assert.equal(p.combat.version,3);assert.equal(p.core.version,1);assert.deepEqual(p.core.legacyWorlds,[]);
 assert.equal(p.ship.health,original.space.ship.health+l.healthRestored-original.space.economy.ledger.healthRestored-newBattles.reduce((n,b)=>n+b.damage,0)+newBattles.filter(b=>b.rescue?.completedAt!=null).length*25);
 assert.ok(newBattles.every(b=>b.kind==='warden'));for(const b of newBattles)assert.equal(b.enemy.health,Math.max(0,108-b.shots*12));
 for(const [id,w]of frozenWorlds)assert.deepEqual(expedition(s).worlds.find(v=>v.id===id),w,`Inactive world changed ${id}`);
 if(frozenHome){assert.ok(p.location,'Unexpected forced home return');assert.deepEqual(homePublic(s),frozenHome);}
}
const check=text=>{checks.push(text);console.log(text);};
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
async function shot(name, selector = '#space-core') {
  assert.ok(images.length < 5); await frames(6); if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
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
  await detail('space-star-map');
  const current=(await read()).space.location.systemId;
  // The sorted map can lag one HUD frame behind the completed physical arrival.
  await page.waitForFunction(id=>!document.querySelector(`button[data-action="space-jump:${id}"]`),current);
  const label=new RegExp(`^${index===0?'⌂':index} ·`);
  const row=page.locator('.space-star-list > section').filter({has:page.locator('b').filter({hasText:label})});
  assert.equal(await row.count(),1);return row;
}

async function jump(index, rekey = false) {
  const row = await mapRow(index), text = await row.innerText(), mapText = await page.locator('#space-star-map').innerText();
  const quote = text.match(/(?:^|\n)(\d+(?:\.\d+)?) · (\d+) energie/); assert.ok(quote, text);
  const distance = Number(quote[1]), price = Number(quote[2]); assert.match(mapText, /Dosah lodi 32/);
  const action = await row.locator('button').getAttribute('data-action'), button = page.locator(`button[data-action="${action}"]`); assert.ok(action.startsWith('space-jump:'));
  await until('Solar energy for published jump price', s => s.space.ship.energy >= price);
  assert.equal(await button.isDisabled(), false, await row.innerText());
  const before = await read(); await button.click(); const during = await until('Interstellar leg', s => !!s.space.leg);
  assert.equal(during.space.leg.duration, 6); assert.equal(during.space.leg.energyPaid, price); const target = during.space.leg.to.systemId;
  assert.equal(target, action.slice('space-jump:'.length)); await detail('space-star-map', false);
  if (rekey) await checkpoint('pending-core-flight');
  const after = await until('Interstellar arrival', s => !s.space.leg && s.space.location.systemId === target); assert.ok(after.space.elapsed - before.space.elapsed >= 6);
  const flight = {from: before.space.location, to: after.space.location, duration: 6, paid: price, publicDistance: distance, publicQuote: text, cargo: economy(before).cargo, installed: outfit(before).purchases.map(p => p.equipment)};
  legs.push(flight); observations.push({kind: 'physical-jump', ...flight}); return after;
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

async function checkpoint(label){
 const before=await exported(`${label}.save.json`);
 const actions=await page.locator('button[data-action^="delete:"]:visible').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-action')));
 for(const a of actions)if(a!==`delete:${before.value.state.id}`)await act(a);
 await importCampaign(path.join(out,`${label}.save.json`));const after=await exported();
 assert.notEqual(before.value.state.id,after.value.state.id);assert.equal(JSON.parse(after.value.state.checkpoint).id,after.value.state.id);
 for(const k of ['core','discoveries','empires','outfit','wars'])assert.deepEqual(after.value.state.space[k],before.value.state.space[k]);
 const aEvents=after.value.state.space.events,bEvents=before.value.state.space.events;
 for(const key of ['version','activated','archive','actions','nextAction','current','candidate'])assert.deepEqual(aEvents[key],bEvents[key]);
 for(const old of bEvents.watches){const now=aEvents.watches.find(w=>w.colonyId===old.colonyId);assert.ok(now.observedElapsed>=old.observedElapsed);assert.equal(now.unstableFor,old.unstableFor);}
 for(const k of ['balance','ledger','counts','actions','nextAction','cargo'])assert.deepEqual(after.value.state.space.economy[k],before.value.state.space.economy[k]);
 if(before.value.state.space.leg){const a=before.value.state.space,b=after.value.state.space;assert.deepEqual(b.leg.passage,a.leg.passage);assert.ok(b.leg.elapsed>=a.leg.elapsed&&b.leg.elapsed<a.leg.duration);assert.equal(b.ship.energy,a.ship.energy);assert.deepEqual(b.expansion,a.expansion);}
 assert.deepEqual(homeExport(after.value.state),homeExport(before.value.state));rekeys.push({label,path:path.join(out,`${label}.save.json`),sha256:before.sha256});await resume();return before;
}
async function wormhole(rekey=false){
 await detail('space-discoveries');await until('Wormhole energy',s=>s.space.ship.energy>=14);const before=await read();
 await act(`space-wormhole:${discoveries(before).nextAction}`);const during=await until('Paid wormhole starts',s=>!!s.space.leg);
 assert.equal(during.space.leg.energyPaid,14);assert.equal(during.space.leg.duration,6);assert.equal(during.space.leg.passage.kind,'wormhole');const to=during.space.leg.to.planetId;
 if(rekey)await checkpoint('pending-wormhole');
 const after=await until('Actual wormhole arrival',s=>!s.space.leg&&s.space.location.planetId===to);
 assert.equal(after.space.log.at(-1).passage.kind,'wormhole');legs.push({kind:'wormhole',from:before.space.location,to:after.space.location,paid:14,duration:6});
}
async function returnHome(){
 await gotoIndex(22,'system');await wormhole();await gotoIndex(0,'surface');
 const saved=await exported();assert.deepEqual(homeExport(saved.value.state),home);await resume();frozenHome=null;
 await page.locator('.space-heading h2').click();await page.keyboard.press('v');await until('Physical home docking',s=>s.space.location===null);console.log('Physical home docked');await detail('space-dock');
}
async function measure(){
 await near({x:0,z:0});performanceSample={frames:stats(await frames()),render:(await read()).render,location:(await read()).space.location};
 for(let i=0;i<4;i++){
  await hold('q','Ascend for scene lifecycle',s=>s.space.location.pos.y>=21);await scale('r','orbit');await frames(4);const baseline=resources(await read());
  await scale('v','surface');await frames(4);const surfaceResources=resources(await read());await hold('q','Ascend after scene reload',s=>s.space.location.pos.y>=21);await scale('r','orbit');await frames(4);const returned=resources(await read());
  assert.equal(returned.geometries,baseline.geometries);assert.equal(returned.textures,baseline.textures);lifecycle.push({baseline,surface:surfaceResources,returned});await scale('v','surface');await hold('c','Service height',s=>s.space.location.pos.y<=2.8);
 }
}

const distance3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
async function coreOrder(kind){
 await detail('space-core');const before=await read(),n=before.space.core.nextAction;
 const button=page.locator(`button[data-action="space-core:${kind}|${n}"]`);assert.equal(await button.isDisabled(),false,await page.locator('#space-core').innerText());await button.click();
 const after=await until(kind,s=>kind==='challenge'?battle(s)?.kind==='warden'&&!battle(s).end:s.space.core.nextAction===n+1);
 observations.push({kind:'core-order',order:kind,action:kind==='challenge'?battle(after):after.space.core.actions.at(-1)});console.log('Core order',kind);return after;
}
async function pulse(){
 await until('Real pulse range, cadence and energy',s=>!battle(s).end&&s.space.ship.energy>=3&&distance3(s.space.location.pos,battle(s).enemy.pos)<=24&&(!battle(s).lastShot||s.space.elapsed-battle(s).lastShot.at>=.65+1e-7),30000,25);
 const before=await read(),n=battle(before).shots;await page.locator('.space-heading h2').click();await page.keyboard.press('Space');
 const after=await until('One actual paid pulse',s=>battle(s).shots===n+1,10000,20),dt=after.space.elapsed-before.space.elapsed;
 assert.equal(battle(after).enemy.health,battle(before).enemy.health-12);
 const transferred=after.space.expansion.allies[0].delivered-before.space.expansion.allies[0].delivered;
 assert.ok(after.space.ship.energy<=Math.min(105,before.space.ship.energy-3+4.82*dt+transferred)+1e-6);
 shots.push({shot:n+1,lastShot:battle(after).lastShot,beforeEnergy:before.space.ship.energy,afterEnergy:after.space.ship.energy,dt,transferred});console.log('Warden pulse',n+1);return after;
}
async function prepare(){
 await importCampaign(source);const activated=await exported(),p=activated.value.state.space;
 assert.equal(p.core.nextAction,1);assert.equal(p.combat.version,3);
 for(const k of ['empires','outfit','wars','events','discoveries'])assert.deepEqual(p[k],original.space[k]);
 if(!branch)for(const k of ['ship','expedition','expansion'])assert.deepEqual(p[k],original.space[k]);
 else {assert.deepEqual(p.expedition.actions,original.space.expedition.actions);assert.equal(p.expedition.nextAction,original.space.expedition.nextAction);}
 assert.deepEqual(p.combat.battles,original.space.combat.battles);for(const k of ['wardenVictories','wardenRetreats','wardenDefeats'])assert.equal(p.combat.archive[k],0);
 await resume();
 if(!branch){await detail('space-dock');await act('space-launch');await until('Launch',s=>s.space.location?.scale==='surface');}
 const dep=await exported('departure.save.json');home=homeExport(dep.value.state);frozenHome=homePublic(await read());
 for(const w of p.expedition.worlds)if(w.id!==p.location?.planetId)frozenWorlds.set(w.id,structuredClone(w));await resume();
 if(!branch){await gotoIndex(5,'system');await wormhole();}await gotoIndex(23,'system');
 const blocked=await mapRow(31),text=await blocked.innerText();assert.match(text,/Tichý val/);assert.match(text,/Nejprve vyřeš průchod/);assert.equal(await blocked.locator('button').isDisabled(),true);
 observations.push({kind:'actual-blocked-core',publicQuote:text});await detail('space-star-map',false);await scale('v','orbit');await coreOrder('contact');
}
async function recoverPlayedLoss(){
 const file=path.join(out,resumeRepaired?'paid-recovery-continuation.save.json':'harness-timeout-wreck.save.json'), bytes=await readFile(file), saved=JSON.parse(bytes).state;
 assert.equal(hash(bytes),resumeRepaired?'aa6ddadf326ab6e5895f793cda5f0ea12a5bf8bbddaaf1a657103b73cf5cca8c':'802f2403332b4060b7f327e7e08cbf16801c3e4dbc07861f41a03fdb0f985503');
 await importCampaign(file);home=homeExport(saved);frozenHome=homePublic(await read());for(const w of saved.space.expedition.worlds)if(w.id!==saved.space.location?.planetId||saved.space.location.scale!=='surface')frozenWorlds.set(w.id,structuredClone(w));
 assert.equal(battle(await read()).end.outcome,'lost');if(!resumeRepaired){await act('space-rescue');await until('Twelve real seconds of rescue',s=>s.space.ship.health===25,30000);allowWreck=false;
 assert.ok(battle(await read()).rescue.completedAt-battle(await read()).rescue.startedAt>=12-1e-6);
 await gotoIndex(22,'system');await wormhole();await gotoIndex(4,'surface');await near({x:0,z:0});
 for(let i=0;i<2;i++){
  await detail('space-economy');const before=await read(),n=economy(before).nextAction;await act(`space-economy:repair|${n}`);
  const after=await until('Paid real colony repair',s=>economy(s).nextAction===n+1),receipt=economy(after).actions.at(-1);assert.equal(receipt.kind,'repair');assert.equal(receipt.paid,5);assert.equal(receipt.after-receipt.before,40);transactions.push(receipt);
 }
 }else transactions.push(...saved.space.economy.actions.filter(a=>a.serial>=original.space.economy.nextAction&&a.kind==='repair'));
 assert.equal((await read()).space.ship.health,105);assert.equal(economy(await read()).balance,298);await checkpoint(resumeRepaired?'verified-paid-recovery':'paid-warden-recovery');
 await gotoIndex(5,'system');await wormhole();await gotoIndex(23,'orbit');
 observations.push({kind:'actual-loss-recovery',source:file,sha256:hash(bytes),repairs:transactions});
 check('Continued the exact unedited harness-loss save: actual12s rescue25, two paid colony repairs40/5, physical return to23, no rewind or health grant');
}
async function gainAccess(){
 if(!branch){await shot('frontier-diplomacy-1024');await coreOrder('diplomacy');assert.equal((await read()).space.core.actions.at(-1).strategy,'diplomacy');}
 else{
  await detail('space-core');assert.equal(await page.locator('button[data-action^="space-core:diplomacy|"]').isDisabled(),true);
  assert.ok(!(await read()).space.discoveries.actions.some(a=>a.kind==='support'));
  await until('Actual battle rest and solar charge',s=>s.space.ship.energy>=35&&s.space.elapsed>=battle(s).end.at+90.02,150000);
  await shot('frontier-alternatives-1024');await coreOrder('challenge');await pulse();await pulse();await checkpoint('warden-two-pulses');
  await shot('actual-warden-1024','#space-combat');
  while(!battle(await read()).end)await pulse();const s=await read();assert.equal(battle(s).end.outcome,'won');assert.equal(battle(s).shots,9);assert.equal(s.space.core.actions.at(-1).strategy,'force');
  assert.equal(economy(s).balance,original.space.economy.balance-(economy(s).ledger.repairs-original.space.economy.ledger.repairs));assert.ok(s.space.ship.health<battle(s).startingHealth);
  observations.push({kind:'actual-warden-win',battle:battle(s),access:s.space.core.actions.at(-1)});
 }
 await checkpoint('earned-core-access');
 check(branch?'Actual nine-shot guardian victory with damage, no diplomatic recommendation, no ownership or cash grant':'Actual D4 recommendation accepted personally at frontier23; all inner worlds opened');
}
async function encounter(){
 await scale('r','system');await jump(31,true);await surface();
 assert.ok(!(await read()).space.core.actions.some(a=>a.kind==='encounter'));
 await near({x:9,z:-8});await coreOrder('encounter');await checkpoint('received-core-gift');await detail('space-core');await shot('heart-encounter-1024');
 check('Physical flight into31, pending public rekey, real surface approach and one personal gift; arrival alone did not grant it');
}
async function plantRoot(){
 await gotoIndex(24,'surface');await near({x:0,z:0});await until('Actual solar energy for root',s=>s.space.ship.energy>=35);
 const before=await read(),w=activeWorld(before);assert.equal(w.life.length,0);assert.ok(Math.abs(w.temperature)>.1||Math.abs(w.atmosphere)>.1);
 await coreOrder('root');const after=await read(),root=after.space.core.actions.at(-1),planted=activeWorld(after);
 assert.equal(root.energyPaid,30);assert.deepEqual(root.work,planted.biosphere.work);assert.equal(planted.temperature,0);assert.equal(planted.atmosphere,0);assert.equal(planted.life.length,0);
 assert.ok(after.space.ship.energy<=before.space.ship.energy-30+6.82*(after.space.elapsed-before.space.elapsed)+1e-6);
 observations.push({kind:'actual-root-payment',before:{energy:before.space.ship.energy,temperature:w.temperature,atmosphere:w.atmosphere,work:w.biosphere.work},after:{energy:after.space.ship.energy,temperature:planted.temperature,atmosphere:planted.atmosphere},root});
 await checkpoint('planted-root');await until('Fifteen real seconds of anchored climate',s=>activeWorld(s).elapsed>=root.localAt+15);
 const stable=activeWorld(await read());assert.equal(stable.temperature,0);assert.equal(stable.atmosphere,0);assert.deepEqual(stable.biosphere.work,root.work);assert.equal(stable.life.length,0);assert.deepEqual(stable.biosphere.stableFor,[0,0,0]);
 await detail('space-core');assert.equal(await page.locator('button[data-action^="space-core:root|"]').isDisabled(),true);await shot('anchored-planet-1024');
 if(!branch)await measure();check('Root paid30 real energy, climate0/0 survived public import and15 native seconds, no life or artificial stability, repeated use disabled');
}
async function nextExpedition(){
 await detail('space-dock');await act('space-launch');await until('Second launch after real docking',s=>s.space.location?.scale==='surface');
 console.log('Second physical launch');const dep=await exported();home=homeExport(dep.value.state);frozenHome=homePublic(await read());await resume();
 await gotoIndex(5,'system');await wormhole();await gotoIndex(24,'surface');
 const s=await read(),w=activeWorld(s);assert.equal(w.temperature,0);assert.equal(w.atmosphere,0);assert.equal(w.life.length,0);assert.ok(s.space.core.actions.some(a=>a.kind==='root'&&a.planetId===w.id));
 await detail('space-core');assert.equal(await page.locator('button[data-action^="space-core:root|"]').isDisabled(),true);await returnHome();
 check('After physical home docking, another ordinary expedition revisited the saved anchored planet, then returned home again');
}
try{
 if(resumeLoss){phase='real wreck recovery';await recoverPlayedLoss();}else await prepare();phase='access';await gainAccess();phase='core encounter';await encounter();phase='real reward use';await plantRoot();phase='home return';await returnHome();
 if(!branch){phase='next expedition';await nextExpedition();await detail('space-core');await shot('returned-core-1024');}
 const filename=branch?'force-campaign.save.json':'active-campaign.save.json',final=await exported(filename),s=await read();intact(s);assert.equal(hash(await readFile(source)),sourceHash);if(branch)assert.equal(hash(await readFile(canonical)),canonicalBefore);
 await writeFile(path.join(out,'result.json'),JSON.stringify({branch,resumeLoss,resumeRepaired,checks,errors,transactions,source:{path:source,sha256:sourceHash},assets,observations,rekeys,legs,shots,lifecycle,performance:performanceSample,images,core:s.space.core,account:economy(s),ship:s.space.ship,events:s.space.events.current.totals,forcedHomeReturns:0,voluntaryHomeReturns:branch?1:2,final:{path:path.join(out,filename),sha256:final.sha256},canonicalPreserved:canonicalBefore,disk:{before:diskBefore,after:await disk()},provenance:'Exact played D4 continuation using ordinary UI/native RAF; no setters, injected clocks, grants or edited payloads. Does not claim a fresh cell-to-core campaign or human visual/audio acceptance.'},null,2));
 console.log('D5 route completed',final.sha256);
}catch(error){
 console.error('Original failure',phase,error);await writeFile(path.join(out,'failure.json'),JSON.stringify({phase,error:String(error),stack:error.stack,errors,checks,assets,observations,rekeys,legs,shots,images,state:await read().catch(()=>null)},null,2));
 try{await exported('failure-campaign.save.json');}catch(e){console.error('Recovery export failed',String(e));}process.exitCode=1;
}finally{await context.close();await browser.close();console.log('Browser close completed');}
