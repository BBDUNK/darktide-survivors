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
      shield: 0, shieldRegenT: 0,  // 护盾当前值 / 下次恢复计时
      lastVx: 0, lastVy: 0,        // 移动矢量,敌人抛击用于预判落点
      slow: 0, slowT: 0,                        // 蛛网减速
      webStacks: 0, webT: 0, rootT: 0,          // 蛛网叠层 / 缠身残留 / 硬控计时
      webImmune: 0,                             // 被定身后的蛛网免疫计时
      stats: null
    };
  }

  // 联机:为任意 player 对象算属性(房主要给每个队友各算一份)
  function recomputeStatsFor(run, p, passives) {
    var saved = run.player, savedP = run.passives;
    run.player = p; run.passives = passives || {};
    try { recomputeStats(run); }
    finally { run.player = saved; run.passives = savedP; }
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
    // 联机队友光环:全属性小幅提升(每帧由 applyCoopAuras 写入 p.auraBuff)
    var ab = run.player.auraBuff || 0;
    if (ab > 0) {
      s.might *= (1 + ab); s.hp *= (1 + ab); s.armor += ab * 10;
      s.speed *= (1 + ab * 0.5); s.area *= (1 + ab); s.crit += ab * 0.1;
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
    // 蛛网减速 / 硬控:二层叠加后被包裹,原地无法移动
    if (p.slowT > 0) { p.slowT -= dt; if (p.slowT <= 0) { p.slow = 0; p.webStacks = 0; } }
    if (p.webT > 0) { p.webT -= dt; if (p.webT <= 0) p.webStacks = 0; }
    if (p.webImmune > 0) p.webImmune -= dt;
    if (p.rootT > 0) { p.rootT -= dt; iv.x = 0; iv.y = 0; p.moving = false; }
    var mspd = s.speed * (1 - (p.slow || 0));
    // 记录当前速度矢量,供敌人抛击预判落点
    p.lastVx = iv.x * mspd;
    p.lastVy = iv.y * mspd;
    if (p.moving) {
      p.x += iv.x * mspd * dt;
      p.y += iv.y * mspd * dt;
      // 脚步尘土(隔帧少量,避免粒子池被占满)
      if ((run.frame & 3) === 0) FX.step(p.x, p.y + 8, '#b9b0c8');
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
    // 护盾再生(每 shieldCd 秒恢复一次)
    if (s.shieldMax > 0 && p.shield < s.shieldMax) {
      p.shieldRegenT -= dt;
      if (p.shieldRegenT <= 0) {
        p.shield = Math.min(s.shieldMax, p.shield + s.shieldMax);
        p.shieldRegenT = s.shieldCd;
        FX.ring(p.x, p.y, { r: 30, color: '#7af', life: 0.4, width: 2 });
      }
    }
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
    // 护盾优先吸收伤害
    if (p.shield > 0) {
      var absorbed = Math.min(p.shield, real);
      p.shield -= absorbed;
      real -= absorbed;
      p.shieldRegenT = p.stats.shieldCd; // 受击重置护盾恢复计时
      // 纯护盾挡下:只给很短的硬直保护,避免护盾等同于白送无敌
      if (real <= 0) { p.iframe = 0.12; p.hurtFlash = 0.12; AudioSys.play('player_hurt'); return; }
    }
    p.hp -= real;
    p.iframe = 0.3;
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
        burn: 0, burnT: 0, guard: 0,
        buffSpd: 1, buffDmg: 1, buffed: false,
        chargeSeq: 0, chargePhase: 0, blinkT: 0, stiffT: 0, atkCount: 0, skT: 0,
        burrowT: 0, burrowMax: 0
      });
      freeIdx.push(POOL - 1 - i);
    }
    shots.length = 0;
    for (i = 0; i < 200; i++) shots.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, ttl: 0, slow: 0, slowDur: 0, webType: false, col: null, size: 16 });
    lobs.length = 0;
    for (i = 0; i < 40; i++) lobs.push({ alive: false, sx: 0, sy: 0, tx: 0, ty: 0, r: 0, dmg: 0, t: 0, dur: 0 });
    gems.length = 0; freeGem.length = 0;
    for (i = 0; i < 320; i++) { gems.push({ alive: false, x: 0, y: 0, v: 0, pull: false, vx: 0, vy: 0, t: 0 }); freeGem.push(319 - i); }
    items.length = 0;
    for (i = 0; i < 60; i++) items.push({ alive: false, type: '', x: 0, y: 0, v: 0, t: 0, pull: false });
  }

  function aliveEnemies() { return enemies; }

  function spawnEnemy(run, id, x, y, opts) {
    if (!freeIdx.length) return null;
    var def = CFG.ENEMIES[id] || CFG.BOSSES[id];
    if (!def) return null;
    // 统一闸门:不许生在安全区内。豁免两种情况——
    //   allowNear: 分裂子体紧贴母体
    //   def.burrow: 破土怪允许近身冒出(有出土前摇作为反应窗口)
    if (!(opts && opts.allowNear) && !def.burrow) {
      var sp = pushOutOfSafeZone(run, x, y);
      x = sp.x; y = sp.y;
    }
    var e = enemies[freeIdx.pop()];
    var isBoss = !!CFG.BOSSES[id];
    // 联机时按人数放大血量(非线性,避免 2 人难度暴涨)
    var coopHp = run.coopHpMul || 1;
    var mul = run.map.hpMul * (1 + run.t / 60 * CFG.HP_GROWTH) * coopHp;
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
    e.aiT = def.lobCd ? Math.random() * def.lobCd : 0; // 错开抛击节奏,避免齐射
    e.aiPhase = 0;
    e.burn = 0; e.burnT = 0; e.guard = 0;
    e.buffSpd = 1; e.buffDmg = 1; e.buffed = false;
    e.chargeSeq = 0; e.chargePhase = 0; e.stiffT = 0; e.atkCount = 0; e.skT = 0;
    e.guardUsed = false;   // 受击举盾只能触发一次
    e.hop = 0; e.squash = 1; e.leapMark = null; e.jumpFrom = null;
    e.blinkT = 5 + Math.random() * 3;   // 首次瞬移不要一出场就触发
    // 破土出场:期间静止且免伤,给玩家反应时间
    e.burrowMax = def.burrow || 0;
    e.burrowT = e.burrowMax;
    if (opts && opts.elite) {
      e.elite = true;
      e.maxHp *= CFG.ELITE.hpMul; e.hp = e.maxHp;
      e.dmg *= CFG.ELITE.dmgMul; e.r *= 1.3;
      // 精英按类型获得专属强化行为(近战获得冲撞,远程获得瞬移)
      if (e.ai === 'chase') { e.eliteSkill = 'charge'; e.blinkT = 3 + Math.random() * 2; }
      else if (e.ai === 'shoot' || e.ai === 'spitter' || e.ai === 'lobber') { e.eliteSkill = 'blink'; e.blinkT = 5 + Math.random() * 3; }
      else if (e.ai === 'phase') { e.eliteSkill = 'blink'; e.blinkT = 4 + Math.random() * 2; }
      else e.eliteSkill = '';
    } else {
      e.eliteSkill = '';
    }
    if (!run.seen[id]) { run.seen[id] = true; Meta.seeCodex(id); }
    return e;
  }

  // 在玩家周围环上取点。硬约束:结果必须在地图内,且离玩家不近于 SAFE_R。
  // 靠墙时沿环遍历角度找可行位置;真的无解就把点推到安全半径之外(绝不落在玩家身上)。
  function ringPoint(run, radius) {
    var R = CFG.GAME.MAP_R, p = run.player;
    var safe = CFG.GAME.SAFE_R;
    var rad = Math.max(radius, safe + 40);
    var a0 = Math.random() * Math.PI * 2;
    // 沿环等分扫 16 个角度,优先随机起点,保证靠墙时也能找到界内点
    for (var k = 0; k < 16; k++) {
      var a = a0 + (Math.PI * 2 / 16) * k;
      var x = p.x + Math.cos(a) * rad, y = p.y + Math.sin(a) * rad;
      if (x >= -R && x <= R && y >= -R && y <= R) return { x: x, y: y };
    }
    // 退化情形:朝地图中心的反方向推出安全距离,再夹进边界
    var cx = p.x === 0 && p.y === 0 ? 1 : -p.x, cy = p.x === 0 && p.y === 0 ? 0 : -p.y;
    var cl = Math.hypot(cx, cy) || 1;
    return {
      x: E.clamp(p.x + (cx / cl) * rad, -R, R),
      y: E.clamp(p.y + (cy / cl) * rad, -R, R)
    };
  }

  // 生成前的最后一道闸:任何落在安全区内的坐标都推到安全半径之外
  function pushOutOfSafeZone(run, x, y) {
    var p = run.player, safe = CFG.GAME.SAFE_R, R = CFG.GAME.MAP_R;
    var dx = x - p.x, dy = y - p.y;
    var d = Math.hypot(dx, dy);
    if (d >= safe) return { x: x, y: y };
    var a = d > 0.01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
    return {
      x: E.clamp(p.x + Math.cos(a) * (safe + 30), -R, R),
      y: E.clamp(p.y + Math.sin(a) * (safe + 30), -R, R)
    };
  }

  function spawnAtRing(run, id, opts) {
    var def = CFG.ENEMIES[id] || CFG.BOSSES[id];
    // 破土怪不走出生环:直接在玩家周围较近处冒出,用出土前摇代替距离作为公平性保证
    if (def && def.burrow) {
      var R = CFG.GAME.MAP_R, p = run.player;
      var ba = Math.random() * Math.PI * 2;
      var bd = 150 + Math.random() * 190;
      return spawnEnemy(run, id,
        E.clamp(p.x + Math.cos(ba) * bd, -R, R),
        E.clamp(p.y + Math.sin(ba) * bd, -R, R), opts);
    }
    var r = CFG.GAME.SPAWN_R + Math.random() * 80;
    var pt = ringPoint(run, r);
    return spawnEnemy(run, id, pt.x, pt.y, opts);
  }

  // 中心伤害入口(武器调用)
  function damageEnemy(run, e, dmg, opts) {
    if (!e.alive) return 0;
    // 火焰对蛛类双倍伤害(烈焰瓶/火池)
    if (opts && opts.fire && e.def && e.def.ai === 'spitter') dmg *= 2;
    // 破土过程中不可被击中(尚未完全出土)
    if (e.burrowT > 0) return 0;
    // 受击触发举盾:整场只触发一次,触发瞬间这一下伤害仍然生效
    if (e.def && e.def.guardOnHit && !e.guardUsed && e.guard <= 0) {
      e.guardUsed = true;
      e.guard = e.def.guardDur || 1.8;
      FX.ring(e.x, e.y, { r: e.r + 14, color: '#9cf', life: 0.35, width: 3 });
      AudioSys.play('hit1');
    }
    // 举盾期间完全免伤(需要玩家换目标或等待破绽)
    if (e.guard > 0) {
      if ((run.frame & 7) === 0) FX.trail(e.x + (Math.random() * 16 - 8), e.y - 6, '#9cf', 2);
      return 0;
    }
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
    if (e.elite) FX.ring(e.x, e.y, { r: 46, color: '#ff9d5c', life: 0.4, width: 3 });
    else if (e.boss) FX.ring(e.x, e.y, { r: 90, color: '#ffd76b', life: 0.5, width: 4 });
    if (!e.boss) FX.soul(e.x, e.y);   // 普通敌人飘一缕魂光
    AudioSys.play(Math.random() < 0.5 ? 'enemy_die' : 'splat');
    // 分裂
    if (e.def.split && !(opts && opts.noSplit)) {
      for (var i = 0; i < 2; i++) {
        // 分裂子体紧贴母体是预期行为,豁免安全区约束
        var c = spawnEnemy(run, e.def.split, e.x + (Math.random() * 30 - 15), e.y + (Math.random() * 30 - 15), { allowNear: true });
        if (c) c.hp = c.maxHp *= 0.8;
      }
    }
    dropLoot(run, e);
    if (e.boss) {
      Meta.track('bossKill');
      run.bossesKilled++;
      if (run.boss === e) run.boss = null;
      // Boss 死亡:淡出战斗曲,恢复地图背景曲
      AudioSys.playMusic(run.map.music);
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
  // 精英/Boss 光环:精英只强化同类小怪,Boss 强化全部小怪。
  // 每 6 帧重算一次即可,buff 以倍率形式缓存在 e.buffSpd / e.buffDmg。
  function applyAuras(run) {
    var i, e;
    for (i = 0; i < POOL; i++) {
      e = enemies[i];
      if (e.alive) { e.buffSpd = 1; e.buffDmg = 1; e.buffed = false; }
    }
    // 网格已由 updateEnemies 每帧重建。只对每个精英/Boss 查询其光环半径内的小怪,
    // 避免 520×520 全扫描。精英/Boss 数量远小于总敌人数。
    for (i = 0; i < POOL; i++) {
      var src = enemies[i];
      if (!src.alive || (!src.elite && !src.boss)) continue;
      var bd = src.boss ? CFG.BOSSES[src.bossType] : null;
      var r = src.boss ? (bd && bd.auraR ? bd.auraR : 300) : CFG.ELITE.auraR;
      var bs = src.boss ? CFG.ELITE.bossBuffSpd : CFG.ELITE.buffSpd;
      var bdm = src.boss ? CFG.ELITE.bossBuffDmg : CFG.ELITE.buffDmg;
      var srcId = src.id;
      var isBoss = src.boss;
      E.gridQuery(src.x, src.y, r, function (e2) {
        if (e2 === src || e2.elite || e2.boss) return false;
        // 精英只增强同类型小怪,Boss 增强所有类型
        if (!isBoss && e2.id !== srcId) return false;
        if (bs > e2.buffSpd) e2.buffSpd = bs;
        if (bdm > e2.buffDmg) e2.buffDmg = bdm;
        e2.buffed = true;
        return false;
      });
    }
  }

  function updateEnemies(run, dt) {
    var p = run.player;
    E.gridClear();
    var i, e;
    for (i = 0; i < POOL; i++) { e = enemies[i]; if (e.alive) E.gridInsert(e); }
    if ((run.frame % 6) === 0) applyAuras(run);
    var frameParity = (run.frame & 1);

    for (i = 0; i < POOL; i++) {
      e = enemies[i];
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      // 破土出场:静止且不参与碰撞/受伤,出土完成后才正常行动
      if (e.burrowT > 0) {
        e.burrowT -= dt;
        e.vx = 0; e.vy = 0;
        if (e.burrowT <= 0) {
          FX.burst(e.x, e.y, { color: '#6b5a42', n: 10, speed: 70, life: 0.35, size: 2 });
          AudioSys.play('splat');
        }
        continue;
      }
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
      var spd = e.spd * (1 - e.slow) * (e.buffSpd || 1);
      var dx = p.x - e.x, dy = p.y - e.y;
      var dist = Math.hypot(dx, dy) || 1;
      var nx = dx / dist, ny = dy / dist;

      // 精英专属技能:近战连续冲撞 / 远程瞬移(瞬移后僵直)
      if (e.elite && e.eliteSkill && eliteSkill(run, e, dt, nx, ny, dist)) {
        e.x += (e.vx + e.kx) * dt;
        e.y += (e.vy + e.ky) * dt;
        e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
        contactCheck(run, e, p);
        continue;
      }
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
        case 'spitter': // 蛛类:边保持距离边吐减速网
          var sd = e.def.keepDist || 170;
          if (dist > sd + 30) { e.vx = nx * spd; e.vy = ny * spd; }
          else if (dist < sd - 30) { e.vx = -nx * spd * 0.8; e.vy = -ny * spd * 0.8; }
          else { e.vx = -ny * spd * 0.5; e.vy = nx * spd * 0.5; }
          e.aiT -= dt;
          if (e.aiT <= 0 && dist < 380) {
            e.aiT = e.def.shotCd;
            // 蛛网弹:白色黏丝,施加叠层减速;有射程上限且越远越慢
            fireShot(e.x, e.y, nx, ny, e.def.shotSpd,
              e.def.shotDmg * (e.elite ? 1.5 : 1), e.def.slowAmt, e.def.slowDur, true,
              null, 16, e.def.shotRange || 300);
          }
          break;
        case 'shielder': // 重骑:受到攻击后举盾一次,期间完全免伤+霸体(整场只触发一次)
          e.vx = nx * spd; e.vy = ny * spd;
          if (e.guard > 0) {
            e.guard -= dt;
            e.vx *= 0.35; e.vy *= 0.35;
            // 霸体:举盾期间完全忽略击退
            e.kx = 0; e.ky = 0;
          }
          break;
        case 'lobber': // 石像鬼:远程抛物线砸击,落点红圈预警
          var ld = e.def.lobRange || 420;
          if (dist > ld) { e.vx = nx * spd; e.vy = ny * spd; }
          else if (dist < 150) { e.vx = -nx * spd * 0.6; e.vy = -ny * spd * 0.6; }
          else { e.vx = -ny * spd * 0.3; e.vy = nx * spd * 0.3; }
          e.aiT -= dt;
          if (e.aiT <= 0 && dist < ld) {
            e.aiT = e.def.lobCd;
            // 预判玩家去向,给出可躲避的落点
            fireLob(p.x + p.lastVx * 0.35, p.y + p.lastVy * 0.35, e.x, e.y,
              e.def.lobR, e.def.lobDmg * (e.elite ? 1.5 : 1), e.def.lobTravel);
            AudioSys.play('shoot_flask');
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
      // 圣光领域:范围内的敌方弹幕速度上限封顶(减速 20%,不逐帧累乘导致停住)
      if (run.holyAuraR) {
        var hr = run.holyAuraR;
        var hd2 = (sh.x - p.x) * (sh.x - p.x) + (sh.y - p.y) * (sh.y - p.y);
        if (hd2 < hr * hr) {
          var spdCur = Math.hypot(sh.vx, sh.vy);
          var cap = Math.max(40, (sh.capSpd || spdCur) * 0.8);
          if (!sh.capSpd) sh.capSpd = spdCur;
          if (spdCur > cap) { sh.vx *= cap / spdCur; sh.vy *= cap / spdCur; }
          if ((run.frame & 7) === 0) FX.trail(sh.x, sh.y, '#fff3c8', 2);
        } else if (sh.capSpd) {
          sh.capSpd = 0;   // 离开领域后恢复原速
        }
      }
      var dx = sh.vx * dt, dy = sh.vy * dt;
      var moved = Math.hypot(dx, dy);
      sh.travelled += moved;
      // 蛛网弹超出射程自毁,且越远越慢
      if (sh.maxRange > 0) {
        if (sh.travelled > sh.maxRange) { sh.alive = false; continue; }
        var decay = Math.max(0.3, 1 - sh.travelled / sh.maxRange);
        sh.vx = (sh.vx / Math.hypot(sh.vx, sh.vy) || 0) * sh.spd0 * decay;
        sh.vy = (sh.vy / Math.hypot(sh.vx, sh.vy) || 0) * sh.spd0 * decay;
      }
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (E.dist2(sh.x, sh.y, p.x, p.y) < (p.r + 5) * (p.r + 5)) {
        sh.alive = false;
        damagePlayer(run, sh.dmg);
        // 蛛网弹:叠层减速,叠满两层则被完全包裹硬控 1 秒;触发后角色获得 5 秒蛛网免疫
        if (sh.webType) {
          if (p.webImmune > 0) {
            FX.burst(p.x, p.y, { color: '#ffaa22', n: 8, speed: 70, life: 0.3, size: 2 });
            continue;
          }
          if (p.webStacks < 2) p.webStacks++;
          p.slow = sh.slow * (p.webStacks === 2 ? 1.6 : 1);
          p.slowT = Math.max(p.slowT, sh.slowDur);
          p.webT = p.slowT;
          if (p.webStacks >= 2 && p.rootT <= 0) {
            p.rootT = 1.0;              // 硬控:原地无法移动
            p.webStacks = 0;            // 触发后清空,需重新叠
            p.webImmune = 5.0;          // 5 秒免疫
            FX.ring(p.x, p.y, { r: 34, color: '#f4f6ff', life: 0.5, width: 4 });
            FX.burst(p.x, p.y, { color: '#e8ecff', n: 14, speed: 90, life: 0.5, size: 2 });
            AudioSys.play('freeze');
          } else {
            FX.ring(p.x, p.y, { r: 22, color: '#dfe4ff', life: 0.3, width: 2 });
          }
        } else if (sh.slow > 0) {
          p.slow = Math.max(p.slow, sh.slow);
          p.slowT = Math.max(p.slowT, sh.slowDur);
        }
      }
    }
    updateLobs(run, dt);
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

  // 精英专属技能。返回 true 表示本帧已由技能接管移动,跳过常规 AI。
  var ELITE_COL = '#ff9d5c';
  function eliteSkill(run, e, dt, nx, ny, dist) {
    // 瞬移后僵直:输出窗口
    if (e.stiffT > 0) {
      e.stiffT -= dt;
      e.vx = 0; e.vy = 0;
      if ((run.frame & 3) === 0) FX.trail(e.x + (Math.random() * 22 - 11), e.y + (Math.random() * 22 - 11), ELITE_COL, 2);
      return true;
    }
    // 技能自己的计时器 skT,不能复用 aiT——常规 AI 分支每帧都会重置 aiT
    if (e.eliteSkill === 'charge') {
      if (e.chargeSeq > 0) {
        e.skT -= dt;
        if (e.chargePhase === 0) {                 // 蓄力
          e.vx = 0; e.vy = 0; e.flash = 0.05;
          if (e.skT <= 0) {
            e.chargePhase = 1; e.skT = 0.42;
            e.tgtX = nx; e.tgtY = ny;
            FX.ring(e.x, e.y, { r: e.r + 26, color: ELITE_COL, life: 0.28, width: 3 });
          }
        } else {                                    // 冲撞
          e.vx = e.tgtX * 360; e.vy = e.tgtY * 360;
          e.kx = 0; e.ky = 0;                       // 冲撞时霸体
          if ((run.frame & 1) === 0) FX.trail(e.x, e.y, ELITE_COL, 3);
          if (e.skT <= 0) {
            e.chargeSeq--; e.chargePhase = 0;
            e.skT = 0.3;
            FX.shake(3, 0.18);
          }
        }
        return true;
      }
      e.blinkT -= dt;
      if (e.blinkT <= 0 && dist < 340) {            // 触发两段冲撞
        e.blinkT = 5 + Math.random() * 3;
        e.chargeSeq = 2; e.chargePhase = 0; e.skT = 0.45;
        return true;
      }
      return false;
    }
    if (e.eliteSkill === 'blink') {
      e.blinkT -= dt;
      if (e.blinkT <= 0 && dist < 460) {            // 瞬移到玩家背后
        e.blinkT = 6 + Math.random() * 3;
        var p = run.player;
        FX.burst(e.x, e.y, { color: ELITE_COL, n: 12, speed: 130, life: 0.4, size: 2 });
        var pa = Math.atan2(p.lastVy || 0, p.lastVx || 1);
        if (!p.lastVx && !p.lastVy) pa = Math.random() * Math.PI * 2;
        var R = CFG.GAME.MAP_R;
        e.x = E.clamp(p.x - Math.cos(pa) * 70, -R, R);
        e.y = E.clamp(p.y - Math.sin(pa) * 70, -R, R);
        e.stiffT = 0.85;
        FX.burst(e.x, e.y, { color: '#fff', n: 10, speed: 110, life: 0.35, size: 2 });
        AudioSys.play('freeze');
        return true;
      }
      return false;
    }
    return false;
  }

  function contactCheck(run, e, p) {
    var rr = e.r + p.r;
    if (E.dist2(e.x, e.y, p.x, p.y) < rr * rr) damagePlayer(run, e.dmg * (e.buffDmg || 1));
  }

  var shots = [];
  function fireShot(x, y, nx, ny, spd, dmg, slow, slowDur, webType, col, size, maxRange) {
    for (var i = 0; i < shots.length; i++) {
      if (!shots[i].alive) {
        var s = shots[i];
        s.alive = true; s.x = x; s.y = y;
        s.vx = nx * spd; s.vy = ny * spd; s.dmg = dmg; s.ttl = 5;
        s.slow = slow || 0; s.slowDur = slowDur || 0;
        s.webType = webType || false;
        s.col = col || null;          // 自定义配色(Boss 弹幕差异化)
        s.size = size || 16;
        // 蛛网弹:限制飞行距离,并随飞行距离递减速度
        s.maxRange = maxRange || 0;
        s.travelled = 0;
        s.spd0 = spd;
        return;
      }
    }
  }

  // 抛物线砸击:落点先亮红圈,到时结算范围伤害
  var lobs = [];
  function fireLob(tx, ty, sx, sy, r, dmg, travel) {
    for (var i = 0; i < lobs.length; i++) {
      if (!lobs[i].alive) {
        var l = lobs[i];
        l.alive = true; l.sx = sx; l.sy = sy; l.tx = tx; l.ty = ty;
        l.r = r; l.dmg = dmg; l.t = 0; l.dur = travel;
        return l;
      }
    }
    return null;
  }

  function updateLobs(run, dt) {
    var p = run.player;
    for (var i = 0; i < lobs.length; i++) {
      var l = lobs[i];
      if (!l.alive) continue;
      l.t += dt;
      if (l.t >= l.dur) {
        l.alive = false;
        if (l.dmg > 0) {
          FX.explosion(l.tx, l.ty, l.r * 1.4);
          FX.shake(5, 0.25);
          AudioSys.play('bomb');
        }
        // dmg 为 0 的是纯预警标记(史莱姆跳跃),伤害由 Boss 自己结算
        if (l.dmg > 0 && E.dist2(p.x, p.y, l.tx, l.ty) < l.r * l.r) damagePlayer(run, l.dmg);
      }
    }
  }

  // ================= Boss AI =================
  function bossAI(run, e, dt, nx, ny, dist, spd) {
    e.aiT -= dt;
    var p = run.player;
    var bdef = CFG.BOSSES[e.bossType] || {};
    var enrage = (e.bossType === 'boss_darklord' && run.t >= CFG.GAME.RUN_TIME);
    var sMul = enrage ? 1.6 : 1, dMul = enrage ? 2 : 1;
    switch (e.bossType) {
      case 'boss_slimeking': { // 蓄力跳跃:落点显示危险半径,落地后释放一圈弹幕
        var scol = bdef.shotCol || '#7fd44f';
        var LEAP_R = 85;                   // 落地伤害半径(缩小,可躲避)
        if (e.aiPhase === 0) {             // 逼近
          e.vx = nx * spd * 0.6; e.vy = ny * spd * 0.6;
          if (e.aiT <= 0) { e.aiPhase = 1; e.aiT = 0.85; e.vx = 0; e.vy = 0; }
        } else if (e.aiPhase === 1) {      // 蓄力:锁定落点并亮出危险圈
          e.vx = 0; e.vy = 0;
          if (!e.leapMark) {
            // 落点预判玩家去向,但预判量有限,持续移动可以躲开
            var lx = p.x + (p.lastVx || 0) * 0.4, ly = p.y + (p.lastVy || 0) * 0.4;
            var lR = CFG.GAME.MAP_R;
            e.leapX = E.clamp(lx, -lR, lR); e.leapY = E.clamp(ly, -lR, lR);
            e.leapMark = fireLob(e.leapX, e.leapY, e.x, e.y, LEAP_R, 0, 0.85);
            AudioSys.play('elite_spawn');
          }
          // 蓄力时身体压扁的视觉靠 squash 字段
          e.squash = 1 - E.clamp(1 - e.aiT / 0.85, 0, 1) * 0.35;
          if (e.aiT <= 0) {
            e.aiPhase = 2; e.aiT = 0.42;
            e.jumpFrom = { x: e.x, y: e.y };
            e.leapMark = null;             // 预警圈由 updateLobs 自行结束
          }
        } else {                           // 腾空:沿抛物线落到锁定点
          var t01 = 1 - E.clamp(e.aiT / 0.42, 0, 1);
          var jf = e.jumpFrom || { x: e.x, y: e.y };
          e.x = E.lerp(jf.x, e.leapX, t01);
          e.y = E.lerp(jf.y, e.leapY, t01);
          e.hop = Math.sin(t01 * Math.PI) * 70;   // 绘制时抬高
          e.squash = 1 + Math.sin(t01 * Math.PI) * 0.25;
          e.vx = 0; e.vy = 0;
          if (e.aiT <= 0) {
            e.aiPhase = 0; e.aiT = 20;    // 20 秒冷却,不会一直跳
            e.hop = 0; e.squash = 1;
            FX.ring(e.x, e.y, { r: LEAP_R, color: scol, life: 0.45, width: 5 });
            FX.explosion(e.x, e.y, LEAP_R);
            FX.shake(8, 0.35);
            AudioSys.play('splat');
            // 落地范围伤害
            if (E.dist2(p.x, p.y, e.x, e.y) < LEAP_R * LEAP_R) {
              damagePlayer(run, e.dmg * 1.2 * dMul);
            }
            // 落地释放一圈腐液弹
            for (var sj = 0; sj < 12; sj++) {
              var sa = (Math.PI * 2 / 12) * sj + run.t * 0.5;
              fireShot(e.x, e.y, Math.cos(sa), Math.sin(sa), 130, e.dmg * 0.35 * dMul, 0.25, 1.2, false, scol);
            }
            for (var i = 0; i < 2; i++) spawnEnemy(run, 'slime', e.x + (Math.random() * 60 - 30), e.y + (Math.random() * 60 - 30), { allowNear: true });
          }
        }
        break;
      }
      case 'boss_bonelord': { // 环形骨矢 + 在玩家周围召唤破土骷髅
        var bcol = bdef.shotCol;
        // 召唤序列:原地吟唱,然后在玩家四周让骷髅从地里爬出来
        if (e.chargeSeq > 0) {
          e.skT -= dt;
          if (e.chargePhase === 0) {          // 吟唱(原地闪烁,给玩家反应时间)
            e.vx = 0; e.vy = 0; e.flash = 0.05;
            if ((run.frame & 3) === 0) FX.trail(e.x + (Math.random() * 40 - 20), e.y - 10, bcol, 3);
            if (e.skT <= 0) {
              e.chargePhase = 1; e.skT = 0.25;
              FX.ring(e.x, e.y, { r: 80, color: bcol, life: 0.4, width: 4 });
              AudioSys.play('elite_spawn');
              if (run.cb.onWarn) run.cb.onWarn('骸骨领主召唤亡者!');
            }
          } else {                             // 分批破土,每批 3 只
            e.vx = 0; e.vy = 0;
            if (e.skT <= 0) {
              e.chargeSeq--;
              e.skT = 0.35;
              for (var bj = 0; bj < 3; bj++) {
                var ba = Math.random() * Math.PI * 2;
                var bdst = 110 + Math.random() * 130;
                var bR = CFG.GAME.MAP_R;
                // skeleton 自带 burrow,会播出土动画且期间免伤
                spawnEnemy(run, 'skeleton',
                  E.clamp(p.x + Math.cos(ba) * bdst, -bR, bR),
                  E.clamp(p.y + Math.sin(ba) * bdst, -bR, bR));
              }
              FX.shake(3, 0.2);
              if (e.chargeSeq <= 0) e.aiT = 1.6;
            }
          }
          break;
        }
        e.vx = nx * spd * 0.8; e.vy = ny * spd * 0.8;
        if (e.aiT <= 0) {
          e.aiT = 3.2;
          e.aiPhase++;
          // 用独立计数器决定冲撞时机:aiPhase 同时被当作弹幕旋转角,不能兼作节奏计数
          e.atkCount = (e.atkCount || 0) + 1;
          if (e.atkCount % 3 === 0) {          // 每三轮转入召唤(3 批 × 3 只)
            e.chargeSeq = 3; e.chargePhase = 0; e.skT = 0.9;
            break;
          }
          var n = 14;
          for (var j = 0; j < n; j++) {
            var a = (Math.PI * 2 / n) * j + e.aiPhase * 0.3;
            fireShot(e.x, e.y, Math.cos(a), Math.sin(a), 130, e.dmg * 0.6 * dMul, 0, 0, false, bcol);
          }
          AudioSys.play('shoot_bolt');
        }
        break;
      }
      case 'boss_abysseye': { // 螺旋弹幕 + 瞬移到背后 + 召唤
        var acol = bdef.shotCol;
        // 瞬移后僵直:不能移动也不能开火,是玩家的输出窗口
        if (e.stiffT > 0) {
          e.stiffT -= dt;
          e.vx = 0; e.vy = 0;
          if ((run.frame & 3) === 0) FX.trail(e.x + (Math.random() * 30 - 15), e.y + (Math.random() * 30 - 15), acol, 3);
          break;
        }
        e.blinkT -= dt;
        if (e.blinkT <= 0) {                   // 瞬移到玩家背后
          e.blinkT = 7 + Math.random() * 3;
          FX.burst(e.x, e.y, { color: acol, n: 18, speed: 150, life: 0.45, size: 3 });
          FX.ring(e.x, e.y, { r: 60, color: acol, life: 0.4, width: 3 });
          // 落在玩家移动方向的反侧(背后)
          var pa = Math.atan2(p.lastVy || 0, p.lastVx || 1);
          if (!p.lastVx && !p.lastVy) pa = Math.random() * Math.PI * 2;
          var bx = p.x - Math.cos(pa) * 90, by = p.y - Math.sin(pa) * 90;
          var R2 = CFG.GAME.MAP_R;
          e.x = E.clamp(bx, -R2, R2); e.y = E.clamp(by, -R2, R2);
          e.stiffT = 1.1;                      // 僵直窗口
          FX.burst(e.x, e.y, { color: '#fff', n: 14, speed: 120, life: 0.4, size: 2 });
          FX.shake(6, 0.3);
          AudioSys.play('freeze');
          if (run.cb.onWarn) run.cb.onWarn('深渊之眼消失了……');
          break;
        }
        if (dist > 260) { e.vx = nx * spd; e.vy = ny * spd; }
        else { e.vx = -ny * spd * 0.7; e.vy = nx * spd * 0.7; }
        e.aiPhase += dt * 2.2;
        if (e.aiT <= 0) {
          e.aiT = 0.28;
          fireShot(e.x, e.y, Math.cos(e.aiPhase), Math.sin(e.aiPhase), 150, e.dmg * 0.5 * dMul, 0, 0, false, acol);
          fireShot(e.x, e.y, Math.cos(e.aiPhase + Math.PI), Math.sin(e.aiPhase + Math.PI), 150, e.dmg * 0.5 * dMul, 0, 0, false, acol);
        }
        e.burnT = 0;
        if ((run.frame % 480) === 0) {
          for (var k = 0; k < 3; k++) spawnAtRing(run, 'ghost');
          AudioSys.play('elite_spawn');
        }
        break;
      }
      case 'boss_darklord': { // 终局:径向弹幕 + 冲撞 + 瞬移,狂暴后全面加速
        var dcol = bdef.shotCol;
        if (e.stiffT > 0) {                    // 瞬移后僵直
          e.stiffT -= dt;
          e.vx = 0; e.vy = 0;
          if ((run.frame & 3) === 0) FX.trail(e.x + (Math.random() * 34 - 17), e.y + (Math.random() * 34 - 17), dcol, 3);
          break;
        }
        if (e.chargeSeq > 0) {                 // 冲撞连段(用 skT,aiT 被弹幕节奏占用)
          e.skT -= dt;
          if (e.chargePhase === 0) {
            e.vx = 0; e.vy = 0; e.flash = 0.05;
            if (e.skT <= 0) {
              e.chargePhase = 1; e.skT = 0.5;
              e.tgtX = nx; e.tgtY = ny;
              FX.ring(e.x, e.y, { r: 80, color: dcol, life: 0.3, width: 4 });
            }
          } else {
            e.vx = e.tgtX * (enrage ? 520 : 450); e.vy = e.tgtY * (enrage ? 520 : 450);
            e.kx = 0; e.ky = 0;
            if ((run.frame & 1) === 0) FX.trail(e.x, e.y, dcol, 5);
            if (e.skT <= 0) {
              e.chargeSeq--; e.chargePhase = 0;
              e.skT = 0.4;
              e.aiT = e.chargeSeq > 0 ? 0.4 : 1.2;
              FX.shake(6, 0.3);
              for (var dj = 0; dj < 8; dj++) {
                var da = (Math.PI * 2 / 8) * dj + run.t;
                fireShot(e.x, e.y, Math.cos(da), Math.sin(da), 150, e.dmg * 0.4 * dMul, 0, 0, false, dcol);
              }
            }
          }
          break;
        }
        e.blinkT -= dt;
        if (e.blinkT <= 0) {                   // 瞬移
          e.blinkT = (enrage ? 6 : 9) + Math.random() * 3;
          FX.burst(e.x, e.y, { color: dcol, n: 20, speed: 170, life: 0.45, size: 3 });
          var dpa = Math.atan2(p.lastVy || 0, p.lastVx || 1);
          if (!p.lastVx && !p.lastVy) dpa = Math.random() * Math.PI * 2;
          var R3 = CFG.GAME.MAP_R;
          e.x = E.clamp(p.x - Math.cos(dpa) * 100, -R3, R3);
          e.y = E.clamp(p.y - Math.sin(dpa) * 100, -R3, R3);
          e.stiffT = enrage ? 0.75 : 1.0;
          FX.shake(7, 0.35);
          AudioSys.play('freeze');
          break;
        }
        e.vx = nx * spd * sMul; e.vy = ny * spd * sMul;
        e.aiPhase += dt * 1.8;
        if (e.aiT <= 0) {
          e.aiT = enrage ? 1.6 : 2.6;
          e.atkCount = (e.atkCount || 0) + 1;
          if (e.atkCount % 3 === 0) {          // 每三轮弹幕后冲撞
            e.chargeSeq = enrage ? 3 : 2; e.chargePhase = 0; e.skT = 0.55;
            if (run.cb.onWarn) run.cb.onWarn('⚠ 暗潮魔王冲锋!');
            break;
          }
          var nn = enrage ? 20 : 12;
          for (var q = 0; q < nn; q++) {
            var aa = (Math.PI * 2 / nn) * q + e.aiPhase;
            fireShot(e.x, e.y, Math.cos(aa), Math.sin(aa), 160, e.dmg * 0.5 * dMul, 0, 0, false, dcol);
          }
          AudioSys.play('shoot_bolt');
        }
        if ((run.frame % 22) === 0) FX.trail(e.x + (Math.random() * 40 - 20), e.y + (Math.random() * 40 - 20), '#7a3cff', 4);
        break;
      }
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
    // 联机时经验按人数稀释,保证升级节奏不因多人分摊而失控
    var gain = v * run.player.stats.growth * (run.coopXpMul || 1);
    // 联机共享经验池:加给所有人,升级节奏一致
    if (run.coopXp) {
      run.coopXp += gain;
      while (run.coopXp >= run.xpNeed) {
        run.coopXp -= run.xpNeed;
        run.level++;
        run.xpNeed = CFG.XP_NEED(run.level);
        run.pendingLevels++;
        Meta.trackBest('level', run.level);
        if (run.onCoopLevel) run.onCoopLevel(run.level);
      }
      return;
    }
    run.xp += gain;
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
        it.alive = true; it.type = type; it.x = x; it.y = y; it.t = 0; it.pull = false;
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
      if (it.pull || (it.type === 'coin' && d2 < pr * pr && d2 > 24 * 24)) {
        var d = Math.sqrt(d2) || 1;
        var isp = it.pull ? 620 : 380;
        it.x += (p.x - it.x) / d * isp * dt;
        it.y += (p.y - it.y) / d * isp * dt;
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
        // 金币同样被吸取
        for (var mi = 0; mi < items.length; mi++) {
          if (items[mi].alive && items[mi].type === 'coin') items[mi].pull = true;
        }
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

  // 火焰净化蛛网:烧掉飞行中的蛛网弹,若角色在范围内则清除缠身与定身
  function cleanseWebs(run, x, y, radius) {
    var r2 = radius * radius, i, burned = 0;
    for (i = 0; i < shots.length; i++) {
      var sh = shots[i];
      if (!sh.alive || !sh.webType) continue;
      if (E.dist2(sh.x, sh.y, x, y) > r2) continue;
      sh.alive = false; burned++;
      FX.burst(sh.x, sh.y, { color: '#ffaa44', n: 5, speed: 60, life: 0.28, size: 2 });
    }
    var p = run.player;
    if (E.dist2(p.x, p.y, x, y) <= r2 && (p.webStacks > 0 || p.rootT > 0)) {
      p.webStacks = 0; p.webT = 0; p.rootT = 0;
      if (p.slow > 0) { p.slow = 0; p.slowT = 0; }
      FX.burst(p.x, p.y, { color: '#ffbb55', n: 12, speed: 90, life: 0.4, size: 2 });
      burned++;
    }
    return burned;
  }

  // 当前存活的远程怪数量(用于总量上限)
  function countRanged() {
    var n = 0;
    for (var i = 0; i < POOL; i++) {
      var e = enemies[i];
      if (e.alive && !e.boss && e.def && e.def.ranged) n++;
    }
    return n;
  }
  // 从本波配置里挑一个近战怪作为替补
  function pickMeleeFrom(ids) {
    var cand = [];
    for (var i = 0; i < ids.length; i++) {
      var d = CFG.ENEMIES[ids[i]];
      if (d && !d.ranged) cand.push(ids[i]);
    }
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
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
    run.spawnAcc += dt * w.rate * run.map.rateMul * (run.coopRateMul || 1) *
                    (run.endless ? 1 + (t - CFG.GAME.RUN_TIME) / 300 : 1);
    var aliveCount = POOL - freeIdx.length;
    while (run.spawnAcc >= 1) {
      run.spawnAcc -= 1;
      if (aliveCount >= CFG.GAME.ENEMY_CAP) continue;
      var pickId = w.ids[Math.floor(Math.random() * w.ids.length)];
      var pdef = CFG.ENEMIES[pickId];
      // spawnWeight < 1 的怪按概率跳过(蜘蛛刷新量砍半)
      if (pdef && pdef.spawnWeight !== undefined && Math.random() > pdef.spawnWeight) continue;
      // 远程怪总量上限:满了就换成近战填充,避免满屏弹幕
      if (pdef && pdef.ranged && countRanged() >= CFG.GAME.RANGED_CAP) {
        var melee = pickMeleeFrom(w.ids);
        if (!melee) continue;
        pickId = melee;
      }
      spawnAtRing(run, pickId);
      aliveCount++;
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
    // 切到该 Boss 的专属战斗曲
    var bd = CFG.BOSSES[b.bossType];
    if (bd && bd.music) AudioSys.playMusic(bd.music);
    AudioSys.setIntensity(3);
    FX.shake(8, 0.6);
    if (run.cb.onBoss) run.cb.onBoss(bd);
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

  // 抛击落点红圈:画在地面层,避免遮挡角色
  function drawLobMarkers(ctx, run) {
    for (var i = 0; i < lobs.length; i++) {
      var l = lobs[i];
      if (!l.alive) continue;
      var prog = E.clamp(l.t / l.dur, 0, 1);
      // 外圈固定,内圈收缩表示剩余时间
      ctx.globalAlpha = 0.30 + prog * 0.35;
      ctx.strokeStyle = '#ff4455';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(l.tx, l.ty, l.r, 0, Math.PI * 2); ctx.stroke();
      var ir = l.r * (1 - prog);
      if (ir > 1) {
        ctx.globalAlpha = 0.45 + prog * 0.4;
        ctx.fillStyle = 'rgba(255,70,90,0.22)';
        ctx.beginPath(); ctx.arc(l.tx, l.ty, ir, 0, Math.PI * 2); ctx.fill();
      }
      // 即将落地时闪烁警示
      if (prog > 0.8) {
        ctx.globalAlpha = (Math.floor(run.t * 20) & 1) ? 0.7 : 0.2;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(l.tx, l.ty, l.r - 3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
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
      // 破土动画:翻起的土堆 + 从地下逐渐升起的怪(用裁剪实现"半截在土里")
      if (e.burrowT > 0) {
        var prog = 1 - e.burrowT / (e.burrowMax || 1);   // 0→1
        var moundW = 26 + prog * 10;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#4a3a28';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 4, moundW * 0.5, 6 + prog * 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b5a42';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 2, moundW * 0.38, 4 + prog * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // 只显示地面以上的部分
        ctx.save();
        ctx.beginPath();
        ctx.rect(e.x - 24, e.y - 40, 48, 40 + 4);
        ctx.clip();
        var rise = (1 - prog) * 26;   // 未出土时整体下沉
        drawSprite(ctx, e.id, animF + (e.animo | 0), e.x, e.y + rise, sc, e.face < 0, 1, '#8a7a5a');
        ctx.restore();
        // 飞溅的土屑
        if ((run.frame & 7) === 0) FX.trail(e.x + (Math.random() * 20 - 10), e.y, '#6b5a42', 2);
        continue;
      }
      ctx.globalAlpha = 0.4;
      ctx.drawImage(shadow, e.x - 12 * sc, e.y + e.r * 0.7, 24 * sc, 8 * sc);
      ctx.globalAlpha = 1;
      var tint = null;
      if (e.guard > 0) tint = '#9cf';
      else if (e.flash > 0) tint = '#ffffff';
      else if (run.freezeT > 0 || e.frozen > 0) tint = '#5fd0ff';
      else if (e.slowT > 0) tint = '#8ab6ff';
      var wob = e.boss ? 0 : Math.sin(run.t * 8 + e.animo) * 1.5;
      // 史莱姆跳跃:hop 抬高机体,squash 做蓄力压扁/腾空拉伸
      var hop = e.hop || 0, sq = e.squash || 1;
      drawSprite(ctx, e.boss ? e.bossType : e.id, animF + (e.animo | 0),
                 e.x, e.y + wob - hop, sc * sq, e.face < 0, e.alpha, tint);
      if (e.elite) drawSprite(ctx, 'elite_crown', 0, e.x, e.y - e.r - 12, 1, false, 1, null);
      // 被强化的小怪:显示淡色光环表示受精英/Boss 增益
      if (e.buffed && !e.elite && !e.boss) {
        ctx.globalAlpha = 0.28 + Math.sin(run.t * 5 + e.animo) * 0.12;
        ctx.strokeStyle = '#ffdd66';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * sc + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 举盾:画护罩表示当前免伤
      if (e.guard > 0) {
        ctx.globalAlpha = 0.5 + Math.sin(run.t * 12) * 0.2;
        ctx.strokeStyle = '#9cf';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * sc + 8, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
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
    var webImg = SpriteGen.get('p_web');
    for (i = 0; i < shots.length; i++) {
      var sh = shots[i];
      if (!sh.alive) continue;
      if (sh.webType) { ctx.drawImage(webImg, sh.x - 9, sh.y - 9, 18, 18); continue; }
      if (sh.col) {
        // Boss 专属配色弹幕:发光核心 + 外圈,和普通红弹明显区分
        var sr = (sh.size || 16) * 0.42;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = sh.col;
        ctx.beginPath(); ctx.arc(sh.x, sh.y, sr * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = sh.col;
        ctx.beginPath(); ctx.arc(sh.x, sh.y, sr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sh.x - sr * 0.25, sh.y - sr * 0.25, sr * 0.42, 0, Math.PI * 2); ctx.fill();
        continue;
      }
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
    // 蛛网缠身:白色丝痕附着在角色身上,随减速结束而消失;硬控时整体被网包裹
    if (p.webStacks > 0 || p.rootT > 0) drawWebOnPlayer(ctx, run, p);
  }

  // 角色身上的蛛网痕迹:一层为几道丝,二层/硬控为完整网罩
  function drawWebOnPlayer(ctx, run, p) {
    var full = p.rootT > 0;
    var a = full ? 0.85 : (p.webStacks >= 2 ? 0.7 : 0.45);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#f4f6ff';
    ctx.lineWidth = full ? 1.6 : 1.2;
    var r = full ? 15 : 12;
    // 放射丝
    var spokes = full ? 8 : 4;
    for (var k = 0; k < spokes; k++) {
      var ang = (Math.PI * 2 / spokes) * k + (full ? 0 : 0.4);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 2);
      ctx.lineTo(p.x + Math.cos(ang) * r, p.y - 2 + Math.sin(ang) * r);
      ctx.stroke();
    }
    // 同心环(只有完全包裹时画满)
    var rings = full ? 3 : 1;
    for (var q = 1; q <= rings; q++) {
      ctx.globalAlpha = a * (0.8 - q * 0.12);
      ctx.beginPath();
      ctx.arc(p.x, p.y - 2, r * (q / (rings + 0.4)), 0, Math.PI * 2);
      ctx.stroke();
    }
    // 硬控时额外闪一层高光,表示无法移动
    if (full) {
      ctx.globalAlpha = 0.35 + Math.sin(run.t * 18) * 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y - 2, r * 0.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ================= 联机:快照应用与队友渲染 =================
  // 客户端不跑敌人 AI,直接用房主快照重建世界。位置做插值以掩盖 15Hz 的快照间隔。
  function applySnapshot(run, snap) {
    var i, s, e;
    // 敌人:按快照重建(超出快照数量的槽位回收)
    for (i = 0; i < POOL; i++) {
      if (enemies[i].alive) { enemies[i].alive = false; freeIdx.push(i); }
    }
    for (i = 0; i < snap.e.length && freeIdx.length; i++) {
      s = snap.e[i];
      e = enemies[freeIdx.pop()];
      var def = CFG.ENEMIES[s.i] || CFG.BOSSES[s.i];
      if (!def) continue;
      e.alive = true; e.uid = s.u; e.id = s.i; e.def = def;
      e.x = s.x; e.y = s.y;
      e.hp = s.h; e.maxHp = s.m;
      e.r = def.r; e.dmg = def.dmg; e.spd = def.spd;
      e.boss = !!CFG.BOSSES[s.i]; e.bossType = e.boss ? s.i : '';
      e.elite = !!s.el; e.face = s.f || 1;
      e.flash = 0; e.alpha = 1; e.animo = (s.u % 10);
      e.guard = s.g || 0; e.burrowT = s.b || 0; e.burrowMax = def.burrow || 0;
      e.buffed = !!s.bf; e.buffSpd = 1; e.buffDmg = 1;
      e.slow = 0; e.slowT = 0; e.stun = 0; e.frozen = 0; e.kx = 0; e.ky = 0;
    }
    // 敌方弹幕
    for (i = 0; i < shots.length; i++) shots[i].alive = false;
    for (i = 0; i < snap.s.length && i < shots.length; i++) {
      s = snap.s[i];
      shots[i].alive = true;
      shots[i].x = s.x; shots[i].y = s.y; shots[i].vx = s.vx; shots[i].vy = s.vy;
      shots[i].webType = !!s.w; shots[i].col = s.c || null; shots[i].size = s.z || 16;
      shots[i].dmg = 0; shots[i].ttl = 5;   // 客户端不做伤害判定
    }
    // 抛击落点预警
    for (i = 0; i < lobs.length; i++) lobs[i].alive = false;
    for (i = 0; i < snap.l.length && i < lobs.length; i++) {
      s = snap.l[i];
      lobs[i].alive = true;
      lobs[i].tx = s.x; lobs[i].ty = s.y; lobs[i].r = s.r;
      lobs[i].t = s.t; lobs[i].dur = s.d; lobs[i].dmg = 0;
    }
    // 经验宝石与掉落物
    for (i = 0; i < gems.length; i++) { if (gems[i].alive) { gems[i].alive = false; freeGem.push(i); } }
    for (i = 0; i < snap.g.length && freeGem.length; i++) {
      s = snap.g[i];
      var g = gems[freeGem.pop()];
      g.alive = true; g.x = s.x; g.y = s.y; g.v = s.v; g.pull = false; g.t = 0;
    }
    for (i = 0; i < items.length; i++) items[i].alive = false;
    for (i = 0; i < snap.it.length && i < items.length; i++) {
      s = snap.it[i];
      items[i].alive = true; items[i].type = s.k;
      items[i].x = s.x; items[i].y = s.y; items[i].t = 0; items[i].pull = false;
    }
    run.t = snap.t;
    if (snap.bh !== undefined) run.bossHpPct = snap.bh;
  }

  // 渲染远端队友(名字牌 + 倒地状态)
  function drawMates(ctx, run, mates) {
    if (!mates || !mates.length) return;
    var animF = Math.floor(run.t * 6);
    var shadow = SpriteGen.get('vfx_shadow');
    for (var i = 0; i < mates.length; i++) {
      var m = mates[i];
      if (!m.charId) continue;
      var cd = null;
      for (var k = 0; k < CFG.CHARS.length; k++) if (CFG.CHARS[k].id === m.charId) cd = CFG.CHARS[k];
      if (!cd) continue;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(shadow, m.x - 12, m.y + 8, 24, 8);
      ctx.globalAlpha = 1;
      if (m.downed) {
        // 倒地:横躺 + 救援进度环
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(Math.PI / 2);
        drawSprite(ctx, cd.sprite, 0, 0, 0, 1, false, 0.55, '#ff6688');
        ctx.restore();
        if (m.reviveT > 0) {
          var pr = E.clamp(m.reviveT / CFG.COOP.reviveTime, 0, 1);
          ctx.strokeStyle = '#7ce87c'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(m.x, m.y - 18, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
          ctx.stroke();
        }
      } else {
        drawSprite(ctx, cd.sprite, m.moving ? animF : 0, m.x, m.y, 1, m.face < 0, 1, null);
        // 队友身上的光环增益提示
        if (m.buffed) {
          ctx.globalAlpha = 0.35 + Math.sin(run.t * 5) * 0.15;
          ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      // 名字 + 血条
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = m.downed ? '#ff8b94' : '#cfe6ff';
      ctx.fillText(m.name || '队友', m.x, m.y - 26);
      ctx.textAlign = 'left';
      if (m.hpPct !== undefined && m.hpPct < 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(m.x - 14, m.y - 23, 28, 3);
        ctx.fillStyle = m.hpPct < 0.3 ? '#ff5964' : '#6ee86e';
        ctx.fillRect(m.x - 14, m.y - 23, 28 * Math.max(0, m.hpPct), 3);
      }
    }
  }

  function reset() { initPools(); }

  // 清空全部敌人并正确归还空位(测试用;直接改 alive 会让池子永久占满)
  function clearEnemies(run) {
    for (var i = 0; i < POOL; i++) {
      if (enemies[i].alive) {
        enemies[i].alive = false;
        freeIdx.push(i);
      }
    }
    if (run) run.boss = null;
  }

  function countAlive() { return POOL - freeIdx.length; }

  return {
    makePlayer: makePlayer, recomputeStats: recomputeStats, recomputeStatsFor: recomputeStatsFor,
    updatePlayer: updatePlayer, damagePlayer: damagePlayer,
    spawnEnemy: spawnEnemy, spawnAtRing: spawnAtRing,
    damageEnemy: damageEnemy, killEnemy: killEnemy,
    updateEnemies: updateEnemies, updateGems: updateGems, updateItems: updateItems,
    spawnGem: spawnGem, spawnItem: spawnItem, addXp: addXp, bombBlast: bombBlast,
    director: director, draw: draw, drawLobMarkers: drawLobMarkers, reset: reset,
    clearEnemies: clearEnemies, cleanseWebs: cleanseWebs,
    pool: enemies, countAlive: countAlive, drawSprite: drawSprite,
    getGems: function () { return gems; },
    getItems: function () { return items; },
    getShots: function () { return shots; },
    getLobs: function () { return lobs; },
    // 联机:客户端用房主快照覆盖本地世界
    applySnapshot: applySnapshot,
    drawMates: drawMates
  };
})();
