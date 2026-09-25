/** SP-009.C: six-resident, byte-identical played B input. UI only, native RAF. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.BUILDINGS_OUTPUT??'evidence/sp-009c/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5211';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {CITY_LOTS,buildingSite}=await ssr.ssrLoadModule('/src/game/city-spatial.ts');
const {cityEconomyPreview}=await ssr.ssrLoadModule('/src/game/city-economy.ts');await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
await page.addInitScript(()=>{const counts={created:0,deleted:0},live=new WeakSet();for(const API of [WebGLRenderingContext,WebGL2RenderingContext]){const create=API.prototype.createBuffer,remove=API.prototype.deleteBuffer;API.prototype.createBuffer=function(){const b=create.call(this);if(b&&!live.has(b)){live.add(b);counts.created++;}return b;};API.prototype.deleteBuffer=function(b){if(b&&live.has(b)){live.delete(b);counts.deleted++;}return remove.call(this,b);};}window.buildingBufferMetrics=()=>({...counts,live:counts.created-counts.deleted});});
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('dialog',dialog=>dialog.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const city=s=>s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId);
const action=async name=>page.locator(`button[data-action="${name}"]:visible`).first().click();
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
const check=label=>{checks.push(label);console.log(label);};
const edit=async(key,value)=>{const el=page.locator(`[data-building="${key}"]`);await el.fill(String(value));await el.press('Tab');};
const original=s=>({stage:s.stage,tick:s.tick,rng:s.rng,player:s.player,worlds:s.worlds,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineageHistory:s.lineageHistory});
async function imported(file,expected='game'){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(mode=>JSON.parse(window.render_game_to_text()).mode===mode,expected);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();}
async function exportSave(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
async function openDetails(text){const d=page.locator('#city-economy details').filter({has:page.locator('summary',{hasText:text})});if(!await d.evaluate(el=>el.open))await d.locator('summary').click();}
async function command(name){await action('city-econ:'+name);await page.locator('.city-confirm:not([hidden])').waitFor();assert.equal(await page.locator('[data-action="city-econ:confirm"]').isDisabled(),false,await page.locator('.city-confirm').innerText());await action('city-econ:confirm');}
async function visit(id){if((await read()).navigation.mode!=='global')await page.keyboard.press('n');await page.locator('#travel-map').waitFor();await action('city-select:'+id);const t=performance.now();await action('city-enter:'+id);await page.locator('#city-economy').waitFor();timings.push({kind:'visit',ms:performance.now()-t});}
async function libraryFromCity(){await openDetails('Rozvoj');await action('building-open:build');await page.locator('.building-library').waitFor();}
try{
 await imported(path.resolve('tests/fixtures/geography/sp-009b-economy.save.json'));const id=city(await read()).id;
 // Native spring earnings provide the construction budget; no prepared currency.
 await action('travel-home');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=80,null,{timeout:60000});await visit(id);
 for(let i=0;i<4;i++)await command('fund');
 const beforeEditing=await exportSave('before-design');await action('close');
 await libraryFromCity();const frozen=city(await read()).economy;
 await action('building:new,house');await edit('name','Jantarová věž');await edit('position.y',2.7);await edit('size.x',1.2);await edit('size.z',1.2);await edit('size.y',4);
 await edit('yaw',35);await page.locator('[data-building="color"]').fill('#dc9e62');await page.locator('[data-building="color"]').press('Tab');
 await action('building:select,roof');await edit('position.y',5.1);await page.locator('[data-building="shape"]').selectOption('cone');
 await action('building:undo');assert.equal((await read()).buildingStudio.edit.value.design.parts[1].shape,'dome');await action('building:redo');assert.equal((await read()).buildingStudio.edit.value.design.parts[1].shape,'cone');
 // Actual 3D picking, orbit, zoom, keyboard history; no scripted focus.
 const target=(await read()).buildingStudio.targets.find(t=>t.id==='body');await page.mouse.click(target.x,target.y);assert.equal((await read()).buildingStudio.edit.selected,'body');await page.keyboard.press('Control+z');assert.equal((await read()).buildingStudio.edit.value.design.parts[1].shape,'dome');await page.keyboard.press('Control+Shift+z');assert.equal((await read()).buildingStudio.edit.value.design.parts[1].shape,'cone');
 const view=await page.locator('#building-viewport').boundingBox();await page.mouse.move(view.x+view.width/2,view.y+view.height/2);await page.mouse.down({button:'right'});await page.mouse.move(view.x+view.width/2+80,view.y+view.height/2+20,{steps:5});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-80);await action('building:camera-reset');
 await page.waitForTimeout(600);assert.deepEqual(city(await read()).economy,frozen);await shot('tower-editor-1280');
 await action('building:save');let entries=(await read()).buildingStudio.entries;const tower=entries.find(c=>c.name==='Jantarová věž');assert.ok(tower);
 // Second silhouette is assembled from parts of the same economic kind.
 await action('building:new,house');await edit('name','Dvojitý pavilon');await page.locator('[data-building="shape"]').selectOption('box');await edit('size.y',1);await edit('position.y',1.2);await edit('size.z',1.5);await edit('size.x',2.6);await page.locator('[data-building="color"]').fill('#80bdae');await page.locator('[data-building="color"]').press('Tab');
 await action('building:select,roof');await action('building:remove');await action('building:add,cone');await edit('position.y',2.2);await edit('position.x',-.7);await action('building:copy-part');await edit('position.x',.7);
 await page.setViewportSize({width:1024,height:640});await page.waitForTimeout(200);await shot('pavilion-editor-1024');await action('building:save');entries=(await read()).buildingStudio.entries;const pavilion=entries.find(c=>c.name==='Dvojitý pavilon');assert.equal(pavilion.design.parts.length,3);assert.notDeepEqual(tower.design,pavilion.design);check('Two distinct house silhouettes assembled with parts, XYZ/size/yaw/colour; picking, undo/redo, camera and 1024×640; economy frozen');
 // Save revision/duplicate/cancel and library transfer.
 await action('building:edit,'+tower.id);const before=structuredClone((await read()).buildingStudio.edit.value);await edit('name','Zrušený');await page.keyboard.press('Escape');assert.equal((await read()).buildingStudio.entries.find(c=>c.id===tower.id).name,tower.name);
 await action('building:duplicate,'+pavilion.id);let copy=(await read()).buildingStudio.entries.find(c=>c.name.includes('kopie'));assert.ok(copy);await action('building:delete,'+copy.id);
 const [download]=await Promise.all([page.waitForEvent('download'),action('building:export,'+tower.id)]);const buildingFile=path.join(out,'tower.building.json');await download.saveAs(buildingFile);await page.locator('#import-building').setInputFiles(buildingFile);await page.waitForFunction(()=>document.querySelector('.building-library [role=status]').textContent.includes('už'));assert.equal((await read()).buildingStudio.entries.length,2);
 await action('building:edit,'+tower.id);await edit('name','Jantarová věž II');await action('building:save');const revised=(await read()).buildingStudio.entries.find(c=>c.id===tower.id);assert.equal(revised.revision,2);
 await page.locator('#import-building').setInputFiles(buildingFile);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).buildingStudio.entries.length===3);const importedTower=(await read()).buildingStudio.entries.find(c=>c.name===tower.name);assert.notEqual(importedTower.id,tower.id);
 const invalidFile=path.join(out,'invalid-building.json');await writeFile(invalidFile,'{"format":"lumavora-building","version":99}');await page.locator('#import-building').setInputFiles(invalidFile);await page.waitForFunction(()=>document.querySelector('.building-library [role=status]').textContent.includes('Neplatná'));assert.equal((await read()).buildingStudio.entries.length,3);
 check('Library names, revision 2, duplication/deletion, cancellation, matching and conflicting import, invalid file rejection');
 // Both designs are used in paid construction through the original B quote.
 for(const creation of [revised,pavilion]){
   await action('building:use,'+creation.id);await openDetails('Rozvoj');const s=await read(),c=city(s),lot=CITY_LOTS.filter(l=>!buildingSite(s,c,l.id,'house')).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];assert.ok(lot);
   await action('city-econ:lot,'+lot.id);const pre=city(await read()).economy;await action('city-econ:build');await page.waitForTimeout(450);assert.equal(await page.locator('[data-action="city-econ:confirm"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action="city-econ:cancel"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');await page.keyboard.press('Space');
   const post=city(await read()).economy;assert.equal(post.buildings.length,pre.buildings.length+1);assert.equal(post.ledger.construction,pre.ledger.construction+20);assert.equal(post.buildings.at(-1).appearance.creation.id,creation.id);assert.equal(post.residents.length,6);
   if(creation===revised)await libraryFromCity();
 }
 const built=city(await read()).economy.buildings.filter(b=>b.appearance.source==='creation');assert.equal(built.length,2);
 // Explicit free restyle, with a cancelled confirmation first.
 await openDetails('Provozy a náklady');const existing=city(await read()).economy.buildings.find(b=>b.kind==='house');await action('building-open:'+existing.id);await action('building:use,'+pavilion.id);await action('city-econ:cancel');assert.equal(city(await read()).economy.buildings.find(b=>b.id===existing.id).appearance.source,'default');
 await openDetails('Provozy a náklady');await action('building-open:'+existing.id);const eBefore=city(await read()).economy,pBefore=cityEconomyPreview(city(await read()));await action('building:use,'+pavilion.id);await action('city-econ:confirm');const eAfter=city(await read()).economy;assert.equal(eAfter.revision,eBefore.revision+1);assert.deepEqual(eAfter.ledger,eBefore.ledger);assert.deepEqual(cityEconomyPreview(city(await read())),pBefore);
 await libraryFromCity();for(const entry of (await read()).buildingStudio.entries)await action('building:delete,'+entry.id);assert.equal((await read()).buildingStudio.entries.length,0);await page.locator('#import-building').setInputFiles(buildingFile);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).buildingStudio.entries.length===1);const restoredTemplate=(await read()).buildingStudio.entries[0];assert.deepEqual(restoredTemplate.design,tower.design);await action('building:delete,'+restoredTemplate.id);await action('building:close');assert.deepEqual(city(await read()).economy.buildings,eAfter.buildings);
 await page.mouse.move(640,350);await page.mouse.down({button:'right'});await page.mouse.move(715,380,{steps:6});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-400);
 const cycle=city(await read()).economy.cycle,expected=cityEconomyPreview(city(await read()));await page.waitForFunction(n=>JSON.parse(window.render_game_to_text()).cities.entries.some(c=>c.economy.cycle>n),cycle,{timeout:30000});const last=city(await read()).economy.last;assert.equal(last.income,expected.income);assert.equal(last.upkeep,expected.upkeep);await page.waitForTimeout(250);await shot('city-custom-1024');
 check('Two paid constructions, explicit zero-cost restyle/cancel, deleted templates leave snapshots intact, real unaccelerated economy cycle');
 const baseline=await exportSave('active-campaign');assert.deepEqual(original(baseline.state),original(beforeEditing.state));await action('close');await action('travel-home');await visit(id);await action('pause');assert.deepEqual(city(await read()).economy.buildings,city(baseline.state).economy.buildings);await action('close');
 await imported(baseline.file);await action('pause');assert.deepEqual(city(await read()).economy.buildings,city(baseline.state).economy.buildings);
 await action('save');await action('saves');const savedAction=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(savedAction);assert.deepEqual(city(await read()).economy.buildings,city(baseline.state).economy.buildings);
 check('Departure/return and campaign export/import/rekey/save/reload/load retain installed snapshots with empty library');
 // Measurement at a stable city and editor; forced GC is read-only to the game clock.
 const cdp=await context.newCDPSession(page);
 async function measure(n){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage'),s=await read();memory.push({n,heap,render:s.render,buffers:await page.evaluate(()=>window.buildingBufferMetrics())});}
 await libraryFromCity();await action('building:new,house');await edit('name','Měřicí návrh');await action('building:save');const measuring=(await read()).buildingStudio.entries[0];await action('building:close');await measure(0);
 for(let i=1;i<=20;i++){
   await libraryFromCity();const t=performance.now();await action('building:edit,'+measuring.id);await page.locator('#building-viewport').waitFor();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).buildingStudio.targets.length>0);timings.push({kind:'editor',ms:performance.now()-t});await action('building:cancel');await action('building:close');
   const home=performance.now();await action('travel-home');await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).navigation.field);timings.push({kind:'home',ms:performance.now()-home});await visit(id);if(i===10||i===20)await measure(i);
 }
 await page.setViewportSize({width:1280,height:720});await shot('city-final-1280');const final=await exportSave('active-campaign');
 // Disclosed offline dead branch from the actual played output; ordinary UI recovery.
 const dead=JSON.parse(await readFile(final.file,'utf8'));const checkpoint=structuredClone(dead.state);checkpoint.checkpoint=null;dead.state.checkpoint=JSON.stringify(checkpoint);dead.state.player.health=0;dead.state.deathReason='Připravená větev obnovy SP-009.C';const deadFile=path.join(out,'prepared-checkpoint.save.json');await writeFile(deadFile,JSON.stringify(dead));await imported(deadFile,'death');await action('recover');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.deepEqual(city(await read()).economy.buildings,city(final.state).economy.buildings);check('20 editor reopenings and 20 travel loops measured; disclosed offline checkpoint branch restored through UI');
 assert.equal(errors.length,0,errors.join('\n'));const stats=kind=>{const v=timings.filter(t=>t.kind===kind).map(t=>t.ms).sort((a,b)=>a-b);return {n:v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)};};
 await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,timings:{editor:stats('editor'),visit:stats('visit'),home:stats('home')},memory,last,build:await page.locator('script[type=module]').getAttribute('src'),prepared:'Byte-identical B leisure export with six residents. No extra currency/designs prepared. Native home income funded new construction. Pure offline lot query selects a free parcel, actual placement/payment uses UI. Only checkpoint death branch is prepared offline from final UI export. No live state/localStorage writes or time acceleration.'},null,2));
 console.log(JSON.stringify({checks:checks.length,errors,timings:{editor:stats('editor'),visit:stats('visit'),home:stats('home')}}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,state:await read()},null,2));throw error;}finally{await browser.close();}
