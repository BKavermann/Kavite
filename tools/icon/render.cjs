// Renders android/icon-ship.png (transparent) and icon-ship.json (engine positions)
// with headless Chromium via Playwright; tools/make_icon.py composes the icon from them.
// Usage: node tools/icon/render.cjs    (needs esbuild from npx and playwright)
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kicon-'));
execSync(`npx esbuild ${path.join(__dirname, 'ship-k.js')} --bundle --format=esm --outfile=${tmp}/icon.js --log-level=warning`, { cwd: root, stdio: 'inherit' });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('ERR', e.message));
  await pg.setContent('<!doctype html><body style="margin:0;background:transparent">');
  await pg.addScriptTag({ type: 'module', content: fs.readFileSync(`${tmp}/icon.js`, 'utf8') });
  await pg.waitForFunction(() => window.renderIcon);
  const out = await pg.evaluate(() => window.renderIcon(1024));
  fs.writeFileSync(path.join(root, 'android', 'icon-ship.png'), Buffer.from(out.png.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(root, 'android', 'icon-ship.json'), JSON.stringify({ engines: out.engines }));
  await b.close();
  console.log('wrote android/icon-ship.png');
})();
