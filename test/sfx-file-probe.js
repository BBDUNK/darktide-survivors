// 文件音效验收:真浏览器里确认 Kenney WAV 被加载且播放走 AudioBufferSource,
// 同时验证加载失败时的合成兜底路径。
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
function assert(ok, msg) { if (!ok) throw new Error(msg); }

async function withServer(handler, fn) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    if (handler(p, res)) return;
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn('http://127.0.0.1:' + server.address().port + '/index.html'); }
  finally { server.close(); }
}

(async () => {
  // 用例 1:正常路径,文件音效播放
  const result = await withServer(() => false, async url => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Debug && Debug.state() === 'menu', null, { timeout: 25000 });
    await page.mouse.click(640, 360);        // 手势解锁音频
    await page.waitForTimeout(300);
    const stats = await page.evaluate(async () => {
      // 计数 AudioBufferSourceNode.start 与 OscillatorNode.start
      let bufStarts = 0, oscStarts = 0;
      const bs = AudioBufferSourceNode.prototype.start;
      const os = OscillatorNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function () { bufStarts++; return bs.apply(this, arguments); };
      OscillatorNode.prototype.start = function () { oscStarts++; return os.apply(this, arguments); };
      const names = ['hit1', 'coin', 'crit', 'shoot_bolt', 'summon_demon', 'ui_click'];
      for (const n of names) AudioSys.play(n);
      await new Promise(r => setTimeout(r, 900));   // 等懒加载+播放
      for (const n of names) AudioSys.play(n);      // 第二轮:缓存命中应全部走文件
      await new Promise(r => setTimeout(r, 400));
      AudioBufferSourceNode.prototype.start = bs;
      OscillatorNode.prototype.start = os;
      const wavLoaded = performance.getEntriesByType('resource')
        .filter(e => e.name.includes('/assets/audio/sfx/')).length;
      return { bufStarts, oscStarts, wavLoaded };
    });
    await browser.close();
    return { stats, errors };
  });
  console.log(JSON.stringify(result.stats));
  assert(result.errors.length === 0, 'console errors: ' + result.errors.join(' | '));
  assert(result.stats.wavLoaded >= 5, 'sfx wav files were not fetched: ' + result.stats.wavLoaded);
  assert(result.stats.bufStarts >= 8, 'buffer sources did not play: ' + result.stats.bufStarts);

  // 用例 2:全部 WAV 404,退回程序合成(Oscillator 仍在响)
  const result2 = await withServer((p, res) => {
    if (p.startsWith('/assets/audio/sfx/')) { res.writeHead(404); res.end(); return true; }
    return false;
  }, async url => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Debug && Debug.state() === 'menu', null, { timeout: 25000 });
    await page.mouse.click(640, 360);
    await page.waitForTimeout(200);
    const stats = await page.evaluate(async () => {
      let oscStarts = 0;
      const os = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function () { oscStarts++; return os.apply(this, arguments); };
      const names = ['hit1', 'coin', 'crit', 'ui_click'];
      for (const n of names) AudioSys.play(n);
      await new Promise(r => setTimeout(r, 300));
      OscillatorNode.prototype.start = os;
      return { oscStarts };
    });
    await browser.close();
    return { stats, errors };
  });
  console.log(JSON.stringify(result2.stats));
  assert(result2.errors.length === 0, 'fallback console errors: ' + result2.errors.join(' | '));
  assert(result2.stats.oscStarts > 0, 'synth fallback did not fire when wavs are missing');
  console.log('SFX OK   Kenney WAV file sfx play in real browser, synth fallback verified');
})().catch(err => { console.error(err.stack || err); process.exit(1); });
