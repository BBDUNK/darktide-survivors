// autoplay-menu-probe.js — 复现:进网页不点屏幕,过场自动跳主菜单后,首次点击应让主菜单曲响起
// 用法: node test/autoplay-menu-probe.js
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

  const state = () => page.evaluate(() => {
    const as = window.__audios.map(a => ({
      src: a.src.split('/').pop(), ready: a.readyState, t: +a.currentTime.toFixed(2), paused: a.paused
    }));
    return { audios: as, state: window.Debug && window.Debug.state ? window.Debug.state() : '?' };
  });

  await page.goto(URL);
  await page.waitForTimeout(6500);          // 不点屏幕,等过场自动跳主菜单(5s) + 缓冲
  const before = await state();
  console.log('不点击等6.5s后 state=' + before.state + ' audios=' + JSON.stringify(before.audios));

  await page.mouse.click(640, 400);          // 首次点击(解锁 + 重试录音曲)
  await page.waitForTimeout(1200);
  const after = await state();
  console.log('点击后 state=' + after.state + ' audios=' + JSON.stringify(after.audios));

  const am = after.audios.find(a => a.src.indexOf('dark-amulet.mp3') !== -1);
  const playing = !!am && am.ready >= 2 && am.t > 0 && !am.paused;
  console.log(playing
    ? 'PASS: 首次点击后主菜单曲(The Dark Amulet)已响起 (ready=' + am.ready + ', t=' + am.t + 's)'
    : 'FAIL: 主菜单曲未响起 ' + JSON.stringify(am));

  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
  else if (!playing) { process.exitCode = 1; }
  await browser.close();
})();
