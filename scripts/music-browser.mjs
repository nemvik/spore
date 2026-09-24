/** Explicit prepared tribe/stock/workshops, then only native production UI and real RAF. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';
const out=path.resolve(process.env.MUSIC_OUTPUT??'evidence/sp-008c/verified');await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {continueToTribeEra,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {enableLineageHistory}=await ssr.ssrLoadModule('/src/game/lineage-history.ts');
const {openGround,unitNavigation}=await ssr.ssrLoadModule('/src/game/unit-motion.ts');
const s=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));enableLineageHistory(s);assert.ok(continueToTribeEra(s));
const t=s.tribe,own=t.members.filter(u=>!u.species),home=t.huts[0].pos;
t.food=220;
for(const [i,tool] of ['drum','flute','rattle'].entries()){t.huts.push({id:t.nextId++,kind:'workshop',tool,pos:openGround(s.world,home,i+6,10),progress:1,health:100});t.unlocked.push(tool);}
for(const [i,u] of own.entries()){u.pos=openGround(s.world,home,i+1,6);u.navigation=unitNavigation(u.pos);}
makeCheckpoint(s);const fixture=path.join(out,'prepared-tribe.fixture.json');await writeFile(fixture,serializeGame(s));await ssr.close();
if(process.argv.includes('--fixtures-only'))process.exit(0);
const previewServer=process.env.LUMAVORA_URL?null:await preview({preview:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});
const browser=await chromium.launch({headless:true,...(process.env.LUMAVORA_BROWSER_CHANNEL?{channel:process.env.LUMAVORA_BROWSER_CHANNEL}:{}),args:['--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage();
await page.addInitScript(()=>{window.musicAudioEvidence=[];const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const o=original.call(this),set=o.frequency.setValueAtTime;o.frequency.setValueAtTime=function(value,time){window.musicAudioEvidence.push({frequency:value,type:o.type});return set.call(this,value,time);};return o;};});
const errors=[],results=[],timeline=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>{timeline.push(name);console.log(name);await page.locator(`[data-action="${name}"]`).first().click();};
const capture=name=>page.screenshot({path:path.join(out,`${name}.png`)});
async function until(fn,label,seconds=100){const end=Date.now()+seconds*1000;while(Date.now()<end){const v=await read();assert.equal(v.mode,'game',label);if(fn(v))return v;await page.waitForTimeout(150);}throw Error(`Timed out: ${label}`);}
async function select(ids){await action(`tribe-select:${ids[0]}`);for(const id of ids.slice(1)){await page.keyboard.down('Shift');await action(`tribe-select:${id}`);await page.keyboard.up('Shift');}}
async function importGame(file){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
async function exportGame(name){await action('pause');await action('saves');const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,`${name}.save.json`);await download.saveAs(file);return {file,saved:parseGame(await readFile(file,'utf8'))};}
const ids=own.map(u=>u.id), garden=t.neighbours.find(n=>n.identity==='garden');
async function visit(){await select(ids);const panel=page.locator('.tribe-neighbour').filter({has:page.locator(`[data-action="tribe-focus:${garden.id}"]`)});const details=panel.locator('details');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();await action(`tribe-music:${garden.id}`);await action(`tribe-focus:${garden.id}`);}
async function round(instrument,index){await until(v=>v.tribe.music?.active?.phase==='respond'&&v.tribe.music.active.rounds.length===index,`round ${index+1}`);await action(`tribe-music-answer:${instrument}`);}
try{
 if(process.env.MUSIC_VISUAL_INPUT){
  const source=path.resolve(process.env.MUSIC_VISUAL_INPUT);await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5196');await action('saves');
  await importGame(path.join(source,'ui-equipped.save.json'));await select(ids);await action('tribe-culture');await capture('prepared-ensemble');await action('culture-close');
  await importGame(path.join(source,'mid-response.save.json'));await page.setViewportSize({width:1280,height:720});await action(`tribe-focus:${garden.id}`);await capture('loaded-response-1280');
  await round('drum',0);await round('flute',1);await round('rattle',2);const success=await until(v=>v.tribe.music?.result,'final-build success');assert.equal(success.tribe.music.result.reason,'success');await capture('success-1280');
  for(const [file,name,reason] of [['failed-campaign','missing-tools-1280','mistakes'],['wrong-choice','wrong-choice-1280','mistakes'],['active-campaign','interrupted-1280','cancelled']]){
   await importGame(path.join(source,`${file}.save.json`));await action(`tribe-focus:${garden.id}`);assert.equal((await read()).tribe.music.result.reason,reason);await capture(name);
  }
  assert.deepEqual(errors,[]);results.push({check:'final layout at 1280x720: three played responses succeed; failures/interruption imported from real prior UI exports',source});
 }else{
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5196');await action('saves');await importGame(fixture);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 const plan=page.locator('.music-plan').first();await plan.locator('summary').click();await page.waitForTimeout(1300);assert.equal(await plan.evaluate(n=>n.open),true,'music preparation must remain open while counters update');
 for(const [i,tool] of ['drum','flute','rattle'].entries()){await select([ids[i]]);await action(`tribe-equip:${tool}`);}
 // The cultural bonus is purchased in the existing editor, not pre-installed in the input.
 await select(ids);await action('tribe-culture');await page.locator('#culture-name').fill('Hlasy pramene');await action('culture-part:head:plume');await action('culture-save');await action('culture-equip');await capture('prepared-ensemble');await action('culture-close');
 const prepared=await exportGame('ui-equipped');await action('close');
 results.push({check:'native selection and paid three instruments plus plume, no changed genome',food:prepared.saved.tribe.food,tools:prepared.saved.tribe.members.filter(u=>ids.includes(u.id)).map(u=>u.tool)});
 await visit();await until(v=>v.tribe.music?.active?.phase==='respond','arrival with actual host');
 await capture('request');const mid=await exportGame('mid-response');const active=mid.saved.tribe.music.active;assert.equal(active.phase,'respond');assert.ok(active.remaining>10);assert.equal(mid.saved.tribe.neighbours.find(n=>n.id===garden.id).tribute,8);
 await page.waitForTimeout(800);assert.deepEqual((await read()).tribe.music,mid.saved.tribe.music,'modal pauses music exactly');
 await page.locator('#import-save').setInputFiles(mid.file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 await action('pause');let v=await read();assert.equal(v.tribe.music.active.phase,active.phase);assert.deepEqual(v.tribe.music.active.members,active.members);assert.deepEqual(v.tribe.music.active.rounds,active.rounds);assert.ok(Math.abs(v.tribe.music.active.remaining-(active.remaining-(v.tick-mid.saved.tick)/60))<1e-8,'remaining time must match exactly the native ticks since load');await action('close');
 await action('pause');await action('save');results.push({check:'Web Audio scheduled before reload',voices:await page.evaluate(()=>window.musicAudioEvidence)});await page.reload();await action('saves');await page.locator('[data-action^="load:"]').first().click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 v=await read();assert.equal(v.tribe.music.active.phase,'respond');assert.deepEqual(v.tribe.music.active.members,active.members);results.push({check:'live respond export/import and save/reload/load retain phase, timer, membership, payment',remaining:v.tribe.music.active.remaining});
 await page.setViewportSize({width:1280,height:720});await capture('loaded-response-1280');
 await round('drum',0);await round('flute',1);await round('rattle',2);v=await until(v=>v.tribe.music?.result,'successful result');assert.equal(v.tribe.music.result.reason,'success');assert.equal(v.tribe.neighbours.find(n=>n.id===garden.id).resolved,'allied');assert.equal(v.tribe.music.result.delta,70);await capture('success-1280');
 const completed=await exportGame('successful-campaign');assert.deepEqual(completed.saved.player.genome,s.player.genome);results.push({check:'successful three-player ensemble; plume yields alliance with single reward',result:completed.saved.tribe.music.result});
 // A separate branch from a real UI export, then changing only tools through native controls.
 await importGame(prepared.file);await select(ids);await action('tribe-equip:drum');await visit();await round('drum',0);await round('flute',1);await round('rattle',2);v=await until(v=>v.tribe.music?.result,'composition failure');assert.equal(v.tribe.music.result.reason,'mistakes');assert.equal(v.tribe.music.result.rounds[1].players.length,0);assert.equal(v.tribe.neighbours.find(n=>n.id===garden.id).relation,20);await capture('missing-tools-1280');results.push({check:'same requested answers with three drums fail on missing instruments',result:v.tribe.music.result});
 await exportGame('failed-campaign');await importGame(prepared.file);await visit();await round('flute',0);await round('drum',1);v=await until(v=>v.tribe.music?.result,'wrong choice');assert.equal(v.tribe.music.result.reason,'mistakes');results.push({check:'wrong choices fail with correct instruments available',result:v.tribe.music.result});
 await exportGame('wrong-choice');await importGame(prepared.file);await visit();await until(v=>v.tribe.music?.active?.phase==='respond','interruption arrival');const contactBefore=(await read()).tribe.food;await action('tribe-retreat');v=await read();assert.equal(v.tribe.music.result.reason,'cancelled');assert.equal(v.tribe.music.result.delta,-5);assert.equal(v.tribe.food,contactBefore);await capture('interrupted-1280');results.push({check:'native retreat interrupts immediately without refund or pending reward',result:v.tribe.music.result});
 const final=await exportGame('active-campaign');await importGame(final.file);await action('pause');v=await read();assert.deepEqual(v.tribe.music.result,final.saved.tribe.music.result);assert.deepEqual(errors,[]);const voices=await page.evaluate(()=>window.musicAudioEvidence);for(const f of [120,660,1800,85,784])assert.ok(voices.some(o=>o.frequency===f),`scheduled music frequency ${f}`);results.push({check:'instrument, failed reply and success Web Audio scheduling; no human listening',voices:voices.filter(o=>[120,660,1800,85,784].includes(o.frequency))});results.push({check:'finished interrupted state loads without replay or browser errors'});
}
}catch(error){await writeFile(path.join(out,'failure.txt'),String(error));try{await capture('failure');await writeFile(path.join(out,'failure-state.json'),JSON.stringify(await read(),null,2));}catch{}throw error;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({mode:process.env.MUSIC_VISUAL_INPUT?'final-layout-replay':'full-native-scenario',prepared:'Historical completed coast; entered tribe, 220 food, three completed musical workshops and own members near home. No outfits/instruments/encounter/results prepared. UI export used for repeat branches.',results,errors,timeline},null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();await previewServer?.httpServer.close();}
