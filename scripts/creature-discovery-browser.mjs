/** Prepared land scenarios, real browser controls and RAF. No live setters or clock hooks. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5187';
const out=path.resolve(process.env.CREATURE_STAGE_OUTPUT??'evidence/sp-004/browser');
await mkdir(out,{recursive:true});
const kind=process.argv.find(a=>a.startsWith('--body='))?.slice(7)??'biped',scenario=process.argv.includes('--alpha')?'alpha':'expedition';
assert.ok(['biped','quadruped','classic'].includes(kind));
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
try{
 const {creatureStageFixture,creatureDiscoveryClassicFixture}=await ssr.ssrLoadModule('/tests/fixtures/creature-stage.ts');
 const {serializeGame,parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
 {const s=kind==='classic'?creatureDiscoveryClassicFixture():creatureStageFixture(kind,481516,true);const text=serializeGame(s);parseGame(text);await writeFile(path.join(out,`${kind}.fixture.json`),text);}
}finally{await ssr.close();}
if(process.argv.includes('--fixtures-only'))process.exit(0);
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>{await page.locator(`[data-action="${name}"]`).first().click();};
const results=[];
const report={scenario,kind,provenance:'Prepared land, DNA and constructed bodies; all subsequent play uses native keys/clicks and normal RAF. No live state writes or advanceTime. Not an earned full campaign.',results,errors};
async function importFixture(kind){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(path.join(out,`${kind}.fixture.json`));await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
async function release(){for(const key of ['w','a','s','d','Shift'])await page.keyboard.up(key);}
async function walkTo(destination,stop=4){
 let previous=Infinity,stuck=0;
 for(let i=0;i<130;i++){
  const s=await read();assert.equal(s.mode,'game',JSON.stringify({mode:s.mode,health:s.player.health,messages:s.messages}));
  if(s.creatureStage.discovery?.migration){const m=s.creatureStage.discovery.migration.pos;if(Math.hypot(s.player.pos.x-m.x,s.player.pos.z-m.z)>9){await release();await page.waitForTimeout(700);continue;}}
  const pos=typeof destination==='function'?destination(s):destination,dx=pos.x-s.player.pos.x,dz=pos.z-s.player.pos.z,gap=Math.hypot(dx,dz);
  if(gap<stop){await release();return;}
  if(Math.abs(gap-previous)<.09)stuck++;else stuck=Math.max(0,stuck-1);previous=gap;
  let x=dx,z=dz;
  // A small deterministic side-step is a normal navigation decision around trunks.
  if(stuck>4){x=-dz;z=dx;}
  const keys=[];if(Math.abs(x)>Math.max(.6,Math.abs(z)*.25))keys.push(x>0?'d':'a');if(Math.abs(z)>Math.max(.6,Math.abs(x)*.25))keys.push(z>0?'s':'w');
  await release();for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(240);
 }
 await release();assert.fail('Could not approach destination through native movement');
}
async function befriend(index){
 console.log('Social visit',index);
 let s=await read();const nest=s.creatureStage.nests[index];
 await walkTo(v=>v.world.creatures.find(c=>c.id===v.creatureStage.nests[index].residents[0]).pos,4);
 await action(`species-focus:${nest.species}`);await page.keyboard.press('v');
 await page.waitForFunction(()=>!!JSON.parse(window.render_game_to_text()).creatureStage.encounter);
 let turns=0;
 while((s=await read()).creatureStage.encounter&&turns++<12){
  const e=s.creatureStage.encounter;
  await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.creatureStage.recharge===0&&s.player.cooldown===0;});
  await page.keyboard.press(String(['sing','dance','charm','pose'].indexOf(e.requested)+1));
  await page.waitForTimeout(160);
  if(turns===1)await page.screenshot({path:path.join(out,`response-${index}.png`)});
 }
 s=await read();assert.equal(s.creatureStage.nests[index].outcome,'friend');console.log('Friendship complete',index);
 return s;
}
async function exportSave(name){await release();await page.keyboard.press('Escape');await action('saves');const download=page.waitForEvent('download');await action('export');const file=path.join(out,`${name}.save.json`);await(await download).saveAs(file);return file;}
try{
 await importFixture(kind);
 if(process.env.LUMAVORA_PRODUCTION==='1')assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 if(scenario==='alpha'){
  // The observed eastern grove forms a wall; go around its northern edge.
  await walkTo({x:8,z:-33},3);await walkTo({x:40,z:-33},3);
  const s=await befriend(3);assert.equal(s.creatureStage.discovery.alpha.resolved,true);assert.equal(s.creatureStage.discovery.parts.find(p=>p.part==='toxin').source,'alpha');await page.screenshot({path:path.join(out,'alpha.png')});const save=await exportSave('alpha');await page.locator('#import-save').setInputFiles(save);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');results.push({name:'native alpha friendship, part reward and save/load',passed:true});
 }else{
 await page.keyboard.press('Tab');if(kind==='classic')await action('creature-open');await action('creature-panel:parts');assert.equal(await page.locator('[data-action="add:arms"]').isDisabled(),true);await action('cancel-editor');
 let s=await befriend(0);await page.keyboard.press('r');await page.waitForTimeout(250);assert.equal((await read()).creatureStage.pack.length,1);
 const site=(await read()).creatureStage.discovery.remains[0];await walkTo(site.pos,3.5);await page.screenshot({path:path.join(out,'remains.png')});await action('species-remains:west');
 s=await read();assert.ok(s.creatureStage.discovery.parts.some(p=>p.part==='arms'&&p.source==='remains'));results.push({name:'native exploration unlocks arms',passed:true});
 await befriend(1);s=await read();assert.ok(s.creatureStage.discovery.socialAssists>0);results.push({name:'pack social assistance',passed:true});await page.screenshot({path:path.join(out,'pack.png')});
 await walkTo({x:0,z:0},6);const before=(await read()).player.generation;await page.keyboard.press('Tab');await action('creature-panel:parts');assert.equal(await page.locator('[data-action="add:arms"]').isDisabled(),false);await action('add:arms');await page.screenshot({path:path.join(out,'editor-reward.png')});
 assert.ok((await read()).editor.draft.parts.some(p=>p.kind==='arms'));await action('confirm-editor');s=await read();assert.equal(s.player.generation,before+1);assert.equal(s.creatureStage.discovery.parts.find(p=>p.part==='arms').usedGeneration,before+1);results.push({name:'reward installed in a new generation',passed:true});
 const generationSave=await exportSave('generation');await page.locator('#import-save').setInputFiles(generationSave);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 await action('species-migrate:west');await walkTo({x:-8,z:-3},2.5);assert.ok((await read()).creatureStage.discovery.migration);const migrationSave=await exportSave('migration');await page.locator('#import-save').setInputFiles(migrationSave);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 await walkTo(site.pos,4);await page.waitForTimeout(1800);await page.screenshot({path:path.join(out,'caravan.png')});await action('species-settle');s=await read();assert.equal(s.creatureStage.discovery.migration,null);assert.equal(s.creatureStage.discovery.migrations.length,1);assert.deepEqual(s.world.landmarks.find(l=>l.kind==='nest').pos,site.pos);results.push({name:'native escort and nest migration with midway save/load',passed:true});
 await page.keyboard.press('Tab');assert.equal((await read()).mode,'editor');await action('cancel-editor');
 const finalSave=await exportSave('settled');await page.locator('#import-save').setInputFiles(finalSave);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await page.screenshot({path:path.join(out,'new-home.png')});
 await page.setViewportSize({width:1280,height:720});for(const button of await page.locator('.species-actions button').all()){const b=await button.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=1280&&b.y+b.height<=720);}await page.screenshot({path:path.join(out,'compact.png')});results.push({name:'compact controls and final save/load',passed:true});
 }assert.deepEqual(errors,[]);
}catch(error){report.failure=String(error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}finally{
 await writeFile(path.join(out,'results.json'),JSON.stringify({...report,final:await read().catch(()=>null)},null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'diagnostic.trace.zip')});await browser.close();
}
