// Browser smoke test of the built compat app. Usage: node smoke.mjs http://localhost:4300
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4300';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const annotate = (level, msg) => console.log(`::${level}::${String(msg).replace(/\r?\n/g, ' | ')}`);
process.on('unhandledRejection', (e) => { annotate('error', `smoke crashed: ${e?.stack ?? e}`); process.exit(1); });
const fail = async (msg) => {
  annotate('error', `${msg}${errors.length ? ' -- page errors: ' + errors.join(' || ') : ''}`);
  await browser.close();
  process.exit(1);
};
const check = (cond, msg) => (cond ? console.log('ok -', msg) : fail(msg));

await page.goto(url);
await page.waitForSelector('#ed1 .nrte__content', { timeout: 15000 }).catch(() => fail('editor not rendered'));
annotate('notice', `Angular ${await page.textContent('#ng-version')}`);

const ed1 = page.locator('#ed1 .nrte__content');
const initial = await ed1.innerHTML();
await check(initial.includes('Hello'), 'initial HTML value is rendered');
await check(!initial.includes('onerror') && !initial.includes('script'), 'incoming HTML is sanitized');
await check(!(await page.evaluate(() => window.__xss)), 'no script executed');

// typing emits HTML through [(value)]
await ed1.click();
await page.keyboard.press('ControlOrMeta+A');
await page.keyboard.type('abc');
await page.waitForFunction(() => document.querySelector('#out')?.textContent?.includes('abc'), null, { timeout: 5000 })
  .catch(() => fail('typing does not update [(value)]'));
console.log('ok - typing updates [(value)]');

// bold via toolbar
await page.keyboard.press('ControlOrMeta+A');
await page.click('#ed1 button[title="Bold"]');
await page.waitForFunction(() => /<(b|strong)>abc<\/(b|strong)>/.test(document.querySelector('#out')?.textContent ?? ''), null, { timeout: 5000 })
  .catch(async () => fail(`bold not applied, got: ${await page.textContent('#out')}`));
console.log('ok - toolbar bold works');
await check(await page.locator('#ed1 button[title="Bold"]').getAttribute('aria-pressed') === 'true', 'bold button shows active state');

// external value change is pushed into the editor (source view round-trip)
await page.click('#ed1 button[title="HTML source"]');
await page.fill('#ed1 textarea.nrte__source', '<h2>From source</h2><a href="javascript:alert(1)">x</a>');
await page.click('#ed1 button[title="HTML source"]');
await page.waitForFunction(() => document.querySelector('#ed1 .nrte__content h2')?.textContent === 'From source', null, { timeout: 5000 })
  .catch(() => fail('source view does not update the editor'));
await check(!(await ed1.innerHTML()).includes('javascript:'), 'source view content is sanitized');

// reactive forms
const ed2 = page.locator('#ed2 .nrte__content');
await check((await ed2.innerHTML()).includes('form'), 'FormControl initial value is rendered');
await ed2.click();
await page.keyboard.press('End');
await page.keyboard.type(' typed');
await page.waitForFunction(() => document.querySelector('#form-out')?.textContent?.includes('typed'), null, { timeout: 5000 })
  .catch(() => fail('typing does not update the FormControl'));
console.log('ok - FormControl is updated');

await check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
annotate('notice', 'All smoke tests passed');
