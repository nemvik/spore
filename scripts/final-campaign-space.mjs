/** Continue the fresh lineage in its owned production browser.
 * Actual keyboard/UI, native RAF, public exports; no imported game functions,
 * injected progress, replacement campaign, storage writes or debug clock.
 */
import assert from 'node:assert/strict';
import {appendFile,mkdir,readFile,writeFile,unlink,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
const phase=process.argv[2]??'status',root=path.resolve('evidence/final-campaign'),out=path.join(root,'space');await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));assert.ok(page);page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const world=s=>s.space.expedition.worlds.find(w=>w.id===s.space.location?.planetId);
const roles=['culture:7','culture:8','culture:6','species:bell','species:gnaw','species:crest'];
const counts=w=>[1,2,3].map(band=>roles.map(role=>w.life.filter(l=>l.habitat.band===band&&l.taxonKey===role).length));
const capacity=w=>{let n=0;for(const seconds of w.biosphere.stableFor){if(seconds<10-1e-8)break;n++;}return n;};
const compact=s=>({stage:s.stage,mode:s.mode,tick:s.tick,homeAmber:s.machines?.resource,elapsed:s.space?.elapsed,
  location:s.space?.location,leg:s.space?.leg,ship:s.space?.ship&&{health:s.space.ship.health,energy:s.space.ship.energy,purchase:s.space.ship.purchase},
  cargo:s.space?.expedition.cargo.map(l=>({id:l.id,key:l.taxonKey,origin:l.originPlanetId,birth:l.habitat?.birth})),
  worlds:s.space?.expedition.worlds.map(w=>({id:w.id,time:w.elapsed,temperature:w.temperature,atmosphere:w.atmosphere,population:w.life.length,counts:counts(w),stable:capacity(w)})),
  economy:s.space?.economy,notice:s.space?.notice,deathReason:s.deathReason});
async function log(event,extra={}){const value={event,wall:new Date().toISOString(),...compact(await read()),...extra};await appendFile(path.join(out,'segments.jsonl'),JSON.stringify(value)+'\n');console.log(JSON.stringify(value));}
async function action(name){const b=page.locator(`button[data-action="${name}"]:visible`).first();assert.equal(await b.isDisabled(),false,`Disabled ${name}: ${await b.getAttribute('title')}`);await b.click();}
async function detail(id,open=true){const d=page.locator('#'+id);if((await d.getAttribute('open')!==null)!==open)await d.locator(':scope > summary').press('Enter');}
async function pause(){if((await read()).mode==='game')await action('pause');}
async function resume(){if((await read()).mode==='pause')await action('close');assert.equal((await read()).mode,'game');}
async function until(predicate,label,seconds=120){const start=Date.now();let last=start;while(Date.now()-start<seconds*1000){const s=await read();assert.equal(s.mode,'game',label);assert.equal(s.deathReason,null);assert.deepEqual(errors,[]);if(await predicate(s))return s;if(Date.now()-last>20000){await log('native-progress',{label});last=Date.now();}await page.waitForTimeout(80);}throw Error('Native timeout: '+label);}
async function exported(name){
  await pause();const response=await fetch(`http://127.0.0.1:${process.env.FRESH_CONTROL_PORT??9225}`,{method:'POST',body:JSON.stringify({command:'export',args:{name}})});assert.ok(response.ok,await response.text());
  const source=path.join(root,'organism',name+'.save.json'),bytes=await readFile(source),target=path.join(out,name+'.save.json');
  try{const old=await readFile(target);if(!old.equals(bytes))await appendFile(path.join(root,'replaced-artifacts.jsonl'),JSON.stringify({at:new Date().toISOString(),file:path.relative(root,target),previousSHA256:createHash('sha256').update(old).digest('hex'),replacementSHA256:createHash('sha256').update(bytes).digest('hex'),reason:'Later public continuation export replaces this named waypoint; earlier log hash is historical.'})+'\n');}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(target,bytes);await writeFile(path.join(root,'organism/active-campaign.save.json'),bytes);await unlink(source);
  await log('public-export',{file:name+'.save.json',sha256:createHash('sha256').update(bytes).digest('hex'),errors});
}
async function scene(name){
  const frames=await page.evaluate(()=>new Promise(resolve=>{const v=[];let last;function sample(t){if(last!==undefined)v.push(t-last);last=t;if(v.length===90)resolve(v);else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
  await page.screenshot({path:path.join(out,name+'.png')});frames.sort((a,b)=>a-b);await writeFile(path.join(out,name+'-performance.json'),JSON.stringify({nativeRAF:true,frames:90,p50:frames[45],p95:frames[85],maximum:frames.at(-1),render:(await read()).render},null,2));await log('scene',{name,p95:frames[85]});
}
async function hold(key,predicate,label){await page.locator('.space-heading h2').click();await page.keyboard.down(key);try{return await until(predicate,label);}finally{await page.keyboard.up(key);}}
async function near(point,tolerance=1.6){
  await page.locator('.space-heading h2').click();const start=Date.now();while(Date.now()-start<90000){
    const s=await read(),p=s.space.location.pos,dx=point.x-p.x,dz=point.z-p.z;if(Math.hypot(dx,dz)<=tolerance)return;
    const yaw=s.camera.yaw,x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw),key=Math.abs(x)>Math.abs(z)?x>0?'d':'a':z>0?'s':'w';
    await page.keyboard.down(key);try{await page.waitForTimeout(Math.min(140,Math.max(20,Math.hypot(dx,dz)*12)));}finally{await page.keyboard.up(key);}
  }throw Error('Native ship approach timed out');
}
async function scale(direction,target){
  await until(s=>s.space.ship.energy>=4,'energy for scale');const before=await read();await action('space-'+direction);
  const during=await until(s=>!!s.space.leg,'scale starts');assert.equal(during.space.leg.to.scale,target);
  const after=await until(s=>!s.space.leg&&s.space.location?.scale===target,'scale arrives');await log('actual-scale',{from:before.space.location,to:after.space.location,paid:during.space.leg.energyPaid});
}
async function system(){let s=await read();if(s.space.location.scale==='surface'){if(s.space.location.pos.y<21)await hold('q',v=>v.space.location.pos.y>=21,'real surface ascent');await scale('up','orbit');}s=await read();if(s.space.location.scale==='orbit')await scale('up','system');await near({x:0,z:0});}
async function surface(){let s=await read();await near({x:0,z:0});if(s.space.location.scale==='system')await scale('down','orbit');s=await read();if(s.space.location.scale==='orbit')await scale('down','surface');if((await read()).space.location.pos.y>2.8)await hold('c',v=>v.space.location.pos.y<=2.8,'real low approach');}
async function starRow(index){
  await detail('space-star-map');
  // Nearest-first ordering changes on arrival. Match the visible label rather
  // than retaining a collection of positional locators across HUD refreshes.
  const row=page.locator('.space-star-list > section').filter({has:page.locator('b').filter({hasText:new RegExp(`^${index===0?'⌂':index} ·`)})}).first();await row.waitFor({state:'visible'});return row;
}
async function jump(index){
  const row=await starRow(index);
  const b=row.locator('button'),name=await b.getAttribute('data-action');assert.ok(name?.startsWith('space-jump:'));
  await until(async()=>!await b.isDisabled(),'reachable jump '+index,75);await action(name);const during=await until(s=>!!s.space.leg,'jump starts');assert.equal(during.space.leg.duration,6);await detail('space-star-map',false);
  const after=await until(s=>!s.space.leg&&s.space.location.systemId===during.space.leg.to.systemId,'jump arrives');await log('actual-interstellar-jump',{index,paid:during.space.leg.energyPaid,to:after.space.location});
}
async function travel(index){await resume();await system();await jump(index);await surface();}
async function economy(kind,origin){await detail('space-economy');const prefix=`space-economy:${kind}|`;
  const selector=`button[data-action^="${prefix}"]${origin?`[data-action$="|${origin}"]`:''}:visible`,button=page.locator(selector).first();await action(await button.getAttribute('data-action'));
}
async function saveDownload(download,target){
  try{await download.saveAs(target);}catch(error){
    // A second CDP client sees its own artifact directory; the browser owner
    // has the actual file. Recover only this exact completed download UUID.
    const name=path.basename(await download.path());let found;
    for(const dir of await readdir(tmpdir(),{withFileTypes:true})){if(!dir.isDirectory()||!dir.name.startsWith('playwright-artifacts-'))continue;const file=path.join(tmpdir(),dir.name,name);try{await copyFile(file,target);found=file;break;}catch(e){if(e.code!=='ENOENT')throw e;}}
    if(!found)throw error;await log('owner-download-recovered',{file:path.basename(target)});
  }
}
async function ship(){
  let s=await read();if(s.mode!=='ships')await resume();s=await read();assert.equal(s.stage,5);assert.ok(s.civilization.completed);assert.equal(s.space.ship,null);assert.equal(s.space.location,null);
  if(s.mode!=='ships'){await detail('space-dock');await action('ship-open');}
  let design=(await read()).shipStudio.entries.find(e=>e.blueprint.name==='Světlonoška Jasnozrnky');
  if(!design){await action('ship:new');
  async function field(key,value){const i=page.locator(`[data-ship="${key}"]`);await i.fill(String(value));await i.press('Tab');}
  await field('name','Světlonoška Jasnozrnky');await field('scale.x',1.5);await field('scale.z',2.1);await action('ship:select,left');await field('position.x',-2.2);await field('yaw',-25);await action('ship:select,right');await field('position.x',2.2);await field('yaw',25);await action('ship:add,fin');await field('position.y',1.5);await field('position.z',.8);await field('scale.x',.6);
  const draft=(await read()).shipStudio.draft;await action('ship:camera-right');await page.screenshot({path:path.join(out,'own-ship-editor.png')});await action('ship:save');s=await read();design=s.shipStudio.entries.find(e=>e.blueprint.name===draft.name);assert.ok(design);assert.deepEqual(design.blueprint,draft);}
  const pending=page.waitForEvent('download');await action('ship:export,'+design.id);await saveDownload(await pending,path.join(out,'svetlonoska.ship.json'));
  await action('ship:use,'+design.id);await action('ship-confirm');s=await read();assert.deepEqual(s.space.ship.creation,design);assert.equal(s.space.ship.purchase.after,s.space.ship.purchase.before-s.space.ship.purchase.paid);await log('actual-ship-construction',{design,paid:s.space.ship.purchase.paid});
  await detail('space-dock');await detail('space-economy');for(let i=0;i<10;i++)await economy('deposit');assert.equal((await read()).space.economy.balance,200);await exported('31-own-ship-funded');
}
async function launch(name='32-first-launch'){await resume();assert.equal((await read()).space.location,null);await detail('space-dock');await action('space-launch');await until(s=>s.space.location?.scale==='surface','launch');await log('actual-launch');await exported(name);}
async function tool(kind,id,band){
  await until(s=>s.space.ship.energy>=(kind==='scan'?1:2),'life tool energy');const serial=(await read()).space.expedition.nextAction;await action(`space-${kind}:${id}`);
  const after=await until(s=>s.space.expedition.actions.some(a=>a.serial>=serial&&a.kind===kind&&a.lifeId===id),'actual '+kind);const receipt=after.space.expedition.actions.find(a=>a.serial>=serial&&a.kind===kind&&a.lifeId===id);assert.equal(receipt.energyPaid,kind==='scan'?1:2);if(band)assert.equal(receipt.band,band);await log('actual-life-transfer',{receipt});return after;
}
async function gather(){
  await resume();assert.equal((await read()).space.expedition.cargo.length,0);await detail('space-biology');
  await until(s=>counts(world(s)).every(row=>row.every(n=>n>=3))&&capacity(world(s))===3,'actual source offspring',300);
  for(const role of [0,1,2,3,4,3,4,5]){
    const s=await until(s=>world(s).life.some(l=>l.taxonKey===roles[role]&&l.health>=60&&l.nutrition>=.3&&counts(world(s))[l.habitat.band-1][role]>2),'healthy surplus '+roles[role],180),w=world(s),p=s.space.location.pos;
    const candidates=w.life.filter(l=>l.taxonKey===roles[role]&&l.health>=60&&l.nutrition>=.3&&counts(w)[l.habitat.band-1][role]>2).sort((a,b)=>Number(!!b.habitat.birth)-Number(!!a.habitat.birth)||Math.hypot(a.pos.x-p.x,a.pos.z-p.z)-Math.hypot(b.pos.x-p.x,b.pos.z-p.z));
    const life=candidates[0];await page.locator('#space-specimen').selectOption(life.id);await near(life.pos);if(!(await read()).space.expedition.scans.some(v=>v.lifeId===life.id))await tool('scan',life.id);await tool('collect',life.id,life.habitat.band);
  }
  const s=await read();assert.equal(s.space.expedition.cargo.length,8);assert.ok(counts(world(s)).every(row=>row.every(n=>n>=2)));await scene('foreign-living-cargo');await exported('34-living-cargo');
}
async function climate(){
  await resume();await detail('space-climate');const initial=world(await read());assert.ok(initial&&initial.life.length===0);
  for(const axis of ['temperature','atmosphere']){
    const start=Date.now();
    while(Math.abs(world(await read())[axis])>.045){
      assert.ok(Date.now()-start<150000,'Climate adjustment deadline');
      let s=await read();if(s.space.ship.energy<8){await action('space-climate:off');await until(v=>v.space.ship.energy>=40,'real solar recharge');s=await read();}
      const value=world(s)[axis],tool=axis==='temperature'?value>0?'cool':'warm':value>0?'thin':'thicken';
      if(s.space.expedition.biosphere.tool!==tool)await action('space-climate:'+tool);await page.waitForTimeout(450);
    }
    await action('space-climate:off');
  }
  const after=world(await read());assert.ok(Math.hypot(after.temperature,after.atmosphere)<.3);assert.equal(after.life.length,0);assert.equal(capacity(after),0);
  await log('actual-climate-work',{before:{temperature:initial.temperature,atmosphere:initial.atmosphere},after:{temperature:after.temperature,atmosphere:after.atmosphere},work:after.biosphere.work});await exported('35-foreign-climate');
}
async function seed(band){
  await resume();await detail('space-biology');await page.locator('#space-habitat-band').selectOption(String(band));
  const center=[{x:-14,z:0},{x:14,z:0},{x:0,z:18}][band-1];assert.ok(center);await near(center);const cargo=[...(await read()).space.expedition.cargo];assert.equal(cargo.length,8);let shift=0;
  for(const life of cargo){
    const button=page.locator(`button[data-action="space-release:${life.id}"]:visible`).first();await until(s=>s.space.ship.energy>=2,'planting energy');
    while(await button.isDisabled()){assert.ok(++shift<=5,'No clear planting position');await near({x:center.x+shift*4,z:center.z+5});}
    const after=await tool('release',life.id,band),placed=world(after).life.find(l=>l.id===life.id);assert.ok(placed);assert.equal(placed.originPlanetId,life.originPlanetId);assert.equal(placed.taxonKey,life.taxonKey);
  }
  await until(s=>capacity(world(s))>=band,'six real roles and stable nutrition',180);await detail('space-climate');await action('space-climate:off');
  let stableSince=world(await read()).elapsed;await until(s=>{const w=world(s);if(capacity(w)<band)stableSince=w.elapsed;return capacity(w)>=band&&w.elapsed-stableSince>=20;},'twenty continuous stable seconds with tools OFF',180);
  await page.locator('#space-climate .space-habitats').scrollIntoViewIfNeeded();await scene('foreign-stable-band-'+band);await exported('36-foreign-stable-band-'+band);
}
async function colony(){
  await resume();await near({x:0,z:0});const before=await read();assert.ok(capacity(world(before))>=1);await economy('found');
  const after=await read();assert.equal(after.space.economy.balance,before.space.economy.balance-40);assert.ok(after.space.economy.colonies.some(c=>c.planetId===after.space.location.planetId));
  await until(s=>s.space.economy.colonies.some(c=>c.planetId===s.space.location.planetId&&c.produced-c.loaded>=8),'eight actually produced colony goods',150);
  await economy('load');assert.ok((await read()).space.economy.cargo.some(c=>c.amount>0));await log('actual-colony-and-production');await exported('37-colony-production');
}
async function empire(kind,id){
  await detail('space-diplomacy');const b=page.locator(`button[data-action^="space-empire:${kind}|${id}|"]:visible`).first();await action(await b.getAttribute('data-action'));
}
async function firstContact(){
  await resume();await near({x:0,z:0});let s=await read();const local=s.space.empires.entries.find(e=>e.capitalId===s.space.location.planetId);assert.ok(local);
  if(!local.contact)await empire('contact',local.id);s=await read();const h=s.space.empires.inheritance;
  assert.equal(h.philosophy,'weaver');assert.equal(h.diet.coverage,'complete');assert.equal(h.creature,'social');assert.equal(h.tribe,'allied');assert.deepEqual(h.civilization,['trade']);assert.deepEqual(h.scores,{keeper:12,broker:12,vanguard:0});
  if(!s.space.empires.entries.find(e=>e.id===local.id).mission)await empire('accept',local.id);
  await detail('space-inheritance');await page.locator('#space-inheritance').scrollIntoViewIfNeeded();await scene('first-contact-inheritance');await log('actual-first-contact',{inheritance:h,empire:(await read()).space.empires.entries.find(e=>e.id===local.id)});await exported('34-first-contact');
}
async function sellContract(){
  await resume();await near({x:0,z:0});const before=await read(),local=before.space.empires.entries.find(e=>e.capitalId===before.space.location.planetId);assert.equal(local?.mission?.kind,'trade');
  const cargo=[...before.space.economy.cargo];assert.ok(cargo.reduce((n,c)=>n+c.amount,0)>=8);for(const c of cargo)await economy('sell',c.planetId);
  await empire('complete',local.id);await empire('treaty',local.id);const after=await read();assert.ok(after.space.empires.entries.find(e=>e.id===local.id).treaty);assert.equal(after.space.economy.cargo.length,0);assert.ok(after.space.economy.balance>before.space.economy.balance);
  await detail('space-diplomacy');assert.match(await page.locator('#space-diplomacy').innerText(),/dohoda platí[\s\S]*\+2/);await log('actual-production-sale-and-treaty',{earned:after.space.economy.balance-before.space.economy.balance,sales:after.space.economy.sales});await exported('38-production-sale-and-treaty');
}
async function publicRoundtrip(resumeVerification=false,prefix='38'){
  assert.ok((await read()).space.location,'Verify while domestic simulation is frozen');
  if(!resumeVerification)await exported(`${prefix}-before-public-import`);const file=path.join(out,`${prefix}-before-public-import.save.json`),before=JSON.parse(await readFile(file,'utf8')).state;
  if(!resumeVerification){await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await pause();await exported(`${prefix}-after-public-import`);}
  const after=JSON.parse(await readFile(path.join(out,`${prefix}-after-public-import.save.json`),'utf8')).state;
  assert.notEqual(after.id,before.id);assert.equal(JSON.parse(after.checkpoint).id,after.id);
  for(const key of ['stage','tick','seed','player','campaign','world','tribe','machines','planet','homePlanet','lineageHistory','cities','states','military','maritime','commerce','mobilization'])assert.deepEqual(after[key],before[key],'Public import domestic '+key);
  for(const key of ['id','creation','purchase','health'])assert.deepEqual(after.space.ship[key],before.space.ship[key]);
  const nativeSeconds=after.space.elapsed-before.space.elapsed,solarRate=2.82+(before.space.outfit.purchases.some(p=>p.equipment==='solar')?2:0);assert.ok(Math.abs(after.space.ship.energy-Math.min(105,before.space.ship.energy+solarRate*nativeSeconds))<1e-7,'Native solar recharge during public import');
  for(const key of ['empires','outfit','wars','discoveries','core'])assert.deepEqual(after.space[key],before.space[key],'Public import space '+key);
  for(const key of ['balance','ledger','cargo','sales','counts','actions','nextAction','activated'])assert.deepEqual(after.space.economy[key],before.space.economy[key],'Public import economy '+key);
  assert.deepEqual(after.space.expedition.cargo,before.space.expedition.cargo);
  for(const w of before.space.expedition.worlds){const actual=after.space.expedition.worlds.find(a=>a.id===w.id);assert.ok(actual);if(w.id!==after.space.location.planetId)assert.deepEqual(actual,w);}
  const cpBefore=JSON.parse(before.checkpoint),cpAfter=JSON.parse(after.checkpoint);delete cpBefore.id;delete cpAfter.id;assert.deepEqual(cpAfter,cpBefore);
  await action('save');await action('saves');const load=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');assert.ok(load);await page.reload();await action('saves');await action(load);await pause();
  const loaded=await read();assert.deepEqual(loaded.space.ship.creation,after.space.ship.creation);assert.deepEqual(loaded.space.empires,after.space.empires);assert.deepEqual(loaded.space.economy.cargo,after.space.economy.cargo);assert.equal(loaded.space.economy.balance,after.space.economy.balance);assert.deepEqual(loaded.lineageHistory,after.lineageHistory);
  await log('actual-public-import-and-reload',{from:before.id,to:after.id,checkpointExactAfterRekey:true,nativeImportSeconds:nativeSeconds,solarRate,sourceSHA256:createHash('sha256').update(await readFile(file)).digest('hex')});await exported(`${prefix}-after-public-reload`);
}

async function returnHome(prefix='39',baseline='32-first-launch'){
  await resume();if((await read()).space.location){if((await read()).space.location.planetId!==(await read()).space.homePlanetId)await travel(0);else await surface();await exported(`${prefix}-before-landing`);}
  const full=JSON.parse(await readFile(path.join(out,`${prefix}-before-landing.save.json`),'utf8')).state,launch=JSON.parse(await readFile(path.join(out,baseline+'.save.json'),'utf8')).state;
  const keys=['stage','tick','seed','player','campaign','world','tribe','machines','planet','homePlanet','lineageHistory','cities','states','military','maritime','commerce','mobilization'];
  for(const key of keys)assert.deepEqual(full[key],launch[key],'Domestic state remained frozen: '+key);
  await resume();const before=full;if((await read()).space.location){await near({x:0,z:0});await action('space-down');}const after=await until(s=>s.space.location===null,'actual domestic landing');
  assert.deepEqual(after.space.ship.creation,before.space.ship.creation);assert.deepEqual(after.space.ship.purchase,before.space.ship.purchase);assert.deepEqual(after.space.expedition.worlds,before.space.expedition.worlds);assert.equal(after.space.economy.colonies.length,before.space.economy.colonies.length);for(const c of before.space.economy.colonies){const d=after.space.economy.colonies.find(q=>q.id===c.id);assert.ok(d);for(const key of Object.keys(c).filter(k=>!['productiveElapsed','produced'].includes(k)))assert.deepEqual(d[key],c[key]);assert.ok(d.productiveElapsed>=c.productiveElapsed&&d.produced>=c.produced);}
  await detail('space-dock');await detail('space-economy');await page.locator('#space-economy').scrollIntoViewIfNeeded();await scene(prefix==='39'?'first-expedition-home':prefix+'-expedition-home');await log('actual-return-domestic-and-foreign-preserved',{verifiedDomesticKeys:keys});await exported(`${prefix}-first-expedition-home`);
}

// Final D continuation; routes are selected from the ordinary visible star map.
async function route(index,target='surface'){
  await resume();assert.ok(Number.isInteger(index)&&index>=0&&index<32);await system();
  let current=Number((await read()).space.location.systemId.match(/:star-(\d+)$/)?.[1]??0);
  while(current!==index){
    const row=await starRow(index);const text=await row.innerText(),distance=text.match(/(?:^|\n)(\d+(?:\.\d+)?) · (\d+) energie/),range=(await page.locator('#space-star-map').innerText()).match(/Dosah lodi (\d+)/);assert.ok(distance&&range,text);
    const next=Number(distance[1])<=Number(range[1])?index:current+Math.sign(index-current);await jump(next);current=next;
  }
  if(target==='orbit')await scale('down','orbit');else if(target==='surface')await surface();else assert.equal(target,'system');
}
async function install(kind){
  await resume();let before=await read();if(!before.space.location)await detail('space-dock');await detail('space-outfit');
  const b=page.locator(`button[data-action^="space-equipment:${kind}|"]:visible`).first();await action(await b.getAttribute('data-action'));const after=await read(),purchase=after.space.outfit.purchases.find(p=>p.equipment===kind);assert.ok(purchase);assert.equal(purchase.paid,{hold:80,drive:120,solar:60}[kind]);assert.equal(before.space.economy.balance-after.space.economy.balance,purchase.paid);assert.deepEqual(after.space.ship.creation,before.space.ship.creation);await log('actual-equipment-purchase',{purchase});
}
async function prepareD(){
  await resume();assert.equal((await read()).space.location,null);await detail('space-dock');for(let i=0;i<10;i++)await economy('deposit');await install('hold');await exported('40-funded-and-equipped');
}
async function contactLocal(){
  await near({x:0,z:0});let s=await read();const e=s.space.empires.entries.find(e=>e.capitalId===s.space.location.planetId);assert.ok(e);if(e.contact===null)await empire('contact',e.id);s=await read();if(!s.space.empires.entries.find(q=>q.id===e.id).mission)await empire('accept',e.id);return e.id;
}
async function catalogue(){
  await route(4);const id=await contactLocal();assert.equal(id,'roots');await detail('space-biology');
  for(const role of roles){const w=world(await read()),life=w.life.find(l=>l.taxonKey===role);assert.ok(life);await page.locator('#space-specimen').selectOption(life.id);await near(life.pos);await tool('scan',life.id);}
  await near({x:0,z:0});await empire('complete',id);await empire('treaty',id);await log('actual-ecology-mission',{empire:(await read()).space.empires.entries.find(e=>e.id===id)});await exported('41-roots-catalogue');
}
async function survey(){
  await route(7);const id=await contactLocal();assert.equal(id,'basalt');const mission=(await read()).space.empires.entries.find(e=>e.id===id).mission;assert.equal(mission.kind,'survey');const index=Number(mission.targetPlanetId.match(/:star-(\d+):planet$/)?.[1]);assert.ok(Number.isInteger(index));await route(index);await route(7);await near({x:0,z:0});await empire('complete',id);await empire('treaty',id);await log('actual-survey-mission',{empire:(await read()).space.empires.entries.find(e=>e.id===id)});await exported('42-basalt-survey');
}
async function fitD(){
  await route(2);await near({x:0,z:0});await install('solar');await install('drive');await detail('space-outfit');await page.locator('#space-outfit').scrollIntoViewIfNeeded();await scene('three-earned-ship-modules');await exported('43-equipped-expedition');await resume();await economy('load');const cargo=(await read()).space.economy.cargo.find(c=>c.amount>0);assert.ok(cargo);const amount=cargo.amount,origin=cargo.planetId;await route(1);await near({x:0,z:0});const balance=(await read()).space.economy.balance;await economy('sell',origin);assert.equal((await read()).space.economy.balance-balance,amount*13);await log('actual-inherited-trade-price',{amount,unitPrice:13,previousUnitPrice:11});await exported('43-inherited-trade-sale');
}
async function discover(kind,id){
  await detail('space-discoveries');const n=(await read()).space.discoveries.nextAction;await action(`space-discovery:${kind}|${n}${id?'|'+id:''}`);const s=await until(s=>s.space.discoveries.nextAction===n+1,'actual discovery '+kind);await log('actual-discovery',{receipt:s.space.discoveries.actions.at(-1)});
}
async function wormhole(){
  await system();await near({x:0,z:0});await until(s=>s.space.ship.energy>=14,'wormhole energy');await detail('space-discoveries');const n=(await read()).space.discoveries.nextAction;await action('space-wormhole:'+n);const flight=await until(s=>!!s.space.leg,'actual wormhole starts');assert.equal(flight.space.leg.energyPaid,14);assert.equal(flight.space.leg.duration,6);assert.equal(flight.space.leg.passage.kind,'wormhole');await until(s=>!s.space.leg&&s.space.location.planetId===flight.space.leg.to.planetId,'actual wormhole arrival');await log('actual-wormhole',{flight:flight.space.leg});
}
async function discoveries(){
  await route(5);await near({x:12,z:-12});await discover('relic','passage');await wormhole();await route(20);await near({x:-13,z:10});await discover('relic','memory');
  const planet=(await read()).space.discoveries.society.planetId,index=Number(planet.match(/:star-(\d+):planet$/)?.[1]);await route(index);await near({x:7,z:8});await discover('contact');await discover('share');await discover('accept-patronage');const before=await read();await discover('support');assert.equal(before.space.economy.balance-(await read()).space.economy.balance,40);await page.locator('#space-discoveries').scrollIntoViewIfNeeded();await scene('earned-young-society-support');await exported('44-society-supported');
}
async function coreAction(kind){
  await detail('space-core');const n=(await read()).space.core.nextAction;await action(`space-core:${kind}|${n}`);const after=await until(s=>s.space.core.nextAction===n+1,'actual core '+kind);await log('actual-core-action',{receipt:after.space.core.actions.at(-1)});
}
async function core(){
  await route(23,'orbit');await near({x:0,z:0});await coreAction('contact');await coreAction('diplomacy');await route(31);await near({x:9,z:-8});await coreAction('encounter');await page.locator('#space-core').scrollIntoViewIfNeeded();await page.setViewportSize({width:1024,height:640});await scene('fresh-lineage-galactic-core');await exported('45-galactic-core');
}
async function reward(){
  await route(24);await near({x:0,z:0});await until(s=>s.space.ship.energy>=30,'reward energy');const before=await read();await coreAction('root');const after=await read(),w=world(after);assert.equal(w.temperature,0);assert.equal(w.atmosphere,0);assert.equal(w.life.length,0);assert.equal(after.space.core.actions.at(-1).energyPaid,30);assert.equal(after.space.economy.balance,before.space.economy.balance);await page.locator('#space-core').scrollIntoViewIfNeeded();await page.setViewportSize({width:1024,height:640});await scene('fresh-lineage-root-applied');await exported('46-core-reward-used');
}

async function finishD(){
  await publicRoundtrip(false,'46');await route(22,'system');await wormhole();await route(0);await returnHome('47','40-second-launch');
}
async function anotherExpedition(){
  await launch('48-next-launch');await route(5,'system');await wormhole();await route(24);const s=await read(),w=world(s);assert.equal(w.temperature,0);assert.equal(w.atmosphere,0);assert.ok(s.space.core.actions.some(a=>a.kind==='root'&&a.planetId===w.id));await log('actual-post-core-expedition-preserves-root');await exported('48-root-revisited');await route(22,'system');await wormhole();await route(0);await returnHome('49','48-next-launch');
}

try{
  await page.setViewportSize({width:1280,height:720});assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');const bytes=await readFile(path.join(root,'organism/active-campaign.save.json')),saved=JSON.parse(bytes).state,s=await read();assert.equal(s.stage,saved.stage);assert.equal(s.seed,saved.seed);assert.deepEqual(s.player.genome,saved.player.genome);await log('continuation-start',{phase,sourceSHA256:createHash('sha256').update(bytes).digest('hex')});
  if(phase==='status')console.log(JSON.stringify(compact(s),null,2));
  else if(phase==='ship')await ship();
  else if(phase==='launch')await launch(process.argv[3]??'32-first-launch');
  else if(phase==='go'){const index=Number(process.argv[3]??1);await travel(index);await exported('33-system-'+index+'-surface');}
  else if(phase==='gather')await gather();
  else if(phase==='climate')await climate();
  else if(phase==='seed')await seed(Number(process.argv[3]??1));
  else if(phase==='colony')await colony();
  else if(phase==='contact')await firstContact();
  else if(phase==='sell-contract')await sellContract();
  else if(phase==='return')await returnHome();
  else if(phase==='roundtrip')await publicRoundtrip();
  else if(phase==='resume-roundtrip')await publicRoundtrip(true);
  else if(phase==='prepare-d')await prepareD();
  else if(phase==='route'){const index=Number(process.argv[3]);await route(index,process.argv[4]??'surface');await exported('40-route-'+index);}
  else if(phase==='catalogue')await catalogue();
  else if(phase==='survey')await survey();
  else if(phase==='fit-d')await fitD();
  else if(phase==='discoveries')await discoveries();
  else if(phase==='core')await core();
  else if(phase==='reward')await reward();
  else if(phase==='finish-d')await finishD();
  else if(phase==='another-expedition')await anotherExpedition();
  else if(phase==='scene'){await resume();await scene(process.argv[3]??'space');}
  else throw Error('Unknown space phase '+phase);
}catch(error){await pause().catch(()=>{});await log('operation-failed',{phase,message:String(error),errors}).catch(()=>{});await exported('space-failure-continuation').catch(()=>{});console.error(error);process.exit(1);}
await pause();process.exit(0);
