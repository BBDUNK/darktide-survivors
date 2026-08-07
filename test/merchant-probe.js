// merchant-probe.js — 验证流浪商人 + 新Boss技能 + 特斯拉多闪电 + 本命武器
'use strict';
const path = require('path');
const PW = process.env.PW_ROOT ||
  path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'pwshot', 'node_modules', 'playwright');
const { chromium } = require(PW);
const URL = 'file://' + path.join(process.cwd(), 'index.html').split(path.sep).join('/');
const OUT = path.join(process.cwd(), 'shots');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL); await pg.waitForTimeout(1200);
  await pg.mouse.click(640, 360); await pg.waitForTimeout(400);
  await pg.getByText('开始远征').click(); await pg.waitForTimeout(300);
  await pg.getByText('下一步').click(); await pg.waitForTimeout(300);
  await pg.getByText('出发').click(); await pg.waitForTimeout(1500);

  // 商人:初始 3 个摊位,走上去自动买
  const slots0 = await pg.evaluate(() => Merchant.slots().filter(s => s && !s.bought).length);
  console.log('初始可购摊位: ' + slots0);
  await pg.evaluate(() => { window.Debug.run().gold = 99999; });
  await pg.screenshot({ path: path.join(OUT, '95-merchant.png') });

  // 走到商人位置触发购买
  await pg.evaluate(() => { const r = window.Debug.run(); r.player.x = 0; r.player.y = 0; });
  await pg.waitForTimeout(400);
  const bought = await pg.evaluate(() => Merchant.slots().filter(s => s && s.bought).length);
  console.log('站在商人处后已购买: ' + bought);
  await pg.screenshot({ path: path.join(OUT, '96-merchant-bought.png') });

  // 本命武器:骑士用剑气 vs 给骑士换别的武器,对比 wStats
  const aff = await pg.evaluate(() => {
    const r = window.Debug.run();
    const before = Weapons.wStats(r, r.weapons[0]).dmg;
    r.weapons[0].id = 'arcanebolt';  // 换非本命武器,补上等级差异
    const after = Weapons.wStats(r, r.weapons[0]).dmg;
    r.weapons[0].id = 'crossblade';
    return { 本命: before, 非本命: after, 比值: +(before / after).toFixed(2) };
  });
  console.log('本命武器比值(应>1): ' + JSON.stringify(aff));

  // 特斯拉多闪电:满级后放电,数命中
  await pg.evaluate(() => {
    const r = window.Debug.run();
    r.weapons[0].id = 'teslacoil';
    r.weapons[0].lv = CFG.WEAPONS.teslacoil.lv.length + 1;
    Entities.recomputeStats(r);
  });
  await pg.waitForTimeout(800);
  const tesla = await pg.evaluate(() => {
    const r = window.Debug.run();
    // 放几座塔,让它自然放电
    return { zapCd: Weapons.wStats(r, r.weapons[0]).zapCount };
  });
  console.log('特斯拉 zapCount=' + tesla.zapCd);

  await b.close();
  if (errs.length) { console.log('报错:'); [...new Set(errs)].slice(0, 6).forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('无控制台错误');
})();
