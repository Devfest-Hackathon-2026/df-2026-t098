// Renders every whylint-*.svg in this folder to a PNG (2x). Usage: node render.mjs
// Needs playwright-core, which the e2e workspace already installs.
import { chromium } from '../../e2e/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
for (const file of fs.readdirSync(dir).filter((f) => /^whylint-.*\.svg$/.test(f))) {
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: path.join(dir, file.replace(/\.svg$/, '.png')) });
  await page.close();
}
await browser.close();
