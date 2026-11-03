// Startup timing: loads the game in headless Chrome with a throttled network
// and CPU (like a phone on 4G) and reports what the time goes to.
// Usage: node tools/loadtime.mjs [--mbps=10] [--rtt=60] [--throttle=4] [--warm] [--dist]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => Number((args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d);
const mbps = opt('mbps', 10);
const rtt = opt('rtt', 60);
const throttle = opt('throttle', 4);
const BROWSERS = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].filter(Boolean);
const PORT = Number(process.env.PORT) || 8127;
const dist = args.includes('--dist');
const server = await startServer(PORT, dist ? { dir: fileURLToPath(new URL('../dist/', import.meta.url)) } : undefined);
const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => fs.existsSync(p)),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  if (!args.includes('--warm')) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: rtt,
    downloadThroughput: (mbps * 1e6) / 8,
    uploadThroughput: (5 * 1e6) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?nosw&prod`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => performance.getEntriesByName('apex:world').length, { timeout: 300000, polling: 200 });
  const r = await page.evaluate(() => {
    const m = (n) => performance.getEntriesByName(n)[0]?.startTime ?? NaN;
    const res = performance.getEntriesByType('resource');
    const by = {};
    for (const e of res) {
      const ext = e.name.split('?')[0].split('.').pop();
      const b = (by[ext] ||= { n: 0, kb: 0, fails: 0 });
      b.n++;
      b.kb += (e.transferSize || e.encodedBodySize || 0) / 1024;
      if (e.responseStatus >= 400) b.fails++;
    }
    return {
      main: m('apex:main'),
      preload: m('apex:preload'),
      create: m('apex:create'),
      done: m('apex:boot-done'),
      menu: m('apex:menu'),
      world: m('apex:world'),
      requests: res.length,
      by,
      lastResource: Math.max(...res.map((e) => e.responseEnd)),
    };
  });
  const f = (v) => `${(v / 1000).toFixed(2)}s`;
  console.log(`${dist ? 'dist build' : 'source folder'}, network ${mbps} Mbps / ${rtt} ms RTT, CPU ${throttle}x${args.includes('--warm') ? ', warm cache' : ''}`);
  console.log(`menu shown after   ${f(r.menu)}   (background race in after ${f(r.world)})`);
  console.log(`  main.js running   ${f(r.main)}   (html + phaser + module imports)`);
  console.log(`  image loading     ${f(r.preload)} -> ${f(r.create)}`);
  console.log(`  boot processing   ${f(r.create)} -> ${f(r.done)}`);
  console.log(`  menu              ${f(r.done)} -> ${f(r.menu)}`);
  console.log(`  background race   ${f(r.menu)} -> ${f(r.world)}`);
  console.log(`requests: ${r.requests}`);
  for (const [ext, b] of Object.entries(r.by).sort((a, b) => b[1].kb - a[1].kb)) {
    console.log(`  .${ext.padEnd(6)} ${String(b.n).padStart(3)} files ${b.kb.toFixed(0).padStart(7)} KB${b.fails ? `  (${b.fails} failed)` : ''}`);
  }
} finally {
  await browser.close();
  server.close();
}
