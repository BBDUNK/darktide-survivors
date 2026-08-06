// entities.js — 玩家 / 敌人AI / Boss / 掉落拾取 / 刷怪导演
window.Entities = (function () {
  'use strict';
  var E = Engine;

  // ================= 玩家 =================
  function makePlayer(charDef) {
    return {
      x: 0, y: 0, r: 10,
      hp: 100, iframe: 0, hurtFlash: 0,
      face: 1, moving: false, animT: 0,
      char: charDef,
      stats: null // recomputeStats 填充
    };
  }

  function recomputeStats(run) {
    var s = {}, base = CFG.BASE_STATS, k;
    for (k in base) s[k] = base[k];
    // 角色修正
    var m = run.player.char.mods || {};
    if (m.hp) s.hp += m.hp;
    if (m.armor) s.armor += m.armor;
    if (m.regen) s.regen += m.regen;
    if (m.cd) s.cd += m.cd;
    if (m.crit) s.crit += m.crit;
    if (m.speedPct) s.speed *= (1 + m.speedPct);
    if (m.areaPct) s.area += m.areaPct;
    if (m.mightPct) s.might += m.mightPct;
    if (m.luckPct) s.luck += m.luckPct;
    // 商店永久加成
    Meta.applyMeta(s);
    // 被动
    for (k in run.passives) {
      var lv = run.passives[k];
      if (lv > 0 && CFG.PASSIVES[k]) CFG.PASSIVES[k].apply(s, lv);
    }
    s.cd = E.clamp(s.cd, 0.35, 2);
    var oldMax = run.player.stats ? run.player.stats.hp : s.hp;
    run.player.stats = s;
    // 生命上限变化时按比例/差值补血
    if (s.hp > oldMax) run.player.hp += (s.hp - oldMax);
    run.player.hp = Math.min(run.player.hp, s.hp);
  }

  function updatePlayer(run, dt) {
    var p = run.player, s = p.stats;
    var iv = E.readInput();
    p.moving = (iv.x !== 0 || iv.y !== 0);
    if (p.moving) {
      p.x += iv.x * s.speed * dt;
      p.y += iv.y * s.speed * dt;
      if (iv.x > 0.01) p.face = 1; else if (iv.x < -0.01) p.face = -1;
      p.animT += dt;
    }
    // 地图边界:玩家不能越出结界
    var R = CFG.GAME.MAP_R;
    p.x = E.clamp(p.x, -R, R);
    p.y = E.clamp(p.y, -R, R);
    if (p.iframe > 0) p.iframe -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    // 回复
    if (s.regen > 0 && p.hp < s.hp) p.hp = Math.min(s.hp, p.hp + s.regen * dt);
    // 相机跟随(同样夹在边界内,避免镜头越过结界露出空白)
    E.cam.x = E.lerp(E.cam.x, p.x, 1 - Math.pow(0.001, dt));
    E.cam.y = E.lerp(E.cam.y, p.y, 1 - Math.pow(0.001, dt));
    // 留出余量让结界墙进入视野(不要夹到刚好贴墙,否则看不见边界)
    var margin = 90;
    var cmX = Math.max(0, R - CFG.GAME.W / 2 + margin), cmY = Math.max(0, R - CFG.GAME.H / 2 + margin);
    E.cam.x = E.clamp(E.cam.x, -cmX, cmX);
    E.cam.y = E.clamp(E.cam.y, -cmY, cmY);
  }

  function damagePlayer(run, dmg) {
    var p = run.player;
    if (p.iframe > 0 || run.over) return;
    var real = Math.max(1, dmg - p.stats.armor);
    p.hp -= real;
    p.iframe = 0.5;
    p.hurtFlash = 0.25;
    AudioSys.play('player_hurt');
    FX.shake(5, 0.25);
    FX.flash('#ff2233', 0.18, 0.25);
    if (p.hp <= 0) {
      if (p.stats.revive > 0) {
        p.stats.revive--;
        p.hp = p.stats.hp * 0.5;
        p.iframe = 2.5;
        FX.levelBeam(p.x, p.y);
        FX.ring(p.x, p.y, { r: 120, color: '#ffd76b', life: 0.6, width: 4 });
        AudioSys.play('levelup');
        bombBlast(run, 150); // 复活冲击波清场
      } else {
        p.hp = 0;
        run.over = true; run.victory = false;
      }
    }
  }

  // ================= 敌人池 =================
  var POOL = 520;
  var enemies = [];
  var freeIdx = [];
  function initPools() {
    enemies.length = 0; freeIdx.length = 0;
    for (var i = 0; i < POOL; i++) {
      enemies.push({
        alive: false, uid: 0, id: '', def: null,
        x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
        r: 10, dmg: 0, spd: 0, armor: 0,
        kx: 0, ky: 0, flash: 0, frozen: 0, slow: 0, slowT: 0, stun: 0,
        face: 1, animo: 0, alpha: 1,
        elite: false, boss: false, bossType: '',
        ai: 'chase', aiT: 0, aiPhase: 0, tgtX: 0, tgtY: 0,
        burn: 0, burnT: 0
      });
      freeIdx.push(POOL - 1 - i);
    }
    shots.length = 0;
    for (i = 0; i < 200; i++) shots.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, ttl: 0 });
    gems.length = 0; freeGem.length = 0;
    for (i = 0; i < 320; i++) { gems.push({ alive: false, x: 0, y: 0, v: 0, pull: false, vx: 0, vy: 0, t: 0 }); freeGem.push(319 - i); }
    items.length = 0;
    for (i = 0; i < 60; i++) items.push({ alive: false, type: '', x: 0, y: 0, v: 0, t: 0 });
  }

  function aliveEnemies() { return enemies; }

  function spawnEnemy(run, id, x, y, opts) {
    if (!freeIdx.length) return null;
    var def = CFG.ENEMIES[id] || CFG.BOSSES[id];
    if (!def) return null;
    var e = enemies[freeIdx.pop()];
    var isBoss = !!CFG.BOSSES[id];
    var mul = run.map.hpMul * (1 + run.t / 60 * CFG.HP_GROWTH);
    e.alive = true; e.uid = E.nextUid(); e.id = id; e.def = def;
    e.x = x; e.y = y; e.vx = 0; e.vy = 0;
    e.maxHp = def.hp * (isBoss ? run.map.hpMul : mul);
    e.hp = e.maxHp;
    e.r = def.r; e.dmg = def.dmg; e.spd = def.spd * (0.9 + Math.random() * 0.2);
    e.armor = def.armor || 0;
    e.kx = 0; e.ky = 0; e.flash = 0; e.frozen = 0; e.slow = 0; e.slowT = 0; e.stun = 0;
    e.face = 1; e.animo = Math.random() * 10; e.alpha = 1;
    e.elite = false; e.boss = isBoss; e.bossType = isBoss ? id : '';
    e.ai = isBoss ? 'boss' : (def.ai || 'chase');
    e.aiT = 0; e.aiPhase = 0;
    e.burn = 0; e.burnT = 0;
    if (opts && opts.elite) {
      e.elite = true;
      e.maxHp *= CFG.ELITE.hpMul; e.hp = e.maxHp;
      e.dmg *= CFG.ELITE.dmgMul; e.r *= 1.3;
    }
    if (!run.seen[id]) { run.seen[id] = true; Meta.seeCodex(id); }
    return e;
  }

  // 在玩家周围环上取一个位于地图边界内的点
  function ringPoint(run, radius) {
    var R = CFG.GAME.MAP_R, p = run.player;
    for (var tries = 0; tries < 8; tries++) {
      var a = Math.random() * Math.PI * 2;
      var x = p.x + Math.cos(a) * radius, y = p.y + Math.sin(a) * radius;
      if (x >= -R && x <= R && y >= -R && y <= R) return { x: x, y: y };
    }
    return { x: E.clamp(p.x, -R, R), y: E.clamp(p.y, -R, R) };
  }

  function spawnAtRing(run, id, opts) {
    var r = CFG.GAME.SPAWN_R + Math.random() * 80;
    var pt = ringPoint(run, r);
    return spawnEnemy(run, id, pt.x, pt.y, opts);
  }

  // 中心伤害入口(武器调用)
  function damageEnemy(run, e, dmg, opts) {
    if (!e.alive) return 0;
    opts = opts || {};
    var s = run.player.stats;
    var crit = opts.noCrit ? false : (Math.random() < s.crit);
    var final = dmg * (crit ? s.critDmg : 1);
    final = Math.max(1, final - e.armor);
    e.hp -= final;
    run.dmgTotal += final;
    e.flash = 0.1;
    if (opts.kx || opts.ky) {
      var kMul = e.boss ? 0.06 : (e.elite ? 0.25 : 1);
      e.kx += (opts.kx || 0) * kMul; e.ky += (opts.ky || 0) * kMul;
    }
    if (opts.slow) { e.slow = Math.max(e.slow, opts.slow); e.slowT = Math.max(e.slowT, opts.slowDur || 2); }
    if (opts.stun && !e.boss) e.stun = Math.max(e.stun, opts.stun);
    if (opts.burn) { e.burn = opts.burn; e.burnT = Math.max(e.burnT, opts.burnDur || 2); }
    FX.dmgText(e.x + (Math.random() * 12 - 6), e.y - e.r - 6, Math.round(final), { crit: crit });
    if (crit) AudioSys.play('crit');
    if (e.hp <= 0) killEnemy(run, e, opts);
    return final;
  }

  function killEnemy(run, e, opts) {
    if (!e.alive) return;
    e.alive = false;
    freeIdx.push(enemies.indexOf(e));
    run.kills++;
    Meta.track('kill');
    var col = e.boss ? '#ffd76b' : '#8a1f2d';
    FX.blood(e.x, e.y, col);
    FX.burst(e.x, e.y, { color: '#d8d3e8', n: e.boss ? 40 : 6, speed: e.boss ? 220 : 90, life: 0.5, size: 3 });
    AudioSys.play(Math.random() < 0.5 ? 'enemy_die' : 'splat');
    // 分裂
    if (e.def.split && !(opts && opts.noSplit)) {
      for (var i = 0; i < 2; i++) {
        var c = spawnEnemy(run, e.def.split, e.x + (Math.random() * 30 - 15), e.y + (Math.random() * 30 - 15));
        if (c) c.hp = c.maxHp *= 0.8;
      }
    }
    dropLoot(run, e);
    if (e.boss) {
      Meta.track('bossKill');
      run.bossesKilled++;
      if (run.boss === e) run.boss = null;
      FX.shake(14, 0.8);
      FX.explosion(e.x, e.y, 120);
      AudioSys.play('boss_die');
      spawnItem(run, 'chest', e.x, e.y);
      for (i = 0; i < 8; i++) spawnGem(run, e.x + Math.cos(i) * 30, e.y + Math.sin(i) * 30, 10);
      if (e.bossType === 'boss_darklord') { run.over = true; run.victory = true; }
    } else if (e.elite) {
      FX.explosion(e.x, e.y, 60);
      spawnItem(run, 'chest', e.x, e.y);
      spawnGem(run, e.x, e.y, e.def.xp * CFG.ELITE.xpMul);
    }
  }

  function dropLoot(run, e) {
    var luck = run.player.stats.luck;
    spawnGem(run, e.x, e.y, e.def.xp);
    var D = CFG.DROPS;
    var roll = Math.random();
    if (roll < D.goldChance * luck) {
      spawnItem(run, 'coin', e.x + 8, e.y, 0);
    } else if (roll < (D.goldChance + D.heartChance) * luck) {
      spawnItem(run, 'meat', e.x, e.y);
    } else if (roll < (D.goldChance + D.heartChance + D.magnetChance) * luck) {
      spawnItem(run, 'magnet', e.x, e.y);
    } else if (roll < (D.goldChance + D.heartChance + D.magnetChance + D.bombChance) * luck) {
      spawnItem(run, 'bomb', e.x, e.y);
    } else if (roll < (D.goldChance + D.heartChance + D.magnetChance + D.bombChance + D.clockChance) * luck) {
      spawnItem(run, 'clock', e.x, e.y);
    }
  }

  // ================= 敌人 AI =================
  function updateEnemies(run, dt) {
    var p = run.player;
    E.gridClear();
    var i, e;
    for (i = 0; i < POOL; i++) { e = enemies[i]; if (e.alive) E.gridInsert(e); }
    var frameParity = (run.frame & 1);

    for (i = 0; i < POOL; i++) {
      e = enemies[i];
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      // 全局冰冻
      if (run.freezeT > 0 || e.frozen > 0 || e.stun > 0) {
        e.frozen = Math.max(0, e.frozen - dt);
        e.stun = Math.max(0, e.stun - dt);
        contactCheck(run, e, p);
        continue;
      }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      // 燃烧
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.aiT += 0; // noop
        if ((run.frame % 30) === 0) damageEnemy(run, e, e.burn, { noCrit: true });
        if (!e.alive) continue;
      }
      var spd = e.spd * (1 - e.slow);
      var dx = p.x - e.x, dy = p.y - e.y;
      var dist = Math.hypot(dx, dy) || 1;
      var nx = dx / dist, ny = dy / dist;
      e.face = nx >= 0 ? 1 : -1;

      switch (e.ai) {
        case 'chase':
          e.vx = nx * spd; e.vy = ny * spd;
          break;
        case 'phase': // 幽灵:波动漂移,无碰撞分离
          e.alpha = 0.55 + Math.sin(run.t * 3 + e.animo) * 0.25;
          e.vx = nx * spd; e.vy = ny * spd + Math.sin(run.t * 2 + e.animo) * 18;
          break;
        case 'shoot': // 保持距离射击
          var kd = e.def.keepDist || 200;
          if (dist > kd + 30) { e.vx = nx * spd; e.vy = ny * spd; }
          else if (dist < kd - 30) { e.vx = -nx * spd * 0.7; e.vy = -ny * spd * 0.7; }
          else { e.vx = -ny * spd * 0.4; e.vy = nx * spd * 0.4; }
          e.aiT -= dt;
          if (e.aiT <= 0 && dist < 420) {
            e.aiT = e.def.shotCd;
            fireShot(e.x, e.y, nx, ny, e.def.shotSpd, e.def.shotDmg * (e.elite ? 1.5 : 1));
          }
          break;
        case 'charge': // 狼人:蓄力冲锋
          e.aiT -= dt;
          if (e.aiPhase === 0) { // 追击
            e.vx = nx * spd; e.vy = ny * spd;
            if (e.aiT <= 0 && dist < 260) { e.aiPhase = 1; e.aiT = 0.5; e.vx = 0; e.vy = 0; }
          } else if (e.aiPhase === 1) { // 蓄力(闪烁)
            e.vx = 0; e.vy = 0;
            e.flash = 0.05;
            if (e.aiT <= 0) {
              e.aiPhase = 2; e.aiT = 0.8;
              e.tgtX = nx; e.tgtY = ny;
              FX.burst(e.x, e.y, { color: '#c44', n: 6, speed: 60, life: 0.3, size: 2 });
            }
          } else { // 冲锋
            e.vx = e.tgtX * e.def.chargeSpd; e.vy = e.tgtY * e.def.chargeSpd;
            if (e.aiT <= 0) { e.aiPhase = 0; e.aiT = e.def.chargeCd; }
          }
          break;
        case 'boss':
          bossAI(run, e, dt, nx, ny, dist, spd);
          break;
      }

      // 击退衰减
      e.x += (e.vx + e.kx) * dt;
      e.y += (e.vy + e.ky) * dt;
      e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);

      // 邻居分离(隔帧处理省性能;幽灵与Boss跳过;复用回调避免每帧闭包分配)
      if (e.ai !== 'phase' && !e.boss && (i & 1) === frameParity) {
        _sepSelf = e;
        E.gridQuery(e.x, e.y, e.r + 8, sepCb);
      }

      contactCheck(run, e, p);

      // 敌人也不能越出结界
      var eR = CFG.GAME.MAP_R;
      if (e.x < -eR) { e.x = -eR; e.kx = 0; }
      else if (e.x > eR) { e.x = eR; e.kx = 0; }
      if (e.y < -eR) { e.y = -eR; e.ky = 0; }
      else if (e.y > eR) { e.y = eR; e.ky = 0; }

      // 远离过远 → 搬回出生环(Boss除外)
      if (!e.boss && E.dist2(e.x, e.y, p.x, p.y) > CFG.GAME.DESPAWN_R * CFG.GAME.DESPAWN_R) {
        var rp = ringPoint(run, CFG.GAME.SPAWN_R);
        e.x = rp.x; e.y = rp.y;
      }
    }

    // 敌方子弹
    for (i = 0; i < shots.length; i++) {
      var sh = shots[i];
      if (!sh.alive) continue;
      sh.ttl -= dt;
      if (sh.ttl <= 0) { sh.alive = false; continue; }
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (E.dist2(sh.x, sh.y, p.x, p.y) < (p.r + 5) * (p.r + 5)) {
        sh.alive = false;
        damagePlayer(run, sh.dmg);
      }
    }
  }

  var _sepSelf = null;
  function sepCb(o) {
    var s = _sepSelf;
    if (o === s || o.boss || o.ai === 'phase') return false;
    var ddx = s.x - o.x, ddy = s.y - o.y;
    var d2 = ddx * ddx + ddy * ddy, min = s.r + o.r;
    if (d2 > 0.01 && d2 < min * min) {
      var d = Math.sqrt(d2), push = (min - d) * 0.4;
      s.x += ddx / d * push; s.y += ddy / d * push;
      o.x -= ddx / d * push; o.y -= ddy / d * push;
    }
    return false;
  }

  function contactCheck(run, e, p) {
    var rr = e.r + p.r;
    if (E.dist2(e.x, e.y, p.x, p.y) < rr * rr) damagePlayer(run, e.dmg);
  }

  var shots = [];
  function fireShot(x, y, nx, ny, spd, dmg) {
    for (var i = 0; i < shots.length; i++) {
      if (!shots[i].alive) {
        var s = shots[i];
        s.alive = true; s.x = x; s.y = y;
        s.vx = nx * spd; s.vy = ny * spd; s.dmg = dmg; s.ttl = 5;
        return;
      }
    }
  }

  // ================= Boss AI =================
  function bossAI(run, e, dt, nx, ny, dist, spd) {
    e.aiT -= dt;
    var enrage = (e.bossType === 'boss_darklord' && run.t >= CFG.GAME.RUN_TIME);
    var sMul = enrage ? 1.6 : 1, dMul = enrage ? 2 : 1;
    switch (e.bossType) {
      case 'boss_slimeking': // 跳劈 + 分裂小史莱姆
        if (e.aiPhase === 0) {
          e.vx = nx * spd * 0.6; e.vy = ny * spd * 0.6;
          if (e.aiT <= 0) { e.aiPhase = 1; e.aiT = 0.7; e.vx = 0; e.vy = 0; }
        } else if (e.aiPhase === 1) { // 蓄力
          e.vx = 0; e.vy = 0;
          if (e.aiT <= 0) { e.aiPhase = 2; e.aiT = 0.9; e.tgtX = nx; e.tgtY = ny; }
        } else {
          e.vx = e.tgtX * 240; e.vy = e.tgtY * 240;
          if (e.aiT <= 0) {
            e.aiPhase = 0; e.aiT = 1.2;
            FX.ring(e.x, e.y, { r: 90, color: '#7fd44f', life: 0.4, width: 4 });
            FX.shake(6, 0.3);
            AudioSys.play('splat');
            for (var i = 0; i < 2; i++) spawnEnemy(run, 'slime', e.x + (Math.random() * 60 - 30), e.y + (Math.random() * 60 - 30));
          }
        }
        break;
      case 'boss_bonelord': // 环形骨矢
        e.vx = nx * spd * 0.8; e.vy = ny * spd * 0.8;
        if (e.aiT <= 0) {
          e.aiT = 3.6;
          var n = 14;
          for (var j = 0; j < n; j++) {
            var a = (Math.PI * 2 / n) * j + e.aiPhase * 0.3;
            fireShot(e.x, e.y, Math.cos(a), Math.sin(a), 130, e.dmg * 0.6 * dMul);
          }
          e.aiPhase++;
          AudioSys.play('shoot_bolt');
        }
        break;
      case 'boss_abysseye': // 螺旋弹幕 + 召唤
        if (dist > 260) { e.vx = nx * spd; e.vy = ny * spd; }
        else { e.vx = -ny * spd * 0.7; e.vy = nx * spd * 0.7; }
        e.aiPhase += dt * 2.2;
        if (e.aiT <= 0) {
          e.aiT = 0.28;
          fireShot(e.x, e.y, Math.cos(e.aiPhase), Math.sin(e.aiPhase), 150, e.dmg * 0.5 * dMul);
          fireShot(e.x, e.y, Math.cos(e.aiPhase + Math.PI), Math.sin(e.aiPhase + Math.PI), 150, e.dmg * 0.5 * dMul);
        }
        e.burnT = 0;
        if ((run.frame % 480) === 0) {
          for (var k = 0; k < 3; k++) spawnAtRing(run, 'ghost');
          AudioSys.play('elite_spawn');
        }
        break;
      case 'boss_darklord': // 综合:追击+径向+螺旋,狂暴加速
        e.vx = nx * spd * sMul; e.vy = ny * spd * sMul;
        e.aiPhase += dt * 1.8;
        if (e.aiT <= 0) {
          e.aiT = enrage ? 1.6 : 2.6;
          var nn = enrage ? 20 : 12;
          for (var q = 0; q < nn; q++) {
            var aa = (Math.PI * 2 / nn) * q + e.aiPhase;
            fireShot(e.x, e.y, Math.cos(aa), Math.sin(aa), 160, e.dmg * 0.5 * dMul);
          }
          AudioSys.play('shoot_bolt');
        }
        if ((run.frame % 22) === 0) FX.trail(e.x + (Math.random() * 40 - 20), e.y + (Math.random() * 40 - 20), '#7a3cff', 4);
        break;
    }
  }

  // ================= 经验宝石 =================
  var gems = [], freeGem = [];
  function spawnGem(run, x, y, value) {
    value = Math.max(1, Math.round(value));
    if (!freeGem.length) { // 池满:并入最近的宝石
      var best = null, bd = 1e18;
      for (var i = 0; i < gems.length; i++) {
        var g0 = gems[i];
        if (!g0.alive) continue;
        var d = E.dist2(g0.x, g0.y, x, y);
        if (d < bd) { bd = d; best = g0; }
      }
      if (best) best.v += value;
      return;
    }
    var g = gems[freeGem.pop()];
    g.alive = true; g.x = x + (Math.random() * 10 - 5); g.y = y + (Math.random() * 10 - 5);
    g.v = value; g.pull = false; g.vx = 0; g.vy = 0; g.t = 0;
  }

  function updateGems(run, dt) {
    var p = run.player, s = p.stats;
    var mr2 = s.magnet * s.magnet;
    for (var i = 0; i < gems.length; i++) {
      var g = gems[i];
      if (!g.alive) continue;
      g.t += dt;
      var dx = p.x - g.x, dy = p.y - g.y;
      var d2 = dx * dx + dy * dy;
      if (g.pull || d2 < mr2) {
        var d = Math.sqrt(d2) || 1;
        var sp = g.pull ? 620 : E.lerp(160, 560, 1 - d / (s.magnet + 1));
        g.vx = dx / d * sp; g.vy = dy / d * sp;
        g.x += g.vx * dt; g.y += g.vy * dt;
      }
      if (d2 < 26 * 26) {
        g.alive = false; freeGem.push(i);
        addXp(run, g.v);
        FX.pickup(p.x, p.y - 14, '#59c2ff');
        AudioSys.play('gem');
      }
    }
  }

  function addXp(run, v) {
    run.xp += v * run.player.stats.growth;
    while (run.xp >= run.xpNeed) {
      run.xp -= run.xpNeed;
      run.level++;
      run.xpNeed = CFG.XP_NEED(run.level);
      run.pendingLevels++;
      Meta.trackBest('level', run.level);
    }
  }

  // ================= 道具拾取物 =================
  var items = [];
  function spawnItem(run, type, x, y) {
    for (var i = 0; i < items.length; i++) {
      if (!items[i].alive) {
        var it = items[i];
        it.alive = true; it.type = type; it.x = x; it.y = y; it.t = 0;
        it.v = (type === 'coin') ? (CFG.DROPS.goldValue[0] + Math.floor(Math.random() * (CFG.DROPS.goldValue[1] - CFG.DROPS.goldValue[0] + 1))) : 0;
        return it;
      }
    }
    return null;
  }

  function updateItems(run, dt) {
    var p = run.player;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      var pr = (it.type === 'coin') ? Math.max(30, p.stats.magnet * 0.7) : 30;
      var d2 = E.dist2(it.x, it.y, p.x, p.y);
      if (it.type === 'coin' && d2 < pr * pr && d2 > 24 * 24) {
        var d = Math.sqrt(d2);
        it.x += (p.x - it.x) / d * 380 * dt;
        it.y += (p.y - it.y) / d * 380 * dt;
      }
      if (d2 < 26 * 26) {
        it.alive = false;
        collectItem(run, it);
      }
    }
  }

  function collectItem(run, it) {
    var p = run.player;
    switch (it.type) {
      case 'coin':
        var v = Math.round(it.v * p.stats.greed);
        run.gold += v;
        Meta.track('gold', v);
        FX.pickup(it.x, it.y, '#ffd76b');
        AudioSys.play('coin');
        break;
      case 'meat':
        p.hp = Math.min(p.stats.hp, p.hp + CFG.DROPS.healAmount);
        FX.heal(p.x, p.y);
        FX.dmgText(p.x, p.y - 20, CFG.DROPS.healAmount, { heal: true });
        AudioSys.play('meat');
        break;
      case 'magnet':
        for (var i = 0; i < gems.length; i++) if (gems[i].alive) gems[i].pull = true;
        FX.ring(p.x, p.y, { r: 200, color: '#59c2ff', life: 0.5, width: 3 });
        AudioSys.play('magnet');
        break;
      case 'bomb':
        bombBlast(run, 260);
        Meta.track('bomb');
        AudioSys.play('bomb');
        break;
      case 'clock':
        run.freezeT = CFG.DROPS.freezeDur;
        FX.flash('#9adfff', 0.25, 0.5);
        AudioSys.play('freeze');
        break;
      case 'chest':
        run.pendingChest++;
        AudioSys.play('chest_open');
        break;
    }
  }

  function bombBlast(run, dmg) {
    var p = run.player;
    FX.flash('#fff2b0', 0.5, 0.4);
    FX.shake(10, 0.5);
    FX.explosion(p.x, p.y, 200);
    for (var i = 0; i < POOL; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      if (E.dist2(e.x, e.y, p.x, p.y) < 560 * 560) {
        damageEnemy(run, e, e.boss ? dmg * 2 : dmg + e.maxHp * 0.5, { noCrit: true });
      }
    }
  }

  // ================= 刷怪导演 =================
  function director(run, dt) {
    var t = run.t;
    // 当前波
    var waves = run.map.waves, w = waves[0];
    for (var i = waves.length - 1; i >= 0; i--) {
      if (t >= waves[i].t) { w = waves[i]; break; }
    }
    // 常规刷怪
    run.spawnAcc += dt * w.rate * run.map.rateMul * (run.endless ? 1 + (t - CFG.GAME.RUN_TIME) / 300 : 1);
    var aliveCount = POOL - freeIdx.length;
    while (run.spawnAcc >= 1) {
      run.spawnAcc -= 1;
      if (aliveCount < CFG.GAME.ENEMY_CAP) {
        spawnAtRing(run, w.ids[Math.floor(Math.random() * w.ids.length)]);
        aliveCount++;
      }
    }
    // 定点事件
    while (run.eventIdx < run.map.events.length && t >= run.map.events[run.eventIdx].t) {
      var ev = run.map.events[run.eventIdx++];
      execEvent(run, ev);
    }
    // 无尽模式:循环 Boss
    if (run.endless && t >= run.nextEndlessBoss) {
      run.nextEndlessBoss += 180;
      var bs = ['boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord'];
      var b = spawnAtRing(run, bs[Math.floor(Math.random() * bs.length)]);
      if (b) { b.maxHp *= 1 + (t - CFG.GAME.RUN_TIME) / 240; b.hp = b.maxHp; announceBoss(run, b); }
    }
    // 精英
    if (t >= run.nextElite) {
      run.nextElite += CFG.ELITE.interval;
      var el = spawnAtRing(run, w.ids[Math.floor(Math.random() * w.ids.length)], { elite: true });
      if (el) { AudioSys.play('elite_spawn'); if (run.cb.onElite) run.cb.onElite(el); }
    }
  }

  function execEvent(run, ev) {
    var p = run.player, i, a;
    switch (ev.type) {
      case 'ring': // 包围圈
        var evR = CFG.GAME.MAP_R;
        for (i = 0; i < ev.n; i++) {
          a = (Math.PI * 2 / ev.n) * i;
          spawnEnemy(run, ev.id,
            E.clamp(p.x + Math.cos(a) * 480, -evR, evR),
            E.clamp(p.y + Math.sin(a) * 480, -evR, evR));
        }
        if (run.cb.onWarn) run.cb.onWarn('敌潮从四面八方涌来!');
        break;
      case 'swarm': // 一侧蜂拥
        a = Math.random() * Math.PI * 2;
        var swR = CFG.GAME.MAP_R;
        for (i = 0; i < ev.n; i++) {
          var da = a + (Math.random() - 0.5) * 0.9;
          var sd = CFG.GAME.SPAWN_R + Math.random() * 100;
          spawnEnemy(run, ev.id,
            E.clamp(p.x + Math.cos(da) * sd, -swR, swR),
            E.clamp(p.y + Math.sin(da) * sd, -swR, swR));
        }
        if (run.cb.onWarn) run.cb.onWarn('兽群的嚎叫逼近……');
        break;
      case 'boss':
        var b = spawnAtRing(run, ev.id);
        if (b) announceBoss(run, b);
        break;
    }
  }

  function announceBoss(run, b) {
    run.boss = b;
    AudioSys.play('boss_spawn');
    AudioSys.setIntensity(3);
    FX.shake(8, 0.6);
    if (run.cb.onBoss) run.cb.onBoss(CFG.BOSSES[b.bossType]);
  }

  // ================= 绘制 =================
  var flipCache = {};
  function getFrames(name, flip) {
    if (!flip) return SpriteGen.frames(name);
    var c = flipCache[name];
    if (!c) {
      var src = SpriteGen.frames(name);
      c = [];
      for (var i = 0; i < src.length; i++) {
        var cv = document.createElement('canvas');
        cv.width = src[i].width; cv.height = src[i].height;
        var cx = cv.getContext('2d');
        cx.translate(cv.width, 0); cx.scale(-1, 1);
        cx.drawImage(src[i], 0, 0);
        c.push(cv);
      }
      flipCache[name] = c;
    }
    return c;
  }

  var tintCache = {};
  function getTint(name, frameIdx, color) {
    var key = name + '|' + frameIdx + '|' + color;
    var cv = tintCache[key];
    if (!cv) {
      var src = SpriteGen.frames(name)[frameIdx];
      cv = document.createElement('canvas');
      cv.width = src.width; cv.height = src.height;
      var cx = cv.getContext('2d');
      cx.drawImage(src, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = color;
      cx.fillRect(0, 0, cv.width, cv.height);
      tintCache[key] = cv;
    }
    return cv;
  }

  function drawSprite(ctx, name, frameIdx, x, y, scale, flip, alpha, tint) {
    var frames = getFrames(name, flip);
    var img = frames[frameIdx % frames.length];
    var w = img.width * 2 * scale, h = img.height * 2 * scale;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    if (tint) {
      var tc = getTint(name, frameIdx % frames.length, tint);
      ctx.globalAlpha = (alpha !== 1 ? alpha : 1) * 0.65;
      if (flip) {
        ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
        ctx.drawImage(tc, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(tc, x - w / 2, y - h / 2, w, h);
      }
    }
    if (alpha !== 1 || tint) ctx.globalAlpha = 1;
  }

  function draw(ctx, run) {
    var i, e, g, it, p = run.player;
    var animF = Math.floor(run.t * 6);
    var shadow = SpriteGen.get('vfx_shadow');

    // 宝石
    for (i = 0; i < gems.length; i++) {
      g = gems[i];
      if (!g.alive) continue;
      var gname = g.v >= 30 ? 'gem_big' : (g.v >= 10 ? 'gem3' : (g.v >= 3 ? 'gem2' : 'gem1'));
      var bob = Math.sin(g.t * 4 + i) * 2;
      // 大颗经验加一圈微光
      if (g.v >= 10) {
        var gg = ctx.createRadialGradient(g.x, g.y, 1, g.x, g.y, 16);
        gg.addColorStop(0, 'rgba(89,194,255,0.30)');
        gg.addColorStop(1, 'rgba(89,194,255,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(g.x, g.y, 16, 0, Math.PI * 2); ctx.fill();
      }
      drawSprite(ctx, gname, 0, g.x, g.y + bob, 0.75, false, 1, null);
    }
    // 道具
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.alive) continue;
      var bob2 = Math.sin(it.t * 3 + i) * 2;
      var nm = it.type === 'coin' ? 'coin' : (it.type === 'chest' ? 'chest' : it.type);
      // 拾取物地面柔光,远处也能看见
      var glowCol = it.type === 'chest' ? '255,215,107'
        : (it.type === 'coin' ? '255,235,120'
        : (it.type === 'meat' ? '255,120,140' : '120,200,255'));
      var gr = it.type === 'chest' ? 38 : 20;
      var pulse = 0.5 + Math.sin(it.t * 4) * 0.5;
      var ig = ctx.createRadialGradient(it.x, it.y, 1, it.x, it.y, gr);
      ig.addColorStop(0, 'rgba(' + glowCol + ',' + (0.30 + pulse * 0.22).toFixed(3) + ')');
      ig.addColorStop(1, 'rgba(' + glowCol + ',0)');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.arc(it.x, it.y, gr, 0, Math.PI * 2); ctx.fill();
      drawSprite(ctx, nm, it.type === 'coin' ? animF : 0, it.x, it.y + bob2, it.type === 'chest' ? 1.2 : 0.9, false, 1, null);
      if (it.type === 'chest') { // 宝箱额外上升光柱
        ctx.globalAlpha = 0.10 + pulse * 0.10;
        ctx.fillStyle = '#ffd76b';
        ctx.fillRect(it.x - 9, it.y - 60, 18, 60);
        ctx.globalAlpha = 1;
      }
    }
    // 敌人影子 + 敌人
    for (i = 0; i < POOL; i++) {
      e = enemies[i];
      if (!e.alive) continue;
      var sc = (e.boss ? 2 : 1) * (e.elite ? CFG.ELITE.scale : 1);
      ctx.globalAlpha = 0.4;
      ctx.drawImage(shadow, e.x - 12 * sc, e.y + e.r * 0.7, 24 * sc, 8 * sc);
      ctx.globalAlpha = 1;
      var tint = null;
      if (e.flash > 0) tint = '#ffffff';
      else if (run.freezeT > 0 || e.frozen > 0) tint = '#5fd0ff';
      else if (e.slowT > 0) tint = '#8ab6ff';
      var wob = e.boss ? 0 : Math.sin(run.t * 8 + e.animo) * 1.5;
      drawSprite(ctx, e.boss ? e.bossType : e.id, animF + (e.animo | 0), e.x, e.y + wob, sc, e.face < 0, e.alpha, tint);
      if (e.elite) drawSprite(ctx, 'elite_crown', 0, e.x, e.y - e.r - 12, 1, false, 1, null);
      // 精英/Boss 血条
      if ((e.elite || e.boss) && e.hp < e.maxHp) {
        var bw = e.boss ? 56 : 34;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r * sc - 10, bw, 4);
        ctx.fillStyle = e.boss ? '#ff5964' : '#ffd76b';
        ctx.fillRect(e.x - bw / 2, e.y - e.r * sc - 10, bw * Math.max(0, e.hp / e.maxHp), 4);
      } else if (Meta.settings().hpBar && !e.boss && !e.elite && e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - 12, e.y - e.r - 8, 24, 3);
        ctx.fillStyle = '#6ee86e';
        ctx.fillRect(e.x - 12, e.y - e.r - 8, 24 * Math.max(0, e.hp / e.maxHp), 3);
      }
    }
    // 敌方子弹
    var shotImg = SpriteGen.get('p_enemy_bolt');
    for (i = 0; i < shots.length; i++) {
      var sh = shots[i];
      if (!sh.alive) continue;
      ctx.drawImage(shotImg, sh.x - 8, sh.y - 8, 16, 16);
    }
    // 玩家
    ctx.globalAlpha = 0.4;
    ctx.drawImage(shadow, p.x - 12, p.y + 8, 24, 8);
    ctx.globalAlpha = 1;
    var blink = p.iframe > 0 && (Math.floor(run.t * 14) & 1);
    if (!blink) {
      var pf = p.moving ? Math.floor(p.animT * 8) : 0;
      drawSprite(ctx, p.char.sprite, pf, p.x, p.y, 1, p.face < 0, 1, p.hurtFlash > 0 ? '#ff4444' : null);
    }
  }

  function reset() { initPools(); }

  function countAlive() { return POOL - freeIdx.length; }

  return {
    makePlayer: makePlayer, recomputeStats: recomputeStats,
    updatePlayer: updatePlayer, damagePlayer: damagePlayer,
    spawnEnemy: spawnEnemy, spawnAtRing: spawnAtRing,
    damageEnemy: damageEnemy, killEnemy: killEnemy,
    updateEnemies: updateEnemies, updateGems: updateGems, updateItems: updateItems,
    spawnGem: spawnGem, spawnItem: spawnItem, addXp: addXp, bombBlast: bombBlast,
    director: director, draw: draw, reset: reset,
    pool: enemies, countAlive: countAlive, drawSprite: drawSprite,
    getGems: function () { return gems; },
    getItems: function () { return items; }
  };
})();
