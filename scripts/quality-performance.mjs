/**
 * Real-time 1920 × 1080 / medium-quality scene benchmark.
 * The initial per-stage saves are prepared fixtures, never campaign evidence.
 * Uses normal game time, keyboard movement and raw requestAnimationFrame timestamps;
 * no advanceTime or filtered application frame-time array is used for measurement.
 * Run independently of other GPU tests: node scripts/quality-performance.mjs
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'vite';

// Respect an explicit registry; use the local benchmark cache only when present.
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/private/tmp/lumavora-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/private/tmp/lumavora-browsers';
const { chromium } = await import('playwright');
const BASE_URL = process.env.LUMAVORA_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.resolve(process.env.PERFORMANCE_OUTPUT ?? 'evidence/quality/current-performance');
const SAMPLE_MS = Math.max(20000, Number(process.env.LUMAVORA_PERFORMANCE_MS) || 20000);
const WARMUP_MS = 3000;
await mkdir(OUTPUT, { recursive: true });
const started = new Date();
const errors = [], results = [];
const ssr = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { createGame, evolve, makeCheckpoint, tryTransition, statsFor } = await ssr.ssrLoadModule('/src/game/simulation.ts');
const { serializeGame, parseGame } = await ssr.ssrLoadModule('/src/game/persistence.ts');
const { cloneGenome, genomeCost, initialGenome } = await ssr.ssrLoadModule('/src/game/genome.ts');
const { CHAPTERS } = await ssr.ssrLoadModule('/src/game/content.ts');
function append(g, kind, mirrored = false) {
  const copy = cloneGenome(g);
  copy.parts.push({ id: `perf-${kind}-${copy.parts.length}`, kind, axial: kind === 'fins' ? -.1 : .1, angle: ['fins', 'legs'].includes(kind) ? 1.25 : 0, scale: 1, mirrored });
  return copy;
}
function reproduce(s, next = cloneGenome(s.player.genome)) {
  s.player.pos = { ...s.world.landmarks[0].pos };
  s.player.totalDna = 1000;
  s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(s.player.genome);
  const result = evolve(s, next);
  assert.equal(result.ok, true, result.errors.join(' '));
}
function prepareColony(s, site, resolved) {
  const plant = {
    id: s.world.nextId++, kind: s.world.resources.find(r => r.id === site.sourceId).kind,
    pos: { ...site.refuges[0] }, amount: 8, max: 12, patch: site.patch, regen: .09,
  };
  s.world.resources.push(plant);
  site.observed = true; site.plantedId = plant.id; site.vitality = 100;
  site.resolved = resolved; site.method = resolved ? 'cultivate' : null; site.phase = resolved ? 4 : 3;
  if (resolved) s.journey.echoes.push(`${site.id}:cultivate`);
}
function prepare(stage) {
  const s = createGame(20260913, false); s.id = `quality-performance-stage-${stage}`;
  reproduce(s, append(s.player.genome, 'eyes'));
  while (s.stage < stage) {
    if (s.stage === 1) reproduce(s, append(append(append(append(s.player.genome, 'fins', true), 'gills'), 'legs', true), 'lungs'));
    // Deliberately prepared prior outcomes allow isolated scene sampling. No playthrough is implied.
    for (const site of s.journey.sites.filter(site => site.stage === s.stage)) prepareColony(s, site, true);
    s.player.pos = { ...s.world.landmarks[1].pos };
    assert.equal(tryTransition(s), true, 'Current journey fixture transition failed');
  }
  if (stage === 1) reproduce(s, append(append(s.player.genome, 'fins', true), 'gills'));
  for (const site of s.journey.sites.filter(site => site.stage === stage)) {
    if (stage === 2 && site.patch === 2) site.observed = true;
    else prepareColony(s, site, site.patch < 2);
    s.world.patches[site.patch].discovered = true;
    const key = `${stage}:${site.patch}`;
    if (!s.campaign.discoveries.includes(key)) s.campaign.discoveries.push(key);
  }
  const site = s.journey.sites.find(site => site.stage === stage && site.patch === 0);
  s.player.genome.name = `Měření živé etapy ${stage + 1}`;
  s.player.pos = { ...site.refuges[0] };
  s.journey.cargo = { kind: s.world.resources.find(r => r.id === site.sourceId).kind, purpose: 'culture', site: site.id, vitality: 100, distance: 0 };
  s.player.health = statsFor(s.player.genome).maxHealth;
  s.player.energy = 100; s.player.invulnerable = 120;
  s.player.velocity = { x: 0, y: 0, z: 0 };
  makeCheckpoint(s);
  return s;
}
const files = [], preparedScenes = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
for (let stage = 0; stage < 3; stage++) {
  const filename = path.join(OUTPUT, `stage-${stage + 1}.fixture.json`);
  const fixture = prepare(stage), serialized = serializeGame(fixture);
  assert.deepEqual(parseGame(serialized), fixture, `Stage ${stage + 1} fixture must survive strict save validation`);
  assert.equal(fixture.journey.legacy, false);
  await writeFile(filename, serialized); files.push(filename);
  preparedScenes.push({ stage, journeyVersion: fixture.journey.version, legacy: fixture.journey.legacy, file: path.relative(process.cwd(), filename), sha256: sha256(serialized), creatures: fixture.world.creatures.length, resources: fixture.world.resources.length, obstacles: fixture.world.obstacles.length, sites: fixture.journey.sites.filter(site => site.stage === stage).map(site => ({ id: site.id, observed: site.observed, planted: site.plantedId !== null, resolved: site.resolved })) });
}
await ssr.close();
await writeFile(path.join(OUTPUT, 'fixture-provenance.json'), JSON.stringify({ kind: 'prepared current-journey performance fixtures only', createdAt: new Date().toISOString(), seed: 20260913, rules: 'Journey version 2, legacy false', preparedFields: ['prior ecological outcomes', 'anatomy and learned DNA', 'current colonies and discoveries', 'cargo', 'position', '120-second invulnerability'], retainedSystems: ['seeded complete worlds and authored geometry', 'ordinary NPC populations and hunter AI', 'resource simulation', 'current physics', 'ecological growth and streams'], playerCampaignEvidence: false, durationEvidence: false, scriptSha256: sha256(await readFile(new URL(import.meta.url))), scenes: preparedScenes }, null, 2));
if (process.argv.includes('--prepare-only')) { console.log('Validated three prepared current-journey performance saves; no browser launched, no campaign timing measured.'); process.exit(0); }

const requestedExecutable = process.env.LUMAVORA_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true, ...(requestedExecutable ? { executablePath: requestedExecutable } : {}), args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
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
    const scriptUrls = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
    const servedScripts = [];
    for (const url of scriptUrls) { const response = await page.request.get(url); assert.ok(response.ok(), `Cannot record served script ${url}`); servedScripts.push({ url, sha256: sha256(await response.body()) }); }
    assert.equal(before.player.genome.name, `Měření živé etapy ${stage + 1}`, 'Expected prepared current-journey fixture');
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
    const result = { stage, servedScripts, preparedFixture: preparedScenes[stage], stageName: CHAPTERS[stage].short, seed: 20260913, quality: 'medium', resolution: '1920 × 1080 CSS pixels', pixelRatio: environment.rendererMetrics.pixelRatio, requestedSampleMs: SAMPLE_MS, warmupMs: WARMUP_MS, measuredDurationMs: measurement.measuredDurationMs, renderedIntervals: measurement.frameTimes.length, medianFrameTimeMs: median, p95FrameTimeMs: p95, worstFrameTimeMs: Math.max(...measurement.frameTimes), medianDerivedFPS: 1000 / median, overallFPS: measurement.frameTimes.length / (measurement.measuredDurationMs / 1000), renderingClass: software ? 'software rendering; no hardware-FPS claim' : 'GPU renderer reported by WebGL debug extension', environment, activeBefore: { creatures: before.world.creatures.length, resources: before.world.resources.length, obstacles: before.world.obstacles.length, genomeParts: before.player.genome.parts.length }, activeAfter: { creatures: after.world.creatures.length, resources: after.world.resources.length, obstacles: after.world.obstacles.length, genomeParts: after.player.genome.parts.length }, simulationTicks: after.tick - before.tick, positionBefore: before.player.pos, positionAfter: after.player.pos, movement: 'W, D, S, A held for equal real-time quarters; no sprint', rawFrameTimesMs: measurement.frameTimes, rawRafTimestampsMs: measurement.timestamps, sampledRendererCounts: measurement.counts, screenshots: ['start', 'end'].map(point => path.relative(process.cwd(), path.join(OUTPUT, `stage-${stage + 1}-${point}.png`))) };
    results.push(result);
    console.log(`Stage ${stage + 1}: ${measurement.measuredDurationMs.toFixed(0)} ms, median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, ${environment.renderer}`);
  }
} finally {
  for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key).catch(() => {});
  const version = browser.version(); await context.close(); await browser.close();
  const report = { kind: 'real-time raw-RAF GPU benchmark with prepared per-stage initial saves', campaignRules: 'current journey version 2', preparedFixture: true, acceleratedTimeStepping: false, freshCurrentCampaign: false, startedAt: started.toISOString(), endedAt: new Date().toISOString(), browser: { name: 'Chromium', version }, host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model ?? 'N/A', logicalCPUs: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 1024 ** 3) }, methodology: 'Each full seeded current-journey world is imported via the normal save UI; prior ecological outcomes, anatomy budget, current colonies, discoveries, and cargo are prepared explicitly rather than earned campaign evidence; 3 seconds of warmup precede at least 20 seconds of unfiltered requestAnimationFrame intervals while actual keyboard movement occurs. Normal game time is active. No frame interval is excluded and no advanceTime is called. Prepared 120-second invulnerability prevents a death modal from invalidating performance sampling. Run independently from other browser/GPU jobs.', limitations: ['Prepared initial states are not campaign progression evidence.', 'Current-journey geometry, plant presentation, current physics, food webs, and hunters are active, but these three local scene samples do not establish worst-case performance, a complete campaign, or human playthrough duration.', `Headless Chromium / ${process.platform === 'darwin' ? 'ANGLE Metal requested' : 'default graphics backend'} is the requested browser configuration; the measured renderer is recorded per scene.`, 'Safari and mobile devices remain unverified.'], results, errors };
  await writeFile(path.join(OUTPUT, 'performance-results.json'), JSON.stringify(report, null, 2));
  if (errors.length || results.length !== 3) process.exitCode = 1;
}
