/** Short public-UI presentation check of exact played D5 exports. No state edits. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220';
const root = path.resolve('evidence/sp-015d5/browser'), out = path.join(root, 'presentation');
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(new URL(base).searchParams.has('test'), false);assert.ok(process.env.LUMAVORA_ASSET);
const canonical = await readFile(path.join(root, 'active-campaign.save.json'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true }), results = [], errors = [];
const sample=async page=>{
 const raf=await page.evaluate(()=>new Promise(resolve=>{const values=[];let last;function frame(t){if(last!==undefined)values.push(t-last);last=t;if(values.length===90)resolve(values);else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
 const sorted=[...raf].sort((a,b)=>a-b);return {count:raf.length,p50:sorted[45],p95:sorted[85],max:sorted.at(-1),visibility:await page.evaluate(()=>({visible:document.visibilityState,focused:document.hasFocus()}))};
};
try {
  for (const [file, panel, image] of [
    ['received-core-gift.save.json', 'space-core', 'visible-heart-1024.png'],
    ['planted-root.save.json', 'space-core', 'anchored-climate-1024.png'],
    ['active-campaign.save.json', 'space-core', 'returned-core-1024.png'],
  ]) {
    const bytes = await readFile(path.join(root, file)), source = JSON.parse(bytes).state;
    const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    try {
      const page = await context.newPage();await page.bringToFront();const blankBaseline=await sample(page);
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base); await page.locator('button[data-action="saves"]').click();
      await page.locator('#import-save').setInputFiles(path.join(root, file));
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
      assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
      const assets = await page.locator('script[type="module"][src]').evaluateAll(nodes => nodes.map(n => n.src));
      assert.ok(assets.some(url => url.endsWith(`/assets/${process.env.LUMAVORA_ASSET}`)));
      if(source.space.leg) await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).space.leg);
      const open = async id => { if (await page.locator(`#${id}`).getAttribute('open') === null) await page.locator(`#${id} > summary`).click(); };
      if (!source.space.location) await open('space-dock');
      await open(panel);
      const read=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
      if(file==='received-core-gift.save.json') {
        await page.locator('.space-heading h2').click();
        for(let i=0;i<160;i++) {
          const state=await read(),pos=state.space.location.pos,dx=12-pos.x,dz=-8-pos.z;
          if(Math.hypot(dx,dz)<.8)break;
          assert.ok(i<159,'Actual camera/ship approach stalled');const yaw=state.camera.yaw,x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw);
          const key=Math.abs(x)>Math.abs(z)?x>0?'d':'a':z>0?'s':'w';await page.keyboard.down(key);try{await page.waitForTimeout(70);}finally{await page.keyboard.up(key);}
        }
      }
      if(file==='planted-root.save.json') {await open('space-climate');await page.locator('#space-climate > summary').scrollIntoViewIfNeeded();}
      await page.locator(file==='planted-root.save.json'?'#space-climate svg':`#${panel} > summary`).scrollIntoViewIfNeeded();
      const state=await read();
      assert.deepEqual(state.space.core,source.space.core);
      assert.deepEqual(state.space.events.current, source.space.events.current);
      assert.deepEqual(state.space.economy.actions, source.space.economy.actions);
      assert.equal(state.space.economy.balance, source.space.economy.balance);
      assert.equal(state.space.ship.health, source.space.ship.health);
      const text = await page.locator(`#${panel}`).innerText();assert.match(text,/30 energie/);assert.match(text,/galaxie pokračuje/);
      if(file==='planted-root.save.json'){const world=state.space.expedition.worlds.find(w=>w.id===state.space.location.planetId);assert.equal(world.temperature,0);assert.equal(world.atmosphere,0);assert.equal(world.life.length,0);}
      await page.bringToFront();const timing=await sample(page),render=(await read()).render;
      await page.screenshot({ path: path.join(out, image) });
      results.push({ file, sourceSha256: hash(bytes), panel, image, text, assets, blankBaseline, timing, render });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []); assert.equal(hash(await readFile(path.join(root, 'active-campaign.save.json'))), hash(canonical));
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ results, errors, canonicalSha256: hash(canonical), provenance: 'Unmodified played public exports, imported into separate empty browser contexts. Panels opened through normal controls; no setters or clock hooks.' }, null, 2));
} finally { await browser.close(); }
