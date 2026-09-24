/** Production/native RAF only. Source fixture is an unchanged historical completed tribe. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out=path.resolve(process.env.TRAVEL_OUTPUT??'evidence/sp-010c/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5210';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {planetAtlas}=await ssr.ssrLoadModule('/src/game/planet-geography.ts');
await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>{const b=page.locator(`[data-action="${name}"]:visible`).first();await b.scrollIntoViewIfNeeded();await b.press('Enter');};
const shot=async name=>page.screenshot({path:path.join(out,`${name}.png`)});
const imported=async file=>{await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();};
async function exportSave(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
async function atlas(){if((await read()).navigation.mode!=='global'){await page.keyboard.press('n');await page.locator('#travel-map').waitFor();}}
async function choose(id){await page.locator('#atlas-cell').fill(String(id));await page.locator('#atlas-cell').press('Tab');await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).navigation.selectedCell===id,id);}
async function enter(id){await atlas();await choose(id);const start=performance.now();await action('travel-enter');await page.locator('.field-panel').waitFor();timings.push({action:'enter',ms:performance.now()-start});}
const unchanged=s=>({worlds:s.worlds,player:s.player,campaign:s.campaign,tribe:s.tribe,machines:s.machines,planet:s.planet,history:s.lineageHistory,journey:s.journey,stage:s.stage,tick:s.tick,rng:s.rng});
try{
 await page.goto(base);await action('new');await atlas();let s=await read();assert.equal(s.stage,0);assert.equal(s.homePlanet.version,3);assert.equal(s.navigation.visits.length,0);await shot('early-locked');await page.keyboard.press('n');
 await imported(path.resolve('tests/fixtures/saves/alliance-completed.save.json'));await action('tribe-next');assert.equal((await read()).stage,4);await atlas();
 const baseline=await exportSave('home-baseline');await action('close');const a=planetAtlas(baseline.state.homePlanet),cells=a.cells.filter(c=>c.surface==='land'&&!a.anchors.some(x=>x.cellId===c.id)),target=cells.find(c=>c.biome==='grassland').id,other=cells.find(c=>c.biome==='desert').id;
 await choose(a.cells.find(c=>c.surface==='water').id);assert.equal(await page.locator('[data-action="travel-enter"]').isDisabled(),true);assert.match(await page.locator('.travel-availability').innerText(),/námořní/);
 await choose(target);await action('atlas-zoom:in');await page.keyboard.press('ArrowRight');await action('atlas-center');await choose(target);await page.locator(`[data-cell="${target}"]`).click();await shot('global-selection');
 await enter(target);let arrival=await read();assert.match(await page.locator('.field-notice').innerText(),/Příchod/);assert.equal(arrival.stage,4);assert.equal(arrival.tribeInheritance.income,1.2);
 await page.keyboard.down('w');await page.waitForTimeout(1300);await page.keyboard.up('w');await page.keyboard.press('e');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).navigation.field.world.patches[0].discovered);
 await shot('remote-survey');const away=await exportSave('remote-active');assert.deepEqual(unchanged(away.state),unchanged(baseline.state));assert.equal(away.state.homePlanet.navigation.fields[0].world.patches[0].discovered,true);checks.push('home systems exactly frozen during physical native walk/survey');
 await action('close');await action('travel-home');await page.locator('.travel-return-notice').waitFor();await shot('home-return');await atlas();
 const returned=await exportSave('home-returned');assert.equal(returned.state.stage,4);assert.equal(returned.state.homePlanet.currentLocationId,baseline.state.homePlanet.currentLocationId);assert.equal(returned.state.world.resources.length,baseline.state.world.resources.length);assert.equal(returned.state.world.creatures.length,baseline.state.world.creatures.length);assert.equal(returned.state.world.births,baseline.state.world.births);assert.deepEqual(returned.state.player,baseline.state.player);assert.ok(returned.state.tick>=baseline.state.tick);await action('close');
 await enter(target);assert.equal((await read()).navigation.field.world.patches[0].discovered,true);await page.keyboard.press('e');assert.equal((await read()).navigation.field.world.landmarks[2].charge,1);checks.push('return/revisit preserves survey without duplicate reward/entity');
 await action('save');assert.match(await page.locator('.field-notice').innerText(),/uložena/);const local=await exportSave('active-campaign');await imported(local.file);assert.equal((await read()).navigation.field.world.patches[0].discovered,true);
 await action('save');const loaded=await exportSave('loaded-slot');await page.reload();await action('saves');await action(`load:${loaded.state.id}`);assert.equal((await read()).navigation.field.world.patches[0].discovered,true);checks.push('remote export/import/rekey/local save/reload/load');
 await atlas();await action('atlas-zoom:in');await action('save');assert.match(await page.locator('[role="status"]').innerText(),/uložena/);const global=await exportSave('global-active');await imported(global.file);assert.equal((await read()).navigation.mode,'global');assert.deepEqual((await read()).navigation.camera,global.state.homePlanet.navigation.camera);await page.locator('#travel-map').waitFor();await page.setViewportSize({width:1024,height:720});await shot('global-1024');await action('atlas-close');
 await action('pause');const before=(await read()).navigation.field.world.time;await page.waitForTimeout(300);assert.equal((await read()).navigation.field.world.time,before);await action('close');await page.keyboard.press('n');const stopped=(await read()).navigation.field.position;await page.keyboard.down('w');await page.waitForTimeout(100);await page.keyboard.up('w');await page.keyboard.press('n');await page.waitForTimeout(100);assert.deepEqual((await read()).navigation.field.position,stopped);checks.push('global saved camera and pause at 1024x720');
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 async function sample(i){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');memory.push({i,...heap,render:await page.evaluate(()=>window.lumavora_metrics())});delete memory.at(-1).render.samples;}
 await page.waitForTimeout(100);await sample(0);
 for(let i=0;i<20;i++){
   const start=performance.now();await action('travel-home');await page.locator('.travel-shortcut').waitFor();timings.push({action:'home',ms:performance.now()-start});await enter(i%2?target:other);await page.waitForTimeout(80);if(i===9||i===19)await sample(i+1);
 }
 assert.equal((await read()).homePlanet.navigation.fields.length,2);assert.equal((await read()).homePlanet.navigation.visits.length,3);checks.push('20 native returns, two persistent scenes, bounded entity counts');
 await page.setViewportSize({width:1280,height:720});await shot('revisit-final');const final=await exportSave('active-campaign');assert.equal(final.state.homePlanet.navigation.fields.find(f=>f.cellId===target).world.patches[0].discovered,true);
 assert.equal(errors.length,0,errors.join('\n'));const metrics=await page.evaluate(()=>window.lumavora_metrics()),sorted=metrics.samples.sort((a,b)=>a-b);
 await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,target,other,timings,memory,frames:{count:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]},build:await page.locator('script[type="module"]').getAttribute('src'),prepared:'Unchanged historical alliance-completed save; ordinary UI transition to machines. No live-state writes, localStorage edits, advanceTime or acceleration. Native W/E field interaction. GC requested only for retained heap measurements.'},null,2));
 console.log(JSON.stringify({checks:checks.length,errors,timings:timings.length,memory:memory.map(m=>({i:m.i,heap:m.usedSize,geometries:m.render.geometries})),frames:{count:sorted.length,p95:sorted[Math.floor(sorted.length*.95)]}}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,state:await read().catch(()=>null)},null,2));throw error;}finally{await browser.close();}
