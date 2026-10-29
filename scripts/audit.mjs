#!/usr/bin/env node
// audit-my-layout runner: drives Playwright through every viewport, runs measure.js,
// screenshots problem areas, writes <out>/report.json and prints markdown tables.
// Usage: node audit.mjs <url> [--scope ".sel"] [--scale 4,8,16,24,32,48] [--container 1200]
//                       [--viewports 1440,1024,768,390] [--out ./layout-audit] [--tolerance 1]
// Needs `playwright` or `playwright-core` resolvable (set PLAYWRIGHT_PATH to its folder if not).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : d; };
if (!url) { console.error('usage: audit.mjs <url> [--scope sel] [--scale a,b] [--container px] [--viewports a,b] [--out dir]'); process.exit(2); }

const cfg = {
  scope: opt('scope', 'body'),
  scale: opt('scale') ? opt('scale').split(',').map(Number) : null,
  containerMax: opt('container') ? Number(opt('container')) : null,
  tolerance: Number(opt('tolerance', 1)),
  cap: 60,
};
const viewports = opt('viewports', '1440,1024,768,390').split(',').map(Number);
const outDir = path.resolve(opt('out', './layout-audit'));
fs.mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
let pw;
for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'].filter(Boolean)) {
  try { pw = require(p); break; } catch {}
}
if (!pw) { console.error('playwright not found. npm i playwright, or set PLAYWRIGHT_PATH.'); process.exit(2); }

const measure = fs.readFileSync(path.join(here, 'measure.js'), 'utf8');
let browser;
const exe = opt('chrome', process.env.CHROME_PATH);
try { browser = await pw.chromium.launch(exe ? { executablePath: exe } : {}); }
catch (e) { browser = await pw.chromium.launch({ channel: 'chrome' }).catch(() => { console.error(e.message.split('\n')[0] + '\nTry: npx playwright install chromium, or --chrome <path>'); process.exit(2); }); }
const report = { url, cfg, viewports: {} };

for (const width of viewports) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  // trigger lazy content: scroll through once, then back to top
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0; const step = Math.max(300, innerHeight * 0.8);
      const t = setInterval(() => { scrollBy(0, step); y += step; if (y >= document.documentElement.scrollHeight) { clearInterval(t); res(); } }, 120);
    });
    scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); }))));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);

  await page.evaluate((c) => { window.__LAYOUT_AUDIT_CONFIG = c; }, cfg);
  const res = await page.evaluate(measure);
  report.viewports[width] = res;

  // screenshots: full page + clip of each High issue (max 6)
  await page.screenshot({ path: path.join(outDir, `${width}-full.png`), fullPage: true });
  const highs = Object.entries(res.issues).flatMap(([type, list]) => list.filter((i) => i.sev === 'High').map((i) => ({ type, ...i }))).slice(0, 6);
  let n = 0;
  for (const h of highs) {
    try {
      const loc = page.locator(h.selector).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 1500 });
      const box = await loc.boundingBox();
      if (!box) continue;
      const file = `${width}-${h.type}-${++n}.png`;
      await page.screenshot({ path: path.join(outDir, file), clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: Math.min(box.width + 32, width), height: Math.min(box.height + 32, 600) }, fullPage: true });
      h.screenshot = file;
      res.issues[h.type].find((i) => i.selector === h.selector && i.sev === 'High').screenshot = file;
    } catch {}
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

// markdown tables
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
for (const [w, r] of Object.entries(report.viewports)) {
  console.log(`\n## ${w}px  (${r.stats.elements} elements, ${r.stats.groups} sibling groups)\n`);
  console.log('| Severity | Issue type | Selector | Expected | Actual | Difference |\n|---|---|---|---|---|---|');
  for (const [type, list] of Object.entries(r.issues)) {
    for (const i of list) {
      const t = type + (i.axis ? `/${i.axis}` : i.dim ? `/${i.dim}` : i.prop ? `/${i.prop}` : i.kind ? `/${i.kind}` : i.edge ? `/${i.edge}` : '');
      console.log(`| ${i.sev} | ${t} | \`${cell(i.selector)}\` | ${cell(i.expected)} | ${cell(i.actual)} | ${cell(i.diff)}px${i.count ? ` ×${i.count}` : ''}${i.screenshot ? ` ([shot](${i.screenshot}))` : ''} |`);
    }
  }
  const trunc = Object.entries(r.truncated).filter(([, n]) => n);
  if (trunc.length) console.log(`\n_truncated: ${trunc.map(([k, n]) => `${k} +${n}`).join(', ')}_`);
  if (r.unmeasurable.length) console.log(`\nNot measurable: ${r.unmeasurable.slice(0, 8).map((u) => `\`${u.selector}\` (${u.reason})`).join('; ')}`);
}
console.log(`\nArtifacts: ${outDir}`);
