/**
 * Real-time 1920 × 1080 / medium-quality scene benchmark.
 * The initial per-stage saves are prepared fixtures, never campaign evidence.
 * Uses normal game time, keyboard movement and raw requestAnimationFrame timestamps;
 * no advanceTime or filtered application frame-time array is used for measurement.
 * Run independently of other GPU tests: node scripts/performance.mjs
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'vite';

// Respect an explicit registry; use the local benchmark cache only when present.
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const { chromium } = await import('playwright');
const BASE_URL = process.env.LUMAVORA_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.resolve(process.env.PERFORMANCE_OUTPUT ?? 'evidence/quality/regression/performance');
const SAMPLE_MS = Math.max(20000, Number(process.env.LUMAVORA_PERFORMANCE_MS) || 20000);
const WARMUP_MS = 3000;
await mkdir(OUTPUT, { recursive: true });
const started = new Date();
const errors = [], results = [];
const ssr = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { createGame, evolve, makeCheckpoint, tryTransition, statsFor } = await ssr.ssrLoadModule('/src/game/simulation.ts');
const { serializeGame } = await ssr.ssrLoadModule('/src/game/persistence.ts');
const { cloneGenome } = await ssr.ssrLoadModule('/src/game/genome.ts');
const { CHAPTERS } = await ssr.ssrLoadModule('/src/game/content.ts');
function append(g, kind, mirrored = false) {
  const copy = cloneGenome(g);
  copy.parts.push({ id: `perf-${kind}-${copy.parts.length}`, kind, axial: kind === 'fins' ? -.1 : .1, angle: ['fins', 'legs'].includes(kind) ? 1.25 : 0, scale: 1, mirrored });
  return copy;
}
function reproduce(s, next = cloneGenome(s.player.genome)) {
  s.player.pos = { ...s.world.landmarks[0].pos };
  s.player.dna = s.player.totalDna = 1000;
  const result = evolve(s, next);
  assert.equal(result.ok, true, result.errors.join(' '));
}
function prepare(stage) {
  const s = createGame(20260913, true); s.id = `performance-stage-${stage}`;
  reproduce(s, append(s.player.genome, 'eyes'));
  while (s.stage < stage) {
    if (s.stage === 1) reproduce(s, append(append(append(append(s.player.genome, 'fins', true), 'gills'), 'legs', true), 'lungs'));
    while (s.campaign.stageReproductions < 2) reproduce(s);
    s.campaign.stageMeals = CHAPTERS[s.stage].meals; s.player.meals += CHAPTERS[s.stage].meals;
    for (const patch of s.world.patches) {
      patch.discovered = true; const id = `${s.stage}:${patch.id}`;
      if (!s.campaign.discoveries.includes(id)) s.campaign.discoveries.push(id);
      // Prepared field readiness belongs to the benchmark fixture provenance.
      const prefix = `field:${s.stage}:${patch.id}:`;
      if (!s.campaign.journals.some(j => j.startsWith(prefix))) s.campaign.journals.push(prefix + 'prepared-performance');
    }
    s.player.pos = { ...s.world.landmarks[1].pos };
    assert.equal(tryTransition(s), true, 'Performance fixture transition failed');
  }
  if (stage === 1) reproduce(s, append(append(s.player.genome, 'fins', true), 'gills'));
  s.player.genome.name = `Měření etapy ${stage + 1}`;
  s.player.pos = { ...s.world.patches[0].center };
  s.player.health = statsFor(s.player.genome).maxHealth;
  s.player.energy = 100; s.player.invulnerable = 120;
  s.player.velocity = { x: 0, y: 0, z: 0 };
  makeCheckpoint(s);
  return s;
}
const files = [];
for (let stage = 0; stage < 3; stage++) {
  const filename = path.join(OUTPUT, `stage-${stage + 1}.fixture.json`);
  await writeFile(filename, serializeGame(prepare(stage))); files.push(filename);
}
await ssr.close();
if (process.argv.includes('--prepare-only')) { console.log('Validated three performance save fixtures; no browser launched.'); process.exit(0); }

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', e => errors.push({ message: e.message, stack: e.stack }));
page.on('console', m => { if (m.type() === 'error') errors.push({ message: m.text(), type: 'console' }); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const percentile = (values, fraction) => { const sorted = [...values].sort((a, b) => a - b); const index = (sorted.length - 1) * fraction, low = Math.floor(index), high = Math.ceil(index); return sorted[low] + (sorted[high] - sorted[low]) * (index - low); };
try {
  for (let stage = 0; stage < 3; stage++) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('[data-action="saves"]').first().click();
    await page.locator('#import-save').setInputFiles(files[stage]);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
    await page.locator('[data-action="pause"]').click();
    await page.locator('[data-setting="quality"]').selectOption('medium');
    await page.locator('[data-setting="muted"]').check();
    await page.locator('[data-action="close"]').first().click();
    await page.waitForTimeout(WARMUP_MS);
    const before = await read();
    assert.equal(before.stage, stage); assert.equal(before.mode, 'game');
    const environment = await page.evaluate(() => {
      const gl = document.querySelector('#world').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { userAgent: navigator.userAgent, vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), webglVersion: gl.getParameter(gl.VERSION), shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, rendererMetrics: window.lumavora_metrics() };
    });
    delete environment.rendererMetrics.samples;
    await page.screenshot({ path: path.join(OUTPUT, `stage-${stage + 1}-start.png`) });
    // Genuine keys over real elapsed time move around the niche during sampling.
    const movement = (async () => {
      const keys = ['w', 'd', 's', 'a'];
      for (const key of keys) {
        await page.keyboard.down(key);
        await page.waitForTimeout(SAMPLE_MS / keys.length);
        await page.keyboard.up(key);
      }
    })();
    const measurement = await page.evaluate(duration => new Promise(resolve => {
      const frameTimes = [], timestamps = [], counts = [];
      let start = null, previous = null;
      function sample(now) {
        if (start === null) start = now;
        if (previous !== null) frameTimes.push(now - previous);
        previous = now; timestamps.push(now);
        if (timestamps.length % 60 === 0) {
          const metrics = window.lumavora_metrics(); delete metrics.samples;
          counts.push({ elapsedMs: now - start, ...metrics });
        }
        if (now - start >= duration) resolve({ frameTimes, timestamps, measuredDurationMs: now - start, counts });
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }), SAMPLE_MS);
    await movement;
    const after = await read();
    assert.equal(after.mode, 'game', `Benchmark interrupted by ${after.mode}`);
    assert.ok(measurement.measuredDurationMs >= 20000);
    assert.ok(after.tick > before.tick, 'Normal simulation did not advance during real-time measurement');
    assert.ok(measurement.frameTimes.length > 10, 'Insufficient rendered frames');
    const median = percentile(measurement.frameTimes, .5), p95 = percentile(measurement.frameTimes, .95);
    await page.screenshot({ path: path.join(OUTPUT, `stage-${stage + 1}-end.png`) });
    const software = /SwiftShader|llvmpipe|software|softpipe/i.test(environment.renderer);
    const result = { stage, stageName: CHAPTERS[stage].short, seed: 20260913, quality: 'medium', resolution: '1920 × 1080 CSS pixels', pixelRatio: environment.rendererMetrics.pixelRatio, requestedSampleMs: SAMPLE_MS, warmupMs: WARMUP_MS, measuredDurationMs: measurement.measuredDurationMs, renderedIntervals: measurement.frameTimes.length, medianFrameTimeMs: median, p95FrameTimeMs: p95, worstFrameTimeMs: Math.max(...measurement.frameTimes), medianDerivedFPS: 1000 / median, overallFPS: measurement.frameTimes.length / (measurement.measuredDurationMs / 1000), renderingClass: software ? 'software rendering; no hardware-FPS claim' : 'GPU renderer reported by WebGL debug extension', environment, activeBefore: { creatures: before.world.creatures.length, resources: before.world.resources.length, obstacles: before.world.obstacles.length, genomeParts: before.player.genome.parts.length }, activeAfter: { creatures: after.world.creatures.length, resources: after.world.resources.length, obstacles: after.world.obstacles.length, genomeParts: after.player.genome.parts.length }, simulationTicks: after.tick - before.tick, positionBefore: before.player.pos, positionAfter: after.player.pos, movement: 'W, D, S, A held for equal real-time quarters; no sprint', rawFrameTimesMs: measurement.frameTimes, rawRafTimestampsMs: measurement.timestamps, sampledRendererCounts: measurement.counts, screenshots: ['start', 'end'].map(point => path.relative(process.cwd(), path.join(OUTPUT, `stage-${stage + 1}-${point}.png`))) };
    results.push(result);
    console.log(`Stage ${stage + 1}: ${measurement.measuredDurationMs.toFixed(0)} ms, median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, ${environment.renderer}`);
  }
} finally {
  for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key).catch(() => {});
  const version = browser.version(); await context.close(); await browser.close();
  const report = { kind: 'real-time raw-RAF GPU benchmark with prepared per-stage initial saves', campaignRules: 'legacy', freshCurrentCampaign: false, startedAt: started.toISOString(), endedAt: new Date().toISOString(), browser: { name: 'Chromium', version }, host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model ?? 'N/A', logicalCPUs: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 1024 ** 3) }, methodology: 'Each full seeded world is imported via the normal save UI; meals, discoveries and field journal readiness are prepared explicitly rather than earned campaign evidence; 3 seconds of warmup precede at least 20 seconds of unfiltered requestAnimationFrame intervals while actual keyboard movement occurs. Normal game time is active. No frame interval is excluded and no advanceTime is called. Prepared 120-second invulnerability prevents a death modal from invalidating performance sampling. Run independently from other browser/GPU jobs.', limitations: ['Prepared initial states are not campaign progression evidence.', 'Legacy worlds do not exercise the additional current-journey encounter geometry or hunter AI.', `Headless Chromium / ${process.platform === 'darwin' ? 'ANGLE Metal requested' : 'default graphics backend'} is the requested browser configuration; the measured renderer is recorded per scene.`, 'Safari and mobile devices remain unverified.'], results, errors };
  await writeFile(path.join(OUTPUT, 'performance-results.json'), JSON.stringify(report, null, 2));
  if (errors.length || results.length !== 3) process.exitCode = 1;
}
