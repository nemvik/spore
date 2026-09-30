/** SP-005.B: native production UI, actual H import, no live setters or test clock. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5220',out=path.resolve(process.env.VEHICLE_OUTPUT??'evidence/sp-005b-vehicles/browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],checks=[],timings=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const act=async a=>{await page.locator(`[data-action="${a}"]:visible`).first().click();};
const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:path.join(out,name+'.png')});};
const dl=async(a,name)=>{const pending=page.waitForEvent('download');await act(a);const d=await pending,file=path.join(out,name);await d.saveAs(file);return file;};
const pause=async()=>{if((await read()).mode==='game')await act('pause');};
const open=async()=>{await pause();await act('vehicle-open');};
const entries=async()=>(await read()).vehicleLibrary;
const check=s=>{checks.push(s);console.log(s);};
const range=async(selector,steps)=>{await page.locator(selector).focus();for(let i=0;i<Math.abs(steps);i++)await page.keyboard.press(steps>0?'ArrowRight':'ArrowLeft');await page.keyboard.press('Tab');};
const exported=async name=>{await pause();if((await read()).mode!=='saves')await act('saves');return dl('export',name+'.save.json');};
const importSave=async file=>{await page.goto(base);await act('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');};
try{
 if(process.argv.includes('--followup')){
  await importSave(path.resolve('evidence/sp-005b-vehicles/browser/active-campaign.save.json'));await open();
  const file=path.resolve('evidence/sp-005b-vehicles/browser/boat-v2.json');
  // Targeted asynchronous I/O regression: delay only File.text(), never game state or time.
  await page.evaluate(()=>{const native=File.prototype.text;File.prototype.text=async function(){await new Promise(r=>setTimeout(r,350));return native.call(this);};});
  await page.locator('#import-vehicle').setInputFiles(file);await act('close');await open();await page.waitForTimeout(450);assert.equal((await entries()).length,0);
  await page.locator('#import-vehicle').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).vehicleLibrary?.length===1);
  check('A delayed file read cannot write after closing/reopening its library session');
  const boat=(await entries())[0];const cycles=[];
  for(let i=0;i<20;i++){const t=performance.now();await act('vehicle-edit:'+boat.id);await page.waitForTimeout(120);await act('cancel-editor');timings.push({kind:'editor-cycle',ms:performance.now()-t});if(i===4||i===19)cycles.push({cycle:i+1,render:(await read()).render});}
  await act('vehicle-new:tank');await page.locator('[data-genome="name"]').fill('Regresní nosič');await act('confirm-editor');const tank=(await entries()).find(c=>c.blueprint.carrier==='tank');await act('vehicle-use:'+tank.id);await act('confirm-editor');await pause();await act('library');await act('library-capture');const creature=(await read()).library[0];await act('library-edit:'+creature.id);await act('cancel-editor');assert.equal((await read()).mode,'library');
  check('Paid vehicle construction followed by creature editing/cancel returns to the correct library');
  await act('close');await open();await act('vehicle-edit:'+boat.id);await act('preview:move');
  const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last;const frame=t=>{if(last)samples.push(t-last);last=t;if(samples.length>=90)resolve(samples);else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  await shot('editor-performance-1280');const render=(await read()).render;
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'followup.json'),JSON.stringify({checks,errors,timings,cycles,frames,gpu,render,provenance:'Unchanged real active campaign imported through UI. File.text delay only for stale-import regression. No simulation or live-state writes. Native RAF editor samples.'},null,2));
 }else{
 await page.goto(base);await act('vehicle-open');const initial=await read();
 for(const [carrier,name,hue] of [['tank','Jantarový kráčivec',35],['air','Listový větroplach',100],['boat','Modrá perlorodka',165]]){
  await act('vehicle-new:'+carrier);await page.locator('[data-genome="name"]').fill(name);await page.locator('#vehicle-description').fill('Vlastní konstrukce napříč liniemi.');await range('[data-genome="hue"]',hue);
  if(carrier==='boat'){await act('select:sea-propeller');await range('[data-part="scale"]',5);}
  await act('preview:move');await page.waitForTimeout(500);if(carrier==='boat'){await page.setViewportSize({width:1024,height:640});await shot('boat-editor-1024');await page.setViewportSize({width:1280,height:720});}
  await act('confirm-editor');assert.equal((await read()).mode,'vehicles');
 }
 assert.deepEqual((await read()).player,initial.player);assert.equal((await entries()).length,3);
 let boat=(await entries()).find(c=>c.blueprint.carrier==='boat'),tank=(await entries()).find(c=>c.blueprint.carrier==='tank'),air=(await entries()).find(c=>c.blueprint.carrier==='air');
 const original=await dl('vehicle-export:'+boat.id,'boat-v1.json');
 await act('vehicle-edit:'+boat.id);await page.locator('[data-genome="name"]').fill('Modrá perlorodka II');await act('confirm-editor');boat=(await entries()).find(c=>c.id===boat.id);assert.equal(boat.revision,2);
 const current=await dl('vehicle-export:'+boat.id,'boat-v2.json');
 await page.locator('#import-vehicle').setInputFiles(current);await page.waitForTimeout(150);assert.equal((await entries()).length,3);
 await page.locator('#import-vehicle').setInputFiles(original);await page.waitForTimeout(150);assert.equal((await entries()).length,4);
 const bad=path.join(out,'invalid.json');await writeFile(bad,'{"format":"lumavora-vehicle","version":99}');const before=await entries();await page.locator('#import-vehicle').setInputFiles(bad);await page.waitForTimeout(150);assert.deepEqual(await entries(),before);assert.ok(await page.locator('.error').count());
 await act('vehicle-edit:'+tank.id);await page.locator('[data-genome="name"]').fill('Zrušené jméno');await act('cancel-editor');assert.equal((await entries()).find(c=>c.id===tank.id).blueprint.name,tank.blueprint.name);
 await shot('library-1280');check('3 native standalone designs; revisions, duplicate/conflicting imports, rejected corrupt import and cancellation preserve campaign');
 await act('close');await act('new');await open();assert.equal((await entries()).length,4);assert.equal(await page.locator('[data-action^="vehicle-use:"]').count(),0);await act('close');
 check('Library survives normal new lineage; early stage cannot manufacture unlocked content');
 await importSave(path.resolve('tests/fixtures/geography/sp-009h-conversion.save.json'));await act('travel-home');
 if((await read()).navigation.mode==='global')await page.keyboard.press('n');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=240,null,{timeout:120000});
 await open();const paidBefore=(await read()).machines.resource;
 await act('vehicle-use:'+boat.id);const draft=(await read()).editor.draft,cost=(await read()).editor.cost;assert.equal(draft.name,'Modrá perlorodka II');await act('confirm-editor');
 let state=await read();assert.equal(state.maritime.vessel.payment.amount,cost);assert.equal(state.maritime.vessel.payment.before,paidBefore);assert.deepEqual(state.maritime.vessel.blueprint,draft);const purchased=structuredClone(state.maritime.vessel);
 await open();await act('vehicle-use:'+tank.id);const tankDraft=(await read()).editor.draft,tankCost=(await read()).editor.cost;await act('confirm-editor');state=await read();assert.deepEqual(state.machines.blueprints.at(-1).blueprint,tankDraft);
 await open();await act('vehicle-use:'+air.id);const airDraft=(await read()).editor.draft;await act('confirm-editor');state=await read();assert.deepEqual(state.machines.blueprints.at(-1).blueprint,airDraft);
 await shot('paid-fleet-1280');
 await open();await act('vehicle-delete:'+boat.id);assert.deepEqual((await read()).maritime.vessel,purchased);await act('close');
 check(`Actual H income funds boat ${cost}, tank ${tankCost}, aircraft; installed snapshots survive deletion`);
 await page.keyboard.press('n');await page.locator('#atlas-cell').fill('1171');await page.locator('#atlas-cell').press('Tab');await act('sea:offer-sail');const started=performance.now();await act('sea:confirm');await page.locator('#sailing-status').waitFor();await page.waitForTimeout(600);
 const crossing=await exported('crossing-checkpoint');await importSave(crossing);await page.waitForTimeout(400);await act('sea:turn');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).maritime.journeys.at(-1).progress<1e-8);await act('sea:land');assert.equal((await read()).maritime.journeys.at(-1).phase,'returned');
 await page.keyboard.press('n');await page.locator('#atlas-cell').fill('1171');await page.locator('#atlas-cell').press('Tab');await act('sea:offer-sail');await act('sea:confirm');await page.locator('#sailing-status').waitFor();await page.setViewportSize({width:1024,height:640});await page.waitForTimeout(1700);await shot('custom-sailing-1024');
 await page.waitForFunction(()=>{const j=JSON.parse(window.render_game_to_text()).maritime.journeys.at(-1);return j.progress>=j.route.length-1-1e-8;},null,{timeout:30000});await act('sea:land');assert.equal((await read()).navigation.field.cellId,1171);
 await page.keyboard.press('n');await page.locator('#atlas-cell').fill('1614');await page.locator('#atlas-cell').press('Tab');await act('sea:offer-sail');await act('sea:confirm');await page.waitForFunction(()=>{const j=JSON.parse(window.render_game_to_text()).maritime.journeys.at(-1);return j.progress>=j.route.length-1-1e-8;},null,{timeout:30000});await act('sea:land');assert.equal((await read()).maritime.vessel.mooring,1614);timings.push({kind:'save-load-interrupted-and-return-trip',ms:performance.now()-started});
 const save=await exported('active-campaign');await importSave(save);await act('pause');await act('save');await page.reload();await act('saves');await page.locator('[data-action^="load:"]').first().click();await pause();state=await read();assert.deepEqual(state.maritime.vessel,purchased);assert.equal(state.maritime.journeys.length,3);
 check('Custom vessel survives export/import/rekey mid-voyage, interrupted return, overseas landing, home return and save/reload/load');
 await act('close');await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(2200);const metrics=await page.evaluate(()=>window.lumavora_metrics());await shot('returned-home-1280');assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,timings,metrics,provenance:'Native production UI and RAF. H is an unchanged historical earned input; no complete fresh campaign claimed. Library creations made through UI. No live state writes or advanceTime.',activeCampaign:save},null,2));
 }
}catch(e){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),errors,checks,state:await read().catch(()=>null)},null,2));await shot('failure');console.error(e);process.exitCode=1;}finally{if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();}
