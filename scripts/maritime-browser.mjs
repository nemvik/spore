/** SP-009.I: actual H continuation, native RAF and public UI only. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.MARITIME_OUTPUT??'evidence/sp-009i/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5216';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {seaRoute,isCoast}=await ssr.ssrLoadModule('/src/game/maritime.ts');
const {planetAtlas}=await ssr.ssrLoadModule('/src/game/planet-geography.ts');
await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
const cdp=await context.newCDPSession(page);
await page.addInitScript(()=>{
 window.tradeClicks=[];document.addEventListener('click',e=>{const a=e.target.closest?.('[data-action]')?.getAttribute('data-action');if(a){window.tradeClicks.push(a);if(window.tradeClicks.length>80)window.tradeClicks.shift();}},true);
 const counts={created:0,deleted:0},live=new WeakSet();for(const API of [WebGLRenderingContext,WebGL2RenderingContext]){const create=API.prototype.createBuffer,remove=API.prototype.deleteBuffer;API.prototype.createBuffer=function(){const b=create.call(this);if(b&&!live.has(b)){live.add(b);counts.created++;}return b;};API.prototype.deleteBuffer=function(b){if(b&&live.has(b)){live.delete(b);counts.deleted++;}return remove.call(this,b);};}
 window.stateBuffers=()=>({...counts,live:counts.created-counts.deleted});
 const frames=[];let last=0;function frame(t){if(last&&frames.length<20000)frames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);window.stateFrameTimes=()=>frames.slice();window.resetTradeFrames=()=>{frames.length=0;last=0;};
});
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>page.locator(`button[data-action="${name}"]:visible`).first().click();
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const check=label=>{checks.push(label);console.log(label);};
async function imported(file,expected='game'){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(mode=>JSON.parse(window.render_game_to_text()).mode===mode,expected);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();}
async function exported(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
const stats=v=>{v=[...v].sort((a,b)=>a-b);return {n:v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)};};
const startGpu=()=>page.evaluate(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const info={available:!!ext,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),samplesMs:[],sampleDraws:[]};window.tradeGpu=info;
  if(!ext)return info;
  const native=window.requestAnimationFrame,queries=[],draws=['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'].map(name=>[name,gl[name]]);let measured=0,drawCount=0;
  for(const [name,fn] of draws)gl[name]=function(...args){drawCount++;return fn.apply(this,args);};
  window.requestAnimationFrame=cb=>native(t=>{if(measured>=120){cb(t);return;}const q=gl.createQuery();const before=drawCount;gl.beginQuery(ext.TIME_ELAPSED_EXT,q);cb(t);gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push({q,draws:drawCount-before});measured++;});
  window.stopTradeGpu=()=>{window.requestAnimationFrame=native;for(const [name,fn] of draws)gl[name]=fn;for(const {q,draws:count} of queries){if(count>0&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT)){info.samplesMs.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);info.sampleDraws.push(count);}gl.deleteQuery(q);}return info;};return info;
 });
 async function measure(n){await cdp.send('HeapProfiler.collectGarbage');memory.push({n,heap:await cdp.send('Runtime.getHeapUsage'),render:(await read()).render,buffers:await page.evaluate(()=>window.stateBuffers())});}
async function walkTo(p,tolerance=1.5){
 const start=Date.now();
 // Follow the original expedition controls; no teleport, state write, or accelerated time.
 await page.locator('canvas').first().click({position:{x:400,y:300}});
 while(Date.now()-start<45000){
  const s=await read(),q=s.navigation.field.position,dx=p.x-q.x,dz=p.z-q.z;if(Math.hypot(dx,dz)<=tolerance)return;
  const yaw=s.camera.yaw,localX=dx*Math.cos(yaw)-dz*Math.sin(yaw),localZ=dx*Math.sin(yaw)+dz*Math.cos(yaw);
  const keys=[];if(Math.abs(localX)>tolerance*.5)keys.push(localX>0?'d':'a');if(Math.abs(localZ)>tolerance*.5)keys.push(localZ>0?'s':'w');
  for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(Math.min(250,Math.max(35,Math.hypot(dx,dz)/8*700)));for(const k of keys)await page.keyboard.up(k);
 }
 throw Error('Native walk did not reach '+JSON.stringify(p));
}

const last=s=>s.maritime.journeys.at(-1);
async function select(to){if((await read()).navigation.mode!=='global')await page.keyboard.press('n');await page.locator('#atlas-cell').fill(String(to));await page.locator('#atlas-cell').press('Tab');await page.locator('#sea-panel').scrollIntoViewIfNeeded();}
async function depart(to){await select(to);await action('sea:offer-sail');await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'sea:confirm');const start=performance.now();await page.keyboard.press('Space');await page.locator('#sailing-status').waitFor();timings.push({kind:'depart',ms:performance.now()-start});}
async function land(){await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text()),j=s.maritime.journeys.at(-1);return j.phase==='returning'?j.progress<1e-8:j.progress>=j.route.length-1-1e-8;},null,{timeout:30000});const t=performance.now();await action('sea:land');await page.waitForFunction(()=>!['outbound','returning'].includes(JSON.parse(window.render_game_to_text()).maritime.journeys.at(-1).phase));timings.push({kind:'land',ms:performance.now()-t});}
let summary={};
try{
 const inputFile=path.resolve('tests/fixtures/geography/sp-009h-conversion.save.json'),source=parseGame(await readFile(inputFile,'utf8'));
 await imported(inputFile);await action('travel-home');await select(1171);
 assert.equal(await page.locator('[data-action="travel-enter"]').isDisabled(),true);
 assert.equal(await page.locator('[data-action="sea:offer-buy"]').isDisabled(),true);
 await page.setViewportSize({width:1024,height:640});await shot('shortage-1024');
 await page.keyboard.press('n');const begin=await read(),started=performance.now();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=140,null,{timeout:65000});
 const earned=await exported('earned-home');summary.income={before:begin.machines.resource,after:earned.state.machines.resource,ticks:earned.state.tick-begin.tick,realMs:performance.now()-started};
 assert.ok(Math.abs(summary.income.after-summary.income.before-summary.income.ticks/60*1.8)<.04);
 await action('close');await select(1171);await action('sea:offer-buy');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'sea:cancel');await page.keyboard.press('Space');assert.equal((await read()).maritime.vessel,null);
 await action('sea:offer-buy');await action('city-select:'+source.cities.entries[0].id);assert.equal(await page.locator('.sea-confirm').count(),0);await select(1171);await action('sea:offer-buy');const pre=await read();await page.keyboard.press('Space');const purchased=await read();assert.equal(purchased.machines.resource,pre.machines.resource-56);assert.equal(purchased.maritime.vessel.payment.amount,56);await page.keyboard.press('Space');assert.equal((await read()).machines.resource,purchased.machines.resource);
 await shot('paid-1024');const paid=await exported('paid-vessel');await action('close');
 check('Actual H funds earned at 1.8/s; shortage, cancellation, paid vessel56, native focus and double confirmation verified');
 await select(1171);await action('sea:offer-sail');await action('city-select:'+source.cities.entries[0].id);assert.equal(await page.locator('.sea-confirm').count(),0);await depart(1171);await page.waitForTimeout(700);await action('pause');const stopped=await read();await page.waitForTimeout(550);assert.deepEqual((await read()).maritime,stopped.maritime);assert.deepEqual((await read()).states,stopped.states);
 await action('building-open');await action('building:new,house');await page.waitForTimeout(450);assert.deepEqual((await read()).maritime,stopped.maritime);await action('building:cancel');await action('building:close');await action('close');
 await page.keyboard.press('n');const globe=await read();await page.waitForTimeout(550);assert.deepEqual((await read()).maritime,globe.maritime);await page.keyboard.press('n');
 const cp=await exported('sailing-checkpoint');await imported(cp.file);assert.equal(last(await read()).id,1);
 await action('sea:turn');await page.waitForTimeout(100);await shot('returning-1024');await land();assert.equal(last(await read()).phase,'returned');assert.equal((await read()).maritime.vessel.mooring,1614);
 await select(1171);const departure=await exported('departure');await action('close');await depart(1171);await page.locator('#sailing-status details summary').click();await page.waitForTimeout(1100);assert.equal(await page.locator('#sailing-status details').getAttribute('open'),'');await startGpu();await page.waitForTimeout(1700);await action('sea:camera-left');await action('sea:camera-in');const camera=(await read()).seaCamera;await shot('sailing-1024');await page.locator('#sea-heading').scrollIntoViewIfNeeded();await shot('sailing-status-1024');await page.waitForTimeout(500);summary.gpu=await page.evaluate(()=>window.stopTradeGpu());
 const crossing=await exported('crossing');assert.deepEqual(crossing.state.worlds,departure.state.worlds);assert.deepEqual(crossing.state.player,departure.state.player);assert.deepEqual(crossing.state.machines,departure.state.machines);
 await imported(crossing.file);assert.equal(last(await read()).phase,'outbound');await land();
 let s=await read();assert.equal(s.navigation.field.cellId,1171);assert.equal(s.cities.entries.length,source.cities.entries.length);assert.equal(s.maritime.vessel.id,paid.state.maritime.vessel.id);
 await action('travel-home');assert.equal((await read()).navigation.field.cellId,1171);
 for(const p of s.navigation.field.world.patches){await walkTo(p.center);await page.keyboard.press('e');}
 await walkTo({x:-60,z:-40});assert.equal((await read()).navigation.field.world.patches.filter(p=>p.discovered).length,3);
 const name=page.locator('#city-name');await name.fill('Zátoka za mořem');const amber=(await read()).machines.resource;await action('city-found');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).cities.entries.length===6);assert.equal((await read()).machines.resource,amber-60);
 await action('city-camera');await shot('landed-city-1024');await exported('settled');await action('close');
 check('Pause/editor/global/save/import freeze respected; interrupted route returns; paid crossing lands, three measurements and original city60 played without live writes');
 await depart(1614);await land();assert.equal((await read()).maritime.vessel.mooring,1614);
 const atlas=planetAtlas(source.homePlanet),short=atlas.cells.filter(c=>isCoast(source,c.id)&&c.id!==1614).map(c=>({id:c.id,route:seaRoute(source,1614,c.id)})).filter(v=>v.route&&v.id!==1613).sort((a,b)=>a.route.length-b.route.length||a.id-b.id).find(v=>!atlas.anchors.some(a=>a.cellId===v.id));
 summary.repeatedTarget=short;await measure(0);await page.evaluate(()=>window.resetTradeFrames());
 for(let i=1;i<=20;i++){await depart(short.id);await land();await depart(1614);await land();if(i===10||i===20)await measure(i);}
 summary.frames=stats(await page.evaluate(()=>window.stateFrameTimes()));const fin=await exported('active-campaign');
 assert.deepEqual(fin.state.states.entries.map(r=>[r.reserve,r.tradeReserve]),[[0,203],[40,0]]);
 summary.accounting={initial:source.machines.resource,earned:(fin.state.tick-source.tick)/60*1.8,boat:56,city:60,final:fin.state.machines.resource};assert.ok(Math.abs(summary.accounting.initial+summary.accounting.earned-116-summary.accounting.final)<1e-7);
 for(const old of source.cities.entries){const now=fin.state.cities.entries.find(c=>c.id===old.id);assert.deepEqual([now.capture,now.transfers,now.conversion,now.owner],[old.capture,old.transfers,old.conversion,old.owner]);}
 assert.deepEqual(fin.state.machines.fleet,source.machines.fleet);assert.equal(fin.state.maritime.vessel.payment.amount,56);
 await imported(fin.file);const rekeyed=await exported('rekeyed');await action('close');await action('save');await page.reload();await action('saves');await action('load:'+rekeyed.state.id);assert.equal((await read()).maritime.journeys.length,fin.state.maritime.journeys.length);
 await select(1171);assert.equal(await page.locator('[data-action="travel-enter"]').isDisabled(),true);await shot('final-route-1024');await page.setViewportSize({width:1280,height:720});await shot('final-route-1280');
 check('Same vessel returns; twenty native repeated round-trips, stable historical E/F/G/H and frozen state accounts; save/reload/import/rekey preserve naval history');
 // Explicit prepared death trigger only: checkpoint is a genuine earlier UI export.
 const dead=structuredClone(fin.state),checkpoint=structuredClone(crossing.state);checkpoint.id=dead.id;checkpoint.checkpoint=null;dead.checkpoint=JSON.stringify(checkpoint);dead.player.health=0;dead.deathReason='Připravený test obnovy námořní větve';
 const deadFile=path.join(out,'prepared-death.save.json');await writeFile(deadFile,JSON.stringify({format:'lumavora',version:3,savedAt:0,state:dead}));parseGame(await readFile(deadFile,'utf8'));
 await imported(deadFile,'death');
 const recovered=await page.evaluate(()=>{document.querySelector('button[data-action="recover"]').click();return JSON.parse(window.render_game_to_text());});
 assert.deepEqual(recovered.maritime,checkpoint.maritime);assert.deepEqual(recovered.machines,checkpoint.machines);assert.deepEqual(recovered.cities,checkpoint.cities);assert.deepEqual(recovered.states,checkpoint.states);
 check('Prepared death restores complete actual in-flight checkpoint branch, no merged payments, ship, settlements or progress');
 summary={...summary,build:await page.locator('script[type=module]').getAttribute('src'),checks,errors,timings,memory,latency:Object.fromEntries([...new Set(timings.map(t=>t.kind))].map(k=>[k,stats(timings.filter(t=>t.kind===k).map(t=>t.ms))])),camera,final:{resource:fin.state.machines.resource,vessel:fin.state.maritime.vessel,journeys:fin.state.maritime.journeys.length,cities:fin.state.cities.entries.length}};
 await writeFile(path.join(out,'results.json'),JSON.stringify(summary,null,2));assert.deepEqual(errors,[]);
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),summary,timings,memory,checks,errors,state:await read().catch(()=>null)},null,2));throw error;}
finally{await context.close();await browser.close();}
