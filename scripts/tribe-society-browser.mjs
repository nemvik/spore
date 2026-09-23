/** Prepared stocks/workshops, then production UI + real RAF only. No live setters. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const route=process.argv.includes('--conquest')?'conquest':'peace';
const out=path.resolve(process.env.SOCIETY_OUTPUT??`evidence/sp-008a/${route}`);
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {continueToTribeEra,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {enableLineageHistory}=await ssr.ssrLoadModule('/src/game/lineage-history.ts');
const {openGround,unitNavigation}=await ssr.ssrLoadModule('/src/game/unit-motion.ts');
const s=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));
enableLineageHistory(s);assert.ok(continueToTribeEra(s));
const t=s.tribe;t.food=160;
// These buildings and supplies are prepared input, not earned construction.
for(const [i,tool] of ['drum','spear'].entries()){t.huts.push({id:t.nextId++,kind:'workshop',tool,pos:openGround(s.world,t.huts[0].pos,i+2,10),progress:1,health:100});t.unlocked.push(tool);}
const garden=t.neighbours[0];garden.society.food=0;garden.society.members= garden.society.members.slice(0,2);garden.society.recruitCooldown=0;for(const u of garden.society.members)u.hunger=35;
const terrace=t.neighbours[1];terrace.society.food=4;
// Prepared local depletion sustains the shortage during the warning, without changing routes.
for(const r of s.world.resources)if(Math.hypot(r.pos.x-terrace.pos.x,r.pos.z-terrace.pos.z)<35){r.amount=0;r.regen=0;}
for(const [i,u] of terrace.society.members.entries()){u.pos=openGround(s.world,terrace.pos,i,4);u.navigation=unitNavigation(u.pos);}
makeCheckpoint(s);
const fixture=path.join(out,'prepared-tribe.fixture.json');await writeFile(fixture,serializeGame(s));
await ssr.close();
if(process.argv.includes('--fixtures-only'))process.exit(0);
const browser=await chromium.launch({headless:true,...(process.env.LUMAVORA_BROWSER_CHANNEL?{channel:process.env.LUMAVORA_BROWSER_CHANNEL}:{}),args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],results=[],timeline=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async(name)=>{timeline.push(name);console.log(route,name);await page.locator(`[data-action="${name}"]`).first().click();if(name.includes("focus"))await page.waitForTimeout(650);};
const capture=async name=>page.screenshot({path:path.join(out,`${name}.png`)});
async function until(predicate,label,seconds=90){
 const end=Date.now()+seconds*1000;while(Date.now()<end){const s=await read();assert.equal(s.mode,'game',`Unexpected mode ${s.mode}: ${label}`);if(predicate(s))return s;await page.waitForTimeout(250);}
 throw new Error(`Timed out: ${label}`);
}
async function exportImport(name){
 await action('pause');const before=await read();await action('saves');
 const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,`${name}.save.json`);await download.saveAs(file);
 const saved=JSON.parse(await readFile(file,'utf8')).state;assert.deepEqual(saved.tribe,before.tribe);
 await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 // Pause through the real UI before comparing; a handful of normal ticks may pass.
 await action('pause');const after=await read();assert.ok(after.tick>=before.tick&&after.tick-before.tick<120);
 assert.equal(after.tribe.nextId,before.tribe.nextId);assert.deepEqual(after.lineageHistory,before.lineageHistory);
 for(const n of before.tribe.neighbours){const a=after.tribe.neighbours.find(v=>v.id===n.id);assert.equal(a.resolved,n.resolved);assert.deepEqual(a.society.members.map(u=>u.id),n.society.members.map(u=>u.id));if(n.society.expedition){assert.deepEqual(a.society.expedition?.members,n.society.expedition.members);assert.equal(a.society.expedition?.phase,n.society.expedition.phase);}for(const u of n.society.members){const v=a.society.members.find(v=>v.id===u.id);assert.ok(Math.hypot(v.pos.x-u.pos.x,v.pos.z-u.pos.z)<4);}}
 results.push({check:`${name}: export/import`,tick:after.tick,elapsedTicks:after.tick-before.tick});await action('close');return after;
}
try{
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5194');await action('saves');await page.locator('#import-save').setInputFiles(fixture);
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await action('tribe-all');await action(`tribe-equip:${route==='peace'?'drum':'spear'}`);
 let current=await until(v=>v.tribe.neighbours[1].society.expedition?.phase==='warning','autonomous warning',20);
 assert.ok(await page.locator('.neighbour-warning').count());await action(`tribe-expedition-focus:${terrace.id}`);await capture('warning');
 results.push({check:'autonomous warning',party:current.tribe.neighbours[1].society.expedition.members,stock:current.tribe.neighbours[1].society.food});
 current=await until(v=>v.tribe.neighbours[0].society.members.some(u=>u.cargo>0),'visible autonomous cargo',20);
 await action(`tribe-focus:${garden.id}`);await capture('harvesting');
 const loads=current.tribe.neighbours[0].society.members.filter(u=>u.cargo>0).map(u=>({id:u.id,cargo:u.cargo,resource:u.resource,pos:u.pos,before:s.world.resources.find(r=>r.id===u.resource)?.amount,after:current.world.resources.find(r=>r.id===u.resource)?.amount??0}));
 assert.ok(loads.some(u=>u.before>=1&&u.after<u.before));
 results.push({check:'visible physical harvest',cargo:loads,food:current.tribe.neighbours[0].society.food});
 current=await until(v=>v.tribe.neighbours[1].society.expedition?.phase==='outbound','actual departure',30);
 await exportImport('outbound');await action('tribe-all');await action(`tribe-expedition-focus:${terrace.id}`);await capture('outbound');
 await action(`tribe-${route==='peace'?'parley':'intercept'}:${terrace.id}`);
 if(route==='peace'){
  current=await until(v=>v.tribe.neighbours[1].society.truce>0,'physical parley');assert.equal(current.tribe.neighbours[1].tribute,12);
  results.push({check:'outbound party calmed by actual visitor',food:current.tribe.food,truce:current.tribe.neighbours[1].society.truce});
 }else{
  const party=current.tribe.neighbours[1].society.expedition.members;
  current=await until(v=>party.some(id=>!v.tribe.neighbours[1].society.members.some(u=>u.id===id)),'intercepted expedition');
  results.push({check:'expedition intercepted in combat',party,survivors:current.tribe.members.length});
 }
 await capture('response');await action('tribe-retreat');
 current=await until(v=>v.tribe.neighbours[0].society.members.some(u=>u.cargo>0)||v.tribe.neighbours[0].society.members.length>2,'autonomous harvest');
 await action(`tribe-focus:${garden.id}`);await capture('economy');
 current=await until(v=>v.tribe.neighbours[0].society.members.length>2,'paid population recovery',120);
 assert.ok(current.tribe.neighbours[0].society.members.some(u=>u.hunger<35));
 results.push({check:'autonomous harvest/delivery/feeding/recruitment',initial:{food:0,members:2,hunger:35},after:current.tribe.neighbours[0].society});
 await exportImport('economy');
 // All subsequent outcomes start unresolved and are earned by ordinary orders.
 for(const n of current.tribe.neighbours){
  await action('tribe-all');await action(`tribe-focus:${n.id}`);await action(`tribe-${route==='peace'?'socialize':'attack'}:${n.id}`);
  current=await until(v=>!!v.tribe.neighbours.find(x=>x.id===n.id).resolved,`resolve ${n.identity}`,150);
  assert.equal(current.tribe.neighbours.find(x=>x.id===n.id).resolved,route==='peace'?'allied':'conquered');
  results.push({check:`${n.identity}: ${route}`,tick:current.tick,members:current.tribe.members.length,food:current.tribe.food});
  await action('tribe-retreat');await until(v=>v.tribe.members.every(u=>u.orders.length===0),'return for care',90);
  await page.waitForTimeout(4500);
 }
 current=await until(v=>v.tribe.completed,'completed');assert.ok(current.tribe.members.length);
 await exportImport('completed');await capture('completed');
 const metrics=await page.evaluate(()=>window.lumavora_metrics());const times=metrics.samples.sort((a,b)=>a-b);results.push({check:'short rendering sample',frames:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]});
 assert.equal((await read()).lineageHistory.stages[3].closed.source,'action');
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(500);await capture('small-ui');
 assert.equal(await page.locator('[data-action="tribe-retreat"]').isVisible(),true);
 await action('tribe-next');assert.equal((await read()).stage,4);
 results.push({check:'normal machines transition',stage:4});await exportImport('active-campaign');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',route,checks:results.length,errors}));
 await writeFile(path.join(out,'results.json'),JSON.stringify({status:'passed',route,provenance:'Prepared completed coast, tribe supplies/workshops, hungry two-person garden and locally depleted, scarce hostile terrace. No outcomes prepared. Everything after import uses production UI and real RAF; no live setters or advanceTime.',results,timeline,errors},null,2));
}catch(error){await capture('failure').catch(()=>{});await writeFile(path.join(out,'failure-state.json'),JSON.stringify(await read().catch(()=>null),null,2));await writeFile(path.join(out,'results.json'),JSON.stringify({status:'failed',message:error.message,route,results,timeline,errors},null,2));throw error;}
finally{if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();}
