/** SP-009.B: actual A city as a disclosed input, normal UI and native RAF only. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out=path.resolve(process.env.CITY_ECONOMY_OUTPUT??'evidence/sp-009b/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5210';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {CITY_LOTS,buildingSite}=await ssr.ssrLoadModule('/src/game/city-spatial.ts');
const {cityEconomyPreview}=await ssr.ssrLoadModule('/src/game/city-economy.ts');
const {planetAtlas}=await ssr.ssrLoadModule('/src/game/planet-geography.ts');await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
await page.addInitScript(()=>{
  const counts={created:0,deleted:0},live=new WeakSet();
  for(const API of [WebGLRenderingContext,WebGL2RenderingContext]){
    const create=API.prototype.createBuffer,remove=API.prototype.deleteBuffer;
    API.prototype.createBuffer=function(){const b=create.call(this);if(b&&!live.has(b)){live.add(b);counts.created++;}return b;};
    API.prototype.deleteBuffer=function(b){if(b&&live.has(b)){live.delete(b);counts.deleted++;}return remove.call(this,b);};
  }
  window.cityBufferMetrics=()=>({...counts,live:counts.created-counts.deleted});
});
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const current=s=>s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId);
const action=async name=>page.locator(`button[data-action="${name}"]:visible`).first().click();
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
const check=label=>{checks.push(label);console.log(label);};
async function imported(file,expected='game'){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(mode=>JSON.parse(window.render_game_to_text()).mode===mode,expected);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();}
async function exportSave(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
async function command(name){if(/^(enable|disable|demolish),/.test(name)){const panel=page.locator('details').filter({has:page.locator('summary', {hasText:'Provozy a náklady'})});if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();}await action('city-econ:'+name);await page.locator('.city-confirm:not([hidden])').waitFor();assert.equal(await page.locator('[data-action="city-econ:confirm"]').isDisabled(),false,await page.locator('.city-confirm').innerText());await action('city-econ:confirm');await page.waitForFunction(()=>!document.querySelector('.city-confirm:not([hidden])'));}
async function construct(kind){
  const s=await read(),c=current(s),lots=CITY_LOTS.filter(l=>!buildingSite(s,c,l.id,kind));
  const comfort=l=>cityEconomyPreview({...c,economy:{...c.economy,buildings:[...c.economy.buildings,{id:c.economy.nextId,kind,lot:l.id,enabled:true,paidAmber:18}]}}).reasons.leisure;
  const lot=lots.sort((a,b)=>(kind==='park'?comfort(b)-comfort(a):0)||Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];assert.ok(lot);
  if(!await page.locator('.city-construction').evaluate(el=>el.open))await page.locator('.city-construction>summary').click();
  await action('city-econ:kind,'+kind);await action('city-econ:lot,'+lot.id);const before=current(await read()).economy;
  await action('city-econ:build');await page.locator('.city-confirm:not([hidden])').waitFor();assert.equal((await read()).navigation.field.position.x,s.navigation.field.position.x);
  const confirm=page.locator('[data-action="city-econ:confirm"]');await page.waitForTimeout(450);assert.equal(await confirm.evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action="city-econ:cancel"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await confirm.evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Space');
  await page.waitForFunction(rev=>JSON.parse(window.render_game_to_text()).cities.entries.some(c=>c.economy?.revision>rev),before.revision);assert.equal(current(await read()).economy.buildings.length,before.buildings.length+1);
}
async function visit(id){if((await read()).navigation.mode!=='global')await page.keyboard.press('n');await page.locator('#travel-map').waitFor();await action('city-select:'+id);const t=performance.now();await action('city-enter:'+id);await page.locator('#city-economy').waitFor();timings.push({kind:'visit',ms:performance.now()-t});}
const immutable=e=>({...e,elapsed:0});
const original=s=>({stage:s.stage,tick:s.tick,rng:s.rng,player:s.player,worlds:s.worlds,campaign:s.campaign,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineageHistory:s.lineageHistory});
try {
 if(process.argv.includes('--leisure')) {
  await imported(path.resolve(process.env.CITY_ECONOMY_INPUT??'evidence/sp-009b/browser/active-campaign.save.json'));
  const id=current(await read()).id;
  await action('travel-home');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=60,null,{timeout:60000});await visit(id);
  for(let i=0;i<3;i++)await command('fund');await construct('house');await command('invite');const before=cityEconomyPreview(current(await read()));
  await construct('park');const first=cityEconomyPreview(current(await read()));assert.ok(first.happiness>before.happiness);
  await construct('park');const second=cityEconomyPreview(current(await read()));assert.equal(current(await read()).economy.residents.length,6);assert.equal(second.workers,6);assert.ok(second.income>before.income);
  const n=current(await read()).economy.cycle;await page.waitForFunction(n=>JSON.parse(window.render_game_to_text()).cities.entries.some(c=>c.economy?.cycle>n),n,{timeout:30000});
  const last=current(await read()).economy.last;assert.equal(last.income,second.income);assert.equal(last.upkeep,second.upkeep);assert.ok(last.income>last.upkeep);
  const food=current(await read()).economy.food,rev=current(await read()).economy.revision;await command('supplies');const e=current(await read()).economy;assert.equal(e.revision,rev+1);assert.equal(e.food,food+20);assert.equal(e.ledger.supplies,10);
  await page.locator('.city-panel').evaluate(el=>{el.scrollTop=0;});const causes=page.locator('#city-economy details').filter({has:page.locator('summary',{hasText:/Spokojenost/})});if(!await causes.evaluate(el=>el.open))await causes.locator('summary').click();await shot('leisure-six-residents');
  const save=await exportSave('active-campaign');await imported(save.file);await action('pause');assert.deepEqual(immutable(current(await read()).economy),immutable(current(save.state).economy));
  assert.equal(errors.length,0,errors.join('\n'));await writeFile(path.join(out,'results.json'),JSON.stringify({checks:['Native spring earnings and 60 amber transfer, paid second house and 2 residents','Two paid, deliberately placed leisure gardens change happiness and workshop income; all 6 residents work','Real next cycle produces positive net amber with all upkeep charged','Paid 20 emergency portions and exact reimport'],errors,before,first,second,last,build:await page.locator('script[type="module"]').getAttribute('src'),prepared:'Input is the actual final played SP-009.B campaign. No funds/state prepared. Earned additional amber at original home springs through native waiting. Read-only candidate previews choose park parcels; actual placement/payment via UI.'},null,2));console.log(JSON.stringify({checks:4,errors,before:before.happiness,after:second.happiness,last}));
 } else {
  await imported(path.resolve('tests/fixtures/geography/sp-009a-city.save.json'));assert.equal(current(await read()).economy,null);await shot('legacy-inactive');
  const start=await exportSave('baseline');await action('close');const amber=(await read()).machines.resource;
  await action('city-econ:open');assert.equal(current(await read()).economy,null);await action('city-econ:cancel');assert.equal((await read()).machines.resource,amber);
  await command('open');assert.equal(current(await read()).economy.treasury,80);assert.equal((await read()).machines.resource,amber-80);const id=current(await read()).id;
  await construct('house');await construct('garden');await construct('workshop');await command('invite');await command('invite');
  let s=await read(),e=current(s).economy;assert.equal(e.residents.length,4);assert.equal(e.ledger.construction,60);assert.equal(e.ledger.immigration,16);assert.equal(s.machines.resource,amber-80);
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).cities.entries.some(c=>c.economy?.last?.income>c.economy?.last?.upkeep),null,{timeout:30000});
  await page.locator('#city-economy').scrollIntoViewIfNeeded();await page.locator('.city-panel').evaluate(el=>{el.scrollTop=0;});await shot('productive-city-1280');
  const developed=await exportSave('developed');const expected=original(start.state);expected.machines.resource-=80;assert.deepEqual(original(developed.state),expected);
  check('Actual A city: cancellation, transfer 80, paid house/garden/workshop, 4 paid residents, stable keyboard confirmation, positive native 10-second result; original systems frozen');
  await action('close');await action('city-econ:invite');assert.equal(await page.locator('[data-action="city-econ:confirm"]').isDisabled(),true);assert.match(await page.locator('.city-confirm').innerText(),/volná místa/);await action('city-econ:cancel');
  // A genuine operating deficit, induced by an ordinary shutdown, without prepared funds.
  s=await read();const workshop=current(s).economy.buildings.find(b=>b.kind==='workshop');
  const operations=page.locator('details').filter({has:page.locator('summary', {hasText:'Provozy a náklady'})});await operations.locator('summary').click();
  await command('disable,'+workshop.id);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).cities.entries.some(c=>c.economy?.last?.funded===false),null,{timeout:60000});
  const poor=current(await read()).economy;assert.equal(poor.last.income,0);assert.equal(poor.last.upkeep,0);await action('city-econ:supplies');assert.equal(await page.locator('[data-action="city-econ:confirm"]').isDisabled(),true);await action('city-econ:cancel');
  await page.locator('.city-panel').evaluate(el=>{el.scrollTop=0;});await shot('deficit');
  await action('travel-home');const homeBefore=(await read()).machines.resource;await page.waitForTimeout(1800);assert.ok((await read()).machines.resource>homeBefore);await visit(id);
  const r=current(await read()).economy;assert.equal(r.ledger.income,poor.ledger.income);await command('fund');await command('enable,'+workshop.id);
  const cycle=current(await read()).economy.cycle;await page.waitForFunction(cycle=>JSON.parse(window.render_game_to_text()).cities.entries.some(c=>c.economy?.cycle>cycle&&c.economy.last.funded&&c.economy.last.income>c.economy.last.upkeep),cycle,{timeout:30000});
  check('Capacity refusal, ordinary workshop shutdown causes paid upkeep deficit, no unfunded output, home spring income and explicit transfer restore profitable operation');
  // Local, global and UI pause all preserve their distinct clocks.
  await action('pause');const paused=current(await read()).economy;await page.waitForTimeout(500);assert.deepEqual(current(await read()).economy,paused);await action('close');
  const yaw=(await read()).camera.yaw;await page.mouse.move(560,380);await page.mouse.down({button:'right'});await page.mouse.move(605,400,{steps:5});await page.mouse.up({button:'right'});assert.notEqual((await read()).camera.yaw,yaw);const zoom=(await read()).camera.zoom;await page.mouse.wheel(0,200);await page.waitForTimeout(150);assert.notEqual((await read()).camera.zoom,zoom);
  await page.keyboard.down('w');await page.keyboard.press('n');await page.keyboard.up('w');await page.locator('#travel-map').waitFor();const globalState=await read(),globalEconomy=current(globalState).economy;
  await page.waitForTimeout(600);assert.deepEqual(current(await read()).economy,globalEconomy);await action('city-select:'+id);await action('atlas-zoom:in');
  const exported=await exportSave('global-active');await imported(exported.file);assert.deepEqual(current(await read()).economy,current(exported.state).economy);assert.deepEqual((await read()).navigation.camera,exported.state.homePlanet.navigation.camera);
  await action('save');const slot=await exportSave('saved-slot');await page.reload();await action('saves');await action('load:'+slot.state.id);assert.deepEqual(current(await read()).economy,current(slot.state).economy);
  await page.setViewportSize({width:1024,height:640});await page.locator('.city-selected').scrollIntoViewIfNeeded();await shot('global-economy-1024');await action('city-enter:'+id);const pos=(await read()).navigation.field.position;await page.waitForTimeout(350);assert.deepEqual((await read()).navigation.field.position,pos);
  await page.locator('.city-panel').evaluate(el=>{el.scrollTop=0;});await shot('local-economy-1024');
  if(!await page.locator('.city-construction').evaluate(el=>el.open))await page.locator('.city-construction>summary').click();await page.locator('.city-lots').scrollIntoViewIfNeeded();await shot('lots-1024');
  check('Native pause, global freeze, camera, cleared WASD, exact export/import/rekey and save/reload/load; usable 1024×640 controls');
  const cdp=await context.newCDPSession(page);async function sample(i){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');const render=await page.evaluate(()=>window.lumavora_metrics());delete render.samples;const buffers=await page.evaluate(()=>window.cityBufferMetrics());memory.push({i,...heap,render,buffers});}
  await sample(0);const other=planetAtlas((await read()).homePlanet).cells.find(c=>c.biome==='desert').id;
  for(let i=0;i<20;i++){
    const t=performance.now();await action('travel-home');await page.locator('.travel-shortcut').waitFor();timings.push({kind:'home',ms:performance.now()-t});
    if(i%2===0){await page.keyboard.press('n');await page.locator('#atlas-cell').fill(String(other));await page.locator('#atlas-cell').press('Tab');await action('travel-enter');await page.locator('.field-panel').waitFor();const before=(await read()).cities.entries.find(c=>c.id===id).economy;await page.waitForTimeout(150);assert.deepEqual((await read()).cities.entries.find(c=>c.id===id).economy,before);}
    await visit(id);await page.waitForTimeout(80);if(i===9||i===19)await sample(i+1);
  }
  assert.equal((await read()).cities.entries.length,1);assert.equal(current(await read()).economy.residents.length,4);assert.equal(memory[1].render.geometries,memory[2].render.geometries);assert.equal(memory[1].buffers.live,memory[2].buffers.live);
  check('20 native returns, alternating remote details: inactive economy remains exact, stable geometry count; response/heap measured');
  const measuredFrames=await page.evaluate(()=>window.lumavora_metrics().samples);
  await page.setViewportSize({width:1280,height:720});await page.locator('.city-panel').evaluate(el=>{el.scrollTop=0;});await shot('final-city-1280');const active=await exportSave('active-campaign');
  // Disclosed checkpoint input: the actually played export is the checkpoint;
  // only the dead branch is prepared offline, before normal UI import.
  const dead=JSON.parse(await readFile(active.file,'utf8'));dead.state.checkpoint=JSON.stringify({...dead.state,checkpoint:null});dead.state.player.health=0;dead.state.deathReason='Připravená mrtvá větev pro ověření checkpointu';
  const deadFile=path.join(out,'prepared-checkpoint.save.json');await writeFile(deadFile,JSON.stringify(dead));await imported(deadFile,'death');await action('recover');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
  assert.deepEqual(immutable(current(await read()).economy),immutable(current(active.state).economy));await action('pause');await shot('checkpoint-restored');await exportSave('checkpoint-restored');
  check('Prepared dead branch from the actually played city restores the complete paid economy through UI checkpoint recovery');
  assert.equal(errors.length,0,errors.join('\n'));const frames=measuredFrames.sort((a,b)=>a-b);
  const result={checks,errors,timings,memory,frames:{count:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)]},build:await page.locator('script[type="module"]').getAttribute('src'),prepared:'Unchanged actual SP-009.A city export with earned amber and captured springs. No prepared residents/buildings/income/time. All development, deficits, recovery and persistence via ordinary UI/native RAF. Read-only offline lot queries select clicks. Final checkpoint-only input sets a dead branch around a checkpoint copied from the actual played export before UI import. No live game/localStorage writes or advanceTime. GC measures memory only.'};
  await writeFile(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:checks.length,errors,build:result.build,frames:result.frames,memory:memory.map(m=>({i:m.i,heap:m.usedSize,geometries:m.render.geometries}))}));
 }
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,errors,state:await read().catch(()=>null)},null,2));throw error;}finally{await browser.close();}
