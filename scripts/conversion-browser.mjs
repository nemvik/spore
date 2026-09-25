/** SP-009.H actual G continuation; no live writes/time shim. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.CONVERSION_OUTPUT??'evidence/sp-009h/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5215';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {conversionResponse,conversionProgress,conversionQuote,conversionSite}=await ssr.ssrLoadModule('/src/game/conversion.ts');await ssr.close();
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
async function ritual(wrong=false){
 let s=await read(),c=city(s),q=conversionQuote(s,c);await walkTo(conversionSite(s,c));
 s=await read();c=city(s);q=conversionQuote(s,c);const correct=conversionResponse(q.token.situation,q.progress),answer=wrong?['sharing','peace','memory'].find(v=>v!==correct):correct;
 const before=s.machines.resource,n=c.conversion.events.length,start=performance.now();await action('conversion:'+answer);
 await page.waitForFunction(n=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).conversion.events.length>n;},n);
 timings.push({kind:'ritual',ms:performance.now()-start});s=await read();assert.equal(s.machines.resource,before-20);assert.equal(conversionProgress(city(s)),wrong?Math.max(0,q.progress-1):q.progress+1);
}
async function complete(){
 let s=await read();await walkTo(city(s).address.position,4);await action('conversion:offer');await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'conversion:confirm');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'conversion:cancel');await page.keyboard.press('Space');assert.equal(conversionProgress(city(await read())),conversionProgress(city(s)));
 await action('conversion:offer');const before=await read(),t=performance.now();await page.keyboard.press('Space');
 await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).owner.kind==='lineage';});timings.push({kind:'settlement',ms:performance.now()-t});
 s=await read();assert.equal(s.machines.resource,before.machines.resource-20);assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Náboženské převzetí dokončeno');const receipt=city(s).transfers.at(-1);assert.equal(receipt.method,'conversion');await page.keyboard.press('Space');assert.equal(city(await read()).transfers.length,city(s).transfers.length);return receipt;
}
try{
 const initial=await imported(path.resolve('tests/fixtures/geography/sp-009g-trade.save.json'));
 const targets=initial.cities.entries.filter(c=>c.owner.kind==='state').map(c=>c.id),inherited=initial.cities.entries.filter(c=>c.transfers.length||c.capture).map(c=>({id:c.id,capture:c.capture,transfers:c.transfers}));
 await visit(targets[0]);await action('city-camera');await page.setViewportSize({width:1024,height:640});assert.match(await page.locator('#conversion-panel').innerText(),/Doma chybí/);await shot('insufficient-1024');
 await action('travel-home');const incomeStart=await read(),started=performance.now();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=290,null,{timeout:185000});
 const funded=await exported('earned-home');const income={start:incomeStart.machines.resource,end:funded.state.machines.resource,elapsedRealMs:performance.now()-started,ticks:funded.state.tick-incomeStart.tick,rate:1.8};
 assert.ok(Math.abs(income.end-income.start-income.ticks/60*1.8)<.04);
 check('Actual G imported, shortage shown; original home springs earn ritual funds at native B1 rate, no prepared money');
 await action('close');await visit(targets[0]);await ritual();
 const partial=await exported('partial-conversion');await action('close');
 await action('pause');const frozen=durable(await read());await page.waitForTimeout(650);assert.deepEqual(durable(await read()),frozen);await action('building-open');await action('building:new,house');await page.waitForTimeout(650);assert.deepEqual(durable(await read()),frozen);await action('building:cancel');await action('building:close');await action('close');
 await page.keyboard.press('n');const globe=durable(await read());await page.waitForTimeout(650);assert.deepEqual(durable(await read()),globe);await page.keyboard.press('n');
 await action('travel-home');await visit(targets[0]);assert.equal(conversionProgress(city(await read())),1);
 await imported(partial.file);assert.equal(conversionProgress(city(await read())),1);
 await ritual(true);assert.match((await read()).navigation.notice,/odmítli/);await page.locator('#conversion-panel').scrollIntoViewIfNeeded();await shot('resistance-1024');
 await ritual();await ritual();await ritual();let s=await read();assert.equal(conversionProgress(city(s)),3);await walkTo(city(s).address.position,4);
 // A displayed final command becomes stale when actual local production changes food.
 await action('conversion:offer');const cycle=city(await read()).economy.cycle;
 await page.waitForFunction(n=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).economy.cycle>n;},cycle,{timeout:15000});
 const stale=await read();await action('conversion:confirm');assert.equal(city(await read()).owner.kind,'state');assert.equal((await read()).machines.resource,stale.machines.resource);assert.match((await read()).navigation.notice,/Zastaralý/);
 await action('conversion:offer');await page.locator('.conversion-confirm').scrollIntoViewIfNeeded();await shot('ready-1024');await action('conversion:cancel');
 const before=(await exported('before-conversion')).state;await action('close');const receipt=await complete();s=await read();
 assert.deepEqual(s.states.entries.map(r=>[r.reserve,r.tradeReserve]),before.states.entries.map(r=>[r.reserve,r.tradeReserve]));assert.deepEqual(s.machines.fleet,before.machines.fleet);assert.deepEqual(s.military,before.military);assert.equal(city(s).defense.health,62);assert.equal(city(s).fortification,80);assert.equal(receipt.spent,120);
 for(const old of inherited){const c=s.cities.entries.find(c=>c.id===old.id);assert.deepEqual([c.capture,c.transfers],[old.capture,old.transfers]);}
 await action('city-econ:fund');await action('city-econ:confirm');const economy=city(await read()).economy.cycle;
 await page.waitForFunction(n=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).economy.cycle>n;},economy,{timeout:15000});
 await action('city-camera');await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('converted-1024');
 check('Walked rites, wrong response and lost seal, preserved partial save/rekey, pause/editor/library/global, return/resume, stale and cancelled finish; keyboard completion once and paid city economy, original E/F/G intact');
 await visit(targets[1]);assert.match(await page.locator('#trade-panel').innerText(),/poslední/);s=await read();assert.equal(conversionQuote(s,city(s)).required,4);
 for(let i=0;i<4;i++)await ritual();const lastReceipt=await complete();assert.equal(lastReceipt.spent,100);
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).states.entries.every(r=>r.last.reason.includes('poslední')),null,{timeout:15000});
 s=await read();assert.deepEqual(s.states.entries.map(r=>[r.reserve,r.tradeReserve]),[[0,203],[40,0]]);assert.equal(s.military.raids.length,1);
 await action('city-camera');await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('last-city-1024');
 check('Second actual city requires four rites despite trade refusal; conversion defeats Liga with reserve 40 frozen; Svaz retains frozen G price 203, no new raid or unit');
 const camera=(await read()).fieldCamera;await page.mouse.move(320,330);await page.mouse.down({button:'right'});await page.mouse.move(390,355,{steps:6});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-180);assert.notDeepEqual((await read()).fieldCamera,camera);
 await page.evaluate(()=>window.resetTradeFrames());await measure(0);await startGpu();
 for(let i=1;i<=20;i++){
  const t=performance.now();await action('travel-home');await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).navigation.field);timings.push({kind:'home',ms:performance.now()-t});await visit(targets[1]);
  const st=performance.now();await page.locator('#conversion-panel summary').click();await page.locator('#conversion-panel details[open]').waitFor();await page.locator('#conversion-panel summary').click();timings.push({kind:'receipt',ms:performance.now()-st});if(i===10||i===20)await measure(i);
 }
 const gpuTime=await page.evaluate(()=>window.stopTradeGpu?.()??window.tradeGpu),returnFrames=stats(await page.evaluate(()=>window.stateFrameTimes()));assert.ok(gpuTime.samplesMs.length>0);
 await page.getByText('Pravidla boje a úplná historie vlastníků',{exact:true}).click();await page.locator('#military-panel details[open] ol').scrollIntoViewIfNeeded();assert.match(await page.locator('#military-panel details[open] ol').innerText(),/H · konverze/);await shot('history-h-1024');
 for(const [kind,id] of [['ef',inherited.find(c=>c.capture).id],['g',inherited.find(c=>c.transfers.some(t=>t.method==='trade')).id]]){
  await visit(id);await page.getByText('Pravidla boje a úplná historie vlastníků',{exact:true}).click();await page.locator('#military-panel details[open] ol').scrollIntoViewIfNeeded();const text=await page.locator('#military-panel details[open] ol').innerText();assert.match(text,kind==='ef'?/E ·[\s\S]*F ·/:/G · obchod/);await shot('history-'+kind+'-1024');
 }
 await visit(targets[1]);
 await action('city-camera');await page.setViewportSize({width:1280,height:720});await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('converted-1280');
 const final=await exported('active-campaign');await imported(final.file);await action('pause');await action('save');await action('saves');const loadAction=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(loadAction);await action('pause');
 s=await read();assert.deepEqual(s.cities.entries.map(c=>[c.transfers,c.conversion]),final.state.cities.entries.map(c=>[c.transfers,c.conversion]));
 check('20 return/history cycles, real draw-call GPU timers separate from buffers/heap; normal camera, export/import/rekey/save/reload/load preserve all receipts');
 // Only the death trigger/checkpoint placement is prepared offline, from two real UI exports.
 const dead=JSON.parse(await readFile(final.file,'utf8')),cp=structuredClone(partial.state);cp.id=dead.state.id;cp.checkpoint=null;dead.state.checkpoint=JSON.stringify(cp);dead.state.player.health=0;dead.state.deathReason='Připravený spouštěč obnovy SP-009.H';const file=path.join(out,'prepared-checkpoint.save.json');await writeFile(file,JSON.stringify(dead));await imported(file,'death');await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="recover"]'))window.tradeRecovery=JSON.parse(window.render_game_to_text());}));await action('recover');await action('pause');
 s=await page.evaluate(()=>window.tradeRecovery);assert.deepEqual(durable(s),durable(partial.state));await exported('restored-checkpoint');
 check('Explicitly prepared death trigger restores the entire actually played one-seal branch, accounts, E/F/G/H and ownership, without refund or merge');
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,income,timings:Object.fromEntries(['visit','home','receipt','ritual','settlement'].map(k=>[k,stats(timings.filter(t=>t.kind===k).map(t=>t.ms))])),gpuTime,memory,frames:returnFrames,receipt,lastReceipt,build:await page.locator('script[type=module]').getAttribute('src'),prepared:'Byte-identical G export. All H funds/rites/walking/conversions/economy through native UI and real RAF. Only offline death/checkpoint trigger prepared from actual exports. No live game/localStorage writes or time acceleration.'},null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,state:await read()},null,2));throw error;}finally{await browser.close();}
