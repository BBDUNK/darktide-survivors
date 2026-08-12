// training-boss-music-probe.js — 严格验证:训练场生成 Boss 后切到录音战斗曲(Battle Theme A)
// 用法: node test/training-boss-music-probe.js
'use strict';
const path = require('path');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  // 在任何页面脚本前挂钩,记录所有 new Audio 元素(音乐文件播放元素)
  await page.addInitScript(() => {
    window.__audios = [];
    const Orig = window.Audio;
    window.Audio = function () {
      const el = new Orig();
      window.__audios.push(el);
      return el;
    };
    window.Audio.prototype = Orig.prototype;
  });

  await page.goto(URL);
  await page.waitForTimeout(1500);          // 等 boot
  await page.mouse.click(640, 360);         // 用户手势:解锁音频 + 进菜单
  await page.waitForTimeout(800);

  const audioState = () => page.evaluate(() => {
    const as = window.__audios.map(a => ({
      src: a.src.split('/').pop(),
      ready: a.readyState,
      t: +a.currentTime.toFixed(2),
      paused: a.paused
    }));
    return {
      audios: as,
      hasBoss: !!(window.Debug && window.Debug.run && window.Debug.run().boss)
    };
  });

  // 1. 进训练场(会播地图曲)
  await page.evaluate(() => window.Debug.startArtTest());
  await page.waitForTimeout(500);
  const before = await audioState();
  console.log('进训练场后 audios=' + JSON.stringify(before.audios) + ' hasBoss=' + before.hasBoss);

  // 2. 生成 Boss
  const ok = await page.evaluate(() => window.Debug.testAction('boss'));
  await page.waitForTimeout(2000);          // 等文件加载并开始播
  const after = await audioState();
  console.log('生成Boss后 audios=' + JSON.stringify(after.audios) + ' hasBoss=' + after.hasBoss);

  const bt = after.audios.find(a => a.src.indexOf('battle-theme-a.mp3') !== -1);
  const playing = !!bt && bt.ready >= 2 && bt.t > 0 && !bt.paused;
  console.log(playing
    ? 'PASS: 训练场生成Boss后 Battle Theme A 正在播放 (ready=' + bt.ready + ', t=' + bt.t + 's)'
    : 'FAIL: Battle Theme A 未在播放 ' + JSON.stringify(bt));

  // 3. 清场:应恢复地图曲,Battle Theme A 停止
  await page.evaluate(() => window.Debug.testAction('clear'));
  await page.waitForTimeout(600);
  const cleared = await audioState();
  const btAfter = cleared.audios.find(a => a.src.indexOf('battle-theme-a.mp3') !== -1);
  const stopped = !btAfter || btAfter.paused;
  console.log(stopped
    ? 'PASS: 清场后 Battle Theme A 已停止,恢复地图曲'
    : 'WARN: 清场后 Battle Theme A 仍在播放');

  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else if (!playing) { process.exitCode = 1; }
  await browser.close();
})();
