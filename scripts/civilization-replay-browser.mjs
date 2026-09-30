/** Short production replay of genuinely played B branches; not a replacement for their full runs.
 * Optional: --military evidence/sp-009l/military-resume/active-campaign.save.json
 * Only ordinary UI imports/commands and read-only observations. No test clock or live writes.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5221';
const out = path.resolve(process.env.LUMAVORA_EVIDENCE??'evidence/sp-009l/final-replay');
const militaryIndex = process.argv.indexOf('--military');
assert.ok(militaryIndex < 0 || process.argv[militaryIndex + 1] && !process.argv[militaryIndex + 1].startsWith('--'), '--military requires the played final export');
assert.ok(process.argv.slice(2).every((arg, i) => arg === '--military' || i > 0 && process.argv[i + 1] === '--military'), 'Only --military <path> is supported');
assert.equal(new URL(base).searchParams.has('test'), false, 'Use the production URL without test mode');
const timeout = Number(process.env.LUMAVORA_NATIVE_TIMEOUT_MS ?? 180000);
assert.ok(Number.isFinite(timeout) && timeout >= 15000, 'Native timeout must be at least 15 seconds');
const sha = value => createHash('sha256').update(value).digest('hex');
async function source(label, file) {
  const resolved = path.resolve(file), bytes = await readFile(resolved), envelope = JSON.parse(bytes.toString());
  assert.equal(envelope.format, 'lumavora'); assert.ok(envelope.state);
  return {label, file: resolved, sha256: sha(bytes), state: envelope.state};
}
const preG = await source('conversion-before-G', 'evidence/sp-009l/conversion/before-space-checkpoint.save.json');
const finals = [
  await source('trade', 'tests/fixtures/civilization/native-civic-campaign.save.json'),
  await source('conversion', 'evidence/sp-009l/conversion/active-campaign.save.json'),
  ...(militaryIndex < 0 ? [] : [await source('military', process.argv[militaryIndex + 1])]),
];
assert.equal(preG.state.stage, 4); assert.equal(preG.state.civilization.completed, null);
for (const item of finals) {assert.equal(item.state.stage, 5); assert.ok(item.state.civilization.completed);}
await mkdir(out, {recursive: true});
const freeDisk = async () => {const d = await statfs(out); return d.bavail * d.bsize;};
const diskBefore = await freeDisk();
console.log(`Final B replay: ${(diskBefore / 1024 ** 3).toFixed(2)} GiB free; ${finals.length} completed branches`);

const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'});
const context = await browser.newContext({viewport: {width: 1024, height: 640}});
const page = await context.newPage(), checks = [], errors = [], assets = [], images = [], branches = [];
let currentSource = null, noticeEvidence = null, performanceSample = null;
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.on('dialog', dialog => dialog.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const check = message => {checks.push(message); console.log(message);};
const staleToast = /zbývající[^\n]{0,100}města\s*:\s*4/iu;
const stableCities = s => s.cities.entries.map(c => ({id: c.id, owner: c.owner, founded: c.founded,
  foundingOwner: c.foundingOwner, capture: c.capture, transfers: c.transfers}));
const stateReceipts = s => s.states.entries.map(r => ({id: r.id, endowment: r.endowment, reserve: r.reserve,
  tradeReserve: r.tradeReserve, transactions: r.transactions}));
function preserved(s, expected, completed = true) {
  assert.equal(s.deathReason, null); assert.deepEqual(errors, []);
  assert.equal(s.homePlanet.id, expected.homePlanet.id);
  assert.deepEqual(stableCities(s), stableCities(expected), 'City ownership and historical receipts changed');
  assert.deepEqual(stateReceipts(s), stateReceipts(expected), 'Historical state accounts/receipts changed');
  assert.deepEqual(s.lineageHistory.stages[4], expected.lineageHistory.stages[4], 'Frozen regional history changed');
  if (completed) assert.deepEqual(s.civilization, expected.civilization, 'B2 completion changed on import/replay');
}
function methods(s) {
  const result = new Set();
  for (const cut of s.civilization.completed.cities) {
    const c = s.cities.entries.find(c => c.id === cut.cityId); assert.ok(c);
    if (cut.capture) {assert.ok(c.capture); result.add('military');}
    for (const transfer of c.transfers.slice(0, cut.transfers)) if (transfer.to.kind === 'lineage') result.add(transfer.method ?? 'military');
  }
  return [...result].sort();
}
async function imported(item) {
  currentSource = item.label;
  await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(item.file);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const build = await page.evaluate(() => ({url: location.href,
    modules: [...document.querySelectorAll('script[type="module"][src]')].map(e => e.src),
    styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(e => e.href)}));
  assert.ok(build.modules.length > 0 && build.modules.every(url => new URL(url).pathname.includes('/assets/')), 'Expected built production assets');
  if (assets.length) assert.deepEqual(build.modules, assets[0].modules, 'Production bundle changed during replay');
  assets.push({source: item.label, ...build});
  const s = await read(); assert.equal(s.stage, item.state.stage); preserved(s, item.state); return s;
}
async function noStaleToast() {
  const toast = page.locator('#toast');
  const text = await toast.count() && await toast.isVisible() ? await toast.innerText() : '';
  assert.doesNotMatch(text, staleToast, 'Obsolete four-foreign-cities toast reappeared'); return text;
}
async function shot(name) {
  assert.ok(images.length < 2, 'At most two final PNGs');
  const file = path.join(out, `${name}.png`); await page.screenshot({path: file}); images.push(file);
}
async function nativeUntil(label, predicate) {
  const started = performance.now(); let s;
  while (performance.now() - started < timeout) {
    s = await read(); assert.equal(s.mode, 'game'); assert.equal(s.deathReason, null); assert.deepEqual(errors, []);
    if (predicate(s)) return s;
    await page.waitForTimeout(80);
  }
  throw new Error(`${label}: no completion within wall ceiling; ${JSON.stringify({tick: s?.tick, worldTime: s?.world.time, turn: s?.states.clock, mode: s?.mode})}`);
}
const frameStats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return {count: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1)};
};
async function nativeFrames() {
  // The callback only observes RAF timestamps; it never changes game state or advances time.
  return page.evaluate(() => new Promise((resolve, reject) => {
    const values = []; let previous;
    const timer = setTimeout(() => reject(new Error('Native RAF sampling stalled')), 120000);
    function frame(time) {
      if (previous !== undefined) values.push(time - previous); previous = time;
      if (values.length === 360) {clearTimeout(timer); resolve(values);} else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}
try {
  let s = await imported(preG);
  assert.equal(s.navigation.mode, 'local'); assert.equal(s.navigation.field, null);
  assert.ok(s.cities.entries.every(c => c.owner.kind === 'lineage'));
  const owned = s.cities.entries.find(c => c.owner.kind === 'lineage' && c.economy);
  assert.ok(owned); await page.keyboard.press('n'); await page.locator('#travel-map').waitFor();
  await act(`city-select:${owned.id}`); await act(`city-enter:${owned.id}`);
  await page.locator('#city-economy').waitFor(); s = await read();
  assert.equal(s.homePlanet.currentLocationId, owned.address.locationId); preserved(s, preG.state);
  const homeTime = s.world.time;
  await act('travel-home');
  const notice = page.locator('.travel-return-notice'); await notice.waitFor({state: 'visible'});
  const returned = await read(); assert.equal(returned.navigation.field, null); assert.equal(returned.navigation.mode, 'local');
  await noStaleToast();
  assert.match(await page.locator('.civilization-progress').innerText(), /Všechna města patří linii/);
  assert.equal(await page.locator('[data-action="machine-next"]').isDisabled(), false);
  const box = await notice.boundingBox(), viewport = page.viewportSize(); assert.ok(box && viewport);
  assert.ok(box.y >= viewport.height * .65 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width,
    `Return notice must fit near the viewport bottom: ${JSON.stringify({box, viewport})}`);
  noticeEvidence = {homeTime, shownAt: returned.world.time, box, text: await notice.innerText(), staleToast: await noStaleToast()};
  await shot('conversion-ready-return-1024');
  check('Played pre-G conversion branch visits its own city, returns to a ready civilization panel and shows the notice at the bottom without obsolete four-city text');

  const beforeFrames = await read(), wallStart = performance.now();
  const framesPending = nativeFrames();
  // Attach a rejection handler immediately while native notice checks run.
  const sampled = framesPending.then(values => ({values}), error => ({error}));
  const still = await nativeUntil('Five active domestic seconds', value => value.world.time - homeTime >= 5);
  assert.ok(still.world.time - homeTime < 6, 'Could not observe the notice before its six-second boundary');
  assert.equal(await notice.isVisible(), true); noticeEvidence.stillVisibleAt = still.world.time;
  const expired = await nativeUntil('Six active domestic seconds', value => value.world.time - homeTime >= 6.4);
  await notice.waitFor({state: 'detached'}); noticeEvidence.expiredAt = expired.world.time;
  await noStaleToast();
  const sample = await sampled; if (sample.error) throw sample.error;
  const afterFrames = await read();
  performanceSample = {scene: 'stage4 unified home, 1024x640, native RAF', frames: frameStats(sample.values),
    wallSeconds: (performance.now() - wallStart) / 1000, activeSeconds: afterFrames.world.time - beforeFrames.world.time,
    before: beforeFrames.render, after: afterFrames.render};
  assert.ok(performanceSample.activeSeconds > 0); assert.ok(afterFrames.render.drawCalls > 0);
  check('Return notice remains before six active domestic seconds and expires afterwards; 360 native RAF intervals measured in the representative home scene');

  await page.keyboard.press('g'); await nativeUntil('Ordinary G enters stage5', value => value.stage === 5);
  s = await read(); preserved(s, preG.state, false); assert.deepEqual(methods(s), ['conversion']);
  assert.deepEqual(s.civilization.completed.cities, s.cities.entries.map(c => ({cityId: c.id, capture: !!c.capture, transfers: c.transfers.length})).sort((a, b) => a.cityId.localeCompare(b.cityId)));
  const effect = page.locator('[data-civilization-effect]'); await effect.scrollIntoViewIfNeeded();
  assert.match(await effect.innerText(), /konverzní/); assert.match(await effect.innerText(), /kladná obnova života \+20 %/);
  await shot('conversion-inherited-1024');
  check('Ordinary G records the full pure-conversion B2 prefix and exposes its 20% recovery inheritance in stage5');

  for (const item of finals) {
    s = await imported(item); assert.deepEqual(methods(s), [item.label]);
    const expected = stableCities(item.state), completion = item.state.civilization;
    await act('journal'); await page.locator('.lineage-details > summary').click(); await page.locator('.civilization-history').waitFor();
    const historyText = await page.locator('.civilization-history').innerText();
    assert.match(historyText, /uzavřené sjednocení/);
    assert.ok(historyText.includes({trade: 'obchodní', conversion: 'konverzní', military: 'vojenská'}[item.label]));
    await act('close'); s = await read(); preserved(s, item.state);
    branches.push({method: item.label, source: item.file, sha256: item.sha256,
      completionSha256: sha(JSON.stringify(completion)), cityReceiptsSha256: sha(JSON.stringify(expected)),
      cities: expected.length, stage: s.stage});
    check(`Played ${item.label} final import and journal preserve exact B2 completion, city receipts, owners and historical state accounts`);
  }
  for (const item of [preG, ...finals]) assert.equal(sha(await readFile(item.file)), item.sha256, 'A source export was changed');
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, sources: [preG, ...finals].map(({state, ...item}) => item),
    assets, notice: noticeEvidence, performance: performanceSample, branches, images,
    militaryReplay: militaryIndex < 0 ? 'Not requested; pass --military with the genuinely played final export' : 'verified',
    disk: {before: diskBefore, after: await freeDisk()},
    provenance: 'Short final production replay of unchanged actually played branch exports. All gameplay uses normal UI and native RAF; observations only. No live writes, test clock, new fixture preparation, trace or video. This supplements full military/conversion/trade runs and does not prove a fresh full campaign or human acceptance.'}, null, 2));
} catch (error) {
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({error: String(error), stack: error.stack, currentSource,
    checks, errors, assets, notice: noticeEvidence, performance: performanceSample, images,
    state: await read().catch(() => null), disk: {before: diskBefore, after: await freeDisk()}}, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  await browser.close();
}
