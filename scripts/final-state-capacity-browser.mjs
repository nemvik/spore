/** Targeted regression fixture prepared OFFLINE by public game functions.
 * In-browser: public import, native RAF, real UI, public export/reload only.
 * This is not a new campaign/progression proof. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=path.resolve('evidence/final-campaign/review/capacity'),canonical=path.resolve('evidence/final-campaign/organism/active-campaign.save.json');
await mkdir(out,{recursive:true});const main=await readFile(canonical),source=await readFile('tests/fixtures/geography/sp-009c-buildings.save.json');
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame,serializeGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');
const {enableMobilization}=await ssr.ssrLoadModule('/src/game/mobilization.ts');
const {navigation,enterField,returnHome}=await ssr.ssrLoadModule('/src/game/planet-travel.ts');
const {planetAtlas}=await ssr.ssrLoadModule('/src/game/planet-geography.ts');await ssr.close();
const fixture=parseGame(source.toString());enableMobilization(fixture);returnHome(fixture);
const nav=navigation(fixture),atlas=planetAtlas(fixture.homePlanet),region=atlas.cells[atlas.anchors[2].cellId].regionId;
for(const cell of atlas.cells.filter(c=>c.surface==='land'&&c.regionId===region)){
 if(nav.fields.length===64)break;if(!nav.fields.some(f=>f.cellId===cell.id))enterField(fixture,cell.id);
}
returnHome(fixture);assert.equal(nav.fields.length,64);assert.equal(fixture.states.activated,null);
const input=path.join(out,'full-registry.fixture.json');await writeFile(input,serializeGame(fixture));parseGame(await readFile(input,'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1024,height:640},acceptDownloads:true}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=a=>page.locator(`button[data-action="${a}"]:visible`).first().click();
try{
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5220');await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
 assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 const assets=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
 await action('saves');await page.locator('#import-save').setInputFiles(input);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).states.clock.turn>=2,null,{timeout:45000});await action('pause');
 let observed=await read();assert.equal(observed.homePlanet.navigation.fields.length,66);
 assert.deepEqual(observed.homePlanet.navigation.fields.slice(0,64),fixture.homePlanet.navigation.fields);
 for(const state of observed.states.entries){assert.deepEqual(state.transactions.map(t=>t.action.kind),['found','defend']);assert.equal(state.reserve,300);}
 checks.push('Native 20-second rival turns pay for two founded cities and guards despite 64 earlier fields; all original worlds preserved');
 await action('saves');const pending=page.waitForEvent('download');await action('export');const exported=path.join(out,'paid-cities.fixture.json');await(await pending).saveAs(exported);
 const saved=parseGame(await readFile(exported,'utf8'));assert.equal(saved.homePlanet.navigation.fields.length,66);assert.deepEqual(saved.states,observed.states);
 await action('close');await action('atlas');
 assert.match(await page.locator('#ui').innerText(),/66 uložených míst.*64 výprav \+ 4 místa/);
 await page.getByText('66 uložených míst',{exact:false}).scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,'reserved-cities-1024.png')});
 const rival=saved.cities.entries.find(c=>c.founded.source==='state');await action('city-select:'+rival.id);await action('city-enter:'+rival.id);
 assert.equal((await read()).homePlanet.currentLocationId,rival.address.locationId);
 const frames=await page.evaluate(()=>new Promise(resolve=>{const rows=[];let previous=performance.now();function sample(now){rows.push(now-previous);previous=now;if(rows.length<90)requestAnimationFrame(sample);else resolve(rows);}requestAnimationFrame(sample);}));frames.sort((a,b)=>a-b);const raf={n:frames.length,p50:frames[45],p95:frames[85],max:frames.at(-1)};
 checks.push('The UI explains reserve capacity; a newly founded rival city can be entered');
 await action('pause');await action('saves');await page.locator('#import-save').setInputFiles(exported);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');await action('pause');await action('save');await action('saves');
 const load=await page.locator('button[data-action^="load:"]').first().getAttribute('data-action');await page.reload();await action('saves');await action(load);await action('pause');
 observed=await read();assert.equal(observed.homePlanet.navigation.fields.length,66);assert.deepEqual(observed.states.entries.map(r=>r.transactions),saved.states.entries.map(r=>r.transactions));
 checks.push('Public export/import/save/reload/load preserves fields and paid founding receipts');
 assert.deepEqual(errors,[]);assert.deepEqual(await readFile(canonical),main);
 await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,assets,raf,mainSHA256:createHash('sha256').update(main).digest('hex'),sourceSHA256:createHash('sha256').update(source).digest('hex'),mainPreserved:true,provenance:'Disclosed offline 64-field regression fixture derived with enterField from historical C save; no live state/time writes. Native 20-second browser continuation, paid founding, visit, public persistence.'},null,2));console.log(JSON.stringify({checks,errors}));
}catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,errors,state:await read().catch(()=>null)},null,2));throw error;}
finally{await context.close();await browser.close();}
