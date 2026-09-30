/** Native continuation of the current fresh campaign: paid domestic machines.
 * Observations and real UI orders only. No prepared state or accelerated time.
 */
import assert from 'node:assert/strict';
import {appendFile,mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const phase=process.argv[2]??'status',root=path.resolve('evidence/final-campaign'),out=path.join(root,'civilization');await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.FRESH_CDP_PORT??9223}`),page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5220').origin));assert.ok(page);
page.setDefaultTimeout(10000);const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const compact=s=>({stage:s.stage,mode:s.mode,tick:s.tick,resource:s.machines?.resource,elapsed:s.machines?.elapsed,fleet:s.machines?.fleet,springs:s.machines?.springs,regions:s.machines?.regions,completed:s.machines?.completed,deathReason:s.deathReason});
async function log(event,extra={}){const entry={event,wall:new Date().toISOString(),...compact(await read()),...extra};await appendFile(path.join(out,'segments.jsonl'),JSON.stringify(entry)+'\n');console.log(JSON.stringify(entry));}
async function action(name){const b=page.locator(`[data-action="${name}"]:visible`).first();await b.scrollIntoViewIfNeeded();await b.press('Enter');}
async function resume(){if((await read()).mode==='pause')await action('close');assert.equal((await read()).mode,'game');}
async function pause(){if((await read()).mode==='game')await action('pause');}
async function until(predicate,label,seconds=180){const start=Date.now();let last=start;while(Date.now()-start<seconds*1000){const s=await read();assert.equal(s.mode,'game',label);assert.equal(s.deathReason,null);if(predicate(s))return s;if(Date.now()-last>20000){await log('native-progress',{label});last=Date.now();}await page.waitForTimeout(180);}throw Error('Native timeout: '+label);}
async function exported(name){
  await pause();const response=await fetch(`http://127.0.0.1:${process.env.FRESH_CONTROL_PORT??9225}`,{method:'POST',body:JSON.stringify({command:'export',args:{name}})});assert.ok(response.ok,await response.text());
  const source=path.join(root,'organism',name+'.save.json'),bytes=await readFile(source);await writeFile(path.join(out,name+'.save.json'),bytes);await writeFile(path.join(root,'organism/active-campaign.save.json'),bytes);await unlink(source);
  await log('public-export',{file:name+'.save.json',sha256:createHash('sha256').update(bytes).digest('hex')});
}
const carrier=(s,kind)=>s.machines.fleet.find(u=>s.machines.blueprints.find(b=>b.id===u.blueprint).blueprint.carrier===kind);
async function build(kind) {
  await resume();const before=await read();assert.equal(before.stage,4);assert.ok(!carrier(before,kind));await action('machine-editor:'+kind);
  await page.locator('[data-genome="name"]').fill(kind==='tank'?'Kořenový poutník':'Křídlo Jasnozrnky');await page.locator('[data-genome="name"]').press('Tab');
  const hue=page.locator('[data-genome="hue"]');await hue.focus();await hue.press('Home');for(let i=0;i<205;i++)await hue.press('ArrowRight');await hue.press('Tab');
  await page.locator('[data-genome="pattern"]').selectOption('2');const draft=(await read()).editor.draft,cost=(await read()).editor.cost;
  assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(),false);await page.screenshot({path:path.join(out,kind+'-editor.png')});await action('confirm-editor');
  const after=await read(),u=carrier(after,kind);assert.ok(u);assert.deepEqual(after.machines.blueprints.find(b=>b.id===u.blueprint).blueprint,draft);
  // Real spring income can accrue for the handful of native frames after confirmation.
  const income=after.machineIncome??0,elapsed=after.machines.elapsed-before.machines.elapsed;
  assert.ok(Math.abs(after.machines.resource-(before.machines.resource-cost+income*elapsed))<1e-5);
  await action('machine-select:'+u.id);await log('actual-machine-purchase',{kind,id:u.id,paid:cost});await exported('22-'+kind+'-built');
}
async function spring(index){
  await resume();let s=await read();const u=carrier(s,'tank'),spring=s.machines.springs[index];assert.ok(u&&spring.owner==='neutral');
  await action('machine-select:'+u.id);await action('machine-capture:'+spring.id);await until(v=>v.machines.springs[index].owner==='player','spring '+index,120);
  const before=await read();await page.waitForTimeout(3100);s=await read();const seconds=s.machines.elapsed-before.machines.elapsed,actual=(s.machines.resource-before.machines.resource)/seconds;
  assert.ok(Math.abs(actual-s.machineIncome)<1e-7);assert.equal(s.tribeInheritance.income,1.2);await log('actual-spring-income',{index,seconds,observedRate:actual,baseRate:s.machines.springs.filter(p=>p.owner==='player').reduce((n,p)=>n+p.rate,0)});
  await exported('23-spring-'+index);
}
async function region(index){
  await resume();const s=await read(),r=s.machines.regions[index],u=carrier(s,r.airOnly?'air':'tank');assert.ok(u&&r.owner==='neutral');
  await action('machine-select:'+u.id);await action('machine-focus:region:'+r.id);await action('machine-region:'+r.id);
  await until(v=>v.machines.regions[index].owner==='player','region '+r.identity,240);const after=await read();assert.equal(after.machines.regions[index].method,'restoration');assert.equal(after.machines.regions[index].settlers,2);
  await log('actual-region-restoration',{identity:r.identity});await exported('24-region-'+index);
}
try{
  await page.setViewportSize({width:1280,height:720});assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  if(phase==='status')console.log(JSON.stringify(compact(await read()),null,2));
  else if(phase==='build')await build(process.argv[3]??'tank');
  else if(phase==='spring')await spring(Number(process.argv[3]??0));
  else if(phase==='region')await region(Number(process.argv[3]??0));
  else throw Error('Unknown machine phase '+phase);
}catch(error){await pause().catch(()=>{});await log('operation-failed',{phase,message:String(error)}).catch(()=>{});await exported('machines-failure-continuation').catch(()=>{});console.error(error);process.exit(1);}
await pause();process.exit(0);
