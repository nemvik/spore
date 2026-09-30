/** Isolated UI replay of an unchanged, genuinely earned land export.
 * This is layout verification, not new campaign progress. The live tribe stays paused.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const out=path.resolve('evidence/final-campaign/organism'),source=path.join(out,'13-creature-ready.save.json'),active=path.join(out,'active-campaign.save.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),input=await readFile(source),activeBefore=hash(await readFile(active));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1024,height:640}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const action=name=>page.locator(`[data-action="${name}"]`).first().click();
try {
  await page.goto(process.env.LUMAVORA_URL??'http://127.0.0.1:5220');await action('saves');await page.locator('#import-save').setInputFiles(source);
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='game');assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  assert.deepEqual((await read()).player.genome,JSON.parse(input).state.player.genome);
  for(const combat of [false,true]) {
    if(combat)await page.keyboard.press('KeyB');
    const buttons=await page.locator('.species-controls .species-actions button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {label:n.textContent,x:r.x,y:r.y,width:r.width,height:r.height};}));
    assert.equal(buttons.length,4);assert.ok(buttons.every(b=>Math.abs(b.y-buttons[0].y)<1&&b.width>90&&b.x>=0&&b.x+b.width<=1024));
    const panel=await page.locator('.species-controls').boundingBox();assert.ok(panel.height<175&&panel.y>365&&panel.y+panel.height<550,JSON.stringify(panel));
    await page.screenshot({path:path.join(out,combat?'creature-combat-controls-1024-r3.png':'creature-controls-1024-r3.png')});checks.push({combat,panel,buttons});
  }
  assert.deepEqual(errors,[]);assert.equal(hash(await readFile(active)),activeBefore);
  await writeFile(path.join(out,'compact-controls-results.json'),JSON.stringify({input:'13-creature-ready.save.json',inputSha256:hash(input),activeUntouched:activeBefore,nativeRAF:true,stateWrites:false,checks,errors},null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,errors,activeUntouched:activeBefore}));
}finally{await browser.close();}
