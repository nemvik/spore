/** Prepared land fixture, then actual feeding/tending inputs. This does not prove a fresh campaign. */
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync('/private/tmp/lumavora-browsers'))process.env.PLAYWRIGHT_BROWSERS_PATH='/private/tmp/lumavora-browsers';
const {chromium}=await import('playwright');
const out=process.env.CLIMATE_OUTPUT??'evidence/quality/regression/climate-browser';await fs.mkdir(out,{recursive:true});
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
const {createGame,evolve,tryTransition,makeCheckpoint}=await server.ssrLoadModule('/src/game/simulation.ts');
const {serializeGame}=await server.ssrLoadModule('/src/game/persistence.ts');
const s=createGame(20260913,true);s.id='fixture-drought-causality';
while(s.stage<2){s.player.dna=1000;s.player.totalDna=2000;let g=structuredClone(s.player.genome);if(s.stage===1)for(const kind of ['legs','lungs'])g.parts.push({id:kind,kind,axial:-.1,angle:1.25,scale:1,mirrored:kind==='legs'});assert(evolve(s,g).ok);assert(evolve(s,g).ok);s.campaign.stageMeals=50;s.player.meals+=50;s.world.patches.forEach(p=>{p.discovered=true;s.campaign.discoveries.push(`${s.stage}:${p.id}`);s.campaign.journals.push(`field:${s.stage}:${p.id}:prepared`);});s.player.pos={...s.world.landmarks[1].pos};assert(tryTransition(s));}
s.campaign.drought=1;s.player.pos={...s.world.landmarks[2].pos};s.player.energy=100;s.player.moisture=40;s.player.invulnerable=10;s.world.creatures=s.world.creatures.filter(c=>Math.hypot(c.pos.x-s.player.pos.x,c.pos.z-s.player.pos.z)>15);
s.world.resources.push({id:s.world.nextId++,kind:'algae',pos:{...s.player.pos,x:s.player.pos.x+2},amount:10,max:10,patch:0,regen:.004});s.messages=[];makeCheckpoint(s);await fs.writeFile(`${out}/dry.fixture.json`,serializeGame(s));await server.close();
if(process.argv.includes('--prepare-only')){console.log('Validated prepared legacy drought save; no browser launched.');process.exit(0);}
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=metal']});const ctx=await browser.newContext({viewport:{width:1600,height:1000}});if(process.env.LUMAVORA_TRACE==='1')await ctx.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
async function importSave(file){await page.goto('http://127.0.0.1:5173/?test=1');await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(file);await page.waitForSelector('#organism-name');await page.waitForTimeout(500);}
async function shot(name){await page.waitForTimeout(250);await page.screenshot({path:`${out}/${name}.png`});await fs.writeFile(`${out}/${name}.json`,JSON.stringify(await read(),null,2));}
async function hold(key,ms){await page.keyboard.down(key);await page.evaluate(ms=>advanceTime(ms),ms);await page.keyboard.up(key);}
try{
 await importSave(`${out}/dry.fixture.json`);await page.evaluate(()=>advanceTime(1000));const dry=await read();assert(dry.player.moisture<40);assert.equal(dry.climate.springs[0].water,0);await shot('01-dry-spring');
 for(let i=0;i<10;i++){if((await read()).player.energy<30)await hold('Space',3600);await hold('KeyT',2100);}
 const restored=await read();assert.equal(restored.world.landmarks[2].charge,10);assert.equal(restored.climate.springs[0].water,1);assert(restored.player.moisture>dry.player.moisture);assert(restored.world.patches[0].fertility>dry.world.patches[0].fertility);await shot('02-restored-oasis');
 await page.keyboard.press('Escape');await page.click('[data-action="saves"]');const download=page.waitForEvent('download');await page.click('[data-action="export"]');await(await download).saveAs(`${out}/restored.export.json`);await importSave(`${out}/restored.export.json`);const loaded=await read();assert.deepEqual(loaded.climate,restored.climate);assert.deepEqual(loaded.world.patches,restored.world.patches);assert.deepEqual(loaded.player.genome,restored.player.genome);await shot('03-reloaded-oasis');assert.equal(errors.length,0,errors.join('\n'));
 await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',campaignRules:'legacy',freshCurrentCampaign:false,acceleratedTimeStepping:true,preparedFixture:true,realActions:{tend:10,feed:'as needed below30energy'},dry:{moisture:dry.player.moisture,climate:dry.climate,fertility:dry.world.patches[0].fertility},restored:{moisture:restored.player.moisture,climate:restored.climate,fertility:restored.world.patches[0].fertility},sameClimateAfterImport:true,errors},null,2));
}catch(error){console.error(error);await shot('failure');process.exitCode=1;}finally{if(process.env.LUMAVORA_TRACE==='1')await ctx.tracing.stop({path:`${out}/climate.trace.zip`});await browser.close();}
