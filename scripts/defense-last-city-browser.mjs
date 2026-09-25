/** SP-009.F actual E continuation; no live writes/time shim. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=path.resolve(process.env.DEFENSE_OUTPUT??'evidence/sp-009f/last-city'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5213';
await mkdir(out,{recursive:true});
const ssr=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
const {parseGame}=await ssr.ssrLoadModule('/src/game/persistence.ts');await ssr.close();
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const city=s=>s.cities.entries.find(c=>c.address.locationId===s.homePlanet.currentLocationId);
const action=async name=>page.locator(`button[data-action="${name}"]:visible`).first().click();
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const check=label=>{checks.push(label);console.log(label);};
async function imported(file,expected='game'){await page.goto(base);await action('saves');await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(mode=>JSON.parse(window.render_game_to_text()).mode===mode,expected);assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();}
async function exported(name){if((await read()).mode==='game')await action('pause');if(!await page.locator('#import-save').count())await action('saves');const [dl]=await Promise.all([page.waitForEvent('download'),action('export')]);const file=path.join(out,name+'.save.json');await dl.saveAs(file);return {file,state:parseGame(await readFile(file,'utf8'))};}
async function visit(id){if((await read()).navigation.mode!=='global')await page.keyboard.press('n');await page.locator('#travel-map').waitFor();await action('city-select:'+id);await action('city-enter:'+id);await page.locator('#city-economy').waitFor();}
try{
 // Explicit synthetic variant: remove A's player-founded city and its old checkpoint OFFLINE.
 // This is a last-city setup, NOT a claim that A disappeared in the real E campaign.
 const raw=JSON.parse(await readFile('tests/fixtures/geography/sp-009e-military.save.json','utf8'));
 raw.state.cities.entries=raw.state.cities.entries.filter(c=>c.founded.source!=='player');raw.state.cities.selectedId=raw.state.cities.entries.find(c=>c.capture).id;raw.state.checkpoint=null;raw.state.id='line-prepared-f-last-city';
 const file=path.join(out,'prepared-last-city.save.json');await writeFile(file,JSON.stringify(raw));parseGame(await readFile(file,'utf8'));
 let s=await imported(file),target=s.cities.entries.find(c=>c.capture).id;assert.equal(s.cities.entries.filter(c=>c.owner.kind==='lineage').length,1);if(s.navigation.mode==='global')await page.keyboard.press('n');await visit(target);await action('military:camera');await page.setViewportSize({width:1024,height:640});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).cities.entries.every(c=>c.owner.kind==='state'),null,{timeout:90000});
 await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('last-city-lost-1024');const lost=await exported('last-city-lost');await action('close');check('Prepared single-player-city input: real finite-funded attack damages/occupies last city; zero player cities with no free replacement');
 await action('travel-home');s=await read();const resource=s.machines.resource;await page.waitForFunction(v=>JSON.parse(window.render_game_to_text()).machines.resource>Math.max(v+2,32),resource,{timeout:30000});await action('machine-select:12');await action('machine-repair');assert.equal((await read()).machines.fleet.find(u=>u.id===12).health,88);await visit(target);await action('military:deploy,12');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment.phase==='field',null,{timeout:30000});await action('military:camera');await action('military:attack');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.raids[0].phase==='destroyed',null,{timeout:60000});await action('military:occupy');await page.waitForFunction(id=>JSON.parse(window.render_game_to_text()).cities.entries.find(c=>c.id===id).owner.kind==='lineage',target,{timeout:30000});
 await action('city-econ:fund');await action('city-econ:confirm');await action('military:retreat');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).military.deployment===null,null,{timeout:60000});await action('city-camera');await page.locator('.city-panel, .field-panel').evaluateAll(es=>es.forEach(e=>e.scrollTop=0));await shot('last-city-reclaimed-1024');const final=await exported('active-campaign');await imported(final.file);assert.equal(city(await read()).transfers.length,2);assert.equal((await read()).cities.entries.filter(c=>c.owner.kind==='lineage').length,1);check('Native continuation with zero cities: original springs earn, original tank repair paid, real recapture, economic command, return and file reimport');
 assert.equal(errors.length,0,errors.join('\n'));await writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,prepared:'Synthetic last-city input made OFFLINE from E: remove the player-founded A city and old checkpoint; preserve machines, springs, reserves, rival receipts and E capture. This setup is not historical E migration or a played disappearance of A. All F attack, damage, loss and recapture are ordinary UI/native time with no live writes.',build:await page.locator('script[type=module]').getAttribute('src'),lost:lost.file},null,2));
}catch(error){await shot('failure');await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,state:await read()},null,2));throw error;}finally{await browser.close();}
