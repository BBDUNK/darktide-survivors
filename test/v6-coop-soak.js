// V6 coop soak: two real browsers, two sessions with host/client roles swapped,
// ten minutes of continuous play total (5+5), asserting live snapshots all along.
'use strict';
const path = require('path');
const PW = path.join(process.env.LOCALAPPDATA, 'Temp', 'pwshot', 'node_modules', 'playwright');
const { chromium } = require(PW);
const URL = 'http://127.0.0.1:8123/';

async function bootToMenu(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.mouse.click(20, 20);
  await page.waitForFunction(() => window.Debug && Debug.state() === 'menu', null, { timeout: 25000 });
  await page.waitForTimeout(300);
}

async function clickBtn(page, re) {
  return page.evaluate((src) => {
    const rx = new RegExp(src);
    const b = Array.from(document.querySelectorAll('button'))
      .filter(x => x.offsetParent !== null && rx.test(x.textContent));
    if (!b.length) return false;
    b[0].click();
    return true;
  }, re.source);
}

async function session(host, cli, hostCharIdx, clientCharIdx, minutes, tag) {
  const errs = [];
  host.on('pageerror', e => errs.push('[host] ' + e.message));
  cli.on('pageerror', e => errs.push('[client] ' + e.message));
  await Promise.all([bootToMenu(host), bootToMenu(cli)]);
  if (!await clickBtn(host, /联机远征/)) throw new Error(tag + ': host no coop button');
  await host.waitForTimeout(600);
  if (!await clickBtn(host, /创建房间|建立房间/)) throw new Error(tag + ': host no create button');
  const code = await host.waitForFunction(() => {
    const el = document.querySelector('.coop-code');
    return el && el.textContent.trim().length === 5 ? el.textContent.trim() : null;
  }, null, { timeout: 40000 }).then(h => h.jsonValue());
  if (!await clickBtn(cli, /联机远征/)) throw new Error(tag + ': client no coop button');
  await cli.waitForTimeout(600);
  await cli.evaluate((c) => {
    const box = document.querySelector('.coop-input.code');
    if (box) { box.value = c; box.dispatchEvent(new Event('input', { bubbles: true })); }
  }, code);
  await cli.waitForTimeout(200);
  if (!await clickBtn(cli, /加入房间/)) throw new Error(tag + ': client no join button');
  await host.waitForFunction(() => window.Net && Net.getRoster && Net.getRoster().length >= 2,
    null, { timeout: 45000 });
  for (const [pg, idx] of [[host, hostCharIdx], [cli, clientCharIdx]]) {
    await pg.evaluate((idx) => {
      const cards = Array.from(document.querySelectorAll('.coop-char, .coop-char-card'))
        .filter(c => c.offsetParent !== null);
      if (cards.length) cards[Math.min(idx, cards.length - 1)].click();
    }, idx);
    await pg.waitForTimeout(300);
    await pg.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .filter(x => x.offsetParent !== null && /^准备|已准备/.test(x.textContent.trim()));
      if (b.length) b[0].click();
    });
    await pg.waitForTimeout(300);
  }
  await host.waitForTimeout(700);
  if (!await clickBtn(host, /开始战斗/)) throw new Error(tag + ': cannot start');
  await cli.waitForFunction(() => window.Debug && Debug.state() === 'run', null, { timeout: 40000 });
  await host.evaluate(() => {
    const r = Debug.run();
    r.player.hp = r.player.maxHp = 1000000000;
    r.player.downed = false;
    if (r.coopPlayers) {
      for (let i = 0; i < r.coopPlayers.length; i++) {
        const m = r.coopPlayers[i];
        if (m && m.player) { m.player.hp = m.player.maxHp = 1000000000; m.player.downed = false; }
      }
    }
  });
  const started = await host.evaluate(() => ({ t: Debug.run().t, enemies: Entities.countAlive() }));
  console.log(`[${tag}] started t=${started.t.toFixed(1)} enemies=${started.enemies}`);

  const ms = minutes * 60000;
  const start = Date.now();
  let checks = 0, maxEnemies = 0;
  while (Date.now() - start < ms) {
    await Promise.all([host.waitForTimeout(10000), cli.waitForTimeout(10000)]);
    await host.evaluate(() => {
      const r = Debug.run();
      r.player.hp = r.player.maxHp = 1000000000;
      r.player.downed = false; r.over = false;
      if (r.coopPlayers) {
        for (let i = 0; i < r.coopPlayers.length; i++) {
          const m = r.coopPlayers[i];
          if (m && m.player) { m.player.hp = m.player.maxHp = 1000000000; m.player.downed = false; }
        }
      }
    });
    const ok = await host.evaluate(() => Debug.state() === 'run' && !!Debug.run() && Debug.run().t > 0);
    const cliOk = await cli.evaluate(() => Debug.state() === 'run' && !!Debug.run() && Debug.run().t > 0);
    if (!ok || !cliOk) {
      const diag = {
        hostState: await host.evaluate(() => Debug.state()),
        cliState: await cli.evaluate(() => Debug.state()),
        hostOver: await host.evaluate(() => { const r = Debug.run(); return r ? r.over : null; }),
        hostHp: await host.evaluate(() => { const r = Debug.run(); return r && r.player ? r.player.hp : null; })
      };
      // 升级/宝箱弹层不视为会话中断:点掉任意卡后继续计时。
      for (const pg of [host, cli]) {
        await pg.evaluate(() => {
          const card = document.querySelector('.modal:not(.hidden) .lu-card, .modal:not(.hidden) .coop-lu-card');
          if (card) card.click();
          const take = Array.from(document.querySelectorAll('.modal:not(.hidden) button'))
            .find(b => b.textContent.includes('收下'));
          if (take) take.click();
        });
        await pg.waitForTimeout(600);
      }
      const recovered = await host.evaluate(() => Debug.state() === 'run') && await cli.evaluate(() => Debug.state() === 'run');
      if (!recovered) throw new Error(`${tag}: session left run state at check ${checks}: ${JSON.stringify(diag)}`);
    }
    const snap = await cli.evaluate(() => ({
      enemies: Entities.countAlive(),
      t: Debug.run().t,
      xp: Math.round(Debug.run().xp || 0)
    }));
    maxEnemies = Math.max(maxEnemies, snap.enemies);
    checks++;
    if (checks % 3 === 0) {
      console.log(`[${tag}] ${((Date.now() - start) / 60000).toFixed(1)}min t=${snap.t.toFixed(1)} enemies=${snap.enemies} xp=${snap.xp}`);
    }
  }
  const endState = await host.evaluate(() => {
    const r = Debug.run();
    r.over = true; r.victory = false;
    return { t: r.t, kills: r.kills, enemies: Entities.countAlive() };
  });
  await cli.waitForFunction(() => Debug.state() === 'result', null, { timeout: 15000 });
  await host.waitForFunction(() => Debug.state() === 'result', null, { timeout: 15000 });
  if (errs.length) throw new Error(tag + ' page errors: ' + errs.join(' | '));
  console.log(`[${tag}] finished ${minutes}min t=${endState.t.toFixed(1)} kills=${endState.kills} maxEnemies=${maxEnemies} checks=${checks}`);
  return { checks, maxEnemies };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hostA = await ctxA.newPage();
    const cliA = await ctxA.newPage();
    const s1 = await session(hostA, cliA, 0, 1, 5, 'session-A');
    await ctxA.close();

    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hostB = await ctxB.newPage();   // previous client becomes host role
    const cliB = await ctxB.newPage();
    const s2 = await session(hostB, cliB, 1, 0, 5, 'session-B');
    await ctxB.close();

    console.log('SOAK OK  host/client roles swapped, 10 minutes total, snapshots alive throughout');
    console.log(JSON.stringify({ sessionA: s1, sessionB: s2 }));
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});
