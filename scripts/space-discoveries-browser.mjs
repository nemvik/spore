/** D4 genuine continuation: local relics, paid wormhole, young society and return.
 * Only public controls/import/export and read-only text telemetry; native RAF.
 * --ecology is a separate branch from the exact shared-workshop export. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const branch = process.argv.includes('--ecology');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const rootOut = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-014d4/browser'), out = branch ? path.join(rootOut, 'ecology-branch') : rootOut;
const source = path.resolve('tests/fixtures/space/native-d3c-campaign.save.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceBytes = await readFile(source), sourceHash = hash(sourceBytes), original = JSON.parse(sourceBytes).state;
assert.equal(sourceHash, '3acb977ae01fc9be5192207cefeb9d0e1ee96ab2ca406405a5cc99f94797a5c1');
assert.ok(process.env.LUMAVORA_ASSET); assert.equal(new URL(base).searchParams.has('test'), false);
const canonical = path.join(rootOut, 'active-campaign.save.json'), canonicalBefore = branch ? hash(await readFile(canonical)) : null;
await mkdir(out, {recursive:true}); const disk = async () => {const d=await statfs(out);return d.bavail*d.bsize;}, diskBefore=await disk();
console.log(`D4 ${branch ? 'ecological branch' : 'main'} public UI; ${(diskBefore/1024**3).toFixed(2)} GiB free`);
const browser=await chromium.launch({channel:'chrome',headless:process.env.LUMAVORA_HEADED!=='1'});
const context=await browser.newContext({viewport:{width:1024,height:640},acceptDownloads:true}),page=await context.newPage();
const errors=[],checks=[],assets=[],images=[],legs=[],transactions=[],rekeys=[],lifecycle=[],observations=[],biologicalActions=[];
const frozenWorlds=new Map(); let phase='activation',previous=null,performanceSample=null,home=null,frozenHome=null;
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
 assert.deepEqual(errors,[]);assert.equal(s.deathReason,null);assert.ok(s.player.health>0&&s.space.ship.health>0);
 const p=s.space,e=economy(s),l=e.ledger;assert.equal(e.version,7);assert.equal(discoveries(s).version,1);
 assert.equal(e.balance,l.deposits+l.revenue-l.construction-l.upgrades-l.repairs-l.charging-l.equipment-l.alliance-l.territory-l.patronage);
 for(const k of ['id','creation','purchase'])assert.deepEqual(p.ship[k],original.space.ship[k]);
 for(const k of ['empires','outfit','wars'])assert.deepEqual(p[k],original.space[k]);
 assert.deepEqual(e.colonies.map(c=>[c.id,c.paid,c.level,c.upgraded,c.permission,c.militaryPermission]),original.space.economy.colonies.map(c=>[c.id,c.paid,c.level,c.upgraded,c.permission,c.militaryPermission]));
 assert.deepEqual(e.actions.slice(0,original.space.economy.actions.length),original.space.economy.actions);
 assert.deepEqual(p.expedition.cargo,original.space.expedition.cargo);assert.deepEqual(e.cargo,original.space.economy.cargo);
 assert.deepEqual(p.events.current.totals,original.space.events.current.totals);assert.equal(p.events.candidate,null);
 assert.equal(p.ship.health,original.space.ship.health+l.healthRestored-original.space.economy.ledger.healthRestored);
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
async function shot(name, selector = '#space-discoveries') {
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

async function jump(index) {
  const row = await mapRow(index), text = await row.innerText(), mapText = await page.locator('#space-star-map').innerText();
  const quote = text.match(/(?:^|\n)(\d+(?:\.\d+)?) · (\d+) energie/); assert.ok(quote, text);
  const distance = Number(quote[1]), price = Number(quote[2]); assert.match(mapText, /Dosah lodi 32/);
  const action = await row.locator('button').getAttribute('data-action'), button = page.locator(`button[data-action="${action}"]`); assert.ok(action.startsWith('space-jump:'));
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

async function discover(kind,id){
 await detail('space-discoveries');const before=await read(),n=discoveries(before).nextAction;
 await act(`space-discovery:${kind}|${n}${id?`|${id}`:''}`);
 const after=await until(kind,s=>discoveries(s).nextAction===n+1);observations.push({kind:'discovery',action:discoveries(after).actions.at(-1)});return after;
}
async function checkpoint(label){
 const before=await exported(`${label}.save.json`);
 const actions=await page.locator('button[data-action^="delete:"]:visible').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-action')));
 for(const a of actions)if(a!==`delete:${before.value.state.id}`)await act(a);
 await importCampaign(path.join(out,`${label}.save.json`));const after=await exported();
 assert.notEqual(before.value.state.id,after.value.state.id);assert.equal(JSON.parse(after.value.state.checkpoint).id,after.value.state.id);
 for(const k of ['discoveries','empires','outfit','wars','events'])assert.deepEqual(after.value.state.space[k],before.value.state.space[k]);
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
 await page.locator('.space-heading h2').click();await page.keyboard.press('v');await until('Physical home docking',s=>s.space.location===null);await detail('space-dock');
}
async function measure(){
 await near({x:0,z:0});performanceSample={frames:stats(await frames()),render:(await read()).render,location:(await read()).space.location};
 for(let i=0;i<4;i++){
  await hold('q','Ascend for scene lifecycle',s=>s.space.location.pos.y>=21);await scale('r','orbit');await frames(4);const baseline=resources(await read());
  await scale('v','surface');await frames(4);const surfaceResources=resources(await read());await hold('q','Ascend after scene reload',s=>s.space.location.pos.y>=21);await scale('r','orbit');await frames(4);const returned=resources(await read());
  assert.equal(returned.geometries,baseline.geometries);assert.equal(returned.textures,baseline.textures);lifecycle.push({baseline,surface:surfaceResources,returned});await scale('v','surface');await hold('c','Service height',s=>s.space.location.pos.y<=2.8);
 }
}
async function mainRoute(){
 await importCampaign(source);const activated=await exported(),p=activated.value.state.space;
 assert.equal(p.discoveries.nextAction,1);for(const k of ['ship','expedition','empires','outfit','expansion','combat','wars','events'])assert.deepEqual(p[k],original.space[k]);
 assert.equal(p.economy.balance,308);assert.equal(p.economy.ledger.patronage,0);await resume();await detail('space-dock');await act('space-launch');await until('Launch',s=>s.space.location?.scale==='surface');
 const dep=await exported('departure.save.json');home=homeExport(dep.value.state);frozenHome=homePublic(await read());for(const w of p.expedition.worlds)frozenWorlds.set(w.id,structuredClone(w));await resume();
 phase='first relic';await gotoIndex(5,'surface');await near({x:12,z:-12});await discover('relic','passage');await shot('passage-relic-1024');await ascend();
 await shot('unlocked-wormhole-1024');phase='actual wormhole with pending import';await wormhole(true);
 phase='memory and society';await gotoIndex(20,'surface');await near({x:-13,z:10});await discover('relic','memory');
 await gotoIndex(19,'surface');await near({x:7,z:8});await discover('contact');await discover('share');await checkpoint('shared-workshop');
 phase='paid patronage and service';await discover('accept-patronage');await discover('support');await economyAction('repair');assert.equal((await read()).space.ship.health,115);assert.equal(economy(await read()).balance,263);
 await checkpoint('paid-cooperation');await detail('space-discoveries');await shot('society-service-1024');await measure();
 phase='return through actual passage';await returnHome();await detail('space-discoveries');await shot('returned-discoveries-1024');
 check('Both local relics, paid six-second passage both ways, public pending import, visible cooperation, patronage40 and real repair5, original ship and actual home return');
 return exported('active-campaign.save.json');
}
async function ecologicalRoute(){
 const file=path.join(rootOut,'shared-workshop.save.json'),saved=JSON.parse(await readFile(file)).state;
 await importCampaign(file);home=homeExport(saved);frozenHome=homePublic(await read());for(const w of saved.space.expedition.worlds)if(w.id!==saved.space.discoveries.society.planetId)frozenWorlds.set(w.id,structuredClone(w));
 phase='independent ecological aid';await near({x:7,z:8});await discover('accept-ecology');
 const roles=[...new Set(activeWorld(await read()).life.map(l=>l.taxonKey))];assert.equal(roles.length,6);
 for(const role of roles){
  const life=activeWorld(await read()).life.find(l=>l.taxonKey===role);await near(life.pos);await detail('space-biology');await page.locator('#space-specimen').selectOption(life.id);
  const before=await read(),serial=expedition(before).nextAction;await act(`space-scan:${life.id}`);const after=await until('Actual local paid role scan',s=>expedition(s).actions.some(r=>r.serial>=serial&&r.kind==='scan'&&r.lifeId===life.id));biologicalActions.push(expedition(after).actions.find(r=>r.serial>=serial&&r.kind==='scan'&&r.lifeId===life.id));
 }
 await near({x:7,z:8});await until('Natural first band stabilises',s=>activeWorld(s).biosphere.stableFor[0]>=10);await discover('support');
 assert.equal(discoveries(await read()).scans.length,6);assert.equal(economy(await read()).ledger.patronage,0);await economyAction('repair');assert.equal(economy(await read()).balance,303);
 await checkpoint('ecological-cooperation');await detail('space-discoveries');await shot('ecological-service-1024');await returnHome();
 assert.equal(hash(await readFile(canonical)),canonicalBefore);check('Independent ecology: six new paid role scans, stable local ecosystem, no patronage payment, real repair5 and actual return; main campaign preserved');
 return exported('ecology-campaign.save.json');
}
try{
 const final=await(branch?ecologicalRoute():mainRoute()),s=await read();intact(s);assert.equal(hash(await readFile(source)),sourceHash);
 await writeFile(path.join(out,'result.json'),JSON.stringify({branch,checks,errors,source:{path:source,sha256:sourceHash},assets,observations,rekeys,legs,transactions,biologicalActions,lifecycle,performance:performanceSample,images,discoveries:discoveries(s),account:economy(s),ship:s.space.ship,events:s.space.events.current.totals,forcedHomeReturns:0,final:{path:path.join(out,branch?'ecology-campaign.save.json':'active-campaign.save.json'),sha256:final.sha256},canonicalPreserved:canonicalBefore,disk:{before:diskBefore,after:await disk()},provenance:'Exact played D3c continuation using ordinary UI/native RAF; no setters, injected clocks, grants or edited payloads. This slice does not claim a new cell-to-core campaign or human visual/audio acceptance.'},null,2));
}catch(error){
 console.error('Original failure',phase,error);await writeFile(path.join(out,'failure.json'),JSON.stringify({phase,error:String(error),stack:error.stack,errors,checks,assets,observations,rekeys,legs,transactions,images,state:await read().catch(()=>null)},null,2));
 try{await exported('failure-campaign.save.json');}catch(e){console.error('Recovery export failed',String(e));}process.exitCode=1;
}finally{await context.close();await browser.close();console.log('Browser close completed');}
