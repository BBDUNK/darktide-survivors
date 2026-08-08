// shots.js — 用真实浏览器截图自查渲染/UI,并捕获控制台异常
// 用法: node test/shots.js   (需要 /tmp/pwshot 里装好 playwright)
'use strict';
const path = require('path');
// playwright 装在临时目录(不进项目依赖);PW_ROOT 可覆盖
const PW = process.env.PW_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'pwshot', 'node_modules', 'playwright');
let chromium;
try { chromium = require(PW).chromium; }
catch (e) { chromium = require(path.join(process.env.TEMP || '/tmp', 'pwshot', 'node_modules', 'playwright')).chromium; }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
const URL = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(1200);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  shot ' + name); };

  await shot('01-title');

  // 进入主菜单
  await page.mouse.click(640, 360);
  await page.waitForTimeout(600);
  await shot('02-menu');

  // 主菜单分支:圣坛、设置、成就、联机大厅
  await page.locator('.menu-altar .btn').click();
  await page.waitForTimeout(400);
  await shot('02b-shop');
  await page.locator('.screen:not(.hidden) .btn', { hasText: '返回' }).last().click();
  await page.locator('.menu-screen:not(.hidden) .btn', { hasText: '设置' }).click();
  await page.waitForTimeout(400);
  await shot('02c-settings');
  await page.locator('.screen:not(.hidden) .btn', { hasText: '返回' }).last().click();
  await page.locator('.menu-screen:not(.hidden) .btn', { hasText: '成就' }).click();
  await page.waitForTimeout(400);
  await shot('02d-achievements');
  await page.locator('.screen:not(.hidden) .btn', { hasText: '返回' }).last().click();
  await page.locator('.menu-screen:not(.hidden) .btn', { hasText: '联机远征' }).click();
  await page.waitForTimeout(400);
  await shot('02e-coop');
  await page.locator('.screen:not(.hidden) .btn', { hasText: '返回' }).last().click();

  // 百科全书:四个页签都截
  const vis = (sel) => page.locator(sel).locator('visible=true').first();
  await vis('text=📖 百科全书').click();
  await page.waitForTimeout(500);
  await shot('03-enc-weapons');
  for (const [label, name] of [['💠 被动', '04-enc-passives'], ['☠ 敌人', '05-enc-enemies'], ['📖 机制', '06-enc-mechanics']]) {
    await vis('text=' + label).click();
    await page.waitForTimeout(400);
    await shot(name);
  }
  await page.locator('.enc-layer >> text=← 返回').click();
  await page.waitForTimeout(400);

  // 开局
  await page.getByText('开始远征').click();
  await page.waitForTimeout(400);
  await shot('07-chars');
  await page.getByText('下一步').click();
  await page.waitForTimeout(400);
  await shot('07b-maps');
  await page.getByText('出发').click();
  await page.waitForTimeout(2500);
  await shot('08-run-early');

  // 走动一段,让怪聚过来
  for (const k of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(700);
    await page.keyboard.up(k);
  }
  await page.waitForTimeout(2500);
  await shot('09-run-combat');

  // 小地图全图模式
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(600);
  await shot('10-minimap-full');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(400);

  // 强制装备寒冰新星满级+进化,验证不再崩
  await page.evaluate(() => {
    const r = window.Debug.run();
    r.weapons.length = 0;
    Weapons.addWeapon(r, 'frostnova');
    r.weapons[0].lv = CFG.WEAPONS.frostnova.lv.length + 1;
    r.passives[CFG.WEAPONS.frostnova.evoNeed] = CFG.PASSIVES[CFG.WEAPONS.frostnova.evoNeed].maxLv;
    Entities.recomputeStats(r);
    r.pendingChest++;
  });
  // 宝箱按钮是延时出现的,必须等它可点
  await page.waitForTimeout(600);
  await shot('11-chest-evolve');
  const take = page.locator('text=收下').locator('visible=true').first();
  await take.waitFor({ state: 'visible', timeout: 15000 });
  await take.click();
  await page.waitForTimeout(2600);
  await shot('12-frostnova-evolved');
  await page.waitForTimeout(2400);
  await shot('12b-frostnova-sustained');

  // 若中途弹出升级/宝箱,先结算回 run 状态,避免按 ESC 停在升级界面
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      if (Debug.state() === 'run') return true;
      const card = document.querySelector('.modal:not(.hidden) .lu-card');
      if (card) {
        card.click();
        await wait(150);
        continue;
      }
      const take = [...document.querySelectorAll('.modal:not(.hidden) button')]
        .find((b) => b.textContent.includes('收下'));
      if (take) {
        take.click();
        await wait(150);
        continue;
      }
      await wait(200);
    }
    return Debug.state() === 'run';
  });
  await page.waitForFunction(() => Debug.state() === 'run', null, { timeout: 15000 });

  // 走到地图边界看结界
  await page.evaluate(() => {
    const r = window.Debug.run();
    r.player.x = CFG.GAME.MAP_R - 90;
    r.player.y = 0;
    Engine.cam.x = r.player.x; Engine.cam.y = 0;
  });
  await page.waitForTimeout(1400);
  await shot('13-boundary');

  // 暂停 + 局内百科
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await shot('14-pause');
  await page.locator('.modal:not(.hidden) button', { hasText: '百科全书' }).first()
    .waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.modal:not(.hidden) button', { hasText: '百科全书' }).first().click();
  await page.waitForTimeout(700);
  await shot('15-enc-in-game');

  await browser.close();

  if (errors.length) {
    console.error('\n!!! 浏览器报错 ' + errors.length + ' 条:');
    [...new Set(errors)].slice(0, 20).forEach(e => console.error('  ' + e));
    process.exit(1);
  }
  console.log('\n=== 截图完成,无控制台错误 ===');
})();
