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
    ctx.textAlign = 'right';
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText('轻触屏幕以跳过...', W - 12, H - 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('轻触屏幕以跳过...', W - 12, H - 12);
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
    myId: '',         // client: 自己的 peer id,用于从快照里剔除自己
    hostLuOpen: false, // host: 自己的联机升级悬浮卡是否已打开
    active: false      // 联机对局是否真正开始(结算后清除,防止"再来一局"带旧队友)
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
        xp: 0, level: 1, xpNeed: CFG.XP_NEED(1), pendingLevels: 0, downed: false, reviveT: 0,
        banished: new Set(), pendingChest: 0, levelQueue: [], luSeq: 0, luOpen: false
      });
    }
  }

  // 把"所有可被战斗系统索敌的玩家"挂到 run 上:单机只有房主,联机房主再挂队友
  function bindCoopPlayers() {
    run.coopPlayers = [{
      player: run.player, weapons: run.weapons, passives: run.passives,
      isHost: true, downed: false, reviveT: 0,
      peerId: 'host', name: '房主', pendingLevels: 0, pendingChest: 0,
      banished: run.banished
    }];
    if (coop.on && Net.isHost()) {
      for (var i = 0; i < coop.mates.length; i++) {
        var m = coop.mates[i];
        if (!m.banished) m.banished = new Set();
        if (!m.levelQueue) m.levelQueue = [];
        run.coopPlayers.push(m);
      }
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
    // 玩家弹幕:客户端需要看到所有参战者的投射物
    var wbs = Weapons.getBullets(), bs = [];
    for (i = 0; i < wbs.length; i++) {
      var wb = wbs[i];
      if (!wb.alive) continue;
      bs.push({
        k: wb.kind, s: wb.spr, x: Math.round(wb.x), y: Math.round(wb.y),
        vx: Math.round(wb.vx), vy: Math.round(wb.vy),
        a: +wb.angle.toFixed(2), sp: +wb.spin.toFixed(2), ph: +wb.phase.toFixed(2),
        tt: +wb.ttl.toFixed(2), z: Math.round(wb.size),
        ev: wb.evolved ? 1 : 0, bf: wb.blessed ? 1 : 0,
        o1: +wb.aux.toFixed(2), o2: +wb.aux2.toFixed(2),
        ox: Math.round(wb.ox), oy: Math.round(wb.oy),
        or: Math.round(wb.orbitR), os: +wb.orbitSpd.toFixed(2),
        cx: Math.round(wb.owner ? wb.owner.x : wb.ownerX),
        cy: Math.round(wb.owner ? wb.owner.y : wb.ownerY)
      });
    }
    // 全体玩家状态(房主自己 + 各客户端),客户端用它渲染队友
    var ps = [{
      id: 'host', name: '房主', charId: run.player.char.id,
      x: Math.round(run.player.x), y: Math.round(run.player.y),
      f: run.player.face, mv: run.player.moving ? 1 : 0,
      hp: +(run.player.hp / run.player.stats.hp).toFixed(2),
      dn: run.player.downed ? 1 : 0, rv: +(run.player.reviveT || 0).toFixed(2),
      bf: run.player.auraBuff ? 1 : 0,
      lvl: run.level, xp: +(run.coopXp !== null ? run.coopXp : run.xp).toFixed(1), xn: run.xpNeed,
      wp: run.weapons.map(function (w) { return [w.id, w.lv, w.evolved ? 1 : 0]; }),
      ps: Object.keys(run.passives).map(function (k) { return [k, run.passives[k]]; }),
      sl: +(run.player.slow || 0).toFixed(2), rt: run.player.rootT > 0 ? 1 : 0,
      ws: run.player.webStacks || 0
    }];
    for (i = 0; i < coop.mates.length; i++) {
      var mt = coop.mates[i], mp = mt.player;
      ps.push({
        id: mt.peerId, name: mt.name, charId: mt.charId,
        x: Math.round(mp.x), y: Math.round(mp.y),
        f: mp.face, mv: mp.moving ? 1 : 0,
        hp: mp.stats ? +(mp.hp / mp.stats.hp).toFixed(2) : 1,
        dn: mt.downed ? 1 : 0, rv: +(mt.reviveT || 0).toFixed(2),
        bf: mp.auraBuff ? 1 : 0,
        lvl: run.level, xp: +(run.coopXp !== null ? run.coopXp : run.xp).toFixed(1), xn: run.xpNeed,
        wp: mt.weapons.map(function (w) { return [w.id, w.lv, w.evolved ? 1 : 0]; }),
        ps: Object.keys(mt.passives).map(function (k) { return [k, mt.passives[k]]; }),
        sl: +(mp.slow || 0).toFixed(2), rt: mp.rootT > 0 ? 1 : 0,
        ws: mp.webStacks || 0
      });
    }
    return {
      t: 'snap', ti: +run.t.toFixed(2),
      e: es, s: ss, l: ls, g: gs, it: its, b: bs, p: ps,
      bh: run.boss && run.boss.alive ? +(run.boss.hp / run.boss.maxHp).toFixed(3) : -1,
      bi: run.boss && run.boss.alive ? run.boss.bossType : '',
      kl: run.kills, gd: run.gold, bk: run.bossesKilled,
      fz: +(run.freezeT || 0).toFixed(2), en: run.endless ? 1 : 0
    };
  }

  // ---- 房主:把客户端输入写进对应队友,并跑他们的移动与武器 ----
  function updateMates(dt) {
    if (!coop.on || !Net.isHost()) return;
    var A = CFG.COOP;
    for (var i = 0; i < coop.mates.length; i++) {
      var m = coop.mates[i], p = m.player;
      if (!p.stats) { Entities.recomputeStatsFor(run, p, m.passives); p.hp = p.stats.hp; }
      if (m.downed) continue;
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
        if (p.stats && p.stats.revive > 0) {
          p.stats.revive--;
          p.hp = p.stats.hp * 0.5;
          p.iframe = 2.5;
          FX.levelBeam(p.x, p.y);
          FX.ring(p.x, p.y, { r: 120, color: '#ffd76b', life: 0.6, width: 4 });
          AudioSys.play('levelup');
          Entities.bombBlast(run, 150, p.x, p.y);
        } else {
          m.downed = true; m.reviveT = 0; p.hp = 0;
          FX.ring(p.x, p.y, { r: 50, color: '#ff5964', life: 0.6, width: 3 });
          UI.warn('⚠ ' + m.name + ' 倒下了!');
        }
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
    var all = run.coopPlayers || [];
    for (var i = 0; i < all.length; i++) {
      var w = all[i];
      if (w === exclude || w.downed || w.player.hp <= 0) continue;
      if (E.dist2(w.player.x, w.player.y, target.x, target.y) < r2) return w.player;
    }
    return null;
  }

  // 房主和客户端一视同仁地进入倒地状态;只要还有队友存活,靠近即可救援。
  function updateTeamRevives(dt) {
    if (!coop.on || !Net.isHost() || !run.coopPlayers) return;
    var A = CFG.COOP;
    for (var i = 0; i < run.coopPlayers.length; i++) {
      var w = run.coopPlayers[i];
      if (!w.downed) continue;
      var p = w.player;
      var rescuer = nearestAlivePlayer(p, A.reviveRadius, w);
      if (rescuer) {
        w.reviveT = (w.reviveT || 0) + dt;
        if (w.reviveT >= A.reviveTime) {
          w.downed = false;
          w.reviveT = 0;
          p.downed = false;
          p.reviveT = 0;
          p.hp = p.stats.hp * A.downedHp;
          p.iframe = 2.0;
          FX.ring(p.x, p.y, { r: 60, color: '#7ce87c', life: 0.5, width: 3 });
          FX.heal(p.x, p.y);
          if (run.cb && run.cb.onWarn) run.cb.onWarn('✚ ' + (w.name || '队友') + ' 已被救起!');
        }
      } else {
        w.reviveT = Math.max(0, (w.reviveT || 0) - dt * 0.5);
      }
      p.reviveT = w.reviveT;
    }
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
      if (src.downed || src.player.downed || src.player.hp <= 0) continue;
      var hasAura = false;
      for (var w = 0; w < src.weapons.length; w++) if (src.weapons[w].id === 'holyaura') hasAura = true;
      if (!hasAura) continue;
      for (var t = 0; t < all.length; t++) {
        if (t === s) continue;                    // 只增益队友
        var tp = all[t].player;
        if (all[t].downed || tp.downed || tp.hp <= 0) continue;
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

  // ---------- 联机升级:每个玩家独立选项,非阻塞悬浮卡 ----------
  function makeChoicesFor(w) {
    var savedP = run.player, savedW = run.weapons, savedPs = run.passives, savedB = run.banished;
    run.player = w.player; run.weapons = w.weapons; run.passives = w.passives;
    run.banished = w.banished || run.banished;
    try { return Weapons.getLevelUpChoices(run); }
    finally { run.player = savedP; run.weapons = savedW; run.passives = savedPs; run.banished = savedB; }
  }

  function applyChoiceFor(w, opt) {
    var savedP = run.player, savedW = run.weapons, savedPs = run.passives, savedB = run.banished;
    run.player = w.player; run.weapons = w.weapons; run.passives = w.passives;
    run.banished = w.banished || run.banished;
    try { Weapons.applyChoice(run, opt); }
    finally { run.player = savedP; run.weapons = savedW; run.passives = savedPs; run.banished = savedB; }
  }

  function queueCoopLevel(w) {
    if (!w || !run || !coop.on) return;
    w.pendingLevels = (w.pendingLevels || 0) + 1;
    if (w.isHost) {
      if (!coop.hostLuOpen) showHostLevelUp(w);
    } else if (!w.luOpen) {
      sendMateLevelUp(w);
    }
  }

  function showHostLevelUp(w) {
    coop.hostLuOpen = true;
    UI.coopLevelUp(makeChoicesFor(w), function (opt) {
      coop.hostLuOpen = false;
      applyChoiceFor(w, opt);
      w.pendingLevels = Math.max(0, (w.pendingLevels || 0) - 1);
      if (w.pendingLevels > 0) showHostLevelUp(w);
    });
  }

  function sendMateLevelUp(w) {
    w.luOpen = true;
    w.luSeq = (w.luSeq || 0) + 1;
    var seq = w.luSeq;
    var choices = makeChoicesFor(w);
    w.luChoices = choices;
    Net.sendTo(w.peerId, { t: 'levelup', seq: seq, choices: choices });
  }

  // 房主代跑队友宝箱(自动随机升级,结果推给客户端展示)
  function processMateChests() {
    for (var i = 0; i < coop.mates.length; i++) {
      var m = coop.mates[i];
      if (!m.pendingChest) continue;
      m.pendingChest--;
      var savedP = run.player, savedW = run.weapons, savedPs = run.passives, savedB = run.banished;
      run.player = m.player; run.weapons = m.weapons; run.passives = m.passives;
      run.banished = m.banished || run.banished;
      var results = [];
      try { results = Weapons.chestLoot(run); }
      finally { run.player = savedP; run.weapons = savedW; run.passives = savedPs; run.banished = savedB; }
      Net.sendTo(m.peerId, {
        t: 'chest',
        results: results.map(function (r) {
          return { name: r.name, icon: r.icon, desc: r.desc, evolved: !!r.evolved };
        })
      });
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
      // 任意参战玩家走到宝箱旁都能拾取
      var ents = run.coopPlayers || [{ player: run.player, downed: false }];
      var got = false;
      for (var ei = 0; ei < ents.length && !got; ei++) {
        var w = ents[ei];
        if (w.downed || w.player.hp <= 0) continue;
        if (E.dist2(w.player.x, w.player.y, v.x, v.y) < 40 * 40) got = true;
      }
      if (got && v.gold > 0) {
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
      // 金库柔光:缓存贴图
      ctx.globalAlpha = 0.4 + pulse * 0.2;
      ctx.drawImage(SpriteGen.glow('#ffd76b'), sx - 30, sy - 30, 60, 60);
      ctx.globalAlpha = 1;
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
    // 结算后再开新局:残留的联机状态按单人局处理
    if (coop.on && !coop.active) {
      coop.on = false;
      coop.mates = [];
    }
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
      onCoopLevel: coop.on ? function () {
        // 共享经验池每升一级,给每位参战者各发一次独立选项
        if (Net.isHost() && run.coopPlayers) {
          for (var qi = 0; qi < run.coopPlayers.length; qi++) queueCoopLevel(run.coopPlayers[qi]);
        }
      } : null,
      onCoopPick: null,
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
    bindCoopPlayers();     // 把全部参战玩家挂到战斗系统

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
    // 关键结算只广播一次,避免逐客户端单发在对局切状态的瞬间丢失。
    // 消息内仍保留每位客户端自己的角色与 Build,由客户端按 peer id 取回。
    if (coop.on && Net.isHost()) {
      Net.broadcast({
        t: 'over', victory: run.victory, dur: run.t, level: run.level,
        kills: run.kills, gold: run.gold, bossesKilled: run.bossesKilled,
        maxDps: run.maxDps || 0,
        mapId: run.map.id,
        bestSurvive: Math.floor(run.t), bestLevel: run.level, bestKillsRun: run.kills,
        players: coop.mates.map(function (mate) {
          return {
            id: mate.peerId, charId: mate.charId,
            weapons: mate.weapons.map(function (w) {
              return { id: w.id, lv: w.lv, evolved: !!w.evolved, evoId: w.evoId || null };
            }),
            passives: mate.passives
          };
        })
      });
    }
    coop.active = false;
    coop.mates = [];
    state = 'result';
    UI.showHud(false);
    UI.showResult(run, fresh, run.victory);
  }

  // 客户端:房主宣布本局结束,按快照结果结算存档并展示
  function clientEndRun(m) {
    if (!run || !coop.on) return;
    var own = null;
    if (m.players) {
      for (var oi = 0; oi < m.players.length; oi++) {
        if (m.players[oi].id === coop.myId) { own = m.players[oi]; break; }
      }
    }
    run.victory = !!m.victory;
    run.t = m.dur !== undefined ? m.dur : run.t;
    run.level = m.level || 1;
    run.kills = m.kills || 0;
    run.gold = m.gold || 0;
    run.bossesKilled = m.bossesKilled || 0;
    run.maxDps = m.maxDps || 0;
    run.weapons = ((own && own.weapons) || m.weapons || []).map(function (w) {
      return { id: w.id, lv: w.lv || 1, evolved: !!w.evolved, evoId: w.evoId, cdT: 0.2, curR: 0 };
    });
    run.passives = (own && own.passives) || m.passives || {};
    for (var i = 0; i < CFG.MAPS.length; i++) if (CFG.MAPS[i].id === m.mapId) run.map = CFG.MAPS[i];
    var ownCharId = (own && own.charId) || m.charId;
    for (var k = 0; k < CFG.CHARS.length; k++) if (CFG.CHARS[k].id === ownCharId) run.player.char = CFG.CHARS[k];
    // 客户端没有本地模拟,整局统计在这里一次性补账
    if (run.kills > 0) Meta.track('kill', run.kills);
    if (run.gold > 0) Meta.track('gold', run.gold);
    if (run.bossesKilled > 0) Meta.track('bossKill', run.bossesKilled);
    if (run.victory) Meta.track('win'); else Meta.track('death');
    Meta.trackBest('survive', m.bestSurvive || Math.floor(run.t), m.mapId);
    Meta.trackBest('level', m.bestLevel || run.level);
    Meta.trackBest('weapons', run.weapons.length);
    Meta.trackBest('killsRun', m.bestKillsRun || run.kills);
    Meta.persist();
    var fresh = Meta.checkAchv();
    AudioSys.setIntensity(0);
    AudioSys.play(run.victory ? 'victory' : 'gameover');
    state = 'result';
    UI.showHud(false);
    UI.showResult(run, fresh, false);
    coop.on = false;
    coop.active = false;
    coop.mates = [];
  }

  // 客户端:用房主权威数据覆盖自己的显示状态(位置做平滑,不在本地积分)
  function syncOwnPlayer(ps) {
    var p = run.player;
    var prevHp = p.hp, prevStatsHp = p.stats ? p.stats.hp : 1;
    p.netX = ps.x; p.netY = ps.y;
    p.netFace = ps.f || 1; p.netMoving = !!ps.mv;
    p.downed = !!ps.dn;
    p.reviveT = ps.rv || 0;
    p.slow = ps.sl || 0;
    p.rootT = ps.rt ? 1 : 0;
    p.webStacks = ps.ws || 0;
    if (ps.lvl !== undefined) {
      run.level = ps.lvl;
      run.xp = ps.xp || 0;
      run.xpNeed = ps.xn || 1;
    }
    if (ps.wp) {
      run.weapons = ps.wp.map(function (w) {
        var def = CFG.WEAPONS[w[0]];
        return { id: w[0], lv: w[1], evolved: !!w[2], evoId: def ? def.evo : null, cdT: 0.2, curR: 0 };
      });
      run.passives = {};
      if (ps.ps) ps.ps.forEach(function (x) { run.passives[x[0]] = x[1]; });
      Entities.recomputeStats(run);
    }
    if (p.stats) {
      p.hp = ps.hp * p.stats.hp;
      // 血量下降时给客户端受击反馈(实际伤害判定在房主)
      if (ps.hp < prevHp / prevStatsHp - 0.02) {
        p.hurtFlash = 0.25;
        FX.flash('#ff2233', 0.14, 0.2);
        AudioSys.play('player_hurt');
      }
    }
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
    // 客户端不自己暂停:把请求发给房主,由房主统一暂停/恢复并广播
    if (coop.on && Net.isClient()) {
      if (state === 'run') Net.toHost({ t: 'pauseReq' });
      else if (state === 'pause') Net.toHost({ t: 'resumeReq' });
      return;
    }
    if (state === 'run') {
      state = 'pause';
      UI.showPause(run);
      if (coop.on && Net.isHost()) Net.broadcast({ t: 'pause', paused: true });
    } else if (state === 'pause') {
      // 局内百科是盖在暂停之上的覆盖层。此时按 ESC 应该只退回暂停菜单,
      // 否则会关掉暂停层却留下百科层,表现为卡在百科界面出不来。
      if (UI.isCodexOpen()) { UI.closeCodexOverlay(); return; }
      state = 'run';
      UI.hidePause();
      if (coop.on && Net.isHost()) Net.broadcast({ t: 'pause', paused: false });
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

    // 联机客户端:纯渲染。不跑本地模拟/伤害/拾取,只上报输入并播放房主快照,
    // 彻底消除本地模拟与快照互相覆盖导致的"几分钟后卡死/打不到怪"。
    if (coop.on && Net.isClient()) {
      var iv = E.readInput();
      coop.inputAcc += dt;
      if (coop.inputAcc >= 1 / 30) {         // 30Hz 上报足够
        coop.inputAcc = 0;
        Net.toHost({ t: 'input', x: +iv.x.toFixed(2), y: +iv.y.toFixed(2) });
      }
      var cp = run.player;
      // 位置跟随房主权威坐标,做轻量平滑(本地不积分位移,判定与画面一致)
      if (cp.netX !== undefined) {
        var ck = Math.min(1, dt * 12);
        cp.x += (cp.netX - cp.x) * ck;
        cp.y += (cp.netY - cp.y) * ck;
        if (cp.netFace > 0.01) cp.face = 1; else if (cp.netFace < -0.01) cp.face = -1;
        cp.moving = !!cp.netMoving;
      }
      if (cp.iframe > 0) cp.iframe -= dt;
      if (cp.hurtFlash > 0) cp.hurtFlash -= dt;
      // 相机跟随自己的权威位置
      E.cam.x = E.lerp(E.cam.x, cp.x, 1 - Math.pow(0.001, dt));
      E.cam.y = E.lerp(E.cam.y, cp.y, 1 - Math.pow(0.001, dt));
      var cmX = Math.max(0, CFG.GAME.MAP_R - CFG.GAME.W / 2 + 90);
      var cmY = Math.max(0, CFG.GAME.MAP_R - CFG.GAME.H / 2 + 90);
      E.cam.x = E.clamp(E.cam.x, -cmX, cmX);
      E.cam.y = E.clamp(E.cam.y, -cmY, cmY);
      Weapons.updateVisual(run, dt);         // 纯视觉弹幕运动,不结算伤害
      UI.updateHUD(run);
      return;
    }

    Merchant.update(run, dt);   // 流浪商人:定时补货 + 走上自动购买
    updateVaults(run, dt);      // 四角金库:金币随时间增长 + 走到自动拾取
    updateTeamRevives(dt);      // 全体倒地/救援,包括房主
    applyCoopAuras();    // 队友光环互益:圣光环持有者为附近队友回血与加成
    var hostEntry = run.coopPlayers && run.coopPlayers[0];
    if (!hostEntry || !hostEntry.downed) Entities.updatePlayer(run, dt);
    updateMates(dt);                         // 房主代跑队友移动与武器
    // 环境氛围粒子:贴合相机视野的浮游尘埃/萤火
    FX.ambient(E.cam.x - CFG.GAME.W / 2, E.cam.y - CFG.GAME.H / 2, CFG.GAME.W, CFG.GAME.H,
      { color: run.map.palette.ambient || '#ffe9a3', glow: true, rate: 46, dt: dt });
    if (!hostEntry || !hostEntry.downed) Weapons.update(run, dt);
    else {
      // 仍推进已存在的共享弹幕与延迟射击,但倒地房主不再产生新攻击。
      var hostWeapons = run.weapons;
      run.weapons = [];
      try { Weapons.update(run, dt); }
      finally { run.weapons = hostWeapons; }
    }
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
    if (coop.on) {
      run.pendingLevels = 0;
      processMateChests();                   // 队友捡到的宝箱由房主代开
      return;
    }
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

    // 玩家周围柔光:用缓存贴图(不再每帧建径向渐变),双色叠出柔和感
    var pls = CFG.GAME.W / 2 + (run.player.x - camX);
    var plt = CFG.GAME.H / 2 + (run.player.y - camY);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(SpriteGen.glow('#c0aeff'), pls - 190, plt - 190, 380, 380);
    ctx.globalAlpha = 1;

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

  // 主菜单飘落粒子:灰烬 + 零星血滴,营造黑暗血腥氛围
  var menuAsh = [];
  (function () {
    for (var i = 0; i < 42; i++) {
      menuAsh.push({
        x: Math.random() * CFG.GAME.W,
        y: Math.random() * CFG.GAME.H,
        v: 8 + Math.random() * 22,          // 下落速度
        drift: (Math.random() - 0.5) * 14,  // 横向飘
        s: 1 + Math.random() * 2.4,
        blood: Math.random() < 0.16,        // 少数是血滴
        a: 0.18 + Math.random() * 0.35,
        wob: Math.random() * 6.28
      });
    }
  })();
  function drawMenuAsh() {
    for (var i = 0; i < menuAsh.length; i++) {
      var a = menuAsh[i];
      a.y += a.v / 60;
      a.x += (a.drift + Math.sin(menuT * 1.3 + a.wob) * 8) / 60;
      a.wob += 0.03;
      if (a.y > CFG.GAME.H + 8) { a.y = -8; a.x = Math.random() * CFG.GAME.W; }
      if (a.x < -8) a.x = CFG.GAME.W + 8;
      if (a.x > CFG.GAME.W + 8) a.x = -8;
      ctx.globalAlpha = a.a;
      ctx.fillStyle = a.blood ? '#8a1420' : '#5a5650';
      ctx.fillRect(a.x | 0, a.y | 0, a.s, a.s);
    }
    ctx.globalAlpha = 1;
  }

  function renderMenuBg() {
    menuT += 1 / 60;
    var pal = CFG.MAPS[0].palette;
    drawGround(pal, menuT * 30, Math.sin(menuT * 0.1) * 40);
    drawDecor(CFG.MAPS[0], menuT * 30, Math.sin(menuT * 0.1) * 40, 0, null);
    drawMenuAsh();

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
  async function boot() {
    canvas = document.getElementById('game');
    canvas.width = CFG.GAME.W; canvas.height = CFG.GAME.H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    SpriteGen.init();
    var atlasReady = SpriteGen.loadAtlas();
    if (atlasReady) await atlasReady;
    Meta.load();
    var st = Meta.settings();
    if (st.uiScale) CFG.GAME.UI_SCALE = st.uiScale;   // 玩家保存的适配档位优先
    if (st.lang) window.L.setLang(st.lang);           // 玩家保存的语言优先
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
      onResume: function () {
        if (coop.on && Net.isClient()) {
          Net.toHost({ t: 'resumeReq' });
          return;
        }
        if (state === 'pause') togglePause();
      },
      onPauseToggle: togglePause,
      onGiveUp: function () {
        if (coop.on && Net.isClient()) {
          Net.toHost({ t: 'giveup' });
          return;
        }
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
        coop.active = true;
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
        coop.active = true;
        newRun(mine, m.mapId);
      },
      // 客户端:收到房主快照,重建世界并解出队友
      onSnap: function (m) {
        if (!run || !coop.on) return;
        try {
          Entities.applySnapshot(run, { t: m.ti, e: m.e, s: m.s, l: m.l, g: m.g, it: m.it, bh: m.bh, bi: m.bi });
          run.kills = m.kl || 0;
          run.gold = m.gd || 0;
          run.bossesKilled = m.bk || 0;
          run.freezeT = m.fz || 0;
          run.endless = !!m.en;
          if (m.bi) {
            run.boss = run.boss || {};
            run.boss.alive = m.bh > 0;
            run.boss.bossType = m.bi;
            run.boss.hp = m.bh;
            run.boss.maxHp = 1;
          } else {
            run.boss = null;
          }
          coop.remote = [];
          for (var i = 0; i < m.p.length; i++) {
            var ps = m.p[i];
            if (ps.id === coop.myId) {
              syncOwnPlayer(ps);
              continue;
            }
            coop.remote.push({
              name: ps.name, charId: ps.charId, x: ps.x, y: ps.y,
              face: ps.f, moving: !!ps.mv, hpPct: ps.hp,
              downed: !!ps.dn, reviveT: ps.rv, buffed: !!ps.bf
            });
          }
          Weapons.applyVisual(run, m.b || []);
        } catch (e) {
          console.error('[联机] 快照应用失败:', e);
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
        coop.active = false;
        coop.mates = [];
        if (run && state !== 'result') {
          run.over = true;
          run.victory = false;
          state = 'run';
        }
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
      // 客户端:收到房主为自己生成的独立升级选项
      onRemoteLevelUp: function (m) {
        if (!coop.on || !run) return;
        UI.remoteLevelUp(m.choices, function (opt, idx) {
          Net.toHost({ t: 'pickup', seq: m.seq, optIdx: idx });
        });
      },
      // 客户端:房主宣布本档升级已解决,隐藏悬浮卡
      onPickDone: function (m) { UI.hideCoopLevelUp(); },
      // 房主:客户端上报升级选择,代它应用到对应队友(选项按该队友的 Build 生成)
      onClientPick: function (peerId, optIdx, seq) {
        for (var i = 0; i < coop.mates.length; i++) {
          if (coop.mates[i].peerId !== peerId) continue;
          var mt = coop.mates[i];
          if (seq !== undefined && mt.luSeq !== seq) return;
          var opts = mt.luChoices;
          if (opts[optIdx]) applyChoiceFor(mt, opts[optIdx]);
          mt.luChoices = null;
          mt.pendingLevels = Math.max(0, (mt.pendingLevels || 0) - 1);
          mt.luOpen = false;
          Net.sendTo(peerId, { t: 'pickdone', seq: seq });
          if (mt.pendingLevels > 0) sendMateLevelUp(mt);
          return;
        }
      },
      // 房主:客户端申请暂停/恢复/放弃
      onHostCommand: function (peerId, m) {
        if (m.t === 'pauseReq' && state === 'run') togglePause();
        else if (m.t === 'resumeReq' && state === 'pause') togglePause();
        else if (m.t === 'giveup' && (state === 'run' || state === 'pause')) {
          UI.hidePause();
          run.over = true; run.victory = false;
          state = 'run';
        }
      },
      // 客户端:房主暂停/恢复
      onPauseSync: function (m) {
        if (!run || !coop.on) return;
        if (m.paused && state === 'run') {
          state = 'pause';
          UI.showPause(run);
        } else if (!m.paused && state === 'pause') {
          state = 'run';
          UI.hidePause();
        }
      },
      // 客户端:队友宝箱由房主代开的结果
      onChest: function (m) {
        if (!run || !coop.on) return;
        UI.showChest(m.results || [], function () {});
      },
      // 客户端:房主宣布本局结束
      onOver: function (m) {
        clientEndRun(m);
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
    state: function () { return state; },
    coop: function () { return coop; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
