// music-probe.js — 真实浏览器循环播放全部主题(菜单+4 Boss)×4 强度,捕获控制台异常
// 用法: node test/music-probe.js
'use strict';
const path = require('path');
// playwright 装在临时目录(不进项目依赖);PW_ROOT 可覆盖
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'test', 'music-probe.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = [];
  const warns = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
    if (m.type() === 'warning') warns.push('console.warn: ' + m.text());
  });

  await page.goto(URL);
  await page.click('#go');                 // 用户手势:解锁 AudioContext
  await page.waitForTimeout(300);
  // 5 主题 × 4 强度 × 1.6s + 余量
  await page.waitForTimeout(5 * 4 * 1600 + 2500);

  const txt = await page.evaluate(() => document.getElementById('out').textContent);
  console.log(txt);
  if (errors.length || warns.length) {
    if (errors.length) console.error('ERRORS:\n' + errors.join('\n'));
    if (warns.length) console.error('WARNINGS:\n' + warns.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('OK: 全部主题各强度调度无异常');
  }
  await browser.close();
})();
