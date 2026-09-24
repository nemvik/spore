/** Prepared existing wildlife / camp supplies, then native UI and RAF only. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
const out=path.resolve(process.env.DOMESTICATION_OUTPUT??'evidence/sp-008d/verified');await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {continueToTribeEra,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {unitNavigation,openGround}=await ssr.ssrLoadModule('/src/game/unit-motion.ts');
const {groundHeight}=await ssr.ssrLoadModule('/src/game/random.ts');
const s=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));assert.ok(continueToTribeEra(s));
const t=s.tribe,home=t.huts[0].pos,own=t.members.filter(u=>!u.species),caretaker=own[0];
// Explicit placement of a real existing bell, one existing nectar source, and camp members.
// No domestication state, reward, paid care or acquisition is prepared.
t.food=100;for(const [i,u] of t.members.entries()){u.pos=openGround(s.world,home,i+1,5);u.navigation=unitNavigation(u.pos);u.hunger=0;}
const bell=s.world.creatures.find(c=>c.species==='bell');assert.ok(bell);bell.pos=openGround(s.world,home,2,18);bell.velocity={x:0,y:0,z:0};bell.hunger=45;bell.fear=0;
const plant=s.world.resources.find(r=>r.kind==='nectar');assert.ok(plant);plant.pos=openGround(s.world,home,3,16);plant.amount=12;plant.max=Math.max(12,plant.max);
// Move nearby hunters to their existing distant habitat, preserving population and world obstacles.
for(const c of s.world.creatures.filter(c=>c.species==='crest')){c.pos=openGround(s.world,{x:50,y:0,z:40},c.id,5);c.velocity={x:0,y:0,z:0};c.hunger=0;}
makeCheckpoint(s);const fixture=path.join(out,'prepared-tribe.fixture.json');await writeFile(fixture,serializeGame(s));await ssr.close();
if(process.argv.includes('--fixtures-only'))process.exit(0);
const server=process.env.LUMAVORA_URL?null:await preview({preview:{host:'127.0.0.1',port:5198,strictPort:true},logLevel:'error'});
const browser=await chromium.launch({headless:true,...(process.env.LUMAVORA_BROWSER_CHANNEL?{channel:process.env.LUMAVORA_BROWSER_CHANNEL}:{}),args:['--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],results=[],timeline=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{window.animalAudioEvidence=[];const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const o=original.call(this),set=o.frequency.setValueAtTime;o.frequency.setValueAtTime=function(value,time){window.animalAudioEvidence.push(value);return set.call(this,value,time);};return o;};});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>{timeline.push(name);console.log(name);await page.locator(`[data-action="${name}"]:visible`).first().click();};
const capture=name=>page.screenshot({path:path.join(out,`${name}.png`)});
async function until(fn,label,seconds=110){const end=Date.now()+seconds*1000;while(Date.now()<end){const v=await read();assert.equal(v.mode,'game',label);if(fn(v))return v;await page.waitForTimeout(150);}throw Error(`Timed out: ${label}`);}
async function importGame(file){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
async function exportGame(name){await action('pause');await action('saves');const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,`${name}.save.json`);await download.saveAs(file);return {file,saved:parseGame(await readFile(file,'utf8'))};}
async function panel(){await action('tribe-animals');await action(`tribe-select:${caretaker.id}`);}
async function tame(){await panel();await action(`tribe-animal-focus:${bell.id}`);await action(`tribe-tame:${bell.id}`);}
try{
 if(process.env.DOMESTICATION_VISUAL_INPUT){
  const source=path.resolve(process.env.DOMESTICATION_VISUAL_INPUT);
  await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5198');await action('saves');await page.setViewportSize({width:1280,height:720});
  await importGame(path.join(source,'mid-acquisition.save.json'));await panel();await action(`tribe-animal-focus:${bell.id}`);await capture('loaded-acquisition-1280');
  let v=await until(v=>v.tribe.domestication.animals.length===1,'final build physical arrival');await action(`tribe-animal-focus:${bell.id}`);await capture('acquired-1280');results.push({check:'final renderer acquisition and arrival from actual UI mid-save',animal:v.tribe.domestication.animals[0]});
  await importGame(path.join(source,'care-with-cargo.save.json'));await panel();await action(`tribe-animal-focus:${bell.id}`);await page.locator('.domestication').hover();await page.mouse.wheel(0,180);await capture('carrying-1280');
  v=await until(v=>v.tribe.domestication.animals[0].cargo===0&&v.tribe.food>100,'final build delivery');await action('tribe-home');await capture('delivered-1280');results.push({check:'saved actual cargo arrives again in a separate replay branch',food:v.tribe.food});
  await importGame(path.join(source,'neglected-campaign.save.json'));await panel();await action(`tribe-animal-focus:${bell.id}`);await page.locator('.domestication').hover();await page.mouse.wheel(0,160);assert.ok((await read()).world.creatures.find(c=>c.id===bell.id).hunger>=70);
  const jobs=page.locator('.animal-card details');await jobs.locator('summary').click();const gatherAction=await jobs.locator('[data-action^="tribe-animal-gather:"]').first().getAttribute('data-action');await action(gatherAction);
  const hungryStart=await read();v=await until(v=>v.tick>=hungryStart.tick+480,'hungry animal refuses assigned work',45);assert.equal(v.tribe.domestication.animals[0].cargo,0);assert.equal(v.tribe.domestication.animals[0].mode,'gather');assert.ok(v.tribe.domestication.animals[0].trust<hungryStart.tribe.domestication.animals[0].trust);await page.locator('.domestication').hover();await page.mouse.wheel(0,-160);await capture('neglect-1280');results.push({check:'hungry animal with real assigned available source refuses harvest for eight simulated seconds and loses trust',ticks:v.tick-hungryStart.tick,animal:v.tribe.domestication.animals[0]});
  await action(`tribe-animal-care:${bell.id}`);v=await until(v=>v.world.creatures.find(c=>c.id===bell.id).hunger<30,'caretaker returns and restores paid care');await capture('care-restored-1280');results.push({check:'ordinary reassignment brings caretaker home, consumes food and restores actual nutrition',hunger:v.world.creatures.find(c=>c.id===bell.id).hunger});
  await importGame(path.join(source,'mid-acquisition.save.json'));await panel();await action('tribe-tame-cancel');await capture('interrupted-1280');assert.equal((await read()).tribe.domestication.result.reason,'cancelled');
  await importGame(path.join(source,'working-campaign.save.json'));await panel();await action(`tribe-animal-focus:${bell.id}`);await action(`tribe-animal-release:${bell.id}`);v=await read();assert.equal(v.tribe.domestication.animals.length,0);assert.equal(v.world.creatures.filter(c=>c.id===bell.id).length,1);await capture('released-1280');await exportGame('released-campaign');results.push({check:'native release preserves the same living individual and removes ownership'});
  const voices=await page.evaluate(()=>window.animalAudioEvidence);for(const f of [740,620,110])assert.ok(voices.includes(f));results.push({check:'final build actual success/delivery/interruption Web Audio scheduling; no human listening',voices});
  await importGame(path.join(source,'working-campaign.save.json'));await panel();await action('tribe-home');await exportGame('active-campaign');assert.deepEqual(errors,[]);results.push({check:'final 1280x720 scenes and active campaign; zero browser errors'});
 }else{
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5198');await action('saves');await importGame(fixture);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await panel();await capture('preparation');await action(`tribe-tame:${bell.id}`);
 await until(v=>v.tribe.domestication?.active?.phase==='lure','paid contact');
 const mid=await exportGame('mid-acquisition');assert.equal(mid.saved.tribe.domestication.active.paid,6);assert.equal(mid.saved.tribe.domestication.animals.length,0);
 await page.waitForTimeout(500);assert.deepEqual((await read()).tribe.domestication,mid.saved.tribe.domestication,'save menu pauses acquisition');
 await importGame(mid.file);await action('pause');let v=await read(),e=v.tribe.domestication.active;assert.equal(e.paid,6);assert.ok(Math.abs(e.remaining-(mid.saved.tribe.domestication.active.remaining-(v.tick-mid.saved.tick)/60))<1e-8);await action('close');
 await action('pause');await action('save');results.push({check:'paid acquisition export/import and exact timer; save menu pauses',phase:e.phase,paid:e.paid,voices:await page.evaluate(()=>window.animalAudioEvidence)});
 await page.reload();await action('saves');await page.locator('[data-action^="load:"]').first().click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 await panel();await page.setViewportSize({width:1280,height:720});await action(`tribe-animal-focus:${bell.id}`);await capture('loaded-acquisition-1280');
 v=await until(v=>v.tribe.domestication?.animals.length===1,'physical arrival');assert.equal(v.tribe.domestication.result.reason,'success');assert.equal(v.world.creatures.filter(c=>c.id===bell.id).length,1);await action('tribe-home');await capture('acquired-1280');
 const acquired=await exportGame('acquired');assert.deepEqual(acquired.saved.player.genome,s.player.genome);results.push({check:'same wild animal physically arrived at home; no new member or genome change',animal:acquired.saved.tribe.domestication.animals[0]});await action('close');
 // Send the real selected caretaker home to keep feeding in contact; the action itself moves him.
 await panel();await action(`tribe-animal-care:${bell.id}`);
 let prev=await read(),paidFeed=null;
 for(let i=0;i<600;i++){v=await read();const before=prev.world.creatures.find(c=>c.id===bell.id),after=v.world.creatures.find(c=>c.id===bell.id);if(after.hunger<before.hunger-10){paidFeed={before:before.hunger,after:after.hunger,stockBefore:prev.tribe.food,stockAfter:v.tribe.food};break;}prev=v;await page.waitForTimeout(100);}
 assert.ok(paidFeed,'actual paid feeding observed');assert.ok(paidFeed.stockAfter<=paidFeed.stockBefore-3);results.push({check:'contact care consumes 3 stored food and lowers actual hunger',...paidFeed});
 const details=page.locator('.animal-card details');await details.locator('summary').click();await action(`tribe-animal-gather:${bell.id}:${plant.id}`);
 v=await until(v=>v.tribe.domestication.animals[0].cargo>=2,'physical harvest');await action(`tribe-animal-focus:${bell.id}`);await capture('carrying-1280');
 const carrying=await exportGame('care-with-cargo');assert.ok(carrying.saved.tribe.domestication.animals[0].cargo>=2);await importGame(carrying.file);await panel();
 prev=await read();let delivered=null;
 for(let i=0;i<800;i++){v=await read();const before=prev.tribe.domestication.animals[0],after=v.tribe.domestication.animals[0];if(before.cargo>=5&&after.cargo===0){delivered={cargo:before.cargo,gain:v.tribe.food-prev.tribe.food};break;}prev=v;await page.waitForTimeout(100);}
 assert.ok(delivered,'actual delivered load');assert.equal(delivered.gain,delivered.cargo*4);await action('tribe-home');await capture('delivered-1280');results.push({check:'care/cargo export-import preserves real route and delivers exact output once',...delivered});
 const working=await exportGame('working-campaign');const voices=await page.evaluate(()=>window.animalAudioEvidence);for(const frequency of [740,520,620])assert.ok(voices.includes(frequency),`animal Web Audio frequency ${frequency}`);results.push({check:'automatic Web Audio observations, not human listening',voices});
 // Failure via ordinary decisions: moving caretaker away and waiting causes real hunger/neglect.
 await action('close');await panel();await action('tribe-animals-close');await action(`tribe-socialize:${t.neighbours[0].id}`);await panel();
 v=await until(v=>v.world.creatures.find(c=>c.id===bell.id)?.hunger>=70,'neglect stops work',180);await action('tribe-home');await capture('neglect-1280');assert.ok(v.tribe.domestication.animals[0].trust<100);const hungry=await exportGame('neglected-campaign');results.push({check:'caretaker left through native order; animal hungry, work stopped, trust falling',animal:hungry.saved.tribe.domestication.animals[0],hunger:v.world.creatures.find(c=>c.id===bell.id).hunger});
 // Independent interrupted branch from the original ordinary export during a paid attempt.
 await importGame(mid.file);await panel();const food=(await read()).tribe.food;await action('tribe-tame-cancel');v=await read();assert.equal(v.tribe.domestication.result.reason,'cancelled');assert.equal(v.tribe.food,food);assert.equal(v.tribe.domestication.animals.length,0);await capture('interrupted-1280');await exportGame('interrupted');assert.ok((await page.evaluate(()=>window.animalAudioEvidence)).includes(110));results.push({check:'paid acquisition interrupted with no refund, ownership or reward and failure sound scheduled'});
 // Preserve active successful care as the final campaign, using only import of a real UI export.
 await importGame(working.file);await panel();await action('tribe-home');const final=await exportGame('active-campaign');assert.equal(final.saved.tribe.domestication.animals.length,1);assert.deepEqual(errors,[]);results.push({check:'active campaign restored from UI export, zero console/page errors'});
}
}catch(error){await writeFile(path.join(out,'failure.txt'),String(error));try{await capture('failure');await writeFile(path.join(out,'failure-state.json'),JSON.stringify(await read(),null,2));}catch{}throw error;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({prepared:'Existing historical coast → tribe, 100 food, own members/home placement, one existing bell at18m with natural health/hunger45, existing nectar12 at16m, predators moved to distant habitat/hunger0. No domestication state prepared. Native UI export branches, no live setter, localStorage rewrite or advanceTime.',results,errors,timeline},null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();await server?.httpServer.close();}
