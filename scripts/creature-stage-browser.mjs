/** Prepared land scenarios, real browser controls and RAF. No live setters or clock hooks. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5187';
const out=path.resolve(process.env.CREATURE_STAGE_OUTPUT??'evidence/sp-003/browser');
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
try{
 const {creatureStageFixture}=await ssr.ssrLoadModule('/tests/fixtures/creature-stage.ts');
 const {serializeGame,parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
 for(const kind of ['biped','quadruped']){const s=creatureStageFixture(kind);const text=serializeGame(s);parseGame(text);await writeFile(path.join(out,`${kind}.fixture.json`),text);}
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
const route=process.argv.find(a=>a.startsWith('--route='))?.slice(8)??'social',kind=process.argv.find(a=>a.startsWith('--body='))?.slice(7)??'biped';
assert.ok(['social','predator','mixed'].includes(route));assert.ok(['biped','quadruped'].includes(kind));
const report={route,kind,provenance:'Prepared land, DNA and constructed bodies; all subsequent play uses native keys/clicks and normal RAF. No live state writes or advanceTime. Not an earned full campaign.',results,errors};
async function importFixture(kind){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(path.join(out,`${kind}.fixture.json`));await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');}
async function release(){for(const key of ['w','a','s','d','Shift'])await page.keyboard.up(key);}
async function walkTo(destination,stop=4){
 let previous=Infinity,stuck=0;
 for(let i=0;i<130;i++){
  const s=await read();assert.equal(s.mode,'game',JSON.stringify({mode:s.mode,health:s.player.health,messages:s.messages}));
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
  if(index===0&&turns===1)await page.screenshot({path:path.join(out,'social-response.png')});
 }
 s=await read();assert.equal(s.creatureStage.nests[index].outcome,'friend');console.log('Friendship complete',index);
 return s;
}
async function eatNearby(){
 let s=await read();
 const foods=s.world.resources.filter(r=>r.amount>=1&&s.stats.diet.includes(r.kind)).sort((a,b)=>Math.hypot(a.pos.x-s.player.pos.x,a.pos.z-s.player.pos.z)-Math.hypot(b.pos.x-s.player.pos.x,b.pos.z-s.player.pos.z));
 if(!foods[0])return;
 await walkTo(foods[0].pos,2.5);
 for(const [x,y] of [[700,110],[600,110],[760,100]]){await page.mouse.click(x,y);if(!(await read()).feedSelection)break;}
 const before=(await read()).player.meals;
 await page.keyboard.down('Space');await page.waitForTimeout(2400);await page.keyboard.up('Space');
 s=await read();console.log('Meal',before,s.player.meals,'energy',Math.round(s.player.energy));
}
async function restAtHome(){
 await walkTo({x:0,z:0},6);
 for(let i=0;i<40;i++){
  const s=await read();assert.equal(s.mode,'game');if(s.player.health>=s.stats.maxHealth*.92)break;
  if(s.player.energy<20){await eatNearby();await walkTo({x:0,z:0},6);}else await page.waitForTimeout(1000);
 }
}
async function combatCooldown(index){
 for(let i=0;i<35;i++){
  const s=await read();assert.equal(s.mode,'game');if(s.creatureStage.recharge===0&&s.player.cooldown===0)break;
  const nest=s.creatureStage.nests[index],c=s.world.creatures.filter(c=>nest.residents.includes(c.id)).sort((a,b)=>Math.hypot(a.pos.x-s.player.pos.x,a.pos.z-s.player.pos.z)-Math.hypot(b.pos.x-s.player.pos.x,b.pos.z-s.player.pos.z))[0];
  if(c){const dx=c.pos.x-s.player.pos.x,dz=c.pos.z-s.player.pos.z;const x=-dz-dx*.45,z=dx-dz*.45;await release();if(Math.abs(x)>Math.abs(z)*.35)await page.keyboard.down(x>0?'d':'a');if(Math.abs(z)>Math.abs(x)*.35)await page.keyboard.down(z>0?'s':'w');}
  await page.waitForTimeout(160);
 }
 await release();
}
async function defeat(index){
 console.log('Combat visit',index);
 let s=await read();const nest=s.creatureStage.nests[index];
 if(s.player.energy<65)await eatNearby();if((await read()).player.health<s.stats.maxHealth*.8)await restAtHome();
 await walkTo(nest.pos,10);
 if(!(await read()).speciesCombat)await page.keyboard.press('b');
 let attempts=0;
 while((s=await read()).creatureStage.nests[index].outcome!=='predator'&&attempts++<25){
  console.log('Attack',index,attempts,'health',Math.round(s.player.health),'energy',Math.round(s.player.energy));
  const n=s.creatureStage.nests[index],id=n.residents[0],target=s.world.creatures.find(c=>c.id===id);
  assert.ok(target,'living defender');
  await combatCooldown(index);
  await walkTo(v=>v.world.creatures.find(c=>c.id===id)?.pos??n.pos,6);
  await action(`species-focus:${nest.species}`);
  await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.creatureStage.recharge===0&&s.player.cooldown===0;});
  s=await read();assert.ok(s.player.energy>=5,'enough energy for an attack');
  // Native ability keys; the first two visits exercise charge and arms as well.
  let key='4';
  if(attempts===1&&index===0)key='2';
  if(kind==='biped'&&index===1){await walkTo(v=>v.world.creatures.find(c=>c.id===id)?.pos??n.pos,2.8);key='3';}
  await page.keyboard.press(key);await page.waitForTimeout(key==='2'?1500:400);
  if(index===0&&attempts===2)await page.screenshot({path:path.join(out,'combat.png')});
 }
 s=await read();assert.equal(s.creatureStage.nests[index].outcome,'predator');console.log('Defeated nest',index);await eatNearby();return s;
}
async function exportSave(name){await release();await page.keyboard.press('Escape');await action('saves');const download=page.waitForEvent('download');await action('export');const file=path.join(out,`${name}.save.json`);await(await download).saveAs(file);return file;}
try{
 await importFixture(kind);
 report.runtime=await page.evaluate(()=>({advanceTime:typeof window.advanceTime,renderer:JSON.parse(window.render_game_to_text()).render,gpu:(()=>{const gl=document.querySelector('#world').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;})()}));
 if(process.env.LUMAVORA_PRODUCTION==='1')assert.equal(report.runtime.advanceTime,'undefined');
 if(process.argv.includes('--measure')){
  await page.waitForTimeout(2000);await page.waitForTimeout(10000);
  report.performance=await page.evaluate(()=>{const m=window.lumavora_metrics(),samples=m.samples.slice(-500).sort((a,b)=>a-b);return {...m,samples:undefined,count:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],over50:samples.filter(v=>v>50).length};});
 }

 await page.setViewportSize({width:1280,height:720});
 await page.keyboard.press('b');
 for(const button of await page.locator('.species-actions button').all()){
  const b=await button.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=1280&&b.y+b.height<=720,'compact abilities fit viewport');
 }
 await page.screenshot({path:path.join(out,'compact-controls.png')});
 await page.keyboard.press('b');await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:path.join(out,'land-start.png')});
 const nestButton=await page.locator('[data-action="species-focus:bell"]').elementHandle();
 await page.keyboard.down('d');await page.waitForTimeout(350);await page.keyboard.up('d');
 assert.ok(await nestButton.evaluate(node=>node===document.querySelector('[data-action="species-focus:bell"]')),'live counters preserve native button identity');
 results.push({name:'stable native HUD controls',passed:true});
 if(process.argv.includes('--smoke')){assert.equal((await read()).creatureStage.nests.length,4);results.push({name:'land UI smoke',passed:true});}
 else{
  let s;
  if(route!=='predator'){
   s=await befriend(0);await page.keyboard.press('r');await page.waitForTimeout(250);s=await read();assert.equal(s.creatureStage.pack.length,1);assert.ok(!(await page.locator('[data-action="bond"]').innerText()).includes('Do smečky'),'after recruitment the selected pack member does not promise another recruitment');const member=s.creatureStage.pack[0],before=s.world.creatures.find(c=>c.id===member).pos;
   await walkTo({x:s.player.pos.x+9,z:s.player.pos.z+2},2);await page.waitForTimeout(1200);s=await read();const after=s.world.creatures.find(c=>c.id===member).pos;assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>2);results.push({name:'friendship and real pack following',passed:true});
   const exported=await exportSave('friendship');await page.locator('#import-save').setInputFiles(exported);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');s=await read();assert.equal(s.creatureStage.nests[0].outcome,'friend');assert.equal(s.creatureStage.pack.length,1);results.push({name:'native export/import',passed:true});
  }else await defeat(0);
  if(route==='social'){await befriend(1);await befriend(2);}else{await defeat(1);await defeat(2);}
  await walkTo({x:0,z:0},7);await page.keyboard.press('g');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='won');s=await read();assert.equal(s.creatureStage.completed,route);await page.screenshot({path:path.join(out,`${route}-complete.png`)});results.push({name:`${route} completion`,passed:true});
  await action('continue-era');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).stage===3);results.push({name:'tribe continuation',passed:true});
  const finalSave=await exportSave('tribe');await page.locator('#import-save').setInputFiles(finalSave);
  await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.mode==='game'&&s.stage===3;});
  assert.equal((await read()).creatureStage.completed,route);results.push({name:'tribe export/import preserves history',passed:true});
 }
 assert.deepEqual(errors,[]);
}catch(error){report.failure=String(error);throw error;}finally{
 if(errors.length||!results.some(r=>r.name.endsWith(' completion'))&&!process.argv.includes('--smoke'))await page.screenshot({path:path.join(out,'last-observation.png')}).catch(()=>{});
 await writeFile(path.join(out,'results.json'),JSON.stringify({...report,final:await read().catch(()=>null)},null,2));
 if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'diagnostic.trace.zip')});
 await browser.close();
}
console.log(JSON.stringify(results));
