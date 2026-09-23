/** SP-005: native library UI plus disclosed prepared land. No live state writes or clock hooks. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5188';
const out = path.resolve(process.env.CREATURE_LIBRARY_OUTPUT ?? 'evidence/sp-005/browser');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.LUMAVORA_BROWSER_CHANNEL ? { channel: process.env.LUMAVORA_BROWSER_CHANNEL } : {}), args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, acceptDownloads: true });
if (process.env.LUMAVORA_TRACE === '1') await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const action = async name => { await page.locator(`[data-action="${name}"]`).first().click(); };
const download = async (actionName, filename) => { const pending = page.waitForEvent('download'); await action(actionName); const d = await pending, file = path.join(out, filename); await d.saveAs(file); return file; };
const pauseLibrary = async () => { await page.keyboard.press('Escape'); await action('library'); };
const report = { provenance: 'Library created/edited/exported/imported through native UI. New lineage starts normally and snapshots the actual library. Land fixture uses that snapshot and a prepared body/DNA; not a full earned campaign. Subsequent movement and encounters use native keys, clicks and normal RAF.', results, errors };
async function walkTo(destination, stop = 4) {
  for (let i = 0; i < 100; i++) {
    const s = await read(), p = typeof destination === 'function' ? destination(s) : destination;
    assert.equal(s.mode, 'game'); const dx = p.x - s.player.pos.x, dz = p.z - s.player.pos.z;
    if (Math.hypot(dx, dz) < stop) return;
    const keys = []; if (Math.abs(dx) > Math.max(.5, Math.abs(dz) * .25)) keys.push(dx > 0 ? 'd' : 'a'); if (Math.abs(dz) > Math.max(.5, Math.abs(dx) * .25)) keys.push(dz > 0 ? 's' : 'w');
    for (const key of keys) await page.keyboard.down(key); await page.waitForTimeout(220); for (const key of keys) await page.keyboard.up(key);
  }
  assert.fail('Native walk failed');
}
try {
  await page.goto(base); await action('new'); await pauseLibrary(); await action('library-capture');
  assert.equal((await read()).library.length, 1); const campaign = (await read()).player;
  await action('library-new');
  await page.locator('[data-genome="name"]').fill('Jantarový poutník'); await page.locator('#library-description').fill('První vlastní tvor napříč liniemi.'); await page.locator('[data-creature="length"]').fill('1.3'); await page.locator('[data-genome="name"]').click();
  await action('creature-view:try'); await action('trial:walk'); await page.waitForTimeout(600); await page.screenshot({ path: path.join(out, 'editor.png') });
  await action('confirm-editor'); let entries = (await read()).library, creature = entries.find(c => c.name === 'Jantarový poutník'); assert.ok(creature);
  assert.deepEqual((await read()).player, campaign); results.push({ name: 'native standalone editor does not alter the campaign', passed: true });
  const first = await download(`library-export:${creature.id}`, 'creature-v1.json');
  assert.equal(JSON.parse(await readFile(first, 'utf8')).description, 'První vlastní tvor napříč liniemi.');
  await action(`library-edit:${creature.id}`); await page.locator('[data-genome="name"]').fill('Jantarový poutník II'); await page.locator('#library-description').fill('Druhá podoba.'); await action('confirm-editor');
  creature = (await read()).library.find(c => c.id === creature.id); assert.equal(creature.revision, 2);
  const current = await download(`library-export:${creature.id}`, 'creature-v2.json');
  await page.locator('#import-creature').setInputFiles(current); await page.waitForTimeout(150); assert.equal((await read()).library.length, 2);
  await page.locator('#import-creature').setInputFiles(first); await page.waitForTimeout(150); assert.equal((await read()).library.length, 3);
  entries = (await read()).library;
  const bad = path.join(out, 'corrupt.json'); await writeFile(bad, '{"format":"lumavora-creature","version":99}'); await page.locator('#import-creature').setInputFiles(bad); await page.waitForTimeout(150);
  assert.deepEqual((await read()).library, entries); assert.deepEqual((await read()).player, campaign); assert.ok(await page.locator('.error').count());
  results.push({ name: 'revision, export, duplicate import, collision copy and atomic malformed import', passed: true });
  await page.screenshot({ path: path.join(out, 'library.png') });
  await action('close'); await page.keyboard.press('Escape'); await action('menu'); await action('new'); await page.keyboard.press('Escape'); await action('saves');
  const birth = await download('export', 'new-lineage.json'), original = JSON.parse(await readFile(birth, 'utf8')).state;
  assert.equal(original.stage, 0); assert.ok(original.worlds[2].creatureDesigns.some(d => d.source === 'library' && d.creation.genome.name.startsWith('Jantarový')));
  results.push({ name: 'ordinary New lineage snapshots actual saved creations at birth', passed: true });
  const ssr = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
  const fixture = path.join(out, 'land.fixture.json');
  try {
    const { creatureLibraryLandFixture } = await ssr.ssrLoadModule('/tests/fixtures/creature-library.ts');
    const { serializeGame } = await ssr.ssrLoadModule('/src/game/persistence.ts');
    await writeFile(fixture, serializeGame(creatureLibraryLandFixture(original.worlds[2].creatureDesigns, original.seed)));
  } finally { await ssr.close(); }
  await page.locator('#import-save').setInputFiles(fixture); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  await page.waitForTimeout(1500); const mark = await page.evaluate(() => window.lumavora_metrics().samples.length); await page.waitForTimeout(5000);
  const metrics=await page.evaluate(() => window.lumavora_metrics()), frames=metrics.samples.slice(mark).sort((a,b)=>a-b);
  report.performance={viewport:'1280x720',samples:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],over50ms:frames.filter(v=>v>50).length};
  await pauseLibrary(); for (const c of (await read()).library) await action(`library-delete:${c.id}`); assert.equal((await read()).library.length, 0); await action('close');
  let s = await read(); const nest = s.creatureStage.nests[0], targetId = nest.residents[0];
  await walkTo(s => s.world.creatures.find(c => c.id === targetId).pos, 4);
  await action('species-focus:bell'); await page.keyboard.press('v'); await page.waitForTimeout(200); s = await read(); assert.ok(s.creatureStage.encounter); assert.ok((await page.locator('.species-target').innerText()).includes('Z knihovny'));
  await page.screenshot({ path: path.join(out, 'encounter.png') });
  for (let i = 0; i < 14; i++) {
    s = await read(); if (!s.creatureStage.encounter) break;
    if (s.creatureStage.recharge > 0) { await page.waitForTimeout(250); i--; continue; }
    await action(`species-action:${s.creatureStage.encounter.requested}`); await page.waitForTimeout(150);
  }
  assert.equal((await read()).creatureStage.nests[0].outcome, 'friend'); await page.keyboard.press('r'); await page.waitForTimeout(250); assert.equal((await read()).creatureStage.pack.length, 1);
  await page.screenshot({ path: path.join(out, 'friend.png') });
  await page.keyboard.press('Escape'); await action('saves'); const saved = await download('export', 'encounter-save.json');
  await page.locator('#import-save').setInputFiles(saved); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  assert.deepEqual((await read()).world.creatureDesigns, original.worlds[2].creatureDesigns); assert.equal((await read()).creatureStage.pack.length, 1);
  results.push({ name: 'native encounter and recruitment survive save/import after the entire library is deleted', passed: true });
  await pauseLibrary(); await action('library-capture'); assert.equal((await read()).library.length, 1);
  await page.reload(); await action('library'); assert.equal((await read()).library.length, 1);
  results.push({ name: 'saved campaign creature persists in the independent library across reload', passed: true });
  assert.deepEqual(errors, []);
} catch (error) { report.failure = String(error); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error; }
finally { await writeFile(path.join(out, 'results.json'), JSON.stringify({ ...report, final: await read().catch(() => null) }, null, 2)); if (process.env.LUMAVORA_TRACE === '1') await context.tracing.stop({ path: path.join(out, 'diagnostic.trace.zip') }); await browser.close(); }
