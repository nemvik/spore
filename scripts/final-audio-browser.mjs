/** Ordinary settings/editor UI with passive Web Audio observations. No live
 * state setters, clock injection or edits to the main played campaign. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const out=path.resolve(process.env.LUMAVORA_EVIDENCE??'evidence/final-campaign/audio'),base=process.env.LUMAVORA_URL??'http://127.0.0.1:5220';
const canonical=path.resolve('evidence/final-campaign/organism/active-campaign.save.json'),protectedBytes=await readFile(canonical);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:process.platform==='darwin'?['--use-gl=angle','--use-angle=metal']:[]});
const context=await browser.newContext({viewport:{width:1024,height:640}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
  const events=[],nodes=new WeakMap(),all=[];let next=0;
  window.__audioEvidence=events;
  window.__audioSnapshot=()=>all.map(node=>({id:nodes.get(node),gain:node.gain?.value,time:node.context.currentTime,state:node.context.state}));
  for(const method of ['createOscillator','createGain']){
    const original=AudioContext.prototype[method];
    AudioContext.prototype[method]=function(...args){
      const node=original.apply(this,args),id=next++;nodes.set(node,id);all.push(node);
      events.push({kind:method,id,at:this.currentTime});
      for(const operation of method==='createOscillator'?['start','stop','connect','disconnect']:['connect','disconnect']){
        const call=node[operation];node[operation]=function(...values){events.push({kind:operation,id,args:values.map(v=>typeof v==='number'?v:nodes.get(v)??null),at:node.context.currentTime});return call.apply(this,values);};
      }
      if(method==='createOscillator')node.addEventListener('ended',()=>events.push({kind:'ended',id,at:node.context.currentTime}));
      return node;
    };
  }
});
const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const observed=()=>page.evaluate(()=>window.__audioEvidence);
const action=a=>page.locator(`button[data-action="${a}"]:visible`).first().click();
async function slider(name,value){
  const input=page.locator(`[data-setting="${name}"]`);await input.focus();await input.press('Home');
  for(let i=0;i<Math.round(value/.05);i++)await input.press('ArrowRight');assert.equal(Number(await input.inputValue()),value);
}
async function editor(){await action('editor');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='editor');}
async function silent(label,configure){
  await action('pause');await configure();await action('close');const before=(await observed()).filter(e=>e.kind==='stop').length;
  await editor();assert.equal((await observed()).filter(e=>e.kind==='stop').length,before,label);await action('cancel-editor');checks.push(label);
}
try{
  await page.goto(base);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');
  const assets=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
  await action('pause');await slider('effects',0);await action('close');await page.locator('#seed').fill('8675310');await action('new');
  const before=(await observed()).filter(e=>e.kind==='stop').length;await editor();assert.equal((await observed()).filter(e=>e.kind==='stop').length,before);await action('cancel-editor');checks.push('Actual editor click with effects0 schedules no effect');
  await action('pause');await slider('effects',.4);await action('close');const start=(await observed()).length;await editor();
  await page.waitForFunction(()=>window.__audioEvidence.some(e=>e.kind==='ended'));
  const played=(await observed()).slice(start),stopped=played.filter(e=>e.kind==='stop');assert.equal(stopped.length,1);assert.ok(played.some(e=>e.kind==='ended'&&e.id===stopped[0].id));
  assert.equal(played.filter(e=>e.kind==='disconnect').length,2);checks.push('Enabled native click ends and disconnects oscillator and gain');await action('cancel-editor');
  const pendingStart=(await observed()).length;await editor();await action('cancel-editor');await action('pause');
  await page.waitForFunction(()=>window.__audioSnapshot()[0].state==='suspended');
  const pending=(await observed()).slice(pendingStart),note=pending.find(e=>e.kind==='stop');assert.ok(note);
  const paused=await page.evaluate(()=>window.__audioSnapshot());assert.ok(note.args[0]>paused[0].time,'Pause must catch an unfinished real note');
  const noteGain=pending.find(e=>e.kind==='connect'&&e.id===note.id).args[0];
  const bus=pending.find(e=>e.kind==='connect'&&e.id===noteGain).args[0];
  assert.ok(paused.find(n=>n.id===bus).gain>0);
  await slider('effects',0);assert.equal((await page.evaluate(()=>window.__audioSnapshot())).find(n=>n.id===bus).gain,0);
  await action('close');assert.equal((await page.evaluate(()=>window.__audioSnapshot())).find(n=>n.id===bus).gain,0);
  await page.waitForFunction(id=>window.__audioEvidence.some(e=>e.kind==='ended'&&e.id===id),note.id);
  checks.push('Effects0 during pause silences the shared output of an already scheduled note after resume');
  await silent('Master0 schedules no effect',async()=>{await slider('effects',.4);await slider('master',0);});
  await silent('Mute schedules no effect',async()=>{await slider('master',.65);await page.locator('[data-setting="muted"]').check();});
  await action('pause');await page.locator('[data-setting="muted"]').uncheck();await slider('effects',0);await page.screenshot({path:path.join(out,'effects-disabled-1024.png')});
  for(const width of [1024,1280]){
    await page.setViewportSize({width,height:640});
    assert.equal(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Pause panel must not overflow horizontally');
    for(const command of ['save','saves','library','building-open','vehicle-open','ship-open','help']){
      const control=page.locator(`.pause-actions button[data-action="${command}"]`);await control.scrollIntoViewIfNeeded();
      const box=await control.boundingBox(),panel=await page.locator('.modal').boundingBox();
      assert.ok(box.x>=panel.x&&box.x+box.width<=panel.x+panel.width&&box.y>=panel.y&&box.y+box.height<=panel.y+panel.height);
    }
    if(width===1024)await page.screenshot({path:path.join(out,'pause-actions-1024.png')});
  }
  checks.push('All seven pause actions fit horizontally and remain reachable at 1024 and 1280 pixels');
  assert.deepEqual(errors,[]);assert.deepEqual(await readFile(canonical),protectedBytes);
  await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,assets,events:await observed(),mainSHA256:createHash('sha256').update(protectedBytes).digest('hex'),mainPreserved:true,provenance:'Native public settings and editor UI; passive AudioContext wrappers only. No listening or human acceptance claimed.'},null,2));console.log(JSON.stringify({checks,errors}));
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure.json'),JSON.stringify({message:String(error),errors,events:await observed(),state:await read().catch(()=>null)},null,2));throw error;
}finally{await context.close();await browser.close();}
