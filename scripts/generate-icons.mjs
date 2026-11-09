// Renders the PWA icons from inline SVG using the pre-installed Playwright Chromium.
// Usage: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}

const flame = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M268 80c16 60-11 91-37 120-24 27-47 53-47 98 0 61 45 118 108 118s108-48 108-110c0-49-26-83-51-107 2 29-6 51-25 62 4-74-19-138-56-181Z" fill="#4d8ff5"/>
    <path d="M294 252c10 37-30 51-30 89 0 26 19 45 41 45 26 0 44-21 44-47 0-29-21-50-55-87Z" fill="#ffffff"/>
    <rect x="96" y="352" width="128" height="32" rx="16" fill="#ffffff"/>
    <rect x="144" y="304" width="32" height="128" rx="16" fill="#ffffff"/>
  </g>`;
const icon = (maskable) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${maskable ? '' : 'rx="112"'} fill="#0b1730"/>
  ${flame(maskable ? 0.72 : 1)}
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', icon(false));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon(maskable).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
