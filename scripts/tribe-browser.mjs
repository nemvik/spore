/** Prepared coastal entry; every tribe action is a normal UI input. This is not a full campaign run. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const OUTPUT=path.resolve(process.env.TRIBE_OUTPUT??'evidence/era-p1/browser');
const url=new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5180');url.searchParams.set('test','1');
await mkdir(OUTPUT,{recursive:true});
const errors=[],timeline=[],shots=[];
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const fixture=parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));
fixture.player.genome.name='Kmen paměti přílivu';
fixture.checkpoint=null;
const fixturePath=path.join(OUTPUT,'prepared-coast.fixture.json');await writeFile(fixturePath,serializeGame(fixture));
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1536,height:960},acceptDownloads:true});
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function frames(n=3){for(let i=0;i<n;i++)await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));}
async function action(name){timeline.push(name);await page.locator(`[data-action="${name}"]`).first().click();await frames();}
async function advance(ms){await page.evaluate(ms=>window.advanceTime(ms),ms);await frames();}
async function capture(name){const filename=path.join(OUTPUT,name+'.png');await page.screenshot({path:filename});shots.push(filename);}
async function select(ids){await action(`tribe-select:${ids[0]}`);if(ids.length>1){await page.keyboard.down('Shift');for(const id of ids.slice(1))await action(`tribe-select:${id}`);await page.keyboard.up('Shift');}assert.deepEqual((await read()).commandSelection.map(u=>u.id),ids);}
async function screen(kind,id){const s=await read(),p=s.commandTargets.find(v=>v.target.kind===kind&&v.target.id===id)?.screen;if(!p||p.x<1||p.x>99||p.y<1||p.y>99)return null;const point={x:p.x*15.36,y:p.y*9.6};return await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',point)?point:null;}
async function clickWorld(kind,id,button='left'){const point=await screen(kind,id);assert.ok(point,`${kind} ${id} must be visible and uncovered`);await page.mouse.click(point.x,point.y,{button});await frames();}
async function gather(minFood){await action('tribe-home');await page.waitForTimeout(450);let rounds=0;
 while((await read()).tribe.food<minFood&&rounds++<30){const s=await read();const candidates=s.world.resources.filter(r=>['algae','mineral','detritus'].includes(r.kind)&&r.amount>=1).sort((a,b)=>Math.hypot(a.pos.x,a.pos.z-4)-Math.hypot(b.pos.x,b.pos.z-4));let chosen;
  for(const r of candidates)if(await screen('food',r.id)){chosen=r;break;}
  assert.ok(chosen,'A compatible visible source is required');await clickWorld('food',chosen.id,'right');
  const ordered=(await read()).tribe.members.filter(u=>(s.commandSelection.some(v=>v.id===u.id))).some(u=>u.orders[0]?.kind==='gather');assert.ok(ordered,'Right click must issue gathering');
  await advance(22000);
 }
 assert.ok((await read()).tribe.food>=minFood,'Gatherers must physically deliver sufficient food');
}
async function build(tool){const before=await read();await action(`tribe-build:${tool}`);let placed=false;
 for(const [x,y] of [[1040,650],[1020,420],[550,500],[620,630],[970,700],[670,310]]){await page.mouse.click(x,y);await frames();if((await read()).tribe.huts.length>before.tribe.huts.length){placed=true;break;}}
 assert.ok(placed,'A clear building site must be chosen with the cursor');const fresh=(await read()).tribe.huts.at(-1);assert.equal(fresh.progress,0);assert.equal((await read()).tribe.food,before.tribe.food-(tool==='shelter'?18:22));
 await advance(4000);const partial=await read();await capture(`construction-${tool}`);
 await exportAndReload(`construction-${tool}`);await advance(25000);assert.equal((await read()).tribe.huts.find(h=>h.id===fresh.id).progress,1);
 if(tool!=='shelter')assert.ok((await read()).tribe.unlocked.includes(tool));
}
async function exportAndReload(name){const before=await read();await action('pause');await action('saves');const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const filename=path.join(OUTPUT,name+'.save.json');await download.saveAs(filename);const saved=parseGame(await readFile(filename,'utf8'));assert.deepEqual(saved.tribe,before.tribe);await page.locator('#import-save').setInputFiles(filename);await frames();assert.deepEqual((await read()).tribe,before.tribe);assert.equal((await read()).commandSelection.length,0);return saved;}
async function enter(){await page.goto(url.href);await action('saves');await page.locator('#import-save').setInputFiles(fixturePath);await action('continue-era');await page.waitForTimeout(600);const s=await read();assert.equal(s.tribe.version,2);assert.equal(s.tribe.members.length,4);assert.equal(s.tribe.members.filter(u=>u.species).length,fixture.player.bonds.length);assert.deepEqual(s.player.genome,fixture.player.genome);return s;}
try{
 for(const route of ['alliance','conquest']){
  let s=await enter();const ids=s.tribe.members.filter(u=>!u.species).map(u=>u.id);
  await capture(`${route}-entry`);
  await clickWorld('member',ids[0]);await page.keyboard.press('Tab');assert.equal(await page.locator('.tribe-selection').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action="tribe-stop"]').evaluate(el=>el===document.activeElement),true);assert.deepEqual((await read()).commandSelection.map(u=>u.id),[ids[0]]);
  const points=await Promise.all(ids.map(id=>screen('member',id)));assert.ok(points.every(Boolean));
  await page.mouse.move(Math.min(...points.map(p=>p.x))-18,Math.min(...points.map(p=>p.y))-18);await page.mouse.down();await page.mouse.move(Math.max(...points.map(p=>p.x))+18,Math.max(...points.map(p=>p.y))+18,{steps:6});await page.mouse.up();await frames();assert.deepEqual((await read()).commandSelection.map(u=>u.id),ids);
  await page.mouse.click(950,650,{button:'right'});await frames();assert.ok((await read()).tribe.members.filter(u=>ids.includes(u.id)).every(u=>u.orders[0]?.kind==='move'));await advance(6000);
  await select(ids);await gather(75);await capture(`${route}-gathered`);
  await build(route==='alliance'?'drum':'spear');await select(ids);await action(`tribe-equip:${route==='alliance'?'drum':'spear'}`);assert.ok((await read()).tribe.members.filter(u=>ids.includes(u.id)).every(u=>u.tool===(route==='alliance'?'drum':'spear')));
  await capture(`${route}-equipped`);
  for(const n of (await read()).tribe.neighbours){await action(`tribe-focus:${n.id}`);await action(`tribe-${route==='alliance'?'socialize':'attack'}:${n.id}`);let attempts=0;
   while(!(await read()).tribe.neighbours.find(x=>x.id===n.id).resolved&&attempts++<40){await advance(5000);assert.equal((await read()).mode,'game');}
   s=await read();assert.equal(s.tribe.neighbours.find(x=>x.id===n.id).resolved,route==='alliance'?'allied':'conquered',JSON.stringify(s.tribe));await capture(`${route}-${n.identity}`);
  }
  s=await read();assert.equal(s.tribe.completed,true);assert.ok(s.tribe.members.length);assert.equal(s.campaign.finale,'restoration');assert.deepEqual(s.player.genome,fixture.player.genome);
  await exportAndReload(`${route}-completed`);await capture(`${route}-reloaded`);
  timeline.push({route,tick:s.tick,food:s.tribe.food,members:s.tribe.members.length});
  if(route==='conquest'){
   await select(ids);await gather(190);await build('shelter');await select(ids);await build('shelter');
   while((await read()).tribe.members.length<12)await action('tribe-recruit');
   await action('tribe-all');await capture('twelve-members');assert.equal((await read()).tribe.members.length,12);
   await exportAndReload('twelve-members');
   const live=new URL(url);live.searchParams.delete('test');await page.goto(live.href);await action('saves');await page.locator('#import-save').setInputFiles(path.join(OUTPUT,'twelve-members.save.json'));await action('tribe-all');
   await page.waitForTimeout(6000);await capture('twelve-members-live');const metrics=await page.evaluate(()=>window.lumavora_metrics());const times=metrics.samples.sort((a,b)=>a-b);const stats={...metrics,samples:undefined,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],frames:times.length};assert.ok(times.length>30);await writeFile(path.join(OUTPUT,'twelve-members-metrics.json'),JSON.stringify(stats,null,2));
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(path.join(OUTPUT,'results.json'),JSON.stringify({status:'passed',errors,timeline,shots},null,2));console.log(JSON.stringify({status:'passed',errors,timeline:timeline.filter(x=>typeof x==='object')},null,2));
}catch(error){await capture('failure').catch(()=>{});await writeFile(path.join(OUTPUT,'failure-state.json'),JSON.stringify(await read().catch(()=>null),null,2));await writeFile(path.join(OUTPUT,'results.json'),JSON.stringify({status:'failed',message:error.message,errors,timeline,shots},null,2));throw error;}
finally{if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(OUTPUT,'trace.zip')});await browser.close();await ssr.close();}
