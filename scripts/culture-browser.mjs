/** Prepared initial campaign only; all cultural work and play uses production UI + native RAF. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const out = path.resolve(process.env.CULTURE_OUTPUT ?? 'evidence/sp-008b/production');
await mkdir(out, { recursive: true });
const ssr = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
const { parseGame, serializeGame } = await ssr.ssrLoadModule('/src/game/persistence.ts');
const { continueToTribeEra, makeCheckpoint } = await ssr.ssrLoadModule('/src/game/simulation.ts');
const { enableLineageHistory } = await ssr.ssrLoadModule('/src/game/lineage-history.ts');
const { openGround, unitNavigation } = await ssr.ssrLoadModule('/src/game/unit-motion.ts');
const { memberDiet } = await ssr.ssrLoadModule('/src/game/tribe.ts');
const s = parseGame(await readFile('tests/fixtures/saves/won-current-coast.fixture.json', 'utf8'));
enableLineageHistory(s); assert.ok(continueToTribeEra(s));
const t = s.tribe, own = t.members.filter(u => !u.species), home = t.huts[0].pos;
t.food = 180;
for (const [i, tool] of ['basket', 'drum', 'spear'].entries()) {
  t.huts.push({ id: t.nextId++, kind: 'workshop', tool, pos: openGround(s.world, home, i + 6, 10), progress: 1, health: 100 }); t.unlocked.push(tool);
}
// Prepared members near home and one replenished existing source: not earned travel/construction/harvest.
for (const [i, u] of own.entries()) { u.pos = openGround(s.world, home, i + 1, 6); u.navigation = unitNavigation(u.pos); }
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const resource = s.world.resources.filter(r => memberDiet(s, own[0]).includes(r.kind) && distance(r.pos, home) > 12 && distance(r.pos, home) < 35 && s.world.obstacles.every(o => distance(o.pos, r.pos) > o.radius + 2)).sort((a, b) => distance(a.pos, home) - distance(b.pos, home))[0];
assert.ok(resource); resource.amount = 12; resource.max = Math.max(resource.max, 12); resource.regen = 0;
makeCheckpoint(s);
const fixture = path.join(out, 'prepared-tribe.fixture.json'); await writeFile(fixture, serializeGame(s)); await ssr.close();
if (process.argv.includes('--fixtures-only')) process.exit(0);
const browser = await chromium.launch({ headless: true, ...(process.env.LUMAVORA_BROWSER_CHANNEL ? { channel: process.env.LUMAVORA_BROWSER_CHANNEL } : {}), args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
if (process.env.LUMAVORA_TRACE === '1') await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage(), errors = [], results = [], timeline = [];
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const action = async name => { timeline.push(name); console.log(name); await page.locator(`[data-action="${name}"]`).first().click(); };
const capture = name => page.screenshot({ path: path.join(out, `${name}.png`) });
async function until(predicate, label, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { const v = await read(); assert.equal(v.mode, 'game', label); if (predicate(v)) return v; await page.waitForTimeout(200); }
  throw new Error(`Timed out: ${label}`);
}
async function select(id) { await action(`tribe-select:${id}`); }
async function exportGame(name) {
  await action('pause'); await action('saves');
  const [download] = await Promise.all([page.waitForEvent('download'), action('export')]); const file = path.join(out, `${name}.save.json`); await download.saveAs(file);
  return { file, saved: parseGame(await readFile(file, 'utf8')) };
}
async function targetClick(kind, id) {
  const size = page.viewportSize();
  for (let attempt = 0; attempt < 16; attempt++) {
    const v = await read(), target = v.commandTargets.find(v => v.target.kind === kind && v.target.id === id)?.screen;
    assert.ok(target, `visible ${kind}:${id}`); console.log('frame-target', kind, id, Math.round(target.x), Math.round(target.y));
    const x = target.x / 100 * size.width, y = target.y / 100 * size.height;
    const key = x < 380 ? 'a' : x > size.width - 380 ? 'd' : y < 230 ? 'w' : y > size.height - 210 ? 's' : null;
    if (!key) {
      assert.equal(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.tagName, {x,y}), 'CANVAS', 'uncovered world target');
      await page.mouse.click(x, y, { button: 'right' }); return;
    }
    // Move the real camera until the source is clear of HUD panels; never alter live state.
    await page.keyboard.down(key); await page.waitForTimeout(250); await page.keyboard.up(key); await page.waitForTimeout(300);
  }
  throw new Error('Could not frame world target with keyboard panning');
}
try {
  await page.goto(process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5194'); await action('saves'); await page.locator('#import-save').setInputFiles(fixture);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const liveControl = await page.locator('[data-action="tribe-culture"]').elementHandle(); await page.waitForTimeout(1200);
  assert.ok(await liveControl.evaluate(node => node.isConnected), 'HUD counters must preserve the native input target');
  results.push({ check: 'HUD updates preserve live native controls' });
  await select(own[0].id); await action('tribe-equip:basket'); await action('tribe-culture');
  const tick = (await read()).tick;
  await page.locator('#culture-name').fill('Hlas zahrady'); await action('culture-part:head:plume'); await action('culture-part:back:pouches'); await action('culture-save');
  const envoy = (await read()).cultureEditor.draft;
  const before = (await read()).tribe.food; await action('culture-equip'); let v = await read(); assert.equal(before - v.tribe.food, 10); assert.deepEqual(v.tribe.members[0].outfit, envoy);
  await action(`culture-member:${own[0].id}`); await action(`culture-member:${own[2].id}`); await action('culture-equip');
  assert.equal((await read()).tick, tick, 'editor pauses simulation');
  await action(`culture-member:${own[2].id}`); await action(`culture-member:${own[0].id}`); await capture('envoy-editor');
  const [download] = await Promise.all([page.waitForEvent('download'), action('culture-export')]); const outfitFile = path.join(out, 'envoy.outfit.json'); await download.saveAs(outfitFile);
  await action('culture-new'); await page.locator('#culture-name').fill('Jantarová stráž'); await action('culture-part:head:crest'); await action('culture-part:back:shell'); await action('culture-color:ochre'); await action('culture-save');
  await action(`culture-member:${own[0].id}`); await action(`culture-member:${own[1].id}`); await action('culture-equip');
  const guard = (await read()).cultureEditor.draft;
  await page.setViewportSize({ width: 1280, height: 720 }); await capture('guard-editor-1280');
  assert.equal(await page.locator('[data-action="culture-equip"]').isVisible(), true);
  assert.equal(await page.locator('[data-action="culture-close"]').isVisible(), true);
  // A new revision leaves worn snapshots intact; importing the older export creates a separate design.
  await action(`culture-load:${envoy.id}`); await action('culture-part:head:crest'); await action('culture-save');
  assert.equal((await read()).tribe.members[0].outfit.head, 'plume');
  await page.locator('#import-outfit').setInputFiles(outfitFile); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).tribe.culture.designs.length === 3); v = await read(); assert.equal(v.tribe.culture.designs.length, 3); assert.notEqual(v.cultureEditor.draft.id, envoy.id);
  const malformed = path.join(out, 'invalid-outfit.json'); await writeFile(malformed, JSON.stringify({ format: 'lumavora-outfit', version: 99 }));
  const stable = structuredClone(v.tribe); await page.locator('#import-outfit').setInputFiles(malformed); await page.waitForFunction(() => document.querySelector('.culture-feedback')?.textContent?.includes('Neplatná')); assert.deepEqual((await read()).tribe, stable);
  results.push({ check: 'two paid outfits, paused editor, immutable revision and atomic import', envoy, guard, stock: stable.food });
  await action('culture-close'); await select(own[1].id); await action('tribe-equip:spear'); await select(own[2].id); await action('tribe-equip:drum');
  await exportGame('outfitted'); await action('close');
  await select(own[0].id); await action('tribe-home'); await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(800);
  await targetClick('food', resource.id);
  assert.equal((await read()).tribe.members.find(u => u.id === own[0].id).orders[0]?.target.id, resource.id, 'native click issued the intended gather order');
  v = await until(v => v.tribe.members.find(u => u.id === own[0].id).cargo > 5, 'larger real basket load', 70);
  assert.equal(v.tribe.members.find(u => u.id === own[0].id).tool, 'basket');
  await page.waitForFunction(() => Number(document.querySelector('.tribe-member-stats span:last-child b')?.textContent) > 5);
  await capture('carrying'); const cargo = v.tribe.members.find(u => u.id === own[0].id).cargo, stock = v.tribe.food;
  v = await until(v => v.tribe.members.find(u => u.id === own[0].id).cargo === 0 && v.tribe.food > stock, 'physical delivery');
  results.push({ check: 'bags and basket transport more than five actual portions', witnessedCargo: cargo, deliveredStockIncrease: v.tribe.food - stock });
  await action('tribe-stop');
  const garden = v.tribe.neighbours.find(n => n.identity === 'garden');
  await select(own[2].id); await action(`tribe-socialize:${garden.id}`);
  v = await until(v => v.tribe.neighbours.find(n => n.id === garden.id).tribute === 8, 'physical diplomatic gift', 70);
  const firstRelation = v.tribe.neighbours.find(n => n.id === garden.id).relation, firstTick = v.tick;
  await page.waitForTimeout(1200); v = await read();
  const rate = (v.tribe.neighbours.find(n => n.id === garden.id).relation - firstRelation) / ((v.tick - firstTick) / 60);
  assert.ok(rate > 3.85 && rate < 4.15, `plume+drum rate ${rate}`);
  await action(`tribe-focus:${garden.id}`); await page.waitForTimeout(700); await capture('diplomacy');
  await action('tribe-retreat'); results.push({ check: 'plume and drum improve contact diplomacy', relationPerSecond: rate });
  const terrace = v.tribe.neighbours.find(n => n.identity === 'terrace'), defenderHealth = new Map(terrace.society.members.map(u => [u.id, u.health]));
  await select(own[1].id); await action(`tribe-attack:${terrace.id}`);
  v = await until(v => v.tribe.neighbours.find(n => n.id === terrace.id).society.members.some(u => u.health < (defenderHealth.get(u.id) ?? u.health) - 15), 'guard attacks an active neighbour', 75);
  await action(`tribe-focus:${terrace.id}`); await page.waitForTimeout(500); await capture('combat');
  assert.deepEqual(v.tribe.members.find(u => u.id === own[1].id).outfit, guard); await action('tribe-retreat');
  results.push({ check: 'crest and shell used in combat with active defenders', playerHealth: v.tribe.members.find(u => u.id === own[1].id).health });
  await select(own[0].id); await action('tribe-home'); await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(500); await capture('hud-1280');
  const { file, saved } = await exportGame('active-campaign');
  assert.deepEqual(saved.player.genome, s.player.genome); assert.deepEqual(saved.lineageHistory, s.lineageHistory);
  await page.locator('#import-save').setInputFiles(file); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  await action('pause'); v = await read(); assert.deepEqual(v.tribe.culture, saved.tribe.culture); assert.deepEqual(v.tribe.members.map(u => u.outfit), saved.tribe.members.map(u => u.outfit));
  assert.deepEqual(v.lineageHistory, saved.lineageHistory);
  await action('close'); await action('pause'); await action('save');
  await page.reload(); await action('saves');
  const loads = page.locator('[data-action^="load:"]'); await loads.first().click(); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  v = await read(); assert.deepEqual(v.tribe.culture, saved.tribe.culture); assert.deepEqual(v.tribe.members.map(u => u.outfit), saved.tribe.members.map(u => u.outfit));
  results.push({ check: 'campaign export/import and reload/load preserve clothes, designs and history', tick: v.tick });
  await action('tribe-culture'); await capture('loaded-editor-1280');
  assert.deepEqual(errors, []);
} catch (error) { await capture('failure'); await writeFile(path.join(out, 'failure-state.json'), JSON.stringify(await read(), null, 2)); throw error; }
finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ prepared: 'Completed coast, 180 food, three workshops, members near home and one existing replenished source. No prebuilt cultural designs; production UI only after import.', results, errors, timeline }, null, 2));
  if (process.env.LUMAVORA_TRACE === '1') await context.tracing.stop({ path: path.join(out, 'trace.zip') });
  await browser.close();
}
