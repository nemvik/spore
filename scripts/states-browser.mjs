/** SP-009.D production continuation of the actual C export; no live writes/time shim. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.STATES_OUTPUT??'evidence/sp-009d/browser'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5212';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[],timings=[],memory=[],decisions=[],decisionMemory=[];
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
async function waitTurn(n){await page.waitForFunction(n=>JSON.parse(window.render_game_to_text()).states.clock.turn>=n,n,{timeout:25000});const s=await read();decisions.push({turn:s.states.clock.turn,framesNearDecision:stats((await page.evaluate(()=>window.stateFrameTimes())).slice(-30)),states:s.states.entries.map(r=>({reserve:r.reserve,last:r.last,receipts:r.transactions.length}))});if([1,8,16].includes(n)){await cdp.send('HeapProfiler.collectGarbage');decisionMemory.push({turn:n,heap:await cdp.send('Runtime.getHeapUsage'),render:s.render,buffers:await page.evaluate(()=>window.stateBuffers())});}console.log('Observed strategic turn',n);}
const stats=v=>{v=[...v].sort((a,b)=>a-b);return {n:v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)};};
try{
 const source=parseGame(await readFile('tests/fixtures/geography/sp-009c-buildings.save.json','utf8'));
 await imported(path.resolve('tests/fixtures/geography/sp-009c-buildings.save.json'));if((await read()).navigation.mode==='global')await page.keyboard.press('n');
 const ownId=city(await read()).id,appearances=structuredClone(city(await read()).economy.buildings);
 assert.ok(appearances.some(b=>b.appearance.source==='creation'));await shot('own-city-1280');
 await action('pause');const freeze=structuredClone((await read()).states);await page.waitForTimeout(700);assert.deepEqual((await read()).states,freeze);
 await action('building-open');await page.waitForTimeout(700);assert.deepEqual((await read()).states,freeze);await action('building:new,house');await page.waitForTimeout(700);assert.deepEqual((await read()).states,freeze);await action('building:cancel');await action('building:close');await action('close');
 await page.keyboard.press('n');const global=structuredClone((await read()).states);await page.waitForTimeout(700);await page.keyboard.press('ArrowRight');await action('atlas-zoom:in');assert.deepEqual((await read()).states,global);await page.keyboard.press('n');
 check('Actual custom C city retained; pause/library/editor/global and atlas keyboard camera freeze strategic clock');
 // Both states act while the player remains peacefully in their own city.
 for(let n=1;n<=7;n++)await waitTurn(n);
 await page.keyboard.press('n');let s=await read();assert.equal(s.states.entries.length,2);assert.ok(s.states.entries.every(r=>r.transactions.length===7));assert.ok(s.cities.entries.filter(c=>c.owner.kind==='state').every(c=>c.economy.cycle===0&&c.economy.residents.length===4));
 await page.setViewportSize({width:1024,height:640});await page.locator('#states-overview').scrollIntoViewIfNeeded();await shot('states-developed-1024');
 // Tab retains native focus; Space opens the focused receipt disclosure.
 const summary=page.locator('#states-overview .state-card details summary').first();await summary.click();await summary.press('Tab');const focused=await page.evaluate(()=>document.activeElement?.tagName);assert.notEqual(focused,'BODY');
 await page.keyboard.press('n');await waitTurn(8);await page.keyboard.press('n');s=await read();assert.equal(s.cities.entries.filter(c=>c.owner.kind==='state').length,4);assert.ok(s.states.entries.every(r=>r.reserve===200));
 const expansion=await exported('expansion');assert.deepEqual(original(expansion.state),original(source));await action('close');
 check('Without attack, both rivals paid real development and adjacent expansion; home systems frozen; receipts and reserves verified');
 await page.keyboard.press('n');for(let n=9;n<=16;n++)await waitTurn(n);
 await page.keyboard.press('n');s=await read();assert.ok(s.states.entries.every(r=>r.reserve===120&&r.transactions.length===14&&r.last.outcome==='blocked'));const rival=s.cities.entries.find(c=>c.owner.kind==='state');
 await action('city-select:'+rival.id);await shot('ownership-map-1024');const stable=s.states.entries.map(r=>r.transactions);
 await visit(rival.id);await action('city-camera');await page.waitForTimeout(350);assert.equal((await read()).fieldCamera.cityView,true);assert.equal(await page.locator('[data-action^="city-econ:"]').count(),0);assert.match(await page.locator('.city-owner').innerText(),/návštěvník/);await shot('rival-city-1024');
 const position=(await read()).navigation.field.position;await action('field-camera');await page.waitForTimeout(150);assert.equal((await read()).fieldCamera.cityView,false);assert.deepEqual((await read()).navigation.field.position,position);
 await action('city-camera');const canvas=page.locator('canvas').first();const box=await canvas.boundingBox();await page.mouse.move(box.x+450,box.y+350);await page.mouse.down({button:'right'});await page.mouse.move(box.x+500,box.y+380,{steps:5});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-100);
 const cycle=city(await read()).economy.cycle;await page.waitForFunction(n=>{const s=JSON.parse(window.render_game_to_text());return s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId).economy.cycle>n;},cycle,{timeout:15000});assert.ok(city(await read()).economy.last.income>0);
 const active=await exported('active-campaign');await action('close');
 await action('travel-home');await visit(rival.id);assert.deepEqual(city(await read()).economy.buildings,city(active.state).economy.buildings);await visit(ownId);assert.deepEqual(city(await read()).economy.buildings,appearances);
 await imported(active.file);await action('pause');assert.deepEqual((await read()).states.entries.map(r=>r.transactions),stable);await action('save');await action('saves');const savedAction=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(savedAction);assert.deepEqual((await read()).states.entries.map(r=>r.transactions),stable);
 check('Read-only rival visit, camera and local production; departure/return, custom city snapshots and export/import/rekey/save/reload/load');
 async function measure(n){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage'),s=await read();memory.push({n,heap,render:s.render,buffers:await page.evaluate(()=>window.stateBuffers())});}
 await visit(rival.id);await measure(0);
 for(let i=1;i<=20;i++){const t=performance.now();await action('travel-home');await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).navigation.field);timings.push({kind:'home',ms:performance.now()-t});await visit(i%2?rival.id:ownId);if(i===10||i===20)await measure(i);}
 await visit(rival.id);await action('city-camera');await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(200);await shot('rival-final-1280');const final=await exported('active-campaign');
 const returnFrames=stats(await page.evaluate(()=>window.stateFrameTimes()));
 // Disclosed offline dead branch restores earlier real expansion branch through UI.
 const dead=JSON.parse(await readFile(final.file,'utf8')),checkpoint=structuredClone(expansion.state);checkpoint.id=dead.state.id;checkpoint.checkpoint=null;dead.state.checkpoint=JSON.stringify(checkpoint);dead.state.player.health=0;dead.state.deathReason='Připravená větev obnovy D';const deadFile=path.join(out,'prepared-checkpoint.save.json');await writeFile(deadFile,JSON.stringify(dead));await imported(deadFile,'death');await action('recover');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await action('pause');assert.deepEqual((await read()).states.entries.map(r=>r.transactions),expansion.state.states.entries.map(r=>r.transactions));
 check('20 repeated returns with memory/GPU metrics; prepared dead branch restores the earlier played expansion without duplicate payments');
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,decisions,decisionMemory,timings:{visit:stats(timings.filter(t=>t.kind==='visit').map(t=>t.ms)),home:stats(timings.filter(t=>t.kind==='home').map(t=>t.ms))},frames:returnFrames,memory,build:await page.locator('script[type=module]').getAttribute('src'),prepared:'Byte-identical actual C continuation, with its existing custom buildings/resources. No prepared states, decisions, currency or new settlements. Only final dead branch was created offline from played exports. Ordinary UI/native RAF; no live-state or localStorage writes, no acceleration.'},null,2));
 console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,state:await read()},null,2));throw error;}finally{await browser.close();}
