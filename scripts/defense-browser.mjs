/** SP-009.F actual E continuation; no live writes/time shim. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.DEFENSE_OUTPUT??'evidence/sp-009f/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5213';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
const cdp=await context.newCDPSession(page);
await page.addInitScript(()=>{
 window.defenseClicks=[];document.addEventListener('click',e=>{const a=e.target.closest?.('[data-action]')?.getAttribute('data-action');if(a){window.defenseClicks.push(a);if(window.defenseClicks.length>80)window.defenseClicks.shift();}},true);
 const counts={created:0,deleted:0},live=new WeakSet();for(const API of [WebGLRenderingContext,WebGL2RenderingContext]){const create=API.prototype.createBuffer,remove=API.prototype.deleteBuffer;API.prototype.createBuffer=function(){const b=create.call(this);if(b&&!live.has(b)){live.add(b);counts.created++;}return b;};API.prototype.deleteBuffer=function(b){if(b&&live.has(b)){live.delete(b);counts.deleted++;}return remove.call(this,b);};}
 window.stateBuffers=()=>({...counts,live:counts.created-counts.deleted});
 const frames=[];let last=0;function frame(t){if(last&&frames.length<20000)frames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);window.stateFrameTimes=()=>frames.slice();
});
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const city=s=>s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId);
const action=async name=>page.locator(`button[data-action="${name}"]:visible`).first().click();
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const check=label=>{checks.push(label);console.log(label);};
const original=s=>({stage:s.stage,tick:s.tick,rng:s.rng,player:s.player,worlds:s.worlds,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineageHistory:s.lineageHistory});
async function imported(file,expected='game'){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(mode=>JSON.parse(window.render_game_to_text()).mode===mode,expected);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();}
async function exported(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
async function visit(id){if((await read()).navigation.mode!=='global')await page.keyboard.press('n');await page.locator('#travel-map').waitFor();await action('city-select:'+id);const t=performance.now();await action('city-enter:'+id);await page.locator('#city-economy').waitFor();timings.push({kind:'visit',ms:performance.now()-t});}
const stats=v=>{v=[...v].sort((a,b)=>a-b);return {n:v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)};};
const startGpu=()=>page.evaluate(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const info={available:!!ext,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),samplesMs:[]};window.defenseGpu=info;
  if(!ext)return info;
  const native=window.requestAnimationFrame,queries=[];let measured=0;
  window.requestAnimationFrame=cb=>native(t=>{if(measured>=120){cb(t);return;}const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);cb(t);gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(q);measured++;});
  window.stopDefenseGpu=()=>{window.requestAnimationFrame=native;for(const q of queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))info.samplesMs.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return info;};return info;
 });
try{
 const input=path.resolve('tests/fixtures/geography/sp-009e-military.save.json');
 const initial=await imported(input),target=initial.cities.entries.find(c=>c.capture).id,unitId=12,originalCapture=structuredClone(initial.cities.entries.find(c=>c.id===target).capture);
 if(initial.navigation.mode==='global')await page.keyboard.press('n');await action('travel-home');await action('machine-select:'+unitId);const repairBefore=(await read()).machines.resource;await action('machine-repair');assert.equal((await read()).machines.fleet.find(u=>u.id===unitId).health,88);assert.ok((await read()).machines.resource<=repairBefore-8);await visit(target);await action('military:deploy,'+unitId);
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment?.phase==='field',null,{timeout:30000});
 await action('military:defend');await action('military:camera');await page.setViewportSize({width:1024,height:640});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.raids.length>0);
 await action('pause');const before=await read(),frozen={military:before.military,states:before.states,cities:before.cities,machines:before.machines};
 const freeze=async()=>{const s=await read();assert.deepEqual({military:s.military,states:s.states,cities:s.cities,machines:s.machines},frozen);};
 await page.waitForTimeout(650);await freeze();await action('building-open');await action('building:new,house');await page.waitForTimeout(650);await freeze();await action('building:cancel');await action('building:close');await action('close');
 await page.keyboard.press('n');const global=(await read()).military;await page.waitForTimeout(650);assert.deepEqual((await read()).military,global);await page.keyboard.press('n');
 const stop=page.locator('[data-action="military:stop"]');await stop.focus();await page.keyboard.press('Space');assert.equal((await read()).military.deployment.order,'stop');
 const start=performance.now();await action('military:defend');timings.push({kind:'order',ms:performance.now()-start});assert.equal((await read()).military.deployment.order,'defend');
 await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('incoming-1024');check('Actual E input; 40 reserve pays one attack; existing tank repaired for 10 amber and deployed; pause/editor/library/global frozen and keyboard orders usable at 1024×640');
 const defenseCheckpoint=await exported('before-defense');await action('close');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.raids[0].phase==='field',null,{timeout:40000});
 const combatFrameStart=await page.evaluate(()=>window.stateFrameTimes().length);
 await startGpu();
 await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.military.raids[0].unit.health<62;},null,{timeout:60000});
 await page.waitForTimeout(150);await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('combat-1024');const activeCombatFrames=await page.evaluate(start=>window.stateFrameTimes().slice(start),combatFrameStart);await action('pause');
 const combat=await exported('mid-combat');await cdp.send('HeapProfiler.collectGarbage');const combatMetrics={heap:await cdp.send('Runtime.getHeapUsage'),render:(await read()).render,buffers:await page.evaluate(()=>window.stateBuffers()),frames:stats(activeCombatFrames),gpuTime:await page.evaluate(()=>window.stopDefenseGpu?.()??window.defenseGpu)};
 await imported(combat.file);await action('travel-home');let absent=await read();const remoteHealth=absent.military.raids[0].unit.health,remoteEconomy=absent.cities.entries.find(c=>c.id===target).economy;
 await page.waitForTimeout(800);absent=await read();assert.equal(absent.military.raids[0].unit.health,remoteHealth);assert.deepEqual(absent.cities.entries.find(c=>c.id===target).economy,remoteEconomy);await visit(target);await action('military:camera');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.raids[0].phase==='destroyed',null,{timeout:40000});
 let s=await read();assert.equal(city(s).owner.kind,'lineage');assert.equal(city(s).transfers.length,0);assert.ok(s.machines.fleet.find(u=>u.id===unitId).health>0);assert.deepEqual(city(s).capture,originalCapture);await shot('defended-1024');await exported('defended');check('Paid repair of original E tank wins defense; actual damage, mid-fight export/import/rekey and departure freeze; original E capture unchanged');
 // A fresh import starts an alternate played branch, not a live-state rewrite.
 await imported(input);if((await read()).navigation.mode==='global')await page.keyboard.press('n');await visit(target);await action('military:deploy,'+unitId);await action('military:camera');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment?.phase==='field',null,{timeout:30000});await action('military:stop');assert.equal((await read()).military.deployment.order,'stop');
 await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).machines.fleet.some(u=>u.id===12),null,{timeout:60000});
 assert.equal(city(await read()).owner.kind,'lineage');await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).cities.entries.find(c=>c.id===id).owner.kind==='state',target,{timeout:60000});
 s=await read();assert.equal(city(s).fortification,0);assert.equal(city(s).transfers.length,1);assert.deepEqual(city(s).capture,originalCapture);await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('lost-1024');const lost=await exported('lost');await action('close');
 assert.ok(await page.locator('#city-economy').innerText().then(t=>t.includes('cizí')||t.includes('soupeř')||t.includes('návštěv')));
 await action('travel-home');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=76,null,{timeout:60000});
 await action('machine-editor:tank');await action('select:vehicle-drill');await action('remove');await action('add:cannon');await page.locator('[data-genome="name"]').fill('Obránce návratu');await page.locator('[data-genome="name"]').press('Tab');const draft=await read();await action('confirm-editor');s=await read();const replacement=s.machines.fleet.at(-1).id;assert.equal(s.machines.fleet.length,draft.machines.fleet.length+1);assert.ok(s.machines.resource<=draft.machines.resource-draft.editor.cost+2);
 await visit(target);await action('military:deploy,'+replacement);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment.phase==='field',null,{timeout:30000});await action('military:camera');await action('military:attack');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.raids[0].phase==='destroyed',null,{timeout:60000});await action('military:occupy');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment.hold>1,null,{timeout:30000});await action('military:stop');assert.equal((await read()).military.deployment.hold,0);assert.equal(city(await read()).owner.kind,'state');await action('military:occupy');
 await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).cities.entries.find(c=>c.id===id).owner.kind==='lineage',target,{timeout:30000});
 s=await read();assert.equal(city(s).transfers.length,2);assert.deepEqual(city(s).capture,originalCapture);await action('city-econ:fund');await action('city-econ:confirm');await action('military:retreat');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment===null,null,{timeout:60000});check('Alternate branch: tank destroyed in real fight, city lost by damage/occupation, paid replacement built in original editor, occupier destroyed and city recaptured; economy and physical return work');
 async function measure(n){await cdp.send('HeapProfiler.collectGarbage');const s=await read();memory.push({n,heap:await cdp.send('Runtime.getHeapUsage'),render:s.render,buffers:await page.evaluate(()=>window.stateBuffers())});}
 await measure(0);await startGpu();for(let i=1;i<=20;i++){const t=performance.now();await action('travel-home');await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).navigation.field);timings.push({kind:'home',ms:performance.now()-t});await visit(target);if(i===10||i===20)await measure(i);}
 const returnsGpuTime=await page.evaluate(()=>window.stopDefenseGpu?.()??window.defenseGpu);
 await action('city-camera');await page.setViewportSize({width:1280,height:720});await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('recaptured-1280');await page.setViewportSize({width:1024,height:640});await shot('recaptured-1024');await action('save');const final=await exported('active-campaign');await imported(final.file);await action('pause');await action('save');await action('saves');const loadAction=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(loadAction);assert.equal(city(await read()).transfers.length,2);
 // Offline prepared input explicitly embeds a played pre-battle checkpoint.
 const dead=JSON.parse(await readFile(final.file,'utf8')),cp=structuredClone(lost.state);cp.id=dead.state.id;cp.checkpoint=null;dead.state.checkpoint=JSON.stringify(cp);dead.state.player.health=0;dead.state.deathReason='Připravená větev pro obnovu SP-009.F';const deadFile=path.join(out,'prepared-checkpoint.save.json');await writeFile(deadFile,JSON.stringify(dead));await imported(deadFile,'death');await action('recover');await action('pause');assert.equal(city(await read()).owner.kind,'state');assert.equal(city(await read()).transfers.length,1);assert.deepEqual((await read()).machines,lost.state.machines);check('20 returns, heap/GPU resource measurements, save/load/reload; explicitly prepared dead branch restores full played checkpoint after loss');
 assert.equal(errors.length,0,errors.join('\n'));await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,timings:{visit:stats(timings.filter(t=>t.kind==='visit').map(t=>t.ms)),home:stats(timings.filter(t=>t.kind==='home').map(t=>t.ms)),order:timings.filter(t=>t.kind==='order')},combat:combatMetrics,returnsGpuTime,frames:stats(await page.evaluate(()=>window.stateFrameTimes())),memory,build:await page.locator('script[type=module]').getAttribute('src'),prepared:'Byte-identical actual E continuation, alternate branches via normal file import. No prepared F money, machines, defense, damage or capture. Only dead checkpoint input constructed offline from played exports. Native UI/RAF; no live state/localStorage writes or time acceleration.',defenseCheckpoint:defenseCheckpoint.file},null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,clicks:await page.evaluate(()=>window.defenseClicks),state:await read()},null,2));throw error;}finally{await browser.close();}
