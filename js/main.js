// main.js — 状态机 / 渲染编排 / 启动
(function () {
  'use strict';
  var E = Engine;
  var canvas, ctx;
  var state = 'menu'; // menu | run | levelup | chest | pause | result
  var run = null;
  var vignette = null;
  var achvTimer = 0;
  var dpsTimer = 0, lastDmg = 0;

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
      kills: 0, gold: 0, bossesKilled: 0, dmgTotal: 0, maxDps: 0,
      spawnAcc: 0, eventIdx: 0, nextElite: CFG.ELITE.firstT,
      freezeT: 0, boss: null, over: false, victory: false,
      pendingChest: 0,
      banished: new Set(),
      rerolls: 0, banishes: 0,
      seen: {},
      endless: false, nextEndlessBoss: 0,
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
    if (state !== 'run' || !run) return;

    run.t += dt;
    run.frame++;
    if (run.freezeT > 0) run.freezeT -= dt;

    Entities.updatePlayer(run, dt);
    Weapons.update(run, dt);
    Entities.updateEnemies(run, dt);
    Entities.updateGems(run, dt);
    Entities.updateItems(run, dt);
    Entities.director(run, dt);

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
    Entities.drawLobMarkers(ctx, run);
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
  }

  function renderMenuBg() {
    menuT += 1 / 60;
    var pal = CFG.MAPS[0].palette;
    drawGround(pal, menuT * 30, Math.sin(menuT * 0.1) * 40);
    drawDecor(CFG.MAPS[0], menuT * 30, Math.sin(menuT * 0.1) * 40, 0, null);
    // 游行的怪物剪影
    var parade = ['bat', 'slime', 'zombie', 'skeleton', 'ghost', 'spider', 'orc'];
    for (var i = 0; i < parade.length; i++) {
      var x = ((menuT * 40 + i * 150) % (CFG.GAME.W + 200)) - 100;
      var y = CFG.GAME.H - 90 + Math.sin(menuT * 4 + i) * 4;
      var frames = SpriteGen.frames(parade[i]);
      var img = frames[Math.floor(menuT * 5 + i) % frames.length];
      ctx.globalAlpha = 0.5;
      ctx.drawImage(img, x, y, 32, 32);
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
      }
    });

    // 全局兜底:文档级手势解锁音频
    document.addEventListener('pointerdown', function () { AudioSys.unlock(); }, { once: true });

    Engine.start(update, render);
  }

  window.Debug = {
    run: function () { return run; },
    state: function () { return state; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
