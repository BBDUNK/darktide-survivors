// resp-probe.js — 多分辨率/多比例下验证 HUD 不被裁切(等比适配验证)
// 用法: node test/resp-probe.js
'use strict';
const path = require('path');
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', 'resp');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

// 各分辨率:宽×高。覆盖 16:9、超宽、4:3、竖屏手机
const VIEWPORTS = [
  { name: 'd16x9',  w: 1280, h: 720 },   // 标准桌面
  { name: 'ultra',  w: 2560, h: 1080 },  // 超宽 21:9
  { name: 'v43',    w: 1024, h: 768 },   // 4:3 老屏
  { name: 'phone',  w: 375,  h: 667 },   // 竖屏手机
  { name: 'land',   w: 844,  h: 390 },   // 横屏手机
  { name: 'sq',     w: 800,  h: 800 },   // 方屏
];

// 逻辑像素内,运行中 HUD 的关键角点区域(与 CSS/绘制坐标一致)
const HUD_BOXES = {
  'xp':        { x: 0,    y: 0,     w: 200, h: 16 },   // 经验条左段
  'hp':        { x: 0,    y: 20,    w: 190, h: 30 },   // 血条
  'minimap':   { x: 960 - 116, y: 16, w: 116, h: 116 },// 小地图
  'timer':     { x: 480 - 60,  y: 20,  w: 120, h: 22 },// 顶部计时
  'gold':      { x: 0,    y: 540 - 40, w: 160, h: 30 },// 左下金币
};

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const errors = [];

  // 进入一局并跑到 HUD 出现,返回 canvas 布局信息
  async function enterRun(page) {
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    await page.goto(URL);
    await page.waitForTimeout(900);
    await page.mouse.click(10, 10);          // 跳过开幕
    await page.waitForTimeout(400);
    await page.getByText('开始远征').click();
    await page.waitForTimeout(400);
    await page.getByText('下一步').click();
    await page.waitForTimeout(400);
    await page.getByText('出发').click();
    await page.waitForTimeout(1800);
  }

  // 取渲染出来的画布尺寸与 UI 覆盖层位置,判断逻辑 960×540 是否完整落在视口内
  async function layoutInfo(page) {
    return page.evaluate(() => {
      const c = document.getElementById('game');
      const ui = document.getElementById('ui');
      const cr = c.getBoundingClientRect();
      const ur = ui.getBoundingClientRect();
      return {
        canvas: { left: cr.left, top: cr.top, w: cr.width, h: cr.height, right: cr.right, bottom: cr.bottom },
        ui: { left: ur.left, top: ur.top, w: ur.width, h: ur.height, right: ur.right, bottom: ur.bottom },
        viewW: window.innerWidth, viewH: window.innerHeight
      };
    });
  }

  let allOk = true;
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await enterRun(page);
    await page.waitForTimeout(300);
    const info = await layoutInfo(page);
    await page.screenshot({ path: path.join(OUT, vp.name + '.png') });

    // 断言:画布四条边全部在视口内(无裁切)
    const c = info.canvas;
    const inView =
      c.left >= -1 && c.top >= -1 &&
      c.right <= info.viewW + 1 && c.bottom <= info.viewH + 1;
    // 断言:UI 覆盖层与画布完全重合(否则 HUD 会偏出画面)
    const u = info.ui;
    const uiAligns = Math.abs(u.left - c.left) < 1.5 && Math.abs(u.top - c.top) < 1.5 &&
      Math.abs(u.w - c.w) < 1.5 && Math.abs(u.h - c.h) < 1.5;
    // 断言:画布宽高比保持 16:9(未拉伸)
    const aspect = c.w / c.h;
    const keepAspect = Math.abs(aspect - 16 / 9) < 0.01;
    const ok = inView && keepAspect && uiAligns;
    if (!ok) allOk = false;

    console.log(`[${vp.name}] ${vp.w}×${vp.h} canvas=${c.w.toFixed(0)}×${c.h.toFixed(0)} ` +
      `pos=(${c.left.toFixed(0)},${c.top.toFixed(0)}) ar=${aspect.toFixed(3)} ` +
      `inView=${inView} uiAlign=${uiAligns} aspect=${keepAspect} ${ok ? 'OK' : '!! CROPPED'}`);
    if (ok) console.log(`  视口富余:左右 ${Math.max(0, Math.round(Math.max(c.left, info.viewW - c.right)))}px,上下 ${Math.max(0, Math.round(Math.max(c.top, info.viewH - c.bottom)))}px`);
    await page.close();
  }

  await browser.close();

  if (errors.length) {
    console.error('\n!!! 浏览器报错 ' + errors.length + ' 条:');
    [...new Set(errors)].slice(0, 20).forEach(e => console.error('  ' + e));
  }
  console.log(allOk
    ? '\n=== 等比适配验证:全部分辨率下画布完整可见且不变形 ==='
    : '\n=== 存在裁切/变形!查看 shots/resp/ 下的截图 ===');
  process.exit(allOk && errors.length === 0 ? 0 : 1);
})();
