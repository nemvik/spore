/** Short native continuations of genuinely played saves. No state writes or test clock. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const out=path.resolve(process.env.LUMAVORA_EVIDENCE??'evidence/evolution-20260930/later');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const results=[],errors=[];let page,context;
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=name=>page.locator(`[data-action="${name}"]:visible`).first().click();
async function imported(file){
 if(context)await context.close();context=await browser.newContext({viewport:{width:1280,height:720},acceptDownloads:true});page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5220');await action('saves');await page.locator('#import-save').setInputFiles(path.resolve(file));
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');return read();
}
async function until(predicate,label){for(let i=0;i<1000;i++){const s=await read();assert.equal(s.mode,'game');assert.equal(s.deathReason,null);if(predicate(s))return s;await page.waitForTimeout(120);}throw Error('Native timeout: '+label);}
async function exported(name){await action('pause');await action('saves');const pending=page.waitForEvent('download');await action('export');const file=path.join(out,name+'.save.json');await(await pending).saveAs(file);await page.locator('#import-save').setInputFiles(file);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');return file;}
try{
 let s=await imported('tests/fixtures/evolution/creature-social-tribe-start.save.json');assert.equal(s.inheritance.route,'social');
 const n=s.tribe.neighbours[0];await action('tribe-all');await action(`tribe-focus:${n.id}`);await action(`tribe-socialize:${n.id}`);
 s=await until(v=>v.lineageHistory.usedEffects?.includes('creature'),'first inherited tribe diplomacy');
 assert.ok(s.tribe.neighbours[0].relation>n.relation);await page.screenshot({path:path.join(out,'tribe-effect.png')});
 const tribeSave=await exported('tribe-first-effect');assert.ok((await read()).lineageHistory.usedEffects.includes('creature'));
 results.push({name:'Real social tribe inheritance from recorded creature nests, first-use notice, export/import',save:tribeSave,relation:s.tribe.neighbours[0].relation});
 s=await imported('tests/fixtures/evolution/earned-civilization-budget.save.json');
 const incomeBefore=s.machines.resource,timeBefore=s.world.time;await page.waitForTimeout(1300);s=await read();
 const measured=(s.machines.resource-incomeBefore)/(s.world.time-timeBefore);assert.ok(Math.abs(measured-s.machineIncome)<1e-7);assert.ok(s.machineIncome>6);
 const city=s.cities.entries.find(c=>c.owner.kind==='state'),carrier=s.machines.fleet.find(u=>s.machines.blueprints.find(b=>b.id===u.blueprint).blueprint.carrier==='air');
 await page.keyboard.press('n');await action('city-select:'+city.id);await action('city-enter:'+city.id);await page.locator('#city-economy').waitFor();
 await action('commerce:open');s=await read();const contract=s.commerce.contracts.at(-1);
 const openCarriers=async()=>{const details=page.locator('.commerce-contract details').first();if(await details.getAttribute('open')===null)await details.locator('summary').click();};
 await openCarriers();await action(`commerce:batch-offer,${contract.id},${carrier.id}`);s=await read();const before=s.machines.resource;await action('commerce:confirm');s=await read();assert.equal(s.machines.resource,before-60);
 const delivery=v=>v.commerce.contracts.find(c=>c.id===contract.id).deliveries.at(-1);
 assert.equal(delivery(s).units,3);assert.ok((await page.locator('[data-commerce-progress]').innerText()).includes('dokončeno 0/3'));
 await action('commerce:abort');s=await until(v=>delivery(v).progress<=1e-8,'abort return');
 assert.ok((await page.locator('#commerce-status').innerText()).includes('vratku 60'));
 await action('commerce:dock');assert.equal((await read()).machines.resource,before);
 await openCarriers();await action(`commerce:batch-offer,${contract.id},${carrier.id}`);await action('commerce:confirm');
 await until(v=>delivery(v).progress>=delivery(v).route.length-1-1e-8,'batch outbound');await action('commerce:unload');
 await until(v=>delivery(v).progress<=1e-8,'batch return');await action('commerce:dock');
 s=await read();assert.equal(s.commerce.contracts.at(-1).deliveries.filter(d=>d.delivered).length,1);
 assert.ok((await page.locator('.commerce-contract').innerText()).includes('3/3'));await page.screenshot({path:path.join(out,'commerce-batch.png')});
 await action('trade:offer');await action('trade:confirm');s=await read();const receipt=s.cities.entries.find(c=>c.id===city.id).transfers.at(-1);assert.equal(receipt.credit,60);assert.equal(receipt.payment.after,receipt.payment.before-receipt.price+60);
 const tradeSave=await exported('batch-city-purchased');results.push({name:'Completed regional income, native batch abort/refund and one-trip escrow purchase',measuredIncome:measured,save:tradeSave,receipt});
 assert.deepEqual(errors,[]);
}catch(e){results.push({failure:String(e)});await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(e);process.exitCode=1;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({results,errors,provenance:'Public import of unchanged earned campaign saves, native UI and RAF only. No new full campaign or human acceptance claimed.'},null,2));await browser.close();}
