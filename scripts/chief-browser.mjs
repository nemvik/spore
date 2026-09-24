/** Explicit prepared camp; all subsequent actions use production UI + real RAF. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer,preview } from 'vite';
import { chromium } from 'playwright';
const out=path.resolve(process.env.CHIEF_OUTPUT??'evidence/sp-008e/production');await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {continueToTribeEra,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {unitNavigation,openGround}=await ssr.ssrLoadModule('/src/game/unit-motion.ts');
const s=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));assert.ok(continueToTribeEra(s));
const t=s.tribe,home=t.huts[0].pos,own=t.members.filter(u=>!u.species),chief=own[0],replacement=own[1],n=t.neighbours[0];
t.food=100;for(const [i,u] of t.members.entries()){u.pos=openGround(s.world,home,i+1,5);u.navigation=unitNavigation(u.pos);u.hunger=0;}
t.huts.push({id:t.nextId++,kind:'workshop',tool:'basket',progress:1,health:100,pos:openGround(s.world,home,8,12)});t.unlocked.push('basket');
for(const c of s.world.creatures.filter(c=>c.species==='crest')){c.pos=openGround(s.world,{x:50,y:0,z:40},c.id,5);c.velocity={x:0,y:0,z:0};c.hunger=0;}
makeCheckpoint(s);const fixture=path.join(out,'prepared-tribe.fixture.json');await writeFile(fixture,serializeGame(s));await ssr.close();
if(process.argv.includes('--fixtures-only'))process.exit(0);
const server=process.env.LUMAVORA_URL?null:await preview({preview:{host:'127.0.0.1',port:5200,strictPort:true},logLevel:'error'});
const browser=await chromium.launch({headless:true,...(process.env.LUMAVORA_BROWSER_CHANNEL?{channel:process.env.LUMAVORA_BROWSER_CHANNEL}:{}),args:['--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
context.setDefaultTimeout(90000);
const page=await context.newPage(),errors=[],results=[],timeline=[],voices=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{window.chiefAudioEvidence=[];const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const o=original.call(this),set=o.frequency.setValueAtTime;o.frequency.setValueAtTime=function(value,time){if(window.chiefAudioEvidence.length<2000)window.chiefAudioEvidence.push(value);return set.call(this,value,time);};return o;};});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>{const started=Date.now();timeline.push(name);console.log(name);await page.locator(`[data-action="${name}"]:visible`).first().press('Enter');console.log(`  done ${Date.now()-started} ms`);};
const capture=name=>page.screenshot({path:path.join(out,`${name}.png`)});
async function until(fn,label,seconds=240){const end=Date.now()+seconds*1000;while(Date.now()<end){const v=await read();assert.equal(v.mode,'game',label);if(fn(v))return v;await page.waitForTimeout(100);}throw Error(`Timed out: ${label}`);}
async function importGame(file){if((await read()).mode==='game')await page.keyboard.press('Escape');if(!await page.locator('#import-save').count())await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
async function exportGame(name){if((await read()).mode==='game')await page.keyboard.press('Escape');await action('saves');const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),action('export')]);const file=path.join(out,`${name}.save.json`);await download.saveAs(file);return {file,saved:parseGame(await readFile(file,'utf8'))};}
async function openChief(){await action('tribe-chief');}
async function council(){await action('tribe-chief-focus');const d=page.locator('.chief-target').filter({has:page.locator(`[data-action="tribe-chief-council:${n.id}"]`)});if(await d.getAttribute('open')===null)await d.locator('summary').press('Enter');await action(`tribe-chief-council:${n.id}`);}
try{
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5200');await action('saves');await importGame(fixture);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await action(`tribe-select:${chief.id}`);await action('tribe-equip:basket');await openChief();await capture('before-election');
 assert.equal((await read()).tribe.chief,undefined);await action('tribe-chief-elect');await action('tribe-chief-focus');let v=await read();assert.equal(v.tribe.chief.member,chief.id);assert.equal(v.tribe.members.length,t.members.length);assert.equal(v.tribe.members.find(u=>u.id===chief.id).tool,'basket');
 await page.setViewportSize({width:1280,height:720});await capture('elected-1280');const elected=await exportGame('elected');results.push({check:'explicit election of existing member with purchased basket, no new unit',member:chief.id,food:elected.saved.tribe.food});await action('close');await openChief();await council();
 v=await until(v=>v.tribe.chief.active?.phase==='speak','chief speech at physical host');await page.keyboard.press('Escape');const mid=await exportGame('mid-speech');assert.equal(mid.saved.tribe.chief.active.paid,8);assert.equal(mid.saved.tribe.chief.active.phase,'speak');
 await page.waitForTimeout(300);assert.deepEqual((await read()).tribe.chief,mid.saved.tribe.chief,'save menu pauses exact chief state');
 await importGame(mid.file);await page.keyboard.press('Escape');v=await read();assert.equal(v.tribe.chief.active.paid,8);assert.ok(Math.abs(v.tribe.chief.active.remaining-(mid.saved.tribe.chief.active.remaining-(v.tick-mid.saved.tick)/60))<1e-8);await action('save');voices.push(...await page.evaluate(()=>window.chiefAudioEvidence));
 await page.reload();await action('saves');await page.locator('[data-action^="load:"]').first().press('Enter');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await openChief();await action('tribe-chief-focus');const loaded=await read();assert.equal(loaded.tribe.chief.active?.phase,'speak');assert.equal(loaded.tribe.chief.active.paid,8);await capture('loaded-speech-1280');
 v=await until(v=>v.tribe.chief.result?.reason==='success','successful council');assert.equal(v.tribe.neighbours[0].relation,55);assert.ok(v.tribe.neighbours[0].society.truce>40);assert.equal(v.tribe.chief.cooldown<=60,true);await capture('success-1280');
 const success=await exportGame('success');assert.deepEqual(success.saved.player.genome,s.player.genome);results.push({check:'export/import and save/reload/load resume paid speech; one real success',before:30,after:v.tribe.neighbours[0].relation,paid:8,savedRemaining:mid.saved.tribe.chief.active.remaining,loadedRemaining:loaded.tribe.chief.active.remaining,cooldown:v.tribe.chief.cooldown});await action('close');await openChief();
 const d=page.locator('.chief-target').filter({has:page.locator(`[data-action="tribe-chief-council:${n.id}"]`)});if(await d.getAttribute('open')===null)await d.locator('summary').press('Enter');assert.ok(await page.locator(`[data-action="tribe-chief-council:${n.id}"]`).isDisabled());results.push({check:'cooldown visibly rejects repeated action'});
 // Return using normal orders, then elect a different original member while cooldown remains.
 await action('tribe-chief-focus');await action('tribe-retreat');await until(v=>v.tribe.members.find(u=>u.id===chief.id).orders.length===0,'normal return home');await action('tribe-home');await action(`tribe-select:${replacement.id}`);
 const prior=await read();assert.ok(prior.tribe.chief.cooldown>0);await action('tribe-chief-elect');v=await read();assert.equal(v.tribe.chief.member,replacement.id);assert.ok(v.tribe.chief.cooldown>0&&v.tribe.chief.cooldown<=prior.tribe.chief.cooldown);assert.equal(v.tribe.members.length,t.members.length);assert.equal(v.tribe.members.find(u=>u.id===chief.id).tool,'basket');await capture('succession-1280');
 const switched=await exportGame('successor');results.push({check:'native succession retains cooldown, original members and tools',from:chief.id,to:replacement.id,cooldown:switched.saved.tribe.chief.cooldown});
 // Independent interrupted branch from the actual paid UI export, never rewritten state.
 await importGame(mid.file);await openChief();await action('tribe-chief-focus');const before=await read();await action('tribe-retreat');v=await read();assert.equal(v.tribe.chief.active,null);assert.equal(v.tribe.chief.result.reason,'cancelled');assert.equal(v.tribe.neighbours[0].relation,30);assert.equal(v.tribe.food,before.tribe.food);assert.ok(v.tribe.members.find(u=>u.id===chief.id).orders.length);await capture('interrupted-1280');await exportGame('interrupted');results.push({check:'ordinary retreat interrupts with zero relation reward and no refund'});
 voices.push(...await page.evaluate(()=>window.chiefAudioEvidence));for(const f of [392,330,880,98])assert.ok(voices.includes(f),`actual Web Audio frequency ${f}`);results.push({check:'actual Web Audio scheduling only, no human listening',voices:[...new Set(voices)]});
 await importGame(switched.file);await openChief();await action('tribe-chief-focus');await exportGame('active-campaign');assert.deepEqual(errors,[]);results.push({check:'active successor campaign retained; zero console/page errors'});
}catch(error){await writeFile(path.join(out,'failure.txt'),String(error));try{await capture('failure');await writeFile(path.join(out,'failure-state.json'),JSON.stringify(await read()));}catch{}throw error;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({prepared:'Historical completed coast -> tribe; 100 food, one basket workshop, own members near home, existing predators moved to distant habitat with hunger0. No chief, activity, outcome, paid tool or relationship prepared. All later actions use UI/real RAF, including branches from genuine UI exports; no live setter, localStorage write or advanceTime.',results,errors,timeline},null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();await server?.httpServer.close();}
