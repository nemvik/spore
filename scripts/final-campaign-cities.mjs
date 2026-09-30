/** Native continuation of the fresh final campaign. Ordinary UI and native RAF.
 * Host-side geography/site queries only plan walking and paid construction;
 * they never run mutations inside the game or prepare replacement state.
 */
import assert from 'node:assert/strict';
import {appendFile,mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const phase=process.argv[2]??'status',root=path.resolve('evidence/final-campaign'),out=path.join(root,'civilization');
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {planetAtlas}=await ssr.ssrLoadModule('/src/game/planet-geography.ts');
const {citySite}=await ssr.ssrLoadModule('/src/game/cities.ts');
const {fieldGround,travelAvailability}=await ssr.ssrLoadModule('/src/game/planet-travel.ts');
const {CITY_LOTS,buildingSite}=await ssr.ssrLoadModule('/src/game/city-spatial.ts');
const {functioningCity,civilizationReadiness,civilizationInheritance}=await ssr.ssrLoadModule('/src/game/civilization.ts');
await ssr.close();
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));
assert.ok(page);page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const compact=s=>({stage:s.stage,mode:s.mode,tick:s.tick,amber:s.machines?.resource,homeElapsed:s.machines?.elapsed,
  turn:s.states?.clock.turn,location:s.homePlanet?.currentLocationId,position:s.navigation?.field?.position,
  cities:s.cities?.entries.map(c=>({id:c.id,name:c.name,owner:c.owner,cycle:c.economy?.cycle,treasury:c.economy?.treasury,
    residents:c.economy?.residents.length,last:c.economy?.last,transfers:c.transfers?.length})),
  contracts:s.commerce?.contracts.map(c=>({id:c.id,cityId:c.cityId,status:c.status,deliveries:c.deliveries.map(d=>({id:d.id,phase:d.phase,delivered:d.delivered,progress:d.progress,total:d.route.length-1}))})),
  civilization:s.civilization,deathReason:s.deathReason});
async function log(event,extra={}){const value={event,wall:new Date().toISOString(),...compact(await read()),...extra};await appendFile(path.join(out,'cities.jsonl'),JSON.stringify(value)+'\n');console.log(JSON.stringify(value));}
async function action(name){const b=page.locator(`button[data-action="${name}"]:visible`).first();assert.equal(await b.isDisabled(),false,`Disabled action: ${name}`);if(name==='planet-tool')await b.click();else{await b.scrollIntoViewIfNeeded();await b.press('Enter');}}
async function resume(){if((await read()).mode==='pause')await action('close');assert.equal((await read()).mode,'game');}
async function pause(){if((await read()).mode==='game')await action('pause');}
async function until(predicate,label,seconds=180){const start=Date.now();let last=start;while(Date.now()-start<seconds*1000){const s=await read();assert.equal(s.mode,'game',label);assert.equal(s.deathReason,null);assert.deepEqual(errors,[]);if(await predicate(s))return s;if(Date.now()-last>20000){await log('native-progress',{label});last=Date.now();}await page.waitForTimeout(180);}throw Error('Native timeout: '+label);}
async function exported(name){
  await pause();const response=await fetch(`http://127.0.0.1:${process.env.FRESH_CONTROL_PORT??9225}`,{method:'POST',body:JSON.stringify({command:'export',args:{name}})});assert.ok(response.ok,await response.text());
  const source=path.join(root,'organism',name+'.save.json'),bytes=await readFile(source);
  await writeFile(path.join(out,name+'.save.json'),bytes);await writeFile(path.join(root,'organism/active-campaign.save.json'),bytes);await unlink(source);
  await log('public-export',{file:name+'.save.json',sha256:createHash('sha256').update(bytes).digest('hex'),errors});
}
async function atlas(){if((await read()).navigation.mode!=='global')await action('atlas');await page.locator('#travel-map').waitFor();}
async function home(){await resume();if((await read()).navigation.mode==='global')await page.keyboard.press('n');if((await read()).navigation.field)await action('travel-home');assert.equal((await read()).navigation.field,null);}
async function visit(id){await resume();await atlas();await action('city-select:'+id);await action('city-enter:'+id);await page.locator('#city-economy').waitFor();}
async function walkTo(goal,tolerance=1){
  const started=Date.now();
  // Clicking unobstructed ground clears keyboard focus from the atlas input.
  await page.mouse.click(650,320);
  while(Date.now()-started<60000){
    const s=await read(),p=s.navigation.field.position,dx=goal.x-p.x,dz=goal.z-p.z;
    if(Math.hypot(dx,dz)<=tolerance)return;
    const keys=[];if(Math.abs(dx)>tolerance*.4)keys.push(dx>0?'d':'a');if(Math.abs(dz)>tolerance*.4)keys.push(dz>0?'s':'w');
    for(const k of keys)await page.keyboard.down(k);
    try{await page.waitForTimeout(Math.min(180,Math.max(18,Math.hypot(dx,dz)/8*650)));}finally{for(const k of keys)await page.keyboard.up(k);}
  }
  throw Error('Native walk did not reach '+JSON.stringify(goal));
}
async function scene(name){
  await resume();const frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let last;function sample(t){if(last!==undefined)values.push(t-last);last=t;if(values.length===90)resolve(values);else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
  const s=await read();await page.screenshot({path:path.join(out,name+'.png')});const sorted=frames.sort((a,b)=>a-b);
  await writeFile(path.join(out,name+'-performance.json'),JSON.stringify({nativeRAF:true,frames:90,p50:sorted[45],p95:sorted[85],maximum:sorted.at(-1),render:s.render},null,2));await log('scene',{name,p95:sorted[85]});
}
async function founding(){
  await home();let s=await read();assert.equal(s.stage,4);assert.ok(s.machines.completed);assert.ok(!s.cities.entries.some(c=>c.founded.source==='player'));
  const a=planetAtlas(s.homePlanet),cell=a.cells.find(c=>c.biome==='grassland'&&travelAvailability(s,c.id).available&&!a.anchors.some(x=>x.cellId===c.id)&&!s.homePlanet.navigation.fields.some(f=>f.cellId===c.id));assert.ok(cell);
  await atlas();await page.locator('#atlas-cell').fill(String(cell.id));await page.locator('#atlas-cell').press('Tab');await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).navigation.selectedCell===id,cell.id);await page.waitForTimeout(100);await action('travel-enter');
  for(let i=0;i<3;i++){s=await read();if(s.navigation.field.world.patches[i].discovered)continue;await walkTo(s.navigation.field.world.patches[i].center,1.3);await page.keyboard.press('e');await until(v=>v.navigation.field.world.patches[i].discovered,'physical survey '+i,5);}
  s=await read();const candidates=[];
  for(let z=-58;z<=58;z+=4)for(let x=-58;x<=58;x+=4){const p={x,y:fieldGround(s.seed,cell,x,z),z};if(!citySite(s,{planetId:s.homePlanet.id,locationId:s.homePlanet.currentLocationId,position:p}))candidates.push(p);}
  candidates.sort((p,q)=>Math.hypot(p.x-s.navigation.field.position.x,p.z-s.navigation.field.position.z)-Math.hypot(q.x-s.navigation.field.position.x,q.z-s.navigation.field.position.z));assert.ok(candidates.length);
  await walkTo(candidates[0],.3);await until(()=>page.locator('[data-action="city-found"]').isEnabled(),'valid real founding position',5);
  await page.locator('#city-name').fill('Jasnozrnné údolí');await page.locator('#city-name').press('Tab');
  const before=await read();await action('city-found');s=await read();assert.equal(s.machines.resource,before.machines.resource-60);assert.ok(s.cities.entries.some(c=>c.name==='Jasnozrnné údolí'&&c.founded.source==='player'));
  await log('actual-city-founding',{cell:cell.id,paid:60,surveys:s.navigation.field.world.patches.map(p=>p.discovered)});await exported('25-own-city-founded');
}
async function economy(){
  await resume();let s=await read(),c=s.cities.entries.find(c=>c.founded.source==='player');assert.ok(c);if(s.homePlanet.currentLocationId!==c.address.locationId)await visit(c.id);
  if(!c.economy){const before=(await read()).machines.resource;await action('city-econ:open');await action('city-econ:confirm');assert.equal((await read()).machines.resource,before-80);}
  // Twenty extra amber keep construction solvent while real ten-second cycles run.
  s=await read();c=s.cities.entries.find(v=>v.id===c.id);if(c.economy.ledger.transfers===80){await action('city-econ:fund');await action('city-econ:confirm');}
  const construction=page.locator('.city-construction');if(await construction.getAttribute('open')===null)await construction.locator('summary').press('Enter');
  for(const kind of ['house','garden','workshop']){
    s=await read();c=s.cities.entries.find(v=>v.id===c.id);if(c.economy.buildings.some(b=>b.kind===kind))continue;
    await action('city-econ:kind,'+kind);const lot=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,kind));assert.ok(lot,'Actual available '+kind+' lot');
    await action('city-econ:lot,'+lot.id);await action('city-econ:build');await action('city-econ:confirm');
    assert.ok((await read()).cities.entries.find(v=>v.id===c.id).economy.buildings.some(b=>b.kind===kind&&b.lot===lot.id));
  }
  while((await read()).cities.entries.find(v=>v.id===c.id).economy.residents.length<4){await action('city-econ:invite');await action('city-econ:confirm');}
  s=await until(v=>functioningCity(v.cities.entries.find(q=>q.id===c.id)),'real financed productive city cycle',30);c=s.cities.entries.find(v=>v.id===c.id);
  assert.equal(c.economy.ledger.construction,60);assert.equal(c.economy.ledger.immigration,16);assert.ok(c.economy.last.income>=c.economy.last.upkeep);assert.equal(c.economy.last.hungry,0);
  await action('city-camera');await page.locator('#city-economy').scrollIntoViewIfNeeded();await scene('own-city-functioning');await log('actual-functioning-city',{city:c.id,ledger:c.economy.ledger});await exported('26-own-city-functioning');
}
async function wallet(target){await home();const before=await read();await until(s=>s.machines.resource>=target,'earned home budget '+target,600);const after=await read();await log('actual-home-earnings',{earned:after.machines.resource-before.machines.resource,seconds:after.machines.elapsed-before.machines.elapsed,rate:after.machineIncome});await exported('27-earned-home-budget');}
async function returnFleet(){
  await home();await action('machine-all');await action('machine-home');await page.waitForTimeout(750);
  // A normal right click on open ground beside the visible home workshop.
  assert.equal(await page.evaluate(()=>document.elementFromPoint(770,485)?.tagName),'CANVAS');await page.mouse.click(770,485,{button:'right'});
  await until(s=>{const p=s.tribe.huts.find(h=>h.kind==='shelter').pos;return s.machines.fleet.every(u=>u.orders.length===0&&u.cargo===0&&Math.hypot(u.pos.x-p.x,u.pos.z-p.z)<12);},'all owned carriers physically home',90);
  await scene('domestic-restoration-complete');await exported('24-domestic-complete');
}
async function trade(index){
  await resume();let s=await read();const targets=s.cities.entries.filter(c=>c.founded.source==='state'),c=targets[index];assert.ok(c&&c.owner.kind==='state');await visit(c.id);
  s=await read();let contract=s.commerce.contracts.find(q=>q.cityId===c.id&&q.status==='open');if(!contract){await action('commerce:open');contract=(await read()).commerce.contracts.at(-1);}
  const carrier=s.machines.fleet.find(u=>s.machines.blueprints.find(b=>b.id===u.blueprint).blueprint.carrier==='air');assert.ok(carrier);
  for(let n=contract.deliveries.filter(d=>d.delivered&&d.phase==='returned').length;n<3;n++){
    const details=page.locator('.commerce-contract details').first();if(await details.getAttribute('open')===null)await details.locator('summary').press('Enter');
    const before=(await read()).machines.resource;await action(`commerce:offer,${contract.id},${carrier.id}`);await action('commerce:confirm');assert.equal((await read()).machines.resource,before-20);
    if(index===0&&n===0){await page.setViewportSize({width:1024,height:640});await scene('commercial-flight-1024');await page.setViewportSize({width:1280,height:720});}
    await until(v=>{const d=v.commerce.contracts.find(q=>q.id===contract.id).deliveries.at(-1);return d.progress>=d.route.length-1-1e-8;},'actual outbound cargo');
    await action('commerce:unload');await until(v=>v.commerce.contracts.find(q=>q.id===contract.id).deliveries.at(-1).progress<=1e-8,'actual cargo return');await action('commerce:dock');await log('actual-commercial-delivery',{city:c.id,delivery:n+1,carrier:carrier.id,paid:20});
  }
  // Offers can expire on an ordinary economic tick; request a fresh visible quote.
  for(let attempt=0;attempt<4;attempt++){
    await until(()=>page.locator('button[data-action="trade:offer"]:visible').isEnabled(),'next eligible state trade turn',30);await action('trade:offer');await action('trade:confirm');s=await read();if(s.cities.entries.find(v=>v.id===c.id).owner.kind==='lineage')break;
  }
  const after=s.cities.entries.find(v=>v.id===c.id),receipt=after.transfers.at(-1);assert.equal(after.owner.kind,'lineage');assert.equal(receipt.method,'trade');assert.equal(receipt.credit,60);assert.equal(receipt.payment.after,receipt.payment.before-(receipt.price-60));
  assert.equal(s.commerce.contracts.find(q=>q.id===contract.id).status,'settled');await log('actual-city-purchase',{index,receipt});await exported('28-city-'+index+'-purchased');
}
async function next(){
  await home();const before=await read(),ready=civilizationReadiness(before);assert.equal(ready.ready,true,ready.reasons.join('; '));assert.equal(before.cities.entries.filter(c=>c.founded.source==='state').length,4);
  await scene('civilization-unified');await exported('29-civilization-unified');await resume();await action('machine-next');const after=await read();assert.equal(after.stage,5);assert.ok(after.civilization.completed);assert.deepEqual(after.player.genome,before.player.genome);assert.equal(civilizationInheritance(after).consumption,.8);
  await log('actual-civilization-transition',{inheritance:civilizationInheritance(after)});await exported('30-planet-arrival');
}
async function inheritance(){
  await resume();let s=await read();assert.equal(s.stage,5);assert.deepEqual(civilizationInheritance(s).methods,['trade']);
  if(s.planet.toolOn)await action('planet-tool');const off=await read();await page.waitForTimeout(2600);const offEnd=await read(),income=(offEnd.machines.resource-off.machines.resource)/(offEnd.planet.elapsed-off.planet.elapsed);
  await action('planet-tool');const on=await read();assert.equal(on.planet.toolOn,true);await page.waitForTimeout(2600);const onEnd=await read(),net=(onEnd.machines.resource-on.machines.resource)/(onEnd.planet.elapsed-on.planet.elapsed);
  assert.ok(Math.abs((income-net)-.2)<1e-7);await action('planet-tool');await log('actual-inherited-tool-consumption',{incomeRate:income,workingNetRate:net,actualCostRate:income-net,baseCostRate:.25,consumption: .8});await exported('30-inheritance-measured');
}
try{
  assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');await page.setViewportSize({width:1280,height:720});
  const bytes=await readFile(path.join(root,'organism/active-campaign.save.json'));const source=JSON.parse(bytes).state,s=await read();assert.equal(s.seed,source.seed);assert.equal(s.stage,source.stage);assert.deepEqual(s.player.genome,source.player.genome);await log('continuation-start',{phase,sourceSHA256:createHash('sha256').update(bytes).digest('hex')});
  if(phase==='status')console.log(JSON.stringify(compact(s),null,2));
  else if(phase==='home-fleet')await returnFleet();
  else if(phase==='found')await founding();
  else if(phase==='economy')await economy();
  else if(phase==='wallet')await wallet(Number(process.argv[3]??1800));
  else if(phase==='trade')await trade(Number(process.argv[3]??0));
  else if(phase==='next')await next();
  else if(phase==='inheritance')await inheritance();
  else if(phase==='scene')await scene(process.argv[3]??'city');
  else throw Error('Unknown city phase '+phase);
}catch(error){await pause().catch(()=>{});await log('operation-failed',{phase,message:String(error),errors}).catch(()=>{});await exported('cities-failure-continuation').catch(()=>{});console.error(error);process.exit(1);}
await pause();process.exit(0);
