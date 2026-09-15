import { mkdir } from 'node:fs/promises';
const out = process.env.INSPECT_OUTPUT ?? 'evidence/quality/regression/inspect';
await mkdir(out, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH??='/private/tmp/lumavora-browsers';
const {chromium}=await import('playwright');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>console.log('ERROR',e.message));
await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForTimeout(1500);await page.screenshot({path:`${out}/menu.png`});await page.click('#start-btn');await page.waitForTimeout(600);await page.screenshot({path:`${out}/micro-first.png`});await page.keyboard.press('Tab');await page.waitForTimeout(600);await page.screenshot({path:`${out}/editor-first.png`});console.log(await page.evaluate(()=>({mode:JSON.parse(render_game_to_text()).mode,render:lumavora_metrics()})));await browser.close();
