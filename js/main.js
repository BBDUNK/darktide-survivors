// main.js — 状态机 / 渲染编排 / 启动
(function () {
  'use strict';
  var E = Engine;
  var canvas, ctx;
  var state = 'intro'; // intro | menu | run | levelup | chest | pause | result
  var run = null;
  var vignette = null;
  var achvTimer = 0;
  var dpsTimer = 0, lastDmg = 0;

  // ================= 开幕过渡 =================
  var introImg = null, introT = 0, introDone = false, introSkipped = false;
  function bootIntro() {
    introImg = new Image();
    introImg.src = 'assets/intro.jpg';
    introT = 0; introDone = false; introSkipped = false;
    // 隐藏所有 DOM 屏(title 屏会盖住 canvas 拦截点击),让开幕 canvas 独占画面
    UI.hideAllScreens();
    state = 'intro';
  }
  function skipIntro() {
    if (introDone) return;
    introDone = true;
    state = 'menu';
    UI.show('menu');     // 显示主菜单 DOM 层(标题屏也隐藏)
    AudioSys.unlock();
    AudioSys.playMusic('menu');
  }
  function updateIntro(dt) {
    introT += dt;
    if (introT >= 5 && !introDone) { introT = 5; skipIntro(); }
  }
  function renderIntro() {
    var W = CFG.GAME.W, H = CFG.GAME.H;
    // 背景图:拉伸铺满全屏(不按比例,适应任意屏幕)
    if (introImg && introImg.width) {
      ctx.drawImage(introImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0b0812';
      ctx.fillRect(0, 0, W, H);
    }

    // ---- 静态美术资源展示:上下两行,随版本同步更新 ----
    // 上行:全部角色 + 透明底的武器/道具精灵(不用带黑底的 defIcon)
    var heroRow = ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono'];
    heroRow = heroRow.concat(['p_slash', 'p_bolt', 'p_arrow', 'p_book', 'p_axe', 'p_shadow',
                              'p_fireflask', 'p_orbitblade', 'coin', 'meat', 'chest', 'magnet']);
    var hGap = 46;
    var hTotal = heroRow.length * hGap;
    var hStart = (W - hTotal) / 2;
    for (var hi = 0; hi < heroRow.length; hi++) {
      var hx = hStart + hi * hGap + hGap / 2;
      var hy = 58 + Math.sin(introT * 2.5 + hi * 0.6) * 3;
      var himg = SpriteGen.get(heroRow[hi]);
      var hw = heroRow[hi].indexOf('char_') === 0 ? 38 : 26;
      ctx.globalAlpha = 1;   // 透明度拉到最高,不若隐若现
      ctx.drawImage(himg, hx - hw / 2, hy - hw / 2, hw, hw);
    }
    ctx.globalAlpha = 1;

    // 中央题字(放大,两行)
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px "Press Start 2P","Microsoft YaHei",monospace';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText('天庭制作组', W / 2, H / 2 - 38);
    ctx.fillStyle = '#ffd76b';
    ctx.fillText('天庭制作组', W / 2, H / 2 - 38);
    ctx.font = 'bold 30px "Press Start 2P","Microsoft YaHei",monospace';
    ctx.lineWidth = 7;
    ctx.strokeText('倾心呈现', W / 2, H / 2 + 24);
    ctx.fillStyle = '#fff3c8';
    ctx.fillText('倾心呈现', W / 2, H / 2 + 24);
    ctx.font = '20px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText('特别鸣谢:SOTA Model', W / 2, H / 2 + 68);
    ctx.fillStyle = '#cfe6ff';
    ctx.fillText('特别鸣谢:SOTA Model', W / 2, H / 2 + 68);

    // 下行:全部敌人 + Boss(静态排列,不滚动)
    var enemyRow = ['bat', 'slime', 'slime_big', 'zombie', 'skeleton', 'ghost', 'spider', 'cultist',
                    'orc', 'imp', 'knight_armored', 'werewolf', 'mummy', 'gargoyle', 'bloodbat', 'wraith',
                    'boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord'];
    var eGap = 44;
    var eTotal = enemyRow.length * eGap;
    var eStart = (W - eTotal) / 2;
    for (var ei = 0; ei < enemyRow.length; ei++) {
      var ex = eStart + ei * eGap + eGap / 2;
      var ey = H - 62 + Math.sin(introT * 2.5 + ei * 0.7) * 3;
      var eimg = SpriteGen.get(enemyRow[ei]);
      var isBoss = enemyRow[ei].indexOf('boss_') === 0;
      var ew = isBoss ? 40 : 30;
      ctx.globalAlpha = 1;   // 透明度拉到最高
      ctx.drawImage(eimg, ex - ew / 2, ey - ew / 2, ew, ew);
    }
    ctx.globalAlpha = 1;

    // 右下角跳过提示
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText('轻触屏幕以跳过...', W - 14, H - 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('轻触屏幕以跳过...', W - 14, H - 14);
    ctx.textAlign = 'left';
  }

  // ================= 联机 =================
  // 房主权威:房主跑完整模拟并广播快照;客户端只上报输入、渲染快照。
  var coop = {
    on: false,
    mates: [],        // host: [{peerId,name,charId,player,input,...}]
    remote: [],       // client: 从快照解出的其他玩家渲染数据
    snapAcc: 0,       // host: 广播计时
    inputAcc: 0,      // client: 上报计时
    myId: ''          // client: 自己的 peer id,用于从快照里剔除自己
  };

  function coopPlayerCount() {
    return coop.on ? Math.max(1, Net.playerCount()) : 1;
  }

  // 联机难度:人数越多敌人越强,经验按人数稀释
  function coopMul(table) {
    var n = Math.min(coopPlayerCount(), table.length - 1);
    return table[n] || 1;
  }

  // 房主为每个远端玩家建一个 player 实体
  function setupCoopHost(roster, mapId) {
    coop.on = true;
    coop.mates = [];
    for (var i = 0; i < roster.length; i++) {
      var r = roster[i];
      if (r.isHost) continue;
      var cd = null;
      for (var k = 0; k < CFG.CHARS.length; k++) if (CFG.CHARS[k].id === r.charId) cd = CFG.CHARS[k];
      if (!cd) cd = CFG.CHARS[0];
      var pl = Entities.makePlayer(cd);
      pl.x = (Math.random() * 80 - 40); pl.y = (Math.random() * 80 - 40);
      coop.mates.push({
        peerId: r.id, name: r.name, charId: r.charId,
        player: pl, input: { x: 0, y: 0 }, weapons: [], passives: {},
        xp: 0, level: 1, xpNeed: CFG.XP_NEED(1), pendingLevels: 0, downed: false, reviveT: 0
      });
    }
  }

  // ---- 房主:打快照并广播(15Hz) ----
  // 字段名压到 1~2 字符,15Hz × 4 人下带宽才够用。
  function buildSnapshot() {
    var pool = Entities.pool, i, e;
    var es = [];
    for (i = 0; i < pool.length; i++) {
      e = pool[i];
      if (!e.alive) continue;
      es.push({
        u: e.uid, i: e.id, x: Math.round(e.x), y: Math.round(e.y),
        h: Math.round(e.hp), m: Math.round(e.maxHp),
        el: e.elite ? 1 : 0, f: e.face,
        g: e.guard > 0 ? +e.guard.toFixed(2) : 0,
        b: e.burrowT > 0 ? +e.burrowT.toFixed(2) : 0,
        bf: e.buffed ? 1 : 0
      });
    }
    var shots = Entities.getShots(), ss = [];
    for (i = 0; i < shots.length; i++) {
      if (!shots[i].alive) continue;
      ss.push({
        x: Math.round(shots[i].x), y: Math.round(shots[i].y),
        vx: Math.round(shots[i].vx), vy: Math.round(shots[i].vy),
        w: shots[i].webType ? 1 : 0, c: shots[i].col || 0, z: shots[i].size || 16
      });
    }
    var lobs = Entities.getLobs(), ls = [];
    for (i = 0; i < lobs.length; i++) {
      if (!lobs[i].alive) continue;
      ls.push({ x: Math.round(lobs[i].tx), y: Math.round(lobs[i].ty),
                r: lobs[i].r, t: +lobs[i].t.toFixed(2), d: lobs[i].dur });
    }
    var gems = Entities.getGems(), gs = [];
    for (i = 0; i < gems.length; i++) {
      if (!gems[i].alive) continue;
      gs.push({ x: Math.round(gems[i].x), y: Math.round(gems[i].y), v: gems[i].v });
    }
    var items = Entities.getItems(), its = [];
    for (i = 0; i < items.length; i++) {
      if (!items[i].alive) continue;
      its.push({ k: items[i].type, x: Math.round(items[i].x), y: Math.round(items[i].y) });
    }
    // 全体玩家状态(房主自己 + 各客户端),客户端用它渲染队友
    var ps = [{
      id: 'host', name: '房主', charId: run.player.char.id,
      x: Math.round(run.player.x), y: Math.round(run.player.y),
      f: run.player.face, mv: run.player.moving ? 1 : 0,
      hp: +(run.player.hp / run.player.stats.hp).toFixed(2),
      dn: run.player.downed ? 1 : 0, rv: +(run.player.reviveT || 0).toFixed(2),
      bf: run.player.auraBuff ? 1 : 0
    }];
    for (i = 0; i < coop.mates.length; i++) {
      var mt = coop.mates[i], mp = mt.player;
      ps.push({
        id: mt.peerId, name: mt.name, charId: mt.charId,
        x: Math.round(mp.x), y: Math.round(mp.y),
        f: mp.face, mv: mp.moving ? 1 : 0,
        hp: mp.stats ? +(mp.hp / mp.stats.hp).toFixed(2) : 1,
        dn: mt.downed ? 1 : 0, rv: +(mt.reviveT || 0).toFixed(2),
        bf: mp.auraBuff ? 1 : 0
      });
    }
    return {
      t: 'snap', ti: +run.t.toFixed(2),
      e: es, s: ss, l: ls, g: gs, it: its, p: ps,
      bh: run.boss && run.boss.alive ? +(run.boss.hp / run.boss.maxHp).toFixed(3) : -1,
      kl: run.kills
    };
  }

  // ---- 房主:把客户端输入写进对应队友,并跑他们的移动与武器 ----
  function updateMates(dt) {
    if (!coop.on || !Net.isHost()) return;
    var A = CFG.COOP;
    for (var i = 0; i < coop.mates.length; i++) {
      var m = coop.mates[i], p = m.player;
      if (!p.stats) { Entities.recomputeStatsFor(run, p, m.passives); p.hp = p.stats.hp; }
      if (m.downed) {
        // 倒地:检查是否有活着的队友在旁边救援
        var rescuer = nearestAlivePlayer(p, A.reviveRadius, m);
        if (rescuer) {
          m.reviveT = (m.reviveT || 0) + dt;
          if (m.reviveT >= A.reviveTime) {
            m.downed = false; m.reviveT = 0;
            p.hp = p.stats.hp * A.downedHp;
            p.iframe = 2.0;
            FX.ring(p.x, p.y, { r: 60, color: '#7ce87c', life: 0.5, width: 3 });
          }
        } else {
          m.reviveT = Math.max(0, (m.reviveT || 0) - dt * 0.5);
        }
        continue;
      }
      // 应用输入移动
      var iv = m.input, s = p.stats;
      var spd = s.speed * (1 - (p.slow || 0)) * (1 + (p.auraBuff || 0));
      p.moving = (iv.x !== 0 || iv.y !== 0);
      if (p.moving) {
        var l = Math.hypot(iv.x, iv.y) || 1;
        p.x += (iv.x / l) * spd * dt;
        p.y += (iv.y / l) * spd * dt;
        if (iv.x > 0.01) p.face = 1; else if (iv.x < -0.01) p.face = -1;
        p.animT += dt;
      }
      var R = CFG.GAME.MAP_R;
      p.x = E.clamp(p.x, -R, R); p.y = E.clamp(p.y, -R, R);
      if (p.iframe > 0) p.iframe -= dt;
      if (s.regen > 0 && p.hp < s.hp) p.hp = Math.min(s.hp, p.hp + s.regen * dt);
      // 队友的武器由房主代跑
      Weapons.updateFor(run, p, m.weapons, dt);
      // 队友倒地判定
      if (p.hp <= 0 && !m.downed) {
        m.downed = true; m.reviveT = 0; p.hp = 0;
        FX.ring(p.x, p.y, { r: 50, color: '#ff5964', life: 0.6, width: 3 });
        UI.warn('⚠ ' + m.name + ' 倒下了!');
      }
    }
  }

  // 房主视角下队友的渲染数据(drawMates 只认扁平字段)
  function hostMateView() {
    var out = [];
    for (var i = 0; i < coop.mates.length; i++) {
      var m = coop.mates[i], p = m.player;
      out.push({
        name: m.name, charId: m.charId, x: p.x, y: p.y,
        face: p.face, moving: p.moving,
        hpPct: p.stats ? p.hp / p.stats.hp : 1,
        downed: m.downed, reviveT: m.reviveT || 0, buffed: !!p.auraBuff
      });
    }
    return out;
  }

  // 找一个能救援目标的存活玩家(房主自己或其他队友)
  function nearestAlivePlayer(target, radius, exclude) {
    var r2 = radius * radius;
    if (!run.player.downed && E.dist2(run.player.x, run.player.y, target.x, target.y) < r2) return run.player;
    for (var i = 0; i < coop.mates.length; i++) {
      var m = coop.mates[i];
      if (m === exclude || m.downed) continue;
      if (E.dist2(m.player.x, m.player.y, target.x, target.y) < r2) return m.player;
    }
    return null;
  }

  // 队友光环互益:圣光环持有者为半径内队友回血、提升属性与弹幕
  function applyCoopAuras() {
    if (!coop.on || !run) return;
    var A = CFG.COOP.priestAura;
    var all = [{ player: run.player, weapons: run.weapons }].concat(coop.mates);
    // 先清空上一帧的增益标记
    for (var i = 0; i < all.length; i++) {
      var pi = all[i].player;
      pi.auraBuff = 0; pi.auraProjSpd = 0; pi.auraDmg = 0;
    }
    for (var s = 0; s < all.length; s++) {
      var src = all[s];
      var hasAura = false;
      for (var w = 0; w < src.weapons.length; w++) if (src.weapons[w].id === 'holyaura') hasAura = true;
      if (!hasAura) continue;
      for (var t = 0; t < all.length; t++) {
        if (t === s) continue;                    // 只增益队友
        var tp = all[t].player;
        if (E.dist2(tp.x, tp.y, src.player.x, src.player.y) > A.radius * A.radius) continue;
        tp.auraBuff = A.statBoost;
        tp.auraProjSpd = A.projSpd;
        tp.auraDmg = A.dmgBoost;
        if (tp.hp > 0 && tp.stats && tp.hp < tp.stats.hp) {
          tp.hp = Math.min(tp.stats.hp, tp.hp + A.regen * (1 / 60));
        }
      }
    }
  }

  // ================= 四角金库 =================
  // 地图四个角落各一个宝箱,金币随时间增长:默认 20,每分钟 +20,上限 100。
  // 走到宝箱附近自动拾取全部金币,然后宝箱重置为 20 重新累积。
  var vaults = [];
  function initVaults(run) {
    var R = CFG.GAME.MAP_R - 120;   // 略缩进,别贴边界
    vaults = [
      { x: -R, y: -R, gold: 20, t: 0, picked: 0 },
      { x:  R, y: -R, gold: 20, t: 0, picked: 0 },
      { x: -R, y:  R, gold: 20, t: 0, picked: 0 },
      { x:  R, y:  R, gold: 20, t: 0, picked: 0 }
    ];
  }
  function updateVaults(run, dt) {
    for (var i = 0; i < vaults.length; i++) {
      var v = vaults[i];
      v.t += dt;
      // 金币随时间增长:每 60 秒 +20,上限 100
      var add = Math.floor(v.t / 60);
      if (add > v.picked) {
        v.gold = Math.min(100, v.gold + 20 * (add - v.picked));
        v.picked = add;
      }
      // 走到宝箱旁自动拾取
      var p = run.player;
      if (E.dist2(p.x, p.y, v.x, v.y) < 40 * 40) {
        if (v.gold > 0) {
          var g = v.gold;
          run.gold += g;
          Meta.track('gold', g);
          FX.burst(v.x, v.y, { color: '#ffd76b', n: 14, speed: 110, life: 0.5, size: 2 });
          FX.ring(v.x, v.y, { r: 34, color: '#ffd76b', life: 0.4, width: 3 });
          AudioSys.play('coin');
          // 重置累积
          v.gold = 20; v.t = 0; v.picked = 0;
        }
      }
    }
  }
  // 四角金库绘制(世界坐标版本,在 translate 块内调用;宝箱本身)
  function drawVaults(ctx, run) {
    for (var i = 0; i < vaults.length; i++) {
      var v = vaults[i];
      var sx = v.x, sy = v.y;   // 世界坐标,translate 已处理好
      var bob = Math.sin(run.t * 2.5 + i * 1.2) * 3;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(SpriteGen.get('vfx_shadow'), sx - 14, sy - 52, 28, 9);
      ctx.globalAlpha = 1;
      var cimg = SpriteGen.get('vault_chest');
      var pulse = 0.5 + Math.sin(run.t * 4 + i) * 0.5;
      var gr = ctx.createRadialGradient(sx, sy, 1, sx, sy, 30);
      gr.addColorStop(0, 'rgba(255,215,107,' + (0.25 + pulse * 0.2).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(255,215,107,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(cimg, sx - 16, sy - 16 + bob, 32, 32);
      // 金币数字
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,6,18,0.9)';
      ctx.strokeText('◈' + v.gold, sx, sy + 26);
      ctx.fillStyle = '#ffd76b';
      ctx.fillText('◈' + v.gold, sx, sy + 26);
      ctx.textAlign = 'left';
    }
  }
  // 四角金库边框箭头(屏幕坐标版本,在 translate 块外调用)
  // 四角金库边框箭头:已废弃,地图死角宝箱不再显示边框箭头
  function drawVaultArrows(ctx, run) {}

  // ================= 开局 =================
  function newRun(charId, mapId) {
    var charDef = null, mapDef = null, i;
    for (i = 0; i < CFG.CHARS.length; i++) if (CFG.CHARS[i].id === charId) charDef = CFG.CHARS[i];
    for (i = 0; i < CFG.MAPS.length; i++) if (CFG.MAPS[i].id === mapId) mapDef = CFG.MAPS[i];

    Entities.reset();
    Weapons.reset();
    FX.reset();

    run = {
      t: 0, frame: 0,
      player: Entities.makePlayer(charDef),
      map: mapDef,
      weapons: [], passives: {},
      xp: 0, xpNeed: CFG.XP_NEED(1), level: 1, pendingLevels: 0,
      coopXp: coop.on ? 0 : null,   // 联机共享经验池;单机为 null 走旧路径
      kills: 0, gold: 0, bossesKilled: 0, dmgTotal: 0, maxDps: 0,
      spawnAcc: 0, eventIdx: 0, nextElite: CFG.ELITE.firstT,
      freezeT: 0, boss: null, over: false, victory: false,
      pendingChest: 0,
      banished: new Set(),
      rerolls: 0, banishes: 0,
      seen: {},
      endless: false, nextEndlessBoss: 0,
      coopHpMul: coopMul(CFG.COOP.hpMulByPlayers),
      coopRateMul: coopMul(CFG.COOP.rateMulByPlayers),
      coopXpMul: coopMul(CFG.COOP.xpMulByPlayers),
      onCoopLevel: coop.on ? function (lv) {
        // 联机非阻塞升级:弹出悬浮卡片,游戏不暂停,选完继续
        UI.coopLevelUp(run, lv);
        // 房主把同样的升级选项推给客户端,让大家同步选
        if (Net.isHost()) {
          var opts = Weapons.getLevelUpChoices(run);
          Net.broadcast({ t: 'levelup', choices: opts });
        }
      } : null,
      onCoopPick: coop.on ? function (opt) {
        // 房主:把自己的选择应用到自己的 run(已应用),无需额外处理;
        // 但要把"当前共享升级已解决"广播,客户端隐藏悬浮卡。
        if (Net.isHost()) Net.broadcast({ t: 'pickdone' });
      } : null,
      cb: {
        onBoss: function (bd) { UI.bossBanner(bd); },
        onWarn: function (msg) { UI.warn(msg); },
        onElite: function () { UI.warn('☠ 精英怪现身,击杀掉落宝箱!'); }
      }
    };
    E.cam.x = 0; E.cam.y = 0;
    Entities.recomputeStats(run);
    run.player.hp = run.player.stats.hp;
    run.rerolls = run.player.stats.reroll || 0;
    run.banishes = run.player.stats.banish || 0;
    Weapons.addWeapon(run, charDef.weapon);
    Meta.track('run');
    Meta.seeCodex(charDef.sprite);
    Merchant.reset(run);   // 流浪商人摆摊
    initVaults(run);       // 四角金库

    lastDmg = 0; dpsTimer = 0; achvTimer = 0;

    UI.hideAllScreens();
    UI.showHud(true);
    AudioSys.playMusic(mapDef.music);
    AudioSys.setIntensity(0);
    state = 'run';
  }

  function finalizeRun() {
    Meta.trackBest('survive', Math.floor(run.t), run.map.id);
    Meta.trackBest('killsRun', run.kills);
    if (run.victory) Meta.track('win');
    else Meta.track('death');
    Meta.persist();
    var fresh = Meta.checkAchv();
    AudioSys.setIntensity(0);
    AudioSys.play(run.victory ? 'victory' : 'gameover');
    state = 'result';
    UI.showHud(false);
    UI.showResult(run, fresh, run.victory);
  }

  // ================= 升级 / 宝箱流程 =================
  function enterLevelUp() {
    state = 'levelup';
    AudioSys.play('levelup');
    FX.levelBeam(run.player.x, run.player.y);
    function handler(action, opt) {
      if (action === 'pick') {
        Weapons.applyChoice(run, opt);
        run.pendingLevels--;
        UI.hideLevelUp();
        if (run.pendingLevels > 0) enterLevelUp();
        else state = 'run';
      } else if (action === 'reroll' && run.rerolls > 0) {
        run.rerolls--;
        AudioSys.play('ui_click');
        UI.showLevelUp(Weapons.getLevelUpChoices(run), { rerolls: run.rerolls, banishes: run.banishes }, handler);
      } else if (action === 'banish' && run.banishes > 0) {
        run.banishes--;
        run.banished.add(opt.id);
        AudioSys.play('ui_back');
        UI.showLevelUp(Weapons.getLevelUpChoices(run), { rerolls: run.rerolls, banishes: run.banishes }, handler);
      }
    }
    UI.showLevelUp(Weapons.getLevelUpChoices(run), { rerolls: run.rerolls, banishes: run.banishes }, handler);
  }

  function enterChest() {
    state = 'chest';
    run.pendingChest--;
    var results = Weapons.chestLoot(run);
    var hadEvo = results.some(function (r) { return r.evolved; });
    if (hadEvo) { FX.flash('#ffd76b', 0.4, 0.6); FX.shake(6, 0.4); }
    UI.showChest(results, function () {
      var fresh = Meta.checkAchv();
      fresh.forEach(UI.toastAchv);
      state = 'run';
    });
  }

  function togglePause() {
    if (state === 'run') {
      state = 'pause';
      UI.showPause(run);
    } else if (state === 'pause') {
      // 局内百科是盖在暂停之上的覆盖层。此时按 ESC 应该只退回暂停菜单,
      // 否则会关掉暂停层却留下百科层,表现为卡在百科界面出不来。
      if (UI.isCodexOpen()) { UI.closeCodexOverlay(); return; }
      state = 'run';
      UI.hidePause();
    }
  }

  // ================= 每帧更新 =================
  function update(dt) {
    FX.update(dt);
    if (state === 'intro') { updateIntro(dt); return; }
    if (state !== 'run' || !run) return;

    run.t += dt;
    run.frame++;
    if (run.freezeT > 0) run.freezeT -= dt;

    Merchant.update(run, dt);   // 流浪商人:定时补货 + 走上自动购买
    updateVaults(run, dt);      // 四角金库:金币随时间增长 + 走到自动拾取
    applyCoopAuras();    // 队友光环互益:圣光环持有者为附近队友回血与加成

    // 联机客户端:只上报输入 + 渲染房主快照,不跑本地模拟(避免两端分歧)
    if (coop.on && Net.isClient()) {
      Entities.updatePlayer(run, dt);        // 本地预测,手感不卡
      var iv = E.readInput();
      coop.inputAcc += dt;
      if (coop.inputAcc >= 1 / 30) {         // 30Hz 上报足够
        coop.inputAcc = 0;
        Net.toHost({ t: 'input', x: +iv.x.toFixed(2), y: +iv.y.toFixed(2) });
      }
      Weapons.update(run, dt);               // 本地弹幕仅作视觉,伤害由房主结算
      UI.updateHUD(run);
      return;
    }

    Entities.updatePlayer(run, dt);
    updateMates(dt);                         // 房主代跑队友移动与武器
    // 环境氛围粒子:贴合相机视野的浮游尘埃/萤火
    FX.ambient(E.cam.x - CFG.GAME.W / 2, E.cam.y - CFG.GAME.H / 2, CFG.GAME.W, CFG.GAME.H,
      { color: run.map.palette.ambient || '#ffe9a3', glow: true, rate: 46, dt: dt });
    Weapons.update(run, dt);
    Entities.updateEnemies(run, dt);
    Entities.updateGems(run, dt);
    Entities.updateItems(run, dt);
    Entities.director(run, dt);

    // 房主:定频广播世界快照
    if (coop.on && Net.isHost()) {
      coop.snapAcc += dt;
      if (coop.snapAcc >= 1 / Net.SNAP_HZ) {
        coop.snapAcc = 0;
        Net.broadcast(buildSnapshot());
      }
    }

    // 音乐强度
    if (run.boss && run.boss.alive) AudioSys.setIntensity(3);
    else if (run.t > 480) AudioSys.setIntensity(2);
    else if (run.t > 180) AudioSys.setIntensity(1);
    else AudioSys.setIntensity(0);

    // DPS 统计
    dpsTimer += dt;
    if (dpsTimer >= 2) {
      var dps = (run.dmgTotal - lastDmg) / dpsTimer;
      if (dps > run.maxDps) run.maxDps = dps;
      lastDmg = run.dmgTotal; dpsTimer = 0;
    }

    // 定期成就检查 + 最佳存活即时上报
    achvTimer += dt;
    if (achvTimer >= 5) {
      achvTimer = 0;
      Meta.trackBest('survive', Math.floor(run.t), run.map.id);
      Meta.track('playTime', 5);
      var fresh = Meta.checkAchv();
      fresh.forEach(UI.toastAchv);
    }

    // 20 分钟警告(最终Boss存活时狂暴)
    if (!run.endless && !run.warned20 && run.t >= CFG.GAME.RUN_TIME && run.boss && run.boss.alive) {
      run.warned20 = true;
      UI.warn('⚠ 暗潮魔王狂暴了!!');
      FX.flash('#ff3355', 0.35, 0.8);
    }

    run.nextEvent = computeNextEvent(run);
    UI.updateHUD(run);

    if (run.over) { finalizeRun(); return; }
    // 联机:升级用非阻塞悬浮卡,不暂停;pendingLevels 由悬浮卡结算
    if (coop.on) { if (run.pendingLevels > 0) run.pendingLevels = 0; return; }
    if (run.pendingChest) { enterChest(); return; }
    if (run.pendingLevels > 0) { enterLevelUp(); return; }
  }

  // 计算下一个将要发生的事件(定点事件 / 精英 / 无尽Boss),供 HUD 倒计时
  var EVENT_LABEL = {
    boss: '☠ BOSS',
    ring: '⭕ 包围圈',
    swarm: '🐾 兽潮'
  };
  function computeNextEvent(run) {
    var best = null;
    // 地图定点事件
    var evs = run.map.events;
    for (var i = run.eventIdx; i < evs.length; i++) {
      if (evs[i].t > run.t) {
        best = { t: evs[i].t, label: EVENT_LABEL[evs[i].type] || '事件' };
        break;
      }
    }
    // 精英刷新
    if (run.nextElite > run.t && (!best || run.nextElite < best.t)) {
      best = { t: run.nextElite, label: '👑 精英' };
    }
    // 无尽模式的循环 Boss
    if (run.endless && run.nextEndlessBoss > run.t && (!best || run.nextEndlessBoss < best.t)) {
      best = { t: run.nextEndlessBoss, label: '☠ BOSS' };
    }
    if (!best) return null;
    return { label: best.label, left: Math.max(0, best.t - run.t) };
  }

  // ================= 渲染 =================
  function makeVignette() {
    var c = document.createElement('canvas');
    c.width = CFG.GAME.W; c.height = CFG.GAME.H;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.42, c.width / 2, c.height / 2, c.height * 0.85);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function drawGround(pal, camX, camY) {
    var W = CFG.GAME.W, H = CFG.GAME.H;
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, W, H);

    // 第一层:大块地砖色差,给地面基础层次
    var big = 160;
    var bx0 = Math.floor((camX - W / 2) / big) - 1, bx1 = Math.floor((camX + W / 2) / big) + 1;
    var by0 = Math.floor((camY - H / 2) / big) - 1, by1 = Math.floor((camY + H / 2) / big) + 1;
    for (var by = by0; by <= by1; by++) {
      for (var bx = bx0; bx <= bx1; bx++) {
        var bh = E.hash2(bx * 17 + 5, by * 17 + 5);
        if (bh < 0.5) continue;
        ctx.globalAlpha = 0.35 * (bh - 0.5);
        ctx.fillStyle = pal.ground2;
        ctx.fillRect(bx * big - camX + W / 2, by * big - camY + H / 2, big, big);
      }
    }
    ctx.globalAlpha = 1;

    // 第二层:细碎石砾(密度提高,尺寸分级)
    var cell = 32;
    var x0 = Math.floor((camX - W / 2) / cell) - 1, x1 = Math.floor((camX + W / 2) / cell) + 1;
    var y0 = Math.floor((camY - H / 2) / cell) - 1, y1 = Math.floor((camY + H / 2) / cell) + 1;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var hsh = E.hash2(cx, cy);
        if (hsh >= 0.62) continue;
        var px = cx * cell - camX + W / 2 + (hsh * 991 % 1) * 22;
        var py = cy * cell - camY + H / 2 + (hsh * 577 % 1) * 22;
        var s, col;
        if (hsh < 0.08) { s = 5; col = pal.decor; }
        else if (hsh < 0.26) { s = 3; col = pal.ground2; }
        else { s = 2; col = pal.ground2; }
        ctx.globalAlpha = hsh < 0.08 ? 0.5 : 0.85;
        ctx.fillStyle = col;
        ctx.fillRect(px | 0, py | 0, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 装饰物按基座 y 排序绘制:pass='back' 画角色身后的,pass='front' 画角色身前的,
  // 这样墓碑/枯树能正确遮挡走到它后面的角色。refY 传玩家世界 y。
  function drawDecor(map, camX, camY, refY, pass) {
    var cell = 220;
    var x0 = Math.floor((camX - CFG.GAME.W / 2 - 60) / cell);
    var x1 = Math.floor((camX + CFG.GAME.W / 2 + 60) / cell);
    var y0 = Math.floor((camY - CFG.GAME.H / 2 - 80) / cell);
    var y1 = Math.floor((camY + CFG.GAME.H / 2 + 40) / cell);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var n = Math.floor(E.hash2(cx * 3 + 1, cy * 3 + 1) * 3); // 0~2 个装饰
        for (var k = 0; k < n; k++) {
          var h1 = E.hash2(cx * 7 + k * 13, cy * 7 + k * 31);
          var h2 = E.hash2(cx * 11 + k * 17, cy * 11 + k * 41);
          var wx = cx * cell + h1 * cell;
          var wy = cy * cell + h2 * cell;
          // 行商浪人摊位清空区:摊位横跨约 ±160,避免装饰物与商人和商品贴图重合
          var MC = CFG.MERCHANT, clearance = 185;
          if (Math.abs(wx - MC.x) < clearance && Math.abs(wy - MC.y) < clearance) continue;
          if (pass === 'back' && wy > refY) continue;
          if (pass === 'front' && wy <= refY) continue;
          var name = map.decors[Math.floor(h1 * map.decors.length)];
          var img = SpriteGen.get(name);
          var sx = wx - camX + CFG.GAME.W / 2;
          var sy = wy - camY + CFG.GAME.H / 2;
          var dw = img.width * 2, dh = img.height * 2;
          // 贴地投影:让装饰物落在地面上而不是浮空
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(sx | 0, sy | 0, dw * 0.36, dh * 0.10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(img, (sx - img.width) | 0, (sy - dh) | 0, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // 隐形摇杆:仅在触摸按下时淡淡显现,松手即隐(屏幕坐标系)
  function drawJoystick() {
    var t = E.touchState;
    if (!t.active) return;
    var rect = canvas.getBoundingClientRect();
    var sc = E.viewScale() || 1;
    var ox = (t.sx - rect.left) / sc, oy = (t.sy - rect.top) / sc;
    var len = Math.hypot(t.dx, t.dy);
    var maxR = 46;
    var kx = ox + (len > 0 ? t.dx / len : 0) * Math.min(len / sc, maxR);
    var ky = oy + (len > 0 ? t.dy / len : 0) * Math.min(len / sc, maxR);
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#cfc6ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, maxR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#e6e0ff';
    ctx.beginPath(); ctx.arc(kx, ky, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 暗潮结界:地图边界的流动光墙(世界坐标系内绘制)
  function drawBoundary(run) {
    var R = CFG.GAME.MAP_R;
    var pulse = 0.45 + Math.sin(run.t * 2) * 0.18;
    // 外侧虚空
    ctx.fillStyle = 'rgba(4,2,10,0.92)';
    ctx.fillRect(-R - 2000, -R - 2000, 2000, (R + 2000) * 2);        // 左
    ctx.fillRect(R, -R - 2000, 2000, (R + 2000) * 2);                 // 右
    ctx.fillRect(-R, -R - 2000, R * 2, 2000);                          // 上
    ctx.fillRect(-R, R, R * 2, 2000);                                  // 下
    // 结界光墙
    ctx.strokeStyle = 'rgba(150,90,255,' + pulse.toFixed(3) + ')';
    ctx.lineWidth = 6;
    ctx.strokeRect(-R, -R, R * 2, R * 2);
    ctx.strokeStyle = 'rgba(220,190,255,' + (pulse * 0.7).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(-R + 5, -R + 5, (R - 5) * 2, (R - 5) * 2);
    // 沿墙流动的符文点
    ctx.fillStyle = 'rgba(200,160,255,' + (pulse * 0.9).toFixed(3) + ')';
    var span = R * 2, step = 160;
    var drift = (run.t * 40) % step;
    for (var o = -R + drift; o < R; o += step) {
      ctx.fillRect(o, -R - 1, 26, 4);
      ctx.fillRect(o, R - 3, 26, 4);
      ctx.fillRect(-R - 1, o, 4, 26);
      ctx.fillRect(R - 3, o, 4, 26);
    }
    // 靠近边界时的警示
    var p = run.player;
    var near = Math.min(R - Math.abs(p.x), R - Math.abs(p.y));
    if (near < 180) {
      ctx.globalAlpha = (1 - near / 180) * 0.5;
      ctx.strokeStyle = '#ff6688';
      ctx.lineWidth = 10;
      ctx.strokeRect(-R, -R, R * 2, R * 2);
      ctx.globalAlpha = 1;
    }
  }

  var menuT = 0;
  function render() {
    ctx.imageSmoothingEnabled = false;
    if (state === 'intro') { renderIntro(); return; }
    if (state === 'menu' || state === 'result' || !run) {
      renderMenuBg();
      return;
    }
    var shake = FX.getOffset();
    var camX = E.cam.x + shake.x, camY = E.cam.y + shake.y;
    var pal = run.map.palette;

    drawGround(pal, camX, camY);
    // 角色背后的装饰物(y 小于玩家)
    drawDecor(run.map, camX, camY, run.player.y, 'back');

    ctx.save();
    ctx.translate(CFG.GAME.W / 2 - camX, CFG.GAME.H / 2 - camY);
    drawBoundary(run);
    Weapons.drawGround(ctx, run);
    Merchant.draw(ctx, run);          // 摊位在地面层之上、角色之下
    drawVaults(ctx, run);             // 四角金库(含屏幕外箭头指示)
    Entities.drawLobMarkers(ctx, run);
    // 联机队友:房主画 mates,客户端画从快照解出的 remote
    if (coop.on) {
      Entities.drawMates(ctx, run, Net.isHost() ? hostMateView() : coop.remote);
    }
    Entities.draw(ctx, run);
    ctx.restore();

    // 角色前方的装饰物:自带屏幕坐标换算,必须在 translate 之外调用
    drawDecor(run.map, camX, camY, run.player.y, 'front');

    ctx.save();
    ctx.translate(CFG.GAME.W / 2 - camX, CFG.GAME.H / 2 - camY);
    Weapons.draw(ctx, run);
    FX.draw(ctx);
    ctx.restore();

    // 玩家周围柔光:提升主体可读性
    var pls = CFG.GAME.W / 2 + (run.player.x - camX);
    var plt = CFG.GAME.H / 2 + (run.player.y - camY);
    var lg = ctx.createRadialGradient(pls, plt, 10, pls, plt, 190);
    lg.addColorStop(0, 'rgba(190,175,255,0.13)');
    lg.addColorStop(0.55, 'rgba(150,130,230,0.05)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, CFG.GAME.W, CFG.GAME.H);

    // 雾色叠层 + 暗角
    ctx.globalAlpha = 0.10 + Math.sin(run.t * 0.4) * 0.03;
    ctx.fillStyle = pal.fog;
    ctx.fillRect(0, 0, CFG.GAME.W, CFG.GAME.H);
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0);
    // 冰冻提示边框
    if (run.freezeT > 0) {
      ctx.strokeStyle = 'rgba(120,220,255,' + Math.min(0.8, run.freezeT) + ')';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, CFG.GAME.W - 6, CFG.GAME.H - 6);
    }
    // 小地图
    Minimap.draw(ctx, run);
    drawJoystick();
    FX.drawUI(ctx);
    // 金库方向箭头:放在最上层,不被任何 UI 遮挡
    drawVaultArrows(ctx, run);
  }

  function renderMenuBg() {
    menuT += 1 / 60;
    var pal = CFG.MAPS[0].palette;
    drawGround(pal, menuT * 30, Math.sin(menuT * 0.1) * 40);
    drawDecor(CFG.MAPS[0], menuT * 30, Math.sin(menuT * 0.1) * 40, 0, null);

    // 顶部角色行:从右往左跳动,固定间隔整齐排列
    var chars = ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono'];
    for (var ci = 0; ci < chars.length; ci++) {
      var cx = (CFG.GAME.W + 220 - (menuT * 36 + ci * 165) % (CFG.GAME.W + 220)) - 110;
      var cy = 62 + Math.sin(menuT * 3.2 + ci * 0.8) * 6;
      var cfr = SpriteGen.frames(chars[ci]);
      var cimg = cfr[Math.floor(menuT * 5 + ci) % cfr.length];
      ctx.globalAlpha = 0.55;
      ctx.drawImage(cimg, cx, cy, 40, 40);
      ctx.globalAlpha = 1;
    }

    // 底部怪物行:普通怪 + Boss 随机错落排列,普通怪 32px,Boss 40px(还原比例)
    var parade = ['bat', 'slime', 'zombie', 'skeleton', 'ghost', 'spider', 'orc',
                  'boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord'];
    var crown = SpriteGen.get('elite_crown');
    for (var i = 0; i < parade.length; i++) {
      var pid = parade[i];
      var x = ((menuT * 40 + i * 152 + (i % 3) * 26) % (CFG.GAME.W + 200)) - 100;
      var y = CFG.GAME.H - 90 + Math.sin(menuT * 4 + i * 1.3) * 4;
      var frames = SpriteGen.frames(pid);
      var img = frames[Math.floor(menuT * 5 + i) % frames.length];
      var isBoss = pid.indexOf('boss_') === 0;
      ctx.globalAlpha = 0.5;
      if (isBoss) {
        ctx.drawImage(img, x, y, 40, 40);            // Boss 比例不变,只是比小怪略大
      } else {
        ctx.drawImage(img, x, y, 32, 32);
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(vignette, 0, 0);
    FX.update(1 / 60);
    FX.drawUI(ctx);
  }

  // ================= 启动 =================
  function boot() {
    canvas = document.getElementById('game');
    canvas.width = CFG.GAME.W; canvas.height = CFG.GAME.H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    SpriteGen.init();
    Meta.load();
    var st = Meta.settings();
    FX.setCfg({ shake: st.shake, dmgText: st.dmgText });
    AudioSys.setVolumes(st.music, st.sfx);

    vignette = makeVignette();
    E.initInput(canvas);
    E.fitCanvas(canvas);
    // 开幕过渡:点击跳过,进入主菜单
    canvas.addEventListener('click', function () {
      if (state === 'intro') skipIntro();
    });
    E.onPause = function () {
      if (state === 'run' || state === 'pause') togglePause();
    };
    E.onBlur = function () {
      if (state === 'run') togglePause();
    };
    E.onToggleMap = function () {
      if (state !== 'run') return;
      var m = Minimap.toggle();
      UI.warn(m === 'full' ? '🗺 小地图:全图' : '🗺 小地图:周围');
    };
    // 滚轮切换索敌方式(小地图下方小字实时显示,不弹提示)
    E.onScroll = function (dy) {
      if (state !== 'run') return;
      if (Math.abs(dy) < 1) return;
      Weapons.cycleTargetMode();
    };

    // 屏幕坐标是否落在小地图上(鼠标点击与触屏摇杆共用,避免手指按图变成移动)
    function overMinimap(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      var mx = (clientX - rect.left) * (CFG.GAME.W / rect.width);
      var my = (clientY - rect.top) * (CFG.GAME.H / rect.height);
      var box = Minimap.hitBox();
      return mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h;
    }
    E.isOverMinimap = function (cx, cy) {
      return state === 'run' && overMinimap(cx, cy);
    };

    // 小地图点击/触摸切换
    canvas.addEventListener('click', function (ev) {
      if (state !== 'run') return;
      if (overMinimap(ev.clientX, ev.clientY)) E.onToggleMap();
    });
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'touch' || state !== 'run') return;
      if (overMinimap(ev.clientX, ev.clientY)) E.onToggleMap();
    });

    UI.init({
      onStartRun: function (charId, mapId) { newRun(charId, mapId); },
      onResume: function () { if (state === 'pause') togglePause(); },
      onPauseToggle: togglePause,
      onGiveUp: function () {
        UI.hidePause();
        run.over = true; run.victory = false;
        state = 'run'; // 让 update 走 finalize
      },
      onEndless: function () {
        run.over = false; run.victory = false;
        run.endless = true;
        run.nextEndlessBoss = run.t + 90;
        UI.hideAllScreens();
        UI.showHud(true);
        AudioSys.playMusic(run.map.music);
        UI.warn('∞ 无尽模式:活得越久,敌人越强!');
        state = 'run';
      },
      // 触屏索敌按钮切换(小地图下方小字实时显示,不弹提示)
      onTargetChanged: function () {},
      // 房主点「开始战斗」:建好队友实体并通知所有人开局
      onCoopStart: function () {
        var roster = Net.getRoster();
        var ok = roster.length >= 2 && roster.every(function (r) { return r.ready && r.charId; });
        if (!ok) { UI.warn('等待全员准备…'); return; }
        var mapId = Net.getMap() || CFG.MAPS[0].id;   // 房主选定,不再固定第一张
        setupCoopHost(roster, mapId);
        Net.broadcast({ t: 'start', mapId: mapId, roster: roster });
        newRun(roster[0].charId, mapId);
      }
    });

    // 联机回调:大厅名单更新 / 客户端被拉入战斗 / 房主掉线
    Net.init({
      onRoster: function (roster, mapId) {
        UI.renderRoster(roster);
        if (mapId) UI.applyCoopMap(mapId);   // 房主选图后同步给客户端显示
      },
      onStart: function (m) {
        // 客户端跟随房主开局;自己的角色取自大厅选择
        var mine = UI.myPick() || CFG.CHARS[0].id;
        coop.on = true;
        coop.mates = [];
        coop.remote = [];
        coop.myId = Net.selfId();
        newRun(mine, m.mapId);
      },
      // 客户端:收到房主快照,重建世界并解出队友
      onSnap: function (m) {        if (!run || !coop.on) return;
        Entities.applySnapshot(run, { t: m.ti, e: m.e, s: m.s, l: m.l, g: m.g, it: m.it, bh: m.bh });
        run.kills = m.kl || run.kills;
        coop.remote = [];
        for (var i = 0; i < m.p.length; i++) {
          var ps = m.p[i];
          if (ps.id === coop.myId) {
            // 房主对我的权威状态:血量与倒地由它说了算,位置保留本地预测
            if (run.player.stats) run.player.hp = ps.hp * run.player.stats.hp;
            run.player.downed = !!ps.dn;
            run.player.reviveT = ps.rv;
            continue;
          }
          coop.remote.push({
            name: ps.name, charId: ps.charId, x: ps.x, y: ps.y,
            face: ps.f, moving: !!ps.mv, hpPct: ps.hp,
            downed: !!ps.dn, reviveT: ps.rv, buffed: !!ps.bf
          });
        }
      },
      // 房主:收到客户端输入
      onClientInput: function (peerId, m) {
        for (var i = 0; i < coop.mates.length; i++) {
          if (coop.mates[i].peerId === peerId) {
            coop.mates[i].input.x = m.x; coop.mates[i].input.y = m.y;
            return;
          }
        }
      },
      onHostLost: function () {
        UI.warn('⚠ 房主已断开');
        coop.on = false;
      },
      // 网络状态反馈:掉线自动重连时给出提示,避免玩家以为游戏卡死
      onNetStatus: function (status, tries) {
        if (status === 'reconnecting') {
          UI.warn('⚠ 连接中断,正在重连(' + tries + '/5)…');
        } else if (status === 'connected') {
          UI.toastText('已重新连接');
        } else if (status === 'dropped') {
          UI.warn('⚠ 连接中断,正在重连…');
        }
      },
      // 客户端:收到房主推送的升级选项,弹出非阻塞悬浮卡
      onRemoteLevelUp: function (m) {
        UI.remoteLevelUp(m.choices);
      },
      // 客户端:房主宣布本档升级已解决,隐藏悬浮卡
      onPickDone: function () { UI.hideCoopLevelUp(); },
      // 房主:客户端上报升级选择,代它应用到对应队友
      onClientPick: function (peerId, optIdx) {
        for (var i = 0; i < coop.mates.length; i++) {
          if (coop.mates[i].peerId !== peerId) continue;
          var mt = coop.mates[i];
          var opts = Weapons.getLevelUpChoices(run);
          if (opts[optIdx]) {
            // 切到该队友的 run 视角应用,再切回
            var savedP = run.player, savedPs = run.passives;
            run.player = mt.player; run.passives = mt.passives;
            Weapons.applyChoice(run, opts[optIdx]);
            run.player = savedP; run.passives = savedPs;
          }
          mt.pendingLevels = 0;
          return;
        }
      },
      onError: function (e) {
        UI.warn('联机异常: ' + (e && e.type ? e.type : '未知'));
      }
    });

    // 全局兜底:文档级手势解锁音频
    document.addEventListener('pointerdown', function () { AudioSys.unlock(); }, { once: true });

    // 以开幕过渡开场(3 秒,点击跳过)
    bootIntro();

    Engine.start(update, render);
  }

  window.Debug = {
    run: function () { return run; },
    state: function () { return state; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
