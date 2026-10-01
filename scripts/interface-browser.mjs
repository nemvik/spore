/** Interface regression with isolated storage and existing save fixtures.
 * This checks presentation and controls, not earned campaign progression. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const output = path.resolve(process.env.LUMAVORA_EVIDENCE ?? 'evidence/interface-comfort');
await mkdir(output, { recursive: true });
const server = process.env.LUMAVORA_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 5261, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem('lumavora:settings', JSON.stringify({ quality: 'low', muted: true, reducedMotion: true })));
const page = await context.newPage(), errors = [], checks = [];
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(30000);
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const base = process.env.LUMAVORA_URL ?? 'http://127.0.0.1:5261';
const action = value => page.locator(`[data-action="${value}"]`).first().click();
const panel = id => page.locator(`details[data-hud-panel="${id}"]`);
const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const isOpen = locator => locator.evaluate(el => el.open);
async function toggle(locator, open, keyboard = false) {
  if (await isOpen(locator) !== open) {
    const summary = locator.locator(':scope > summary');
    if (keyboard) { await summary.focus(); await summary.press('Space'); } else await summary.click();
    await settled();
  }
  assert.equal(await isOpen(locator), open);
}
async function loadFixture(file) {
  await page.goto(`${base}/?test=1`);
  await action('saves');
  await page.locator('#import-save').setInputFiles(path.resolve(file), { timeout: 30000 });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'game');
  await settled();
}
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  assert.ok(await locator.isVisible());
  assert.ok(await locator.evaluate(el => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight && el.contains(document.elementFromPoint(x, y));
  }), 'Control remains on screen and unobstructed');
}
try {
  await page.goto(`${base}/?test=1`);
  await action('new');
  assert.ok(await page.locator('#world').isVisible());
  assert.equal(await panel('organism-vitals').count(), 1, 'Vitals can be collapsed');
  const initialFont = await page.locator('#objective-next').evaluate(el => parseFloat(getComputedStyle(el.querySelector('p')).fontSize));
  assert.ok(await page.locator('#objective-next').isVisible());
  assert.equal(await isOpen(panel('objective-details')), false, 'Detailed requirements start folded');
  assert.equal(await page.locator('#requirements').isVisible(), false);
  await page.keyboard.press('F6');
  assert.equal(await page.locator(':focus').evaluate(el => el.parentElement.dataset.hudPanel), 'organism-objective', 'F6 enters the HUD from the world');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').evaluate(el => el.parentElement.dataset.hudPanel), 'objective-details', 'Tab navigates the HUD without opening the editor');
  await page.keyboard.press('F6');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'world', 'F6 returns focus to the world');
  await toggle(panel('objective-details'), true, true);
  assert.ok(await page.locator('#requirements').isVisible());
  await toggle(panel('objective-details'), false, true);
  await toggle(panel('organism-vitals'), false, true);
  assert.equal(await page.locator('#health-wrap').isVisible(), false);
  await page.keyboard.press('Escape');
  await page.locator('#interface-text-size').selectOption('1.3');
  await action('close');
  assert.equal(await isOpen(panel('organism-vitals')), false, 'Collapsed state survives the pause');
  const scaledFont = await page.locator('#objective-next').evaluate(el => ({ font: parseFloat(getComputedStyle(el.querySelector('p')).fontSize), scale: getComputedStyle(el).getPropertyValue('--ui-text-scale'), preferences: localStorage.getItem('lumavora:interface') }));
  assert.ok(scaledFont.font >= initialFont * 1.29, JSON.stringify({ initialFont, ...scaledFont }));
  await action('save');
  await page.reload(); await action('saves');
  await page.locator('[data-action^="load:"]').first().click();
  await settled();
  assert.equal(await isOpen(panel('organism-vitals')), false, 'Collapsed state survives reload');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#interface-text-size').inputValue(), '1.3');
  await action('close');
  await toggle(panel('organism-vitals'), true);
  checks.push('New lineage: compact goal, keyboard disclosure, collapse, font scaling, pause and reload persistence');
  console.log(checks.at(-1));

  for (const [file, ids, screenshot] of [
    ['tests/fixtures/evolution/spines-reef.save.json', ['organism-objective', 'organism-vitals'], 'reef-large'],
    ['tests/fixtures/evolution/creature-social-tribe-start.save.json', ['tribe-neighbours', 'tribe-selection'], 'tribe-large'],
    ['tests/fixtures/evolution/earned-civilization-budget.save.json', ['machine-regions', 'machine-selection'], null],
    ['tests/fixtures/saves/stable-sandbox.save.json', ['planet-vehicle', 'planet-community'], null],
    ['tests/fixtures/geography/sp-009b-economy.save.json', ['field', 'city'], null],
    ['tests/fixtures/space/native-d5-flight.save.json', ['space-instruments', 'space-navigation'], 'space-large'],
  ]) {
    console.log(`Checking ${file}`);
    await loadFixture(file);
    await page.setViewportSize({ width: 1024, height: 640 });
    for (const id of ids) {
      await reachable(panel(id).locator(':scope > summary'));
      await toggle(panel(id), false);
      const folded = await panel(id).boundingBox();
      assert.ok(folded.height < 110, `${id} frees the world view`);
      await toggle(panel(id), true, true);
      await settled();
      assert.equal(await isOpen(panel(id)), true, 'Live updates preserve the open panel');
    }
    await reachable(page.locator('[data-action="pause"]').first());
    if (ids.includes('tribe-neighbours')) {
      await action('tribe-all');
      await reachable(page.locator('[data-action="tribe-retreat"]'));
      for (const overlay of ['animals', 'chief']) {
        await action(`tribe-${overlay}`);
        await reachable(page.locator('[data-action="tribe-retreat"]'));
        await action(`tribe-${overlay}-close`);
      }
    }
    if (screenshot) await page.screenshot({ path: path.join(output, `${screenshot}.png`) });
    checks.push(`${file}: panels reachable at 1024×640, 130% text; collapse and keyboard reopening`);
  }
  // Isolate the transport panels' fixed top/bottom CSS from the 3D scene.
  // Their shared frame must release its height even while status is streaming.
  const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  try {
    const { hudPanelStart } = await ssr.ssrLoadModule('/src/ui/hud-layout.ts');
    const css = (await Promise.all(['tokens.css', 'styles.css', 'interface.css'].map(file => readFile(`src/ui/${file}`, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '');
    for (const id of ['sailing', 'commerce']) {
      await page.setContent(`<style>${css}</style><div id="ui" style="--ui-text-scale:1.3">${hudPanelStart(id, 'Přeprava', 'sea-panel panel')}<div><p>Probíhá přeprava.</p><button>Vrátit se</button></div></details></div>`);
      const box = await panel(id).boundingBox();
      assert.ok(box.height < 110, `${id}: folded transport frame releases its fixed height`);
      await toggle(panel(id), true, true);
      assert.ok(await page.getByRole('button', { name: 'Vrátit se' }).isVisible());
      checks.push(`${id}: fixed transport frame collapses and its controls reopen`);
    }
  } finally { await ssr.close(); }
  assert.deepEqual(errors, []);
  await rm(path.join(output, 'failure.png'), { force: true });
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, checks, errors, note: 'Isolated UI checks with existing fixtures; no active campaign was changed. No trace or video.' }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: false, checks, errors, failure: String(error) }, null, 2));
  console.error(error, { errors, checks });
  process.exitCode = 1;
} finally {
  await context.close(); await browser.close(); await server?.close();
}
