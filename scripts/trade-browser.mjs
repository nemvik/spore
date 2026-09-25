/** SP-009.G actual F continuation; no live writes/time shim. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.TRADE_OUTPUT??'evidence/sp-009g/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5214';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');await ssr.close();
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
  const info={available:!!ext,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),samplesMs:[]};window.tradeGpu=info;
  if(!ext)return info;
  const native=window.requestAnimationFrame,queries=[],draws=['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'].map(name=>[name,gl[name]]);let measured=0,drawCount=0;
  for(const [name,fn] of draws)gl[name]=function(...args){drawCount++;return fn.apply(this,args);};
  window.requestAnimationFrame=cb=>native(t=>{if(measured>=120){cb(t);return;}const q=gl.createQuery();const before=drawCount;gl.beginQuery(ext.TIME_ELAPSED_EXT,q);cb(t);gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push({q,draws:drawCount-before});measured++;});
  window.stopTradeGpu=()=>{window.requestAnimationFrame=native;for(const [name,fn] of draws)gl[name]=fn;for(const {q,draws:count} of queries){if(count>0&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))info.samplesMs.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}return info;};return info;
 });
 const durable=s=>({cities:s.cities,states:s.states,military:s.military,machines:s.machines});
 async function measure(n){await cdp.send('HeapProfiler.collectGarbage');memory.push({n,heap:await cdp.send('Runtime.getHeapUsage'),render:(await read()).render,buffers:await page.evaluate(()=>window.stateBuffers())});}
try{
 const initial=await imported(path.resolve('tests/fixtures/geography/sp-009f-defense.save.json'));
 const target=initial.cities.entries.find(c=>c.owner.id===initial.states.entries[0].id).id;
 const inherited=initial.cities.entries.find(c=>c.capture),oldHistory=structuredClone([inherited.capture,inherited.transfers]);
 await visit(target);await action('city-camera');await page.setViewportSize({width:1024,height:640});
 assert.match(await page.locator('#trade-panel').innerText(),/doma chybí/);assert.ok(await page.locator('[data-action="trade:offer"]').isDisabled());await shot('insufficient-1024');
 await action('travel-home');const incomeStart=await read();const started=performance.now();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=235,null,{timeout:160000});
 const funded=await exported('earned-home');assert.ok(funded.state.machines.resource>=235);const income={start:incomeStart.machines.resource,end:funded.state.machines.resource,elapsedRealMs:performance.now()-started,ticks:funded.state.tick-incomeStart.tick,source:'Two original owned springs, B1 rate 1.8 per active home second'};
 check('Actual F import, insufficient home money, then native home play earns purchase funds from original springs; no prepared money or trade history');
 await action('close');await visit(target);await action('city-camera');
 await action('pause');const frozen=durable(await read());await page.waitForTimeout(650);assert.deepEqual(durable(await read()),frozen);await action('building-open');await action('building:new,house');await page.waitForTimeout(650);assert.deepEqual(durable(await read()),frozen);await action('building:cancel');await action('building:close');await action('close');
 await page.keyboard.press('n');const globe=durable(await read());await page.waitForTimeout(650);assert.deepEqual(durable(await read()),globe);await page.keyboard.press('n');
 // A real local cycle invalidates an already displayed offer; no money is reserved.
 await action('trade:offer');const q0=await read(),cycle=city(q0).economy.cycle;
 await page.waitForFunction(n=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).economy.cycle>n;},cycle,{timeout:15000});
 const beforeStale=await read();await action('trade:confirm');let s=await read();assert.equal(city(s).owner.kind,'state');assert.equal(s.machines.resource,beforeStale.machines.resource);assert.match(s.navigation.notice,/zastaralá/);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'trade:offer');
 await action('trade:offer');await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'trade:confirm');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'trade:cancel');await page.keyboard.press('Space');assert.equal(city(await read()).owner.kind,'state');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'trade:offer');
 // Freeze a real pre-sale export for branch restoration, not an invented result.
 const beforeSale=await exported('before-sale');await action('close');await action('trade:offer');
 await page.locator('.trade-confirm').scrollIntoViewIfNeeded();await shot('offer-1024');
 const before=await read(),t=performance.now();await page.keyboard.press('Space');
 await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).owner.kind==='lineage';});timings.push({kind:'settlement',ms:performance.now()-t});
 s=await read();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Obchodní převzetí dokončeno');const receipt=city(s).transfers.at(-1);assert.equal(receipt.method,'trade');assert.equal(s.machines.resource,before.machines.resource-receipt.price);assert.equal(s.states.entries[0].reserve,0);assert.equal(s.states.entries[0].tradeReserve,receipt.price);assert.deepEqual(s.machines.fleet,before.machines.fleet);assert.deepEqual(s.military,before.military);assert.equal(city(s).defense.health,before.cities.entries.find(c=>c.id===target).defense.health);assert.equal(city(s).fortification,80);
 assert.deepEqual([s.cities.entries.find(c=>c.capture).capture,s.cities.entries.find(c=>c.capture).transfers],oldHistory);
 await page.keyboard.press('Space');assert.equal(city(await read()).transfers.length,1);
 await action('city-econ:fund');await action('city-econ:confirm');const fundedCycle=city(await read()).economy.cycle;
 await page.waitForFunction(n=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).economy.cycle>n&&s.states.entries[0].last.reason.includes('poslední');},fundedCycle,{timeout:15000});
 await action('city-camera');const cameraBefore=(await read()).fieldCamera;await page.mouse.move(320,330);await page.mouse.down({button:'right'});await page.mouse.move(390,355,{steps:6});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-180);assert.notDeepEqual((await read()).fieldCamera,cameraBefore);
 await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('purchased-1024');
 check('Pause/editor/library/global freeze; stale-cycle and cancelled offers pay nothing; keyboard Space settles last city once, preserves E/F/guard health, then paid economy and defeated-state refusal continue');
 await page.evaluate(()=>window.resetTradeFrames());await measure(0);await startGpu();
 for(let i=1;i<=20;i++){
  const start=performance.now();await action('travel-home');await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).navigation.field);timings.push({kind:'home',ms:performance.now()-start});await visit(target);
  const startPanel=performance.now();await page.locator('#trade-panel summary').click();await page.locator('#trade-panel details[open]').waitFor();await page.locator('#trade-panel summary').click();timings.push({kind:'receipt',ms:performance.now()-startPanel});if(i===10||i===20)await measure(i);
 }
 const gpuTime=await page.evaluate(()=>window.stopTradeGpu?.()??window.tradeGpu),returnFrames=stats(await page.evaluate(()=>window.stateFrameTimes()));
 await action('city-camera');await page.setViewportSize({width:1280,height:720});await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('purchased-1280');
 const final=await exported('active-campaign');await imported(final.file);await action('pause');await action('save');await action('saves');const loadAction=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(loadAction);await action('pause');
 s=await read();assert.deepEqual(city(s).transfers,final.state.cities.entries.find(c=>c.id===target).transfers);assert.equal(s.states.entries[0].tradeReserve,receipt.price);
 check('20 returns and receipt open/close operations, measured heap/WebGL/GPU time; exported active G save and normal rekey/save/reload/load retain payment and full history');
 // Alternate played branch reuses actually earned funds, not an edited balance.
 await imported(funded.file);const bronze=(await read()).cities.entries.find(c=>c.owner.id===initial.states.entries[1].id).id;await visit(bronze);await action('trade:offer');await action('trade:confirm');s=await read();assert.equal(city(s).owner.kind,'lineage');assert.equal(s.states.entries[1].tradeReserve,140);
 const remaining=s.cities.entries.find(c=>c.owner.id===initial.states.entries[1].id).id;await visit(remaining);assert.match(await page.locator('#trade-panel').innerText(),/odmítá prodat poslední/);assert.ok(await page.locator('[data-action="trade:offer"]').isDisabled());const raids=structuredClone((await read()).military.raids);await page.waitForTimeout(10500);assert.deepEqual((await read()).military.raids,raids);await page.setViewportSize({width:1024,height:640});await action('city-camera');await page.locator('#trade-panel').scrollIntoViewIfNeeded();await shot('refusal-1024');await exported('nonlast-sale');
 check('Alternate branch from genuinely earned home export: 140-price non-last purchase, remaining solvent last city refuses; sale itself causes no F counterattack');
 // Only this death/checkpoint trigger is prepared offline from two played exports.
 const dead=JSON.parse(await readFile(final.file,'utf8')),cp=structuredClone(beforeSale.state);cp.id=dead.state.id;cp.checkpoint=null;dead.state.checkpoint=JSON.stringify(cp);dead.state.player.health=0;dead.state.deathReason='Připravený spouštěč obnovy SP-009.G';const file=path.join(out,'prepared-checkpoint.save.json');await writeFile(file,JSON.stringify(dead));await imported(file,'death');await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="recover"]'))window.tradeRecovery=JSON.parse(window.render_game_to_text());}));await action('recover');await action('pause');
 s=await page.evaluate(()=>window.tradeRecovery);assert.deepEqual(durable(s),durable(beforeSale.state));await exported('restored-checkpoint');
 check('Explicitly offline prepared death trigger restores the entire played pre-sale branch, both accounts, E/F history and ownership without merging or extra refund');
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,income,timings:Object.fromEntries(['visit','home','receipt','settlement'].map(k=>[k,stats(timings.filter(t=>t.kind===k).map(t=>t.ms))])),gpuTime,memory,frames:returnFrames,receipt,build:await page.locator('script[type=module]').getAttribute('src'),prepared:'Byte-identical actual F save. All new funds, offers, settlements and economy played through normal UI/native RAF. Alternate purchase starts from actual earned-home export. Only death/checkpoint trigger is prepared offline; both branches are actual UI exports. No live writes or time acceleration.'},null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,state:await read()},null,2));throw error;}finally{await browser.close();}
