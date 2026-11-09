import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../e2e/node_modules/playwright/index.mjs';

const web = new URL('../../frontend/public/brand/', import.meta.url);
const android = new URL(
  '../android/app/src/main/res/drawable/',
  import.meta.url,
);
const ios = new URL('../ios/WhyLint/Assets.xcassets/', import.meta.url);

function vector(width, height, paths, viewport = [width, height]) {
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${width}dp" android:height="${height}dp"
    android:viewportWidth="${viewport[0]}" android:viewportHeight="${viewport[1]}">
${paths}
</vector>\n`;
}

for (const name of [
  'mark-dark',
  'mark-light',
  'wordmark-dark',
  'wordmark-light',
]) {
  const svg = await readFile(new URL(`${name}.svg`, web), 'utf8');
  const [, width, height] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const paths = [...svg.matchAll(/<path fill="(#[\da-f]+)" d="([^"]+)"\/>/gi)]
    .map(
      ([, color, data]) =>
        `    <path android:fillColor="${color}" android:pathData="${data}"/>`,
    )
    .join('\n');
  await writeFile(
    new URL(`brand_${name.replaceAll('-', '_')}.xml`, android),
    vector(width, height, paths),
  );

  const images = new URL(`brand-${name}.imageset/`, ios);
  await mkdir(images, { recursive: true });
  await writeFile(new URL(`${name}.svg`, images), svg);
  await writeFile(
    new URL('Contents.json', images),
    JSON.stringify(
      {
        images: [{ filename: `${name}.svg`, idiom: 'universal' }],
        info: { author: 'xcode', version: 1 },
        properties: { 'preserves-vector-representation': true },
      },
      null,
      2,
    ) + '\n',
  );

  if (name === 'mark-dark') {
    const size = 108;
    const scale = (size * 0.56) / Number(width);
    const x = (size - Number(width) * scale) / 2;
    const y = (size - Number(height) * scale) / 2;
    const launcher = `    <path android:fillColor="#080808" android:pathData="M0 0H108V108H0Z"/>
    <group android:scaleX="${scale}" android:scaleY="${scale}"
        android:translateX="${x}" android:translateY="${y}">
${paths
  .split('\n')
  .map((path) => `    ${path}`)
  .join('\n')}
    </group>`;
    await writeFile(
      new URL('app_icon.xml', android),
      vector(size, size, launcher),
    );

    const mark = svg
      .slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))
      .trim();
    const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="16" fill="#080808"/>
  <g transform="translate(${x.toFixed(4)} ${y.toFixed(4)}) scale(${scale.toFixed(4)})">
    ${mark}
  </g>
</svg>\n`;
    await writeFile(new URL('favicon.svg', web), favicon);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 1024 },
      });
      await page.setContent(`<body style="margin:0;background:#080808;display:grid;place-items:center;height:100vh">
        <div style="width:56%">${svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="auto"')}</div>
      </body>`);
      await page.screenshot({
        path: new URL('AppIcon.appiconset/Icon.png', ios).pathname,
      });

      await page.setViewportSize({ width: 32, height: 32 });
      await page.setContent(`<body style="margin:0">${favicon}</body>`);
      const png = await page.screenshot({ omitBackground: true });
      const header = Buffer.alloc(22);
      header.writeUInt16LE(1, 2);
      header.writeUInt16LE(1, 4);
      header[6] = 32;
      header[7] = 32;
      header.writeUInt16LE(1, 10);
      header.writeUInt16LE(32, 12);
      header.writeUInt32LE(png.length, 14);
      header.writeUInt32LE(header.length, 18);
      await writeFile(
        new URL('../favicon.ico', web),
        Buffer.concat([header, png]),
      );
    } finally {
      await browser.close();
    }
  }
}
