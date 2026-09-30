/** Continue the genuinely new lineage, with UI orders and native RAF only.
 * No gameplay imports, fixtures, setters, storage writes or synthetic clock.
 */
import assert from 'node:assert/strict';
import {appendFile,mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const phase=process.argv[2]??'status',root=path.resolve('evidence/final-campaign'),out=path.join(root,'tribe');await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));assert.ok(page);
page.setDefaultTimeout(10000);
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const compact=s=>({stage:s.stage,mode:s.mode,tick:s.tick,food:s.tribe?.food,elapsed:s.tribe?.elapsed,members:s.tribe?.members.map(u=>({id:u.id,pos:u.pos,health:u.health,hunger:u.hunger,tool:u.tool,cargo:u.cargo,orders:u.orders})),huts:s.tribe?.huts,neighbours:s.tribe?.neighbours.map(n=>({id:n.id,identity:n.identity,relation:n.relation,resolved:n.resolved,tribute:n.tribute,members:n.society?.members.length,food:n.society?.food,expedition:n.society?.expedition?.phase})),completed:s.tribe?.completed,deathReason:s.deathReason});
async function log(event,extra={}) {const entry={event,wall:new Date().toISOString(),...compact(await read()),...extra};await appendFile(path.join(out,'segments.jsonl'),JSON.stringify(entry)+'\n');console.log(JSON.stringify(entry));}
async function action(name) {const button=page.locator(`[data-action="${name}"]:visible`).first();await button.scrollIntoViewIfNeeded();await button.press('Enter');}
async function resume(){if((await read()).mode==='pause')await action('close');assert.equal((await read()).mode,'game');}
async function pause(){if((await read()).mode==='game')await action('pause');}
async function until(predicate,label,seconds=90){const end=Date.now()+seconds*1000;while(Date.now()<end){const s=await read();assert.equal(s.mode,'game',label);assert.equal(s.deathReason,null);if(predicate(s))return s;await page.waitForTimeout(180);}throw Error('Native timeout: '+label);}
async function exported(name) {
  await pause();const response=await fetch(`http://127.0.0.1:${process.env.FRESH_CONTROL_PORT??9225}`,{method:'POST',body:JSON.stringify({command:'export',args:{name}})});assert.ok(response.ok,await response.text());
  const source=path.join(root,'organism',name+'.save.json'),bytes=await readFile(source);
  await writeFile(path.join(out,name+'.save.json'),bytes);await writeFile(path.join(root,'organism/active-campaign.save.json'),bytes);await unlink(source);
  await log('public-export',{file:name+'.save.json',sha256:createHash('sha256').update(bytes).digest('hex')});
}
async function screen(kind,id) {
  const s=await read(),target=s.commandTargets.find(t=>t.target.kind===kind&&t.target.id===id)?.screen,size=page.viewportSize();
  if(!target)return null;const point={x:target.x*size.width/100,y:target.y*size.height/100};
  if(point.x<0||point.y<0||point.x>=size.width||point.y>=size.height)return null;
  return await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',point)?point:null;
}
async function gather(target) {
  await resume();await action('tribe-all');await action('tribe-home');await page.waitForTimeout(700);
  for(let round=0;round<50;round++) {
    const s=await read();if(s.tribe.food>=target){await action('tribe-retreat');await until(v=>v.tribe.members.every(u=>!u.orders.length),'gatherers return');await log('actual-harvest',{target});return;}
    const active=s.tribe.members.some(u=>u.orders[0]?.target.kind==='food'&&s.world.resources.some(r=>r.id===u.orders[0].target.id&&r.amount>=1));
    if(!active){
      const home=s.tribe.huts.find(h=>h.kind==='shelter').pos;
      const foods=s.world.resources.filter(r=>s.stats.diet.includes(r.kind)&&r.amount>=1).sort((a,b)=>Math.hypot(a.pos.x-home.x,a.pos.z-home.z)-Math.hypot(b.pos.x-home.x,b.pos.z-home.z));
      let selected=false;
      for(const food of foods){const point=await screen('food',food.id);if(!point)continue;await page.mouse.click(point.x,point.y,{button:'right'});const after=await read();if(after.tribe.members.some(u=>u.orders[0]?.kind==='gather')){selected=true;break;}}
      assert.ok(selected,'A visible compatible resource accepts the actual right-click order');
    }
    await page.waitForTimeout(5000);if(round%3===0)await log('harvest-progress',{target});
  }
  throw Error('Harvest did not supply the requested stock');
}
async function build(tool) {
  await resume();await action('tribe-all');await action('tribe-home');await page.waitForTimeout(700);const before=await read();
  await action('tribe-build:'+tool);let fresh;
  for(const [x,y]of[[780,430],[820,470],[590,450],[530,410],[830,380],[730,320],[600,330],[850,510],[480,380]]) {
    if(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName!=='CANVAS',{x,y}))continue;
    await page.mouse.click(x,y);const s=await read();if(s.tribe.huts.length>before.tribe.huts.length){fresh=s.tribe.huts.at(-1);break;}
  }
  assert.ok(fresh,'An ordinary cursor placement accepts a clear construction site');assert.equal((await read()).tribe.food,before.tribe.food-(tool==='shelter'?18:22));
  await until(s=>s.tribe.huts.find(h=>h.id===fresh.id).progress===1,'paid construction',90);await log('actual-workshop',{tool,id:fresh.id});
}
async function culture() {
  await resume();const before=await read(),id=before.tribe.members.find(u=>!u.species).id;await action('tribe-select:'+id);await action('tribe-culture');
  await page.locator('#culture-name').fill('Hlas Jasnozrnky');await action('culture-part:head:plume');await action('culture-part:back:shell');await action('culture-save');await action('culture-equip');await action('culture-close');
  const after=await read();assert.ok(after.tribe.members.find(u=>u.id===id).outfit);assert.ok(after.tribe.food<before.tribe.food);await log('actual-cultural-outfit',{id,paid:before.tribe.food-after.tribe.food});
}
async function visit(index) {
  await resume();let s=await read();const n=s.tribe.neighbours[index];assert.ok(n&&!n.resolved);assert.ok(s.tribe.food>=16);
  await action('tribe-all');await action('tribe-focus:'+n.id);await action('tribe-socialize:'+n.id);
  s=await until(v=>!!v.tribe.neighbours.find(q=>q.id===n.id).resolved,'actual alliance '+n.identity,180);assert.equal(s.tribe.neighbours[index].resolved,'allied');await log('actual-alliance',{identity:n.identity});
  if(index<4){assert.equal(s.tribe.completed,false);assert.equal(await page.locator('[data-action="tribe-next"]').count(),0);}
  await action('tribe-retreat');await until(v=>v.tribe.members.every(u=>!u.orders.length),'return from '+n.identity,90);
  await until(v=>v.tribe.members.every(u=>u.health>=92&&u.hunger<35),'home care',45);await action('tribe-home');
}
async function scene(name) {
  await resume();const frames=await page.evaluate(()=>new Promise(resolve=>{const frames=[];let previous=null;function sample(t){if(previous!==null)frames.push(t-previous);previous=t;if(frames.length===90)resolve(frames);else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
  const s=await read();await page.screenshot({path:path.join(out,name+'.png')});await pause();const sorted=frames.sort((a,b)=>a-b);
  await writeFile(path.join(out,name+'-performance.json'),JSON.stringify({nativeRAF:true,frames:90,p50:sorted[45],p95:sorted[85],maximum:sorted.at(-1),render:s.render},null,2));await log('scene',{name,p95:sorted[85]});
}
try {
  await page.setViewportSize({width:1280,height:720});assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  if(phase==='status')console.log(JSON.stringify(compact(await read()),null,2));
  else if(phase==='gather'){await gather(Number(process.argv[3]??120));await exported('15-tribe-harvest');}
  else if(phase==='build'){await build(process.argv[3]??'drum');await exported('16-tribe-workshop');}
  else if(phase==='equip'){await resume();await action('tribe-all');const before=await read();await action('tribe-equip:'+(process.argv[3]??'drum'));const s=await read();assert.ok(s.tribe.members.every(u=>u.tool===(process.argv[3]??'drum')));await log('actual-tools',{paid:before.tribe.food-s.tribe.food});await exported('17-tribe-tools');}
  else if(phase==='culture'){await culture();await exported('18-tribe-outfit');}
  else if(phase==='visit'){const index=Number(process.argv[3]??0);await visit(index);await exported('19-tribe-'+index);}
  else if(phase==='scene')await scene(process.argv[3]??'tribe');
  else if(phase==='next') {
    await resume();const before=await read();assert.ok(before.tribe.completed&&before.tribe.neighbours.every(n=>n.resolved==='allied'));
    await scene('tribe-complete-1280');await exported('20-tribe-complete');await resume();await action('tribe-next');
    const after=await read();assert.equal(after.stage,4);assert.equal(after.machines.resource,100);assert.equal(after.machines.fleet.length,0);assert.deepEqual(after.player.genome,before.player.genome);
    assert.equal(after.lineageHistory.stages[3].closed.outcome,'allied');assert.equal(after.lineageHistory.stages[3].facts.length,5);assert.ok(after.lineageHistory.stages[3].facts.every(f=>f.source==='action'));
    assert.equal(after.tribeInheritance.income,1.2);await log('actual-machine-transition',{inheritance:after.tribeInheritance});await exported('21-machine-arrival');
  }
  else throw Error('Unknown tribe phase '+phase);
}catch(error){await pause().catch(()=>{});await log('operation-failed',{phase,message:String(error)}).catch(()=>{});await exported('tribe-failure-continuation').catch(()=>{});console.error(error);process.exit(1);}
await pause();process.exit(0);
