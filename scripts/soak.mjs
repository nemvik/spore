#!/usr/bin/env node
/** Real-time UI soak. No state fixtures, manual clock, or direct game-state writes. */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL(process.env.LUMAVORA_URL || process.env.BASE_URL || 'http://127.0.0.1:5173');
const requestedSeconds = Number(process.env.SOAK_DURATION_SECONDS || 600);
const durationSeconds = Number.isFinite(requestedSeconds) ? Math.max(600, requestedSeconds) : 600;
const output = path.resolve(project, process.env.SOAK_OUTPUT || 'evidence/quality/regression/soak');
const quality = ['low', 'medium', 'high'].includes(process.env.SOAK_QUALITY) ? process.env.SOAK_QUALITY : 'medium';
const headless = process.env.SOAK_HEADLESS !== '0';
const viewport = { width: 1920, height: 1080 };

if (process.argv.includes('--help')) {
  console.log('Run pnpm dev in another terminal, then pnpm test:soak. Minimum 600 seconds of active real-time gameplay.');
  console.log('Optional: LUMAVORA_URL, SOAK_DURATION_SECONDS (>=600), SOAK_QUALITY, SOAK_HEADLESS=0, SOAK_OUTPUT, SOAK_TRACE=1, PLAYWRIGHT_BROWSERS_PATH.');
  process.exit(0);
}
if (url.searchParams.has('test')) throw new Error('Soak refuses ?test: it disables normal real-time simulation.');

// Playwright resolves its browser registry during import; set the path first.
// Respect an explicit registry; use the local benchmark cache only when present.
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const { chromium } = await import('playwright');
await fs.mkdir(output, { recursive: true });

const started = Date.now();
const report = {
  kind: 'real-time-browser-soak', seed: 8675309, status: 'running',
  requestedActiveSeconds: durationSeconds, startedAt: new Date(started).toISOString(),
  provenance: { url: url.href, platform: process.platform, architecture: process.arch, osRelease: os.release(), node: process.version, browser: null, headless, browserPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? 'Playwright default cache', viewport, quality, webgl: null },
  policy: 'Only Playwright keyboard, mouse and UI actions change the game. Diagnostics and GPU counters are read-only. advanceTime is never called. RAF samples use real elapsed time.',
  rounds: [], actions: [], errors: [], console: [], failedRequests: [], screenshots: [], frameMeasurements: [],
  checks: {}, elapsedWallSeconds: 0, activeGameplayWallSeconds: 0, simulatedSecondsAdvanced: 0,
};
const frames = new Map();
let browser, context, page, cdp;
let activeMs = 0, lastTick = null, simulationTicks = 0, reloads = 0, recoveries = 0, editorCycles = 0;
let lastScreenshot = -Infinity, lastProgress = 0;
const keys = new Set();
const elapsed = () => (Date.now() - started) / 1000;
const log = (action, details = {}) => report.actions.push({ wallSeconds: Number(elapsed().toFixed(3)), action, ...details });
const error = (kind, value) => report.errors.push({ wallSeconds: Number(elapsed().toFixed(3)), kind, message: value instanceof Error ? value.message : String(value) });
const percentile = (values, fraction) => values.length ? values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))] : null;
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const waitMode = mode => page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).mode === expected, mode, { timeout: 10_000 });

async function setKeys(next) {
  const wanted = new Set(next);
  for (const key of keys) if (!wanted.has(key)) { await page.keyboard.up(key); keys.delete(key); }
  for (const key of wanted) if (!keys.has(key)) { await page.keyboard.down(key); keys.add(key); }
}

async function capture(name) {
  const filename = `${String(report.screenshots.length).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(output, filename), timeout: 20_000 });
  report.screenshots.push({ file: filename, wallSeconds: Number(elapsed().toFixed(3)) });
  lastScreenshot = Date.now();
}

async function drainFrames() {
  const batches = await page.evaluate(() => {
    const value = window.__lumavoraSoakRaf;
    if (!value) return [];
    const result = Object.values(value.buckets);
    value.buckets = {};
    return result;
  });
  for (const batch of batches) {
    const key = `${batch.width}x${batch.height}`;
    let aggregate = frames.get(key);
    if (!aggregate) { aggregate = { width: batch.width, height: batch.height, quality, samples: [], activeMs: 0 }; frames.set(key, aggregate); }
    aggregate.samples.push(...batch.samples);
    aggregate.activeMs += batch.activeMs;
    activeMs += batch.activeMs;
  }
}

async function readyToPlay() {
  let s = await state();
  if (s.mode === 'death') {
    log('death', { reason: s.deathReason, tick: s.tick });
    await setKeys([]);
    await page.locator('[data-action="recover"]').click();
    await waitMode('game');
    recoveries++;
    lastTick = null;
    log('recover-generation');
  } else if (s.mode === 'pause' || s.mode === 'journal' || s.mode === 'help' || s.mode === 'saves') {
    await setKeys([]);
    await page.locator('[data-action="close"]').first().click();
    await waitMode('game');
  } else if (s.mode === 'editor') {
    await page.locator('[data-action="cancel-editor"]').first().click();
    await waitMode('game');
  } else if (s.mode !== 'game') {
    throw new Error(`Unexpected mode during soak: ${s.mode}`);
  }
  s = await state();
  if (lastTick !== null && s.tick >= lastTick) simulationTicks += s.tick - lastTick;
  lastTick = s.tick;
  return s;
}

/** Read-only feedback steers ordinary camera-relative WASD inputs. */
async function walkTo(target, maxMilliseconds = 6000) {
  const deadline = Date.now() + maxMilliseconds;
  let reached = false;
  while (Date.now() < deadline) {
    const s = await readyToPlay();
    const dx = target.x - s.player.pos.x, dz = target.z - s.player.pos.z;
    if (Math.hypot(dx, dz) < 1.9) { reached = true; break; }
    const yaw = s.camera.yaw;
    const x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const movement = [];
    if (Math.abs(x) > 0.8) movement.push(x > 0 ? 'd' : 'a');
    if (Math.abs(z) > 0.8) movement.push(z > 0 ? 's' : 'w');
    if (s.player.energy < 83) movement.push('Space');
    await setKeys(movement);
    await page.waitForTimeout(260);
  }
  await setKeys([]);
  return reached;
}

async function activeRound(round) {
  const end = Date.now() + 22_000;
  const waypoints = [{ x: -6, z: -4 }, { x: 6, z: -4 }, { x: 6, z: 6 }, { x: -6, z: 6 }];
  let visits = 0;
  while (Date.now() < end) {
    const s = await readyToPlay();
    const available = s.world.resources.filter(r => r.amount >= 1 && s.stats.diet.includes(r.kind) && Math.hypot(r.pos.x, r.pos.z) < 18)
      .sort((a, b) => Math.hypot(a.pos.x - s.player.pos.x, a.pos.z - s.player.pos.z) - Math.hypot(b.pos.x - s.player.pos.x, b.pos.z - s.player.pos.z));
    const food = s.player.energy < 83 ? available[0] : null;
    await walkTo(food ? food.pos : waypoints[(round + visits) % waypoints.length], 4500);
    if (food) { await setKeys(['Space']); await page.waitForTimeout(1250); await setKeys([]); }
    else await page.waitForTimeout(400);
    visits++;
  }
  await walkTo({ x: 0, z: 0 }, 7000);
  await setKeys([]);
  await page.waitForTimeout(400);
  const s = await readyToPlay();
  if (Math.hypot(s.player.pos.x, s.player.pos.z) >= 10) throw new Error('Normal movement could not return to the nursery.');
  log('movement-and-feeding', { round, visits, meals: s.player.meals, pos: s.player.pos });
}

async function editorCycle(round) {
  const before = await readyToPlay();
  await setKeys([]);
  await page.keyboard.press('Tab');
  await waitMode('editor');
  await page.locator('[data-action="add:eyes"]').click();
  await page.locator('[data-action="undo"]').click();
  await page.locator('[data-action="redo"]').click();
  const draft = await state();
  if (draft.editor.draft.parts.length !== before.player.genome.parts.length + 1) throw new Error('Editor add/undo/redo did not preserve the draft part.');
  const size = page.locator('[data-genome="length"]');
  await size.focus();
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(960, 500);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1000, 520, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  if (editorCycles === 0) await capture('editor-cycle');
  await page.locator('[data-action="cancel-editor"]').first().click();
  await waitMode('game');
  const after = await state();
  if (JSON.stringify(after.player.genome) !== JSON.stringify(before.player.genome) || after.player.dna !== before.player.dna) throw new Error('Cancelling the editor changed the live genome or DNA.');
  editorCycles++;
  log('editor-add-undo-redo-cancel', { round, liveParts: after.player.genome.parts.length });
}

async function pauseAndResize(round) {
  await page.keyboard.press('Escape');
  await waitMode('pause');
  const before = await state();
  await page.waitForTimeout(500);
  const after = await state();
  if (after.tick !== before.tick) throw new Error('Simulation advanced while paused.');
  await page.locator('[data-action="close"]').first().click();
  await waitMode('game');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(900);
  await page.setViewportSize(viewport);
  await page.waitForTimeout(500);
  log('pause-resume-resize', { round, pausedTick: before.tick });
}

async function saveAndReload(round) {
  await setKeys([]);
  await readyToPlay();
  await page.keyboard.press('Escape');
  await waitMode('pause');
  const saved = await state();
  await page.locator('[data-action="save"]').click();
  if ((await page.locator('.error').allTextContents()).some(text => !text.includes('Paměť linie uložena'))) throw new Error('Save UI reported an error.');
  await drainFrames();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await page.locator('[data-action="saves"]').first().click();
  const slot = page.locator('.save-row').filter({ hasText: 'seed 8675309' }).first();
  await slot.locator('[data-action^="load:"]').click();
  await waitMode('game');
  const loaded = await state();
  if (loaded.seed !== saved.seed || loaded.stage !== saved.stage || loaded.tick < saved.tick || loaded.player.meals !== saved.player.meals || JSON.stringify(loaded.player.genome) !== JSON.stringify(saved.player.genome)) throw new Error('Reloaded UI slot did not preserve the saved lineage.');
  reloads++;
  lastTick = loaded.tick;
  log('save-refresh-load-ui', { round, savedTick: saved.tick, loadedTick: loaded.tick, meals: loaded.player.meals });
}

async function metrics(round) {
  const s = await readyToPlay();
  const browserMetrics = await page.evaluate(() => ({ ...window.lumavora_metrics(), samples: undefined, usedHeap: performance.memory?.usedJSHeapSize ?? null }));
  let heap = browserMetrics.usedHeap, dom = null;
  try {
    const measured = await cdp.send('Performance.getMetrics');
    heap = measured.metrics.find(item => item.name === 'JSHeapUsedSize')?.value ?? heap;
    dom = await cdp.send('Memory.getDOMCounters');
  } catch { /* Read-only browser counters are optional; rendering counters remain available. */ }
  const snapshot = {
    round, pageEpoch: reloads, wallSeconds: Number(elapsed().toFixed(3)), activeSeconds: Number((activeMs / 1000).toFixed(3)), tick: s.tick,
    stage: s.stage, mode: s.mode, playerPosition: s.player.pos, health: s.player.health, energy: s.player.energy,
    meals: s.player.meals, creatures: s.world.creatures.length, visibleResources: s.world.resources.length,
    render: browserMetrics, heapBytes: heap, dom,
  };
  report.rounds.push(snapshot);
  return snapshot;
}

function growthCheck() {
  const epochs = new Map();
  for (const round of report.rounds) {
    if (!epochs.has(round.pageEpoch)) epochs.set(round.pageEpoch, []);
    epochs.get(round.pageEpoch).push(round);
  }
  const rounds = [...epochs.values()].sort((a, b) => b.length - a.length)[0] || [];
  // Four nursery waypoints warm renderer caches before comparison. Counts are read
  // after cancelling editors, returning to the nursery, and allowing frames to settle.
  if (rounds.length < 12) return { pass: false, reason: 'Fewer than 12 completed rounds in one page lifetime; resource comparison is incomplete.' };
  const baseline = rounds.slice(4, 8), tail = rounds.slice(-4);
  const median = (list, getter) => percentile(list.map(getter).filter(Number.isFinite), 0.5);
  const baseGeometry = median(baseline, row => row.render.geometries), endGeometry = median(tail, row => row.render.geometries);
  const entityAllowance = Math.max(0, median(tail, row => row.creatures) - median(baseline, row => row.creatures)) * 40
    + Math.max(0, median(tail, row => row.visibleResources) - median(baseline, row => row.visibleResources)) * 10;
  const geometryAllowance = Math.max(25, baseGeometry * 0.25) + entityAllowance;
  const baseTextures = median(baseline, row => row.render.textures), endTextures = median(tail, row => row.render.textures);
  const basePrograms = median(baseline, row => row.render.programs), endPrograms = median(tail, row => row.render.programs);
  const baseHeap = median(baseline, row => row.heapBytes), endHeap = median(tail, row => row.heapBytes);
  const heapPass = baseHeap === null || endHeap === null || endHeap - baseHeap <= Math.max(100 * 1024 * 1024, baseHeap * 0.75);
  const checks = { geometries: endGeometry - baseGeometry <= geometryAllowance, textures: endTextures - baseTextures <= 3, programs: endPrograms - basePrograms <= 4, heap: heapPass };
  return { pass: Object.values(checks).every(Boolean), checks, pageEpoch: rounds[0].pageEpoch, uninterruptedRounds: rounds.length, baselineRounds: baseline.map(r => r.round), finalRounds: tail.map(r => r.round),
    baseline: { geometries: baseGeometry, textures: baseTextures, programs: basePrograms, heapBytes: baseHeap },
    final: { geometries: endGeometry, textures: endTextures, programs: endPrograms, heapBytes: endHeap },
    thresholds: { geometryGrowth: geometryAllowance, entityAllowance, textureGrowth: 3, programGrowth: 4, heapGrowthBytes: baseHeap === null ? null : Math.max(100 * 1024 * 1024, baseHeap * 0.75) },
    interpretation: 'Compares one uninterrupted page lifetime so refreshes cannot hide accumulated growth. Bounded NPC/resource changes are allowed; GC is not forced. This is not a proof that no small leak exists.' };
}

async function persist(partial = true) {
  report.elapsedWallSeconds = Number(elapsed().toFixed(3));
  report.activeGameplayWallSeconds = Number((activeMs / 1000).toFixed(3));
  report.simulatedSecondsAdvanced = Number((simulationTicks / 60).toFixed(3));
  report.frameMeasurements = [...frames.values()].map(batch => ({ width: batch.width, height: batch.height, quality: batch.quality,
    durationSeconds: Number((batch.activeMs / 1000).toFixed(3)), sampleCount: batch.samples.length,
    medianFrameMs: percentile(batch.samples, 0.5), p95FrameMs: percentile(batch.samples, 0.95), maximumFrameMs: batch.samples.length ? batch.samples.reduce((a, b) => Math.max(a, b), 0) : null,
    sampleSource: 'requestAnimationFrame wall-clock deltas while both adjacent samples are in game mode',
    ...(partial ? {} : { frameTimesMs: batch.samples }) }));
  await fs.writeFile(path.join(output, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
}

try {
  browser = await chromium.launch({ headless, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  report.provenance.browser = await browser.version();
  context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (process.env.SOAK_TRACE === '1') await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  await context.addInitScript(() => {
    // This observer owns only its measurement buffers; it never writes game state.
    const observation = { buckets: {} };
    window.__lumavoraSoakRaf = observation;
    let previous = null, wasPlaying = false;
    function measure(now) {
      const playing = document.visibilityState === 'visible' && !!document.querySelector('[data-action="editor"]');
      if (previous !== null && wasPlaying && playing) {
        const dt = now - previous, key = `${innerWidth}x${innerHeight}`;
        const bucket = observation.buckets[key] ||= { width: innerWidth, height: innerHeight, samples: [], activeMs: 0 };
        if (Number.isFinite(dt) && dt > 0) { bucket.samples.push(dt); bucket.activeMs += dt; }
      }
      previous = now; wasPlaying = playing;
      requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', event => error('pageerror', event));
  page.on('crash', () => error('page-crash', 'Chromium page crashed.'));
  page.on('console', message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    report.console.push({ type: message.type(), text: message.text(), location: message.location(), wallSeconds: Number(elapsed().toFixed(3)) });
    if (message.type() === 'error') error('console', message.text());
  });
  page.on('requestfailed', request => {
    const record = { url: request.url(), failure: request.failure()?.errorText, wallSeconds: Number(elapsed().toFixed(3)) };
    report.failedRequests.push(record);
    if (record.failure !== 'net::ERR_ABORTED') error('requestfailed', `${record.url}: ${record.failure}`);
  });
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  report.provenance.webgl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return { available: false, userAgent: navigator.userAgent };
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { available: true, renderer, vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), debugExtension: !!extension, software: /swiftshader|llvmpipe|software|basic render|mesa offscreen/i.test(renderer), userAgent: navigator.userAgent };
  });
  await page.locator('#seed').fill('8675309');
  await page.locator('#start-btn').click();
  await waitMode('game');
  if ((await state()).seed !== 8675309) throw new Error('New-game UI did not use the required seed.');
  await page.keyboard.press('Escape');
  await waitMode('pause');
  await page.locator('[data-setting="quality"]').selectOption(quality);
  await page.locator('[data-setting="muted"]').check();
  await page.locator('[data-action="close"]').first().click();
  await waitMode('game');
  await capture('new-game');
  log('new-game', { seed: 8675309, quality });
  lastTick = (await state()).tick;

  let round = 0, consecutiveFailures = 0;
  while (activeMs < durationSeconds * 1000 || elapsed() < durationSeconds) {
    if (elapsed() > durationSeconds * 2 + 120) throw new Error('Unable to collect the required active gameplay duration within the bounded wall-clock window.');
    round++;
    try {
      await activeRound(round);
      if (round % 2 === 0) await editorCycle(round);
      if (round % 3 === 0) await pauseAndResize(round);
      // Leave most of the run in one page lifetime: repeated refreshes would hide
      // a renderer leak. Exercise refresh once early and once near completion.
      if (round === 4 || (reloads === 1 && activeMs >= durationSeconds * 900)) await saveAndReload(round);
      else if (round % 2 === 0) { await page.locator('[data-action="save"]').click(); log('save-ui', { round }); }
      await page.waitForTimeout(600);
      await drainFrames();
      const snapshot = await metrics(round);
      if (Date.now() - lastScreenshot >= 60_000) await capture(`round-${String(round).padStart(3, '0')}`);
      consecutiveFailures = 0;
      await persist();
      if (elapsed() - lastProgress >= 20) {
        console.log(JSON.stringify({ round, activeSeconds: Math.round(activeMs / 1000), wallSeconds: Math.round(elapsed()), geometries: snapshot.render.geometries, heapMiB: snapshot.heapBytes === null ? null : Math.round(snapshot.heapBytes / 1048576), errors: report.errors.length }));
        lastProgress = elapsed();
      }
    } catch (failure) {
      error('round', failure);
      consecutiveFailures++;
      await persist();
      if (consecutiveFailures >= 3 || page.isClosed()) throw new Error('Three consecutive UI rounds failed; preserving partial evidence.');
      await setKeys([]);
      await readyToPlay();
    }
  }
  await setKeys([]);
  await drainFrames();
  await metrics(round + 1);
  await capture('final-gameplay');
  report.resourceGrowth = growthCheck();
  report.checks = {
    atLeastTenWallMinutes: elapsed() >= 600,
    atLeastTenActiveMinutes: activeMs >= 600_000,
    realSimulationAdvanced: simulationTicks >= 60 * 60,
    repeatedEditorCycles: editorCycles >= 6,
    repeatedSaveRefreshLoad: reloads >= 2,
    noRuntimeErrors: report.errors.length === 0,
    boundedResourceGrowth: report.resourceGrowth.pass,
  };
  report.completedInteractions = { editorCycles, reloads, recoveries };
  report.status = Object.values(report.checks).every(Boolean) ? 'passed' : 'failed';
} catch (failure) {
  error('fatal', failure);
  report.status = 'failed';
  if (page && !page.isClosed()) {
    try { await setKeys([]); await drainFrames(); await capture('failure'); } catch { /* Preserve already-collected evidence. */ }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  await persist(false);
  if (context && process.env.SOAK_TRACE === '1') {
    try { await context.tracing.stop({ path: path.join(output, 'trace.zip') }); } catch (failure) { error('trace', failure); report.status = 'failed'; await persist(false); }
  }
  if (browser) await browser.close();
}

console.log(JSON.stringify({ status: report.status, activeSeconds: report.activeGameplayWallSeconds, wallSeconds: report.elapsedWallSeconds, metrics: path.join(output, 'metrics.json'), errors: report.errors.length }));
if (report.status !== 'passed') process.exitCode = 1;
