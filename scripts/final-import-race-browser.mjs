/** Public UI regression. Delay only File.text I/O; never mutate game state or time. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const out=path.resolve('evidence/final-campaign/review/import'),canonical=path.resolve('evidence/final-campaign/organism/active-campaign.save.json');
const main=await readFile(canonical),source=path.resolve('evidence/final-campaign/organism/04-cell-complete.save.json');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1024,height:640}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{
 const original=File.prototype.text;
 window.__fileReads=[];
 File.prototype.text=async function(){
  const row={name:this.name,release:null,settled:false};window.__fileReads.push(row);
  const text=await original.call(this);await new Promise(resolve=>{row.release=resolve;});row.settled=true;return text;
 };
});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=a=>page.locator(`button[data-action="${a}"]:visible`).first().click();
async function pending(file){
 const i=await page.evaluate(()=>window.__fileReads.length);
 await page.locator('#import-save').setInputFiles(file);
 await page.waitForFunction(i=>!!window.__fileReads[i]?.release,i);return i;
}
async function release(i){await page.evaluate(i=>window.__fileReads[i].release(),i);await page.waitForFunction(i=>window.__fileReads[i].settled,i);await page.waitForTimeout(200);}
async function openSaves(){if((await read()).mode==='game')await action('pause');await action('saves');}
async function fresh(seed){await action('close');await page.locator('#seed').fill(String(seed));await action('new');}
try{
 await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5220');await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
 assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
 const assets=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
 await openSaves();const stale=await pending(source);await fresh(700001);
 await release(stale);assert.equal((await read()).mode,'game');assert.equal((await read()).seed,700001);
 checks.push('Closing the old panel and starting a new lineage invalidates a successful pending import');
 await openSaves();const invalid=await pending({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});await action('close');
 await release(invalid);assert.equal((await read()).mode,'game');assert.equal((await read()).seed,700001);assert.equal(await page.locator('#import-save').count(),0);
 checks.push('A stale parse failure cannot render a saves modal over the active game');
 await openSaves();const reopened=await pending(source);await action('close');await openSaves();
 await release(reopened);assert.equal((await read()).mode,'saves');assert.equal((await read()).seed,700001);
 checks.push('Leaving and reopening the same panel does not revive an old import');
 const first=await pending(source),second=await pending({name:'invalid-newest.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
 await release(second);assert.equal((await read()).mode,'saves');assert.equal((await read()).seed,700001);
 const errorText=await page.locator('#ui').innerText();assert.match(errorText,/JSON|Poškozen|soubor|platn/i);
 await release(first);assert.equal((await read()).mode,'saves');assert.equal((await read()).seed,700001);
 checks.push('Only the latest selection may finish; its visible error survives an older valid import');
 const accepted=await pending(source);await release(accepted);assert.equal((await read()).mode,'game');assert.equal((await read()).seed,8675309);
 await action('pause');await openSaves();assert.equal(await page.locator('button[data-action^="load:"]').count(),2);
 for(const seed of [700001,8675309])assert.equal(await page.locator(`button[data-action^="load:line-${seed}-"]`).count(),1);
 checks.push('A current valid import still saves and loads normally; cancelled imports create no save slots');
 await page.screenshot({path:path.join(out,'final-1024.png')});assert.deepEqual(errors,[]);assert.deepEqual(await readFile(canonical),main);
 await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,assets,mainSHA256:createHash('sha256').update(main).digest('hex'),mainPreserved:true,provenance:'Isolated browser, native UI and real RAF. Controlled File.text completion only; no live state/clock injection and no campaign progression claim.'},null,2));
 console.log(JSON.stringify({checks,errors}));
}catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,errors,state:await read().catch(()=>null)},null,2));throw error;}
finally{await context.close();await browser.close();}
