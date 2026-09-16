/** Targeted shared-machine-editor regression, not a campaign playthrough.
 * Imports a validated existing P2 UI export; all subsequent input is real UI.
 * LUMAVORA_URL=http://127.0.0.1:5180 node scripts/machine-editor-browser.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-p0-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-p0-browsers';
const { chromium } = await import('playwright');
const url = new URL(process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5180'); url.searchParams.set('test', '1');
const output = path.resolve(process.env.MACHINE_EDITOR_OUTPUT ?? 'evidence/era-p2/machine-editor');
const fixture = path.resolve(process.env.MACHINE_EDITOR_FIXTURE ?? 'tests/fixtures/saves/machines-restoration-completed.save.json');
const digest = value => createHash('sha256').update(value).digest('hex');
await mkdir(output, { recursive: true });
const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'error' });
let parseGame;
try { ({ parseGame } = await ssr.ssrLoadModule('/src/game/persistence.ts')); } finally { await ssr.close(); }
const fixtureBytes = await readFile(fixture), source = parseGame(fixtureBytes.toString());
assert.equal(source.stage, 4); assert.equal(source.machines.version, 2); assert.ok(source.machines.resource >= 100); assert.ok(source.machines.fleet.length < 8);
const sources = {};
for (const name of ['src/main.ts', 'src/game/blueprint.ts', 'src/game/machines.ts', 'src/render/machine.ts', 'src/render/renderer.ts']) sources[name] = digest(await readFile(name));
await writeFile(path.join(output, 'provenance.json'), JSON.stringify({ fixture: path.relative(process.cwd(), fixture), fixtureSha256: digest(fixtureBytes), sources, viewport: [1536, 960], input: 'normal UI clicks, pointer drags and keyboard only', observation: 'read-only render_game_to_text and downloaded UI exports', simulation: 'DEV test=1 freezes simulation; no advanceTime or browser state writes', scope: 'Prepared editor regression starting from an existing machine-era UI export, not earned full campaign progression.' }, null, 2));
const errors = [], externalRequests = [], timeline = [], screenshots = [], started = new Date();
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
if(process.env.LUMAVORA_TRACE==='1')await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push({ kind: 'pageerror', message: e.message, stack: e.stack }));
page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', message: m.text() }); });
page.on('request', request => { if (!request.url().startsWith(url.origin) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) externalRequests.push(request.url()); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function frames(count = 2) { for (let i = 0; i < count; i++) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))); }
async function action(name) { timeline.push({ action: name }); await page.locator(`[data-action="${name}"]`).first().click(); await frames(); }
async function capture(name) {
  await frames(); const filename = path.join(output, `${name}.png`); await page.screenshot({ path: filename });
  await writeFile(path.join(output, `${name}.json`), JSON.stringify(await read(), null, 2)); screenshots.push(path.relative(process.cwd(), filename));
}
async function exportState(name) {
  if ((await read()).mode === 'game') await action('pause');
  if ((await read()).mode === 'pause') await action('saves');
  const download = page.waitForEvent('download'); await action('export');
  const filename = path.join(output, `${name}.save.json`); await (await download).saveAs(filename);
  const result = parseGame(await readFile(filename, 'utf8')); await action('close'); assert.equal((await read()).mode, 'game'); return result;
}
async function open() { await action('machine-editor:tank'); assert.equal((await read()).mode, 'editor'); assert.equal((await read()).editor.draft.kind, 'vehicle'); }
async function clearNoopHistory(expected) {
  for (let i = 0; i < 40 && !await page.locator('[data-action="undo"]').isDisabled(); i++) await action('undo');
  assert.deepEqual((await read()).editor.draft, expected); assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true);
}
async function findModulePoint(id) {
  const initial = (await read()).editor.draft;
  // Search only the actual visible canvas. A successful selection must be read
  // back from production's real raycaster; there are no hidden renderer calls.
  for (let y = 410; y <= 605; y += 15) for (let x = 580; x <= 985; x += 15) {
    await page.mouse.click(x, y); await frames(1);
    if ((await read()).editor.selected === id) {
      const point = { x, y }; await clearNoopHistory(initial); timeline.push({ canvasPick: { id, point } }); return point;
    }
  }
  throw new Error(`No actual canvas raycast selected module ${id}`);
}
async function dragModule(id, point) {
  const before = (await read()).editor.draft;
  for (const destination of [{ x: 768, y: 490 }, { x: 815, y: 455 }, { x: 740, y: 460 }]) {
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await frames(1);
    assert.equal((await read()).editor.selected, id, 'Pointerdown must pick the intended module');
    await page.mouse.move(destination.x, destination.y, { steps: 24 }); await page.mouse.up(); await frames();
    const changed = (await read()).editor.draft, part = changed.parts.find(part => part.id === id), prior = before.parts.find(part => part.id === id);
    if (part.axial !== prior.axial || part.angle !== prior.angle) {
      timeline.push({ canvasDrag: { id, from: point, to: destination, before: { axial: prior.axial, angle: prior.angle }, after: { axial: part.axial, angle: part.angle } } });
      assert.ok(Number.isFinite(part.axial) && Number.isFinite(part.angle)); assert.ok(Math.abs(part.axial) <= .93 && Math.abs(part.angle) <= Math.PI);
      await action('undo'); assert.deepEqual((await read()).editor.draft, before);
      assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true, 'One canvas drag must undo in one transaction');
      await action('redo'); assert.deepEqual((await read()).editor.draft, changed); return changed;
    }
    await clearNoopHistory(before);
  }
  throw new Error('Canvas drag did not change axial/angle through the hull UV surface');
}

let passed = false, detail = null;
try {
  await page.goto(url.href, { waitUntil: 'networkidle' }); await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await action('saves'); await page.locator('#import-save').setInputFiles(fixture); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game'); await frames();
  const before = await exportState('before-editor'); await open(); const initial = (await read()).editor.draft;
  const module = initial.parts.find(part => part.kind === 'drill'); assert.ok(module);
  await capture('01-initial-machine-editor');
  const point = await findModulePoint(module.id), dragged = await dragModule(module.id, point); await capture('02-canvas-dragged-module');
  await action(`select:${module.id}`); await page.locator('[data-part="mirrored"]').check(); await frames();
  const mirrored = (await read()).editor.draft; assert.equal(mirrored.parts.find(part => part.id === module.id).mirrored, true);
  await action('undo'); assert.deepEqual((await read()).editor.draft, dragged); await action('redo'); assert.deepEqual((await read()).editor.draft, mirrored);
  await capture('03-mirrored-module');
  await action(`select:${initial.parts.find(part => part.kind === 'hull').id}`); await action('remove');
  assert.equal((await read()).editor.draft.parts.some(part => part.kind === 'hull'), false);
  assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), true); assert.match(await page.locator('.editor-validation').innerText(), /trup/i);
  await capture('04-missing-hull-blocked'); await action('undo'); assert.deepEqual((await read()).editor.draft, mirrored);
  assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), false);
  await action('cancel-editor'); assert.equal((await read()).mode, 'game');
  assert.deepEqual(await exportState('after-cancel'), before, 'Cancel must preserve every committed state and checkpoint field');

  await open(); const paidPoint = await findModulePoint(module.id); await dragModule(module.id, paidPoint);
  await action(`select:${module.id}`); await page.locator('[data-part="mirrored"]').check(); await frames();
  await page.locator('[data-genome="name"]').fill('Jantarový dvojvrt'); await page.locator('[data-genome="name"]').press('Tab');
  const hue = page.locator('[data-genome="hue"]'); await hue.focus(); await hue.press('ArrowRight'); await hue.press('Tab'); await frames();
  const preview = await read(), expected = preview.editor.draft, cost = preview.editor.cost;
  assert.ok(cost > 0 && cost <= before.machines.resource); await capture('05-paid-exact-draft');
  await action('confirm-editor'); assert.equal((await read()).mode, 'game');
  const committed = await exportState('paid-commit'), unit = committed.machines.fleet.at(-1), saved = committed.machines.blueprints.find(design => design.id === unit.blueprint);
  assert.deepEqual(saved.blueprint, expected); assert.equal(committed.machines.resource, before.machines.resource - cost);
  assert.equal(committed.machines.fleet.length, before.machines.fleet.length + 1); assert.equal(committed.machines.blueprints.length, before.machines.blueprints.length + 1);
  assert.deepEqual(committed.machines.fleet.slice(0, -1), before.machines.fleet); assert.deepEqual(committed.machines.blueprints.slice(0, -1), before.machines.blueprints);
  assert.deepEqual({ ...committed, machines: before.machines }, before, 'Paid machine construction must preserve the complete organism, world, tribe, campaign and checkpoint');
  await action(`machine-select:${unit.id}`); await action('machine-home'); await frames(4); await capture('06-committed-world-machine');
  await page.reload({ waitUntil: 'networkidle' }); await action('saves'); await action(`load:${committed.id}`);
  assert.deepEqual(await exportState('after-reload'), committed, 'Real Save/Load must preserve the paid draft and whole committed state');
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  detail = { module: module.id, canvasPoint: point, cost, exactPaidBlueprint: saved.blueprint, committedMachine: unit.id, verified: ['actual canvas module picking and UV drag', 'single-transaction drag undo/redo', 'mirroring undo/redo', 'missing hull validation blocks commit', 'full-state cancel and export', 'paid exact-draft commit with preserved existing fleet and historical organism', 'full-state UI save/reload'] };
  passed = true;
} catch (error) {
  await page.mouse.up().catch(() => {}); await capture('failure').catch(() => {}); detail = { error: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  if(process.env.LUMAVORA_TRACE==='1')await context.tracing.stop({ path: path.join(output, 'trace.zip') }); await browser.close();
  await writeFile(path.join(output, 'timeline.json'), JSON.stringify(timeline, null, 2));
  const result = { passed, started: started.toISOString(), finished: new Date().toISOString(), ...detail, screenshots, errors, externalRequests };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
}
