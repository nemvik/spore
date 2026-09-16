/** Five bodies made with ordinary UI input; DEV stepping freezes the world only. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/private/tmp/lumavora-p0-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-p0-browsers';
const { chromium } = await import('playwright');
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5183';
const output = path.resolve(process.env.BODY_EDITOR_OUTPUT ?? 'evidence/body-editor/browser');
await mkdir(output, { recursive: true });
const ssr = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
let silhouettes, parseGame;
try {
  silhouettes = (await ssr.ssrLoadModule('/tests/fixtures/body-silhouettes.ts')).BODY_SILHOUETTES;
  parseGame = (await ssr.ssrLoadModule('/src/game/persistence.ts')).parseGame;
} finally { await ssr.close(); }
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const action = name => page.locator(`[data-action="${name}"]`).first().click();
const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function shot(name, crop = false) {
  await frame(); await page.screenshot({ path: path.join(output, `${name}.png`), ...(crop ? { clip: { x: 300, y: 260, width: 840, height: 440 } } : {}) });
}
async function range(selector, value) {
  const input = page.locator(selector); await input.focus();
  const current = Number(await input.inputValue()), step = Number(await input.getAttribute('step'));
  const count = Math.round((value - current) / step);
  for (let i = 0; i < Math.abs(count); i++) await input.press(count > 0 ? 'ArrowRight' : 'ArrowLeft');
  await page.locator('.editor-right > .eyebrow').click(); await frame();
  assert.equal(Number(await input.inputValue()), value);
}
async function orbit(dx, dy = 0) {
  await page.mouse.move(720, 470); await page.mouse.down({ button: 'right' });
  await page.mouse.move(720 + dx, 470 + dy, { steps: 10 }); await page.mouse.up({ button: 'right' }); await frame();
}
async function selectVisible(index) {
  const target = (await read()).editor.sections[index]; assert.ok(target, `Section ${index + 1} visible`);
  await page.mouse.click(target.x, target.y); await frame();
  const state=await read();assert.equal(state.editor.selectedSpine, index);
  for(const key of ['width','height','bend'])assert.equal(Number(await page.locator(`[data-spine="${key}"]`).inputValue()),state.editor.draft.spine?.[index][key]??(key==='bend'?0:1));
  assert.equal(await page.locator(`[data-action="spine-select:${index}"]`).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('[data-body-selection]').innerText(), new RegExp(`článek ${index + 1}`));
}
async function exportBody(id) {
  await page.keyboard.press('Escape'); await action('saves');
  const downloading = page.waitForEvent('download'); await action('export');
  const file = path.join(output, `${id}.save.json`); await (await downloading).saveAs(file); return file;
}
try {
  for (const [number, specimen] of silhouettes.entries()) {
    await page.goto(`${base}/?test=1`); await page.locator('#seed').fill('67'); await action('new'); await page.keyboard.press('Tab'); await frame();
    const original = (await read()).editor.draft;
    // Side-on view exposes the complete spine. RMB must not edit anything.
    await orbit(-110); await page.mouse.move(720,470); await page.mouse.wheel(0, 300); await frame();
    if (number === 0) {
      const before = await read();
      for (let index = 0; index < 7; index++) await selectVisible(index);
      const after = await read(); assert.deepEqual(after.editor.draft, before.editor.draft); assert.deepEqual(after.editor.history, before.editor.history);
      await shot('direct-selection');
      await action('spine-select:3');
      const slider = page.locator('[data-spine="width"]'); await slider.focus();
      await slider.press('ArrowRight'); await slider.press('ArrowRight'); await slider.press('ArrowRight');
      await selectVisible(2); assert.equal((await read()).editor.history.undo, 1);
      await action('undo'); assert.deepEqual((await read()).editor.draft, original);
      await selectVisible(5); assert.equal((await read()).editor.history.redo, 1);
      await action('redo'); assert.equal((await read()).editor.draft.spine[3].width, 1.15);
      await action('undo');
      // A full native pointer drag is also a single reversible edit.
      await action('spine-select:3');
      const rangeBox=await slider.boundingBox(), undoBefore=(await read()).editor.history.undo;
      await page.mouse.move(rangeBox.x+rangeBox.width*.44,rangeBox.y+rangeBox.height/2);await page.mouse.down();
      await page.mouse.move(rangeBox.x+rangeBox.width*.85,rangeBox.y+rangeBox.height/2,{steps:12});await page.mouse.up();
      assert.equal((await read()).editor.history.undo,undoBefore+1);
      assert.ok((await read()).editor.draft.spine[3].width>1.3);
      await action('undo');assert.deepEqual((await read()).editor.draft,original);
      // Pick an actual organ mesh, drag it to the body, then restore the same equipment.
      let organPoint=null;
      for(let y=350;y<=560&&!organPoint;y+=20)for(let x=440;x<=1040&&!organPoint;x+=20){
        await page.mouse.click(x,y);
        if((await read()).editor.selectedSpine===null)organPoint={x,y};
      }
      assert.ok(organPoint,'An organ can still be picked in the 3D editor');
      const beforeDrag=(await read()).editor, destination=beforeDrag.sections[3];assert.ok(destination);
      await page.mouse.move(organPoint.x,organPoint.y);await page.mouse.down();
      await page.mouse.move(destination.x,destination.y,{steps:12});await page.mouse.up();await frame();
      const afterDrag=(await read()).editor;
      assert.equal(afterDrag.selectedSpine,null);assert.equal(afterDrag.history.undo,beforeDrag.history.undo+1);
      assert.notDeepEqual(afterDrag.draft.parts,beforeDrag.draft.parts);
      await action('undo');assert.deepEqual((await read()).editor.draft,original);
      await action('redo');assert.deepEqual((await read()).editor.draft,afterDrag.draft);
      await action('undo');await action('spine-select:3');
      // Empty space and a cancelled pointer do not choose a different section.
      const selected = (await read()).editor.selectedSpine;
      await page.mouse.click(720, 260); assert.equal((await read()).editor.selectedSpine, selected);
      await page.locator('canvas').first().dispatchEvent('pointercancel', { pointerId: 9, button: 0 });
      assert.equal((await read()).editor.selectedSpine, selected);
    }
    await range('[data-genome="length"]', specimen.genome.length);
    await range('[data-genome="width"]', specimen.genome.width);
    for (let index = 0; index < 7; index++) {
      await action(`spine-select:${index}`);
      for (const key of ['width', 'height', 'bend']) await range(`[data-spine="${key}"]`, specimen.genome.spine[index][key]);
    }
    const made = (await read()).editor.draft;
    assert.deepEqual(made, specimen.genome); assert.deepEqual(made.parts, original.parts);
    const history = (await read()).editor.history;
    for (let i = 0; i < 7; i++) await selectVisible(i);
    assert.deepEqual((await read()).editor.history, history);
    await action('preview:move'); await frame(); await selectVisible(3); await shot(`${specimen.id}-moving`, true);
    await action('preview:feed'); await frame(); assert.equal((await read()).editor.preview, 'feed');
    await action('preview:idle');
    // Select the same organ to remove the body-edit overlay for honest comparisons.
    await action(`select:${made.parts[0].id}`); await shot(`${specimen.id}-side`, true);
    await orbit(70, 70); await shot(`${specimen.id}-above`, true);
    await action('spine-select:4'); await shot(`${specimen.id}-editor`);
    if (number === 4) {
      await page.setViewportSize({ width: 1280, height: 720 }); await frame();
      await page.locator('.editor-right').hover();await page.mouse.wheel(0,1800);await frame();
      await selectVisible(4);await frame();
      const panel=await page.locator('.editor-right').boundingBox(), bend=await page.locator('[data-spine="bend"]').boundingBox();
      assert.ok(bend.y>=panel.y&&bend.y+bend.height<=panel.y+panel.height,'3D selection reveals sliders after sidebar scroll');
      await shot('compact');
      assert.ok(await page.locator('[data-action="confirm-editor"]').isVisible());
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), false);
    await action('confirm-editor'); assert.deepEqual((await read()).player.genome, made);
    await page.keyboard.down('w'); await page.evaluate(() => window.advanceTime(250)); await page.keyboard.up('w');
    const save = await exportBody(specimen.id);
    assert.deepEqual(parseGame(await readFile(save, 'utf8')).player.genome, made);
    await page.goto(`${base}/?test=1`); await action('saves'); await page.locator('#import-save').setInputFiles(save);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
    assert.deepEqual((await read()).player.genome, made);
    await page.reload(); await action('saves'); await page.locator('[data-action^="load:"]').first().click(); assert.deepEqual((await read()).player.genome, made);
    await page.keyboard.press('Tab'); assert.equal((await read()).mode, 'editor'); assert.deepEqual((await read()).editor.draft, made);
    await action('spine-preset:original'); await action('cancel-editor'); assert.deepEqual((await read()).player.genome, made);
    results.push({ id: specimen.id, label: specimen.label, passed: true, genome: made, checks: '7 direct picks, same equipment, exact sliders, idle/move/feed, confirm, movement, export/import, reload, cancel' });
    console.log(`${specimen.label}: passed`);
  }
  assert.deepEqual(errors, []);
  const comparison = await context.newPage();
  await comparison.setViewportSize({ width: 1500, height: 1270 });
  const rows = await Promise.all(silhouettes.map(async s => `<article><header><b>${s.label}</b><span>Délka ${s.genome.length.toFixed(2)} · šířka ${s.genome.width.toFixed(2)}</span></header>${(await Promise.all(['side','above'].map(async view => `<img src="data:image/png;base64,${(await readFile(path.join(output,`${s.id}-${view}.png`))).toString('base64')}"/>`))).join('')}</article>`));
  await comparison.setContent(`<html lang="cs"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#102f34;color:#e2f1dc;font:16px system-ui;padding:28px}h1{font-size:30px;margin:0 0 8px}p{color:#b7d4c9;margin:0 0 20px}article{display:grid;grid-template-columns:220px 1fr 1fr;align-items:center;border-top:1px solid #456568;height:230px;overflow:hidden}header{padding:16px}b{display:block;font-size:21px}span{display:block;font-size:13px;color:#b7d4c9;margin-top:12px}img{width:100%;height:228px;object-fit:contain}</style><h1>Pět siluet · stejné dva orgány</h1><p>Stejný filtr a bičík, stejné uchycení i velikost orgánů. Vlevo boční pohled, vpravo pohled shora. Stejná kamera a měřítko pro všechna těla.</p>${rows.join('')}</html>`);
  await comparison.screenshot({ path: path.join(output, 'comparison.png'), fullPage: true }); await comparison.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, results, errors, scope: 'Ordinary UI in DEV with manual world time; no browser genome/state writes. Not an earned campaign.' }, null, 2));
} catch (error) {
  await shot('failure'); await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), results, errors, state: await read() }, null, 2)); throw error;
} finally { await browser.close(); }
