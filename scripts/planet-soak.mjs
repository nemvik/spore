/** Ten real active minutes in a disclosed P3 sandbox export. No test clock. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const output=path.resolve(process.env.PLANET_SOAK_OUTPUT??'evidence/era-p3/soak'),url=process.env.LUMAVORA_URL??'http://127.0.0.1:5181';await mkdir(output,{recursive:true});assert.ok(!url.includes('test='));
const source=path.resolve(process.env.PLANET_SOAK_SOURCE??'tests/fixtures/saves/stable-sandbox.save.json');
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]}),context=await browser.newContext({viewport:{width:1536,height:960},acceptDownloads:true}),page=await context.newPage(),errors=[],rounds=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));const action=async name=>{await page.locator(`[data-action="${name}"]`).first().click();await page.waitForTimeout(50);};let activeMs=0,activeTicks=0,editors=0,reloads=0;
async function burst(keys,ms){let before=await read();assert.equal(before.mode,'game');const start=Date.now();for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(ms);for(const key of keys)await page.keyboard.up(key);const after=await read();assert.equal(after.mode,'game');activeMs+=Date.now()-start;activeTicks+=after.tick-before.tick;assert.equal(after.planet.tScore,3);assert.equal(after.planet.toolOn,false);return after;}
async function travelTo(pos){for(let i=0;i<160;i++){const s=await read(),u=s.machines.fleet.find(v=>v.id===s.planet.activeMachine),dx=pos.x-u.pos.x,dz=pos.z-u.pos.z;if(Math.hypot(dx,dz)<2)return;const keys=[];if(Math.abs(dx)>.6)keys.push(dx>0?'d':'a');if(Math.abs(dz)>.6)keys.push(dz>0?'s':'w');await burst(keys,150);}throw Error('Failed physical travel');}
async function home(){await travelTo((await read()).tribe.huts.find(h=>h.kind==='shelter').pos);}
async function warmWorld(){
 // WebGL uploads each geometry lazily on its first visible render. Visit every
 // biome and show every direction before comparing renderer memory, otherwise
 // a new camera view looks like a leak even with an unchanged scene graph.
 for(const biome of (await read()).planet.biomes){await travelTo(biome.pos);await page.mouse.move(200,500);await page.mouse.down({button:'right'});await page.mouse.move(1400,500,{steps:40});await burst([],150);await page.mouse.move(200,500,{steps:40});await page.mouse.up({button:'right'});await burst([],150);}
 await home();await burst([],300);
}

async function capture(name){await page.screenshot({path:path.join(output,name+'.png')});}
try{
 await page.goto(url);await action('saves');await page.locator('#import-save').setInputFiles(source);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');let s=await read();const air=s.machines.fleet.find(u=>s.machines.blueprints.find(d=>d.id===u.blueprint).blueprint.carrier==='air');await action('planet-vehicle:'+air.id);await home();await capture('00-start');
 for(let round=1;activeMs<600000;round++){
  for(const keys of [['w'],['d'],['s'],['a']])await burst(keys,1800);await burst([],13000);await home();
  if(round%2===0){const before=await read();await page.locator('#world').click({position:{x:740,y:600}});await page.keyboard.press('Tab');assert.equal((await read()).mode,'editor');await page.locator('[data-genome="name"]').fill('Soak pracovní návrh');await page.locator('[data-action="undo"]').click();await page.locator('[data-action="redo"]').click();await action('cancel-editor');const after=await read();assert.deepEqual(after.machines.blueprints,before.machines.blueprints);assert.deepEqual(after.player.genome,before.player.genome);editors++;}
  if(round%3===0){await action('pause');const before=(await read()).tick;await page.waitForTimeout(300);assert.equal((await read()).tick,before);await page.setViewportSize({width:1366,height:768});await action('close');await burst([],500);await capture('laptop');await page.setViewportSize({width:1536,height:960});}
  if(round===4||round===6){await action('pause');await action('save');const saved=await read();await page.reload();await action('saves');await page.locator('[data-action^="load:"]').first().click();const loaded=await read();assert.equal(loaded.stage,5);assert.equal(loaded.planet.completed,true);assert.equal(loaded.planet.sandbox,true);assert.deepEqual(loaded.machines.blueprints,saved.machines.blueprints);reloads++;if(reloads===2)await warmWorld();}
  if(activeMs>=300000&&!rounds.some(r=>r.activeSeconds>=300)||activeMs>=600000)await warmWorld();
  const metrics=await page.evaluate(()=>{const m=window.lumavora_metrics();return {...m,samples:undefined};});s=await read();rounds.push({round,activeSeconds:activeMs/1000,tick:s.tick,resource:s.machines.resource,populations:s.planet.populations.map(c=>({key:c.key,abundance:c.abundance,vitality:c.vitality,nutrition:c.nutrition})),render:metrics});await writeFile(path.join(output,'progress.json'),JSON.stringify({activeMs,activeTicks,rounds,errors},null,2));console.log(JSON.stringify({round,activeSeconds:Math.round(activeMs/1000),geometries:metrics.geometries,errors:errors.length}));
 }
 await capture('final');assert.deepEqual(errors,[]);assert.ok(activeTicks>=30000);assert.ok(editors>=6);assert.ok(reloads>=2);const baseline=rounds.find(r=>r.activeSeconds>300),last=rounds.at(-1);assert.ok(last.render.geometries<=baseline.render.geometries+100);await writeFile(path.join(output,'result.json'),JSON.stringify({status:'passed',source,url,policy:'Normal real-time inputs; prepared P3 export, no advanceTime or simulation writes. Renderer is warmed through all biomes after the final reload, at baseline and before the final sample; +100 tolerates the measured +59 geometry growth of one actual living individual. Concurrent browsers mean this is stability evidence, not a GPU benchmark.',activeSeconds:activeMs/1000,simulatedSeconds:activeTicks/60,editors,reloads,baseline,last,errors,rounds},null,2));
}catch(error){await capture('failure').catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({message:error.message,activeSeconds:activeMs/1000,activeTicks,editors,reloads,rounds,errors,state:await read().catch(()=>null)},null,2));throw error;}
finally{await browser.close();}
