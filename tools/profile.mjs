// Frame-time profiler: runs an autopilot race in headless Chrome (optionally with
// CPU throttling to mimic a phone) and prints where the main thread spends time.
// Usage: node tools/profile.mjs [trackId] [--throttle=4] [--phone] [--quality=high|low]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const track = args.find((a) => !a.startsWith('--')) || 'harbor';
const throttle = Number(opt('throttle', 1));
const phone = args.includes('--phone');
const quality = opt('quality', 'high');
const seconds = Number(opt('seconds', 8));

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));
const PORT = 8124;
const server = await startServer(PORT);
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport(
    phone
      ? { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }
      : { width: 1280, height: 720, deviceScaleFactor: 1 }
  );
  await page.evaluateOnNewDocument((q) => {
    localStorage.setItem('apexrush.save.v1', JSON.stringify({ settings: { quality: q } }));
  }, quality);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/?race=${track}&autopilot&laps=3&opp=11`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.apexRush?.game?.scene?.getScene('race')?.rm?.racing, { timeout: 30000 });
  await sleep(1500);
  const cdp = await page.createCDPSession();
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // wrap scene.update and renderer.render to split simulation from draw submission
  await page.evaluate(() => {
    const g = window.apexRush.game;
    const scene = g.scene.getScene('race');
    const st = (window.__prof = { upd: 0, ren: 0, frames: 0, dts: [] });
    const u = scene.sys.sceneUpdate.bind(scene);
    scene.sys.sceneUpdate = (t, d) => {
      const a = performance.now();
      u(t, d);
      st.upd += performance.now() - a;
      st.frames++;
      st.dts.push(d);
    };
    const r = g.renderer.render.bind(g.renderer);
    g.renderer.render = (...x) => {
      const a = performance.now();
      r(...x);
      st.ren += performance.now() - a;
    };
    st.objs = scene.children.list.length;
    st.gfx = scene.children.list.filter((o) => o.type === 'Graphics').length;
  });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await sleep(seconds * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const st = await page.evaluate(() => {
    const p = window.__prof;
    const d = p.dts.slice().sort((a, b) => a - b);
    const scene = window.apexRush.game.scene.getScene('race');
    return {
      frames: p.frames,
      updMs: p.upd / p.frames,
      renMs: p.ren / p.frames,
      fps: 1000 / (d.reduce((s, v) => s + v, 0) / d.length),
      p95: d[Math.floor(d.length * 0.95)],
      objs: p.objs,
      gfx: p.gfx,
      visible: scene.children.list.filter((o) => o.visible).length,
      canvas: `${window.apexRush.game.canvas.width}x${window.apexRush.game.canvas.height}`,
    };
  });
  // self time per function
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  const counts = new Map();
  profile.samples.forEach((id, k) => counts.set(id, (counts.get(id) || 0) + (dt[k] || 0)));
  for (const [id, us] of counts) {
    const n = byId.get(id);
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + us);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`track=${track} throttle=${throttle}x phone=${phone} quality=${quality} canvas=${st.canvas}`);
  console.log(
    `frames=${st.frames} fps=${st.fps.toFixed(1)} p95dt=${st.p95.toFixed(1)}ms  update=${st.updMs.toFixed(2)}ms render=${st.renMs.toFixed(2)}ms  objects=${st.objs} (graphics ${st.gfx}, visible ${st.visible})`
  );
  console.log('top self time:');
  [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(opt("top", 28)))
    .forEach(([k, v]) => console.log(`  ${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`));
} finally {
  await browser.close();
  server.close();
}
