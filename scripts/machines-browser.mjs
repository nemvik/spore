/** Targeted P2 UI scenarios. P1 export is real, alternate coast finales are explicitly prepared. */
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const output=path.resolve(process.env.MACHINES_OUTPUT??'evidence/era-p2/browser');await mkdir(output,{recursive:true});
const url=new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5180');url.searchParams.set('test','1');
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');const {makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const source=await readFile('tests/fixtures/saves/alliance-completed.save.json','utf8'),fixtures={};
for(const archetype of ['restoration','predator','migration']){const s=parseGame(source);s.campaign.finale=archetype;s.tribe.legacyAbility=archetype;makeCheckpoint(s);const filename=path.join(output,archetype+'.fixture.json');await writeFile(filename,serializeGame(s));fixtures[archetype]=filename;}
await writeFile(path.join(output,'FIXTURE.md'),'# P2 targeted UI verification\n\nStarts from the actually played P1 alliance export. For predator/migration only, the inherited coast finale and matching tribe ability are deliberately overridden before import and validated; these are strategy fixtures, not three earned full campaigns. All subsequent transitions, designs, payments, movement, resource capture and regional tasks use normal browser UI. DEV advanceTime accelerates fixed steps. No simulation state is written in the browser.\n');
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});const context=await browser.newContext({viewport:{width:1536,height:960},acceptDownloads:true});if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function frames(){for(let i=0;i<3;i++)await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}
async function action(name){await page.locator(`[data-action="${name}"]`).first().click();await frames();}
async function advance(ms){await page.evaluate(ms=>window.advanceTime(ms),ms);await frames();}
async function capture(name){await page.screenshot({path:path.join(output,name+'.png')});}
async function waitFor(predicate,label,seconds=240){for(let t=0;t<seconds;t+=3){const s=await read();assert.equal(s.mode,'game',label);if(predicate(s))return s;await advance(3000);}throw new Error('Timed out: '+label+' '+JSON.stringify((await read()).machines));}
async function select(id){await action('machine-select:'+id);assert.deepEqual((await read()).commandSelection,[{kind:'machine',id}]);}
async function build(carrier,archetype){const before=await read();await action('machine-editor:'+carrier);assert.equal((await read()).mode,'editor');assert.equal((await read()).editor.draft.kind,'vehicle');assert.equal((await read()).editor.draft.carrier,carrier);
 await page.locator('[data-genome="name"]').fill(archetype+' '+carrier);await page.locator('[data-genome="name"]').press('Tab');
 if(archetype==='predator'&&carrier==='tank')await action('add:armor');
 // Same controls and undo/redo history as the organism editor.
 const hue=page.locator('[data-genome="hue"]');await hue.focus();await page.keyboard.press('ArrowRight');await hue.press('Tab');const changed=(await read()).editor.draft;await action('undo');assert.notEqual((await read()).editor.draft.hue,changed.hue);await action('redo');assert.deepEqual((await read()).editor.draft,changed);
 const draft=(await read()).editor.draft,cost=(await read()).editor.cost;await capture(archetype+'-'+carrier+'-editor');await action('confirm-editor');let s=await read();assert.equal(s.mode,'game');assert.equal(s.machines.resource,before.machines.resource-cost);const u=s.machines.fleet.at(-1);assert.deepEqual(s.machines.blueprints.find(d=>d.id===u.blueprint).blueprint,draft);await select(u.id);return u.id;
}
async function exportState(name,reload=false){const before=await read();await action('pause');await action('saves');const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const filename=path.join(output,name+'.save.json');await download.saveAs(filename);const saved=parseGame(await readFile(filename,'utf8'));assert.deepEqual(saved.machines,before.machines);if(reload){await page.locator('#import-save').setInputFiles(filename);await frames();assert.deepEqual((await read()).machines,before.machines);}else await action('close');return saved;}
async function repair(id){await select(id);await action('machine-home');await page.waitForTimeout(300);await page.mouse.click(770,485,{button:'right'});await frames();const home=(await read()).tribe.huts.find(h=>h.kind==='shelter').pos;await waitFor(s=>Math.hypot(s.machines.fleet.find(u=>u.id===id).pos.x-home.x,s.machines.fleet.find(u=>u.id===id).pos.z-home.z)<8,'return for repair',90);await action('machine-repair');}
try{
 for(const archetype of ['restoration','predator','migration']){
  await page.goto(url.href);await action('saves');await page.locator('#import-save').setInputFiles(fixtures[archetype]);await action('tribe-next');await page.waitForTimeout(500);let s=await read();assert.equal(s.stage,4);assert.equal(s.machines.archetype,archetype);assert.equal(s.machines.airUnlocked,false);assert.equal(await page.locator('[data-action="machine-editor:air"]').isDisabled(),true);await capture(archetype+'-entry');
  const tank=await build('tank',archetype);s=await read();const spring=s.machines.springs[0];await action('machine-capture:'+spring.id);await advance(2000);await exportState(archetype+'-in-flight',true);await select(tank);
  await waitFor(s=>s.machines.springs[0].owner==='player','first spring');const stock=(await read()).machines.resource;await advance(10000);assert.ok((await read()).machines.resource>stock+5);
  for(const r of (await read()).machines.regions.filter(r=>!r.airOnly)){
   await select(tank);await action('machine-focus:region:'+r.id);await action('machine-region:'+r.id);await waitFor(s=>s.machines.regions.find(x=>x.id===r.id).owner==='player','region '+r.identity,300);await capture(archetype+'-'+r.identity);if(archetype==='predator')await repair(tank);
  }
  await select(tank);const second=(await read()).machines.springs[1];await action('machine-capture:'+second.id);await waitFor(s=>s.machines.springs[1].owner==='player','second spring');
  assert.equal((await read()).machines.airUnlocked,true);await waitFor(s=>s.machines.resource>90,'air funding');
  await action('machine-home');const air=await build('air',archetype);s=await read();const summit=s.machines.regions.find(r=>r.airOnly);await action('machine-focus:region:'+summit.id);
  const prior=s.machines.springs[2];await action('machine-capture:'+prior.id);assert.equal((await read()).machines.fleet.find(u=>u.id===air).orders.length,0,'Air cannot capture spring');
  await action('machine-region:'+summit.id);await waitFor(s=>s.machines.completed,'machine era complete',300);await capture(archetype+'-highlands');s=await read();assert.ok(s.machines.fleet.some(u=>u.id===air));assert.ok(s.machines.regions.every(r=>r.method===archetype));assert.equal(s.campaign.finale,archetype);await exportState(archetype+'-completed',true);results.push({archetype,tick:s.tick,fleet:s.machines.fleet.length,resource:s.machines.resource});
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'results.json'),JSON.stringify({status:'passed',results,errors},null,2));console.log(JSON.stringify({status:'passed',results,errors},null,2));
}catch(error){await capture('failure').catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({message:error.message,state:await read().catch(()=>null),errors},null,2));throw error;}
finally{if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(output,'trace.zip')});await browser.close();await ssr.close();}
