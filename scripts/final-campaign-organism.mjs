/** Continue the same genuinely new browser lineage through ordinary controls.
 * The fresh-organism controller owns the downloads. No fixture, state setter,
 * test clock or gameplay module is imported here. Each operation ends paused.
 */
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const out = path.resolve(process.env.FRESH_OUTPUT ?? 'evidence/final-campaign/organism');
const endpoint = `http://127.0.0.1:${process.env.FRESH_CONTROL_PORT ?? 9225}`;
const phase = process.argv[2] ?? 'status';
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
async function control(command,args={}) {
  const response=await fetch(endpoint,{method:'POST',body:JSON.stringify({command,args})});
  const data=await response.json(); assert.ok(response.ok,JSON.stringify(data)); return data;
}
const read=()=>control('read');
const compact=s=>({stage:s.stage,mode:s.mode,tick:s.tick,pos:s.player.pos,health:s.player.health,energy:s.player.energy,oxygen:s.player.oxygen,moisture:s.player.moisture,dna:s.player.dna,generation:s.player.generation,meals:s.player.meals,nutrition:s.cellGrowth?.nutrition,cargo:s.cargo,guide:s.journeyGuide,requirements:s.requirements,deathReason:s.deathReason});
async function log(event,extra={}) {
  const entry={event,wall:new Date().toISOString(),...compact(await read()),...extra};
  await appendFile(path.join(out,'segments.jsonl'),JSON.stringify(entry)+'\n');
  console.log(JSON.stringify(entry));
}
async function move(pos,options={}) {
  // A held filter pumps and brakes in the reef. Open it deliberately at food
  // or gas, rather than silently choosing that body action on every journey.
  const s=await read();return control('move',{...pos,feed:s.stage===0,...options});
}
async function tap(key='KeyT',count=1,wait=1000) {
  const cooldown=(await read()).player.cooldown;
  if(cooldown>0) await control('burst',{keys:[],ms:Math.ceil(cooldown*1000)+120});
  return control('tap',{key,count,wait});
}
async function exported(name) {
  await control('export',{name}); const file=path.join(out,name+'.save.json'),bytes=await readFile(file);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(out,'active-campaign.save.json'),bytes);
  await log('public-export',{file,sha256});
}
async function eatUntil(nutrition) {
  for(let attempt=0;attempt<50;attempt++) {
    const s=await read(); assert.equal(s.stage,0); assert.equal(s.deathReason,null);
    if(s.cellGrowth.nutrition>=nutrition) return;
    if(s.feedTarget?.kind==='food'&&(s.feedTarget.ready||s.feedTarget.reason==='cooldown')) await control('burst',{keys:['Space'],ms:1800});
    else {
      const food=s.world.resources.filter(r=>['algae','detritus'].includes(r.kind)&&r.amount>=1&&(r.max<7||s.cellGrowth.nutrition>=8))
        .sort((a,b)=>distance(a.pos,s.player.pos)-distance(b.pos,s.player.pos))[0];
      assert.ok(food,'Compatible visible food'); await move(food.pos,{tolerance:1.7});
      await control('burst',{keys:['Space'],ms:1800});
    }
  }
  throw new Error('Ordinary feeding did not reach requested growth');
}
async function editBody({add=['spines','antenna','toxin'],remove=[],label='cell'}={}) {
  const {chromium}=await import('playwright');
  const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
  const origin=new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin;
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(origin));assert.ok(page);
  await page.setViewportSize({width:1024,height:640});
  const action=name=>page.locator(`[data-action="${name}"]`).first().click();
  let s=await read(); if(s.mode==='pause')await action('close');
  if((await read()).mode==='game')await page.keyboard.press('Tab');
  assert.equal((await read()).mode,'editor');await action('category:all');
  for(const kind of remove) {const part=(await read()).editor.draft.parts.find(p=>p.kind===kind);if(part){await action('select:'+part.id);await action('remove');}}
  for(const kind of add)if(!(await read()).editor.draft.parts.some(p=>p.kind===kind))await action('add:'+kind);
  await page.locator('[data-genome="name"]').fill('Jasnozrnka');await page.locator('[data-genome="name"]').press('Tab');
  const hue=page.locator('[data-genome="hue"]');await hue.focus();await hue.press('End');
  for(let i=0;i<155;i++)await hue.press('ArrowLeft');await hue.press('Tab');
  await page.locator('[data-genome="pattern"]').selectOption('2');
  s=await read();assert.equal(s.editor.draft.hue,205);assert.equal(s.editor.draft.pattern,2);
  const draft=s.editor.draft,cost=s.editor.cost,budget=s.player.dna;
  assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(),false);
  await page.screenshot({path:path.join(out,label+'-editor.png')});await action('confirm-editor');await action('pause');
  const after=await read();assert.deepEqual(after.player.genome,draft);await log('paid-body',{label,cost,budget,paid:budget-after.player.dna});
  await action('close');await page.screenshot({path:path.join(out,label+'-body.png')});await action('pause');
  // The original controller keeps owning the browser. This short CDP client
  // exits below, without closing that shared browser or changing its state.
}
async function reloadPlayed() {
  const file=path.join(out,'active-campaign.save.json'),bytes=await readFile(file),before=JSON.parse(bytes).state;
  const {chromium}=await import('playwright'),browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
  const base=process.env.LUMAVORA_URL??'http://127.0.0.1:5220',page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(base).origin));assert.ok(page);
  await page.goto(base,{waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  await page.locator('[data-action="saves"]').first().click();await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await page.locator('[data-action="pause"]').click();
  const after=await read();assert.equal(after.stage,before.stage);assert.equal(after.seed,before.seed);assert.deepEqual(after.player.genome,before.player.genome);
  assert.equal(after.player.generation,before.player.generation);assert.deepEqual(after.lineageHistory,before.lineageHistory);assert.deepEqual(after.cellGrowth.parts,before.cellGrowth.parts);
  if(before.stage===3) {
    assert.deepEqual(after.tribe.members.map(u=>({id:u.id,tool:u.tool,outfit:u.outfit})),before.tribe.members.map(u=>({id:u.id,tool:u.tool,outfit:u.outfit})));
    assert.deepEqual(after.tribe.neighbours.map(n=>({id:n.id,resolved:n.resolved})),before.tribe.neighbours.map(n=>({id:n.id,resolved:n.resolved})));
  }
  const assets=await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')??n.getAttribute('href'))),hashes={};
  for(const asset of assets)hashes[asset]=createHash('sha256').update(await readFile(path.join('dist',new URL(asset,base).pathname))).digest('hex');
  await log('public-reload',{inputSha256:createHash('sha256').update(bytes).digest('hex'),assets:hashes});
  await exported('reload-continuation');const saved=JSON.parse(await readFile(file)).state;assert.notEqual(saved.id,before.id);
  assert.deepEqual(JSON.parse(saved.checkpoint).player.genome,JSON.parse(before.checkpoint).player.genome);
  if(before.stage===3)assert.deepEqual(JSON.parse(saved.checkpoint).tribe,JSON.parse(before.checkpoint).tribe);
}
async function scene(name) {
  const {chromium}=await import('playwright');
  const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
  const origin=new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin;
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(origin));assert.ok(page);
  await page.setViewportSize({width:1024,height:640});
  if((await read()).mode==='pause')await page.locator('[data-action="close"]').first().click();
  assert.equal((await read()).mode,'game');
  const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let previous=null;function sample(time){if(previous!==null)samples.push(time-previous);previous=time;if(samples.length===90)resolve(samples);else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
  const s=await read();await page.screenshot({path:path.join(out,name+'.png')});
  await page.locator('[data-action="pause"]').click();const sorted=[...frames].sort((a,b)=>a-b);
  await writeFile(path.join(out,name+'-performance.json'),JSON.stringify({nativeRAF:true,frames:90,p50:sorted[45],p95:sorted[85],maximum:sorted.at(-1),render:s.render,state:compact(s)},null,2));
  await log('scene',{name,p95:sorted[85]});
}
async function growth() {
  assert.equal((await read()).stage,0);
  for(const nutrition of [3,8,15]) {await eatUntil(nutrition); await log('earned-growth',{target:nutrition});}
  for(const site of (await read()).cellGrowth.sites) {
    if(site.collected)continue; await move(site.pos,{tolerance:2}); await tap();
    assert.ok((await read()).cellGrowth.parts.some(p=>p.part===site.part));
  }
  await move({x:0,z:0},{tolerance:3});
  await editBody();
  const s=await read();assert.equal(s.cellGrowth.nutrition,15);assert.ok(s.player.genome.parts.some(p=>p.kind==='toxin'));
  await exported('01-cell-grown');
}
async function plantCurrent() {
  let s=await read();assert.ok(s.journeyGuide?.target,'Visible next destination');
  await move(s.journeyGuide.target,{tolerance:1.3});
  for(let attempt=0;attempt<3;attempt++) {
    s=await read();if(s.cargo?.purpose==='culture')break;
    if(s.journeyGuide?.target&&distance(s.player.pos,s.journeyGuide.target)>2.5)await move(s.journeyGuide.target,{tolerance:1.2});
    await tap();
  }
  s=await read();assert.equal(s.cargo?.purpose,'culture','Actual mother culture collected');
  await log('culture-collected');assert.ok(s.journeyGuide?.target);
  await move(s.journeyGuide.target,{tolerance:1.2,feed:false});await tap();
  assert.equal((await read()).cargo,null,'Actual planting consumed carried culture');await log('culture-planted');
}
async function garden() {
  await plantCurrent();
  for(let i=0;i<12;i++) {
    const s=await read();if(s.requirements[0].met){await exported('02-cell-garden');return;}
    if(s.player.abilityRecharge===0&&s.world.creatures.some(c=>c.species==='needle'&&distance(c.pos,s.player.pos)<12))await tap('KeyX');
    await control('burst',{keys:[],ms:5000});await log('living-garden-observation');
  }
  throw new Error('Garden still needs a safe grazer meal; inspect the actual ecology');
}
async function vortex() {
  assert.ok((await read()).requirements[0].met);await exported('02-cell-garden');
  await move({x:58,z:-20},{tolerance:2});
  for(let i=0;i<12;i++) {
    let s=await read();if(s.cargo?.purpose==='culture')break;
    assert.equal(s.cargo,null,'No unrelated food was picked up');
    assert.equal(s.journeyGuide.title,'To, co nese proud');
    const target=s.journeyGuide.target;assert.ok(target);
    await move(target,{tolerance:1.5,feed:false});
    s=await read();if(distance(s.player.pos,s.journeyGuide.target)<3.1)await tap();
  }
  let s=await read();assert.equal(s.cargo?.site,1);assert.equal(s.cargo.purpose,'culture');await log('vortex-collected');
  // Leave by the broad visible mouth; the grown body does not fit the western slit.
  await move({x:58,z:-20},{tolerance:2,feed:false});
  s=await read();await move(s.journeyGuide.target,{tolerance:1.3,feed:false});await tap();
  assert.ok((await read()).requirements[1].met);await exported('03-cell-vortex');
}
async function coral() {
  assert.equal((await read()).stage,1);await plantCurrent();
  assert.equal((await read()).journeyGuide.step,'4 · Ustup od pastvy');
  await scene('reef-pasture-distance-1024');
  await move({x:-2,y:10.8,z:-35},{feed:false});
  for(let i=0;i<8;i++) {
    if((await read()).requirements[0].met){await exported('07-reef-coral');return;}
    await control('burst',{keys:[],ms:5000});await log('coral-grazer-observation');
  }
  throw new Error('Coral pasture still needs a safe meal');
}
async function canopy() {
  assert.equal((await read()).stage,1);
  await move({x:20,y:-2.6,z:-20},{tolerance:1.3});
  await move({x:37,y:-1,z:-20},{tolerance:1.2,feed:true});
  for(let i=0;i<5;i++) {
    const s=await read();if(s.cargo?.purpose==='culture')break;
    assert.equal(s.cargo,null);assert.equal(s.journeyGuide.title,'Kořeny nad hlavou');
    if(s.journeyGuide.step==='2 · Uvolni mateřskou řasu')await control('burst',{keys:['Space'],ms:1500});
    else {
      const target=s.journeyGuide.target;
      if(Math.hypot(s.player.pos.x-target.x,s.player.pos.y-target.y,s.player.pos.z-target.z)>2.5)await move(target,{tolerance:1.3});
      await tap();
    }
  }
  let s=await read();assert.equal(s.cargo?.site,4);assert.equal(s.cargo.purpose,'culture');await log('canopy-released-and-collected');
  await move(s.journeyGuide.target,{tolerance:1.2});await tap();assert.equal((await read()).cargo,null);await log('canopy-planted');
  await move({x:18,y:10.8,z:-20},{tolerance:1.5});
  for(let i=0;i<10;i++) {
    if((await read()).requirements[1].met){await exported('08-reef-canopy');return;}
    await control('burst',{keys:[],ms:5000});await log('canopy-grazer-observation');
  }
  throw new Error('Canopy pasture still needs a safe meal');
}
async function lureCanopy() {
  const before=await read();assert.equal(before.stage,1);assert.equal(before.cargo,null);
  // Visible nearby algae, followed by one real offering between the surviving
  // wild grazers and the upper colony. Keep the defended body out of their way.
  const algae=before.world.resources.filter(r=>r.kind==='algae'&&r.amount>=1&&r.pos.x>15&&r.pos.x<23&&r.pos.z>-15&&r.pos.z<-7)
    .sort((a,b)=>distance(a.pos,{x:18,z:-10})-distance(b.pos,{x:18,z:-10}))[0];assert.ok(algae);
  await move(algae.pos,{tolerance:1.2});await tap();
  const carrying=await read();assert.equal(carrying.cargo?.purpose,'food');assert.equal(carrying.cargo.kind,'algae');
  await move({x:18,y:4,z:-14},{tolerance:1.3});await tap('KeyE');assert.equal((await read()).cargo,null);await log('actual-canopy-food-offering');
  await move({x:18,y:10.8,z:10},{tolerance:1.5});
  for(let i=0;i<12;i++) {
    if((await read()).requirements[1].met){await exported('08-reef-canopy');return;}
    await control('burst',{keys:[],ms:5000});if(i%2===0)await log('canopy-offering-observation');
  }
  throw new Error('Inspect the offered meal and actual wild grazer route');
}
async function defendCanopy() {
  const initial=await read(),hunter=initial.world.creatures.find(c=>c.patch===1&&c.species==='ribbon');assert.ok(hunter);
  for(let attempt=0;attempt<6;attempt++) {
    let s=await read(),c=s.world.creatures.find(c=>c.id===hunter.id);
    if(!c){await log('canopy-hunter-defeated',{hunter:hunter.id,kills:s.player.kills});await exported('08-canopy-defended');return;}
    assert.ok(s.player.health>35&&s.player.energy>20,'Return for ordinary care before further combat');
    if(s.player.abilityRecharge>0)await control('burst',{keys:[],ms:Math.ceil(s.player.abilityRecharge*1000)+150});
    for(let approach=0;approach<3;approach++) {
      s=await read();c=s.world.creatures.find(c=>c.id===hunter.id);if(!c)break;
      if(Math.hypot(c.pos.x-s.player.pos.x,c.pos.y-s.player.pos.y,c.pos.z-s.player.pos.z)<5)break;
      await move(c.pos,{tolerance:3,feed:false,seconds:20});
    }
    await tap('KeyX',1,180);s=await read();c=s.world.creatures.find(c=>c.id===hunter.id);
    await log('actual-defensive-pulse',{hunter:hunter.id,remaining:c?.health??0,fear:c?.fear??null});
  }
  throw new Error('Defensive pulses need a closer actual contact');
}
async function relayCanopy() {
  assert.ok(!(await read()).world.creatures.some(c=>c.patch===1&&c.species==='ribbon'),'Known local hunter has been dealt with');
  for(const destination of [{x:8,y:2,z:-12},{x:21,y:6,z:-18}]) {
    const s=await read(),food=s.world.resources.filter(r=>r.kind==='algae'&&r.amount>=1&&r.pos.x>15&&r.pos.x<23&&r.pos.z>-15&&r.pos.z<-7)
      .sort((a,b)=>distance(a.pos,{x:18,z:-10})-distance(b.pos,{x:18,z:-10}))[0];assert.ok(food);
    await move(food.pos,{tolerance:1.2});await tap();assert.equal((await read()).cargo?.purpose,'food');
    await move(destination,{tolerance:1.2});await tap('KeyE');await log('canopy-relay-offer',{destination});
  }
  await move({x:40,y:10.8,z:10},{tolerance:1.5});
  for(let i=0;i<12;i++) {
    if((await read()).requirements[1].met){await exported('08-reef-canopy');return;}
    await control('burst',{keys:[],ms:5000});if(i%2===0)await log('relay-grazer-observation');
  }
  throw new Error('Actual relay did not yet lead a grazer to the upper colony');
}
async function forage() {
  for(let attempt=0;attempt<25;attempt++) {
    const s=await read();assert.equal(s.deathReason,null);
    if(s.player.energy>=90&&s.player.health>=s.stats.maxHealth*.9){await log('actual-food-recovery');return;}
    const food=s.world.resources.filter(r=>r.amount>=1&&r.max<=8&&s.stats.diet.includes(r.kind)&&r.pos.z<15)
      .sort((a,b)=>Math.hypot(a.pos.x-s.player.pos.x,a.pos.y-s.player.pos.y,a.pos.z-s.player.pos.z)-Math.hypot(b.pos.x-s.player.pos.x,b.pos.y-s.player.pos.y,b.pos.z-s.player.pos.z))[0];assert.ok(food);
    await move(food.pos,{tolerance:1.2,feed:true});await control('burst',{keys:['Space'],ms:1500});
  }
  throw new Error('Food recovery needs a different ordinary patch');
}
async function vent() {
  assert.ok((await read()).requirements.slice(0,2).every(r=>r.met));await forage();
  await move({x:0,y:10.8,z:39},{tolerance:1.4});
  let source=(await read()).journeyGuide.target;assert.ok(source);
  await move(source,{tolerance:1.1,feed:true});
  for(let i=0;i<4;i++) {
    let s=await read();if(s.cargo?.purpose==='culture')break;
    assert.ok(s.player.oxygen>20,'Exit gas before another sampling attempt');
    source=s.journeyGuide.target;
    if(Math.hypot(source.x-s.player.pos.x,source.y-s.player.pos.y,source.z-s.player.pos.z)>2.3)await move(source,{tolerance:1.1});
    await tap('KeyT',1,120);
  }
  let s=await read();assert.equal(s.cargo?.site,5);await log('actual-vent-sample');
  await control('burst',{keys:['KeyQ','Space'],ms:2500});s=await read();
  await move({x:s.player.pos.x,y:10.8,z:s.player.pos.z},{tolerance:1.4,feed:true});
  s=await read();assert.equal(s.cargo?.purpose,'culture');assert.ok(s.cargo.vitality>=20);await log('vent-surface-escape');
  await move(s.journeyGuide.target,{tolerance:1.3,feed:false});await tap();
  assert.ok((await read()).requirements.every(r=>r.met));await exported('09-reef-complete');
}
async function ventSide() {
  assert.ok((await read()).requirements.slice(0,2).every(r=>r.met));
  assert.ok((await read()).journeyGuide.instruction.includes('Sestup klávesou C vedle něj'));
  await scene('vent-side-guidance-1024');
  await move({x:0,y:10.8,z:46},{tolerance:1});
  await move({x:0,y:-3,z:46},{tolerance:1,feed:false,seconds:25});
  await move({x:0,y:-3,z:43},{tolerance:.6,feed:true,seconds:15});
  for(let i=0;i<3;i++) {
    const s=await read();if(s.cargo?.purpose==='culture')break;
    assert.ok(s.player.oxygen>20,'Real oxygen reserve for another action');
    if(s.player.cooldown>0)await control('burst',{keys:['KeyC'],ms:Math.ceil(s.player.cooldown*1000)+120});
    await control('tap',{key:'KeyT',count:1,wait:100});
  }
  let s=await read();assert.equal(s.cargo?.site,5);await log('actual-side-vent-sample');
  await move({x:0,y:10.8,z:39},{tolerance:1.2,feed:true,seconds:20});
  s=await read();assert.equal(s.cargo?.purpose,'culture');assert.ok(s.cargo.vitality>=20);await log('actual-lift-escape');
  await move(s.journeyGuide.target,{tolerance:1.3,feed:false});await tap();
  assert.ok((await read()).requirements.every(r=>r.met));await exported('09-reef-complete');
}
async function socialVisit(index) {
  let s=await read();assert.equal(s.stage,2);const nest=s.creatureStage.nests[index];assert.ok(nest&&!nest.outcome);
  for(let attempt=0;attempt<5;attempt++) {
    s=await read();const target=s.world.creatures.find(c=>c.id===nest.residents[0]);assert.ok(target);
    if(distance(s.player.pos,target.pos)<3.8)break;
    await move(target.pos,{tolerance:3.2,feed:false});
  }
  await control('action',{name:'species-focus:'+nest.species});await tap('KeyV',1,150);
  assert.ok((await read()).creatureStage.encounter,'Ordinary V starts the meeting');
  // A recruited animal walks through the same terrain. Give it time to arrive
  // before answering, while the actual partner is still waiting.
  if(index>0&&(await read()).creatureStage.pack.length)await control('burst',{keys:[],ms:5000});
  if(index===0)await scene('creature-social-request-1024');
  for(let turn=0;turn<12;turn++) {
    s=await read();const encounter=s.creatureStage.encounter;if(!encounter)break;
    const cooldown=Math.max(s.creatureStage.recharge,s.player.cooldown);
    if(cooldown>0)await control('burst',{keys:[],ms:Math.ceil(cooldown*1000)+150});
    const next=(await read()).creatureStage.encounter;assert.ok(next,'Meeting remains active while the body recovers');
    await tap('Digit'+(['sing','dance','charm','pose'].indexOf(next.requested)+1),1,160);
  }
  s=await read();assert.equal(s.creatureStage.nests[index].outcome,'friend');
  await log('actual-friendship',{species:nest.species,relationship:s.creatureStage.nests[index].relationship,assists:s.creatureStage.discovery.socialAssists});
  if(index===0) {await tap('KeyR');assert.equal((await read()).creatureStage.pack.length,1);await log('actual-pack-recruitment');}
  await exported('10-friend-'+nest.species);
}
async function landMeal() {
  const before=await read();assert.equal(before.stage,2);
  const food=before.world.resources.filter(r=>r.amount>=2&&before.stats.diet.includes(r.kind)).sort((a,b)=>distance(a.pos,before.player.pos)-distance(b.pos,before.player.pos))[0];assert.ok(food);
  await move(food.pos,{tolerance:1.2});
  const {chromium}=await import('playwright'),browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));assert.ok(page);
  if((await read()).mode==='pause')await page.locator('[data-action="close"]').first().click();
  for(const [x,y]of[[600,100],[700,100],[650,120]]) {await page.mouse.click(x,y);if(!(await read()).feedSelection)break;}
  await page.locator('[data-action="pause"]').click();assert.equal((await read()).feedSelection,null);
  await control('burst',{keys:['Space'],ms:3800});
  const s=await read();assert.ok(s.player.meals>before.player.meals);await log('actual-land-food',{kind:food.kind,mealsGained:s.player.meals-before.player.meals});
}
async function discoverArms() {
  const s=await read(),site=s.creatureStage.discovery.remains.find(r=>r.id==='west');assert.ok(site&&!site.collected);
  await move(site.pos,{tolerance:2});
  // The discovery panel has its own inspect button; T still tends/carries life.
  if((await read()).cargo?.purpose==='food')await tap('KeyE');
  await control('action',{name:'species-remains:west'});
  assert.ok((await read()).creatureStage.discovery.parts.some(p=>p.part==='arms'&&p.source==='remains'));
  await log('actual-arms-discovery');await move(s.world.landmarks.find(l=>l.kind==='nest').pos,{tolerance:3});await exported('11-arms-discovered');
}
async function landBody() {
  const before=await read();assert.equal(before.stage,2);assert.ok(before.creatureStage.discovery.parts.some(p=>p.part==='arms'));
  const {chromium}=await import('playwright'),browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));assert.ok(page);
  await page.setViewportSize({width:1280,height:800});
  const action=name=>page.locator(`[data-action="${name}"]`).first().click();
  const number=async(key,value)=>{const input=page.locator(`[data-creature="${key}"]`);await input.fill(String(value));await input.press('Tab');};
  if(before.mode==='pause')await action('close');await page.keyboard.press('Tab');assert.equal((await read()).mode,'editor');
  if(await page.locator('[data-action="creature-open"]').count())await action('creature-open');
  await action('creature-panel:parts');await action('add:arms');
  await number('part.axial',.45);await page.locator('[data-creature="part.mirrored"]').check();
  await action('creature-panel:body');await action('creature-spine:spine-5');await number('node.bend',.35);
  await action('creature-panel:skin');await page.locator('[data-creature="skin.finish"]').selectOption('pebbled');
  await number('skin.secondaryHue',38);await number('skin.contrast',.6);
  let s=await read();assert.equal(s.editor.draft.version,2);assert.ok(s.editor.draft.parts.some(p=>p.kind==='arms'&&p.mirrored));
  const draft=s.editor.draft;assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(),false,await page.locator('.editor-validation').innerText());
  await page.screenshot({path:path.join(out,'land-body-editor.png')});await action('confirm-editor');await action('pause');
  s=await read();assert.deepEqual(s.player.genome,draft);assert.equal(s.player.generation,before.player.generation+1);
  assert.equal(s.creatureStage.discovery.parts.find(p=>p.part==='arms').usedGeneration,s.player.generation);
  assert.ok(s.player.dna<before.player.dna,'New actual arms consume earned construction budget');
  await log('actual-land-generation',{paid:before.player.dna-s.player.dna,bodyVersion:s.player.genome.version,discovery:s.creatureStage.discovery.birth});
  await exported('12-land-body');
}
async function enterTribe() {
  let s=await read();assert.equal(s.stage,2);assert.ok(s.creatureStage.nests.filter(n=>n.outcome).length>=3);
  await move(s.world.landmarks.find(l=>l.kind==='nest').pos,{tolerance:3});
  for(let i=0;i<15;i++) {
    s=await read();if(s.player.health>=s.stats.maxHealth-.01)break;
    assert.ok(s.player.energy>20,'Home recovery requires the real energy reserve');
    await control('burst',{keys:[],ms:5000});if(i%3===0)await log('actual-home-recovery');
  }
  s=await read();assert.equal(s.player.health,s.stats.maxHealth);
  await scene('creature-complete-1024');await exported('13-creature-ready');
  await tap('KeyG',1,200);s=await read();assert.equal(s.mode,'won');assert.equal(s.creatureStage.completed,'social');
  const {chromium}=await import('playwright'),browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`);
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));assert.ok(page);
  await page.screenshot({path:path.join(out,'creature-social-ending.png')});await log('actual-creature-completion',{history:s.lineageHistory.stages[2]});
  await control('action',{name:'continue-era'});const next=await read();assert.equal(next.stage,3);assert.equal(next.tribe.neighbours.length,5);assert.ok(next.tribe.neighbours.every(n=>!n.resolved));
  assert.deepEqual(next.player.genome,s.player.genome);assert.equal(next.tribe.food,36);assert.equal(next.tribe.members.length,3);
  await exported('14-tribe-arrival');
}
try {
  if(phase==='status') console.log(JSON.stringify(compact(await read()),null,2));
  else if(phase==='growth') await growth();
  else if(phase==='edit-cell') {await editBody();await exported('01-cell-grown');}
  else if(phase==='edit-reef') {await editBody({add:['fins','gills','lungs','legs','reservoir','proboscis'],label:'reef'});await exported('06-reef-body');}
  else if(phase==='reload') await reloadPlayed();
  else if(phase==='garden') await garden();
  else if(phase==='vortex') await vortex();
  else if(phase==='coral') await coral();
  else if(phase==='canopy') await canopy();
  else if(phase==='lure-canopy') await lureCanopy();
  else if(phase==='defend-canopy') await defendCanopy();
  else if(phase==='relay-canopy') await relayCanopy();
  else if(phase==='forage') await forage();
  else if(phase==='vent') await vent();
  else if(phase==='vent-side') await ventSide();
  else if(phase==='friend') await socialVisit(Number(process.argv[3]??0));
  else if(phase==='discover-arms') await discoverArms();
  else if(phase==='land-body') await landBody();
  else if(phase==='land-meal') await landMeal();
  else if(phase==='enter-tribe') await enterTribe();
  else if(phase==='plant') await plantCurrent();
  else if(phase==='scene') await scene(process.argv[3]??'organism');
  else if(phase==='enter') {
    const s=await read();assert.ok(s.stage<2&&s.requirements.every(r=>r.met));
    await move(s.world.landmarks.find(l=>l.kind==='gate').pos,{tolerance:3,feed:false});await tap('KeyG');
    assert.equal((await read()).stage,s.stage+1);await exported(s.stage===0?'05-reef-arrival':'09-creature-arrival');
  }
  else if(phase==='move') {await move(JSON.parse(process.argv[3]));await log('arrived');}
  else if(phase==='tap') {const a=JSON.parse(process.argv[3]??'{}');await tap(a.key,a.count,a.wait);await log('key');}
  else if(phase==='export') await exported(process.argv[3]??'earned-progress');
  else throw new Error('Unknown organism phase '+phase);
} catch(error) {
  await log('operation-failed',{phase,message:error.message}).catch(()=>{});
  await exported('failure-continuation').catch(()=>{}); console.error(error);process.exit(1);
}
process.exit(0);
