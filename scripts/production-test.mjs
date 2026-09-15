/** Real statically built app: no test clock, network/API dependence or debug setters. */
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync('/private/tmp/lumavora-browsers'))process.env.PLAYWRIGHT_BROWSERS_PATH='/private/tmp/lumavora-browsers';
const {chromium}=await import('playwright');
const base=process.env.PRODUCTION_URL??'http://127.0.0.1:4173',out=process.env.PRODUCTION_OUTPUT??'evidence/quality/regression/production-test';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(()=>{
 // Observe native Web Audio creation without changing graph routing or parameters.
 const Native=window.AudioContext;const measurement={contexts:[],gains:[],oscillators:[]};window.__audioEvidence=measurement;
 window.AudioContext=class extends Native{constructor(...args){super(...args);measurement.contexts.push(this);}createGain(){const g=super.createGain();measurement.gains.push(g);return g;}createOscillator(){const o=super.createOscillator();measurement.oscillators.push(o);return o;}};
});
const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(base).origin)external.push(r.url());});
const read=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const audio=()=>page.evaluate(()=>({states:__audioEvidence.contexts.map(c=>c.state),gains:__audioEvidence.gains.map(g=>g.gain.value),oscillatorCount:__audioEvidence.oscillators.length}));
try{
 await page.goto(base);await page.waitForSelector('#start-btn');assert.equal(await page.evaluate(()=>typeof advanceTime),'undefined');assert.equal((await audio()).states.length,0);
 await page.click('#start-btn');await page.waitForTimeout(250);const before=await read();const initialAudio=await audio();assert(initialAudio.states.includes('running'));assert(initialAudio.oscillatorCount>=4);
 await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');const moved=await read();assert(moved.player.pos.z<before.player.pos.z-1);await page.keyboard.down('Space');await page.waitForTimeout(1300);await page.keyboard.up('Space');assert((await read()).player.meals>0);assert((await audio()).oscillatorCount>initialAudio.oscillatorCount);
 await page.keyboard.press('Escape');const tick=(await read()).tick;await page.waitForTimeout(250);assert.equal((await read()).tick,tick);await page.locator('[data-setting="muted"]').check();assert.equal((await audio()).gains[0],0);await page.locator('[data-setting="muted"]').uncheck();assert((await audio()).gains[0]>0);
 await page.locator('[data-setting="quality"]').selectOption('low');await page.locator('[data-setting="reducedMotion"]').check();await page.click('[data-action="save"]');await page.reload();await page.click('[data-action="saves"]');await page.locator('[data-action^="load:"]').first().click();assert.equal((await read()).seed,481516);assert((await read()).player.meals>0);assert.equal(await page.evaluate(()=>lumavora_metrics().quality),'low');await page.keyboard.press('Escape');assert(await page.locator('[data-setting="reducedMotion"]').isChecked());await page.click('[data-action="close"]');
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:`${out}/static-game-laptop.png`});assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0);
 await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'passed',base,browser:browser.version(),debugTimeHookAbsent:true,realTimeMovementAndFeeding:true,pauseSaveRefreshLoad:true,settingsPersist:true,webAudio:{initial:initialAudio,mutingVerified:true,effectsCreated:true,note:'Native node/state/gain observation; not an auditory quality assessment.'},errors,external},null,2));
}catch(error){console.error(error);await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,external},null,2));await page.screenshot({path:`${out}/failure.png`});process.exitCode=1;}finally{await browser.close();}
