/** SP-010.A production UI regression. Prepared inputs are explicitly listed below. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const out=path.resolve(process.env.HOME_PLANET_OUTPUT??'evidence/sp-010a/browser');
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5210';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {createGame,tryTransition,makeCheckpoint}=await ssr.ssrLoadModule('/src/game/simulation.ts');
const {CHAPTERS}=await ssr.ssrLoadModule('/src/game/content.ts');
const prepared='Fresh birth is ordinary New Lineage. Eleven original fixtures remain unchanged. Browser uses historical earned reef entry, prepared historical coast victory, UI-completed historical tribe/machines and stable sandbox. Two explicit legacy passage inputs prepare meals/exploration/journal/generations and gate position; the second adds lungs/legs before import. A death branch is prepared OFFLINE from a UI export with its original checkpoint. All browser play, transitions, movement, journal, recovery, save/load and export/import use ordinary UI/native RAF. No live writes, localStorage edits, advanceTime, or time acceleration.';
const passage=createGame(481516);
for(const stage of [0,1]) {
  passage.campaign.stageMeals=CHAPTERS[stage].meals;passage.player.meals+=CHAPTERS[stage].meals;
  passage.campaign.stageReproductions=2;passage.player.generation+=2;
  passage.world.patches.forEach(p=>p.discovered=true);
  passage.campaign.journals.push(...passage.world.patches.map(p=>`field:${stage}:${p.id}:forage`));
  passage.player.pos={...passage.world.landmarks.find(l=>l.kind==='gate').pos};
  if(stage===1)for(const kind of ['lungs','legs'])passage.player.genome.parts.push({id:kind,kind,axial:0,angle:1,scale:1,mirrored:false});
  makeCheckpoint(passage);await writeFile(path.join(out,`passage-${stage}.fixture.json`),serializeGame(passage));
  assert.ok(tryTransition(passage));
}
await ssr.close();
await writeFile(path.join(out,'PREPARED.md'),prepared+'\n');
const browser=await chromium.launch({headless:true,channel:process.env.LUMAVORA_BROWSER_CHANNEL??'chrome'});
const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});context.setDefaultTimeout(30000);
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],results=[],started=Date.now();
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function action(name){const b=page.locator(`[data-action="${name}"]:visible`).first();await b.scrollIntoViewIfNeeded();await b.press('Enter');}
async function importGame(file,mode='game') {
  await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(mode=>JSON.parse(window.render_game_to_text()).mode===mode,mode);
  assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();
}
async function exportGame(name) {
  if((await read()).mode==='game')await page.keyboard.press('Escape');
  if(!await page.locator('#import-save').count())await action('saves');
  const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);
  const file=path.join(out,`${name}.save.json`);await download.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};
}
async function checkHeading(kind) {
  const s=await read(),p=s.homePlanet,loc=p.locations.find(l=>l.id===p.currentLocationId);assert.equal(loc.kind,kind);
  const b=page.locator('.planet-location');assert.match(await b.innerText(),/Planeta Lumavora/);
  const box=await b.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=page.viewportSize().width);
  const status=await page.locator('.tribe-status').count()?await page.locator('.tribe-status').boundingBox():null;
  if(status&&box.x<status.x+status.width&&box.x+box.width>status.x)assert.ok(box.y+box.height+2<=status.y,`Location heading must clear the era status panel: ${JSON.stringify({box,status})}`);
  return s;
}
const capture=name=>page.screenshot({path:path.join(out,`${name}.png`)});
try {
  await page.goto(base);await action('new');let s=await checkHeading('microhabitat');const born=structuredClone(s.homePlanet);
  assert.equal(s.stage,0);assert.equal(s.lineageHistory.stages.length,1);assert.equal(born.locations.some(l=>l.kind==='coast'),true);
  await page.keyboard.down('d');await page.waitForTimeout(350);await page.keyboard.up('d');
  assert.ok((await read()).player.pos.x>s.player.pos.x);await capture('fresh');
  // J is the existing journal shortcut; Tab intentionally remains the body editor.
  await page.keyboard.press('j');assert.equal((await read()).mode,'journal');
  assert.match(await page.locator('.home-planet').innerText(),/Uložená lokalita není doklad návštěvy/);await capture('journal');
  await action('close');await action('save');const fresh=await exportGame('fresh-active-campaign');
  assert.deepEqual(fresh.state.homePlanet,born);s=await importGame(fresh.file);assert.deepEqual(s.homePlanet,born);
  const imported=await exportGame('fresh-imported');assert.notEqual(imported.state.id,fresh.state.id);assert.deepEqual(imported.state.homePlanet,born);
  await page.reload();await action('saves');await action(`load:${imported.state.id}`);assert.deepEqual((await read()).homePlanet,born);
  results.push({name:'Fresh lineage, movement, keyboard detail, export/import rekey, local reload/load',passed:true});

  for(const stage of [0,1]) {
    s=await importGame(path.join(out,`passage-${stage}.fixture.json`));const before=structuredClone(s.homePlanet);
    await page.keyboard.press('g');await page.waitForFunction(stage=>JSON.parse(window.render_game_to_text()).stage===stage,stage+1);
    s=await checkHeading(stage===0?'reef':'coast');assert.equal(s.homePlanet.id,before.id);assert.notEqual(s.homePlanet.currentLocationId,before.currentLocationId);
    await page.locator('#toast:visible').waitFor();
    await page.waitForFunction(()=>{const toast=document.querySelector('#toast');return toast&&!toast.hidden&&toast.textContent?.includes('Lumavora');});
    if(stage===1)await capture('coastal-arrival');
    for(const location of before.locations)assert.ok(s.homePlanet.locations.some(l=>l.id===location.id));
    const result=await exportGame(`passage-${stage}-result`);assert.equal(JSON.parse(result.state.checkpoint).homePlanet.currentLocationId,s.homePlanet.currentLocationId);
    results.push({name:`Prepared passage ${stage} -> ${stage+1} through native G; stable planet and prior locations`,passed:true});
  }
  s=await importGame(path.resolve('tests/fixtures/saves/earned-reef-entry-v14.json'));
  await checkHeading('reef');await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');await capture('historical-reef');
  results.push({name:'Actual historical reef import and native movement',passed:true});

  s=await importGame(path.resolve('tests/fixtures/saves/won-current-coast.fixture.json'),'won');const coast=structuredClone(s.homePlanet);
  await action('continue-era');s=await checkHeading('coast');assert.equal(s.stage,3);assert.deepEqual(s.homePlanet,coast);assert.equal(s.tribe.neighbours.length,5);await capture('tribe');
  results.push({name:'Historical coast victory -> five-neighbour tribe retains coastal identity',passed:true});

  s=await importGame(path.resolve('tests/fixtures/saves/alliance-completed.save.json'));const tribe=structuredClone(s.homePlanet);
  await action('tribe-next');s=await checkHeading('coast');assert.equal(s.stage,4);assert.deepEqual(s.homePlanet,tribe);assert.equal(s.tribeInheritance.income,1.2);
  await capture('machines');const machine=await exportGame('machines-active-campaign');
  s=await importGame(machine.file);assert.deepEqual(s.homePlanet,tribe);assert.equal(s.tribeInheritance.income,1.2);
  results.push({name:'Historical three-neighbour tribe -> machines, inherited B1 and reimport',passed:true});

  // Prepared death changes no checkpoint. Recovery itself is a normal UI action.
  const death=structuredClone(machine.state);death.player.health=0;death.deathReason='Připravená větev pro ověření obnovy.';
  const deathFile=path.join(out,'death.fixture.json');await writeFile(deathFile,serializeGame(death));
  await importGame(deathFile,'death');await action('recover');s=await checkHeading('coast');assert.deepEqual(s.homePlanet,tribe);assert.equal(s.deathReason,null);assert.equal(s.tribeInheritance.income,1.2);
  results.push({name:'Prepared dead branch -> native checkpoint recovery, identity and B1 preserved',passed:true});

  s=await importGame(path.resolve('tests/fixtures/saves/machines-restoration-completed.save.json'));const machines=structuredClone(s.homePlanet);
  await action('machine-next');s=await checkHeading('coast');assert.equal(s.stage,5);assert.deepEqual(s.homePlanet,machines);assert.equal(s.planet.version,2);assert.equal(s.planet.tScore,0);
  await action('planet-map');await capture('terraform');
  results.push({name:'Historical machines -> local terraform, separate planet v2 and homePlanet v1',passed:true});

  s=await importGame(path.resolve('tests/fixtures/saves/stable-sandbox.save.json'));await checkHeading('coast');assert.equal(s.planet.completed,true);assert.equal(s.planet.sandbox,true);
  const stable=structuredClone(s.homePlanet);await page.setViewportSize({width:1024,height:720});await checkHeading('coast');await capture('sandbox-1024');
  const active=await exportGame('active-campaign');assert.deepEqual(active.state.homePlanet,stable);assert.equal(active.state.planet.completed,true);
  results.push({name:'Historical stable T3 sandbox retained, 1024px HUD and final active export',passed:true});
  assert.deepEqual(errors,[]);
} catch(error) { await capture('failure').catch(()=>{});results.push({failure:String(error)});throw error; }
finally {
  const final=await read().catch(()=>null);
  await writeFile(path.join(out,'results.json'),JSON.stringify({prepared,build:(await readFile('dist/index.html','utf8')).match(/assets\/[^\"]+\.js/g),elapsedSeconds:(Date.now()-started)/1000,results,errors,final:final&&{stage:final.stage,homePlanet:final.homePlanet,planet:final.planet&&{version:final.planet.version,completed:final.planet.completed,sandbox:final.planet.sandbox}}},null,2));
  if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});
  await browser.close();
}
