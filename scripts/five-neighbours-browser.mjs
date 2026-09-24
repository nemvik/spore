/** Prepared coast/stocks/workshops; all outcomes via native UI and real RAF. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';
const conquest=process.argv.includes('--conquest'),replay=process.argv.includes('--replay-peace'),route=replay?'peace-final':conquest?'conquest':'peace';
const started=Date.now();const build=(await readFile('dist/index.html','utf8')).match(/assets\/[^"]+\.js/g);
const out=path.resolve(process.env.FIVE_OUTPUT??`evidence/sp-008f/${route}`);await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {continueToTribeEra,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {enableLineageHistory}=await ssr.ssrLoadModule('/src/game/lineage-history.ts');
const {openGround}=await ssr.ssrLoadModule('/src/game/unit-motion.ts');
const s=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));enableLineageHistory(s);assert.ok(continueToTribeEra(s));
const t=s.tribe;t.food=220;
for(const [i,tool] of ['drum','spear','flute','rattle'].entries()){t.huts.push({id:t.nextId++,kind:'workshop',tool,pos:openGround(s.world,t.huts[0].pos,i+2,12,3),progress:1,health:100});t.unlocked.push(tool);}
makeCheckpoint(s);const fixture=path.join(out,'prepared-tribe.fixture.json');await writeFile(fixture,serializeGame(s));await ssr.close();
if(process.argv.includes('--fixtures-only'))process.exit(0);
const server=process.env.LUMAVORA_URL?null:await preview({preview:{host:'127.0.0.1',port:5202,strictPort:true},logLevel:'error'});
const browser=await chromium.launch({headless:true,channel:process.env.LUMAVORA_BROWSER_CHANNEL??'chrome',args:['--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});context.setDefaultTimeout(60000);
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],results=[],timeline=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function action(name){console.log(route,name);timeline.push(name);const button=page.locator(`[data-action="${name}"]:visible`).first();await button.scrollIntoViewIfNeeded();await button.press('Enter');}
async function until(fn,label,seconds=240){const end=Date.now()+seconds*1000;while(Date.now()<end){const v=await read();assert.equal(v.mode,'game',label);if(fn(v))return v;await page.waitForTimeout(150);}throw Error(`Timeout: ${label}`);}
const capture=name=>page.screenshot({path:path.join(out,`${name}.png`)});
async function exportGame(name){if((await read()).mode==='game')await page.keyboard.press('Escape');if(!await page.locator('#import-save').count())await action('saves');const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),action('export')]);const file=path.join(out,`${name}.save.json`);await download.saveAs(file);return {file,saved:parseGame(await readFile(file,'utf8'))};}
async function importGame(file){if((await read()).mode==='game')await page.keyboard.press('Escape');if(!await page.locator('#import-save').count())await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
async function home(){await action('tribe-all');await action('tribe-retreat');await until(v=>v.tribe.members.every(u=>!u.orders.length),'actual return home');await until(v=>v.tribe.members.every(u=>u.health>=92&&u.hunger<35),'home care');await action('tribe-home');}
async function select(ids){await action(`tribe-select:${ids[0]}`);for(const id of ids.slice(1)){await page.keyboard.down('Shift');await action(`tribe-select:${id}`);await page.keyboard.up('Shift');}}
try{
 if(replay){
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5202');await action('saves');await importGame(path.resolve('evidence/sp-008f/peace/music-reed.save.json'));assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 for(const instrument of ['flute','drum','rattle']){await until(v=>v.tribe.music?.active?.phase==='respond','saved music response');await action(`tribe-music-answer:${instrument}`);}
 const played=await until(v=>v.tribe.music?.result,'final-build music result');assert.equal(played.tribe.music.result.reason,'success');assert.equal(played.tribe.music.result.delta,62.5);const reed=played.tribe.neighbours.find(n=>n.identity==='reed');await action(`tribe-map:${reed.id}`);await capture('reed-music-final');results.push({check:'final-build native replay of paid reed music',result:played.tribe.music.result});
 await importGame(path.resolve('evidence/sp-008f/peace/completed.save.json'));const v=await read();assert.equal(v.tribe.completed,true);assert.ok(v.tribe.neighbours.every(n=>n.resolved==='allied'));
 for(const n of v.tribe.neighbours){await action(`tribe-map:${n.id}`);await page.waitForTimeout(700);const target=(await read()).commandTargets.find(p=>p.target.kind==='neighbour'&&p.target.id===n.id);assert.ok(target?.screen&&target.screen.x>15&&target.screen.x<80);await action(`tribe-focus:${n.id}`);await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),`tribe-focus:${n.id}`);}
 results.push({check:'all five map targets and stable card keyboard focus on final build'});await capture('allied-final');await action('tribe-next');assert.equal((await read()).stage,4);const final=await exportGame('active-campaign');assert.equal(final.saved.lineageHistory.stages[3].facts.length,5);assert.equal(final.saved.lineageHistory.stages[3].closed.outcome,'allied');assert.deepEqual(errors,[]);results.push({check:'allied final transition and export retains five facts'});console.log(JSON.stringify({status:'passed',route,checks:results.length,errors}));
 }else{ await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5202');await action('saves');await importGame(fixture);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 assert.equal((await read()).tribe.neighbours.length,5);await capture('map-1280');await action('tribe-all');
 // Check all map buttons and scrollable cards refer to the actual rendered society.
 for(const n of t.neighbours){await action(`tribe-map:${n.id}`);await page.waitForTimeout(700);const v=await read(),target=v.commandTargets.find(p=>p.target.kind==='neighbour'&&p.target.id===n.id);assert.ok(target?.screen&&target.screen.x>15&&target.screen.x<80);const card=page.locator('.tribe-neighbour').filter({has:page.locator(`[data-action="tribe-attack:${n.id}"]`)});await card.scrollIntoViewIfNeeded();assert.ok((await card.innerText()).includes('m od tábora'));await action(`tribe-focus:${n.id}`);await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),`tribe-focus:${n.id}`);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),`tribe-socialize:${n.id}`);if(['reed','basalt'].includes(n.identity))await capture(n.identity+'-1280');}
 results.push({check:'five map focuses, five actual settlement targets and scrollable action cards at 1280x720'});
 await action('tribe-home');await action('tribe-recruit');await action('tribe-recruit');assert.equal((await read()).tribe.members.length,6);
 const own=(await read()).tribe.members.filter(u=>!u.species).map(u=>u.id);
 // A paid cultural outfit remains on a real descendant throughout the route.
 await select([own[0]]);await action('tribe-culture');await page.locator('#culture-name').fill(conquest?'Stráž pěti cest':'Hlas pěti cest');await action(`culture-part:head:${conquest?'crest':'plume'}`);await action('culture-part:back:shell');await action('culture-save');await action('culture-equip');await action('culture-close');
 if(!conquest){
  // New reed identity requires two actual flautists, plus the other instruments.
  for(const [i,tool] of ['flute','flute','drum','rattle'].entries()){await select([own[i]]);await action(`tribe-equip:${tool}`);}
  await select(own.slice(0,4));const reed=t.neighbours.find(n=>n.identity==='reed');
  const card=page.locator('.tribe-neighbour').filter({has:page.locator(`[data-action="tribe-music:${reed.id}"]`)});await card.locator('summary').press('Enter');await action(`tribe-music:${reed.id}`);await action(`tribe-focus:${reed.id}`);
  await until(v=>v.tribe.music?.active?.phase==='respond','reed first response');await page.keyboard.press('Escape');const mid=await exportGame('music-reed');assert.equal(mid.saved.tribe.music.active.paid,16);await importGame(mid.file);
  for(const instrument of ['flute','drum','rattle']){await until(v=>v.tribe.music?.active?.phase==='respond','music response');await action(`tribe-music-answer:${instrument}`);}
  let v=await until(v=>v.tribe.music?.result,'reed music result');assert.equal(v.tribe.music.result.reason,'success');assert.equal(v.tribe.music.result.rounds[0].players.length,2);assert.ok(v.tribe.music.result.delta>=60);await capture('reed-music-result');results.push({check:'new reed two-flute music, paid physical visit and active save/import',result:v.tribe.music.result});await action('tribe-music-dismiss');await home();
  await select([own[0]]);await action('tribe-chief');await action('tribe-chief-elect');const basalt=t.neighbours.find(n=>n.identity==='basalt'),detail=page.locator('.chief-target').filter({has:page.locator(`[data-action="tribe-chief-council:${basalt.id}"]`)});await detail.locator('summary').press('Enter');await action(`tribe-chief-council:${basalt.id}`);await action(`tribe-focus:${basalt.id}`);
  v=await until(v=>v.tribe.chief?.result,'basalt council');assert.equal(v.tribe.chief.result.reason,'success');assert.ok(v.tribe.chief.result.delta>=25);await capture('basalt-council-result');results.push({check:'new basalt chief council with cultural outfit',result:v.tribe.chief.result});await action('tribe-chief-close');await home();
 }
 await action('tribe-all');await action(`tribe-equip:${conquest?'spear':'drum'}`);
 for(const [i,n] of t.neighbours.entries()){
  await action('tribe-all');await action(`tribe-focus:${n.id}`);const before=(await read()).tribe.neighbours.find(q=>q.id===n.id);await action(`tribe-${conquest?'attack':'socialize'}:${n.id}`);
  if(conquest&&n.identity==='basalt'){const clash=await until(v=>{const q=v.tribe.neighbours.find(q=>q.id===n.id);return q.health<before.health||q.society.members.length<before.society.members.length||q.society.members.some(u=>u.health<(before.society.members.find(b=>b.id===u.id)?.health??0));},'physical basalt combat');await capture('basalt-contact');results.push({check:'actual basalt defenders or home damaged after native attack',society:clash.tribe.neighbours.find(q=>q.id===n.id)});}
  let v=await until(v=>v.tribe.neighbours.find(q=>q.id===n.id).resolved,`resolve ${n.identity}`);
  assert.equal(v.tribe.neighbours.find(q=>q.id===n.id).resolved,conquest?'conquered':'allied');assert.equal(v.tribe.completed,i===4);assert.ok(v.tribe.members.length>0);
  results.push({check:`${n.identity} ${route}`,tick:v.tick,food:v.tribe.food,members:v.tribe.members.length,economies:v.tribe.neighbours.map(q=>({identity:q.identity,food:q.society.food,members:q.society.members.length}))});
  if(i===2){assert.equal(await page.locator('[data-action="tribe-next"]').count(),0);const saved=await exportGame('three-resolved');await importGame(saved.file);await page.keyboard.press('Escape');await action('save');await page.reload();await action('saves');await page.locator('[data-action^="load:"]').first().press('Enter');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal((await read()).tribe.completed,false);results.push({check:'three resolutions cannot finish after export/import and reload/load'});}
  if(i===4)await capture('five-completed');else await home();
 }
 const complete=await exportGame('completed');assert.equal(complete.saved.lineageHistory.stages[3].facts.length,5);assert.deepEqual(complete.saved.player.genome,s.player.genome);await importGame(complete.file);
 await action('tribe-next');assert.equal((await read()).stage,4);const final=await exportGame('active-campaign');assert.equal(final.saved.tribe.neighbours.length,5);assert.equal(final.saved.lineageHistory.stages[3].closed.outcome,conquest?'conquered':'allied');assert.deepEqual(errors,[]);results.push({check:'five frozen historical results and normal machine transition, no browser errors'});
 console.log(JSON.stringify({status:'passed',route,checks:results.length,errors}));
 }
}catch(error){await capture('failure').catch(()=>{});await writeFile(path.join(out,'failure-state.json'),JSON.stringify(await read().catch(()=>null)));await writeFile(path.join(out,'failure.txt'),String(error));throw error;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({route,build,wallSeconds:(Date.now()-started)/1000,prepared:'Completed historical coast -> new five-neighbour tribe; 220 food and four workshops. World obstacles, resources, fauna, neighbours, initial relations and member locations unmodified. All recruitment, equipment, outfit, music, chief, travel, outcomes, returns and save/load use production UI and real RAF; no live setters or advanceTime.',results,errors,timeline},null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();await server?.httpServer.close();}
