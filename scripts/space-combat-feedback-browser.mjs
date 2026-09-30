/** Short D3a feedback replay from actual public exports. Independent branches;
 * the canonical completed campaign is never imported, changed or overwritten. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, statfs, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5220', out = path.resolve(process.env.LUMAVORA_OUT ?? 'evidence/sp-014d3a/feedback');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = path.resolve('evidence/sp-014d3a/browser');
const sources = [
  {kind: 'battle', name: 'battle-two-pulses.save.json', sha256: 'd572fc686757b57f9886940e19e80d7a8c117c79be5c39c2da55f44a55041c37'},
  {kind: 'wreck', name: 'actual-wreck.save.json', sha256: '837191196062db5987a62410734dbc7e5f31bfd385dfdcfe637d1921cd9e8da2'},
];
for (const source of sources) {source.path = path.join(directory, source.name); const bytes = await readFile(source.path); assert.equal(hash(bytes), source.sha256); source.state = JSON.parse(bytes).state;}
const canonical = {path: path.join(directory, 'active-campaign.save.json'), sha256: '608b238c20d8e7c50fa51069b9b0b84cffae4ea6be8954b9e937ca767c4e3500'};
assert.equal(hash(await readFile(canonical.path)), canonical.sha256); assert.ok(process.env.LUMAVORA_ASSET, 'Approved feedback build is required'); assert.equal(new URL(base).searchParams.has('test'), false);
await mkdir(out, {recursive: true}); const disk = async () => {const s = await statfs(out); return s.bavail * s.bsize;}, diskBefore = await disk();
const browser = await chromium.launch({channel: 'chrome', headless: process.env.LUMAVORA_HEADED !== '1'}), context = await browser.newContext({viewport: {width: 1024, height: 640}, acceptDownloads: true}), page = await context.newPage();
const errors = [], assets = [], checks = [], images = [], observations = []; let phase = 'battle branch import', current = null;
page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => {if (m.type() === 'error') errors.push(m.text());}); page.on('dialog', d => d.accept());
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const act = action => page.locator(`button[data-action="${action}"]:visible`).first().click();
const last = state => state.space.combat.battles.at(-1);
const homeKeys = ['stage', 'tick', 'seed', 'player', 'campaign', 'world', 'tribe', 'machines', 'planet', 'homePlanet', 'lineageHistory', 'cities', 'states', 'military', 'maritime', 'commerce', 'mobilization'];
const homePublic = state => Object.fromEntries(homeKeys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]));
let home = null;
function intact(state) {
  assert.deepEqual(errors, []); assert.equal(state.deathReason, null); assert.ok(state.player.health > 0);
  for (const key of ['creation', 'purchase', 'id']) assert.deepEqual(state.space.ship[key], current.state.space.ship[key]);
  for (const key of ['outfit', 'empires']) assert.deepEqual(state.space[key], current.state.space[key]);
  assert.deepEqual(state.space.expansion.actions, current.state.space.expansion.actions);
  for (const key of ['balance', 'ledger', 'counts', 'actions', 'cargo', 'sales', 'nextAction']) assert.deepEqual(state.space.economy[key], current.state.space.economy[key]);
  assert.deepEqual(state.space.expedition, current.state.space.expedition);
  if (home) assert.deepEqual(homePublic(state), home);
}
async function until(label, predicate, limit = 20000) {const start = performance.now(); let s; while (performance.now() - start < limit) {s = await read(); intact(s); if (predicate(s)) return s; await page.waitForTimeout(30);} throw Error(`${label}: ${JSON.stringify({notice: s?.space.notice, health: s?.space.ship.health, battle: s && last(s)})}`);}
async function importBranch(source) {
  current = source; home = null; await page.goto(base); await act('saves'); await page.locator('#import-save').setInputFiles(source.path); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  const s = await read(); intact(s); home = homePublic(s); assert.equal(await page.evaluate(() => typeof window.advanceTime), 'undefined');
  const asset = await page.evaluate(() => ({url: location.href, modules: [...document.querySelectorAll('script[type="module"][src]')].map(n => n.src), styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(n => n.href)}));
  assert.ok(asset.modules.some(url => new URL(url).pathname.endsWith(`/assets/${process.env.LUMAVORA_ASSET}`))); if (assets.length) assert.deepEqual(asset.modules, assets[0].modules); assets.push(asset);
  observations.push({kind: 'public-branch-import', source: {kind: source.kind, path: source.path, sha256: source.sha256}, spaceElapsed: s.space.elapsed}); console.log('Feedback production asset', asset.modules); return s;
}
async function frames(count = 8) {return page.evaluate(count => new Promise(resolve => {let n = 0; function frame() {if (++n >= count) resolve(); else requestAnimationFrame(frame);} requestAnimationFrame(frame);}), count);}
async function screenshot(name) {assert.ok(images.length < 2); await page.locator('#space-combat').scrollIntoViewIfNeeded(); await frames(); const file = path.join(out, name + '.png'); await page.screenshot({path: file}); images.push(file);}
async function wreckCopy() {
  const left = await page.locator('.space-instruments').innerText(), footer = await page.locator('.space-controls').innerText(), approach = await page.locator('.space-navigation > p').first().innerText();
  assert.match(left, /Motory i solár jsou vypnuté/); assert.doesNotMatch(left, /Zastavení dobíjí|Shift přidá/);
  assert.match(footer, /Vrak · oprava vpravo/); assert.doesNotMatch(footer, /WASD|Q \/ C|R \/ V/); assert.match(approach, /Let, motory i solár čekají na nouzovou opravu/);
  for (const action of ['space-up', 'space-down']) assert.equal(await page.locator(`button[data-action="${action}"]`).isDisabled(), true);
  return {left, footer, approach};
}
try {
  await importBranch(sources[0]); assert.equal(last(await read()).shots, 2);
  await until('Existing pulse recharge', s => s.space.elapsed - last(s).lastShot.at >= .7); await page.locator('.space-heading h2').click();
  await page.keyboard.press('Space'); const shot = await until('Third accepted pulse', s => last(s).shots === 3); assert.equal(last(shot).enemy.health, 24);
  assert.match(await page.locator('.space-notice').innerText(), /Pulz zasáhl cíl za\s*12.*Zbývá\s*24/);
  await page.keyboard.press('Space'); const rejected = await read(); intact(rejected); assert.ok(rejected.space.elapsed - last(shot).lastShot.at < .65); assert.equal(last(rejected).shots, 3);
  const historical = await page.locator('.space-notice').innerText(); assert.match(historical, /Poslední pulz odmítnut:.*dobíjí/); assert.equal(await page.locator('button[data-action="space-pulse"]').isDisabled(), true);
  await until('Real recharge restores the pulse button', s => s.space.elapsed - last(s).lastShot.at >= .8); assert.equal(await page.locator('button[data-action="space-pulse"]').isDisabled(), false);
  assert.equal(await page.locator('.space-notice').innerText(), historical); assert.doesNotMatch(await page.locator('#space-combat').innerText(), /Pulz se dobíjí/);
  observations.push({kind: 'historical-rejection-vs-ready-control', text: historical, elapsedSinceShot: (await read()).space.elapsed - last(shot).lastShot.at, buttonEnabled: true});
  await screenshot('historical-pulse-feedback-1024'); await act('space-pulse'); const accepted = await until('Fourth accepted pulse replaces old rejection', s => last(s).shots === 4);
  assert.equal(last(accepted).enemy.health, 12); const acceptedNotice = await page.locator('.space-notice').innerText(); assert.match(acceptedNotice, /Pulz zasáhl cíl za\s*12.*Zbývá\s*12/); assert.doesNotMatch(acceptedNotice, /odmítnut|dobíjí/);
  observations.push({kind: 'accepted-pulse-replaces-rejection', text: acceptedNotice, shots: 4, enemyHealth: 12}); checks.push('Cadence rejection is explicitly historical after recharge; the current button recovers and the next accepted pulse replaces the old rejection.');
  console.log(checks.at(-1));
  phase = 'wreck feedback and recovery branch'; const wreck = await importBranch(sources[1]); assert.equal(wreck.space.ship.health, 0); assert.equal(last(wreck).rescue, null);
  const initialCopy = await wreckCopy(); await page.locator('.space-heading h2').click(); await page.keyboard.press('Space'); const disabledPulseNotice = await page.locator('.space-notice').innerText(); assert.match(disabledPulseNotice, /Loď je vrak.*Nouzovou opravu najdeš vpravo/);
  await act('space-rescue'); const started = await until('Explicit rescue starts', s => !!last(s).rescue), startedAt = last(started).rescue.startedAt;
  const pending = await until('Ordinary rescue countdown', s => s.space.economy.elapsed - startedAt >= 3);
  assert.equal(pending.space.ship.health, 0); assert.equal(pending.space.ship.energy, wreck.space.ship.energy); assert.deepEqual(pending.space.location, wreck.space.location);
  const pendingCopy = await wreckCopy(), countdown = await page.locator('#space-combat [role="status"]').innerText(); assert.match(countdown, /Oprava · zbývá/);
  await screenshot('wreck-contextual-controls-1024');
  const healed = await until('Twelve real seconds return healthy controls', s => last(s).rescue.completedAt !== null); assert.equal(healed.space.ship.health, 25); assert.ok(last(healed).rescue.completedAt - startedAt >= 12 - 1e-7); assert.equal(healed.space.ship.energy, wreck.space.ship.energy);
  const healthyLeft = await page.locator('.space-instruments').innerText(), healthyFooter = await page.locator('.space-controls').innerText(), healthyApproach = await page.locator('.space-navigation > p').first().innerText();
  assert.match(healthyLeft, /Zastavení dobíjí \+4\.8 energie\/s/); assert.match(healthyLeft, /Shift přidá tah/); assert.match(healthyFooter, /WASD.*let/); assert.match(healthyFooter, /R \/ V/); assert.doesNotMatch(healthyFooter, /Vrak/); assert.match(healthyApproach, /Pro sestup se přibliž/);
  for (const action of ['space-up', 'space-down']) assert.equal(await page.locator(`button[data-action="${action}"]`).isDisabled(), false);
  await page.locator('.space-heading h2').click(); const beforeMove = await read(); await page.keyboard.down('d'); let moved; try {moved = await until('Ordinary movement really resumes', s => s.space.elapsed - beforeMove.space.elapsed >= .25);} finally {await page.keyboard.up('d');}
  assert.ok(Math.hypot(moved.space.location.pos.x - beforeMove.space.location.pos.x, moved.space.location.pos.z - beforeMove.space.location.pos.z) > 0); assert.equal(moved.space.ship.health, 25);
  observations.push({kind: 'contextual-wreck-and-restored-controls', initialCopy, disabledPulseNotice, pendingCopy, countdown, rescue: last(healed).rescue, energyBefore: wreck.space.ship.energy, energyAfter: healed.space.ship.energy, healthyLeft, healthyFooter, healthyApproach, resumedMovement: {before: beforeMove.space.location, after: moved.space.location}});
  checks.push('Wreck left/approach/footer describe inactive engines and recovery; after12 actual economic seconds25-health controls return and genuine WASD movement works.'); console.log(checks.at(-1));
  for (const source of sources) assert.equal(hash(await readFile(source.path)), source.sha256); assert.equal(hash(await readFile(canonical.path)), canonical.sha256);
  await writeFile(path.join(out, 'result.json'), JSON.stringify({checks, errors, assets, sources: sources.map(({state, ...source}) => source), canonical: {...canonical, preserved: true}, observations, images, disk: {before: diskBefore, after: await disk()}, provenance: 'Two independent public-import branches of actual D3a exports. Ordinary native RAF only, no state setters/debug time/edited payloads. These branches do not replace the canonical completed campaign or the full functional proof on the previous build. No successful branch exports were needed.'}, null, 2));
} catch (error) {
  let recovery = null;
  try {if ((await read()).mode === 'game') await act('pause'); await act('saves'); const pending = page.waitForEvent('download'); await act('export'); const stream = await (await pending).createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk); const bytes = Buffer.concat(chunks); await writeFile(path.join(out, 'failure-campaign.save.json'), bytes); recovery = hash(bytes);} catch { /* Retain diagnostic state if public recovery export is unavailable. */ }
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({phase, error: String(error), stack: error.stack, checks, errors, assets, sources: sources.map(({state, ...source}) => source), canonical, observations, images, recovery, state: await read().catch(() => null)}, null, 2)); console.error(error); process.exitCode = 1;
} finally {await context.close(); await browser.close(); console.log('Browser close completed');}
