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

    UI.updateHUD(run);

    if (run.over) { finalizeRun(); return; }
    if (run.pendingChest) { enterChest(); return; }
    if (run.pendingLevels > 0) { enterLevelUp(); return; }
  }

  // ================= 渲染 =================
  function makeVignette() {
    var c = document.createElement('canvas');
    c.width = CFG.GAME.W; c.height = CFG.GAME.H;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.42, c.width / 2, c.height / 2, c.height * 0.85);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function drawGround(pal, camX, camY) {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, CFG.GAME.W, CFG.GAME.H);
    // 地面碎点(确定性散布)
    var cell = 48;
    var x0 = Math.floor((camX - CFG.GAME.W / 2) / cell) - 1;
    var x1 = Math.floor((camX + CFG.GAME.W / 2) / cell) + 1;
    var y0 = Math.floor((camY - CFG.GAME.H / 2) / cell) - 1;
    var y1 = Math.floor((camY + CFG.GAME.H / 2) / cell) + 1;
    ctx.fillStyle = pal.ground2;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var hsh = E.hash2(cx, cy);
        if (hsh < 0.45) {
          var px = cx * cell - camX + CFG.GAME.W / 2 + (hsh * 991 % 1) * 30;
          var py = cy * cell - camY + CFG.GAME.H / 2 + (hsh * 577 % 1) * 30;
          var s = hsh < 0.12 ? 6 : 3;
          ctx.fillRect(px | 0, py | 0, s, s);
        }
      }
    }
  }

  function drawDecor(map, camX, camY) {
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
          var name = map.decors[Math.floor(h1 * map.decors.length)];
          var img = SpriteGen.get(name);
          var wx = cx * cell + h1 * cell;
          var wy = cy * cell + h2 * cell;
          var sx = wx - camX + CFG.GAME.W / 2;
          var sy = wy - camY + CFG.GAME.H / 2;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(img, (sx - img.width) | 0, (sy - img.height * 2) | 0, img.width * 2, img.height * 2);
          ctx.globalAlpha = 1;
        }
      }
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
    drawDecor(run.map, camX, camY);

    ctx.save();
    ctx.translate(CFG.GAME.W / 2 - camX, CFG.GAME.H / 2 - camY);
    Entities.draw(ctx, run);
    Weapons.draw(ctx, run);
    FX.draw(ctx);
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
    FX.drawUI(ctx);
  }

  function renderMenuBg() {
    menuT += 1 / 60;
    var pal = CFG.MAPS[0].palette;
    drawGround(pal, menuT * 30, Math.sin(menuT * 0.1) * 40);
    drawDecor(CFG.MAPS[0], menuT * 30, Math.sin(menuT * 0.1) * 40);
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
