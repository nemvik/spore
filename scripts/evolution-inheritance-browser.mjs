/** SP-006: fresh UI lineage, native keyboard/clicks and real RAF only. */
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const branch=process.argv.includes('--antenna')?'antenna':'spines';
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5220',out=path.resolve(process.env.CELL_OUTPUT??`evidence/evolution-20260930/${branch}`);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],results=[],milestones=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>page.locator(`[data-action="${name}"]`).first().click();
const release=async()=>{for(const k of ['w','a','s','d','q','c','Shift','Space'])await page.keyboard.up(k);};
const capture=async name=>{await page.waitForTimeout(250);await page.screenshot({path:path.join(out,name+'.png')});const s=await read();milestones.push({name,tick:s.tick,nutrition:s.cellGrowth.nutrition,scale:s.cellScale,zoom:s.camera.effectiveZoom,generation:s.player.generation,health:s.player.health,pos:s.player.pos});};
// Read-only route planning around visible stones. It emits ordinary WASD presses.
function waypoint(s,target){
 const from=s.player.pos,margin=1.6;
 const clear=(a,b)=>s.world.obstacles.every(o=>{const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((o.pos.x-a.x)*dx+(o.pos.z-a.z)*dz)/d)):0;return Math.hypot(a.x+dx*t-o.pos.x,a.z+dz*t-o.pos.z)>o.radius+margin||Math.hypot(a.x-o.pos.x,a.z-o.pos.z)<o.radius+margin&&Math.hypot(b.x-o.pos.x,b.z-o.pos.z)>Math.hypot(a.x-o.pos.x,a.z-o.pos.z);});
 if(clear(from,target))return target;
 const key=p=>`${p.x},${p.z}`,start={x:Math.round(from.x/2)*2,z:Math.round(from.z/2)*2};
 const open=[{p:start,g:0,f:0}],seen=new Map([[key(start),0]]),parents=new Map();let end=null;
 for(let count=0;open.length&&count<6500;count++){
  open.sort((a,b)=>b.f-a.f);const node=open.pop();if(node.g>seen.get(key(node.p)))continue;
  if(Math.hypot(node.p.x-target.x,node.p.z-target.z)<4){end=node.p;break;}
  for(const dx of [-2,0,2])for(const dz of [-2,0,2]){if(!dx&&!dz)continue;const p={x:node.p.x+dx,z:node.p.z+dz};if(Math.abs(p.x)>76||Math.abs(p.z)>76||!clear(key(node.p)===key(start)?from:node.p,p))continue;const g=node.g+Math.hypot(dx,dz),k=key(p);if(g>=(seen.get(k)??Infinity))continue;seen.set(k,g);parents.set(k,node.p);open.push({p,g,f:g+Math.hypot(p.x-target.x,p.z-target.z)});}
 }
 if(!end)throw new Error(`No clear native route from ${key(from)} to ${key(target)}`);
 const route=[end];while(parents.has(key(route[0])))route.unshift(parents.get(key(route[0])));
 return route.slice(1).find(p=>Math.hypot(p.x-from.x,p.z-from.z)>1)??target;
}
async function walkTo(destination,stop=3){
 let previous=Infinity,stuck=0;
 for(let i=0;i<180;i++){
  const s=await read();assert.equal(s.mode,'game');const target=typeof destination==='function'?destination(s):destination;
  const dx=target.x-s.player.pos.x,dz=target.z-s.player.pos.z,gap=Math.hypot(dx,dz);if(gap<stop){await release();return;}
  if(Math.abs(gap-previous)<.08)stuck++;else stuck=Math.max(0,stuck-1);previous=gap;
  const next=waypoint(s,target);let x=next.x-s.player.pos.x,z=next.z-s.player.pos.z;if(stuck>12){x=-dz;z=dx;}
  await release();if(Math.abs(x)>Math.max(.4,Math.abs(z)*.25))await page.keyboard.down(x>0?'d':'a');if(Math.abs(z)>Math.max(.4,Math.abs(x)*.25))await page.keyboard.down(z>0?'s':'w');await page.waitForTimeout(220);
 }
 throw new Error('Native navigation could not reach destination');
}
async function eatUntil(nutrition){
 for(let attempt=0;attempt<100;attempt++){
  let s=await read();assert.equal(s.mode,'game');if(s.cellGrowth.nutrition>=nutrition){await release();return;}
  if(s.feedTarget?.kind==='food'&&(s.feedTarget.ready||s.feedTarget.reason==='cooldown')){await release();await page.keyboard.down('Space');await page.waitForTimeout(280);continue;}
  const tier=s.cellGrowth.nutrition>=4?2:s.cellGrowth.nutrition>=2?1:0;
  const food=s.world.resources.filter(r=>['algae','detritus'].includes(r.kind)&&r.amount>=1&&(r.max<7||tier>=2)).sort((a,b)=>Math.hypot(a.pos.x-s.player.pos.x,a.pos.z-s.player.pos.z)-Math.hypot(b.pos.x-s.player.pos.x,b.pos.z-s.player.pos.z))[0];assert.ok(food);
  await walkTo(food.pos,1.8);await page.keyboard.down('Space');await page.waitForTimeout(300);
 }
 throw new Error('Food did not advance growth');
}
async function discover(index){const site=(await read()).cellGrowth.sites[index];await walkTo(site.pos,3.5);await page.waitForTimeout(500);await page.keyboard.press('t');await page.waitForTimeout(250);assert.ok((await read()).cellGrowth.parts.some(p=>p.part===site.part));}
async function rebuild(part){await walkTo({x:0,z:0},4);await page.keyboard.press('Tab');assert.equal((await read()).mode,'editor');await action('category:all');await action('add:'+part);await action('cell-adaptation:'+part);await action('remove');assert.equal(await page.locator('[data-action^="cell-adaptation:"][aria-pressed="true"]').count(),0);await action('undo');await action('cell-adaptation:'+part);await page.screenshot({path:path.join(out,'editor-choice.png')});assert.ok((await read()).editor.draft.parts.some(p=>p.kind===part));await action('confirm-editor');assert.equal((await read()).mode,'game');}
async function exportSave(name){await release();await page.keyboard.press('Escape');await action('saves');const download=page.waitForEvent('download');await action('export');const file=path.join(out,name+'.save.json');await(await download).saveAs(file);return file;}

const report={branch,provenance:'New lineage via public UI; native RAF, keyboard and clicks only. No fixtures, state writes or advanceTime. Bot timing is not human acceptance.',results,milestones,errors};
try {
 await page.goto(base);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await page.locator('#seed').fill('8675309');await action('new');
 await eatUntil(branch==='spines'?2:4);await discover(branch==='spines'?0:1);await rebuild(branch);
 assert.equal((await read()).lineageHistory.cellAdaptation.part,branch);
 await eatUntil(7);let s=await read();assert.ok(s.requirements.every(r=>r.met));assert.ok(s.journeyGuide.title.includes('otevřený'));
 await walkTo(s.world.landmarks.find(l=>l.kind==='gate').pos,6);
 const ready=await exportSave('cell-ready');await action('close');
 await page.keyboard.press('g');await page.waitForTimeout(200);s=await read();assert.equal(s.stage,1);
 results.push({name:'Fresh growth, discovery, explicit choice, paid body, and reef transition',tick:s.tick,seconds:s.tick/60});
 // Remove the organ through the ordinary reef editor: history is separate from the body.
 await walkTo({x:0,z:0},4);await page.keyboard.press('Tab');s=await read();
 const part=s.editor.draft.parts.find(p=>p.kind===branch);await action('select:'+part.id);await action('remove');await action('confirm-editor');
 s=await read();assert.ok(!s.player.genome.parts.some(p=>p.kind===branch));
 const checkpoint=await exportSave('reef-before-effect');await action('close');
 if(branch==='spines'){
   let predator=s.world.creatures.filter(c=>c.species==='ribbon').sort((a,b)=>Math.hypot(a.pos.x,b.pos.z)-Math.hypot(b.pos.x,b.pos.z))[0];assert.ok(predator);
   for(let i=0;i<150;i++){
     s=await read();assert.equal(s.mode,'game');predator=s.world.creatures.find(c=>c.id===predator.id);assert.ok(predator);
     const dx=predator.pos.x-s.player.pos.x,dz=predator.pos.z-s.player.pos.z,dy=predator.pos.y-s.player.pos.y;
     if(Math.hypot(dx,dz,dy)<7)break;
     const next=waypoint(s,predator.pos);await release();
     if(Math.abs(next.x-s.player.pos.x)>.7)await page.keyboard.down(next.x>s.player.pos.x?'d':'a');
     if(Math.abs(next.z-s.player.pos.z)>.7)await page.keyboard.down(next.z>s.player.pos.z?'s':'w');
     if(Math.abs(dy)>1)await page.keyboard.down(dy>0?'q':'c');await page.waitForTimeout(150);
   }
   await release();s=await read();predator=s.world.creatures.find(c=>c.id===predator.id);assert.ok(Math.hypot(predator.pos.x-s.player.pos.x,predator.pos.y-s.player.pos.y,predator.pos.z-s.player.pos.z)<8);
   assert.equal(await page.locator('[data-action="pulse"]').evaluate(e=>e.classList.contains('unavailable')),false);
   await page.keyboard.press('x');await page.waitForTimeout(150);s=await read();assert.ok(s.world.creatures.find(c=>c.id===predator.id).fear>4);assert.equal(s.world.creatures.find(c=>c.id===predator.id).health,predator.health);
 }else{
   assert.equal(await page.locator('[data-action="pulse"]').evaluate(e=>e.classList.contains('unavailable')),false);
   await page.keyboard.press('x');await page.waitForTimeout(150);s=await read();assert.ok(s.player.scan>4);
 }
 assert.deepEqual(s.lineageHistory.usedEffects,['cell']);
 await page.screenshot({path:path.join(out,'reef-effect.png')});results.push({name:'Real inherited effect after removal of organ',energy:s.player.energy,recharge:s.player.abilityRecharge,scan:s.player.scan});
 const saved=await exportSave('reef-used-effect');await page.locator('#import-save').setInputFiles(saved);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 assert.deepEqual((await read()).lineageHistory.cellAdaptation,s.lineageHistory.cellAdaptation);assert.deepEqual((await read()).lineageHistory.usedEffects,['cell']);
 await page.keyboard.press('j');await page.screenshot({path:path.join(out,'inheritance.png')});assert.ok(await page.locator('[aria-label="Dědictví druhu"]').isVisible());
 results.push({name:'Export, public import and visible inheritance tree',checkpoint,ready});assert.deepEqual(errors,[]);
}catch(error){report.failure=String(error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();}
