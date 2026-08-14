// coop-probe.js — 开两个浏览器实测 P2P 联机:建房、加入、选人、开局、快照同步
// 用法: node test/coop-probe.js
//
// 注意:必须用 http 服务而非 file://,WebRTC 在 file:// 下会被浏览器限制。
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
const PW = process.env.PW_ROOT ||
  path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'pwshot', 'node_modules', 'playwright');
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const PORT = 8931;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
               '.png': 'image/png', '.json': 'application/json' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('nf'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

async function enterMenu(pg) {
  await pg.goto(`http://localhost:${PORT}/index.html`);
  await pg.waitForTimeout(1400);
  await pg.mouse.click(640, 360);
  await pg.waitForTimeout(500);
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const errs = [];
  const problems = [];
  const mkPage = async (tag) => {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    pg.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text()); });
    return pg;
  };

  const host = await mkPage('HOST');
  const client = await mkPage('CLIENT');
  await enterMenu(host);
  await enterMenu(client);

  // 房主建房
  await host.locator('button', { hasText: '联机远征' }).click();
  await host.waitForTimeout(600);
  await host.locator('button', { hasText: '创建房间' }).click();
  // PeerJS 要连信令服务器,给足时间
  await host.waitForTimeout(9000);
  const code = (await host.locator('.coop-code').textContent().catch(() => '')) || '';
  console.log('房间号: ' + (code || '(创建失败)'));
  if (!code) {
    const hint = await host.locator('.coop-hint').textContent().catch(() => '');
    console.log('提示: ' + hint);
    await browser.close(); srv.close();
    console.error('\n!!! 建房失败,无法继续验证');
    process.exit(1);
  }

  // 客户端加入
  await client.locator('button', { hasText: '联机远征' }).click();
  await client.waitForTimeout(600);
  await client.locator('.coop-input.code').fill(code);
  await client.locator('button', { hasText: '加入房间' }).click();
  await client.waitForTimeout(9000);

  const roster = await host.locator('.coop-member').count();
  console.log('房主看到成员数: ' + roster);

  // 两边各选一个角色并准备
  for (const [pg, tag] of [[host, 'HOST'], [client, 'CLIENT']]) {
    const chars = pg.locator('.coop-char:not(.locked)');
    const n = await chars.count();
    if (n) await chars.nth(tag === 'HOST' ? 0 : Math.min(1, n - 1)).click();
    await pg.waitForTimeout(300);
    // 只点角色区里的准备键(开始战斗键也含"准备"二字)
    await pg.locator('.coop-chars button').click();
    await pg.waitForTimeout(400);
  }
  const readyCount = await host.locator('.coop-mready.on').count();
  console.log('已准备人数: ' + readyCount);

  // 房主开始战斗
  await host.locator('button', { hasText: '开始战斗' }).click();
  await host.waitForTimeout(3500);

  const hostIn = await host.evaluate(() => !!(window.Debug.run()));
  const cliIn = await client.evaluate(() => !!(window.Debug.run()));
  console.log('进入战斗: host=' + hostIn + ' client=' + cliIn);

  // 客户端移动,看房主那边队友是否跟着动
  await client.keyboard.down('KeyD');
  await client.waitForTimeout(2200);
  await client.keyboard.up('KeyD');
  await client.waitForTimeout(800);

  // 客户端是否收到了快照(敌人数量 > 0 且时间在推进)
  const cliState = await client.evaluate(() => {
    const r = window.Debug.run();
    if (!r) return null;
    let alive = 0;
    Entities.pool.forEach(e => { if (e.alive) alive++; });
    return { t: +r.t.toFixed(1), enemies: alive, kills: r.kills };
  });
  console.log('客户端世界: ' + JSON.stringify(cliState));

  // 客户端应能看到房主/队友的玩家弹幕(快照带弹幕池)
  const cliBullets = await client.evaluate(() => {
    const r = window.Debug.run();
    if (!r) return -1;
    let n = 0;
    const bs = Weapons.getBullets();
    for (let i = 0; i < bs.length; i++) if (bs[i].alive) n++;
    return n;
  });
  console.log('客户端弹幕数: ' + cliBullets);

  // V2 协议结构必须真实存在于房主构建的快照中，且关键世界交互/表现事件走可靠层。
  const protocolState = await host.evaluate(() => {
    const snap = Debug.netSnapshot();
    const info = Net.protocolInfo();
    const required = ['fxEvent', 'audioEvent', 'bossEvent', 'pickupRequest', 'pickupResult',
      'vaultRequest', 'vaultResult', 'shopRequest', 'shopResult'];
    return {
      version: snap && snap.version,
      sequence: snap && snap.sq,
      serverTick: snap && snap.tk,
      serverTime: snap && snap.st,
      seed: snap && snap.sd,
      enemyAction: !snap.e.length || (!!snap.e[0].u && !!snap.e[0].ac && snap.e[0].ae !== undefined),
      playerAction: !!(snap.p[0].as && snap.p[0].ae !== undefined),
      vaultUid: !snap.va.length || !!snap.va[0].u,
      shopUid: !snap.ms.slots.length || snap.ms.slots.every(s => !s || !!s.uid),
      reliable: required.every(t => info.reliableTypes.includes(t))
    };
  });
  console.log('NET_STATE_V2: ' + JSON.stringify(protocolState));
  if (!protocolState || protocolState.version !== 'NET_STATE_V2' || !protocolState.sequence ||
      protocolState.serverTick === undefined || !protocolState.serverTime || protocolState.seed === undefined ||
      !protocolState.enemyAction || !protocolState.playerAction || !protocolState.vaultUid ||
      !protocolState.shopUid || !protocolState.reliable) {
    problems.push('NET_STATE_V2 字段或可靠事件类型不完整');
  }

  // 商店共享库存：双方都具备购买资格，但同一个稳定 UID 全队只能成交一次。
  const shopRace = await host.evaluate(() => {
    const r = Debug.run();
    const slot = Merchant.slots().find(s => s && s.good && !s.bought);
    if (!r || !slot || !r.coopPlayers || r.coopPlayers.length < 2) return null;
    r.gold = 99999;
    const first = Merchant.purchaseByUid(r, slot.uid, r.coopPlayers[1]);
    const second = Merchant.purchaseByUid(r, slot.uid, r.coopPlayers[0]);
    return { uid: slot.uid, first: first.ok, second: second.ok, reason: second.reason };
  });
  console.log('商店并发结算: ' + JSON.stringify(shopRace));
  if (!shopRace || !shopRace.first || shopRace.second || shopRace.reason !== '商品已售出') {
    problems.push('同一商店商品没有严格只成交一次');
  }

  const sharedXp = {
    host: await host.evaluate(() => { const r = Debug.run(); return [r.level, +(r.coopXp || 0).toFixed(2), r.xpNeed]; }),
    client: await client.evaluate(() => { const r = Debug.run(); return [r.level, +(r.coopXp || 0).toFixed(2), r.xpNeed]; })
  };
  console.log('共享经验: ' + JSON.stringify(sharedXp));
  if (sharedXp.host.join('|') !== sharedXp.client.join('|')) problems.push('房主与客户端经验条状态不一致');

  // 房主暂停,客户端应同步弹出暂停界面;恢复后时间继续推进
  await host.keyboard.press('Escape');
  await host.waitForTimeout(700);
  const hostPaused = await host.evaluate(() =>
    [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden') && m.querySelector('.pause-menu')));
  const cliPaused = await client.evaluate(() =>
    [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden') && m.querySelector('.pause-menu')));
  console.log('暂停同步: host=' + hostPaused + ' client=' + cliPaused);
  if (!hostPaused || !cliPaused) problems.push('房主暂停未同步到客户端');
  await host.keyboard.press('Escape');
  await host.waitForTimeout(700);
  const cliT2 = await client.evaluate(() => window.Debug.run() ? +window.Debug.run().t.toFixed(1) : -1);
  await host.waitForTimeout(1800);
  const cliT3 = await client.evaluate(() => window.Debug.run() ? +window.Debug.run().t.toFixed(1) : -1);
  console.log('恢复后时间推进: ' + cliT2 + '→' + cliT3);
  if (cliT3 <= cliT2) problems.push('恢复后客户端时间未推进');

  // 房主也应像普通队员一样倒地,而不是立即结束全队;活着的客户端靠近后可以救起。
  const hostDown = await host.evaluate(() => {
    const r = window.Debug.run();
    const h = r && r.coopPlayers && r.coopPlayers[0];
    const m = r && r.coopPlayers && r.coopPlayers[1];
    if (!h || !m) return null;
    Entities.clearEnemies(r);
    m.player.x = h.player.x;
    m.player.y = h.player.y;
    h.player.hp = 1;
    h.player.iframe = 0;
    Entities.damagePlayer(r, 9999);
    return { downed: h.downed, over: r.over, hp: h.player.hp };
  });
  console.log('房主倒地: ' + JSON.stringify(hostDown));
  if (!hostDown || !hostDown.downed || hostDown.over) problems.push('房主倒地错误地结束了全队');
  await host.waitForTimeout(3600);
  const hostRevived = await host.evaluate(() => {
    const r = window.Debug.run();
    const h = r && r.coopPlayers && r.coopPlayers[0];
    return h ? { downed: h.downed, hp: Math.round(h.player.hp) } : null;
  });
  console.log('房主救援: ' + JSON.stringify(hostRevived));
  if (!hostRevived || hostRevived.downed || hostRevived.hp <= 0) problems.push('客户端未能救起房主');

  // 客户端从同步暂停菜单放弃时,房主应结束对局并给客户端发送它自己的角色/Build。
  const clientChar = await client.evaluate(() => window.Debug.run().player.char.id);
  await host.evaluate(() => {
    const send = Net.broadcast;
    window.__broadcastTypes = [];
    Net.broadcast = function (m) { window.__broadcastTypes.push(m && m.t); return send(m); };
  });
  await host.keyboard.press('Escape');
  await host.waitForTimeout(700);
  await client.locator('.pause-menu button', { hasText: '放弃' }).click();
  await host.waitForTimeout(1800);
  const giveupState = {
    host: await host.evaluate(() => window.Debug.state()),
    client: await client.evaluate(() => window.Debug.state()),
    clientChar: await client.evaluate(() => window.Debug.run().player.char.id),
    hostBroadcasts: await host.evaluate(() => window.__broadcastTypes),
    clientCoop: await client.evaluate(() => ({ on: Debug.coop().on, active: Debug.coop().active, mode: Net.mode() }))
  };
  console.log('客户端放弃结算: ' + JSON.stringify(giveupState));
  if (giveupState.host !== 'result' || giveupState.client !== 'result') problems.push('客户端放弃未同步结束对局');
  if (giveupState.clientChar !== clientChar) problems.push('客户端结算被错误替换成房主角色');

  await host.screenshot({ path: path.join(ROOT, 'shots', '90-coop-host.png') });
  await client.screenshot({ path: path.join(ROOT, 'shots', '91-coop-client.png') });

  await browser.close();
  srv.close();

  if (roster < 2) problems.push('房主未看到客户端加入');
  if (!hostIn || !cliIn) problems.push('未能双方同时进入战斗');
  if (cliState && cliState.enemies === 0) problems.push('客户端没有收到敌人快照');

  if (errs.length) {
    console.error('\n!!! 浏览器报错:');
    [...new Set(errs)].slice(0, 10).forEach(e => console.error('  ' + e));
  }
  if (problems.length) {
    console.error('\n!!! 联机问题: ' + problems.join('、'));
    process.exit(1);
  }
  console.log('\n=== 联机全链路验证通过 ===');
})();
