/** SP-002 public-UI acceptance. All construction uses clicks, keys and pointer drags.
 * The unchanged coast fixture is prepared, never earned. No live setters or DEV clock.
 * --construction stops after the focused matrix; --red checks only baseline availability.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { runDomain, isAcceptanceComplete } from './creature-editor-acceptance.mjs';
const phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8)??'all';
assert.ok(['all','comparison','terrain','edge','earned','performance'].includes(phase),'Unknown acceptance phase');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5183';
const out = path.resolve(process.env.CREATURE_EDITOR_OUTPUT ?? 'evidence/sp-002/browser');
const fixture = 'tests/fixtures/saves/won-current-coast.fixture.json';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
if (process.env.LUMAVORA_TRACE === '1') await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage(); page.setDefaultTimeout(12000);
const errors = [], warnings = [];
const sourceHashes=Object.fromEntries(await Promise.all(['src/main.ts','src/render/renderer.ts','src/game/creature-motion.ts','src/game/creature-anatomy.ts'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if(m.type() === 'warning'){if(/Automatic fallback to software WebGL|GPU stall due to ReadPixels/.test(m.text()))warnings.push(m.text());else errors.push(m.text());} });
let report = { url: base, started: new Date().toISOString(), seed: 481516, input: fixture,
  inputSha256: createHash('sha256').update(await readFile(fixture)).digest('hex'),
  provenance: 'Prepared unchanged coast, UI import and construction; normal browser RAF, no test query, no live state writes, no advanceTime. Not earned campaign evidence.', results: [] };
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const action = async name => { await page.locator(`[data-action="${name}"]`).first().click(); await frame(); };
const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });
async function importSave(file) {
  await page.goto(base); await action('saves'); await page.locator('#import-save').setInputFiles(file);
  await page.waitForFunction(() => ['game', 'won', 'death'].includes(JSON.parse(window.render_game_to_text()).mode));
  if ((await read()).mode === 'won') await action('sandbox');
}
async function loadLatest(){const button=page.locator('[data-action^="load:"]').first();assert.equal(await button.isVisible(),true);assert.equal(await button.isEnabled(),true);await button.focus();await button.press('Enter');await frame();assert.ok(['game','won','death'].includes((await read()).mode));}
async function openEditor() { await page.keyboard.press('Tab'); await frame(); assert.equal((await read()).mode, 'editor'); }
async function number(key, value) {
  const input = page.locator(`[data-creature="${key}"]`); await input.focus();
  // Numeric spinbuttons are edited with native keyboard input, not DOM assignment.
  await input.press('ControlOrMeta+A'); await input.pressSequentially(String(value)); await input.press('Tab'); await frame();
  assert.equal(Number(await input.inputValue()), value, key);
}
async function nudge(key) { const input = page.locator(`[data-creature="${key}"]`); await input.focus(); await input.press('ArrowUp'); await input.press('Tab'); await frame(); }
async function pick(kind, partId) {
  for(let attempt=0;attempt<5;attempt++) {
    const candidates=(await read()).editor.handles.filter(h=>h.selection.kind===kind&&(!partId||h.selection.partId===partId)&&h.x>330&&h.x<1110&&h.y>220&&h.y<710);
    for(const h of candidates){await page.mouse.click(h.x,h.y);await frame();const actual=(await read()).editor.creatureSelection;if(actual?.kind===kind&&(!partId||actual.partId===partId))return h;}
    await page.mouse.move(700,450);await page.mouse.down({button:'right'});await page.mouse.move(740,450,{steps:4});await page.mouse.up({button:'right'});await frame();
  }
  assert.fail(`No directly selectable ${kind} handle for ${partId??'body'}`);
}
async function exportSave(id) {
  if ((await read()).mode === 'game') await page.keyboard.press('Escape');
  await action('saves'); const download=page.waitForEvent('download');await action('export');
  const file=path.join(out,`${id}.save.json`);await(await download).saveAs(file);return file;
}
/** Await installation before native input; records observations only, never game state. */
async function captureJump(scope,trigger,duration=1600){
  await page.evaluate(scope=>{const capture={samples:[],recording:true};window.__creatureJumpCapture=capture;function sample(){if(!capture.recording)return;const s=JSON.parse(window.render_game_to_text()),r=scope==='trial'?s.editor.trial.runtime:s.player,a=scope==='trial'?r.actions:r.creatureActions;capture.samples.push({at:performance.now(),tick:s.tick,y:r.pos.y,vy:r.velocity.y,energy:r.energy,recharge:a.jumpRecharge});requestAnimationFrame(sample);}sample();},scope);
  let samples;
  try{await trigger();await page.waitForTimeout(duration+200);}
  finally{samples=await page.evaluate(()=>{const capture=window.__creatureJumpCapture;capture.recording=false;delete window.__creatureJumpCapture;return capture.samples;});report.lastJumpCapture={scope,samples};}
  return samples;
}
async function unavailableQuoteCheck() {
  const exact=(await read()).editor.draft;
  const footer=async()=>({cost:await page.locator('.editor-footer .cost').innerText(),note:await page.locator('.editor-footer small').innerText()});
  const valid=await footer();
  assert.equal(await page.locator('[data-action="confirm-editor"]').isEnabled(),true);
  await action('creature-panel:parts');
  const legs=exact.parts.filter(p=>p.kind==='legs');assert.equal(legs.length,1);
  await action(`select:${legs[0].id}`);await action('remove');
  const unavailable=async()=>{
    const quote=await footer();
    assert.match(quote.cost,/Nedostupná/);assert.match(quote.note,/Zbývající alokace: nedostupná/);
    assert.match(await page.locator('.editor-validation').innerText(),/nejméně dvě chodidla/);
    assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(),true);
    return quote;
  };
  const initial=await unavailable(); // remove() renders a fresh construction panel.
  await action('creature-panel:skin');
  const hue=page.locator('[data-creature="hue"]');await hue.focus();await hue.press('ArrowUp');await frame();
  assert.equal((await read()).editor.history.pending,true);
  const refreshed=await unavailable(); // focused native input runs refreshEditorValues without rebuilding the panel.
  await shot('unavailable-quote');
  await hue.press('Tab');await frame();await action('undo');await action('undo');
  assert.deepEqual((await read()).editor.draft,exact);
  assert.deepEqual(await footer(),valid);
  assert.equal(await page.locator('[data-action="confirm-editor"]').isEnabled(),true);
  report.unavailableQuote={passed:true,initial,refreshed,restored:valid,checks:['initial panel render','focused numeric refresh','concrete stance reason','disabled confirmation','undo exact genome and valid quote']};
}
async function build(kind) {
  console.log(`${kind}: starting UI construction`);
  await importSave(fixture); const imported=await read();assert.equal(imported.stage,2);assert.equal(imported.player.genome.version,1);assert.equal(imported.player.dna,119);assert.equal(imported.player.totalDna,200);
  if(!process.argv.includes('--red')){await page.keyboard.press('Escape');await page.locator('[data-setting="reducedMotion"]').check();assert.equal(await page.locator('[data-setting="reducedMotion"]').isChecked(),true);await action('close');}
  await openEditor();assert.deepEqual((await read()).editor.draft,imported.player.genome);report.setupVerified=true;
  assert.equal(await page.locator('[data-action="creature-open"]').count(),1,'Feature-specific RED: coast import/editor succeeded, new construction control must exist');
  if(process.argv.includes('--red'))return;
  await action('creature-open');
  await nudge('node.bend');assert.equal((await read()).editor.draft.version,2);
  await action('undo');assert.deepEqual((await read()).editor.draft,imported.player.genome);await action('redo');
  await action('creature-panel:parts');
  // Remove equipment through UI to make three affordable, distinct silhouettes.
  for(const p of (await read()).editor.draft.parts.filter(p=>!['lungs','legs','symbiote'].includes(p.kind))){await action(`select:${p.id}`);await action('remove');}
  let leg=(await read()).editor.draft.parts.find(p=>p.kind==='legs');
  await action(`select:${leg.id}`);await number('part.axial',kind==='biped'?-.2:-.45);
  await page.locator('[data-creature="part.mirrored"]').uncheck();await frame();assert.equal((await read()).editor.draft.parts.find(p=>p.id===leg.id).mirrored,false);
  await page.locator('[data-creature="part.mirrored"]').check();await frame();
  if(kind==='biped'){await action('add:arms');await page.locator('[data-creature="end.style"]').selectOption('pincer');await number('part.axial',.45);}
  else {await action('add:legs');await number('part.axial',kind==='quadruped'?.4:.05);await page.locator('[data-creature="end.style"]').selectOption(kind==='quadruped'?'claw':'pad');}
  await action('add:jaw');await number('part.axial',kind==='longneck'?.9:.82);await number('part.angle',0);
  await action('creature-panel:body');
  if(kind==='longneck')for(const [i,w,h,b] of [[4,.65,.65,.65],[5,.4,.45,1.4],[6,.65,.65,2.1]]){await action(`creature-spine:spine-${i}`);await number('node.width',w);await number('node.height',h);await number('node.bend',b);}
  console.log(`${kind}: parts/spine authored`);
  // Direct body, knee/elbow and end picking; committed canvas edit + exact undo/redo.
  const spine=await pick('spine');const before=(await read()).editor.draft;
  await page.mouse.move(spine.x,spine.y);await page.mouse.down();await page.mouse.move(spine.x,spine.y-8,{steps:4});await page.mouse.up();await frame();
  const edited=(await read()).editor.draft;assert.notDeepEqual(edited,before);await action('undo');assert.deepEqual((await read()).editor.draft,before);await action('redo');assert.deepEqual((await read()).editor.draft,edited);
  await action('creature-panel:parts');await pick('joint',leg.id);await pick('end',leg.id);
  if(kind==='biped'){const arm=(await read()).editor.draft.parts.find(p=>p.kind==='arms');await pick('joint',arm.id);await pick('end',arm.id);}
  await action('creature-panel:skin');await page.locator('[data-creature="skin.finish"]').selectOption({biped:'pebbled',quadruped:'plated',longneck:'smooth'}[kind]);await number('skin.secondaryHue',38);await number('skin.contrast',.65);
  await action('creature-panel:body');await action('creature-spine:spine-3');
  // Change panel while a numeric transaction is focused, then verify stable history.
  await page.locator('[data-creature="node.width"]').focus();await page.keyboard.press('ArrowUp');await action('creature-panel:parts');assert.equal((await read()).editor.history.pending,false);
  // Pointer cancel and native window focus loss roll back the in-progress drag.
  const handle=await pick('joint',leg.id),stable=(await read()).editor.draft;
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+12,handle.y-12,{steps:3});await page.locator('canvas').first().dispatchEvent('pointercancel',{pointerId:1,button:0});await page.mouse.up();await frame();assert.deepEqual((await read()).editor.draft,stable);
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+12,handle.y-12,{steps:3});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();await frame();assert.deepEqual((await read()).editor.draft,stable);
  await page.setViewportSize({width:1280,height:720});await frame();
  for(const selector of ['.editor-footer .cost','[data-action="confirm-editor"]','[data-action="undo"]']){const b=await page.locator(selector).first().boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=720,selector);}
  await context.setDefaultTimeout(12000);await page.emulateMedia({reducedMotion:'reduce'});await frame();
  console.log(`${kind}: control boundaries passed, starting trial`);
  await action('creature-view:try');await action('trial:attack');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).editor.trial.feeding>0);assert.equal(await page.locator('[data-action="trial:attack"]').isDisabled(),true);
  const trialJumpSamples=await captureJump('trial',()=>action('trial:jump'));assert.ok(trialJumpSamples.some(s=>s.vy>0));assert.ok(trialJumpSamples.some(s=>s.vy<0));
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).editor.trial.runtime.velocity.y===0);await action('trial:communicate');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).editor.trial.runtime.actions.communicationSerial===1);assert.equal(await page.locator('[data-action="trial:communicate"]').isDisabled(),true);
  await action('trial:walk');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).editor.trial.runtime.pos.z>5);await action('trial:idle');await page.waitForTimeout(200);assert.equal(await page.locator('[data-action="trial:attack"]').isDisabled(),true);assert.match(await page.locator('#creature-trial-status').innerText(),/dosah|daleko|mimo/i);
  await action('trial:reset');await action('creature-view:build');await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:900});await frame();
  if(kind==='biped'){
    const exact=(await read()).editor.draft,jaw=exact.parts.find(p=>p.kind==='jaw');await action('creature-panel:parts');await action(`select:${jaw.id}`);await action('remove');await action('creature-view:try');
    assert.equal(await page.locator('[data-action="trial:communicate"]').textContent(),'Gesto');assert.equal(await page.locator('[data-action="trial:attack"]').isDisabled(),true);await action('trial:communicate');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).editor.trial.runtime.actions.communicationSerial===1);assert.equal(await page.locator('[data-action="trial:communicate"]').isDisabled(),true);
    await action('creature-view:build');await action('undo');assert.deepEqual((await read()).editor.draft,exact);
  }
  if(kind==='biped'&&process.argv.includes('--production-smoke'))await unavailableQuoteCheck();
  // Native orbit then wheel calibration, using read-only actual camera distance.
  let proj=(await read()).editor.projection;await page.mouse.move(720,450);await page.mouse.down({button:'right'});await page.mouse.move(720+(proj.yaw-.95)/.008,450+(.15-proj.pitch)/.006,{steps:12});await page.mouse.up({button:'right'});await frame();
  proj=(await read()).editor.projection;const targetDistance=17;await page.mouse.move(720,450);await page.mouse.wheel(0,(proj.zoom*targetDistance/proj.distance-proj.zoom)/.008);await frame();
  proj=(await read()).editor.projection;assert.ok(Math.abs(proj.distance-targetDistance)<.02,JSON.stringify(proj));
  await action('creature-panel:skin');await shot(`${kind}-construction`);
  const made=(await read()).editor;assert.ok(made.cost<=222);assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(),false);
  const beforePay=(await read()).player;await action('confirm-editor');const paid=await read();assert.deepEqual(paid.player.genome,made.draft);assert.equal(paid.player.dna,222-made.cost);assert.equal(paid.player.totalDna,beforePay.totalDna);assert.equal(paid.player.generation,beforePay.generation+1);
  const result={kind,trialJumpSamples,genome:made.draft,cost:made.cost,dnaBefore:beforePay.dna,dnaAfter:paid.player.dna,capabilities:paid.creatureCapabilities,projection:proj,checks:['native construction','direct body/joint/end picks','symmetry','drag undo/redo','panel transaction','pointercancel','synthetic blur rollback','1280x720 and 1440x900','reduced motion','trial hit/miss/cooldown/jump/walk/voice','paid confirmation']};
  if(kind==='biped')result.checks.push('temporary jawless gesture and unavailable attack');result.reducedMotionSetting=true;
  result.save=await exportSave(kind);report.results.push(result);await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(`${kind}: investment ${made.cost}, DNA ${beforePay.dna} -> ${paid.player.dna} (deducted ${beforePay.dna-paid.player.dna})`);
}

async function drive(target, seconds=25) {
  const start=Date.now(),held=new Set(),samples=[];
  try {
    while(Date.now()-start<seconds*1000){
      const s=await read();assert.equal(s.mode,'game',s.deathReason);const p=s.player.pos,dx=target.x-p.x,dz=target.z-p.z;
      samples.push({tick:s.tick,pos:p,heading:s.player.heading,distance:s.player.distance});
      if(Math.hypot(dx,dz)<2)break;
      const yaw=s.camera.yaw,x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw),next=new Set();
      if(Math.abs(x)>.35)next.add(x>0?'KeyD':'KeyA');if(Math.abs(z)>.35)next.add(z>0?'KeyS':'KeyW');
      const released=[...held].filter(key=>!next.has(key)),pressed=[...next].filter(key=>!held.has(key));await Promise.all([...released.map(key=>page.keyboard.up(key)),...pressed.map(key=>page.keyboard.down(key))]);held.clear();for(const key of next)held.add(key);
      await page.waitForTimeout(100);
      // Brake between short approaches instead of orbiting a nearby waypoint at full speed.
      if(Math.hypot(dx,dz)<5){await Promise.all([...held].map(key=>page.keyboard.up(key)));held.clear();await page.waitForTimeout(250);}
    }
  } finally {await Promise.all([...held].map(key=>page.keyboard.up(key)));}
  await page.waitForTimeout(300);const actual=(await read()).player;
  assert.ok(Math.hypot(target.x-actual.pos.x,target.z-actual.pos.z)<3,`Native target not reached: ${JSON.stringify({target,actual:actual.pos})}`);
  return {target,actual:actual.pos,samples};
}
async function savedWorkflow(result){
  console.log(`${result.kind}: native terrain and save workflow`);await page.setViewportSize({width:1280,height:720});
  await importSave(result.save);assert.deepEqual((await read()).player.genome,result.genome);assert.deepEqual((await read()).creatureCapabilities,result.capabilities);
  await page.keyboard.press('Escape');await page.locator('[data-setting="quality"]').selectOption('low');await action('saves');await loadLatest();await frame();
  await page.reload();await action('saves');await loadLatest();await frame();
  assert.deepEqual((await read()).player.genome,result.genome);assert.deepEqual((await read()).creatureCapabilities,result.capabilities);
  await openEditor();assert.equal((await read()).editor.cost,result.cost);assert.deepEqual((await read()).editor.draft,result.genome);await action('cancel-editor');
  const start=await read();
  try{result.jumpSamples=await captureJump('world',()=>page.keyboard.down('KeyQ'),2800);}finally{await page.keyboard.up('KeyQ');}
  assert.ok(result.jumpSamples.some(s=>s.vy>0&&s.y>start.player.pos.y+.05),'Native ascent was rendered');assert.ok(result.jumpSamples.some(s=>s.vy<0),'Native descent was rendered');assert.equal((await read()).player.velocity.y,0);assert.equal((await read()).player.creatureActions.jumpRecharge,0);assert.ok(start.player.energy-(await read()).player.energy>4.8);assert.ok(start.player.energy-(await read()).player.energy<7,'Held Q charges only one jump');
  const voiceBefore=(await read()).player.creatureActions.communicationSerial;await page.keyboard.down('KeyV');await page.waitForFunction(n=>JSON.parse(window.render_game_to_text()).player.creatureActions.communicationSerial>n,voiceBefore);await page.waitForTimeout(2200);await page.keyboard.up('KeyV');assert.equal((await read()).player.creatureActions.communicationSerial,voiceBefore+1);
  result.terrain=[];for(const target of [{x:9,z:0},{x:9,z:18},{x:23,z:18},{x:23,z:0}])result.terrain.push(await drive(target));
  const finish=await read();result.travelDistance=finish.player.distance-start.player.distance;assert.ok(result.travelDistance>=20);
  const heights=result.terrain.flatMap(r=>r.samples.map(s=>s.pos.y));result.heightRange=Math.max(...heights)-Math.min(...heights);assert.ok(result.heightRange>.2,'Native route includes terrain elevation');
  result.obstacle=finish.world.obstacles.find(o=>o.id===163);assert.ok(result.obstacle);
  const routeSamples=result.terrain.flatMap(r=>r.samples),obstacle=result.obstacle,api=await offlineModules(),hull=api.resolveCreatureAnatomy(result.genome).hull;
  const clearances=routeSamples.map(sample=>Math.min(...hull.map(sphere=>{const c=Math.cos(sample.heading),s=Math.sin(sample.heading),x=sample.pos.x+c*sphere.center.x+s*sphere.center.z,z=sample.pos.z-s*sphere.center.x+c*sphere.center.z;return Math.hypot(x-obstacle.pos.x,z-obstacle.pos.z)-sphere.radius-obstacle.radius;})));
  result.obstacleEvidence={id:obstacle.id,minHullHorizontalClearance:Math.min(...clearances),maxHullHorizontalClearance:Math.max(...clearances),nativeSamples:routeSamples.length};
  assert.ok(result.obstacleEvidence.minHullHorizontalClearance>=-.05,'Authoritative trunk hull remains outside tree cylinder');assert.ok(result.obstacleEvidence.minHullHorizontalClearance<3.5,'Route actually approaches the tree within3.5m hull clearance');
  for(const predicate of [p=>p.x<obstacle.pos.x-4&&Math.abs(p.z-obstacle.pos.z)<3,p=>p.z>obstacle.pos.z+6&&Math.abs(p.x-obstacle.pos.x)<4,p=>p.x>obstacle.pos.x+5&&Math.abs(p.z-obstacle.pos.z)<3])assert.ok(routeSamples.some(s=>predicate(s.pos)),'Native route skirts all three specified sides of tree163');
  await shot(`${result.kind}-terrain`);
  result.terrainSave=await exportSave(`${result.kind}-terrain`);
  result.checks.push('full genome/cost/capability export import refresh load','native held jump/voice single edge through cooldown','native >20m slope and turns around tree163');
  assert.deepEqual(errors,[]);
}
async function comparison(){
  const shots=[];
  for(const result of report.results){await importSave(result.save);await openEditor();await action('creature-view:try');await action('trial:reset');
    let p=(await read()).editor.projection;await page.mouse.move(720,450);await page.mouse.down({button:'right'});await page.mouse.move(720+(p.yaw-.95)/.008,450+(.15-p.pitch)/.006,{steps:8});await page.mouse.up({button:'right'});await frame();
    p=(await read()).editor.projection;await page.mouse.wheel(0,(p.zoom*17/p.distance-p.zoom)/.008);await frame();p=(await read()).editor.projection;
    assert.ok(Math.abs(p.distance-17)<.02);assert.ok(Math.abs(p.yaw-.95)<.0001);assert.ok(Math.abs(p.pitch-.15)<.0001);result.comparisonProjection=p;
    const name=`${result.kind}-silhouette`;await page.screenshot({path:path.join(out,name+'.png'),clip:{x:320,y:270,width:800,height:400}});shots.push({name,kind:result.kind});
    if(result.kind==='biped'){await action('creature-view:build');await action('creature-panel:parts');const arm=(await read()).editor.draft.parts.find(x=>x.kind==='arms');await action(`select:${arm.id}`);await action('creature-end');p=(await read()).editor.projection;await page.mouse.move(720,450);await page.mouse.wheel(0,(p.zoom*10/p.distance-p.zoom)/.008);await frame();await shot('joint-surface-detail');}
  }
  const composed=await context.newPage();await composed.setViewportSize({width:1100,height:1340});
  const rows=await Promise.all(shots.map(async s=>`<section><h2>${s.kind}</h2><img src="data:image/png;base64,${(await readFile(path.join(out,s.name+'.png'))).toString('base64')}"/></section>`));
  await composed.setContent(`<style>body{margin:0;background:#102f34;color:#e2f1dc;font:16px system-ui}h1{margin:20px 28px 6px}p{margin:0 28px 20px}section{height:400px;display:grid;grid-template-columns:240px 800px;align-items:center;border-top:1px solid #456568}h2{padding-left:28px;font-size:22px}img{width:800px;height:400px}</style><h1>Three bodies built through ordinary UI</h1><p>Equal world projection: distance17, FOV40°, yaw0.95, pitch0.15; same 1440×900 viewport. Prepared coast budget.</p>${rows.join('')}`);
  await composed.screenshot({path:path.join(out,'comparison.png')});await composed.close();
  assert.deepEqual(errors,[]);
}
async function offlineModules(){
  const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
  try{return {...await server.ssrLoadModule('/src/game/persistence.ts'),...await server.ssrLoadModule('/src/game/simulation.ts'),...await server.ssrLoadModule('/src/game/genome.ts'),...await server.ssrLoadModule('/src/game/creature-anatomy.ts'),...await server.ssrLoadModule('/src/game/creature-actions.ts'),...await server.ssrLoadModule('/src/render/organism.ts')};}finally{await server.close();}
}
async function edgeSaves(){
  console.log('Prepared mid-jump/death and corrupt-import UI scenarios');const api=await offlineModules(),first=report.results[0];
  const original=api.parseGame(await readFile(first.save,'utf8')),jump=api.parseGame(await readFile(first.save,'utf8'));
  jump.player.pos.y+=2;jump.player.velocity.y=2;jump.player.creatureActions.jumpRecharge=1.1;jump.player.creatureActions.communicationRecharge=1.7;jump.player.creatureActions.communicationSerial=4;
  const jumpFile=path.join(out,'prepared-mid-jump.save.json');await writeFile(jumpFile,api.serializeGame(jump));
  await importSave(jumpFile);await page.keyboard.press('Escape');let observed=await read();
  assert.ok(observed.player.pos.y>original.player.pos.y+.1);assert.notEqual(observed.player.velocity.y,0);assert.ok(observed.player.creatureActions.jumpRecharge>0);assert.ok(observed.player.creatureActions.communicationRecharge>0);
  const delta=(observed.tick-jump.tick)/60;assert.ok(Math.abs(observed.player.creatureActions.jumpRecharge-(1.1-delta))<.02);
  const exported=await exportSave('mid-jump-roundtrip'),saved=api.parseGame(await readFile(exported,'utf8'));assert.deepEqual(saved.player,observed.player);
  await importSave(exported);await page.keyboard.press('Escape');const restored=await read();assert.equal(restored.player.creatureActions.communicationSerial,4);assert.ok(restored.player.creatureActions.jumpRecharge>0);
  await action('close');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).player.velocity.y===0);assert.deepEqual((await read()).player.genome,first.genome);
  const dying=api.parseGame(await readFile(first.save,'utf8'));dying.player.health=.001;dying.player.energy=0;dying.player.moisture=0;dying.player.invulnerable=0;
  const deathFile=path.join(out,'prepared-near-death.save.json');await writeFile(deathFile,api.serializeGame(dying));await importSave(deathFile);await page.waitForSelector('[data-action="recover"]');await action('recover');const recovered=await read();assert.equal(recovered.mode,'game');assert.deepEqual(recovered.player.genome,first.genome);assert.deepEqual(recovered.creatureCapabilities,first.capabilities);assert.equal(recovered.player.creatureActions.jumpRecharge,0);
  await page.keyboard.press('Escape');await action('saves');const slotBefore=await page.locator('[data-action^="load:"]').allTextContents();
  const invalid=path.join(out,'invalid-import.json');await writeFile(invalid,'{"format":"lumavora","version":3,"state":{"player":{"genome":{"version":2}}}}');await page.locator('#import-save').setInputFiles(invalid);await frame();assert.deepEqual(await page.locator('[data-action^="load:"]').allTextContents(),slotBefore);
  await page.reload();await action('saves');await loadLatest();assert.deepEqual((await read()).player.genome,first.genome);
  await importSave(fixture);await openEditor();const old=(await read()).editor.draft;await action('creature-open');await nudge('node.bend');assert.equal((await read()).editor.draft.version,2);await action('cancel-editor');assert.deepEqual((await read()).player.genome,old);
  report.edgeSaves={passed:true,provenance:'Offline copies of actual UI-paid biped export; only runtime height/vertical velocity/timers or imminent-death vitals changed. Ordinary import, native landing/death/recover; no live writes. Original historical V1 unchanged.',jump:{startRecharge:1.1,elapsedTicks:observed.tick-jump.tick,observedRecharge:observed.player.creatureActions.jumpRecharge,restoredRecharge:restored.player.creatureActions.jumpRecharge},checks:['mid-air export import and remaining timers','normal death modal/recover preserves v2 checkpoint','invalid import leaves slot/load intact','cancel V1-to-V2 draft keeps installed V1']};
}
async function performance(){
  console.log('Separate same-scene native RAF benchmark');await page.setViewportSize({width:1280,height:720});const api=await offlineModules(),template=api.parseGame(await readFile(fixture,'utf8')),results=[];
  const prepared=[];
  for(const body of [{kind:'v1',genome:template.player.genome},...report.results]){
    const state=api.parseGame(await readFile(fixture,'utf8'));state.player.genome=api.cloneGenome(body.genome);state.player.dna=222-api.genomeCost(body.genome);state.player.pos={x:0,y:body.kind==='v1'?1.2:api.resolveCreatureAnatomy(body.genome).groundClearance,z:0};state.player.velocity={x:0,y:0,z:0};state.player.energy=100;state.player.invulnerable=120;state.campaign.sandbox=true;if(body.kind!=='v1')state.player.creatureActions=api.emptyCreatureActions();api.makeCheckpoint(state);
    const file=path.join(out,`performance-${body.kind}.save.json`);await writeFile(file,api.serializeGame(state));prepared.push({body,file});
  }
  for(const {body,file} of prepared){
    await importSave(file);await page.keyboard.press('Escape');await page.locator('[data-setting="quality"]').selectOption('low');await page.locator('[data-setting="reducedMotion"]').uncheck();await action('close');await page.waitForTimeout(3000);
    const before=await read(),environment=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],devicePixelRatio};});
    const raw=await page.evaluate(()=>new Promise(resolve=>{const frameTimes=[],counts=[];let start,previous;function sample(now){start??=now;if(previous!==undefined)frameTimes.push(now-previous);previous=now;if(frameTimes.length%30===0)counts.push(JSON.parse(window.render_game_to_text()).render);if(now-start>=20000)resolve({frameTimes,counts,elapsed:now-start});else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
    const sorted=[...raw.frameTimes].sort((a,b)=>a-b),percentile=q=>sorted[Math.floor((sorted.length-1)*q)];assert.ok(sorted.length>30);assert.ok((await read()).tick>before.tick);
    const anatomy=body.kind==='v1'?null:api.resolveCreatureAnatomy(body.genome);
    const model=api.createOrganism(body.genome),profile={meshes:0,vertices:0,geometries:new Set(),materials:new Set(),collisionSamples:anatomy?.hull.length??null,limbs:anatomy?.limbs.length??null,bodySpine:body.genome.body?.spine.length??7};
    model.traverse(node=>{if(node.isMesh){profile.meshes++;profile.vertices+=node.geometry.getAttribute('position')?.count??0;profile.geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])profile.materials.add(material);}});profile.geometries=profile.geometries.size;profile.materials=profile.materials.size;api.disposeObject(model);
    results.push({kind:body.kind,environment,quality:'low',p50:percentile(.5),p95:percentile(.95),drawCalls:raw.counts.map(c=>c.drawCalls),raw,profile});console.log(`${body.kind}: RAF p50 ${percentile(.5).toFixed(2)} p95 ${percentile(.95).toFixed(2)}`);
  }
  for(const r of results.slice(1)){r.p95Regression=r.p95/results[0].p95-1;r.requiresProfile=r.p95Regression>.2;r.profileCompleted=true;r.profileComparison={meshDelta:r.profile.meshes-results[0].profile.meshes,vertexDelta:r.profile.vertices-results[0].profile.vertices,collisionSamples:r.profile.collisionSamples};}
  report.performance={provenance:'Separately prepared same coast world/seed/tick/resources/NPC/obstacles, UI-exported genomes copied offline, consistent budget; equal viewport/quality stationary normal simulation and 20s raw RAF each after3s warmup. No gameplay/performance equivalence claim.',results};
  await writeFile(path.join(out,'performance.json'),JSON.stringify(report.performance,null,2));
}

async function earnedContinuation(){
  console.log('Earned checkpoint continuation: reef G -> land nest -> paid v2 -> leave/return');
  const file='evidence/sp-002/earned-preparation/earned-reef-exit.save.json',hash=createHash('sha256').update(await readFile(file)).digest('hex');assert.equal(hash,'6d5e9b7257980ef8214399565f342323250d32d3d358f77e33ec95e39994d11d');
  await page.setViewportSize({width:1280,height:720});await importSave(file);const reef=await read();assert.equal(reef.stage,1);assert.equal(reef.player.totalDna,374);assert.equal(reef.player.dna,216);await page.keyboard.press('Escape');await page.locator('[data-setting="quality"]').selectOption('low');await action('close');
  await page.keyboard.press('KeyG');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).stage===2);const arrival=await read();assert.equal(arrival.player.totalDna,374);
  await openEditor();await action('creature-open');await nudge('node.bend');await action('creature-panel:parts');await action('add:arms');await page.locator('[data-creature="end.style"]').selectOption('pincer');
  const proposal=(await read()).editor;assert.equal(proposal.draft.version,2);assert.ok(proposal.cost<=396);assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(),false);await action('confirm-editor');const paid=await read();assert.equal(paid.player.dna,396-proposal.cost);assert.deepEqual(paid.player.genome,proposal.draft);
  const outbound=await drive({x:14,z:0});assert.ok(Math.hypot(outbound.actual.x,outbound.actual.z)>11,'Actually leaves the nest interaction radius');const returning=await drive({x:0,z:0});await openEditor();assert.deepEqual((await read()).editor.draft,proposal.draft);await action('creature-panel:skin');await page.locator('[data-creature="skin.finish"]').selectOption('pebbled');const beforeSecond=await read(),second=beforeSecond.editor;await action('confirm-editor');assert.equal((await read()).player.genome.body.skin.finish,'pebbled');assert.equal((await read()).player.dna,beforeSecond.player.dna,'Cosmetic edit adds no DNA charge');
  await shot('earned-returned-v2');const activeSave=await exportSave('earned-active');const final=await read();
  report.earned={passed:true,input:file,inputSha256:hash,provenance:'Documented actually-played reef exit imported normally; native G crossing, UI conversion/arms and paid confirmation, native14m target, actual departure beyond11m nest radius/return, second confirmed cosmetic edit (zero extra DNA). No added DNA, skipped stage, DEV clock or state setter.',arrival:{dna:arrival.player.dna,totalDna:arrival.player.totalDna,generation:arrival.player.generation},first:{cost:proposal.cost,dna:paid.player.dna,generation:paid.player.generation},second:{cost:second.cost,dnaBefore:beforeSecond.player.dna,dna:final.player.dna,totalDna:final.player.totalDna,generation:final.player.generation},outbound,returning,activeSave,activeSaveSha256:createHash('sha256').update(await readFile(activeSave)).digest('hex')};
  await writeFile(path.join(out,'earned.json'),JSON.stringify(report.earned,null,2));
}

try {
  if(process.argv.includes('--saved-only')||process.argv.includes('--resume-construction')){report=JSON.parse(await readFile(path.join(out,'results.json'),'utf8'));delete report.failure;delete report.state;report.passed=false;report.acceptanceComplete=false;const kinds=['biped','quadruped','longneck'];if(process.argv.includes('--resume-construction')){assert.ok(report.results.length<3);assert.deepEqual(report.results.map(r=>r.kind),kinds.slice(0,report.results.length),'Resume requires a verified construction prefix');for(const kind of kinds.slice(report.results.length))await build(kind);}else assert.deepEqual(report.results.map(r=>r.kind),kinds,'Saved-only requires the complete UI-paid matrix');}
  else for(const kind of (process.argv.includes('--red')||process.argv.includes('--production-smoke'))?['biped']:['biped','quadruped','longneck'])await build(kind);
  if(process.argv.includes('--production-smoke')){assert.equal(await page.evaluate(()=>typeof window.advanceTime),'undefined');const r=report.results[0];await importSave(r.save);await page.reload();await action('saves');await loadLatest();assert.deepEqual((await read()).player.genome,r.genome);assert.deepEqual((await read()).creatureCapabilities,r.capabilities);report.productionV2=true;report.productionResources=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).filter(name=>/\.(js|css)(\?|$)/.test(name)));}
  else if(!process.argv.includes('--red')){if(['all','comparison'].includes(phase))await runDomain(report,'comparison',comparison,{remaining:process.argv.includes('--remaining')});if(!process.argv.includes('--construction')){if(['all','terrain'].includes(phase))for(const result of report.results)await runDomain(result,'terrain',()=>savedWorkflow(result),{remaining:process.argv.includes('--remaining')});if(['all','edge'].includes(phase))await runDomain(report,'edgeSaves',async()=>{await edgeSaves();assert.deepEqual(errors,[]);},{remaining:process.argv.includes('--remaining')});if(['all','earned'].includes(phase))await runDomain(report,'earned',async()=>{await earnedContinuation();assert.deepEqual(errors,[]);},{remaining:process.argv.includes('--remaining')});if(['all','performance'].includes(phase))await runDomain(report,'performance',async()=>{await performance();assert.deepEqual(errors,[]);},{remaining:process.argv.includes('--remaining')});}}
  assert.deepEqual(errors,[]);report.passed=true;report.lastSuccessfulPhase=process.argv.includes('--construction')?'construction':phase;report.acceptanceComplete=isAcceptanceComplete(report);if(phase==='all'&&!['--red','--construction','--production-smoke'].some(flag=>process.argv.includes(flag)))assert.equal(report.acceptanceComplete,true,'All acceptance domains must complete');
} catch(error) { report.passed=false;report.acceptanceComplete=false;report.failure=String(error.stack);report.state=await read().catch(()=>null);await shot('failure').catch(()=>{});console.error(error);process.exitCode=1; }
finally {report.completedAt=new Date().toISOString();report.browser=browser.version();report.invocation=process.argv.slice(2);report.scriptSha256=createHash('sha256').update(await readFile('scripts/creature-editor-browser.mjs')).digest('hex');report.completionHelperSha256=createHash('sha256').update(await readFile('scripts/creature-editor-acceptance.mjs')).digest('hex');report.sourceHashes=sourceHashes;report.errors=errors;report.environmentWarnings=warnings;await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();}
