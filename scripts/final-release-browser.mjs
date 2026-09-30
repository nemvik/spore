/** Final production build opens the exact completed native campaign via public
 * import/save/reload/export. Isolated compatibility check, not new progression. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('evidence/final-campaign'),out=path.resolve(process.env.LUMAVORA_EVIDENCE??path.join(root,'release'));await mkdir(out,{recursive:true});
const source=path.join(root,'space/49-first-expedition-home.save.json'),canonical=path.join(root,'organism/active-campaign.save.json');
const sourceBytes=await readFile(source),mainBytes=await readFile(canonical),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(sourceBytes),'4970920af1b1ac92d6cc6f9bcb92674e87026b197cd4814b3dc47de8deb1dae0');
const original=JSON.parse(sourceBytes).state;
const browser=await chromium.launch({channel:'chrome',headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1024,height:640},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=a=>page.locator(`button[data-action="${a}"]:visible`).first().click();
const pause=async()=>{if((await read()).mode==='game')await action('pause');};
try{
  await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5220');await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  const assets=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
  await action('saves');await page.locator('#import-save').setInputFiles(source);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await pause();
  await action('save');await action('saves');const load=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');assert.ok(load);
  await page.reload();await action('saves');await action(load);await pause();await action('saves');
  const pending=page.waitForEvent('download');await action('export');const file=path.join(out,'final-release-roundtrip.save.json');await (await pending).saveAs(file);
  const bytes=await readFile(file),saved=JSON.parse(bytes).state;assert.notEqual(saved.id,original.id);assert.equal(saved.stage,5);assert.equal(saved.seed,original.seed);assert.ok(saved.tick>=original.tick);
  assert.equal(saved.space.location,null);assert.deepEqual(saved.player.genome,original.player.genome);
  for(const key of ['lineageHistory','civilization','cities','commerce','mobilization'])assert.deepEqual(saved[key],original[key],key);
  // The dock resumes domestic time for the real frames around import/load.
  // Preserve historical state facts and account for the actual clock delta.
  const statesCopy=states=>({...states,clock:null,entries:states.entries.map(e=>({...e,last:e.last?{...e.last,turn:0}:null}))});
  assert.deepEqual(statesCopy(saved.states),statesCopy(original.states));
  const stateSeconds=states=>states.clock.turn*10+states.clock.elapsed;
  assert.ok(Math.abs(stateSeconds(saved.states)-stateSeconds(original.states)-(saved.tick-original.tick)/60)<1e-7);
  for(const key of ['core','discoveries','empires','outfit','expansion','wars','events','log','nextSerial','expedition'])assert.deepEqual(saved.space[key],original.space[key],key);
  for(const key of ['id','creation','purchase','health'])assert.deepEqual(saved.space.ship[key],original.space.ship[key],key);
  for(const key of ['balance','ledger','cargo','sales','counts','actions','nextAction'])assert.deepEqual(saved.space.economy[key],original.space.economy[key],key);
  const cp=JSON.parse(saved.checkpoint),beforeCP=JSON.parse(original.checkpoint);assert.equal(cp.id,saved.id);delete cp.id;delete beforeCP.id;assert.deepEqual(cp,beforeCP);
  assert.deepEqual(errors,[]);assert.deepEqual(await readFile(canonical),mainBytes);assert.deepEqual(await readFile(source),sourceBytes);
  await writeFile(path.join(out,'result.json'),JSON.stringify({checks:5,errors,assets,sourceSHA256:hash(sourceBytes),exportSHA256:hash(bytes),mainSHA256:hash(mainBytes),mainPreserved:true,from:original.id,to:saved.id,nativeDomesticTicks:saved.tick-original.tick,checkpointPreserved:true,provenance:'Isolated public import/save/reload/load/export of exact completed native lineage on final build. No additional campaign progression or human acceptance claimed.'},null,2));console.log(JSON.stringify({checks:5,errors,mainPreserved:true}));
}finally{await context.close();await browser.close();}
