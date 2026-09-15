/** Accelerated LEGACY campaign regression, not a fresh current-journey playthrough.
 * Import an untouched createGame(seed, true) tick-0 save through the normal UI;
 * thereafter only DOM clicks, keyboard input and disclosed fixed time steps.
 * Original script: evidence/quality/legacy-reproduction/browser-test.original.mjs */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
// Respect an explicit registry; use the local benchmark cache only when present.
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const {chromium}=await import('playwright');
const out=process.env.BROWSER_TEST_OUTPUT??'evidence/quality/regression/browser-test';await fs.mkdir(out,{recursive:true});
const provenance={kind:'legacy-campaign-regression',campaignRules:'legacy',freshCurrentCampaign:false,acceleratedTimeStepping:true,explicitlyNotFirstPlayDuration:true,initialState:{factory:'createGame(481516, true)',tick:0,preparedProgress:false,import:'normal Saves UI file input; import assigns a new lineage ID'},gameplay:'DOM clicks and keyboard inputs; DEV advanceTime performs fixed simulation steps'};
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
let initial;
try{
 const {createGame}=await server.ssrLoadModule('/src/game/simulation.ts');
 const {serializeGame,parseGame}=await server.ssrLoadModule('/src/game/persistence.ts');
 initial=createGame(481516,true);
 assert.equal(initial.tick,0);assert.equal(initial.stage,0);assert.equal(initial.journey.legacy,true);assert.equal(initial.player.meals,0);
 const text=serializeGame(initial);assert.deepEqual(parseGame(text),initial);
 await fs.writeFile(`${out}/legacy-initial.fixture.json`,text);
 await fs.writeFile(`${out}/methodology.json`,JSON.stringify(provenance,null,2));
}finally{await server.close();}
if(process.argv.includes('--prepare-only')){console.log('Validated untouched legacy tick-0 save; no browser launched.');process.exit(0);}
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],log=[];const started=Date.now();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function record(event){const s=await read();const item={event,wallSeconds:(Date.now()-started)/1000,simulationSeconds:s.tick/60,stage:s.stage,generation:s.player.generation,meals:s.player.meals,dna:s.player.dna,bonds:s.player.bonds.length,position:s.player.pos,field:s.field,nicheActivities:s.campaign.journals.filter(j=>j.startsWith('field:')),render:s.render};log.push(item);console.log(JSON.stringify(item));await fs.writeFile(`${out}/timeline.json`,JSON.stringify(log,null,2));}
async function shot(name){await page.waitForTimeout(200);await page.screenshot({path:`${out}/${name}.png`});await fs.writeFile(`${out}/${name}.json`,JSON.stringify(await read(),null,2));}
async function hold(buttons,ms){for(const b of buttons)await page.keyboard.down(b);await page.evaluate(ms=>window.advanceTime(ms),ms);for(const b of buttons)await page.keyboard.up(b);}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function pathfind(start,goal,obstacles,stage,y){
 const cell=3,N=53,coord=n=>Math.max(0,Math.min(N-1,Math.round((n+78)/cell))),key=(x,z)=>z*N+x,point=k=>({x:(k%N)*cell-78,z:Math.floor(k/N)*cell-78});
 const blocked=new Set();for(let z=0;z<N;z++)for(let x=0;x<N;x++){const p=point(key(x,z));if(obstacles.some(o=>!(stage===1&&y>o.pos.y+o.height+1.6)&&dist(p,o.pos)<o.radius+1.25))blocked.add(key(x,z));}
 const from=key(coord(start.x),coord(start.z)),to=key(coord(goal.x),coord(goal.z));blocked.delete(from);blocked.delete(to);let open=[from];const came=new Map(),g=new Map([[from,0]]),closed=new Set();
 for(let i=0;i<6000&&open.length;i++){open.sort((a,b)=>(g.get(a)+dist(point(a),goal))-(g.get(b)+dist(point(b),goal)));const current=open.shift();if(current===to){const path=[goal];let c=current;while(c!==from){path.unshift(point(c));c=came.get(c);if(c===undefined)return [goal];}return path;}
 closed.add(current);const cx=current%N,cz=Math.floor(current/N);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=cx+dx,z=cz+dz,n=key(x,z);if(x<0||z<0||x>=N||z>=N||blocked.has(n)||closed.has(n))continue;if(dx&&dz&&(blocked.has(key(cx+dx,cz))||blocked.has(key(cx,cz+dz))))continue;const cost=g.get(current)+Math.hypot(dx,dz)*cell;if(cost<(g.get(n)??Infinity)){came.set(n,current);g.set(n,cost);if(!open.includes(n))open.push(n);}}}
 return [goal];
}
async function moveTo(goal,tolerance=2){let s=await read(),path=pathfind(s.player.pos,goal,s.world.obstacles,s.stage,s.player.pos.y),stuck=0,last=s.player.pos;
 for(let iteration=0;iteration<650;iteration++){
  s=await read();assert.equal(s.mode,'game',`Cannot move: ${s.mode} ${s.deathReason}`);
  const vertical=s.stage===1?goal.y-s.player.pos.y:0;
  if(dist(s.player.pos,goal)<tolerance&&Math.abs(vertical)<2)return;
  while(path.length>1&&dist(s.player.pos,path[0])<2.1)path.shift();const target=path[0]??goal;const dx=target.x-s.player.pos.x,dz=target.z-s.player.pos.z;
  const keys=[];if(Math.abs(dx)>.5)keys.push(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.5)keys.push(dz>0?'KeyS':'KeyW');if(vertical>1.3)keys.push('KeyQ');if(vertical< -1.3)keys.push('KeyC');
  await hold(keys,150);
  if(dist(last,s.player.pos)<.09)stuck++;else stuck=0;last=s.player.pos;
  if(stuck>8){path=pathfind(s.player.pos,goal,s.world.obstacles,s.stage,s.player.pos.y);await hold(['KeyS','KeyA'],350);stuck=0;}
 }
 throw Error(`Navigation failed to ${JSON.stringify(goal)}, from${JSON.stringify((await read()).player.pos)}`);
}
async function collectUntil(targetMeals){let noProgress=0;while((await read()).campaign.stageMeals<targetMeals){let s=await read();const food=s.world.resources.filter(r=>r.amount>=1&&s.stats.diet.includes(r.kind)).sort((a,b)=>dist(a.pos,s.player.pos)-dist(b.pos,s.player.pos))[0];assert(food,'Accessible food remains');await moveTo(food.pos,2.2);const before=s.player.meals;for(let i=0;i<8;i++){s=await read();if(s.campaign.stageMeals>=targetMeals)break;const available=s.world.resources.some(r=>r.amount>=1&&s.stats.diet.includes(r.kind)&&Math.hypot(r.pos.x-s.player.pos.x,r.pos.y-s.player.pos.y,r.pos.z-s.player.pos.z)<4.2);if(!available)break;await hold(['Space'],1200);}s=await read();if(s.player.meals===before)noProgress++;else noProgress=0;assert(noProgress<6,'Feeding progresses');}}
async function discover(){
 for(let i=0;i<3;i++){
  let s=await read();const patch=s.world.patches[i];
  if(!patch.discovered)await moveTo(patch.center,8);
  // Seeing a biome alone is insufficient: earn its field record by consuming
  // real compatible food inside its bounds through ordinary player inputs.
  for(let attempt=0;attempt<8;attempt++){
   s=await read();assert.equal(s.mode,'game',`Niche activity interrupted: ${s.mode}`);
   if(s.field.find(f=>f.patchId===patch.id)?.done)break;
   const food=s.world.resources.filter(r=>r.amount>=1&&s.stats.diet.includes(r.kind)&&dist(r.pos,patch.center)<patch.radius)
    .sort((a,b)=>dist(a.pos,s.player.pos)-dist(b.pos,s.player.pos))[0];
   assert(food,`Niche ${patch.name} retains compatible accessible food`);
   await moveTo(food.pos,1.8);
   await hold(['Space'],1250);
  }
  s=await read();assert(s.world.patches[i].discovered,`Niche ${patch.name} was physically explored`);
  assert(s.field.find(f=>f.patchId===patch.id)?.done,`Successful in-world foraging earned ${patch.name}'s field record`);
  await record('Earned niche livelihood: '+patch.name);
 }
}
async function editorAdd(kinds,name){await moveTo((await read()).world.landmarks[0].pos,4);await page.keyboard.press('Tab');assert.equal((await read()).mode,'editor');for(const kind of kinds)await page.click(`[data-action="add:${kind}"]`);if(name){await page.locator('[data-genome="name"]').fill(name);await page.locator('[data-genome="name"]').press('Tab');}await shot(`editor-stage-${(await read()).stage}-gen-${(await read()).player.generation+1}`);const before=(await read()).player.genome;await page.click('[data-action="confirm-editor"]');assert.equal((await read()).mode,'game','Evolution confirmed');assert.notDeepEqual((await read()).player.genome,before);await record('Legitimate evolution: '+kinds.join(','));}
async function findPartner(){for(let i=0;i<15;i++){const s=await read();const partner=s.world.creatures.filter(c=>['lantern','mender','gloom'].includes(c.species)).sort((a,b)=>dist(a.pos,s.player.pos)-dist(b.pos,s.player.pos))[0];if(!partner)return false;await moveTo(partner.pos,3);await hold(['KeyR'],200);if((await read()).player.bonds.length){await record('Live symbiosis established');return true;}}return false;}
try{
 await page.goto((process.env.LUMAVORA_URL??process.env.BASE_URL??'http://127.0.0.1:5173')+'/?test=1');await page.waitForSelector('#start-btn');await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(`${out}/legacy-initial.fixture.json`);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 const imported=await read();assert.equal(imported.tick,0);assert.equal(imported.stage,0);assert.equal(imported.player.meals,0);assert.deepEqual(imported.player,initial.player);await record('Imported untouched LEGACY initial state, seed481516, tick0');await shot('01-microworld');
 await collectUntil(4);await editorAdd(['symbiote'],'Luma · zahradník');
 await collectUntil(16);await editorAdd(['proboscis','spines']);
 await discover();await collectUntil(24);await findPartner();
 await shot('02-microworld-adapted');assert((await read()).requirements.every(r=>r.met));await moveTo((await read()).world.landmarks[1].pos,5);await page.keyboard.press('KeyG');assert.equal((await read()).stage,1);await record('Entered reefs through earned gate');await shot('03-reefs');
 await editorAdd(['gills','fins']);await collectUntil(24);await editorAdd(['lungs','legs']);await discover();await collectUntil(36);
 await shot('04-reefs-adapted');assert((await read()).requirements.every(r=>r.met));await moveTo((await read()).world.landmarks[1].pos,5);await page.keyboard.press('KeyG');assert.equal((await read()).stage,2);await record('Walked ashore with same evolved genome');await shot('05-shore');
 // Save/refresh round trip through user interface; original state and ecology must survive.
 await page.click('[data-action="save"]');const saved=await read();await page.reload();await page.waitForSelector('#start-btn');await page.click('[data-action="saves"]');await page.locator('[data-action^="load:"]').first().click();let restored=await read();assert.equal(restored.stage,2);assert.deepEqual(restored.player.genome,saved.player.genome);assert.deepEqual(restored.world.patches,saved.world.patches);await record('Save-refresh-load preserved genome and ecology');
 await page.keyboard.press('Escape');const paused=(await read()).tick;await page.evaluate(()=>advanceTime(5000));assert.equal((await read()).tick,paused);await page.setViewportSize({width:1024,height:768});await shot('06-pause-laptop');await page.click('[data-action="close"]');await page.setViewportSize({width:1600,height:1000});
 for(let i=0;i<3;i++){let s=await read();const spring=s.world.landmarks.find(l=>l.id===`spring-${i}`);await moveTo(spring.pos,3);while((await read()).world.landmarks.find(l=>l.id===spring.id).charge<10){s=await read();if(s.player.energy<35){await collectUntil(s.campaign.stageMeals+4);await moveTo(spring.pos,3);}await hold(['KeyT'],2100);}await record(`Restored spring ${i+1}`);await shot(`07-spring-${i+1}`);}
 assert.equal((await read()).campaign.won,true);assert.equal((await read()).campaign.finale,'restoration');await shot('08-finale');await record('Campaign completed by restoration without kills');await page.click('[data-action="sandbox"]');assert.equal((await read()).mode,'game');assert.equal((await read()).campaign.sandbox,true);await shot('09-sandbox');
 const full=await read();assert.equal(full.player.kills,0);assert.equal(errors.length,0,errors.join('\n'));
 await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',...provenance,seed:481516,realGameplayInputsOnly:true,wallSeconds:(Date.now()-started)/1000,simulationSeconds:full.tick/60,errors,browser:browser.version(),platform:process.platform,final:{stage:full.stage,genome:full.player.genome,campaign:full.campaign}},null,2));
}catch(error){await fs.writeFile(`${out}/failure.json`,JSON.stringify({status:'failed',...provenance,error:String(error),stack:error.stack,errors,log},null,2));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await context.tracing.stop({path:`${out}/campaign.trace.zip`});await browser.close();}
