/** Fresh current-journey, native RAF control session. No imports, browser state
 * writes, virtual clocks, advanceTime or test query. Read-only diagnostics and
 * normal UI exports assist the operator; this is not a blind human playtest.
 * Start: node scripts/fresh-organism-browser.mjs launch
 * Command: node scripts/fresh-organism-browser.mjs status
 * Command: node scripts/fresh-organism-browser.mjs move '{"x":-37,"z":-22}'
 * Browser stays alive on CDP 9223; controller listens only on loopback 9225.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, appendFile, unlink } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const out = path.resolve(process.env.FRESH_OUTPUT ?? 'evidence/era-p3/fresh-organism');
const controlPort = Number(process.env.FRESH_CONTROL_PORT ?? 9225), cdpPort = Number(process.env.FRESH_CDP_PORT ?? 9223);
const command = process.argv[2] ?? 'status';
if (command !== 'launch') {
  if (command === 'drive' || command === 'press') {
    const args = JSON.parse(process.argv[3] ?? '{}'), { chromium } = await import('playwright'), existing = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const current = existing.contexts().flatMap(c => c.pages()).find(p => p.url().includes(':5181')), state = () => current.evaluate(() => JSON.parse(window.render_game_to_text()));
    const started = Date.now(); let s = await state(), held = new Set(), success = false;
    if (s.mode === 'pause') await current.keyboard.press('Escape');
    try {
      if (command === 'press') { for (const key of args.keys ?? [args.key ?? 'KeyT']) await current.keyboard.down(key); held = new Set(args.keys ?? [args.key ?? 'KeyT']); await current.waitForTimeout(args.ms ?? 120); success = true; }
      else {
        s = await state(); let path = args.direct ? [args] : route(s, args);
        while (Date.now() - started < Math.min(60, args.seconds ?? 40) * 1000) {
          s = await state(); assert.equal(s.mode, 'game'); const vertical = s.stage === 1 && args.y !== undefined ? args.y - s.player.pos.y : 0;
          if (dist(s.player.pos, args) <= (args.tolerance ?? 1.5) && Math.abs(vertical) < 1) { success = true; break; }
          while (path.length > 1 && dist(s.player.pos, path[0]) < 1.9) path.shift(); const target = path[0], dx = target.x - s.player.pos.x, dz = target.z - s.player.pos.z;
          const yaw = s.camera.yaw, x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw), next = new Set();
          if (Math.abs(x) > .4) next.add(x > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(z) > .4) next.add(z > 0 ? 'KeyS' : 'KeyW');
          if (vertical > .7) next.add('KeyQ'); if (vertical < -.7) next.add('KeyC'); if (args.feed) next.add('Space');
          // Follow one actual wild carrier through ordinary movement. Waiting
          // is native RAF with released direction keys; no simulation clock or
          // creature state is changed. Keep it inside the visible water-sharing
          // range and the short scent range around cover.
          if (args.escort !== undefined) {
            const carrier = s.world.creatures.find(c => c.id === args.escort && c.species === 'gloom' && c.health > 0);
            assert.ok(carrier, `Wild carrier ${args.escort} is no longer present`);
            if (Math.hypot(carrier.pos.x - s.player.pos.x, carrier.pos.y - s.player.pos.y, carrier.pos.z - s.player.pos.z) > 6.8)
              for (const key of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) next.delete(key);
          }
          for (const key of held) if (!next.has(key)) await current.keyboard.up(key); for (const key of next) if (!held.has(key)) await current.keyboard.down(key); held = next;
          if (args.pulse && s.player.abilityRecharge === 0 && s.world.creatures.some(c => ['needle', 'ribbon', 'crest'].includes(c.species) && Math.hypot(c.pos.x - s.player.pos.x, c.pos.y - s.player.pos.y, c.pos.z - s.player.pos.z) < 5)) await current.keyboard.press('KeyX');
          await current.waitForTimeout(dist(s.player.pos, args) < 6 ? 80 : 150);
        }
      }
    } finally { for (const key of held) await current.keyboard.up(key); if ((await state()).mode === 'game') await current.keyboard.press('Escape'); }
    s = await state(); const report = { command, args, success, wallMs: Date.now() - started, stage: s.stage, mode: s.mode, tick: s.tick, pos: s.player.pos, health: s.player.health, energy: s.player.energy, oxygen: s.player.oxygen, moisture: s.player.moisture, dna: s.player.dna, requirements: s.requirements,
      ...(args.escort === undefined ? {} : { carrier: s.world.creatures.find(c => c.id === args.escort) }) };
    await appendFile(path.join(out, 'native-controls.jsonl'), JSON.stringify(report) + '\n'); console.log(JSON.stringify(report, null, 2)); process.exit(success ? 0 : 1);
  }
  if (command === 'view' || command === 'hud') {
    const args = JSON.parse(process.argv[3] ?? '{}'), { chromium } = await import('playwright'), existing = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const current = existing.contexts().flatMap(c => c.pages()).find(p => p.url().includes(':5181'));
    if (await current.locator('[data-action="close"]').count()) await current.locator('[data-action="close"]').first().click();
    const filename = path.join(out, `scene-${args.name ?? Date.now()}`), text = await current.locator('body').innerText();
    if (command === 'view') { await current.screenshot({ path: filename + '.png' }); await writeFile(filename + '.json', await current.evaluate(() => window.render_game_to_text())); }
    if (await current.locator('[data-action="pause"]').count()) await current.locator('[data-action="pause"]').click();
    console.log(command === 'view' ? filename + '.png' : text); process.exit(0);
  }
  // Resume the existing page through its real close button. This also permits
  // continuing a native session whose controller predates this locator fix.
  if (['move', 'burst', 'tap', 'edit'].includes(command)) {
    const { chromium } = await import('playwright'); const existing = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const current = existing.contexts().flatMap(c => c.pages()).find(p => p.url().includes(':5181'));
    if (current && await current.locator('[data-action="close"]').count()) await current.locator('[data-action="close"]').first().click();
  }
  const response = await fetch(`http://127.0.0.1:${controlPort}`, { method: 'POST', body: JSON.stringify({ command, args: JSON.parse(process.argv[3] ?? '{}') }) });
  const value = await response.json(), compact = value.player ? { stage: value.stage, mode: value.mode, tick: value.tick, pos: value.player.pos, health: value.player.health, energy: value.player.energy, oxygen: value.player.oxygen, moisture: value.player.moisture, dna: value.player.dna, meals: value.player.meals, generation: value.player.generation, requirements: value.requirements, campaign: value.campaign, errors: value.errors } : value;
  // Older live controllers save a trace at finish. The user requested keeping
  // the earned save and milestone images, without these large trace archives.
  if (command === 'finish' && response.ok && existsSync(path.join(out, 'fresh-organism.trace.zip'))) await unlink(path.join(out, 'fresh-organism.trace.zip'));
  await new Promise(resolve => process.stdout.write(JSON.stringify(['read', 'export', 'status'].includes(command) ? value : compact, null, 2) + '\n', resolve)); process.exit(response.ok ? 0 : 1);
}
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-p0-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-p0-browsers';
const { chromium } = await import('playwright');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${cdpPort}`, ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
const tracingEnabled = process.env.LUMAVORA_TRACE === '1';
let tracingActive = tracingEnabled;
if (tracingEnabled) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage(), errors = [], timeline = [], started = new Date();
page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push({ kind: 'pageerror', text: error.message }));
page.on('console', message => { if (message.type() === 'error') errors.push({ kind: 'console', text: message.text() }); });
const url = new URL(process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5181'); assert.equal(url.searchParams.has('test'), false);
const source = {};
for (const name of ['src/main.ts', 'src/game/simulation.ts', 'src/game/journey.ts', 'src/game/reef-body.ts']) source[name] = createHash('sha256').update(await readFile(name)).digest('hex');
await writeFile(path.join(out, 'provenance.json'), JSON.stringify({ url: url.href, seed: 8675309, start: 'normal new-lineage UI', sourceAtLaunch: source, nativeRAF: true, advanceTime: false, imports: false, stateWrites: false, readOnlyDiagnostics: true, firstHumanPlaytest: false, tracingEnabled, cdpPort, controlPort }, null, 2));
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
async function pause() { if ((await read()).mode === 'game') await page.locator('[data-action="pause"]').click(); }
async function resume() { if ((await read()).mode === 'pause') await page.locator('[data-action="close"]').first().click(); assert.equal((await read()).mode, 'game'); }
async function status() {
  const s = await read(); return { stage: s.stage, mode: s.mode, tick: s.tick, player: s.player, requirements: s.requirements, campaign: s.campaign, camera: s.camera, feedTarget: s.feedTarget, deathReason: s.deathReason, text: await page.locator('body').innerText(), errors };
}
async function log(event, extra = {}) {
  const s = await read(); timeline.push({ event, wall: new Date().toISOString(), tick: s.tick, stage: s.stage, mode: s.mode, pos: s.player.pos, health: s.player.health, energy: s.player.energy, oxygen: s.player.oxygen, requirements: s.requirements, ...extra });
  await writeFile(path.join(out, 'timeline.json'), JSON.stringify(timeline, null, 2));
}
async function capture(name = 'observation') {
  const index = String(timeline.length + 1).padStart(3, '0'), filename = `${index}-${name}`;
  await page.screenshot({ path: path.join(out, `${filename}.png`) });
  await writeFile(path.join(out, `${filename}.json`), JSON.stringify(await read(), null, 2)); await log(`capture:${filename}`); return filename;
}
async function exportGame(name = 'earned-progress') {
  await pause(); if ((await read()).mode === 'pause') await page.locator('[data-action="saves"]').click();
  assert.equal((await read()).mode, 'saves'); const download = page.waitForEvent('download'); await page.locator('[data-action="export"]').click();
  const file = path.join(out, `${name}.save.json`); await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8')).state; await page.locator('[data-action="close"]').click(); await pause();
  await log(`export:${name}`); return saved;
}
async function burst({ keys = [], ms = 200, name } = {}) {
  assert.ok(ms >= 0 && ms <= 60000); await resume();
  try { for (const key of keys) await page.keyboard.down(key); await page.waitForTimeout(ms); }
  finally { for (const key of [...keys].reverse()) await page.keyboard.up(key); await pause(); }
  await log('native-burst', { keys, requestedMs: ms }); if (name) await capture(name); return status();
}
function route(s, goal) {
  const cell = 1.8, n = 85, coord = v => Math.max(0, Math.min(n - 1, Math.round((v + 75.6) / cell))), id = (x, z) => z * n + x;
  const point = i => ({ x: i % n * cell - 75.6, z: Math.floor(i / n) * cell - 75.6 });
  const radius = Math.max(.6, s.player.genome.width * .8) + .3, y = goal.y ?? s.player.pos.y;
  const obstacles = s.world.obstacles.filter(o => s.stage !== 1 || !(y > o.pos.y + o.height + radius || y < o.pos.y - radius));
  const from = id(coord(s.player.pos.x), coord(s.player.pos.z)), to = id(coord(goal.x), coord(goal.z)), blocked = new Set();
  for (let i = 0; i < n * n; i++) if (obstacles.some(o => dist(point(i), o.pos) < o.radius + radius)) blocked.add(i);
  blocked.delete(from); blocked.delete(to);
  const open = [from], costs = new Map([[from, 0]]), previous = new Map(), closed = new Set();
  for (let iteration = 0; open.length && iteration < 16000; iteration++) {
    open.sort((a, b) => costs.get(a) + dist(point(a), goal) - costs.get(b) - dist(point(b), goal)); const current = open.shift();
    if (current === to) { const result = [goal]; let p = current; while (p !== from) { result.unshift(point(p)); p = previous.get(p); } return result; }
    closed.add(current); const x = current % n, z = Math.floor(current / n);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, nz = z + dz, next = id(nx, nz);
      if (nx < 0 || nx >= n || nz < 0 || nz >= n || blocked.has(next) || closed.has(next) || dx && dz && (blocked.has(id(nx, z)) || blocked.has(id(x, nz)))) continue;
      const value = costs.get(current) + Math.hypot(dx, dz) * cell;
      if (value < (costs.get(next) ?? Infinity)) { costs.set(next, value); previous.set(next, current); if (!open.includes(next)) open.push(next); }
    }
  }
  throw new Error(`No planar physical route at y=${y} to ${JSON.stringify(goal)}`);
}
async function move(args) {
  const { feed = false, tolerance = 1.7, seconds = 40, direct = false, ...goal } = args; assert.ok(seconds <= 60);
  await resume(); let s = await read(), path = direct ? [goal] : route(s, goal), previous = s.player.pos, stuck = 0, held = new Set(), arrived = false;
  const started = Date.now();
  try {
    while (Date.now() - started < seconds * 1000) {
      s = await read(); if (s.mode !== 'game') throw new Error(`Movement stopped: ${s.mode} ${s.deathReason}`);
      const vertical = s.stage === 1 && goal.y !== undefined ? goal.y - s.player.pos.y : 0;
      if (dist(s.player.pos, goal) <= tolerance && Math.abs(vertical) <= 1.1) { arrived = true; break; }
      while (path.length > 1 && dist(s.player.pos, path[0]) < 1.9) path.shift();
      const waypoint = path[0] ?? goal, dx = waypoint.x - s.player.pos.x, dz = waypoint.z - s.player.pos.z, yaw = s.camera.yaw;
      const x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dx * Math.sin(yaw) + dz * Math.cos(yaw), next = new Set();
      if (Math.abs(x) > .65) next.add(x > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(z) > .65) next.add(z > 0 ? 'KeyS' : 'KeyW');
      if (vertical > .8) next.add('KeyQ'); if (vertical < -.8) next.add('KeyC'); if (feed) next.add('Space');
      for (const key of held) if (!next.has(key)) await page.keyboard.up(key); for (const key of next) if (!held.has(key)) await page.keyboard.down(key); held = next;
      await page.waitForTimeout(dist(s.player.pos, goal) < 5 ? 100 : 180);
      if (dist(previous, s.player.pos) < .04 && Math.abs(vertical) < 1.1) stuck++; else stuck = 0; previous = s.player.pos;
      if (stuck >= 12) throw new Error(`Physically stuck at ${JSON.stringify(s.player.pos)}, waypoint ${JSON.stringify(waypoint)}`);
    }
  } finally { for (const key of held) await page.keyboard.up(key); await pause(); }
  await log('native-move', { goal, arrived, wallMs: Date.now() - started }); if (!arrived) throw new Error(`Native movement exceeded ${seconds}s`); return status();
}
async function tap({ key = 'KeyT', count = 1, wait = 1000 } = {}) {
  await resume(); try { for (let i = 0; i < count; i++) { await page.keyboard.press(key); await page.waitForTimeout(wait); if ((await read()).mode !== 'game') break; } }
  finally { await pause(); } await log('native-tap', { key, count, wait }); return status();
}
async function edit({ add = [], remove = [], fields = {}, parts = [], name } = {}) {
  await resume(); await page.keyboard.press('Tab'); assert.equal((await read()).mode, 'editor');
  for (const kind of remove) {
    const p = (await read()).editor.draft.parts.find(p => p.kind === kind); if (p) { await page.locator(`[data-action="select:${p.id}"]`).click(); await page.locator('[data-action="remove"]').click(); }
  }
  for (const kind of add) await page.locator(`[data-action="add:${kind}"]`).click();
  const range = async (selector, value) => {
    const input = page.locator(selector), min = Number(await input.getAttribute('min')), max = Number(await input.getAttribute('max')), step = Number(await input.getAttribute('step'));
    await input.focus(); const end = value > (min + max) / 2; await input.press(end ? 'End' : 'Home');
    for (let i = 0; i < Math.round(Math.abs(value - (end ? max : min)) / step); i++) await input.press(end ? 'ArrowLeft' : 'ArrowRight'); await input.press('Tab');
  };
  for (const [field, value] of Object.entries(fields)) await range(`[data-genome="${field}"]`, value);
  for (const change of parts) {
    const p = (await read()).editor.draft.parts.find(p => p.kind === change.kind); assert.ok(p); await page.locator(`[data-action="select:${p.id}"]`).click();
    for (const [field, value] of Object.entries(change)) if (field !== 'kind') {
      if (field === 'mirrored') await page.locator('[data-part="mirrored"]').setChecked(value); else await range(`[data-part="${field}"]`, value);
    }
  }
  if (name) { await page.locator('[data-genome="name"]').fill(name); await page.locator('[data-genome="name"]').press('Tab'); }
  await capture('editor'); assert.equal(await page.locator('[data-action="confirm-editor"]').isDisabled(), false, await page.locator('.editor-validation').innerText());
  const draft = (await read()).editor.draft; await page.locator('[data-action="confirm-editor"]').click(); await pause(); assert.deepEqual((await read()).player.genome, draft); await log('paid-UI-evolution'); return status();
}
await page.goto(url.href, { waitUntil: 'networkidle' }); await page.locator('#seed').fill('8675309'); await page.locator('#start-btn').click(); await pause(); await capture('fresh-birth');
const initial = await exportGame('fresh-birth'); assert.equal(initial.stage, 0); assert.equal(initial.journey.legacy, false); assert.equal(initial.journey.reefEvolution.version, 1); assert.equal(initial.journey.ecology.version, 1);
let busy = false;
const server = http.createServer(async (request, response) => {
  if (busy) { response.writeHead(409); response.end(JSON.stringify({ error: 'Command already running' })); return; }
  busy = true;
  try {
    let body = ''; for await (const chunk of request) body += chunk; const { command, args = {} } = JSON.parse(body); let result;
    if (command === 'status') result = await status();
    else if (command === 'read') result = await read();
    else if (command === 'move') result = await move(args);
    else if (command === 'burst') result = await burst(args);
    else if (command === 'tap') result = await tap(args);
    else if (command === 'edit') result = await edit(args);
    else if (command === 'capture') result = await capture(args.name);
    else if (command === 'export') result = await exportGame(args.name);
    else if (command === 'stop-trace') { if (tracingActive) { await context.tracing.stop(); tracingActive = false; } result = { tracingActive }; }
    else if (command === 'finish') { const victory = await read(); assert.equal(victory.stage, 2); assert.equal(victory.mode, 'won'); assert.equal(victory.campaign.won, true); await capture('earned-coast-victory'); await page.locator('[data-action="sandbox"]').click(); await pause(); const earned = await exportGame('earned-coast'); if (tracingActive) { await context.tracing.stop(); tracingActive = false; } result = { started, finished: new Date(), errors, final: { stage: earned.stage, campaign: earned.campaign, tick: earned.tick }, browserOpen: true, cdpPort, continuation: 'paused earned coast sandbox; continue-era is available from pause' }; await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); }
    else throw new Error(`Unknown command ${command}`);
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
  } catch (error) { await pause().catch(() => {}); await capture('control-failure').catch(() => {}); response.writeHead(500); response.end(JSON.stringify({ error: error.message, state: await status().catch(() => null) })); }
  finally { busy = false; }
});
server.listen(controlPort, '127.0.0.1'); console.log(JSON.stringify({ ready: true, url: url.href, controlPort, cdpPort, out }));
