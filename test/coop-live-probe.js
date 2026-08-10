// coop-live-probe.js — 真实双端联机探针
// 开两个浏览器页面(房主 + 客户端),走完整 PeerJS 链路,验证:
//   1. 客户端能进入战斗并收到快照
//   2. 快照按视野裁剪(体积可控)
//   3. 客户端能打到怪(伤害由房主结算,客户端看到敌人掉血)
//   4. 客户端升级能拿到新武器
// 这些是 headless 测不到的:必须有真实 WebRTC 通道。
'use strict';
const path = require('path');
const PW = path.join(process.env.LOCALAPPDATA, 'Temp', 'pwshot', 'node_modules', 'playwright');
const { chromium } = require(PW);

const URL = 'http://127.0.0.1:8123/';

async function bootToMenu(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.mouse.click(20, 20);   // 跳过开场
  await page.waitForFunction(() => window.Debug && Debug.state() === 'menu', null, { timeout: 25000 });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const ctxHost = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxCli = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await ctxHost.newPage();
  const cli = await ctxCli.newPage();

  const errs = [];
  host.on('pageerror', e => errs.push('[host] ' + e.message));
  cli.on('pageerror', e => errs.push('[client] ' + e.message));

  try {
    await Promise.all([bootToMenu(host), bootToMenu(cli)]);
    console.log('两端已进入菜单');

    // 统一用"按钮文本"点击,避免和同名标题文本歧义
    const clickBtn = (page, re) => page.evaluate((src) => {
      const rx = new RegExp(src);
      const b = Array.from(document.querySelectorAll('button'))
        .filter(x => x.offsetParent !== null && rx.test(x.textContent));
      if (!b.length) return false;
      b[0].click();
      return true;
    }, re.source);

    // --- 房主建房 ---
    if (!await clickBtn(host, /联机远征/)) throw new Error('房主:找不到联机远征按钮');
    await host.waitForTimeout(700);
    if (!await clickBtn(host, /创建房间|建立房间/)) throw new Error('房主:找不到创建房间按钮');
    const code = await host.waitForFunction(() => {
      const el = document.querySelector('.coop-code');
      return el && el.textContent.trim().length === 5 ? el.textContent.trim() : null;
    }, null, { timeout: 40000 }).then(h => h.jsonValue());
    console.log('房间号:', code);

    // --- 客户端加入 ---
    if (!await clickBtn(cli, /联机远征/)) throw new Error('客户端:找不到联机远征按钮');
    await cli.waitForTimeout(700);
    await cli.evaluate((c) => {
      const box = document.querySelector('.coop-input.code');
      if (box) { box.value = c; box.dispatchEvent(new Event('input', { bubbles: true })); }
    }, code);
    await cli.waitForTimeout(200);
    if (!await clickBtn(cli, /加入房间/)) throw new Error('客户端:找不到加入房间按钮');

    await host.waitForFunction(() => window.Net && Net.getRoster && Net.getRoster().length >= 2,
      null, { timeout: 45000 });
    console.log('客户端已加入房间');

    // --- 双方选角并准备 ---
    for (const p of [host, cli]) {
      await p.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.coop-char, .coop-char-card'))
          .filter(c => c.offsetParent !== null);
        if (cards.length) cards[0].click();
      });
      await p.waitForTimeout(400);
      await p.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button'))
          .filter(x => x.offsetParent !== null && /^准备|已准备/.test(x.textContent.trim()));
        if (b.length) b[0].click();
      });
      await p.waitForTimeout(400);
    }

    // 房主开局
    await host.waitForTimeout(800);
    const started = await host.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .filter(x => x.offsetParent !== null && /开始战斗/.test(x.textContent));
      if (!b.length) return false;
      b[0].click();
      return true;
    });
    if (!started) {
      const rosterState = await host.evaluate(() => JSON.stringify(Net.getRoster()));
      throw new Error('房主无法开始战斗,roster=' + rosterState);
    }

    // 等客户端进入战斗
    await cli.waitForFunction(() => window.Debug && Debug.state() === 'run', null, { timeout: 40000 });
    console.log('✓ 客户端已进入战斗');
    await host.waitForTimeout(2500);

    // --- 验证 1:客户端确实在收快照 ---
    const snapFlow = await cli.evaluate(() => new Promise(resolve => {
      let count = 0, bytes = 0;
      if (!window.__origApplySnap) window.__origApplySnap = Entities.applySnapshot;
      const orig = window.__origApplySnap;
      Entities.applySnapshot = function (run, snap) {
        count++;
        bytes += JSON.stringify(snap).length;
        return orig.apply(this, arguments);
      };
      setTimeout(() => {
        Entities.applySnapshot = orig;
        resolve({ count: count, avgBytes: count ? Math.round(bytes / count) : 0 });
      }, 3000);
    }));
    console.log('3 秒内收到快照 ' + snapFlow.count + ' 帧,平均 ' +
                (snapFlow.avgBytes / 1024).toFixed(1) + ' KB/帧');
    if (snapFlow.count < 20) throw new Error('客户端快照接收过少(应约 45 帧/3秒): ' + snapFlow.count);

    // --- 验证 2:满地图刷怪后,快照体积仍受视野裁剪约束 ---
    // 把房主和队友拉开足够远(>1400),再各自身边刷一批怪。
    // 这样"房主身边的怪"天然落在队友视野之外,构成真实的裁剪样本
    // ——比刷在空旷远处可靠,因为 DESPAWN_R 会把落单的怪搬回玩家附近。
    await host.evaluate(() => {
      const r = window.Debug.run();
      const mate = r.coopPlayers && r.coopPlayers[1];
      if (!mate) return;
      r.player.x = 1800; r.player.y = 0;          // 房主挪到远处
      mate.player.x = -1800; mate.player.y = 0;   // 队友在另一侧
      // 队友身边(视野内)
      for (let i = 0; i < 45; i++) {
        const a = (i / 45) * Math.PI * 2, rad = 180 + (i % 5) * 70;
        Entities.spawnEnemy(r, 'slime', mate.player.x + Math.cos(a) * rad,
                            mate.player.y + Math.sin(a) * rad, { allowNear: true });
      }
      // 房主身边(对队友来说是视野外,距离 3600)
      for (let i = 0; i < 200; i++) {
        const a = (i / 200) * Math.PI * 2, rad = 150 + (i % 8) * 60;
        Entities.spawnEnemy(r, 'slime', r.player.x + Math.cos(a) * rad,
                            r.player.y + Math.sin(a) * rad, { allowNear: true });
      }
    });
    await host.waitForTimeout(900);
    // 用房主端"队友视野内的真实怪数"作为期望值,和客户端实收数对比。
    // 注意 DESPAWN_R=900:超出该距离的怪会被搬回出生环(620),所以"远处的怪"
    // 会自动聚拢到玩家附近 —— 不能靠"刷在远处"来构造视野外样本,
    // 只能拿房主的实际分布做基准。
    const cmp = await host.evaluate(() => {
      const r = window.Debug.run();
      const mate = r.coopPlayers && r.coopPlayers[1];
      if (!mate) return null;
      const mx = mate.player.x, my = mate.player.y;
      let inView = 0, outView = 0;
      for (let i = 0; i < Entities.pool.length; i++) {
        const e = Entities.pool[i];
        if (!e.alive) continue;
        const dx = e.x - mx, dy = e.y - my;
        if (dx * dx + dy * dy <= 700 * 700) inView++; else outView++;
      }
      return { inView: inView, outView: outView, total: Entities.countAlive(),
               mateXY: [Math.round(mx), Math.round(my)] };
    });
    if (!cmp) throw new Error('房主端找不到队友实体');

    const loaded = await cli.evaluate(() => new Promise(resolve => {
      let count = 0, bytes = 0, maxEnemies = 0;
      const orig = Entities.applySnapshot;
      Entities.applySnapshot = function (run, snap) {
        count++;
        bytes += JSON.stringify(snap).length;
        if (snap.e && snap.e.length > maxEnemies) maxEnemies = snap.e.length;
        return orig.apply(this, arguments);
      };
      setTimeout(() => {
        Entities.applySnapshot = orig;
        resolve({ count: count, avgKB: count ? (bytes / count / 1024) : 0, maxEnemies: maxEnemies });
      }, 2500);
    }));
    const mbps = loaded.avgKB * 15 * 8 / 1024;
    console.log('房主端总存活 ' + cmp.total + ' (队友视野内 ' + cmp.inView +
                ',视野外 ' + cmp.outView + ')');
    console.log('客户端单帧最多收到 ' + loaded.maxEnemies + ' 个,快照 ' +
                loaded.avgKB.toFixed(1) + ' KB/帧 (' + mbps.toFixed(2) + ' Mbps)');
    if (loaded.count < 10) throw new Error('测量窗口内几乎没收到快照: ' + loaded.count);
    // 客户端收到的数量应当贴近"房主端视野内的数量",而不是总数
    if (cmp.outView > 20 && loaded.maxEnemies > cmp.inView * 1.5 + 10) {
      throw new Error('视野裁剪未生效:实收 ' + loaded.maxEnemies +
                      ' 远超视野内 ' + cmp.inView);
    }
    if (cmp.inView >= 10 && loaded.maxEnemies < cmp.inView * 0.5) {
      throw new Error('裁剪过度:视野内有 ' + cmp.inView + ' 只,客户端只收到 ' + loaded.maxEnemies);
    }
    if (mbps > 4) throw new Error('满载带宽超 4Mbps: ' + mbps.toFixed(2));
    console.log('✓ 快照按视野下发,数量与房主视野一致,带宽在安全区');

    // --- 验证 3:客户端能打到怪(房主结算伤害,客户端看到血量下降)---
    const combat = await host.evaluate(async () => {
      const r = window.Debug.run();
      Entities.clearEnemies(r);
      // 找到队友(客户端)的实体,在他面前放一只怪
      const mate = r.coopPlayers && r.coopPlayers[1];
      if (!mate) return { err: 'no mate on host' };
      const e = Entities.spawnEnemy(r, 'slime', mate.player.x + 90, mate.player.y, { allowNear: true });
      if (!e) return { err: 'spawn failed' };
      const hp0 = e.hp;
      const uid = e.uid;
      await new Promise(res => setTimeout(res, 4000));
      let found = null;
      for (let i = 0; i < Entities.pool.length; i++) {
        if (Entities.pool[i].uid === uid) { found = Entities.pool[i]; break; }
      }
      return { hp0: hp0, hp1: found && found.alive ? found.hp : 0, killed: !found || !found.alive,
               mateWeapons: mate.weapons.length };
    });
    if (combat.err) throw new Error('战斗验证前置失败: ' + combat.err);
    console.log('队友武器数 ' + combat.mateWeapons + ',敌人 ' + combat.hp0 + ' → ' +
                combat.hp1 + (combat.killed ? ' (已击杀)' : ''));
    if (!combat.killed && combat.hp1 >= combat.hp0) {
      throw new Error('客户端无法攻击敌人:队友武器未造成伤害');
    }
    console.log('✓ 客户端(队友)能打到怪');

    // --- 验证 4:客户端升级能拿到新武器 ---
    // 联机是共享经验池:喂满经验会让全队一起升级,房主给每个客户端单发 levelup。
    const before = await host.evaluate(() => {
      const r = window.Debug.run();
      const mate = r.coopPlayers[1];
      return { w: mate.weapons.length, p: Object.keys(mate.passives).length };
    });
    // 走真实加经验路径(Entities.addXp),这样才会触发 onCoopLevel 回调。
    // 直接赋值 r.coopXp 不会触发升级判定,测不出链路。
    await host.evaluate(() => {
      const r = window.Debug.run();
      Entities.addXp(r, (r.xpNeed || 10) * 4);
    });
    // 等房主把 levelup 单发给客户端并弹卡
    await cli.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll(
        '.coop-lu-card, .lu-card, .levelup-card, .lu-opt, [data-lu-opt]'))
        .filter(c => c.offsetParent !== null);
      return cards.length > 0;
    }, null, { timeout: 12000 }).catch(() => null);

    const cardInfo = await cli.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(
        '.coop-lu-card, .lu-card, .levelup-card, .lu-opt, [data-lu-opt]'))
        .filter(c => c.offsetParent !== null);
      if (!cards.length) return { n: 0, txt: '' };
      const txt = cards[0].textContent.trim().slice(0, 30);
      cards[0].click();     // 客户端选第一个选项 → 上报 pickup 给房主
      return { n: cards.length, txt: txt };
    });
    if (!cardInfo.n) throw new Error('客户端没有收到升级选项卡:levelup 链路断了');
    await host.waitForTimeout(1500);
    const after = await host.evaluate(() => {
      const r = window.Debug.run();
      const mate = r.coopPlayers[1];
      return { w: mate.weapons.length, p: Object.keys(mate.passives).length,
               pending: mate.pendingLevels || 0 };
    });
    console.log('客户端收到 ' + cardInfo.n + ' 个升级选项(首项"' + cardInfo.txt + '")');
    console.log('队友 Build: 武器 ' + before.w + '→' + after.w +
                ',被动 ' + before.p + '→' + after.p + ',待选 ' + after.pending);
    if (after.w + after.p <= before.w + before.p) {
      throw new Error('客户端选了升级但房主端没有把它应用到队友身上');
    }
    console.log('✓ 客户端升级链路通(选项下发 → 上报 → 房主应用)');

    console.log('');
    console.log('pageerror:', errs.length ? errs.join(' | ') : '无');
    if (errs.length) throw new Error('存在页面错误');
    console.log('=== 双端联机探针全部通过 ===');
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('!!! 联机探针失败: ' + e.message);
    console.error('pageerror:', errs.length ? errs.join(' | ') : '无');
    try {
      await host.screenshot({ path: 'shots/coop-fail-host.jpg', type: 'jpeg', quality: 80 });
      await cli.screenshot({ path: 'shots/coop-fail-client.jpg', type: 'jpeg', quality: 80 });
      console.error('已存故障截图: shots/coop-fail-{host,client}.jpg');
    } catch (e2) {}
    await browser.close();
    process.exit(1);
  }
})();
