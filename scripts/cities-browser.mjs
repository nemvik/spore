/** SP-009.A: prepared historical machine campaign, ordinary inputs + native RAF only. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out=path.resolve(process.env.CITIES_OUTPUT??'evidence/sp-009a/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5210';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {planetAtlas}=await ssr.ssrLoadModule('/src/game/planet-geography.ts');
const {citySite}=await ssr.ssrLoadModule('/src/game/cities.ts');
const {fieldGround}=await ssr.ssrLoadModule('/src/game/planet-travel.ts');
await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>page.locator(`button[data-action="${name}"]:visible`).first().click();
const shot=async name=>page.screenshot({path:path.join(out,`${name}.png`)});
const imported=async file=>{await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();};
async function exportSave(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
async function atlas(){if((await read()).navigation.mode!=='global'){await page.keyboard.press('n');await page.locator('#travel-map').waitFor();}}
async function choose(id){await page.locator('#atlas-cell').fill(String(id));await page.locator('#atlas-cell').press('Tab');await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).navigation.selectedCell===id,id);}
async function visit(id){await atlas();await action(`city-select:${id}`);const t=performance.now();await action(`city-enter:${id}`);await page.locator('.field-panel').waitFor();timings.push({action:'visit',ms:performance.now()-t});}
async function walkTo(p,tolerance=1){
  const start=Date.now();
  while(Date.now()-start<45000){
    const q=(await read()).navigation.field.position,dx=p.x-q.x,dz=p.z-q.z;if(Math.hypot(dx,dz)<=tolerance)return;
    const keys=[];if(Math.abs(dx)>tolerance*.5)keys.push(dx>0?'d':'a');if(Math.abs(dz)>tolerance*.5)keys.push(dz>0?'s':'w');
    for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(Math.min(250,Math.max(35,Math.hypot(dx,dz)/8*700)));for(const k of keys)await page.keyboard.up(k);
  }
  throw Error('Native walk did not reach '+JSON.stringify(p));
}
const original=s=>({worlds:s.worlds,player:s.player,campaign:s.campaign,tribe:s.tribe,machines:s.machines,planet:s.planet,history:s.lineageHistory,journey:s.journey,stage:s.stage,tick:s.tick,rng:s.rng});
try{
 await page.goto(base);await action('new');await atlas();assert.equal((await read()).cities.entries.length,0);assert.match(await page.locator('.city-list').innerText(),/žádné/);
 await imported(path.resolve('tests/fixtures/saves/alliance-completed.save.json'));await action('tribe-next');await atlas();let s=await read();const early=planetAtlas(s.homePlanet).cells.find(c=>c.biome==='grassland').id;
 await choose(early);await action('travel-enter');assert.match(await page.locator('.city-condition').innerText(),/pramen/);assert.equal(await page.locator('[data-action="city-found"]').isDisabled(),true);checks.push('fresh city registry empty, progression and uncaptured spring block founding');
 // Actual historical played machine export; amber and owned springs are pre-existing.
 await imported(path.resolve('tests/fixtures/saves/machines-restoration-final.save.json'));await atlas();const baseline=await exportSave('home-baseline');await action('close');
 const a=planetAtlas(baseline.state.homePlanet),cell=a.cells.find(c=>c.biome==='grassland'&&!a.anchors.some(x=>x.cellId===c.id));await choose(cell.id);await action('travel-enter');
 assert.match(await page.locator('.city-condition').innerText(),/tři stanoviště/);await shot('founding-conditions');
 for(let i=0;i<3;i++){const p=(await read()).navigation.field.world.patches[i].center;await walkTo(p,1.3);await page.keyboard.press('e');await page.waitForFunction(i=>JSON.parse(window.render_game_to_text()).navigation.field.world.patches[i].discovered,i);}
 s=await read();const candidates=[];
 for(let z=-58;z<=58;z+=4)for(let x=-58;x<=58;x+=4){const position={x,y:fieldGround(s.seed,cell,x,z),z};if(!citySite(s,{planetId:s.homePlanet.id,locationId:s.homePlanet.currentLocationId,position}))candidates.push(position);}
 candidates.sort((p,q)=>Math.hypot(p.x-s.navigation.field.position.x,p.z-s.navigation.field.position.z)-Math.hypot(q.x-s.navigation.field.position.x,q.z-s.navigation.field.position.z));assert.ok(candidates.length);
 await walkTo(candidates[0],.4);await page.waitForFunction(()=>!document.querySelector('[data-action="city-found"]').disabled);
 await page.locator('#city-name').fill('Záře nad údolím');const stationary=(await read()).navigation.field.position;await page.waitForTimeout(350);assert.deepEqual((await read()).navigation.field.position,stationary);
 await shot('founding-ready');const money=(await read()).machines.resource;await page.locator('#city-name').press('Tab');await page.waitForTimeout(450);assert.equal(await page.locator('[data-action="city-found"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).cities.entries.length===1);
 s=await read();const city=s.cities.entries[0];assert.equal(s.machines.resource,money-60);assert.equal(city.name,'Záře nad údolím');assert.match(await page.locator('.field-notice').innerText(),/Založeno/);await shot('founded-city');
 const founded=await exportSave('founded-city');const expected=original(baseline.state);expected.machines.resource-=60;assert.deepEqual(original(founded.state),expected);checks.push('three physical surveys, native location selection, name and atomic founding for 60 amber; home systems frozen');
 await action('close');const pos=(await read()).navigation.field.position;await atlas();await action(`city-select:${city.id}`);assert.equal((await read()).cities.entries.length,1);assert.equal((await read()).stage,4);assert.match(await page.locator('.city-selected').innerText(),/Záře nad údolím/);await shot('global-city-selection');
 await action(`city-enter:${city.id}`);assert.deepEqual((await read()).navigation.field.position,pos);await action('travel-home');await page.locator('.travel-return-notice').waitFor();await visit(city.id);assert.deepEqual((await read()).cities.entries,[city]);assert.deepEqual((await read()).navigation.field.position,pos);checks.push('real city address selection, local scene, home return and repeat visit without duplication');
 // Camera and pause are ordinary UI; return to yaw 0 through a real visit afterward.
 const yaw=(await read()).camera.yaw;await page.mouse.move(640,410);await page.mouse.down({button:'right'});await page.mouse.move(710,435,{steps:5});await page.mouse.up({button:'right'});assert.notEqual((await read()).camera.yaw,yaw);
 await action('pause');const paused=(await read()).navigation.field.world.time;await page.waitForTimeout(350);assert.equal((await read()).navigation.field.world.time,paused);await action('close');
 await action('save');const saved=await exportSave('active-campaign');await imported(saved.file);assert.deepEqual((await read()).cities.entries,[city]);assert.equal((await read()).homePlanet.currentLocationId,city.address.locationId);
 await action('save');const local=await exportSave('loaded-slot');await page.reload();await action('saves');await action(`load:${local.state.id}`);assert.deepEqual((await read()).cities.entries,[city]);
 await atlas();await action(`city-select:${city.id}`);await action('atlas-zoom:in');const camera=(await read()).navigation.camera;await action('save');const global=await exportSave('global-active');await imported(global.file);assert.deepEqual((await read()).navigation.camera,camera);assert.equal((await read()).cities.selectedId,city.id);
 await page.setViewportSize({width:1024,height:720});await shot('global-city-1024');await page.locator('.city-selected').scrollIntoViewIfNeeded();await shot('global-city-detail-1024');await action(`city-enter:${city.id}`);await shot('local-city-1024');
 const stopped=(await read()).navigation.field.position;await page.keyboard.down('w');await page.keyboard.press('n');await page.keyboard.up('w');await page.keyboard.press('n');const afterSwitch=(await read()).navigation.field.position;await page.waitForTimeout(300);assert.deepEqual((await read()).navigation.field.position,afterSwitch);assert.ok(Math.hypot(stopped.x-afterSwitch.x,stopped.z-afterSwitch.z)<2);checks.push('camera, pause, native export/import/rekey, local reload/load, global selected-city camera reload, cleared input at 1024');
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 async function sample(i){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');const render=await page.evaluate(()=>window.lumavora_metrics());delete render.samples;memory.push({i,...heap,render});}
 const other=a.cells.find(c=>c.biome==='desert').id;await sample(0);
 for(let i=0;i<20;i++){
   const t=performance.now();await action('travel-home');await page.locator('.travel-shortcut').waitFor();timings.push({action:'home',ms:performance.now()-t});
   if(i%2===0){await atlas();await choose(other);await action('travel-enter');await page.locator('.field-panel').waitFor();}
   await visit(city.id);await page.waitForTimeout(80);if(i===9||i===19)await sample(i+1);
 }
 s=await read();assert.equal(s.cities.entries.length,1);assert.equal(s.homePlanet.navigation.fields.length,2);assert.deepEqual(s.cities.entries,[city]);checks.push('20 native return cycles alternate detail resources; city/world/identity persist');
 await page.setViewportSize({width:1280,height:720});await shot('city-revisit-final');await exportSave('active-campaign');assert.equal(errors.length,0,errors.join('\n'));
 const metrics=await page.evaluate(()=>window.lumavora_metrics()),sorted=metrics.samples.sort((a,b)=>a-b);
 const result={checks,errors,target:cell.id,city,timings,memory,frames:{count:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]},build:await page.locator('script[type="module"]').getAttribute('src'),prepared:'Unchanged historical machine-restoration-final save with earned amber and captured springs. Separate unchanged completed tribe enters machines through UI to prove missing-spring lock. Three surveys, walking to a valid site, naming, payment, travel and persistence through normal inputs/native RAF. No live state/localStorage writes, advanceTime or acceleration. Read-only offline site query selects a target for walking. GC only measures heap.'};
 await writeFile(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:checks.length,errors,memory:memory.map(m=>({i:m.i,heap:m.usedSize,geometries:m.render.geometries})),frames:result.frames,build:result.build}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,state:await read().catch(()=>null)},null,2));throw error;}finally{await browser.close();}
