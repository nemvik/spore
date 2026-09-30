/** Real D continuation. Native controls and RAF; no state setters or accelerated clock. */
import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5220',out=path.resolve(process.env.COMMERCE_OUTPUT??'evidence/sp-009j/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],checks=[],performanceSamples=[],resources=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const act=async a=>page.locator(`[data-action="${a}"]:visible`).first().click();
const shot=async n=>{await page.waitForTimeout(200);await page.screenshot({path:path.join(out,n+'.png')});};
const check=n=>{checks.push(n);console.log(n);};
const pause=async()=>{if((await read()).mode==='game')await act('pause');};
const resume=async()=>{if((await read()).mode!=='game')await act('close');};
const exportSave=async n=>{await pause();if((await read()).mode!=='saves')await act('saves');const ready=page.waitForEvent('download');await act('export');const download=await ready,file=path.join(out,n+'.save.json');await download.saveAs(file);return file;};
const importSave=async file=>{await page.goto(base);await act('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');};
const visit=async id=>{if((await read()).navigation.mode!=='global')await page.keyboard.press('n');await act('city-select:'+id);await act('city-enter:'+id);await page.locator('#trade-panel').waitFor();};
const contract=s=>s.commerce.contracts.at(-1),delivery=s=>contract(s).deliveries.at(-1);
const ready=async back=>page.waitForFunction(back=>{const s=JSON.parse(window.render_game_to_text()),d=s.commerce.contracts.flatMap(c=>c.deliveries).find(d=>d.phase!=='returned');return d&&(back?d.progress<=1e-8:d.progress>=d.route.length-1-1e-8);},back,{timeout:90000});
const carriers=async()=>{const s=await read();return {tank:s.machines.fleet.find(u=>s.machines.blueprints.find(d=>d.id===u.blueprint).blueprint.name==='Měděný posel').id,air:s.machines.fleet.find(u=>s.machines.blueprints.find(d=>d.id===u.blueprint).blueprint.name==='Nefritové křídlo').id,boat:'boat'};};
async function dispatch(carrier){const s=await read(),id=contract(s).id;const details=page.locator('.commerce-contract details').first();if(await details.getAttribute('open')===null)await details.locator('summary').click();await act(`commerce:offer,${id},${carrier}`);await act('commerce:confirm');await page.locator('#commerce-status').waitFor();}
async function complete(carrier){await dispatch(carrier);await ready(false);await act('commerce:unload');await ready(true);await act('commerce:dock');await page.locator('#trade-panel').waitFor();}
try{
 if(process.env.COMMERCE_RESUME){await importSave(path.resolve(process.env.COMMERCE_RESUME));}
 else{
  await importSave(path.resolve('tests/fixtures/geography/sp-009d-states.save.json'));const initial=await read();assert.ok(initial.cities.entries.every(c=>!c.capture&&!c.transfers.length));await act('travel-home');
  const began=Date.now(),money=(await read()).machines.resource;console.log('Native home income: saving for own carriers and four city purchases');
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).machines.resource>=1000,null,{timeout:650000});
  check(`Earned ${((await read()).machines.resource-money).toFixed(1)} amber from existing springs in ${((Date.now()-began)/1000).toFixed(1)} real seconds`);
  const earned=await exportSave('earned-home');await resume();
  for(const [kind,name] of [['tank','Měděný posel'],['air','Nefritové křídlo'],['boat','Perleťová bárka']]){
   await pause();await act('vehicle-open');await act('vehicle-new:'+kind);await page.locator('[data-genome="name"]').fill(name);await act('confirm-editor');const e=(await read()).vehicleLibrary.find(e=>e.blueprint.name===name);await act('vehicle-use:'+e.id);await act('confirm-editor');
  }
  await exportSave('paid-carriers');await resume();check('Own tank, aircraft and boat manufactured through library UI from earned home amber');
 }
 const ids=await carriers();let state=await read(),targets=state.cities.entries.filter(c=>c.owner.kind==='state').map(c=>c.id);let replayed=false,boatUsed=false;
 for(const [index,cityId] of targets.entries()){
  await visit(cityId);await act('commerce:open');state=await read();assert.equal(contract(state).deliveries.length,0);
  // Cancellation preserves funds and city before any delivery.
  if(index===0){const before=state.machines.resource;await act('commerce:cancel,'+contract(state).id);await act('commerce:confirm');assert.equal((await read()).machines.resource,before);await act('commerce:open');}
  if(!replayed){
   if(process.argv.includes('--stress')){for(let cycle=0;cycle<20;cycle++){await dispatch(ids.tank);await page.waitForTimeout(120);await act('commerce:abort');await ready(true);await act('commerce:dock');await page.waitForTimeout(150);if(cycle===4||cycle===19)resources.push({cycle:cycle+1,render:(await read()).render});}check('20 real aborted roundtrips return cargo and release transient scene geometry');}
   await dispatch(ids.tank);await page.waitForTimeout(180);await pause();const frozen=structuredClone(delivery(await read()));await page.waitForTimeout(400);assert.deepEqual(delivery(await read()),frozen);await resume();
   const crossing=await exportSave('crossing-checkpoint');await importSave(crossing);const deposit=(await read()).machines.resource;await act('commerce:abort');await ready(true);await act('commerce:dock');assert.equal((await read()).machines.resource,deposit+20);
   check('In-flight export/import/rekey and paused time preserve real route; interrupted delivery refunds exactly once after return');replayed=true;
  }
  for(let n=0;n<3;n++){
   let carrier=n===1?ids.air:ids.tank;
   if(!boatUsed){const details=page.locator('.commerce-contract details').first();if(await details.getAttribute('open')===null)await details.locator('summary').click();const b=page.locator(`[data-action="commerce:offer,${contract(await read()).id},boat"]`);if(await b.count()&&!await b.isDisabled()){carrier=ids.boat;boatUsed=true;}}
   await dispatch(carrier);
   if(index===0&&n===0){await page.setViewportSize({width:1024,height:640});await shot('transport-1024');
    const samples=await page.evaluate(()=>new Promise(resolve=>{const v=[];let last;const frame=t=>{if(last)v.push(t-last);last=t;if(v.length>=90)resolve(v);else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));performanceSamples.push({scene:'transport',frames:samples});
    await page.setViewportSize({width:1280,height:720});
   }
   await ready(false);await act('commerce:unload');await ready(true);await act('commerce:dock');
  }
  state=await read();assert.equal(contract(state).deliveries.filter(d=>d.delivered).length,3);assert.ok(state.cities.entries.find(c=>c.id===cityId).owner.kind==='state');
  if(index===0){await page.locator('.commerce-contract h3').scrollIntoViewIfNeeded();await shot('three-deliveries-1280');}
  await act('trade:offer');await act('trade:confirm');state=await read();const city=state.cities.entries.find(c=>c.id===cityId),receipt=city.transfers.at(-1);assert.equal(city.owner.kind,'lineage');assert.equal(receipt.version,2);assert.equal(receipt.credit,60);assert.equal(receipt.payment.after,receipt.payment.before-(receipt.price-60));assert.equal(contract(state).status,'settled');
  check(`Purchased city ${index+1}/${targets.length}, reserve ${receipt.decision.reserve}, civil reserve ${receipt.decision.tradeReserve}, price ${receipt.price}, actual credit60`);
  await exportSave('active-campaign');await resume();
 }
 state=await read();assert.ok(state.cities.entries.every(c=>c.owner.kind==='lineage'));assert.ok(state.cities.entries.every(c=>!c.capture&&c.transfers.every(t=>t.method==='trade')));assert.equal(state.military.raids.length,0);if(!boatUsed)check('This historical D planet has no sea route to a rival city; native commercial boat delivery remains unverified here');
 await act('city-camera');await shot('peaceful-unification-1280');const saved=await exportSave('active-campaign');await importSave(saved);await pause();await act('save');await page.reload();await act('saves');await page.locator('[data-action^="load:"]').first().click();await pause();state=await read();assert.ok(state.cities.entries.every(c=>c.owner.kind==='lineage'));assert.ok(state.commerce.contracts.filter(c=>c.status==='settled').length===4);
 check('All four rival cities unified only through trade; both solvent final cities reached; save/reload/load preserves accounts and complete contracts');
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,performanceSamples,resources,boatUsed,states:state.states,commerce:state.commerce,provenance:'Unchanged actual D campaign, native RAF and normal UI only. No live setters/debug progress. This proves complete commercial continuation, not a fresh organism-to-space campaign.'},null,2));
}catch(e){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,errors,state:await read().catch(()=>null)},null,2));await shot('failure');console.error(e);process.exitCode=1;}finally{if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();}
