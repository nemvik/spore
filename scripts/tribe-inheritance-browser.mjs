/** SP-007.B1: prepared near-completed tribes; production UI / native RAF only. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';
const out=path.resolve(process.env.INHERITANCE_OUTPUT??'evidence/sp-007b1/production');await mkdir(out,{recursive:true});
const replay=process.argv.includes('--replay');
const routes=process.env.INHERITANCE_ROUTE?[process.env.INHERITANCE_ROUTE]:['allied','conquered','mixed'];
const rates={allied:[1.2,1],conquered:[1,1.2],mixed:[1.1,1.1]};
const prepared=(replay?'Final-build replay imports the previously UI-played spring exports from evidence/sp-007b1/production. No edits to those exports. Original input provenance: ':'')+'Same historical won coast/body/restoration finale -> five-neighbour tribe. Four resolutions prepared before history activation (saved evidence); final basalt unresolved at relation 99 for allied/mixed, or empty settlement with 1 health for conquered. 100 food. Members start at their ordinary home, no tools/outfits/machines/amber/regions prepared. Other societies/world untouched. Last contact, completion, transition, paid construction, travel, capture, regional deliveries, save/load/import use native UI and real RAF. No live setters, localStorage writes or advanceTime.';
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {continueToTribeEra,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {enableLineageHistory}=await ssr.ssrLoadModule('/src/game/lineage-history.ts');
const {vehicleStats}=await ssr.ssrLoadModule('/src/game/blueprint.ts');
const fixtures={};let body;
for(const route of routes){
 const s=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));assert.ok(continueToTribeEra(s));const t=s.tribe;t.food=100;
 for(const [i,n] of t.neighbours.entries()){
  if(i===4){if(route==='conquered'){n.health=1;n.society.members=[];}else n.relation=99;continue;}
  n.resolved=route==='allied'||route==='mixed'&&i%2===0?'allied':'conquered';n.relation=n.resolved==='allied'?100:-100;if(n.resolved==='conquered')n.health=0;
 }
 s.checkpoint=null;enableLineageHistory(s);makeCheckpoint(s);body??=s.player.genome;assert.deepEqual(s.player.genome,body);
 fixtures[route]=path.join(out,`${route}-prepared.fixture.json`);await writeFile(fixtures[route],serializeGame(s));
}
await ssr.close();await writeFile(path.join(out,'PREPARED.md'),`# Prepared inputs\n\n${prepared}\n`);
if(process.argv.includes('--fixtures-only'))process.exit(0);
const build=(await readFile('dist/index.html','utf8')).match(/assets\/[^\"]+\.js/g);
const server=process.env.LUMAVORA_URL?null:await preview({preview:{host:'127.0.0.1',port:5203,strictPort:true},logLevel:'error'});
const browser=await chromium.launch({headless:true,channel:process.env.LUMAVORA_BROWSER_CHANNEL??'chrome'});
const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});context.setDefaultTimeout(30000);
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],results=[],started=Date.now();
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function action(name){console.log(name);const b=page.locator(`[data-action="${name}"]:visible`).first();await b.scrollIntoViewIfNeeded();await b.press('Enter');}
async function until(fn,label,seconds=180){const end=Date.now()+seconds*1000;while(Date.now()<end){const v=await read();assert.equal(v.mode,'game',label);if(fn(v))return v;await page.waitForTimeout(150);}throw Error(`Timeout: ${label}`);}
const capture=name=>page.screenshot({path:path.join(out,`${name}.png`)});
async function exportGame(name){if((await read()).mode==='game')await page.keyboard.press('Escape');if(!await page.locator('#import-save').count())await action('saves');const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,`${name}.save.json`);await download.saveAs(file);return {file,saved:parseGame(await readFile(file,'utf8'))};}
async function importGame(file){if((await read()).mode==='game')await page.keyboard.press('Escape');if(!await page.locator('#import-save').count())await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
try {
 for(const route of routes){
  console.log('ROUTE',route);await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5203');await action('saves');await importGame(fixtures[route]);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  let v=await read(),design,tank;
  if(!replay){
   assert.equal(v.tribeInheritance.route,null);assert.equal(v.tribe.completed,false);
   const n=v.tribe.neighbours.at(-1);await action('tribe-all');await action(`tribe-focus:${n.id}`);await action(`tribe-${route==='conquered'?'attack':'socialize'}:${n.id}`);
   v=await until(v=>v.tribe.completed,'last physical tribe resolution');assert.equal(v.lineageHistory.stages[3].closed.outcome,route);assert.deepEqual(v.lineageHistory.stages[3].facts.map(f=>f.source),['saved','saved','saved','saved','action']);
   await action('tribe-next');v=await read();assert.equal(v.stage,4);assert.equal(v.machines.resource,100);assert.equal(v.machines.archetype,'restoration');assert.deepEqual(v.player.genome,body);
   assert.equal(v.tribeInheritance.income,rates[route][0]);assert.equal(v.tribeInheritance.power,rates[route][1]);
   await page.keyboard.press('j');assert.ok((await page.locator('.lineage-history').innerText()).includes('Dědictví kmene'));await capture(`${route}-journal`);await action('close');
   await action('machine-editor:tank');design=(await read()).editor.draft;const cost=(await read()).editor.cost;await action('confirm-editor');v=await read();assert.equal(v.machines.resource,100-cost);assert.equal(v.machines.fleet.length,1);
   tank=v.machines.fleet[0].id;await action(`machine-select:${tank}`);const spring=v.machines.springs[0];await action(`machine-capture:${spring.id}`);
   await until(v=>v.machines.springs[0].owner==='player','native spring capture');
  }else{
   await importGame(path.resolve(`evidence/sp-007b1/production/${route}-spring.save.json`));v=await read();tank=v.machines.fleet[0].id;design=v.machines.blueprints.find(d=>d.id===v.machines.fleet[0].blueprint).blueprint;
   assert.deepEqual(v.player.genome,body);assert.equal(v.machines.archetype,'restoration');assert.equal(v.tribeInheritance.route,route);
   await page.keyboard.press('j');await capture(`${route}-journal`);await action('close');
  }
  const start=await read();await page.waitForTimeout(3200);const end=await read(),elapsed=end.machines.elapsed-start.machines.elapsed;
  const income=(end.machines.resource-start.machines.resource)/elapsed;assert.ok(Math.abs(income-.6*rates[route][0])<1e-6);assert.equal(end.machineIncome,.6*rates[route][0]);
  assert.ok((await page.locator('.tribe-status').innerText()).includes((.6*rates[route][0]).toFixed(2)));
  const exported=await exportGame(`${route}-spring`);await importGame(exported.file);v=await read();assert.equal(v.tribeInheritance.route,route);assert.equal(v.machineIncome,.6*rates[route][0]);
  // Native local save, browser refresh and slot load; the isolated browser owns these slots.
  await page.keyboard.press('Escape');await action('save');await page.reload();await action('saves');await page.locator('[data-action^="load:"]').first().press('Enter');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
  v=await read();assert.equal(v.tribeInheritance.route,route);assert.equal(v.machineIncome,.6*rates[route][0]);
  await action(`machine-select:${tank}`);const region=v.machines.regions[0];await action(`machine-focus:region:${region.id}`);await action(`machine-region:${region.id}`);
  const working=await until(v=>v.machines.regions[0].soil>25,'actual region work');await page.waitForTimeout(2200);const worked=await read();assert.ok(worked.machines.regions[0].soil<95);
  const power=vehicleStats(design).power,rate=(worked.machines.regions[0].soil-working.machines.regions[0].soil)/(worked.machines.elapsed-working.machines.elapsed);
  assert.ok(Math.abs(rate-power*.28*rates[route][1])<1e-6);await capture(`${route}-working`);
  v=await until(v=>v.machines.regions[0].owner==='player','two physical regional deliveries',240);assert.equal(v.machines.regions[0].settlers,2);assert.equal(v.machines.regions[0].method,'restoration');assert.equal(v.machines.airUnlocked,true);
  await page.locator(`[data-action="machine-region:${region.id}"]`).waitFor({state:'detached'});
  if(replay&&route!=='allied')assert.ok((await page.locator('#toast').innerText()).includes(`výkon při připojování +${route==='conquered'?20:10} %`));
  await capture(`${route}-completed`);const final=await exportGame(`${route}-active-campaign`);assert.deepEqual(final.saved.player.genome,body);assert.equal(final.saved.lineageHistory.stages[3].facts.length,5);
  results.push({route,checks:replay?5:7,income,regionRate:rate,basePower:power,finalTick:final.saved.tick,resource:final.saved.machines.resource,source:final.saved.lineageHistory.stages[3],saved:path.basename(final.file)});
  console.log(JSON.stringify(results.at(-1)));
 }
 assert.deepEqual(errors,[]);
}catch(error){await capture('failure').catch(()=>{});await writeFile(path.join(out,'failure.json'),JSON.stringify({message:String(error),state:await read().catch(()=>null)},null,2));throw error;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({build,prepared,wallSeconds:(Date.now()-started)/1000,results,errors},null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();await server?.httpServer.close();}
