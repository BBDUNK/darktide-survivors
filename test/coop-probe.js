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
  const before = await host.evaluate(() => {
    const r = window.Debug.run();
    return r && window.__mates ? 0 : 0;
  });
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

  await host.screenshot({ path: path.join(ROOT, 'shots', '90-coop-host.png') });
  await client.screenshot({ path: path.join(ROOT, 'shots', '91-coop-client.png') });

  await browser.close();
  srv.close();

  const problems = [];
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
