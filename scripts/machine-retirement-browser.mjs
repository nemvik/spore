/** UI regression from an earned P2 export: reclaim a full fleet slot and replace it. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const output=path.resolve(process.env.RETIREMENT_OUTPUT??'evidence/era-p2/retirement');await mkdir(output,{recursive:true});
const url=new URL(process.env.LUMAVORA_URL??'http://127.0.0.1:5180');url.searchParams.set('test','1');
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]}),context=await browser.newContext({viewport:{width:1536,height:960},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({screenshots:true,snapshots:true});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function action(name){await page.locator(`[data-action="${name}"]`).first().click();await page.waitForTimeout(50);}
async function advance(ms){await page.evaluate(ms=>window.advanceTime(ms),ms);}
async function build(carrier){for(let i=0;(await read()).machines.resource<90&&i<100;i++)await advance(3000);await action('machine-editor:'+carrier);const before=await read(),draft=before.editor.draft,cost=before.editor.cost;await action('confirm-editor');const after=await read();assert.equal(after.mode,'game');assert.equal(after.machines.resource,before.machines.resource-cost);assert.deepEqual(after.machines.blueprints.at(-1).blueprint,draft);return {id:after.machines.fleet.at(-1).id,cost};}
try{
 await page.goto(url.href);await action('saves');await page.locator('#import-save').setInputFiles('tests/fixtures/saves/machines-restoration-final.save.json');await page.waitForTimeout(200);
 const initial=await read();assert.equal(initial.stage,4);let last;while((await read()).machines.fleet.length<8)last=await build('tank');await action('machine-select:'+last.id);assert.equal(await page.locator('[data-action="machine-editor:air"]').isDisabled(),true);assert.equal(await page.locator('[data-action="machine-retire"]').isEnabled(),true);await page.screenshot({path:path.join(output,'01-full-fleet.png')});
 const before=await read();await action('machine-retire');const after=await read();assert.equal(after.machines.fleet.length,7);assert.equal(after.machines.fleet.some(u=>u.id===last.id),false);assert.equal(after.machines.resource,before.machines.resource+Math.floor(last.cost*.35));assert.deepEqual(after.machines.blueprints,before.machines.blueprints);assert.deepEqual(after.player.genome,initial.player.genome);assert.equal(await page.locator('[data-action="machine-editor:air"]').isEnabled(),true);await page.screenshot({path:path.join(output,'02-slot-reclaimed.png')});
 const air=await build('air');await action('machine-select:'+air.id);const done=await read();assert.equal(done.machines.fleet.length,8);assert.equal(done.machines.blueprints.find(d=>d.id===done.machines.fleet.at(-1).blueprint).blueprint.carrier,'air');
 await action('pause');await action('saves');const [download]=await Promise.all([page.waitForEvent('download'),action('export')]);const save=path.join(output,'replacement.save.json');await download.saveAs(save);await page.locator('#import-save').setInputFiles(save);assert.deepEqual((await read()).machines,done.machines);await page.screenshot({path:path.join(output,'03-replacement-reloaded.png')});assert.deepEqual(errors,[]);
 await writeFile(path.join(output,'result.json'),JSON.stringify({status:'passed',policy:'Earned P2 export, actual UI construction/refund/replacement/save/import; DEV time steps. No browser simulation state writes.',initialFleet:initial.machines.fleet.length,full:8,reclaimed:7,replacement:8,retired:last,replacementAir:air,errors},null,2));
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({message:error.message,errors,state:await read().catch(()=>null)},null,2));throw error;}
finally{if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(output,'trace.zip')});await browser.close();}
