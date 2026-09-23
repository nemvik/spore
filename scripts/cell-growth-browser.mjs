/** SP-006: fresh UI lineage, native keyboard/clicks and real RAF only. */
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5191',out=path.resolve(process.env.CELL_OUTPUT??'evidence/sp-006/browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.LUMAVORA_BROWSER_CHANNEL?{channel:process.env.LUMAVORA_BROWSER_CHANNEL}:{}),args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],results=[],milestones=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=async name=>page.locator(`[data-action="${name}"]`).first().click();
const release=async()=>{for(const k of ['w','a','s','d','Shift','Space'])await page.keyboard.up(k);};
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
  const tier=s.cellGrowth.nutrition>=8?2:s.cellGrowth.nutrition>=3?1:0;
  const food=s.world.resources.filter(r=>['algae','detritus'].includes(r.kind)&&r.amount>=1&&(r.max<7||tier>=2)).sort((a,b)=>Math.hypot(a.pos.x-s.player.pos.x,a.pos.z-s.player.pos.z)-Math.hypot(b.pos.x-s.player.pos.x,b.pos.z-s.player.pos.z))[0];assert.ok(food);
  await walkTo(food.pos,1.8);await page.keyboard.down('Space');await page.waitForTimeout(300);
 }
 throw new Error('Food did not advance growth');
}
async function discover(index){const site=(await read()).cellGrowth.sites[index];await walkTo(site.pos,3.5);await page.waitForTimeout(500);await page.keyboard.press('t');await page.waitForTimeout(250);assert.ok((await read()).cellGrowth.parts.some(p=>p.part===site.part));}
async function rebuild(part){await walkTo({x:0,z:0},4);await page.keyboard.press('Tab');assert.equal((await read()).mode,'editor');await action('category:all');await action('add:'+part);await capture('editor-'+part);assert.ok((await read()).editor.draft.parts.some(p=>p.kind===part));await action('confirm-editor');assert.equal((await read()).mode,'game');}
async function exportSave(name){await release();await page.keyboard.press('Escape');await action('saves');const download=page.waitForEvent('download');await action('export');const file=path.join(out,name+'.save.json');await(await download).saveAs(file);return file;}
const report={provenance:'New lineage from normal UI, no fixture, no live state writes and no advanceTime. All play uses real keyboard/clicks and RAF.',results,milestones,errors};
try{
 await page.goto(base);if(process.env.LUMAVORA_PRODUCTION==='1')assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 await action('new');const initial=await read();assert.equal(initial.cellGrowth.nutrition,0);await capture('birth');
 await page.keyboard.press('Tab');await action('category:defense');assert.equal(await page.locator('[data-action="add:spines"]').isDisabled(),true);await action('cancel-editor');
 await eatUntil(3);await capture('growth-1');await discover(0);await capture('discovery');await rebuild('spines');assert.equal((await read()).cellGrowth.parts[0].usedGeneration,2);results.push({name:'First earned growth, discovery and paid rebuild',passed:true});
 await eatUntil(8);await capture('growth-2');await discover(1);await rebuild('antenna');
 await eatUntil(15);await capture('growth-3');await discover(2);await rebuild('toxin');
 let s=await read();assert.equal(s.cellGrowth.parts.length,3);assert.equal(s.player.generation,4);assert.equal(s.camera.bodyScale,1.7);results.push({name:'Three visible growths and all three discovered organs actually installed',passed:true});
 await page.keyboard.press('x');await page.waitForTimeout(160);s=await read();assert.ok(s.player.abilityRecharge>6);assert.equal(s.cellGrowth.contact.kind,'toxin');await capture('toxin');results.push({name:'Native defensive pulse uses independent recharge',passed:true});
 // Trade the filter for a jaw with the earned construction budget.
 await page.keyboard.press('Tab');await action('category:all');s=await read();const filter=s.editor.draft.parts.find(p=>p.kind==='filter');await action('select:'+filter.id);await action('remove');await action('add:jaw');await action('confirm-editor');
 s=await read();assert.equal(s.mode,'game');assert.ok(s.player.genome.parts.some(p=>p.kind==='jaw'));
 // Follow the southern former predator outside the enclosed mineral chamber. Space only bites when the actual jaw reaches it.
 const hunter=s.world.creatures.find(c=>c.species==='needle'&&c.patch===2);assert.ok(hunter);let sawFlee=false;
 for(let i=0;i<240;i++){
  s=await read();assert.equal(s.mode,'game');const c=s.world.creatures.find(c=>c.id===hunter.id);if(!c)break;if(c.intent==='flee')sawFlee=true;
  const next=waypoint(s,c.pos),dx=next.x-s.player.pos.x,dz=next.z-s.player.pos.z;
  if(i%40===0)console.log('hunt',i,{player:s.player.pos,prey:c.pos,intent:c.intent,health:c.health});
  await release();await page.keyboard.down('Space');if(Math.abs(dx)>Math.abs(dz)*.25)await page.keyboard.down(dx>0?'d':'a');if(Math.abs(dz)>Math.abs(dx)*.25)await page.keyboard.down(dz>0?'s':'w');await page.waitForTimeout(220);
 }
 await release();s=await read();assert.ok(sawFlee);assert.ok(!s.world.creatures.some(c=>c.id===hunter.id),'Grown cell must actually kill its former predator');assert.ok(s.player.kills>0);await capture('former-predator');results.push({name:'Former predator flees and is killed by the grown cell through native movement and bites',passed:true});
 const meat=s.world.resources.filter(r=>r.kind==='meat').sort((a,b)=>b.id-a.id)[0];assert.ok(meat);
 const meals=s.player.meals;let eaten=false;
 // Held Space eats nearby detritus first when it is closer to the mouth; keep the real selection rules.
 for(let i=0;i<120;i++){await page.keyboard.down('Space');await page.waitForTimeout(250);s=await read();if((s.world.resources.find(r=>r.id===meat.id)?.amount??0)<meat.amount){eaten=true;break;}}
 await release();assert.ok(eaten,'The real carcass must lose a portion');assert.ok(s.player.meals>meals);results.push({name:'Former predator is eaten as actual meat',passed:true});
 const saved=await exportSave('active-lineage');await page.locator('#import-save').setInputFiles(saved);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');const loaded=await read();assert.deepEqual(loaded.cellGrowth.parts,s.cellGrowth.parts);assert.equal(loaded.cellGrowth.nutrition,15);assert.deepEqual(loaded.player.genome,s.player.genome);await capture('restored');
 await page.keyboard.press('Escape');await action('library');assert.equal((await read()).mode,'library');await page.screenshot({path:path.join(out,'library.png')});results.push({name:'UI export/import and SP-005 library remain available',passed:true});assert.deepEqual(errors,[]);
}catch(error){report.failure=String(error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}finally{
 await writeFile(path.join(out,'results.json'),JSON.stringify({...report,final:await read().catch(()=>null)},null,2));await browser.close();
}
