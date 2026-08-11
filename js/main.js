// main.js — 状态机 / 渲染编排 / 启动
(function () {
  'use strict';
  var E = Engine;
  var canvas, ctx;
  var state = 'intro'; // intro | menu | run | levelup | chest | pause | result
  var run = null;
  var vignette = null;
  var menuBgImg = null;
  var atlasPending = false;
  var achvTimer = 0;
  var dpsTimer = 0, lastDmg = 0;
  var worldZoom = 1;

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
    if (atlasPending) {
      // 图集仍在后台加载:先记录跳过意图,加载完成后再切菜单,避免提前触发整套程序素材生成。
      introSkipped = true;
      return;
    }
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
    // 图集后台加载期间先不绘制精灵行,避免触发整套程序素材生成导致卡顿。
    if (!atlasPending) {
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
        var hFrames = SpriteGen.frames(heroRow[hi]);
        var himg = hFrames[Math.floor(introT * 6 + hi * 0.35) % hFrames.length];
        var hw = heroRow[hi].indexOf('char_') === 0 ? 38 : 26;
        ctx.globalAlpha = 1;   // 透明度拉到最高,不若隐若现
        ctx.drawImage(himg, hx - hw / 2, hy - hw / 2, hw, hw);
      }
      ctx.globalAlpha = 1;
    }

    // 中央题字(放大,两行)
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px "Fusion Pixel","SimSun",monospace';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText('天庭制作组', W / 2, H / 2 - 38);
    ctx.fillStyle = '#ffd76b';
    ctx.fillText('天庭制作组', W / 2, H / 2 - 38);
    ctx.font = 'bold 30px "Fusion Pixel","SimSun",monospace';
    ctx.lineWidth = 7;
    ctx.strokeText('倾心呈现', W / 2, H / 2 + 24);
    ctx.fillStyle = '#fff3c8';
    ctx.fillText('倾心呈现', W / 2, H / 2 + 24);
    ctx.font = '20px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText('特别鸣谢:SOTA Model', W / 2, H / 2 + 68);
    ctx.fillStyle = '#cfe6ff';
    ctx.fillText('特别鸣谢:SOTA Model', W / 2, H / 2 + 68);

    if (!atlasPending) {
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
    }

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
  // 视野裁剪半径:客户端视口 960×540,半对角约 551。取 700 留出足够余量,
  // 保证屏幕边缘刚要进入视野的实体已经在快照里(不会"凭空出现")。
  var SNAP_VIEW_R = 700;

  // 按接收方视野裁剪的快照。
  // 之前是无条件全量广播:满载 400 怪时单帧 68KB,15Hz 下达 8Mbps/客户端,
  // 远超 WebRTC DataChannel 的实际吞吐,数据在发送队列积压,客户端收到的
  // 全是过期快照 —— 这正是"联机卡顿掉帧"的根因。
  // 地图 4800×4800 而视口只有 960×540(约 1/25),裁掉视野外的实体能把
  // 带宽压到原来的很小一部分,且客户端本来也渲染不到它们。
  // viewX/viewY 传 null 时退化为全量(用于单机自检或调试)。
  function buildSnapshot(viewX, viewY) {
    var pool = Entities.pool, i, e;
    var clip = (viewX !== null && viewX !== undefined);
    var R2 = SNAP_VIEW_R * SNAP_VIEW_R;
    // 用方框预筛再比平方距离:避免对 400 个实体做 hypot
    function inView(x, y) {
      if (!clip) return true;
      var dx = x - viewX, dy = y - viewY;
      if (dx > SNAP_VIEW_R || dx < -SNAP_VIEW_R || dy > SNAP_VIEW_R || dy < -SNAP_VIEW_R) return false;
      return dx * dx + dy * dy <= R2;
    }
    var es = [];
    for (i = 0; i < pool.length; i++) {
      e = pool[i];
      if (!e.alive) continue;
      // Boss 与精英始终下发:Boss 要画屏幕下方血条,两者都要出现在客户端小地图上
      // (minimap 只标记 boss/elite)。它们同时存活数极少,全量下发的代价可忽略。
      if (!e.boss && !e.elite && !inView(e.x, e.y)) continue;
      es.push({
        u: e.uid, i: e.id, x: Math.round(e.x), y: Math.round(e.y),
        h: Math.round(e.hp), m: Math.round(e.maxHp),
        el: e.elite ? 1 : 0, f: e.face,
        g: e.guard > 0 ? +e.guard.toFixed(2) : 0,
        b: e.burrowT > 0 ? +e.burrowT.toFixed(2) : 0,
        bf: e.buffed ? 1 : 0, ph: e.phase2 ? 1 : 0, er: e.eyeRole || ''
      });
    }
    var shots = Entities.getShots(), ss = [];
    for (i = 0; i < shots.length; i++) {
      if (!shots[i].alive) continue;
      if (!inView(shots[i].x, shots[i].y)) continue;
      ss.push({
        x: Math.round(shots[i].x), y: Math.round(shots[i].y),
        vx: Math.round(shots[i].vx), vy: Math.round(shots[i].vy),
        w: shots[i].webType ? 1 : 0, c: shots[i].col || 0, z: shots[i].size || 16
      });
    }
    var lobs = Entities.getLobs(), ls = [];
    for (i = 0; i < lobs.length; i++) {
      if (!lobs[i].alive) continue;
      if (!inView(lobs[i].tx, lobs[i].ty)) continue;
      ls.push({ x: Math.round(lobs[i].tx), y: Math.round(lobs[i].ty),
                r: lobs[i].r, t: +lobs[i].t.toFixed(2), d: lobs[i].dur });
    }
    var gems = Entities.getGems(), gs = [];
    for (i = 0; i < gems.length; i++) {
      if (!gems[i].alive) continue;
      if (!inView(gems[i].x, gems[i].y)) continue;
      gs.push({ x: Math.round(gems[i].x), y: Math.round(gems[i].y), v: gems[i].v });
    }
    var items = Entities.getItems(), its = [];
    for (i = 0; i < items.length; i++) {
      if (!items[i].alive) continue;
      // 掉落物(宝箱/道具)全量下发:数量少,且客户端要在小地图上看到远处宝箱
      its.push({ k: items[i].type, x: Math.round(items[i].x), y: Math.round(items[i].y) });
    }
    // 玩家弹幕:客户端需要看到所有参战者的投射物
    var wbs = Weapons.getBullets(), bs = [];
    for (i = 0; i < wbs.length; i++) {
      var wb = wbs[i];
      if (!wb.alive) continue;
      if (!inView(wb.x, wb.y)) continue;
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
      f: run.player.face, d: run.player.dir, mv: run.player.moving ? 1 : 0, at: run.player.attackAnimT > 0 ? 1 : 0,
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
        f: mp.face, d: mp.dir, mv: mp.moving ? 1 : 0, at: mp.attackAnimT > 0 ? 1 : 0,
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
      bh: run.boss && run.boss.alive ? +((run.bossBarHp !== null && run.bossBarHp !== undefined ? run.bossBarHp : run.boss.hp) /
        (run.bossBarMax || run.boss.maxHp)).toFixed(3) : -1,
      bi: run.boss && run.boss.alive ? run.boss.bossType : '',
      bn: run.bossBarName || '',
      kl: run.kills, gd: run.gold, bk: run.bossesKilled,
      fz: +(run.freezeT || 0).toFixed(2), en: run.endless ? 1 : 0,
      // 大门属于共享战场状态：客户端要能绘制它并知道何时显示触屏撤离入口。
      eg: run.exitGate ? { x: Math.round(run.exitGate.x), y: Math.round(run.exitGate.y), o: run.exitGate.open ? 1 : 0, u: run.exitGate.used ? 1 : 0 } : null
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
        if (Math.abs(iv.x) > Math.abs(iv.y)) p.dir = iv.x >= 0 ? 'right' : 'left';
        else p.dir = iv.y >= 0 ? 'down' : 'up';
        if (iv.x > 0.01) p.face = 1; else if (iv.x < -0.01) p.face = -1;
        p.animT += dt;
      }
      var R = CFG.GAME.MAP_R;
      p.x = E.clamp(p.x, -R, R); p.y = E.clamp(p.y, -R, R);
      if (p.iframe > 0) p.iframe -= dt;
      if (p.attackAnimT > 0) {
        p.attackAnimT = Math.max(0, p.attackAnimT - dt);
        p.attackAnimAge += dt;
      }
      if (s.regen > 0 && p.hp < s.hp) p.hp = Math.min(s.hp, p.hp + s.regen * dt);
      // 队友的武器由房主代跑
      Weapons.updateFor(run, p, m.weapons, dt);
      // 队友倒地判定
      if (p.hp <= 0 && !m.downed) {
        if (p.stats && p.stats.revive - (p.revivesUsed || 0) > 0) {
          p.revivesUsed++;
          p.hp = p.stats.hp * 0.5;
          p.iframe = 2.5;
          FX.levelBeam(p.x, p.y);
          FX.ring(p.x, p.y, { r: 120, color: '#ffd76b', life: 0.6, width: 4 });
          AudioSys.play('levelup');
          Entities.bombBlast(run, 150, p.x, p.y);
        } else {
          // ⚠ 必须同时置 p.downed:这里原先只设了 m.downed,漏掉玩家实体上的标记。
          // 后果是倒地的队友在 applyCoopAuras 里仍被当作有效光环源,
          // 也可能被 nearestAlivePlayer 当成能救人的存活者。
          // 走 Entities.markTeamDowned 统一处理(它同时置 p.downed / p.reviveT /
          // w.downed / w.reviveT 并做全员倒地判定),避免两份实现再次走偏。
          Entities.markTeamDowned(run, m);
          FX.ring(p.x, p.y, { r: 50, color: '#ff5964', life: 0.6, width: 3 });
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
        face: p.face, dir: p.dir, moving: p.moving, attacking: p.attackAnimT > 0,
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
    R = CFG.GAME.MAP_R - 220;
    vaults = [];
    for (var i = 0; i < 7; i++) {
      var x, y, tries = 0;
      do { x = (Math.random() * 2 - 1) * R; y = (Math.random() * 2 - 1) * R; tries++; }
      while (tries < 40 && (Math.hypot(x, y) < 360 || vaults.some(function (v) { return E.dist2(x, y, v.x, v.y) < 360 * 360; })));
      vaults.push({ x: x, y: y, gold: 24 + Math.floor(Math.random() * 24), alive: true });
    }
  }
  function updateVaults(run, dt) {
    for (var i = 0; i < vaults.length; i++) {
      var v = vaults[i];
      if (!v.alive) continue;
      // 金币随时间增长:每 60 秒 +20,上限 100
      // 任意参战玩家走到宝箱旁都能拾取
      var ents = run.coopPlayers || [{ player: run.player, downed: false }];
      var got = false;
      for (var ei = 0; ei < ents.length && !got; ei++) {
        var w = ents[ei];
        if (w.downed || w.player.hp <= 0) continue;
        if (E.dist2(w.player.x, w.player.y, v.x, v.y) < 40 * 40) got = true;
      }
      if (got) {
        var g = v.gold;
        run.gold += g;
        Meta.track('gold', g);
        FX.burst(v.x, v.y, { color: '#ffd76b', n: 14, speed: 110, life: 0.5, size: 2 });
        FX.ring(v.x, v.y, { r: 34, color: '#ffd76b', life: 0.4, width: 3 });
        AudioSys.play('coin');
        // 重置累积
        v.alive = false;
        if (Math.random() < 0.55) {
          var loot = Weapons.chestLoot(run);
          if (loot.length && run.cb && run.cb.onWarn) run.cb.onWarn('遗失宝箱：' + loot[0].name);
        }
      }
    }
  }
  // 四角金库绘制(世界坐标版本,在 translate 块内调用;宝箱本身)
  function drawVaults(ctx, run) {
    for (var i = 0; i < vaults.length; i++) {
      var v = vaults[i];
      if (!v.alive) continue;
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
      ctx.drawImage(cimg, sx - 24, sy - 24 + bob, 48, 48);
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
    if (window.UI && UI.setTestMode) UI.setTestMode(false);

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
    // 联机:给每个队友补上他们的初始武器(之前是空的,导致非主机打不了怪)
    if (coop.on && Net.isHost()) {
      for (var mi = 0; mi < coop.mates.length; mi++) {
        var mt0 = coop.mates[mi];
        if (!mt0.weapons || !mt0.weapons.length) {
          var mcd = null;
          for (var mci = 0; mci < CFG.CHARS.length; mci++) if (CFG.CHARS[mci].id === mt0.charId) mcd = CFG.CHARS[mci];
          if (mcd) {
            // ⚠ run.banished 必须一起存档并在 finally 里恢复:
            // 漏掉它会让房主的丢弃列表被最后一个队友的 Set 顶替(引用泄漏)。
            var sP = run.player, sW = run.weapons, sPs = run.passives, sB = run.banished;
            run.player = mt0.player; run.weapons = mt0.weapons; run.passives = mt0.passives;
            run.banished = mt0.banished || run.banished;
            try { Weapons.addWeapon(run, mcd.weapon); }
            finally { run.player = sP; run.weapons = sW; run.passives = sPs; run.banished = sB; }
          }
        }
      }
    }
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

  // 素材测试场不是静态图鉴：这里集中处理右侧控制台的逐项投放，
  // 让每一把武器、每种掉落和每个怪物都能在真实渲染/碰撞/动画里验收。
  function startArtTest() {
    newRun('knight', CFG.MAPS[0].id);
    run.testMode = true;
    run.gold = 9999;
    Entities.clearEnemies(run);
    UI.setTestMode(true);
    UI.toastText('素材测试场：不会自动刷怪；右侧可逐项生成、满级和进化。');
  }

  function testSpawnPoint(radius) {
    var n = run.testSpawnIdx || 0;
    run.testSpawnIdx = n + 1;
    var a = n * 2.3999632297; // 黄金角：重复投放也不会堆在同一个点
    return {
      x: run.player.x + Math.cos(a) * radius,
      y: run.player.y + Math.sin(a) * radius
    };
  }

  function applyTestAction(action) {
    if (!run || !run.testMode) return false;
    if (action === 'clear') { Entities.clearEnemies(run); run.boss = null; return true; }
    if (action === 'heal') { run.player.hp = run.player.stats.hp; return true; }
    if (action === 'enemies') {
      var ids = Object.keys(CFG.ENEMIES), rr = 260;
      for (var ei = 0; ei < ids.length; ei++) {
        var ea = Math.PI * 2 * ei / ids.length;
        Entities.spawnEnemy(run, ids[ei], run.player.x + Math.cos(ea) * rr, run.player.y + Math.sin(ea) * rr, { allowNear: true });
      }
      return true;
    }
    if (action === 'boss') {
      var bs = Object.keys(CFG.BOSSES), bid = bs[(run.testBossIdx || 0) % bs.length];
      run.testBossIdx = (run.testBossIdx || 0) + 1;
      var bp = testSpawnPoint(310);
      var be = Entities.spawnEnemy(run, bid, bp.x, bp.y, { allowNear: true });
      if (be) { run.boss = be; UI.bossBanner(CFG.BOSSES[bid]); }
      return !!be;
    }
    if (action === 'weapons') {
      Object.keys(CFG.WEAPONS).forEach(function (id) { if (!Weapons.findWeapon(run, id)) Weapons.addWeapon(run, id); });
      return true;
    }
    if (action === 'ultimate') {
      Object.keys(CFG.PASSIVES).forEach(function (id) { run.passives[id] = CFG.PASSIVES[id].maxLv; });
      run.weapons.forEach(function (w) { w.lv = CFG.WEAPONS[w.id].lv.length + 1; w.evolved = true; w.evoId = CFG.WEAPONS[w.id].evo; });
      Entities.recomputeStats(run);
      run.player.hp = Math.min(run.player.hp, run.player.stats.hp);
      return true;
    }
    if (!action || typeof action !== 'object' || !action.type) return false;

    var id = action.id, def, w, pt, maxLv;
    if (action.type === 'weapon') {
      def = CFG.WEAPONS[id]; if (!def) return false;
      w = Weapons.findWeapon(run, id);
      if (!w) Weapons.addWeapon(run, id);
      else w.lv = Math.min(def.lv.length + 1, w.lv + 1);
      return true;
    }
    if (action.type === 'ultimateWeapon') {
      def = CFG.WEAPONS[id]; if (!def) return false;
      w = Weapons.findWeapon(run, id);
      if (!w) { Weapons.addWeapon(run, id); w = Weapons.findWeapon(run, id); }
      maxLv = def.lv.length + 1;
      w.lv = maxLv;
      if (def.evoNeed && CFG.PASSIVES[def.evoNeed]) run.passives[def.evoNeed] = CFG.PASSIVES[def.evoNeed].maxLv;
      if (!w.evolved) Weapons.evolveWeapon(run, w);
      Entities.recomputeStats(run);
      run.player.hp = Math.min(run.player.hp, run.player.stats.hp);
      return true;
    }
    if (action.type === 'passive') {
      def = CFG.PASSIVES[id]; if (!def) return false;
      run.passives[id] = def.maxLv;
      Entities.recomputeStats(run);
      run.player.hp = Math.min(run.player.hp, run.player.stats.hp);
      return true;
    }
    if (action.type === 'item') {
      pt = testSpawnPoint(76);
      return !!Entities.spawnItem(run, id, pt.x, pt.y);
    }
    if (action.type === 'enemy') {
      if (!CFG.ENEMIES[id]) return false;
      pt = testSpawnPoint(270);
      return !!Entities.spawnEnemy(run, id, pt.x, pt.y, { allowNear: true });
    }
    if (action.type === 'testBoss') {
      if (!CFG.BOSSES[id]) return false;
      pt = testSpawnPoint(320);
      var boss = Entities.spawnEnemy(run, id, pt.x, pt.y, { allowNear: true });
      if (boss) { run.boss = boss; UI.bossBanner(CFG.BOSSES[id]); }
      return !!boss;
    }
    return false;
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
      var overMsg = {
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
      };
      // over 属于 Net 的关键消息类型,已由应用层 ACK 保证送达
      // (带序号重发直到对端确认,收端去重),不再需要盲发多次。
      Net.broadcast(overMsg);
    }
    Net.setInRun(false);   // 回到结算/大厅:此后掉线直接移除,不再保留占位
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
    p.netFace = ps.f || 1; p.netDir = ps.d || 'down'; p.netMoving = !!ps.mv; p.netAttacking = !!ps.at;
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

  function requestExitGate() {
    if (state !== 'run' || !run) return false;
    if (coop.on && Net.isClient()) {
      Net.toHost({ t: 'exitGate' });
      return true;
    }
    return Entities.tryExitGate(run, run.player);
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
        cp.dir = cp.netDir || cp.dir || 'down';
        cp.moving = !!cp.netMoving;
        cp.attackAnimT = cp.netAttacking ? 0.12 : 0;
        if (cp.netAttacking) cp.attackAnimAge += dt;
      }
      if (cp.iframe > 0) cp.iframe -= dt;
      if (cp.hurtFlash > 0) cp.hurtFlash -= dt;
      // 相机跟随自己的权威位置
      E.cam.x = E.lerp(E.cam.x, cp.x, 1 - Math.pow(0.001, dt));
      E.cam.y = E.lerp(E.cam.y, cp.y, 1 - Math.pow(0.001, dt));
      var cmX = Math.max(0, CFG.GAME.MAP_R - CFG.GAME.W / 2);
      var cmY = Math.max(0, CFG.GAME.MAP_R - CFG.GAME.H / 2);
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
    if (!run.testMode) Entities.director(run, dt);

    // 房主:定频给每个客户端发送按其视野裁剪的快照。
    // 逐客户端定制而非统一广播,是因为每人视野不同;裁剪后带宽大幅下降,
    // 避免 DataChannel 队列积压导致的"收到的全是过期快照"式卡顿。
    if (coop.on && Net.isHost()) {
      coop.snapAcc += dt;
      if (coop.snapAcc >= 1 / Net.SNAP_HZ) {
        coop.snapAcc = 0;
        for (var si = 0; si < coop.mates.length; si++) {
          var sm = coop.mates[si];
          if (!sm.player) continue;
          // sendSnap 带背压保护:该连接积压过多时丢弃本帧,
          // 避免旧快照排队造成延迟雪崩(快照是幂等的,丢一帧不影响正确性)
          Net.sendSnap(sm.peerId, buildSnapshot(sm.player.x, sm.player.y));
        }
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

  var groundPatterns = {};
  function terrainArtId(mapId) {
    return mapId === 'graveyard' ? 'grave' : (mapId === 'wilds' ? 'wild' : 'abyss');
  }
  function groundPattern(name) {
    if (groundPatterns[name]) return groundPatterns[name];
    var tile = SpriteGen.get(name);
    if (!tile || tile.width < 2) return null;
    // 2×2 镜像拼接消除大块纹理四边的接缝，同时保持最近邻硬像素。
    var patternTile = document.createElement('canvas');
    var tw = tile.width, th = tile.height;
    patternTile.width = tw * 2; patternTile.height = th * 2;
    var pg = patternTile.getContext('2d');
    pg.imageSmoothingEnabled = false;
    pg.drawImage(tile, 0, 0);
    pg.save(); pg.translate(tw * 2, 0); pg.scale(-1, 1); pg.drawImage(tile, 0, 0); pg.restore();
    pg.save(); pg.translate(0, th * 2); pg.scale(1, -1); pg.drawImage(tile, 0, 0); pg.restore();
    pg.save(); pg.translate(tw * 2, th * 2); pg.scale(-1, -1); pg.drawImage(tile, 0, 0); pg.restore();
    groundPatterns[name] = ctx.createPattern(patternTile, 'repeat');
    return groundPatterns[name];
  }

  function drawGround(map, camX, camY) {
    var pal = map.palette;
    var W = CFG.GAME.W, H = CFG.GAME.H;
    var viewW = W / worldZoom, viewH = H / worldZoom;
    var art = terrainArtId(map.id);
    var basePattern = groundPattern('terrain_' + art + '_ground');
    ctx.fillStyle = basePattern || pal.ground;
    ctx.save();
    ctx.translate((W / 2 - camX) | 0, (H / 2 - camY) | 0);
    ctx.fillRect((camX - viewW / 2 - 260) | 0, (camY - viewH / 2 - 260) | 0, viewW + 520, viewH + 520);
    ctx.restore();

    drawTerrainFeatures(map, camX, camY);

    // 少量世界坐标碎石打破大纹理规律；密度受控，避免此前“满地噪点”的脏感。
    var cell = 72;
    var x0 = Math.floor((camX - viewW / 2) / cell) - 1, x1 = Math.floor((camX + viewW / 2) / cell) + 1;
    var y0 = Math.floor((camY - viewH / 2) / cell) - 1, y1 = Math.floor((camY + viewH / 2) / cell) + 1;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var hsh = E.hash2(cx, cy);
        if (hsh >= 0.22) continue;
        var px = cx * cell - camX + W / 2 + (hsh * 991 % 1) * 48;
        var py = cy * cell - camY + H / 2 + (hsh * 577 % 1) * 48;
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = pal.decor;
        ctx.fillRect(px | 0, py | 0, hsh < 0.06 ? 3 : 2, hsh < 0.06 ? 3 : 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 世界坐标稳定的道路/草地/泥地/沼泽层。大轮廓先画,碎纹理后画,
  // 镜头移动时不会出现屏幕空间纹理游移或方格闪烁。
  function drawTerrainFeatures(map, camX, camY) {
    var W = CFG.GAME.W, H = CFG.GAME.H, R = CFG.GAME.MAP_R;
    var viewW = W / worldZoom, viewH = H / worldZoom;
    var seed = map.id === 'graveyard' ? 0.8 : (map.id === 'wilds' ? 2.4 : 4.1);
    var art = terrainArtId(map.id);
    var roadPattern = groundPattern('terrain_' + art + '_road');
    var regionPattern = groundPattern('terrain_' + art + '_' + (map.id === 'graveyard' ? 'swamp' : (map.id === 'wilds' ? 'grass' : 'water')));
    var road = map.id === 'graveyard' ? '#3a302c' : (map.id === 'wilds' ? '#4a3522' : '#242a3f');
    var roadEdge = map.id === 'graveyard' ? '#18151d' : (map.id === 'wilds' ? '#21170f' : '#0d1122');
    ctx.save();
    ctx.translate(W / 2 - camX, H / 2 - camY);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    function roadPath(vertical) {
      ctx.beginPath();
      for (var v = -R - 120; v <= R + 120; v += 72) {
        var bend = E.roadBend ? E.roadBend(v, seed) : Math.sin(v * 0.0017 + seed) * 145 + Math.sin(v * 0.0041 + seed * 2) * 28;
        if (vertical) {
          if (v === -R - 120) ctx.moveTo(bend, v); else ctx.lineTo(bend, v);
        } else {
          if (v === -R - 120) ctx.moveTo(v, bend); else ctx.lineTo(v, bend);
        }
      }
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = roadEdge; ctx.lineWidth = map.id === 'wilds' ? 92 : 78;
    roadPath(false); ctx.stroke();
    ctx.strokeStyle = roadPattern || road; ctx.lineWidth = map.id === 'wilds' ? 72 : 60;
    roadPath(false); ctx.stroke();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = roadEdge; ctx.lineWidth = 54;
    roadPath(true); ctx.stroke();
    ctx.strokeStyle = roadPattern || road; ctx.lineWidth = 38;
    roadPath(true); ctx.stroke();
    ctx.restore();

    // 地貌斑块:荒野以枯草为主,墓园有泥地/浅沼,深渊是冷色黑水。
    var region = 260;
    var rx0 = Math.floor((camX - viewW / 2) / region) - 1;
    var rx1 = Math.floor((camX + viewW / 2) / region) + 1;
    var ry0 = Math.floor((camY - viewH / 2) / region) - 1;
    var ry1 = Math.floor((camY + viewH / 2) / region) + 1;
    for (var ry = ry0; ry <= ry1; ry++) {
      for (var rx = rx0; rx <= rx1; rx++) {
        var rh = E.hash2(rx * 61 + map.id.length * 13, ry * 67 - map.id.length * 7);
        if (rh < 0.53) continue;
        var wx = rx * region + 34 + E.hash2(rx * 73, ry * 79) * 190;
        var wy = ry * region + 28 + E.hash2(rx * 83, ry * 89) * 194;
        var sx = wx - camX + W / 2, sy = wy - camY + H / 2;
        var rw = 116 + E.hash2(rx * 97, ry * 101) * 152;
        var rhh = 48 + E.hash2(rx * 103, ry * 107) * 72;
        // 阈值与 engine.terrainEffect 共用同一常量:沼泽数量更少、单个更大,
        // 且视觉水坑与"进水才减速"的判定始终对齐。
        var wet = map.id !== 'wilds' && rh > E.SWAMP_THRESHOLD;
        // 墓园沼泽用固定的泥边水坑精灵，而不是随缩放变形的程序椭圆；
        // 世界坐标由 rx/ry 决定，镜头移动时水坑不会游移。
        if (wet && map.id === 'graveyard') {
          var puddleId = 'terrain_grave_swamp_puddle' + (1 + Math.floor(E.hash2(rx * 109, ry * 113) * 4));
          var puddle = SpriteGen.get(puddleId);
          // 数量减少后单个做大(约 1.5x),整体沼泽覆盖感不减但更成片、更像大水洼
          var pw = 372 + Math.floor(E.hash2(rx * 127, ry * 131) * 174);
          var ph = 225 + Math.floor(E.hash2(rx * 137, ry * 139) * 102);
          ctx.globalAlpha = 0.94;
          ctx.drawImage(puddle, (sx - pw / 2) | 0, (sy - ph / 2) | 0, pw, ph);
        } else {
          ctx.globalAlpha = wet ? 0.62 : 0.32;
          ctx.fillStyle = regionPattern || (wet ? (map.id === 'abyss' ? '#101b2d' : '#26342a')
                              : (map.id === 'wilds' ? '#4a4724' : map.palette.ground2));
          ctx.beginPath(); ctx.ellipse(sx | 0, sy | 0, rw, rhh, rh * Math.PI, 0, Math.PI * 2); ctx.fill();
        }
        if (wet && map.id !== 'graveyard') {
          ctx.globalAlpha = 0.32;
          ctx.strokeStyle = map.id === 'abyss' ? '#4e658d' : '#637559';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sx | 0, sy | 0, rw * 0.72, rhh * 0.46, rh * Math.PI, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.globalAlpha = 0.58;
          ctx.fillStyle = map.id === 'wilds' ? '#77713a' : map.palette.decor;
          for (var blade = -2; blade <= 2; blade++) {
            var gx = (sx + blade * 7) | 0, gy = (sy + ((blade * blade) % 3) * 2) | 0;
            ctx.fillRect(gx, gy - 5 - Math.abs(blade), 2, 6 + Math.abs(blade));
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // 立体装饰(有体积、能与角色互相遮挡) vs 贴地装饰(纯地面痕迹,永远画在角色下面)。
  // 判定依据是"物件在世界里是否明显高于地面":
  //   立体:树/墓碑/栅栏/骨桩/石柱/钟乳石/路标/水晶/树桩/倒木/芦苇丛
  //   贴地:石板、车辙、苔痕、睡莲、骸骨、蘑菇、灌木、符文地纹等
  // 分错会有两种可感知的错误:把地面石板当立体 → 角色被石板挡住;
  // 把树桩当贴地 → 角色从树桩"上面"穿过去。
  var TALL_DECOR = {
    deco_grave: 1, deco_fence: 1, deco_skullpost: 1, deco_pillar: 1,
    deco_stalag: 1, deco_road_marker: 1, deco_crystal: 1,
    deco_deadstump: 1, deco_fallenlog: 1,
    deco_burned_cottage: 1, deco_broken_wagon: 1, deco_broken_sword: 1,
    deco_swamp_reeds: 1, deco_deadreeds: 1, deco_abyss_coral: 1
  };
  function isTallDecor(name) {
    // 所有 tree 系一律立体
    if (name.indexOf('tree') >= 0) return true;
    return !!TALL_DECOR[name];
  }

  // 装饰物按基座 y 排序绘制:pass='back' 画角色身后的,pass='front' 画角色身前的,
  // 这样墓碑/枯树能正确遮挡走到它后面的角色。refY 传玩家世界 y。
  function drawDecor(map, camX, camY, refY, pass) {
    var minX = camX - CFG.GAME.W / worldZoom / 2 - 80, maxX = camX + CFG.GAME.W / worldZoom / 2 + 80;
    var minY = camY - CFG.GAME.H / worldZoom / 2 - 100, maxY = camY + CFG.GAME.H / worldZoom / 2 + 60;
    var ordered = [];
    E.forEachDecor(map, minX, minY, maxX, maxY, function (d) { ordered.push(d); });
    // 同一层的物件也严格按落脚点排序，避免遍历格子的顺序造成装饰互相跳层。
    ordered.sort(function (a, b) { return a.y === b.y ? a.x - b.x : a.y - b.y; });
    ordered.forEach(function (d) {
          var wx = d.x, wy = d.y, name = d.name;
          if (pass === 'back' && wy > refY) return;
          if (pass === 'front' && wy <= refY) return;
          var tall = isTallDecor(name);
          if (pass === 'ground' && tall) return;
          if ((pass === 'back' || pass === 'front') && !tall) return;
          var img = SpriteGen.get(name);
          var sx = wx - camX + CFG.GAME.W / 2;
          var sy = wy - camY + CFG.GAME.H / 2;
          // V3 props carry an explicit logical render scale.  Honour it here so
          // large source cells keep their detail without becoming screen-sized.
          var decorScale = SpriteGen.renderScale ? SpriteGen.renderScale(name) : 1;
          var dw = img.width * 2 * decorScale, dh = img.height * 2 * decorScale;
          // 贴地投影:让装饰物落在地面上而不是浮空
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(sx | 0, sy | 0, dw * 0.36, dh * 0.10, 0, 0, Math.PI * 2);
          ctx.fill();
          // 根部与地面之间叠一层固定的泥尘过渡，避免立体装饰像被硬切断。
          ctx.globalAlpha = 0.22;
          var rootGlow = ctx.createRadialGradient(sx | 0, sy | 0, 2, sx | 0, sy | 0, Math.max(12, dw * 0.46));
          rootGlow.addColorStop(0, 'rgba(35,27,20,.92)'); rootGlow.addColorStop(1, 'rgba(35,27,20,0)');
          ctx.fillStyle = rootGlow;
          ctx.beginPath(); ctx.ellipse(sx | 0, sy | 0, Math.max(12, dw * 0.46), Math.max(5, dh * 0.10), 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(img, (sx - dw / 2) | 0, (sy - dh) | 0, dw, dh);
          ctx.globalAlpha = 1;
    });
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

  // 静止的铸铁边界。没有时间变量、流动纹路或闪烁，镜头会精确停在此处。
  function drawBoundary(run) {
    var R = CFG.GAME.MAP_R;
    var pal = run.map.palette;
    var fog = pal.fog || '#0b0812';
    var rgb = hexToRgb(fog), OUT = 2200;
    ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.94)';
    ctx.fillRect(-R - OUT, -R - OUT, OUT, (R + OUT) * 2);
    ctx.fillRect(R, -R - OUT, OUT, (R + OUT) * 2);
    ctx.fillRect(-R, -R - OUT, R * 2, OUT);
    ctx.fillRect(-R, R, R * 2, OUT);
    ctx.globalAlpha = 0.94;
    ctx.strokeStyle = '#171319'; ctx.lineWidth = 14;
    ctx.strokeRect(-R, -R, R * 2, R * 2);
    ctx.strokeStyle = '#6d5435'; ctx.lineWidth = 3;
    ctx.strokeRect(-R + 6, -R + 6, R * 2 - 12, R * 2 - 12);
    ctx.strokeStyle = '#2b1a1c'; ctx.lineWidth = 2;
    ctx.strokeRect(-R + 11, -R + 11, R * 2 - 22, R * 2 - 22);
    ctx.globalAlpha = 1;
  }

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 11, g: 8, b: 18 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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

    // The complete world uses one camera transform.  Terrain and decor used
    // to be painted before it, making zoom shrink actors while the map stayed
    // frozen; this now behaves as a true Terraria-style view zoom.
    ctx.save();
    ctx.translate(CFG.GAME.W / 2, CFG.GAME.H / 2);
    ctx.scale(worldZoom, worldZoom);
    ctx.translate(-CFG.GAME.W / 2, -CFG.GAME.H / 2);
    drawGround(run.map, camX, camY);
    // 低矮装饰永远处于地表层,不会错误覆盖角色脚部或弹幕。
    drawDecor(run.map, camX, camY, run.player.y, 'ground');
    // 角色背后的装饰物(y 小于玩家)
    drawDecor(run.map, camX, camY, run.player.y, 'back');
    ctx.restore();

    ctx.save();
    ctx.translate(CFG.GAME.W / 2, CFG.GAME.H / 2);
    ctx.scale(worldZoom, worldZoom);
    ctx.translate(-CFG.GAME.W / 2, -CFG.GAME.H / 2);
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
    Merchant.drawProjectiles(ctx, run);
    ctx.restore();

    ctx.save();
    ctx.translate(CFG.GAME.W / 2, CFG.GAME.H / 2);
    ctx.scale(worldZoom, worldZoom);
    ctx.translate(-CFG.GAME.W / 2, -CFG.GAME.H / 2);
    ctx.translate(CFG.GAME.W / 2 - camX, CFG.GAME.H / 2 - camY);
    Weapons.draw(ctx, run);
    FX.draw(ctx);
    ctx.restore();

    // 玩家周围柔光:用缓存贴图(不再每帧建径向渐变),双色叠出柔和感
    var pls = CFG.GAME.W / 2 + (run.player.x - camX);
    var plt = CFG.GAME.H / 2 + (run.player.y - camY);
    var auraW = Weapons.findWeapon(run, 'holyaura');
    var glowCol = auraW ? (auraW.evolved ? '#ffefb0' : '#ffd76b') : '#c0aeff';
    ctx.save();
    ctx.translate(CFG.GAME.W / 2, CFG.GAME.H / 2);
    ctx.scale(worldZoom, worldZoom);
    ctx.translate(-CFG.GAME.W / 2, -CFG.GAME.H / 2);
    ctx.globalAlpha = auraW ? 0.42 : 0.28;
    ctx.drawImage(SpriteGen.glow(glowCol), pls - 190, plt - 190, 380, 380);
    ctx.globalAlpha = 1;
    ctx.restore();

    // 高大前景在角色、武器和角色光晕之后绘制,树干可正确遮挡从其后方经过的实体。
    ctx.save();
    ctx.translate(CFG.GAME.W / 2, CFG.GAME.H / 2);
    ctx.scale(worldZoom, worldZoom);
    ctx.translate(-CFG.GAME.W / 2, -CFG.GAME.H / 2);
    drawDecor(run.map, camX, camY, run.player.y, 'front');
    ctx.restore();

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
    if (menuBgImg && menuBgImg.width) {
      var cropH = menuBgImg.width * CFG.GAME.H / CFG.GAME.W;
      var cropY = Math.max(0, (menuBgImg.height - cropH) * 0.44);
      ctx.drawImage(menuBgImg, 0, cropY, menuBgImg.width, cropH, 0, 0, CFG.GAME.W, CFG.GAME.H);
      ctx.fillStyle = 'rgba(8,3,18,0.20)';
      ctx.fillRect(0, 0, CFG.GAME.W, CFG.GAME.H);
    } else {
      drawGround(CFG.MAPS[0], menuT * 30, Math.sin(menuT * 0.1) * 40);
      drawDecor(CFG.MAPS[0], menuT * 30, Math.sin(menuT * 0.1) * 40, 0, null);
    }
    drawMenuAsh();

    // 顶部角色行:放到标题下方的独立展示带,保持完全不透明。
    var chars = ['char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono'];
    for (var ci = 0; ci < chars.length; ci++) {
      var cx = (CFG.GAME.W + 220 - (menuT * 36 + ci * 165) % (CFG.GAME.W + 220)) - 110;
      var cy = 108 + Math.sin(menuT * 3.2 + ci * 0.8) * 4;
      var cfr = SpriteGen.frames(chars[ci] + '_walk_right');
      var cimg = cfr[Math.floor(menuT * 10 + ci) % cfr.length];
      ctx.drawImage(cimg, cx, cy, 56, 74);
    }

    // 底部怪物行:普通怪 + Boss 随机错落排列,普通怪 32px,Boss 40px(还原比例)
    var parade = ['bat', 'slime', 'zombie', 'skeleton', 'ghost', 'spider', 'orc',
                  'boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord'];
    for (var i = 0; i < parade.length; i++) {
      var pid = parade[i];
      var x = ((menuT * 40 + i * 152 + (i % 3) * 26) % (CFG.GAME.W + 200)) - 100;
      var y = CFG.GAME.H - 72 + Math.sin(menuT * 4 + i * 1.3) * 3;
      var isBoss = pid.indexOf('boss_') === 0;
      var frames = SpriteGen.frames(pid + (isBoss ? '' : '_walk'));
      var img = frames[Math.floor(menuT * 5 + i) % frames.length];
      if (isBoss) {
        ctx.drawImage(img, x, y, 54, 54);
      } else {
        ctx.drawImage(img, x, y + 8, 42, 42);
      }
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

    // 图集立即在后台开始下载,不阻塞首帧;加载完成后再替换精灵。
    var atlasReady = SpriteGen.loadAtlas();
    if (atlasReady) atlasPending = true;
    else { SpriteGen.init(); atlasPending = false; }
    menuBgImg = new Image();
    menuBgImg.src = 'assets/backgrounds/menu-monolith.png';
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
      worldZoom = E.clamp(worldZoom + (dy > 0 ? -0.08 : 0.08), 0.72, 1.42);
    };
    E.onMiddleClick = function () { if (state === 'run') Weapons.cycleTargetMode(); };
    E.onPinch = function (scale) {
      if (state !== 'run') return;
      worldZoom = E.clamp(worldZoom * scale, 0.72, 1.42);
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
      onArtTest: startArtTest,
      onTestAction: applyTestAction,
      onExitGate: requestExitGate,
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
        Net.setInRun(true);   // 之后掉线只标记离线并保留进度,等待重连
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
        // 客户端跟随房主开局;自己的角色取自大厅选择。
        // m.rejoin=1 表示这是断线重连后房主补发的:同样走 newRun 重建本地场景,
        // 但等级/武器/位置会在下一个快照到达时被房主的权威数据覆盖回来
        // (房主端保留了这名玩家的实体,进度并未丢失)。
        // coop.myId 必须刷新:PeerJS 重连会分配新 peer id,快照里的 ps.id
        // 用的是新 id,不更新就再也认不出"哪个玩家是我自己"。
        var mine = UI.myPick() || CFG.CHARS[0].id;
        coop.on = true;
        coop.mates = [];
        coop.remote = [];
        coop.myId = Net.selfId();
        coop.active = true;
        newRun(mine, m.mapId);
        if (m.rejoin) UI.toastText('已重连,正在同步战况…');
      },
      // 客户端:收到房主快照,重建世界并解出队友
      onSnap: function (m) {
        if (!run || !coop.on) return;
        try {
          Entities.applySnapshot(run, { t: m.ti, e: m.e, s: m.s, l: m.l, g: m.g, it: m.it, bh: m.bh, bi: m.bi, bn: m.bn });
          run.kills = m.kl || 0;
          run.gold = m.gd || 0;
          run.bossesKilled = m.bk || 0;
          run.freezeT = m.fz || 0;
          run.endless = !!m.en;
          run.exitGate = m.eg ? { x: m.eg.x, y: m.eg.y, open: !!m.eg.o, used: !!m.eg.u } : null;
          if (m.bi) {
            run.boss = run.boss || {};
            run.boss.alive = m.bh > 0;
            run.boss.bossType = m.bi;
            run.boss.hp = m.bh;
            run.boss.maxHp = 1;
            run.bossBarName = m.bn || '';
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
              face: ps.f, dir: ps.d || 'down', moving: !!ps.mv, attacking: !!ps.at, hpPct: ps.hp,
              downed: !!ps.dn, reviveT: ps.rv, buffed: !!ps.bf
            });
          }
          Weapons.applyVisual(run, m.b || []);
        } catch (e) {
          console.error('[联机] 快照应用失败:', e);
        }
      },
      // 房主:客户端断线重连回来了(PeerJS 会给它一个新的 peer id)。
      // 把对局内已有的队友实体接到新 peer id 上,玩家的武器/等级/被动/位置
      // 全部保留;不这么做的话他会被当成新玩家,进度清零,而旧记录变成
      // 一个永不更新输入的"幽灵队友"仍被刷怪追踪。
      onClientRejoin: function (oldPeerId, newPeerId) {
        if (!coop.on || !coop.mates) return;
        for (var i = 0; i < coop.mates.length; i++) {
          if (coop.mates[i].peerId !== oldPeerId) continue;
          var mt = coop.mates[i];
          mt.peerId = newPeerId;
          mt.input.x = 0; mt.input.y = 0;   // 清掉断线瞬间残留的方向,避免复连后自己乱走
          // 补发 start:重连的客户端刚握完手还停在大厅,不告诉它"对局仍在进行"
          // 它就永远回不到战斗画面。带上它自己的角色 id 以便正确重建本地表现。
          if (run && state !== 'result') {
            Net.sendTo(newPeerId, {
              t: 'start', mapId: run.map.id, roster: Net.getRoster(), rejoin: 1
            });
          }
          // 断线期间可能积压了升级:重连后重新推一次,否则卡在"待选"状态
          if (mt.pendingLevels > 0) { mt.luOpen = false; sendMateLevelUp(mt); }
          UI.toastText(mt.name + ' 已重连');
          return;
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
        else if (m.t === 'exitGate' && state === 'run') {
          for (var gi = 0; gi < coop.mates.length; gi++) {
            if (coop.mates[gi].peerId === peerId) { Entities.tryExitGate(run, coop.mates[gi].player); break; }
          }
        }
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

    // 字体后台加载,不阻塞首帧;图集完成后补齐精灵并处理跳过意图。
    if (document.fonts && document.fonts.load) {
      document.fonts.load('16px "Fusion Pixel"');
      document.fonts.load('700 96px "Darktide Gothic"');
    }
    if (atlasReady) {
      try { await atlasReady; } finally { atlasPending = false; }
      // UI 的图标是 canvas 快照,boot 时图集还没下完,拿到的是洋红占位块;
      // 图集就位后重绘一遍,HUD 与菜单里的图标才会变成真素材。
      UI.refreshIcons();
    }
    if (introSkipped && !introDone) skipIntro();
  }

  window.Debug = {
    run: function () { return run; },
    state: function () { return state; },
    coop: function () { return coop; },
    startArtTest: startArtTest,
    testAction: applyTestAction,
    menuBackground: function () {
      return { loaded: !!(menuBgImg && menuBgImg.width), src: menuBgImg ? menuBgImg.src : '' };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
