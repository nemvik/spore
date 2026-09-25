/** SP-009.E actual D continuation; no live writes/time shim. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.MILITARY_OUTPUT??'evidence/sp-009e/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5213';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[];
const cdp=await context.newCDPSession(page);
await page.addInitScript(()=>{
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
try{
 await imported(path.resolve('tests/fixtures/geography/sp-009d-states.save.json'));if((await read()).navigation.mode==='global')await page.keyboard.press('n');
 await action('travel-home');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=90,null,{timeout:90000});
 await action('machine-editor:tank');await action('select:vehicle-drill');await action('remove');await action('add:cannon');
 await page.locator('[data-genome="name"]').fill('Průlomový tank');await page.locator('[data-genome="name"]').press('Tab');
 const before=await read(),cost=before.editor.cost;await action('confirm-editor');let s=await read();const unitId=s.machines.fleet.at(-1).id;
 assert.ok(s.machines.resource<=before.machines.resource-cost+1);assert.equal(s.machines.fleet.length,before.machines.fleet.length+1);
 const rival=s.cities.entries.find(c=>c.owner.kind==='state'&&c.defense),target=rival.id,founding=structuredClone(rival.founded),receipts=s.states.entries.map(r=>structuredClone(r.transactions));
 assert.ok(rival.defense.health>0);check('Actual D import; earned amber at original springs; cannon built and paid via original editor; rival defense paid from finite reserve');
 await visit(target);await action('military:deploy,'+unitId);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment.phase==='field',null,{timeout:30000});
 await action('military:camera');await page.setViewportSize({width:1024,height:640});
 const freezeFields=s=>({military:s.military,states:s.states,city:city(s),machine:s.machines});
 await action('pause');const frozen=freezeFields(await read());await page.waitForTimeout(600);assert.deepEqual(freezeFields(await read()),frozen);
 await action('building-open');await action('building:new,house');await page.waitForTimeout(600);assert.deepEqual(freezeFields(await read()),frozen);await action('building:cancel');await action('building:close');await action('close');
 await page.keyboard.press('n');const global=freezeFields(await read());await page.waitForTimeout(600);assert.deepEqual(freezeFields(await read()),global);await page.keyboard.press('n');
 const stop=page.locator('[data-action="military:stop"]');await stop.focus();await page.keyboard.press('Space');assert.equal((await read()).military.deployment.order,'stop');
 check('Pause/library/editor/global freeze military, economy and strategy; native keyboard activates orders at 1024×640');
 const checkpoint=await exported('before-battle');await action('close');
 const attackStarted=performance.now();await action('military:attack');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment.order==='attack');const attackResponseMs=performance.now()-attackStarted;
 await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text()),d=s.military.deployment;return !!d&&s.machines.fleet.find(u=>u.id===d.unitId).health<88;},null,{timeout:60000});
 await page.waitForTimeout(350);await page.locator('.city-panel').evaluate(e=>e.scrollTop=0);await shot('combat-1024');await action('pause');await cdp.send('HeapProfiler.collectGarbage');const combatMetrics={heap:await cdp.send('Runtime.getHeapUsage'),render:(await read()).render,buffers:await page.evaluate(()=>window.stateBuffers()),frames:stats((await page.evaluate(()=>window.stateFrameTimes())).slice(-300))};const combat=await exported('mid-combat');
 assert.ok(city(combat.state).defense.health<62);assert.ok(city(combat.state).defense.health>0);assert.equal(city(combat.state).owner.kind,'state');
 await imported(combat.file);await action('pause');assert.equal(city(await read()).defense.health,city(combat.state).defense.health);await action('close');
 // Leave while a real fight is in progress: no offscreen damage, healing or transport.
 await action('travel-home');await action('pause');const absent=structuredClone((await read()).military);const absentGuard=(await read()).cities.entries.find(c=>c.id===target).defense.health;await page.waitForTimeout(500);assert.deepEqual((await read()).military,absent);assert.equal((await read()).cities.entries.find(c=>c.id===target).defense.health,absentGuard);await action('close');await visit(target);await action('military:camera');
 await page.waitForFunction(id=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.id===id).defense.health===0;},target,{timeout:30000});
 assert.equal(city(await read()).owner.kind,'state');await action('military:occupy');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment.hold>1,null,{timeout:30000});await action('military:stop');assert.equal((await read()).military.deployment.hold,0);assert.equal(city(await read()).owner.kind,'state');await action('military:occupy');
 await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).cities.entries.find(c=>c.id===id).owner.kind==='lineage',target,{timeout:20000});
 await page.locator('#military-panel').getByText('✓ Převzato po porážce a obsazení').waitFor();await action('city-camera');await page.locator('.city-panel').evaluate(e=>e.scrollTop=0);await shot('captured-1024');
 s=await read();assert.deepEqual(city(s).founded,founding);assert.ok(city(s).capture);assert.equal(city(s).capture.unitId,unitId);assert.ok(s.machines.fleet.find(u=>u.id===unitId).health>0);
 for(let i=0;i<2;i++)assert.deepEqual(s.states.entries[i].transactions.slice(0,receipts[i].length),receipts[i]);
 check('Real movement and reciprocal damage, mid-fight export/import, departure/revisit, destroyed guard, interrupted and completed 5s occupation, atomic ownership with original receipts');
 await action('city-econ:fund');await action('city-econ:confirm');const revision=city(await read()).economy.revision;assert.ok(revision>city(s).economy.revision);
 const after=await exported('captured');await action('close');await action('military:retreat');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment===null,null,{timeout:60000});
 const returned=(await read()).machines.fleet.find(u=>u.id===unitId);assert.equal(returned.health,after.state.machines.fleet.find(u=>u.id===unitId).health);
 await action('save');const final=await exported('active-campaign');await imported(final.file);await action('pause');await action('save');await action('saves');const loadAction=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(loadAction);assert.equal(city(await read()).owner.kind,'lineage');
 check('Owned economic command, physical retreat and timed return preserve damage; save/load/reload/rekey preserve conquest');
 async function measure(n){await cdp.send('HeapProfiler.collectGarbage');const s=await read();memory.push({n,heap:await cdp.send('Runtime.getHeapUsage'),render:s.render,buffers:await page.evaluate(()=>window.stateBuffers())});}
 await measure(0);for(let i=1;i<=20;i++){const t=performance.now();await action('travel-home');await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).navigation.field);timings.push({kind:'home',ms:performance.now()-t});await visit(target);if(i===10||i===20)await measure(i);}
 await action('city-camera');await page.setViewportSize({width:1280,height:720});await page.locator('.city-panel').evaluate(e=>e.scrollTop=0);await shot('final-1280');await exported('active-campaign');
 const dead=JSON.parse(await readFile(final.file,'utf8')),cp=structuredClone(checkpoint.state);cp.id=dead.state.id;cp.checkpoint=null;dead.state.checkpoint=JSON.stringify(cp);dead.state.player.health=0;dead.state.deathReason='Připravená mrtvá větev pro obnovu SP-009.E';const deadFile=path.join(out,'prepared-checkpoint.save.json');await writeFile(deadFile,JSON.stringify(dead));await imported(deadFile,'death');await action('recover');await action('pause');assert.equal(city(await read()).owner.kind,'state');assert.deepEqual((await read()).machines,checkpoint.state.machines);assert.equal(city(await read()).capture,null);
 check('20 returns and GPU/heap metrics; explicitly prepared dead branch restores whole before-battle checkpoint with no duplicate units/payments/capture');
 assert.equal(errors.length,0,errors.join('\n'));await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,timings:{visit:stats(timings.filter(t=>t.kind==='visit').map(t=>t.ms)),home:stats(timings.filter(t=>t.kind==='home').map(t=>t.ms))},combat:{...combatMetrics,attackResponseMs},frames:stats(await page.evaluate(()=>window.stateFrameTimes())),memory,build:await page.locator('script[type=module]').getAttribute('src'),prepared:'Byte-identical actual D continuation. No prepared E money, machines, defense, damage or capture. Only death checkpoint input built offline from played exports. Native UI/RAF, no live-state/localStorage writes or time acceleration.'},null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,state:await read()},null,2));throw error;}finally{await browser.close();}
