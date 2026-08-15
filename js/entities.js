// entities.js — 玩家 / 敌人AI / Boss / 掉落拾取 / 刷怪导演
window.Entities = (function () {
  'use strict';
  var E = Engine;

  // ================= 玩家 =================
  function makePlayer(charDef) {
    return {
      x: 0, y: 0, r: 10,
      hp: 100, iframe: 0, hurtFlash: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0,
      face: 1, dir: 'down', moving: false, animT: 0,
      attackAnimT: 0, attackAnimAge: 0,
      char: charDef,
      shield: 0, shieldRegenT: 0,  // 护盾当前值 / 下次恢复计时
      revivesUsed: 0,              // 已消耗的复活次数;stats.revive 会被 recompute 重建,消耗必须单独记
      lastVx: 0, lastVy: 0,        // 移动矢量,敌人抛击用于预判落点
      slow: 0, slowT: 0,                        // 蛛网减速
      webStacks: 0, webT: 0, rootT: 0,          // 蛛网叠层 / 缠身残留 / 硬控计时
      webImmune: 0,                             // 被定身后的蛛网免疫计时
      stats: null
    };
  }

  // 联机玩家列表:每个条目是 { player, weapons, passives, downed, reviveT, peerId, name, isHost }。
  // 单机模式只有一个"房主"条目,联机房主由 main.js 填充完整列表。
  function playerEntries(run) {
    return run.coopPlayers || [{
      player: run.player, weapons: run.weapons, passives: run.passives,
      isHost: true, downed: false, reviveT: 0, peerId: 'host', name: ''
    }];
  }

  function alivePlayers(run) {
    var ents = playerEntries(run), out = [];
    for (var i = 0; i < ents.length; i++) {
      if (!ents[i].downed && ents[i].player.hp > 0) out.push(ents[i]);
    }
    return out;
  }

  // 敌人 AI 的索敌目标:最近的存活玩家
  function nearestPlayer(run, x, y) {
    var ents = playerEntries(run), best = null, bd = 1e18;
    for (var i = 0; i < ents.length; i++) {
      var w = ents[i];
      if (w.downed || w.player.hp <= 0) continue;
      var d = E.dist2(w.player.x, w.player.y, x, y);
      if (d < bd) { bd = d; best = w; }
    }
    return best || (ents.length ? ents[0] : null);
  }

  function randomPlayer(run) {
    var alive = alivePlayers(run);
    var pool = alive.length ? alive : playerEntries(run);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  function markTeamDowned(run, w) {
    if (!w) return false;
    var p = w.player;
    p.hp = 0;
    p.downed = true;
    p.reviveT = 0;
    w.downed = true;
    w.reviveT = 0;
    if (run.cb && run.cb.onWarn) run.cb.onWarn('⚠ ' + (w.name || '队友') + ' 倒下了!');

    var ents = playerEntries(run);
    for (var i = 0; i < ents.length; i++) {
      if (!ents[i].downed && ents[i].player.hp > 0) return true;
    }
    run.over = true;
    run.victory = false;
    return true;
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
    // Each ultimate is a small run-wide breakthrough: +20 maximum health
    // plus restrained all-round stats, immediately recalculated on evolve.
    var evolvedCount = 0;
    for (var wi = 0; wi < run.weapons.length; wi++) if (run.weapons[wi].evolved) evolvedCount++;
    if (evolvedCount) {
      s.hp += evolvedCount * 20;
      s.might *= 1 + evolvedCount * 0.025;
      s.speed *= 1 + evolvedCount * 0.012;
      s.armor += evolvedCount * 0.35;
      s.cd *= Math.max(0.82, 1 - evolvedCount * 0.012);
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
    p.dashCd = Math.max(0, (p.dashCd || 0) - dt);
    var dash = E.consumeDash && E.consumeDash();
    if (dash && p.dashCd <= 0 && p.rootT <= 0) {
      p.dashX = dash.x; p.dashY = dash.y; p.dashT = 0.19;
      p.dashCd = Math.max(3.5, 10 - (run.passives.ps_boots || 0) * 1.15);
      p.iframe = Math.max(p.iframe, 0.22);
      p.dashHit = {};
      FX.ring(p.x, p.y, { r: 26, color: '#d8d2ff', life: 0.16, width: 2 });
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      iv.x = p.dashX; iv.y = p.dashY;
      p.iframe = Math.max(p.iframe, 0.08);
      // Melee characters turn the dash into a short, controlled body check.
      if (p.char && (p.char.id === 'knight' || p.char.id === 'berserker')) {
        E.gridQuery(p.x, p.y, 34, function (e) {
          if (p.dashHit[e.uid]) return false;
          p.dashHit[e.uid] = 1;
          damageEnemy(run, e, 12 + p.stats.might * 12, { kx: p.dashX * 180, ky: p.dashY * 180, noCrit: true });
          return false;
        });
      }
    }
    if (E.keys().KeyE) tryExitGate(run, p);
    p.moving = (iv.x !== 0 || iv.y !== 0);
    // 蛛网减速 / 硬控:二层叠加后被包裹,原地无法移动
    if (p.slowT > 0) { p.slowT -= dt; if (p.slowT <= 0) { p.slow = 0; p.webStacks = 0; } }
    if (p.webT > 0) { p.webT -= dt; if (p.webT <= 0) p.webStacks = 0; }
    if (p.webImmune > 0) p.webImmune -= dt;
    if (p.rootT > 0) { p.rootT -= dt; iv.x = 0; iv.y = 0; p.moving = false; }
    var terrain = E.terrainEffect ? E.terrainEffect(run.map, p.x, p.y) : { mul: 1, type: 'ground' };
    p.terrainType = terrain.type;
    p.terrainMul = terrain.mul;
    var mspd = s.speed * (1 - (p.slow || 0)) * terrain.mul * (p._rageSpeedMul || 1) * (p._stormSpeedMul || 1);
    if (p.dashT > 0) mspd *= 3.35;
    // 记录当前速度矢量,供敌人抛击预判落点
    p.lastVx = iv.x * mspd;
    p.lastVy = iv.y * mspd;
    if (p.moving) {
      p.x += iv.x * mspd * dt;
      p.y += iv.y * mspd * dt;
      // 脚步尘土(隔帧少量,避免粒子池被占满)
      if ((run.frame & 3) === 0) {
        var stepCol = terrain.type === 'swamp' ? '#60764b' :
          (terrain.type === 'road' ? '#a49272' : (terrain.type === 'water' ? '#4f8295' : '#8f8295'));
        FX.step(p.x, p.y + 20, stepCol);
      }
      if (Math.abs(iv.x) > Math.abs(iv.y)) {
        p.dir = iv.x >= 0 ? 'right' : 'left';
      } else {
        p.dir = iv.y >= 0 ? 'down' : 'up';
      }
      if (iv.x > 0.01) p.face = 1; else if (iv.x < -0.01) p.face = -1;
      p.animT += dt;
    }
    // 地图边界:玩家不能越出结界
    var R = CFG.GAME.MAP_R;
    p.x = E.clamp(p.x, -R, R);
    p.y = E.clamp(p.y, -R, R);
    if (E.resolveDecorCollision) E.resolveDecorCollision(run.map, p);
    if (p.iframe > 0) p.iframe -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.attackAnimT > 0) {
      p.attackAnimT = Math.max(0, p.attackAnimT - dt);
      p.attackAnimAge += dt;
    }
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
    // 镜头在地图边界处停止，玩家仍可沿屏幕边缘独立移动。
    var cmX = Math.max(0, R - CFG.GAME.W / 2), cmY = Math.max(0, R - CFG.GAME.H / 2);
    E.cam.x = E.clamp(E.cam.x, -cmX, cmX);
    E.cam.y = E.clamp(E.cam.y, -cmY, cmY);
  }

  function damagePlayer(run, dmg) {
    var p = run.player;
    if (p.iframe > 0 || p.knightImmuneT > 0 || run.over) return;
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
      if (p.stats.revive - (p.revivesUsed || 0) > 0) {
        p.revivesUsed++;
        p.hp = p.stats.hp * 0.5;
        p.iframe = 2.5;
        FX.levelBeam(p.x, p.y);
        FX.ring(p.x, p.y, { r: 120, color: '#ffd76b', life: 0.6, width: 4 });
        AudioSys.play('levelup');
        bombBlast(run, 150); // 复活冲击波清场
      } else {
        var host = null;
        if (run.coopPlayers && run.coopPlayers.length > 1) {
          for (var i = 0; i < run.coopPlayers.length; i++) {
            if (run.coopPlayers[i].isHost) { host = run.coopPlayers[i]; break; }
          }
        }
        if (!markTeamDowned(run, host)) {
          p.hp = 0;
          run.over = true; run.victory = false;
        }
      }
    }
  }

  // 对任意玩家条目结算伤害:房主直接走 run.over 流程,队友走倒地/救援流程
  function damagePlayerAt(run, w, dmg) {
    if (!w || w.downed) return;
    if (w.isHost) { damagePlayer(run, dmg); return; }
    var p = w.player;
    if (p.iframe > 0 || p.knightImmuneT > 0 || run.over || !p.stats) return;
    var real = Math.max(1, dmg - p.stats.armor);
    if (p.shield > 0) {
      var absorbed = Math.min(p.shield, real);
      p.shield -= absorbed;
      real -= absorbed;
      p.shieldRegenT = p.stats.shieldCd;
      if (real <= 0) { p.iframe = 0.12; p.hurtFlash = 0.12; AudioSys.play('player_hurt'); return; }
    }
    p.hp -= real;
    p.iframe = 0.3;
    p.hurtFlash = 0.25;
    AudioSys.play('player_hurt');
    FX.shake(4, 0.2);
    if (p.hp <= 0) {
      if (p.stats.revive - (p.revivesUsed || 0) > 0) {
        p.revivesUsed++;
        p.hp = p.stats.hp * 0.5;
        p.iframe = 2.5;
        FX.levelBeam(p.x, p.y);
        FX.ring(p.x, p.y, { r: 120, color: '#ffd76b', life: 0.6, width: 4 });
        AudioSys.play('levelup');
        bombBlast(run, 150, p.x, p.y);
      } else {
        markTeamDowned(run, w);
        FX.ring(p.x, p.y, { r: 50, color: '#ff5964', life: 0.6, width: 3 });
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
        poolIdx: i,
        alive: false, uid: 0, id: '', def: null,
        x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
        r: 10, dmg: 0, spd: 0, armor: 0,
        kx: 0, ky: 0, flash: 0, frozen: 0, slow: 0, slowT: 0, stun: 0,
        face: 1, animo: 0, alpha: 1, attackAnimT: 0,
        netX: 0, netY: 0, netVx: 0, netVy: 0,
        netAnimState: '', netAnimEpoch: 0, netSeen: false,
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
    for (i = 0; i < 320; i++) { gems.push({ alive: false, uid: 0, x: 0, y: 0, v: 0, pull: false, vx: 0, vy: 0, t: 0 }); freeGem.push(319 - i); }
    items.length = 0;
    for (i = 0; i < 60; i++) items.push({ alive: false, uid: 0, type: '', x: 0, y: 0, v: 0, t: 0, pull: false });
  }

  function aliveEnemies() { return enemies; }

  function spawnEnemy(run, id, x, y, opts) {
    if (!freeIdx.length) return null;
    var def = CFG.ENEMIES[id] || CFG.BOSSES[id];
    if (!def) return null;
    // 统一存活上限闸门:此前只有 director 的常规刷怪检查 ENEMY_CAP,
    // 而事件波、Boss 召唤、史莱姆分裂等路径直接调 spawnEnemy,能把池子
    // 从 400 一路填到 520(池容量)。满池后每帧要遍历/哈希/渲染 520 个实体,
    // 正是"玩几分钟就卡死"的直接原因。
    // Boss 永远放行(剧情必需);分裂子体放行(否则大史莱姆死了不分裂,机制会坏),
    // 但它们仍受 freeIdx 的物理上限约束。
    if (!CFG.BOSSES[id] && !(opts && opts.allowNear)) {
      if ((POOL - freeIdx.length) >= CFG.GAME.ENEMY_CAP) return null;
    }
    // 统一闸门:不许生在安全区内。豁免两种情况——
    //   allowNear: 分裂子体紧贴母体
    //   def.burrow: 破土怪允许近身冒出(有出土前摇作为反应窗口)
    if (!(opts && opts.allowNear) && !def.burrow) {
      var sp = pushOutOfSafeZone(run, x, y);
      x = sp.x; y = sp.y;
    }
    var idx = freeIdx.pop();
    var e = enemies[idx];
    e.poolIdx = idx;
    var isBoss = !!CFG.BOSSES[id];
    // 联机时按人数放大血量(非线性,避免 2 人难度暴涨)
    var coopHp = run.coopHpMul || 1;
    var endlessAge = run.endless ? Math.max(0, run.t - CFG.GAME.RUN_TIME) : 0;
    var endlessHp = 1 + endlessAge / 90;
    var mul = run.map.hpMul * (1 + run.t / 60 * CFG.HP_GROWTH) * coopHp * endlessHp;
    e.alive = true; e.uid = E.nextUid(); e.id = id; e.def = def;
    e.x = x; e.y = y; e.vx = 0; e.vy = 0;
    e.maxHp = def.hp * (isBoss ? run.map.hpMul : mul);
    e.hp = e.maxHp;
    e.r = def.r;
    e.dmg = def.dmg * (run.endless ? (1 + endlessAge / 240) : 1);
    e.spd = def.spd * (0.9 + Math.random() * 0.2) * (run.endless ? Math.min(1.65, 1 + endlessAge / 900) : 1);
    e.armor = def.armor || 0;
    e.kx = 0; e.ky = 0; e.flash = 0; e.frozen = 0; e.slow = 0; e.slowT = 0; e.stun = 0;
    e.face = 1; e.animo = Math.random() * 10; e.alpha = 1; e.attackAnimT = 0;
    e.netX = x; e.netY = y; e.netVx = 0; e.netVy = 0;
    e.netAnimState = ''; e.netAnimEpoch = 0; e.netSeen = false;
    e.elite = false; e.boss = isBoss; e.bossType = isBoss ? id : '';
    e.bossAction = ''; e.bossActionTick = 0; e.bossActionPhase = 0; e.bossSkill = '';
    e.dying = false; e.dyingT = 0; e.hurtT = 0;
    e.resurrected = false; e.transformT = 0;
    // Pool entries are reused.  Phase/role state must be cleared explicitly
    // or a freshly spawned monster can inherit a previous boss's second phase.
    e.phase2 = false; e.eyeRole = ''; e.eyeGroup = 0; e.splitT = 0; e.eyeRage = 0;
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
      // 精英按类型获得专属强化行为(近战获得冲撞,远程获得瞬移,骷髅获得弓箭手)
      if (id === 'skeleton') { e.eliteSkill = 'archer'; }
      else if (e.ai === 'chase') { e.eliteSkill = 'charge'; e.blinkT = 3 + Math.random() * 2; }
      else if (e.ai === 'shoot' || e.ai === 'spitter' || e.ai === 'lobber') { e.eliteSkill = 'blink'; e.blinkT = 5 + Math.random() * 3; }
      else if (e.ai === 'phase') { e.eliteSkill = 'blink'; e.blinkT = 4 + Math.random() * 2; }
      else e.eliteSkill = '';
    } else {
      e.eliteSkill = '';
    }
    if (!run.seen[id]) { run.seen[id] = true; Meta.seeCodex(id); }
    return e;
  }

  // 在某个玩家周围环上取点。硬约束:结果必须在地图内,且离所有玩家不近于 SAFE_R。
  // 靠墙时沿环遍历角度找可行位置;真的无解就把点推到安全半径之外(绝不落在玩家身上)。
  function ringPoint(run, radius) {
    var R = CFG.GAME.MAP_R;
    var w = randomPlayer(run) || { player: run.player };
    var p = w.player;
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
    var ents = playerEntries(run), safe = CFG.GAME.SAFE_R, R = CFG.GAME.MAP_R;
    for (var i = 0; i < ents.length; i++) {
      var w = ents[i];
      if (w.downed || w.player.hp <= 0) continue;
      var p = w.player;
      var dx = x - p.x, dy = y - p.y;
      var d = Math.hypot(dx, dy);
      if (d >= safe) continue;
      var a = d > 0.01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
      x = E.clamp(p.x + Math.cos(a) * (safe + 30), -R, R);
      y = E.clamp(p.y + Math.sin(a) * (safe + 30), -R, R);
    }
    return { x: x, y: y };
  }

  function spawnAtRing(run, id, opts) {
    var def = CFG.ENEMIES[id] || CFG.BOSSES[id];
    // 破土怪不走出生环:直接在玩家周围较近处冒出,用出土前摇代替距离作为公平性保证
    if (def && def.burrow) {
      var R = CFG.GAME.MAP_R;
      var w = randomPlayer(run) || { player: run.player };
      var p = w.player;
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
    if (e.dying) return 0;
    if (e.transformT > 0) return 0;
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
    var armorBreak = e.armorBreakUntil > run.t ? (e.armorBreakValue || 0) : 0;
    final = Math.max(1, final - Math.max(0, e.armor - armorBreak));
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
    if (e.boss && !e.dying) e.hurtT = Math.max(e.hurtT, 0.32);
    if (e.hp <= 0 && e.bossType === 'boss_darklord' && !e.phase2) enterDarklordPhase2(run, e);
    else if (e.hp <= 0 && e.bossType === 'boss_abysseye' && !e.phase2) enterAbyssEyePhase2(run, e);
    else if (e.hp <= 0) {
      if (e.boss) beginBossDeath(run, e);
      else killEnemy(run, e, opts);
    }
    if (e.phase2 && e.bossType === 'boss_abysseye') syncAbyssEyeBossBar(run, e.eyeGroup);
    return final;
  }

  function enterDarklordPhase2(run, e) {
    e.phase2 = true;
    // The true form is meant to be a conscious, high-risk choice after the
    // escape gate opens.  Keep it in the multi-million range even on map 1.
    e.maxHp = 5000000; e.hp = e.maxHp;
    e.dmg *= 1.8; e.spd *= 1.22; e.r = Math.max(76, e.r * 1.42);
    e.aiT = 0.55; e.chargeSeq = 0; e.chargePhase = 0; e.atkCount = 0;
    e.transformT = 0.8;
    setBossAction(run, e, 'transform');
    if (run.exitGate) {
      run.exitGate.open = true; run.exitGate.openedAt = run.t;
      FX.sprite(run.exitGate.x, run.exitGate.y - 96, 'vfx_darklord_gate_enter', 0.9, 130, true);
    }
    FX.flash('#7d1530', 0.70, 0.75); FX.shake(16, 1.0); FX.explosion(e.x, e.y, 150);
    AudioSys.play('boss_spawn');
    if (run.cb && run.cb.onWarn) run.cb.onWarn('暗潮魔王显露真身！大门已开启：靠近后按 E 可撤离。');
  }

  // 同一条撤离判定同时给键盘、触屏 HUD 和联机房主使用。客户端只能发起
  // 请求，房主仍以此处的真实世界坐标核验，不能伪造远距离的胜利结算。
  function tryExitGate(run, player) {
    var gate = run && run.exitGate, p = player || (run && run.player);
    if (!gate || !gate.open || gate.used || !p) return false;
    if (E.dist2(p.x, p.y, gate.x, gate.y) >= 92 * 92) return false;
    gate.used = true;
    FX.sprite(gate.x, gate.y - 96, 'vfx_darklord_gate_enter', 0.9, 140, true);
    run.over = true; run.victory = true;
    return true;
  }

  function eyeTwin(run, group, except) {
    for (var i = 0; i < POOL; i++) {
      var candidate = enemies[i];
      if (candidate !== except && candidate.alive && candidate.bossType === 'boss_abysseye' &&
          candidate.phase2 && candidate.eyeGroup === group) return candidate;
    }
    return null;
  }

  function syncAbyssEyeBossBar(run, group) {
    var hp = 0, max = 0;
    for (var i = 0; i < POOL; i++) {
      var eye = enemies[i];
      if (!eye.alive || eye.bossType !== 'boss_abysseye' || !eye.phase2 || eye.eyeGroup !== group) continue;
      hp += Math.max(0, eye.hp); max += eye.maxHp;
    }
    if (max > 0) {
      run.bossBarHp = hp; run.bossBarMax = max; run.bossBarName = '深渊双瞳 · 分裂体';
    } else {
      run.bossBarHp = null; run.bossBarMax = null; run.bossBarName = '';
    }
  }

  // The Eye's apparent death is its split: phase two has exactly two separate
  // bodies and exactly double phase-one effective health.  The caster remains
  // at range while the charge eye commits to telegraphed rushes.
  function enterAbyssEyePhase2(run, e) {
    var originalMax = e.maxHp;
    var group = E.nextUid();
    e.phase2 = true; e.eyeGroup = group; e.eyeRole = 'caster';
    e.maxHp = originalMax; e.hp = originalMax; e.r = Math.max(40, e.r * 0.84);
    e.dmg *= 0.92; e.aiT = 0.45; e.blinkT = 99; e.chargeSeq = 0; e.stiffT = 0;
    e.splitT = 0.9; setBossAction(run, e, 'split');
    var a = Math.atan2(e.y - run.player.y, e.x - run.player.x) + Math.PI * 0.5;
    var twin = spawnEnemy(run, 'boss_abysseye',
      E.clamp(e.x + Math.cos(a) * 118, -CFG.GAME.MAP_R, CFG.GAME.MAP_R),
      E.clamp(e.y + Math.sin(a) * 118, -CFG.GAME.MAP_R, CFG.GAME.MAP_R), { allowNear: true });
    if (twin) {
      twin.phase2 = true; twin.eyeGroup = group; twin.eyeRole = 'charger';
      twin.maxHp = originalMax; twin.hp = originalMax; twin.r = e.r;
      twin.dmg *= 1.18; twin.aiT = 0.8; twin.blinkT = 99; twin.chargeSeq = 0; twin.stiffT = 0;
      twin.splitT = 0.9; setBossAction(run, twin, 'split');
    }
    syncAbyssEyeBossBar(run, group);
    FX.flash('#663399', 0.5, 0.62); FX.shake(12, 0.65); FX.explosion(e.x, e.y, 105);
    AudioSys.play('boss_spawn');
    if (run.cb && run.cb.onWarn) run.cb.onWarn('深渊之眼一分为二：远程瞳与冲撞瞳！');
  }

  // 火焰解除冰霜减速:清掉目标的减速状态
  function clearSlow(e) {
    if (!e) return;
    e.slow = 0; e.slowT = 0;
  }

  // Unified boss action interface.  The snapshot carries bossAction/bossActionTick/
  // bossActionPhase through the existing ac/ae/ap fields; clients advance frames
  // from the server action epoch instead of replaying on snapshot arrival.
  function setBossAction(run, e, action) {
    if (!e || !e.boss) return;
    e.bossAction = action;
    e.bossActionTick = run.frame;
    if (run.cb && run.cb.onBossAction) run.cb.onBossAction(e, action);
  }

  function beginBossDeath(run, e) {
    if (e.dying) return;
    e.dying = true;
    e.dyingT = 0.8;
    e.hp = 0; e.vx = 0; e.vy = 0; e.guard = 0; e.squash = 1; e.hop = 0;
    var deathName = e.bossType + '_death';
    if (e.bossType === 'boss_abysseye' && e.phase2) {
      deathName = 'boss_abysseye_' + (e.eyeRole === 'charger' ? 'charge' : 'remote') + '_death';
    }
    var deathFrames = SpriteGen.frames(deathName);
    if (deathFrames && deathFrames.length > 1) {
      e.dyingT = Math.max(0.6, deathFrames.length / Math.max(1, SpriteGen.animationFps(deathName, 10)));
    }
    setBossAction(run, e, 'death');
    if (run.cb && run.cb.onBossDeath) run.cb.onBossDeath(e.bossType, { x: e.x, y: e.y });
  }

  function killEnemy(run, e, opts) {
    if (!e.alive) return;
    // Ordinary fallen enemies leave a deterministic corpse record for the
    // bone lord's resurrection skill.  Bosses and elites are never recorded.
    if (!e.boss && !e.elite && !e.resurrected && run) {
      run.corpsePool = run.corpsePool || [];
      if (run.corpsePool.length < 12) run.corpsePool.push({ id: e.id, x: e.x, y: e.y });
    }
    e.alive = false;
    freeIdx.push(e.poolIdx !== undefined ? e.poolIdx : enemies.indexOf(e));
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
    var survivingEye = e.bossType === 'boss_abysseye' && e.phase2 ? eyeTwin(run, e.eyeGroup, e) : null;
    // The first half of the split Eye is not a completed boss kill.  It gives
    // no duplicate chest/XP or achievement progress; only the second kill
    // resolves the encounter.
    if (!survivingEye) dropLoot(run, e);
    if (e.boss) {
      if (survivingEye) {
        run.boss = survivingEye;
        survivingEye.eyeRage = 1.25;   // one eye dead: survivor attacks 25% faster
        syncAbyssEyeBossBar(run, e.eyeGroup);
        FX.explosion(e.x, e.y, 52);
        AudioSys.play('enemy_die');
        return;
      }
      Meta.track('bossKill');
      run.bossesKilled++;
      if (run.boss === e) run.boss = null;
      if (e.bossType === 'boss_abysseye' && e.phase2) syncAbyssEyeBossBar(run, e.eyeGroup);
      // Boss 死亡:只有场上没有其他存活 Boss 时才恢复地图背景曲。
      // 双 Boss 同场时,先死一个不能把战斗曲切走。
      var stillHasBoss = false;
      for (var bi = 0; bi < enemies.length; bi++) {
        if (enemies[bi].alive && enemies[bi].boss) { stillHasBoss = true; break; }
      }
      if (!stillHasBoss) AudioSys.playMusic(run.map.music);
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
    var hostP = run.player;   // 光环领域以"持有者"(房主)为中心。p 会在下面敌怪循环里被改写成
                              // 各敌人的目标,不能用它当领域圆心 —— 联机时领域会跟着最后一个
                              // 怪的目标跑偏。
    E.gridClear();
    var i, e;
    for (i = 0; i < POOL; i++) { e = enemies[i]; if (e.alive) E.gridInsert(e); }
    var frameParity = (run.frame & 1);

    for (i = 0; i < POOL; i++) {
      e = enemies[i];
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
      if (e.hurtT > 0) e.hurtT = Math.max(0, e.hurtT - dt);
      // Boss death animation must finish before loot/score resolution and can
      // never be overwritten by movement or skill states.
      if (e.dying) {
        e.dyingT -= dt;
        e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
        if (e.dyingT <= 0) killEnemy(run, e);
        else continue;
      }
      if (e.transformT > 0) {
        e.transformT -= dt;
        e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
        if (e.transformT <= 0) setBossAction(run, e, 'idle');
        continue;
      }
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
        contactCheckAll(run, e);
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
      var tgt = nearestPlayer(run, e.x, e.y);
      if (!tgt) continue;
      p = tgt.player;
      var dx = p.x - e.x, dy = p.y - e.y;
      var dist = Math.hypot(dx, dy) || 1;
      var nx = dx / dist, ny = dy / dist;

      // 精英专属技能:近战连续冲撞 / 远程瞬移(瞬移后僵直)
      if (e.elite && e.eliteSkill && eliteSkill(run, e, dt, nx, ny, dist, tgt)) {
        e.x += (e.vx + e.kx) * dt;
        e.y += (e.vy + e.ky) * dt;
        e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
        contactCheckAll(run, e);
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
            e.attackAnimT = 0.48;
            fireShot(e.x, e.y, nx, ny, e.def.shotSpd, e.def.shotDmg * (e.elite ? 1.5 : 1));
          }
          break;
        case 'spitter': // 蛛类:边保持距离边吐减速网
          var sd = e.def.keepDist || 170;
          if (dist > sd + 30) { e.vx = nx * spd; e.vy = ny * spd; }
          else if (dist < sd - 30) { e.vx = -nx * spd * 0.8; e.vy = -ny * spd * 0.8; }
          else { e.vx = -ny * spd * 0.5; e.vy = nx * spd * 0.5; }
          e.aiT -= dt;
          // 发射距离必须低于蛛网衰减距离(shotRange),否则蛛网飞到一半就消散,永远打不中
          var fireRange = e.def.shotRange || 220;
          if (e.aiT <= 0 && dist < fireRange) {
            e.aiT = e.def.shotCd;
            e.attackAnimT = 0.5;
            // 蛛网弹:白色黏丝,施加叠层减速;有射程上限且越远越慢
            fireShot(e.x, e.y, nx, ny, e.def.shotSpd,
              e.def.shotDmg * (e.elite ? 1.5 : 1), e.def.slowAmt, e.def.slowDur, true,
              null, e.id === 'spider' ? 48 : 16, fireRange);
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
            e.attackAnimT = 0.55;
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
              e.attackAnimT = 0.55;
              e.tgtX = nx; e.tgtY = ny;
              FX.burst(e.x, e.y, { color: '#c44', n: 6, speed: 60, life: 0.3, size: 2 });
            }
          } else { // 冲锋
            e.vx = e.tgtX * e.def.chargeSpd; e.vy = e.tgtY * e.def.chargeSpd;
            if (e.aiT <= 0) { e.aiPhase = 0; e.aiT = e.def.chargeCd; }
          }
          break;
        case 'boss':
          bossAI(run, e, dt, nx, ny, dist, spd, tgt);
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

      contactCheckAll(run, e);

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
        var hd2 = (sh.x - hostP.x) * (sh.x - hostP.x) + (sh.y - hostP.y) * (sh.y - hostP.y);
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
      // Long-range webs retain their launch speed.  Otherwise the old
      // multiplicative decay made a nominal 660px spider shot die far short
      // of its authored range.
      if (sh.maxRange > 0) {
        if (sh.travelled > sh.maxRange) { sh.alive = false; continue; }
      }
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      var hitEntry = null, ents2 = playerEntries(run);
      for (var hi = 0; hi < ents2.length; hi++) {
        var hw = ents2[hi];
        if (hw.downed || hw.player.hp <= 0) continue;
        if (E.dist2(sh.x, sh.y, hw.player.x, hw.player.y) < (hw.player.r + 5) * (hw.player.r + 5)) {
          hitEntry = hw; break;
        }
      }
      if (hitEntry) {
        var hp = hitEntry.player;
        sh.alive = false;
        damagePlayerAt(run, hitEntry, sh.dmg);
        // 蛛网弹:叠层减速,叠满两层则被完全包裹硬控 1 秒;触发后角色获得 5 秒蛛网免疫
        // Spider webs now deliberately keep their authored large visual and
        // cleanse interaction, but are no longer a stacked slow/root mechanic.
        // Other future web effects can still opt in by supplying a slow value.
        if (sh.webType && (sh.slow > 0 || sh.slowDur > 0)) {
          if (hp.webImmune > 0) {
            FX.burst(hp.x, hp.y, { color: '#ffaa22', n: 8, speed: 70, life: 0.3, size: 2 });
            continue;
          }
          if (hp.webStacks < 2) hp.webStacks++;
          hp.slow = sh.slow * (hp.webStacks === 2 ? 1.6 : 1);
          hp.slowT = Math.max(hp.slowT, sh.slowDur);
          hp.webT = hp.slowT;
          if (hp.webStacks >= 2 && hp.rootT <= 0) {
            hp.rootT = 1.0;             // 硬控:原地无法移动
            hp.webStacks = 0;           // 触发后清空,需重新叠
            hp.webImmune = 5.0;         // 5 秒免疫
            FX.ring(hp.x, hp.y, { r: 34, color: '#f4f6ff', life: 0.5, width: 4 });
            FX.burst(hp.x, hp.y, { color: '#e8ecff', n: 14, speed: 90, life: 0.5, size: 2 });
            AudioSys.play('freeze');
          } else {
            FX.ring(hp.x, hp.y, { r: 22, color: '#dfe4ff', life: 0.3, width: 2 });
          }
        } else if (sh.slow > 0) {
          hp.slow = Math.max(hp.slow, sh.slow);
          hp.slowT = Math.max(hp.slowT, sh.slowDur);
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
  function eliteSkill(run, e, dt, nx, ny, dist, tgt) {
    var p = tgt ? tgt.player : run.player;
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
          e.attackAnimT = Math.max(e.attackAnimT, 0.16);
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
    // 骷髅精英弓箭手:蓄力 2 秒射一支快箭,每 5 秒一次;视野是玩家视野 1.5 倍;
    // 攻击期间不能移动。
    if (e.eliteSkill === 'archer') {
      var A = e.archerT !== undefined ? e.archerT : 0;
      e.archerT = A;
      // 视野:玩家视野(W/2 横向约 480px 半径)的 1.5 倍 = 720
      var arcRange = 720;
      // 状态机:0 空闲 → 1 蓄力 → 2 出手 → 回到 0
      if (e.archerPhase === undefined) e.archerPhase = 0;
      if (e.archerPhase === 0) {
        // 空闲:保持距离,进入视野才准备(移速取自身 spd × 增益)
        var aspd = e.spd * (e.buffSpd || 1);
        if (dist < arcRange) {
          if (dist > 260) { e.vx = nx * aspd; e.vy = ny * aspd; }
          else if (dist < 200) { e.vx = -nx * aspd * 0.6; e.vy = -ny * aspd * 0.6; }
          else { e.vx = -ny * aspd * 0.3; e.vy = nx * aspd * 0.3; }
        } else { e.vx = nx * aspd; e.vy = ny * aspd; }
        e.archerCd = (e.archerCd || 0) - dt;
        if (e.archerCd <= 0 && dist < arcRange) {
          e.archerPhase = 1; e.archerT = 2.0;   // 蓄力 2 秒
          e.vx = 0; e.vy = 0;
          FX.ring(e.x, e.y, { r: e.r + 20, color: '#ff9d5c', life: 0.4, width: 3 });
        }
        return true;
      }
      if (e.archerPhase === 1) {
        // 蓄力:不能移动,面向玩家,身上闪白光
        e.vx = 0; e.vy = 0;
        e.face = nx >= 0 ? 1 : -1;
        e.attackAnimT = Math.max(e.attackAnimT, 0.18);
        if ((run.frame & 3) === 0) FX.trail(e.x + (Math.random() * 20 - 10), e.y - 6, '#fff', 2);
        e.archerT -= dt;
        if (e.archerT <= 0) {
          e.archerPhase = 2; e.archerT = 0.12;
        }
        return true;
      }
      // 出手:向玩家射一支快箭,然后进入 5 秒冷却
      e.archerT -= dt;
      e.attackAnimT = Math.max(e.attackAnimT, 0.18);
      if (e.archerT <= 0) {
        e.archerPhase = 0;
        e.archerCd = 5.0;
        var adv = e.dmg * (1.5 + (e.elite ? 0.5 : 0)) * (e.buffDmg || 1);
        // 快箭:高速 320
        // Dedicated bone-arrow art; the previous gold colour routed this shot
        // through the generic hellfire projectile selector.
        fireShot(e.x, e.y, nx, ny, 320, adv, 0, 0, false, '#e8e0ca', 10);
        FX.burst(e.x, e.y, { color: '#ffd76b', n: 6, speed: 90, life: 0.3, size: 2 });
        AudioSys.play('shoot_arrow');
      }
      return true;
    }
    return false;
  }

  function contactCheck(run, e, p) {
    var rr = e.r + p.r;
    if (E.dist2(e.x, e.y, p.x, p.y) < rr * rr) damagePlayer(run, e.dmg * (e.buffDmg || 1));
  }

  function contactCheckAll(run, e) {
    // 冻结/眩晕中的敌人不会攻击:硬控的意义就是让它既不能动也不能伤到你。
    if (run.freezeT > 0 || e.frozen > 0 || e.stun > 0) return;
    var ents = playerEntries(run);
    for (var i = 0; i < ents.length; i++) {
      var w = ents[i];
      if (w.downed) continue;
      var p = w.player;
      var rr = e.r + p.r;
      if (E.dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        e.attackAnimT = Math.max(e.attackAnimT, 0.35);
        damagePlayerAt(run, w, e.dmg * (e.buffDmg || 1));
      }
    }
  }

  var shots = [];
  function fireShot(x, y, nx, ny, spd, dmg, slow, slowDur, webType, col, size, maxRange, sprite) {
    for (var i = 0; i < shots.length; i++) {
      if (!shots[i].alive) {
        var s = shots[i];
        s.alive = true; s.x = x; s.y = y;
        s.vx = nx * spd; s.vy = ny * spd; s.dmg = dmg; s.ttl = 5;
        // Fixed authored hostile projectiles replace the old colour-only dots.
        var c = (col || '').toLowerCase();
        s.sprite = sprite || (c.indexOf('7fd') >= 0 || c.indexOf('green') >= 0 ? 'p_enemy_toxic' :
          (c.indexOf('e8e0') >= 0 ? 'p_enemy_bone' :
          (c.indexOf('c46b') >= 0 ? 'p_enemy_arcane' :
          (c.indexOf('ffd7') >= 0 ? 'p_enemy_hellfire' : 'p_enemy_blood'))));
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
        if (l.dmg > 0) {
          var ents = playerEntries(run);
          for (var j = 0; j < ents.length; j++) {
            var w = ents[j];
            if (w.downed || w.player.hp <= 0) continue;
            if (E.dist2(w.player.x, w.player.y, l.tx, l.ty) < l.r * l.r) {
              damagePlayerAt(run, w, l.dmg);
            }
          }
        }
      }
    }
  }

  // ================= Boss AI =================
  function bossEmitFx(run, kind, data) {
    if (run.cb && run.cb.onBossFx) run.cb.onBossFx(kind, data || {});
  }
  function bossEmitAudio(run, kind) {
    if (run.cb && run.cb.onBossAudio) run.cb.onBossAudio(kind);
  }

  function slimePickSkill(e, lowHp) {
    e.bounceCd = e.bounceCd || 0; e.summonCd = e.summonCd || 0; e.shieldCd = e.shieldCd || 0;
    if (lowHp && e.bounceCd <= 0) { e.bounceCd = 10; return 'bounce'; }
    e.skillCycle = (e.skillCycle || 0) + 1;
    var c = e.skillCycle;
    if (c >= 4 && c % 4 === 0 && e.summonCd <= 0) { e.summonCd = 16; return 'summon'; }
    if (c >= 3 && c % 5 === 0 && e.shieldCd <= 0) { e.shieldCd = 14; return 'shield'; }
    return c % 3 === 0 ? 'jump' : (c % 3 === 1 ? 'fan' : 'ring');
  }

  function bonelordPick(e) {
    e.skillCycle = (e.skillCycle || 0) + 1;
    var c = e.skillCycle;
    if (c >= 6 && c % 6 === 0) return 'resurrect';
    if (c >= 5 && c % 5 === 0) return 'summon';
    return c % 4 === 0 ? 'scythe' : (c % 4 === 1 ? 'ring' : (c % 4 === 2 ? 'prison' : 'spear'));
  }

  function bonelordTelegraph(run, e, nx, ny, bcol) {
    var data = { x: Math.round(e.x), y: Math.round(e.y) };
    if (e.bossSkill === 'scythe') {
      FX.ring(e.x, e.y, { r: 96, color: bcol, life: 0.55, width: 4 });
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'boneScytheWarn', data);
    } else if (e.bossSkill === 'ring') {
      FX.ring(e.x, e.y, { r: 122, color: bcol, life: 0.6, width: 5 });
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'boneRingWarn', data);
    } else if (e.bossSkill === 'prison') {
      var p = run.player;
      FX.sprite(p.x, p.y, 'vfx_bonelord_bone_prison', 0.8, 150, false, 0.9);
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'bonePrisonWarn', { x: Math.round(p.x), y: Math.round(p.y) });
    } else if (e.bossSkill === 'spear') {
      var pts = [];
      for (var pi = 0; pi < 3; pi++) {
        var pa = Math.random() * Math.PI * 2;
        var pd = 80 + Math.random() * 110;
        pts.push({
          x: E.clamp(run.player.x + Math.cos(pa) * pd, -CFG.GAME.MAP_R, CFG.GAME.MAP_R),
          y: E.clamp(run.player.y + Math.sin(pa) * pd, -CFG.GAME.MAP_R, CFG.GAME.MAP_R)
        });
      }
      e.skillPts = pts;
      for (var gi = 0; gi < pts.length; gi++) {
        FX.sprite(pts[gi].x, pts[gi].y, 'vfx_bonelord_grave_mark', 0.6, 74, false, 0.85);
      }
      bossEmitFx(run, 'boneSpearWarn', { pts: pts.map(function (pt) { return [Math.round(pt.x), Math.round(pt.y)]; }) });
    } else if (e.bossSkill === 'summon') {
      FX.ring(e.x, e.y, { r: 90, color: bcol, life: 0.55, width: 4 });
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'boneSummonWarn', data);
    } else {
      FX.ring(e.x, e.y, { r: 110, color: '#d8e8ff', life: 0.6, width: 4 });
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'boneResurrectWarn', data);
    }
  }

  function slimeBeginTelegraph(run, e, nx, ny, scol) {    var aim = Math.atan2(ny, nx);
    e.skillAim = aim;
    var data = { x: Math.round(e.x), y: Math.round(e.y), a: +aim.toFixed(2) };
    if (e.bossSkill === 'fan') {
      FX.sprite(e.x, e.y, 'vfx_boss_slimeking_fan_telegraph', 0.5, 168, false, 0.75, aim + Math.PI / 2);
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'slimeFanWarn', data);
    } else if (e.bossSkill === 'ring') {
      FX.ring(e.x, e.y, { r: 96, color: scol, life: 0.6, width: 5 });
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'slimeRingWarn', data);
    } else if (e.bossSkill === 'summon') {
      FX.burst(e.x, e.y, { color: scol, n: 16, speed: 110, life: 0.5, size: 3, glow: true });
      AudioSys.play('elite_spawn');
      bossEmitFx(run, 'slimeSummonWarn', data);
    } else if (e.bossSkill === 'shield') {
      FX.ring(e.x, e.y, { r: 74, color: '#9cf', life: 0.5, width: 4 });
      AudioSys.play('hit1');
      bossEmitFx(run, 'slimeShieldWarn', data);
    } else {
      var LEAP_R = 85;
      var p = run.player;
      var lx = p.x + (p.lastVx || 0) * 0.4, ly = p.y + (p.lastVy || 0) * 0.4;
      var lR = CFG.GAME.MAP_R;
      e.leapX = E.clamp(lx, -lR, lR); e.leapY = E.clamp(ly, -lR, lR);
      e.leapMark = fireLob(e.leapX, e.leapY, e.x, e.y, LEAP_R, 0, 0.5);
      AudioSys.play('elite_spawn');
      bossEmitFx(run, e.bossSkill === 'bounce' ? 'slimeBounceWarn' : 'slimeJumpWarn',
        { x: Math.round(e.leapX), y: Math.round(e.leapY), a: +aim.toFixed(2) });
    }
  }

  function bossAI(run, e, dt, nx, ny, dist, spd, tgt) {
    e.aiT -= dt;
    var p = tgt ? tgt.player : run.player;
    var bdef = CFG.BOSSES[e.bossType] || {};
    var enrage = (e.bossType === 'boss_darklord' && run.t >= CFG.GAME.RUN_TIME);
    var sMul = enrage ? 1.6 : 1, dMul = enrage ? 2 : 1;
    switch (e.bossType) {
      case 'boss_slimeking': { // 六技能循环:idle → telegraph → cast/charge → recover
        var scol = bdef.shotCol || '#7fd44f';
        var LEAP_R = 85;
        var lowHp = e.maxHp > 0 && e.hp < e.maxHp * 0.3;
        e.bounceCd = Math.max(0, (e.bounceCd || 0) - dt);
        e.summonCd = Math.max(0, (e.summonCd || 0) - dt);
        e.shieldCd = Math.max(0, (e.shieldCd || 0) - dt);
        if (e.dying) { e.vx = 0; e.vy = 0; break; }
        if (!e.bossAction) setBossAction(run, e, 'idle');

        if (e.bossAction === 'idle' || e.bossAction === 'walk') {
          if (e.guard > 0) e.guard = Math.max(0, e.guard - dt);
          e.vx = nx * spd * 0.62; e.vy = ny * spd * 0.62;
          e.aiT -= dt;
          if (e.aiT <= 0) {
            var sk = slimePickSkill(e, lowHp);
            e.bossSkill = sk; e.bossActionPhase = 1; e.skillMarked = false;
            setBossAction(run, e, 'telegraph');
            if (sk === 'jump') { e.skillT = 0.72; }
            else if (sk === 'bounce') { e.skillT = 0.5; e.bounceLeft = 2 + (lowHp ? 1 : 0); }
            else if (sk === 'fan') { e.skillT = 0.55; }
            else if (sk === 'ring') { e.skillT = 0.65; }
            else if (sk === 'summon') { e.skillT = 0.6; }
            else { e.skillT = 0.5; }
          }
          break;
        }

        e.vx = 0; e.vy = 0;
        if (e.bossActionPhase === 1) {               // telegraph
          if (!e.skillMarked) { e.skillMarked = true; slimeBeginTelegraph(run, e, nx, ny, scol); }
          if (e.bossSkill === 'jump' || e.bossSkill === 'bounce') {
            e.squash = 1 - E.clamp(1 - e.skillT / 0.5, 0, 1) * 0.35;
          }
          e.skillT -= dt;
          if (e.skillT <= 0) {
            e.bossActionPhase = 2;
            if (e.bossSkill === 'jump') { e.skillT = 0.42; e.jumpFrom = { x: e.x, y: e.y }; e.leapMark = null; setBossAction(run, e, 'charge'); }
            else if (e.bossSkill === 'bounce') { e.skillT = 0.34; e.jumpFrom = { x: e.x, y: e.y }; e.leapMark = null; setBossAction(run, e, 'charge'); }
            else if (e.bossSkill === 'fan') { e.skillT = 0.72; e.castStep = 0; e.castCd = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'ring') { e.skillT = 0.55; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'summon') { e.skillT = 0.55; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else { e.skillT = 3.2; e.guard = 3.2; setBossAction(run, e, 'shield'); }
          }
          break;
        }

        if (e.bossActionPhase === 2) {               // cast / charge
          if (e.bossSkill === 'fan') {
            e.castCd -= dt;
            if (e.castCd <= 0 && e.castStep < 3) {
              e.castCd = 0.18; e.castStep++;
              var fanA = e.skillAim || Math.atan2(ny, nx);
              for (var fi = 0; fi < 5; fi++) {
                var fa = fanA + (fi - 2) * 0.155;
                fireShot(e.x, e.y, Math.cos(fa), Math.sin(fa), 172, e.dmg * 0.4,
                  0.18, 1.4, false, scol, 26, 430, 'p_boss_slimeking_acid_orb');
              }
              AudioSys.play('shoot_bolt');
              bossEmitFx(run, 'slimeFanCast', { x: Math.round(e.x), y: Math.round(e.y), a: +fanA.toFixed(2) });
            }
            e.skillT -= dt;
            if (e.skillT <= 0) { e.bossActionPhase = 3; e.skillT = 0.4; }
          } else if (e.bossSkill === 'ring') {
            if (e.castStep === 0) {
              e.castStep = 1;
              for (var rj = 0; rj < 16; rj++) {
                var ra = Math.PI * 2 * rj / 16;
                fireShot(e.x, e.y, Math.cos(ra), Math.sin(ra), 138, e.dmg * 0.42,
                  0.4, 2.0, false, scol, 18, 235);
              }
              FX.sprite(e.x, e.y, 'vfx_boss_slimeking_ground_wave', 0.85, 190, true);
              FX.shake(5, 0.3);
              AudioSys.play('splat');
              bossEmitFx(run, 'slimeRingCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
            e.skillT -= dt;
            if (e.skillT <= 0) { e.bossActionPhase = 3; e.skillT = 0.4; }
          } else if (e.bossSkill === 'summon') {
            if (e.castStep === 0) {
              e.castStep = 1;
              for (var gj = 0; gj < 4; gj++) {
                var ga = Math.PI * 2 * gj / 4 + 0.6;
                spawnEnemy(run, 'slime', e.x + Math.cos(ga) * 72, e.y + Math.sin(ga) * 72, { allowNear: true });
              }
              FX.sprite(e.x, e.y, 'vfx_boss_slimeking_summon_gel', 0.7, 110, false, 0.85);
              FX.burst(e.x, e.y, { color: scol, n: 20, speed: 130, life: 0.5, size: 3 });
              AudioSys.play('elite_spawn');
              bossEmitFx(run, 'slimeSummonCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
            e.skillT -= dt;
            if (e.skillT <= 0) { e.bossActionPhase = 3; e.skillT = 0.35; }
          } else if (e.bossSkill === 'shield') {
            if (e.guard > 0) {
              e.guard = Math.max(0, e.guard - dt);
              if (e.guard <= 0) { e.bossActionPhase = 3; e.skillT = 0.3; }
            }
            e.skillT -= dt;
            if (e.skillT <= 0 && e.guard > 0) e.skillT = 0.05;
          } else {                                  // jump / low-HP bounce
            var t01 = 1 - E.clamp(e.skillT / (e.bossSkill === 'bounce' ? 0.34 : 0.42), 0, 1);
            var jf = e.jumpFrom || { x: e.x, y: e.y };
            e.x = E.lerp(jf.x, e.leapX, t01);
            e.y = E.lerp(jf.y, e.leapY, t01);
            e.hop = Math.sin(t01 * Math.PI) * 70;
            e.squash = 1 + Math.sin(t01 * Math.PI) * 0.25;
            e.skillT -= dt;
            if (e.skillT <= 0) {
              e.hop = 0; e.squash = 1;
              FX.ring(e.x, e.y, { r: LEAP_R, color: scol, life: 0.45, width: 5 });
              FX.explosion(e.x, e.y, LEAP_R);
              FX.shake(8, 0.35);
              AudioSys.play('splat');
              bossEmitFx(run, 'slimeJumpLand', { x: Math.round(e.x), y: Math.round(e.y) });
              var ents = playerEntries(run);
              for (var ei2 = 0; ei2 < ents.length; ei2++) {
                var ew = ents[ei2];
                if (ew.downed || ew.player.hp <= 0) continue;
                if (E.dist2(ew.player.x, ew.player.y, e.x, e.y) < LEAP_R * LEAP_R) {
                  damagePlayerAt(run, ew, e.dmg * 1.2 * dMul);
                }
              }
              for (var sj = 0; sj < 12; sj++) {
                var sa = (Math.PI * 2 / 12) * sj + run.t * 0.5;
                fireShot(e.x, e.y, Math.cos(sa), Math.sin(sa), 130, e.dmg * 0.35 * dMul,
                  0.25, 1.2, false, scol);
              }
              for (var i = 0; i < 2; i++) spawnEnemy(run, 'slime', e.x + (Math.random() * 60 - 30), e.y + (Math.random() * 60 - 30), { allowNear: true });
              if (e.bossSkill === 'bounce' && e.bounceLeft > 0) {
                e.bounceLeft--;
                e.bossActionPhase = 1; e.skillT = 0.3; e.skillMarked = false;
                setBossAction(run, e, 'telegraph');
                FX.sprite(e.x, e.y, 'vfx_boss_slimeking_bounce_afterimage', 0.4, 92, true, 0.26);
              } else {
                e.bossActionPhase = 3; e.skillT = 0.5;
              }
            }
          }
          break;
        }

        e.skillT -= dt;                             // recover
        if (e.skillT <= 0) {
          e.bossActionPhase = 0; e.bossSkill = '';
          setBossAction(run, e, 'idle');
          e.aiT = lowHp ? 1.2 : 2.0;
        }
        break;
      }
      case 'boss_bonelord': { // 六技能循环:巨镰 / 骨冠环射 / 骨牢 / 骨矛雨 / 召唤 / 亡者再生
        var bcol = bdef.shotCol || '#e8e0d0';
        if (e.dying) { e.vx = 0; e.vy = 0; break; }
        if (!e.bossAction) setBossAction(run, e, 'idle');
        if (e.bossAction === 'idle' || e.bossAction === 'walk') {
          e.vx = nx * spd * 0.78; e.vy = ny * spd * 0.78;
          e.aiT -= dt;
          if (e.aiT <= 0) {
            var bk = bonelordPick(e);
            e.bossSkill = bk; e.bossActionPhase = 1; e.skillMarked = false;
            setBossAction(run, e, 'telegraph');
            if (bk === 'scythe') e.skillT = 0.55;
            else if (bk === 'ring') e.skillT = 0.6;
            else if (bk === 'prison') e.skillT = 0.5;
            else if (bk === 'spear') e.skillT = 0.6;
            else e.skillT = 0.6;
          }
          break;
        }
        e.vx = 0; e.vy = 0;
        if (e.bossActionPhase === 1) {                 // telegraph
          if (!e.skillMarked) { e.skillMarked = true; bonelordTelegraph(run, e, nx, ny, bcol); }
          e.skillT -= dt;
          if (e.skillT <= 0) {
            e.bossActionPhase = 2;
            if (e.bossSkill === 'scythe') { e.skillT = 0.5; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'ring') { e.skillT = 0.6; e.castStep = 0; setBossAction(run, e, 'charge'); }
            else if (e.bossSkill === 'prison') { e.skillT = 0.8; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'spear') { e.skillT = 0.6; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else { e.skillT = 0.7; e.castStep = 0; setBossAction(run, e, 'resurrect'); }
          }
          break;
        }
        if (e.bossActionPhase === 2) {                 // cast
          if (e.bossSkill === 'scythe') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var entsB = playerEntries(run);
              for (var si = 0; si < entsB.length; si++) {
                var sw = entsB[si];
                if (sw.downed || sw.player.hp <= 0) continue;
                if (E.dist2(sw.player.x, sw.player.y, e.x, e.y) < 118 * 118) {
                  damagePlayerAt(run, sw, e.dmg * 1.25 * dMul);
                }
              }
              FX.ring(e.x, e.y, { r: 118, color: bcol, life: 0.4, width: 5 });
              FX.burst(e.x, e.y, { color: bcol, n: 18, speed: 180, life: 0.45, size: 3 });
              AudioSys.play('hit2');
              bossEmitFx(run, 'boneScytheCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          } else if (e.bossSkill === 'ring') {
            if (e.castStep === 0) {
              e.castStep = 1;
              for (var bj = 0; bj < 20; bj++) {
                var ba = (Math.PI * 2 / 20) * bj + run.t * 0.4;
                fireShot(e.x, e.y, Math.cos(ba), Math.sin(ba), 132, e.dmg * 0.6 * dMul,
                  0, 0, false, bcol, 14, 420);
              }
              AudioSys.play('shoot_bolt');
              bossEmitFx(run, 'boneRingCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          } else if (e.bossSkill === 'prison') {
            if (e.castStep === 0 && e.skillT <= 0.4) {
              e.castStep = 1;
              var ppos = run.player;
              FX.sprite(ppos.x, ppos.y, 'vfx_bonelord_bone_prison', 0.5, 150, false, 0.9);
              FX.ring(ppos.x, ppos.y, { r: 62, color: '#d8e8ff', life: 0.35, width: 4 });
              AudioSys.play('splat');
              var entsP = playerEntries(run);
              for (var pj = 0; pj < entsP.length; pj++) {
                var pw = entsP[pj];
                if (!pw.downed && pw.player.hp > 0 &&
                    E.dist2(pw.player.x, pw.player.y, ppos.x, ppos.y) < 66 * 66) {
                  damagePlayerAt(run, pw, e.dmg * 0.9 * dMul);
                }
              }
              for (var sh = 0; sh < 8; sh++) {
                var shA = Math.PI * 2 * sh / 8;
                fireShot(ppos.x, ppos.y, Math.cos(shA), Math.sin(shA), 120,
                  e.dmg * 0.3 * dMul, 0.3, 1.6, false, bcol, 12, 130);
              }
              bossEmitFx(run, 'bonePrisonBurst', { x: Math.round(ppos.x), y: Math.round(ppos.y) });
            }
          } else if (e.bossSkill === 'spear') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var pts = e.skillPts || [];
              for (var ti = 0; ti < pts.length; ti++) {
                fireLob(pts[ti].x, pts[ti].y, e.x, e.y, 36, e.dmg * 0.85 * dMul, 0.5);
                FX.sprite(pts[ti].x, pts[ti].y, 'vfx_bonelord_spear_rain', 0.55, 92, true);
              }
              AudioSys.play('shoot_bolt');
              bossEmitFx(run, 'boneSpearCast', { pts: pts.map(function (pt) { return [Math.round(pt.x), Math.round(pt.y)]; }) });
            }
          } else if (e.bossSkill === 'summon') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var R = CFG.GAME.MAP_R;
              for (var ni = 0; ni < 6; ni++) {
                var na = Math.PI * 2 * ni / 6 + 0.4;
                var nd = 100 + (ni % 3) * 40;
                spawnEnemy(run, 'skeleton',
                  E.clamp(run.player.x + Math.cos(na) * nd, -R, R),
                  E.clamp(run.player.y + Math.sin(na) * nd, -R, R));
              }
              FX.shake(3, 0.2);
              AudioSys.play('elite_spawn');
              bossEmitFx(run, 'boneSummonCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          } else {
            if (e.castStep === 0) {
              e.castStep = 1;
              run.corpsePool = run.corpsePool || [];
              var raised = 0;
              for (var ci = run.corpsePool.length - 1; ci >= 0 && raised < 6; ci--) {
                var corpse = run.corpsePool[ci];
                if (!corpse || E.dist2(corpse.x, corpse.y, e.x, e.y) > 420 * 420) continue;
                var reborn = spawnEnemy(run, corpse.id, corpse.x, corpse.y, { allowNear: true });
                if (reborn) {
                  reborn.hp = reborn.maxHp = Math.max(1, Math.round(reborn.maxHp * 0.5));
                  reborn.resurrected = true;
                  FX.sprite(corpse.x, corpse.y, 'vfx_bonelord_grave_mark', 0.6, 74, false, 0.85);
                  raised++;
                }
                run.corpsePool.splice(ci, 1);
              }
              if (raised > 0) {
                FX.sprite(e.x, e.y, 'vfx_bonelord_soul_return', 0.7, 90, true);
                AudioSys.play('elite_spawn');
                bossEmitFx(run, 'boneResurrectCast', { x: Math.round(e.x), y: Math.round(e.y), n: raised });
              }
            }
          }
          e.skillT -= dt;
          if (e.skillT <= 0) { e.bossActionPhase = 3; e.skillT = 0.4; }
          break;
        }
        e.skillT -= dt;                               // recover
        if (e.skillT <= 0) {
          e.bossActionPhase = 0; e.bossSkill = '';
          setBossAction(run, e, 'idle');
          e.aiT = 1.9;
        }
        break;
      }
      case 'boss_abysseye': { // P1 五技能循环;P2 远程瞳/冲撞瞳独立动作
        var acol = bdef.shotCol || '#d897ff';
        var eyeRage = e.eyeRage || 1;
        if (e.dying) { e.vx = 0; e.vy = 0; break; }
        if (e.splitT > 0) { e.splitT -= dt; e.vx = 0; e.vy = 0; break; }
        if (!e.bossAction) setBossAction(run, e, 'idle');

        if (e.phase2) {
          if (e.eyeRole === 'charger') {
            if (e.chargeSeq > 0) {
              e.skT -= dt;
              if (e.chargePhase === 0) {          // telegraph
                e.vx = 0; e.vy = 0; e.flash = 0.05;
                setBossAction(run, e, 'idle');
                if (e.skT <= 0) {
                  e.chargePhase = 1; e.skT = 0.52; e.tgtX = nx; e.tgtY = ny;
                  setBossAction(run, e, 'charge');
                  FX.ring(e.x, e.y, { r: 74, color: acol, life: 0.32, width: 3 });
                  bossEmitFx(run, 'eyeChargeWarn', { x: Math.round(e.x), y: Math.round(e.y) });
                }
              } else {                              // dash
                e.vx = e.tgtX * 470; e.vy = e.tgtY * 470;
                if ((run.frame & 1) === 0) FX.trail(e.x, e.y, '#a64dff', 4);
                if (e.skT <= 0) {
                  e.chargeSeq--; e.chargePhase = 0; e.skT = 0.9; e.aiT = 1.7 / eyeRage;
                  setBossAction(run, e, 'idle');
                  FX.shake(5, 0.24);
                }
              }
              break;
            }
            e.vx = nx * spd * 0.82; e.vy = ny * spd * 0.82;
            if (e.aiT <= 0) {
              e.aiT = 10 / eyeRage; e.chargeSeq = 3; e.chargePhase = 0; e.skT = 0.62;
              if (run.cb && run.cb.onWarn) run.cb.onWarn('冲撞瞳正在蓄力！');
            }
            break;
          }
          // Remote/caster eye: keep the firing lane, periodic patterned burst
          // and a short continuous beam every other cycle.
          if (dist < 310) { e.vx = -nx * spd * 0.95; e.vy = -ny * spd * 0.95; }
          else if (dist > 420) { e.vx = nx * spd * 0.75; e.vy = ny * spd * 0.75; }
          else { e.vx = -ny * spd * 0.55; e.vy = nx * spd * 0.55; }
          e.aiPhase += dt * 2.5;
          if (e.aiT <= 0) {
            e.atkCount = (e.atkCount || 0) + 1;
            if (e.atkCount % 2 === 0) {             // 持续光束
              e.aiT = 0.9 / eyeRage; e.beamT = 0.5;
              setBossAction(run, e, 'attack');
              bossEmitFx(run, 'eyeBeamWarn', { x: Math.round(e.x), y: Math.round(e.y) });
            } else {
              e.aiT = 0.85 / eyeRage; e.beamT = 0;
              setBossAction(run, e, 'attack');
              for (var pi = 0; pi < 6; pi++) {
                var pAngle = e.aiPhase + Math.PI * 2 * pi / 6;
                fireShot(e.x, e.y, Math.cos(pAngle), Math.sin(pAngle), 178, e.dmg * 0.46,
                  0, 0, false, acol, 20, 560);
              }
              AudioSys.play('shoot_bolt');
            }
          }
          if (e.beamT > 0) {
            e.beamT -= dt;
            var beamAim = Math.atan2(p.y - e.y, p.x - e.x);
            if ((run.frame & 2) === 0) {
              FX.lightning(e.x + Math.cos(beamAim) * 10, e.y + Math.sin(beamAim) * 10,
                e.x + Math.cos(beamAim) * 360, e.y + Math.sin(beamAim) * 360, acol);
            }
            var beamEnts = playerEntries(run);
            for (var bi2 = 0; bi2 < beamEnts.length; bi2++) {
              var bw = beamEnts[bi2];
              if (bw.downed || bw.player.hp <= 0) continue;
              var bdx = bw.player.x - e.x, bdy = bw.player.y - e.y;
              var along = bdx * Math.cos(beamAim) + bdy * Math.sin(beamAim);
              var perp = Math.abs(-bdx * Math.sin(beamAim) + bdy * Math.cos(beamAim));
              if (along > 0 && along < 380 && perp < 30 && (run.frame % 10) === 0) {
                damagePlayerAt(run, bw, e.dmg * 0.34);
              }
            }
            if (e.beamT <= 0) setBossAction(run, e, 'idle');
          }
          break;
        }

        if (e.bossAction === 'idle' || e.bossAction === 'walk') {
          if (dist > 260) { e.vx = nx * spd; e.vy = ny * spd; }
          else { e.vx = -ny * spd * 0.7; e.vy = nx * spd * 0.7; }
          e.aiT -= dt;
          if (e.aiT <= 0) {
            e.skillCycle = (e.skillCycle || 0) + 1;
            var c = e.skillCycle;
            e.bossSkill = c % 5 === 0 ? 'spiral' : (c % 5 === 1 ? 'gaze'
              : (c % 5 === 2 ? 'well' : (c % 5 === 3 ? 'rift' : 'summon')));
            e.bossActionPhase = 1; e.skillMarked = false;
            setBossAction(run, e, 'telegraph');
            e.skillT = e.bossSkill === 'spiral' ? 0.5 : 0.65;
          }
          break;
        }
        e.vx = 0; e.vy = 0;
        if (e.bossActionPhase === 1) {               // telegraph
          if (!e.skillMarked) {
            e.skillMarked = true;
            var d0 = { x: Math.round(e.x), y: Math.round(e.y) };
            if (e.bossSkill === 'gaze') {
              FX.ring(e.x, e.y, { r: 92, color: acol, life: 0.55, width: 4 });
              bossEmitFx(run, 'eyeGazeWarn', d0);
            } else if (e.bossSkill === 'well') {
              var wx = p.x, wy = p.y;
              e.skillX = wx; e.skillY = wy;
              FX.sprite(wx, wy, 'vfx_abysseye_gravity_well', 0.9, 120, true);
              bossEmitFx(run, 'eyeWellWarn', { x: Math.round(wx), y: Math.round(wy) });
            } else if (e.bossSkill === 'rift') {
              FX.sprite(e.x, e.y, 'vfx_abysseye_rift', 0.45, 96, true);
              bossEmitFx(run, 'eyeRiftWarn', d0);
            } else if (e.bossSkill === 'summon') {
              FX.ring(e.x, e.y, { r: 84, color: acol, life: 0.55, width: 4 });
              bossEmitFx(run, 'eyeSummonWarn', d0);
            } else {
              setBossAction(run, e, 'attack');
            }
          }
          e.skillT -= dt;
          if (e.skillT <= 0) {
            e.bossActionPhase = 2;
            if (e.bossSkill === 'spiral') { e.skillT = 0.9; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'gaze') { e.skillT = 0.8; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'well') { e.skillT = 0.9; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'rift') { e.skillT = 0.4; e.castStep = 0; setBossAction(run, e, 'idle'); }
            else { e.skillT = 0.55; e.castStep = 0; setBossAction(run, e, 'attack'); }
          }
          break;
        }
        if (e.bossActionPhase === 2) {               // cast / charge
          if (e.bossSkill === 'spiral') {
            e.castStep -= dt;
            if (e.castStep <= 0) {
              e.castStep = 0.28;
              e.aiPhase += 0.62;
              fireShot(e.x, e.y, Math.cos(e.aiPhase), Math.sin(e.aiPhase), 150,
                e.dmg * 0.5 * dMul, 0, 0, false, acol);
              fireShot(e.x, e.y, Math.cos(e.aiPhase + Math.PI), Math.sin(e.aiPhase + Math.PI),
                150, e.dmg * 0.5 * dMul, 0, 0, false, acol);
            }
          } else if (e.bossSkill === 'gaze') {
            var gAim = Math.atan2(p.y - e.y, p.x - e.x);
            if ((run.frame & 2) === 0) {
              FX.lightning(e.x + Math.cos(gAim) * 10, e.y + Math.sin(gAim) * 10,
                e.x + Math.cos(gAim) * 360, e.y + Math.sin(gAim) * 360, acol);
            }
            var gEnts = playerEntries(run);
            for (var gi2 = 0; gi2 < gEnts.length; gi2++) {
              var gw = gEnts[gi2];
              if (gw.downed || gw.player.hp <= 0) continue;
              var gdx = gw.player.x - e.x, gdy = gw.player.y - e.y;
              var galong = gdx * Math.cos(gAim) + gdy * Math.sin(gAim);
              var gperp = Math.abs(-gdx * Math.sin(gAim) + gdy * Math.cos(gAim));
              if (galong > 0 && galong < 380 && gperp < 30 && (run.frame % 10) === 0) {
                damagePlayerAt(run, gw, e.dmg * 0.4);
              }
            }
            bossEmitFx(run, 'eyeGazeCast', { x: Math.round(e.x), y: Math.round(e.y), a: +gAim.toFixed(2) });
          } else if (e.bossSkill === 'well') {
            var wellX = e.skillX || p.x, wellY = e.skillY || p.y;
            var wEnts = playerEntries(run);
            for (var wi2 = 0; wi2 < wEnts.length; wi2++) {
              var wp = wEnts[wi2].player;
              if (wEnts[wi2].downed || wp.hp <= 0) continue;
              var wdx = wellX - wp.x, wdy = wellY - wp.y, wd = Math.hypot(wdx, wdy) || 1;
              if (wd < 170) {
                wp.x += (wdx / wd) * Math.min(wd, 150 * dt);
                wp.y += (wdy / wd) * Math.min(wd, 150 * dt);
              }
            }
            if (e.skillT <= 0.15 && e.castStep === 0) {
              e.castStep = 1;
              FX.ring(wellX, wellY, { r: 54, color: acol, life: 0.4, width: 5 });
              var wellEnts = playerEntries(run);
              for (var we2 = 0; we2 < wellEnts.length; we2++) {
                var we = wellEnts[we2];
                if (!we.downed && we.player.hp > 0 && E.dist2(we.player.x, we.player.y, wellX, wellY) < 56 * 56) {
                  damagePlayerAt(run, we, e.dmg * 0.85 * dMul);
                }
              }
              bossEmitFx(run, 'eyeWellBurst', { x: Math.round(wellX), y: Math.round(wellY) });
            }
          } else if (e.bossSkill === 'rift') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var pa = Math.atan2(p.lastVy || 0, p.lastVx || 1);
              if (!p.lastVx && !p.lastVy) pa = Math.random() * Math.PI * 2;
              var R2 = CFG.GAME.MAP_R;
              e.x = E.clamp(p.x - Math.cos(pa) * 90, -R2, R2);
              e.y = E.clamp(p.y - Math.sin(pa) * 90, -R2, R2);
              e.stiffT = 1.1;
              FX.sprite(e.x, e.y, 'vfx_abysseye_rift', 0.45, 96, true);
              FX.shake(6, 0.3);
              AudioSys.play('freeze');
              bossEmitFx(run, 'eyeRiftCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          } else {
            if (e.castStep === 0) {
              e.castStep = 1;
              for (var gi3 = 0; gi3 < 3; gi3++) spawnAtRing(run, 'ghost');
              AudioSys.play('elite_spawn');
              bossEmitFx(run, 'eyeSummonCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          }
          e.skillT -= dt;
          if (e.skillT <= 0) { e.bossActionPhase = 3; e.skillT = 0.4; }
          break;
        }
        e.skillT -= dt;                               // recover
        if (e.skillT <= 0) {
          e.bossActionPhase = 0; e.bossSkill = '';
          setBossAction(run, e, 'idle');
          e.aiT = 2.2;
        }
        break;
      }
      case 'boss_darklord': { // P1 四技能 / P2 五技能,狂暴加速,变身后保留 500 万生命与逃生门
        var dcol = bdef.shotCol || '#a33b4f';
        if (e.dying) { e.vx = 0; e.vy = 0; break; }
        if (!e.bossAction) setBossAction(run, e, 'idle');
        if (e.stiffT > 0) {
          e.stiffT -= dt;
          e.vx = 0; e.vy = 0;
          if ((run.frame & 3) === 0) FX.trail(e.x + (Math.random() * 34 - 17), e.y + (Math.random() * 34 - 17), dcol, 3);
          if (e.stiffT <= 0) setBossAction(run, e, 'idle');
          break;
        }
        if (e.bossAction === 'idle' || e.bossAction === 'walk') {
          e.vx = nx * spd * sMul; e.vy = ny * spd * sMul;
          e.aiT -= dt;
          if (e.aiT <= 0) {
            e.skillCycle = (e.skillCycle || 0) + 1;
            var c = e.skillCycle;
            e.bossSkill = e.phase2
              ? (c % 5 === 0 ? 'breath' : (c % 5 === 1 ? 'wing' : (c % 5 === 2 ? 'rain' : (c % 5 === 3 ? 'clone' : 'rift'))))
              : (c % 4 === 0 ? 'blade' : (c % 4 === 1 ? 'split' : (c % 4 === 2 ? 'slash' : 'curse')));
            e.bossActionPhase = 1; e.skillMarked = false;
            setBossAction(run, e, 'telegraph');
            e.skillT = e.bossSkill === 'wing' ? 0.55 : 0.65;
          }
          break;
        }
        e.vx = 0; e.vy = 0;
        if (e.bossActionPhase === 1) {                   // telegraph
          if (!e.skillMarked) {
            e.skillMarked = true;
            var dd = { x: Math.round(e.x), y: Math.round(e.y) };
            if (e.bossSkill === 'blade' || e.bossSkill === 'breath') {
              FX.ring(e.x, e.y, { r: e.phase2 ? 130 : 100, color: dcol, life: 0.6, width: 5 });
              bossEmitFx(run, e.bossSkill === 'blade' ? 'lordBladeWarn' : 'lordBreathWarn', dd);
            } else if (e.bossSkill === 'split' || e.bossSkill === 'rain') {
              for (var pi = 0; pi < 3; pi++) {
                var pa = Math.atan2(p.lastVy || 0, p.lastVx || 1);
                var pd = 90 + pi * 46;
                var ptx = E.clamp(p.x + Math.cos(pa + (pi - 1) * 0.34) * pd, -CFG.GAME.MAP_R, CFG.GAME.MAP_R);
                var pty = E.clamp(p.y + Math.sin(pa + (pi - 1) * 0.34) * pd, -CFG.GAME.MAP_R, CFG.GAME.MAP_R);
                (e.skillPts = e.skillPts || []).push({ x: ptx, y: pty });
                FX.sprite(ptx, pty, e.bossSkill === 'split' ? 'vfx_darklord_rift' : 'vfx_darklord_blackflame_rain', 0.6, 92, true);
              }
              bossEmitFx(run, e.bossSkill === 'split' ? 'lordSplitWarn' : 'lordRainWarn',
                { pts: e.skillPts.map(function (pt) { return [Math.round(pt.x), Math.round(pt.y)]; }) });
            } else if (e.bossSkill === 'slash') {
              FX.sprite(e.x, e.y, 'vfx_darklord_rift', 0.45, 110, true);
              bossEmitFx(run, 'lordSlashWarn', dd);
            } else if (e.bossSkill === 'clone') {
              FX.sprite(e.x - 90, e.y, 'vfx_darklord_shadow_clone', 0.6, 160, true, 0.4);
              FX.sprite(e.x + 90, e.y, 'vfx_darklord_shadow_clone', 0.6, 160, true, 0.4);
              bossEmitFx(run, 'lordCloneWarn', dd);
            } else if (e.bossSkill === 'curse') {
              FX.sprite(p.x, p.y, 'vfx_darklord_rift', 0.65, 110, true);
              bossEmitFx(run, 'lordCurseWarn', { x: Math.round(p.x), y: Math.round(p.y) });
            } else {
              FX.ring(e.x, e.y, { r: 92, color: dcol, life: 0.55, width: 4 });
              bossEmitFx(run, 'lordWingWarn', dd);
            }
          }
          e.skillT -= dt;
          if (e.skillT <= 0) {
            e.bossActionPhase = 2;
            if (e.bossSkill === 'blade') { e.skillT = 0.5; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'split') { e.skillT = 0.6; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'slash') { e.skillT = 0.45; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'curse') { e.skillT = 0.7; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'breath') { e.skillT = 0.8; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'wing') { e.chargeSeq = 2; e.chargePhase = 0; e.skT = 0.05; e.bossActionPhase = 3; e.skillT = 1.4; setBossAction(run, e, 'charge'); }
            else if (e.bossSkill === 'rain') { e.skillT = 0.6; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else if (e.bossSkill === 'clone') { e.skillT = 0.6; e.castStep = 0; setBossAction(run, e, 'attack'); }
            else { e.skillT = 0.7; e.castStep = 0; setBossAction(run, e, 'attack'); }
          }
          break;
        }
        if (e.bossActionPhase === 2) {                   // cast
          if (e.bossSkill === 'blade') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var lEnts = playerEntries(run);
              for (var li = 0; li < lEnts.length; li++) {
                var lw = lEnts[li];
                if (!lw.downed && lw.player.hp > 0 && E.dist2(lw.player.x, lw.player.y, e.x, e.y) < 134 * 134) {
                  damagePlayerAt(run, lw, e.dmg * 1.25 * dMul);
                }
              }
              for (var q = 0; q < 8; q++) {
                var aa = (Math.PI * 2 / 8) * q + run.t;
                fireShot(e.x, e.y, Math.cos(aa), Math.sin(aa), 160, e.dmg * 0.5 * dMul, 0, 0, false, dcol);
              }
              FX.ring(e.x, e.y, { r: 134, color: dcol, life: 0.4, width: 5 });
              AudioSys.play('hit2');
              bossEmitFx(run, 'lordBladeCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          } else if (e.bossSkill === 'split' || e.bossSkill === 'rain') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var pts = e.skillPts || [];
              for (var ti = 0; ti < pts.length; ti++) {
                fireLob(pts[ti].x, pts[ti].y, e.x, e.y, e.bossSkill === 'split' ? 42 : 36,
                  e.dmg * 0.85 * dMul, 0.5);
                if (e.bossSkill === 'rain') FX.sprite(pts[ti].x, pts[ti].y, 'vfx_darklord_blackflame_rain', 0.6, 92, true);
              }
              AudioSys.play('shoot_bolt');
              bossEmitFx(run, e.bossSkill === 'split' ? 'lordSplitCast' : 'lordRainCast',
                { pts: pts.map(function (pt) { return [Math.round(pt.x), Math.round(pt.y)]; }) });
            }
          } else if (e.bossSkill === 'slash') {
            if (e.castStep === 0) {
              e.castStep = 1;
              var dpa = Math.atan2(p.lastVy || 0, p.lastVx || 1);
              if (!p.lastVx && !p.lastVy) dpa = Math.random() * Math.PI * 2;
              var R3 = CFG.GAME.MAP_R;
              e.x = E.clamp(p.x - Math.cos(dpa) * 100, -R3, R3);
              e.y = E.clamp(p.y - Math.sin(dpa) * 100, -R3, R3);
              FX.sprite(e.x, e.y, 'vfx_darklord_rift', 0.45, 110, true);
              FX.shake(7, 0.35);
              AudioSys.play('freeze');
              bossEmitFx(run, 'lordSlashCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
            if (e.skillT <= 0.2) {
              var sEnts = playerEntries(run);
              for (var si = 0; si < sEnts.length; si++) {
                var sw = sEnts[si];
                if (!sw.downed && sw.player.hp > 0 && E.dist2(sw.player.x, sw.player.y, e.x, e.y) < 126 * 126) {
                  damagePlayerAt(run, sw, e.dmg * 1.1 * dMul);
                }
              }
            }
          } else if (e.bossSkill === 'curse') {
            if (e.castStep === 0 && e.skillT <= 0.35) {
              e.castStep = 1;
              var ppos = run.player;
              FX.sprite(ppos.x, ppos.y, 'vfx_darklord_rift', 0.5, 110, true);
              var cEnts = playerEntries(run);
              for (var ci = 0; ci < cEnts.length; ci++) {
                var cw = cEnts[ci];
                if (!cw.downed && cw.player.hp > 0 && E.dist2(cw.player.x, cw.player.y, ppos.x, ppos.y) < 70 * 70) {
                  damagePlayerAt(run, cw, e.dmg * 0.8 * dMul);
                }
              }
              for (var gi = 0; gi < 2; gi++) spawnAtRing(run, 'wraith');
              AudioSys.play('freeze');
              bossEmitFx(run, 'lordCurseCast', { x: Math.round(ppos.x), y: Math.round(ppos.y) });
            }
          } else if (e.bossSkill === 'breath') {
            var bAim = Math.atan2(p.y - e.y, p.x - e.x);
            if ((run.frame & 2) === 0) {
              FX.lightning(e.x + Math.cos(bAim) * 20, e.y + Math.sin(bAim) * 20,
                e.x + Math.cos(bAim) * 340, e.y + Math.sin(bAim) * 340, '#7a3cff');
            }
            var bEnts = playerEntries(run);
            for (var bi2 = 0; bi2 < bEnts.length; bi2++) {
              var bw = bEnts[bi2];
              if (bw.downed || bw.player.hp <= 0) continue;
              var bdx = bw.player.x - e.x, bdy = bw.player.y - e.y;
              var bAlong = bdx * Math.cos(bAim) + bdy * Math.sin(bAim);
              var bPerp = Math.abs(-bdx * Math.sin(bAim) + bdy * Math.cos(bAim));
              if (bAlong > 0 && bAlong < 340 && bPerp < 52 && (run.frame % 10) === 0) {
                damagePlayerAt(run, bw, e.dmg * 0.36);
              }
            }
            bossEmitFx(run, 'lordBreathCast', { x: Math.round(e.x), y: Math.round(e.y), a: +bAim.toFixed(2) });
          } else if (e.bossSkill === 'clone') {
            if (e.castStep === 0) {
              e.castStep = 1;
              for (var cl = 0; cl < 2; cl++) {
                FX.sprite(e.x + (cl ? 90 : -90), e.y, 'vfx_darklord_shadow_clone', 0.7, 160, true, 0.4);
              }
              for (var cq = 0; cq < 12; cq++) {
                var ca = (Math.PI * 2 / 12) * cq + run.t;
                fireShot(e.x, e.y, Math.cos(ca), Math.sin(ca), 150, e.dmg * 0.42 * dMul, 0, 0, false, dcol);
              }
              AudioSys.play('shoot_bolt');
              bossEmitFx(run, 'lordCloneCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          } else {
            if (e.castStep === 0) {
              e.castStep = 1;
              FX.flash('#17020b', 0.5, 0.5);
              FX.sprite(e.x, e.y, 'vfx_darklord_rift', 0.65, 130, true);
              for (var rq = 0; rq < 24; rq++) {
                var ra = (Math.PI * 2 / 24) * rq;
                fireShot(e.x, e.y, Math.cos(ra), Math.sin(ra), 165, e.dmg * 0.45 * dMul, 0, 0, false, dcol);
              }
              AudioSys.play('shoot_bolt');
              bossEmitFx(run, 'lordRiftCast', { x: Math.round(e.x), y: Math.round(e.y) });
            }
          }
          e.skillT -= dt;
          if (e.skillT <= 0) { e.bossActionPhase = 3; e.skillT = e.bossSkill === 'slash' ? 0.8 : 0.4; }
          break;
        }
        // Wing rush: reuse the authoritative three-charge sequence with the
        // authored P2 wing-rush strip as its visual.
        if (e.bossSkill === 'wing' && e.chargeSeq > 0) {
          e.skT -= dt;
          if (e.chargePhase === 0) {
            e.vx = 0; e.vy = 0; e.flash = 0.05;
            setBossAction(run, e, 'charge');
            if (e.skT <= 0) {
              e.chargePhase = 1; e.skT = 0.5; e.tgtX = nx; e.tgtY = ny;
              FX.ring(e.x, e.y, { r: 92, color: dcol, life: 0.3, width: 4 });
            }
          } else {
            e.vx = e.tgtX * (enrage ? 520 : 450); e.vy = e.tgtY * (enrage ? 520 : 450);
            e.kx = 0; e.ky = 0;
            if ((run.frame & 1) === 0) FX.trail(e.x, e.y, dcol, 5);
            if (e.skT <= 0) {
              e.chargeSeq--; e.chargePhase = 0; e.skT = 0.55;
              FX.shake(6, 0.3);
              for (var dj = 0; dj < 8; dj++) {
                var da = (Math.PI * 2 / 8) * dj + run.t;
                fireShot(e.x, e.y, Math.cos(da), Math.sin(da), 150, e.dmg * 0.4 * dMul, 0, 0, false, dcol);
              }
            }
          }
          e.skillT -= dt;
          if (e.skillT <= 0) { e.bossActionPhase = 0; e.bossSkill = ''; setBossAction(run, e, 'idle'); e.aiT = 1.2 / (enrage ? 1.6 : 1); }
          break;
        }
        e.skillT -= dt;                               // recover
        if (e.skillT <= 0) {
          e.bossActionPhase = 0; e.bossSkill = '';
          setBossAction(run, e, 'idle');
          e.aiT = (e.phase2 ? 1.4 : 2.4) / (enrage ? 1.6 : 1);
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
    g.uid = E.nextUid();
    g.alive = true; g.x = x + (Math.random() * 10 - 5); g.y = y + (Math.random() * 10 - 5);
    g.v = value; g.pull = false; g.vx = 0; g.vy = 0; g.t = 0;
  }

  function updateGems(run, dt) {
    for (var i = 0; i < gems.length; i++) {
      var g = gems[i];
      if (!g.alive) continue;
      g.t += dt;
      var w = nearestPlayer(run, g.x, g.y);
      if (!w) continue;
      var p = w.player, s = p.stats;
      var mr2 = s.magnet * s.magnet;
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
        addXp(run, g.v, s);
        FX.pickup(p.x, p.y - 14, '#59c2ff');
        AudioSys.play('gem');
      }
    }
  }

  function addXp(run, v, ownerStats) {
    // 联机时经验按人数稀释,保证升级节奏不因多人分摊而失控
    var st = ownerStats || run.player.stats;
    var gain = v * st.growth * (run.coopXpMul || 1);
    // 联机共享经验池:加给所有人,升级节奏一致。
    // ⚠ 必须判 !== null 而不是 truthy:coopXp 联机时初始化为 0(单机为 null),
    // 写成 if (run.coopXp) 会因为 0 是 falsy 而在开局永远走单机分支 ——
    // 共享经验池根本不累加,onCoopLevel 永不触发,客户端永远收不到升级选项。
    // 这正是"联机升级坏了/升级拿不到新武器"的直接原因。
    if (run.coopXp !== null && run.coopXp !== undefined) {
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
  // 金币/烤肉会过期消失(避免长局/联机里掉落地板上的东西无限堆积,把数组撑到
  // 无界并挤掉 Boss 宝箱的生成位);宝箱是稀有掉落,永不消失。
  var ITEM_TTL = 300, ITEM_BLINK = 5;
  var items = [];
  function spawnItem(run, type, x, y) {
    for (var i = 0; i < items.length; i++) {
      if (!items[i].alive) {
        var it = items[i];
        it.alive = true; it.uid = E.nextUid(); it.type = type; it.x = x; it.y = y; it.t = 0; it.pull = false;
        it.ttl = (type === 'chest') ? -1 : ITEM_TTL;
        it.v = (type === 'coin') ? (CFG.DROPS.goldValue[0] + Math.floor(Math.random() * (CFG.DROPS.goldValue[1] - CFG.DROPS.goldValue[0] + 1))) : 0;
        return it;
      }
    }
    // 池满但活着的东西都是会过期的普通掉落时,撵走最老的一件腾位置 ——
    // 否则 Boss/精英宝箱会在满地金币时静默消失,等于把战利品白白吞掉。
    if (type === 'chest' || type === 'meat') {
      var oldest = null, ot = 1e18;
      for (i = 0; i < items.length; i++) {
        if (items[i].alive && items[i].type !== 'chest' && items[i].t < ot) {
          ot = items[i].t; oldest = items[i];
        }
      }
      if (oldest) oldest.alive = false;
    }
    return null;
  }

  function updateItems(run, dt) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      if (it.ttl > 0) {
        it.ttl -= dt;
        if (it.ttl <= 0) { it.alive = false; continue; }
      }
      var w = nearestPlayer(run, it.x, it.y);
      if (!w) continue;
      var p = w.player;
      // 满血时不拾取烤肉:吃到也是浪费,让它留在地上等掉血了再吃
      if (it.type === 'meat' && p.hp >= p.stats.hp) continue;
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
        collectItem(run, it, w);
      }
    }
  }

  function collectItem(run, it, w) {
    var p = w ? w.player : run.player;
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
        bombBlast(run, 260, p.x, p.y);
        Meta.track('bomb');
        AudioSys.play('bomb');
        break;
      case 'clock':
        run.freezeT = CFG.DROPS.freezeDur;
        FX.flash('#9adfff', 0.25, 0.5);
        AudioSys.play('freeze');
        break;
      case 'chest':
        if (w && w.isHost) run.pendingChest++;
        else if (w) w.pendingChest = (w.pendingChest || 0) + 1;
        AudioSys.play('chest_open');
        break;
    }
  }

  function collectItemByUid(run, uid, w) {
    if (uid === undefined || uid === null || !w || w.downed || w.player.hp <= 0) return false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.alive || it.uid !== uid) continue;
      if (E.dist2(it.x, it.y, w.player.x, w.player.y) > 44 * 44) return false;
      it.alive = false;
      collectItem(run, it, w);
      return true;
    }
    return false;
  }

  function bombBlast(run, dmg, cx, cy) {
    var p = run.player;
    var bx = cx === undefined ? p.x : cx, by = cy === undefined ? p.y : cy;
    FX.flash('#fff2b0', 0.5, 0.4);
    FX.shake(10, 0.5);
    FX.explosion(bx, by, 200);
    for (var i = 0; i < POOL; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      if (E.dist2(e.x, e.y, bx, by) < 560 * 560) {
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
    var ents = playerEntries(run);
    for (var pi = 0; pi < ents.length; pi++) {
      var p = ents[pi].player;
      if (E.dist2(p.x, p.y, x, y) > r2) continue;
      if (p.webStacks > 0 || p.rootT > 0 || p.slow > 0) {
        p.webStacks = 0; p.webT = 0; p.rootT = 0;
        p.slow = 0; p.slowT = 0;
        FX.burst(p.x, p.y, { color: '#ffbb55', n: 12, speed: 90, life: 0.4, size: 2 });
        burned++;
      }
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
    var w = randomPlayer(run) || { player: run.player };
    var p = w.player, i, a;
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
        // 池子正好被占满时 spawnAtRing 会返回 null:事件已经递增过了,若不退回
        // 该剧情 Boss 就永远不刷了。回退索引,下一帧自动重试。
        else if (run.eventIdx > 0) run.eventIdx--;
        break;
    }
  }

  function announceBoss(run, b) {
    run.boss = b;
    if (b.bossType === 'boss_darklord') {
      var p = run.player, R = CFG.GAME.MAP_R - 180;
      var a = Math.random() * Math.PI * 2, d = 300 + Math.random() * 110;
      run.exitGate = { x: E.clamp(p.x + Math.cos(a) * d, -R, R), y: E.clamp(p.y + Math.sin(a) * d, -R, R), open: false, used: false, openedAt: 0 };
      if (run.cb && run.cb.onWarn) run.cb.onWarn('远处浮现一座封闭的巨门……');
    }
    AudioSys.play('boss_spawn');
    // 切到该 Boss 的专属战斗曲
    var bd = CFG.BOSSES[b.bossType];
    if (bd && bd.music) AudioSys.playMusic(bd.music);
    AudioSys.setIntensity(3);
    FX.shake(8, 0.6);
    if (run.cb.onBoss) run.cb.onBoss(bd);
  }

  // ================= 绘制 =================
  // Boss 动作条带的画布规格不一(例如暗潮魔王蓄力/死亡用 144×144、普通动作 112×112,
  // 深渊之眼 attack 用 96×96 且 renderScale 0.58)。这里按 Boss 形态给一个基准视觉宽度,
  // 再补偿该条带实际画布宽度与 renderScale,保证同一 Boss 的每个动作在屏幕上始终一样大。
  var BOSS_VISUAL_BASE = {
    // 史莱姆王/深渊之眼已切回 96×96 的 V2/V4 素材，基准宽度同步为 96。
    boss_slimeking: 96,
    boss_bonelord: 96,
    boss_abysseye_remote: 96,
    boss_abysseye_charge: 96,
    boss_abysseye: 96,
    boss_darklord_phase2: 144,
    boss_darklord: 112
  };
  var bossActionScaleCache = {};
  function bossActionVisualScale(name) {
    if (bossActionScaleCache[name] !== undefined) return bossActionScaleCache[name];
    var base = 0;
    for (var k in BOSS_VISUAL_BASE) {
      if (name === k || name.indexOf(k + '_') === 0) { base = BOSS_VISUAL_BASE[k]; break; }
    }
    if (!base) { bossActionScaleCache[name] = 1; return 1; }
    var fr = SpriteGen.frames(name);
    if (!fr || !fr.length) { bossActionScaleCache[name] = 1; return 1; }
    var rs = SpriteGen.renderScale(name) || 1;
    bossActionScaleCache[name] = (base / fr[0].width) / rs;
    return bossActionScaleCache[name];
  }

  var framesCache = {};        // 原始帧(含 AI 母版夹带的过渡/空白帧)
  var flipCache = {};          // 原始帧的水平翻转副本
  var stableCache = {};        // 稳定帧(剔除几乎空白的过渡帧,消除循环闪烁)
  var stableFlipCache = {};    // 稳定帧的水平翻转副本

  function buildFlipped(src) {
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var cv = document.createElement('canvas');
      cv.width = src[i].width; cv.height = src[i].height;
      var cx = cv.getContext('2d');
      cx.translate(cv.width, 0); cx.scale(-1, 1);
      cx.drawImage(src[i], 0, 0);
      if (src[i]._atlasAnchor) {
        cv._atlasAnchor = { x: cv.width - 1 - src[i]._atlasAnchor.x, y: src[i]._atlasAnchor.y };
      }
      out.push(cv);
    }
    return out;
  }
  function getFrames(name, flip) {
    if (!flip) {
      var c0 = framesCache[name];
      if (!c0) { c0 = SpriteGen.frames(name); framesCache[name] = c0; }
      return c0;
    }
    var c = flipCache[name];
    if (!c) { c = buildFlipped(getFrames(name, false)); flipCache[name] = c; }
    return c;
  }
  // 怪物/商人等 AI 母版图集里常夹着几乎空白的过渡帧,循环播到它整只怪会
  // 消失/骤缩(就是"闪烁/动作贴图不正常")。stableFrames 按不透明覆盖率剔除
  // 这类离群帧,动作照常播放。仅用于循环动画;倒地走"末帧"路径,不受影响。
  function getStableFrames(name, flip) {
    if (!flip) {
      var c = stableCache[name];
      if (!c) { c = SpriteGen.stableFrames(name); stableCache[name] = c; }
      return c;
    }
    var c2 = stableFlipCache[name];
    if (!c2) { c2 = buildFlipped(getStableFrames(name, false)); stableFlipCache[name] = c2; }
    return c2;
  }

  // renderScale 每帧对名字做两次正则替换;按名缓存后 drawSprite 高频路径零正则。
  var scaleCache = {};
  function scaleOf(name) {
    var s = scaleCache[name];
    if (s === undefined) { s = SpriteGen.renderScale(name); scaleCache[name] = s; }
    return s;
  }

  var fpsCache = {};
  function animFps(name, fallback) {
    var key = name + '|' + fallback;
    var f = fpsCache[key];
    if (f === undefined) { f = SpriteGen.animationFps(name, fallback); fpsCache[key] = f; }
    return f;
  }

  function buildTint(src, color) {
    var cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    var cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }
  var tintCache = {};          // 原始帧染色
  var tintStableCache = {};    // 稳定帧染色
  // srcFrames 传未翻转的帧;翻转在 drawSpriteCore 里用 scale(-1,1) 处理,
  // 避免染色贴图被翻转两次导致与本体镜像错位。
  function getTint(cache, name, srcFrames, frameIdx, color) {
    var key = name + '|' + frameIdx + '|' + color;
    var cv = cache[key];
    if (!cv) { cv = buildTint(srcFrames[frameIdx], color); cache[key] = cv; }
    return cv;
  }

  // 帧内容质心:把"质心漂移"的动画重锚定回身体中心。不少 AI 母版的某一两帧内容
  // 位置会整体跳开(实测腐液之王摆 12.7px、骸骨领主 11.2px,其他怪 <3px),直接按
  // 帧中心画会让角色在动画里左右弹——就是"动作贴图显示不正常"。这里按各帧内容
  // 质心相对平均质心的偏移补偿,身体钉在原地。摆动 <4px 的精灵视为稳定不处理。
  var _spriteCx = {};          // 原始帧质心
  var _spriteCxStable = {};    // 稳定帧质心
  function computeCxMeta(fr) {
    // 单帧素材天然稳定,不做任何 getImageData(高频路径最快)
    if (fr.length <= 1) {
      return { per: [fr[0].width / 2], avg: fr[0].width / 2, stable: true };
    }
    var per = [], sum = 0, min = 1e9, max = -1, i;
    var cv = document.createElement('canvas');
    var g = cv.getContext('2d', { willReadFrequently: true });
    for (i = 0; i < fr.length; i++) {
      var im = fr[i];
      var cx = im.width / 2;
      try {
        cv.width = im.width; cv.height = im.height;
        g.clearRect(0, 0, cv.width, cv.height);
        g.drawImage(im, 0, 0);
        var d = g.getImageData(0, 0, cv.width, cv.height).data;
        var nz = 0, sx = 0, k;
        for (k = 3; k < d.length; k += 4) if (d[k] > 16) { nz++; sx += (k / 4) % im.width; }
        if (nz) cx = sx / nz;
      } catch (e) {
        // file:// 下画布被跨域污染读不了像素,退回帧中心(不重锚定)
      }
      per.push(cx); sum += cx;
      if (cx < min) min = cx; if (cx > max) max = cx;
    }
    return { per: per, avg: per.length ? sum / per.length : 0, stable: (max - min) < 4 };
  }
  function cxMeta(cache, name, frames) {
    var m = cache[name];
    if (m === undefined) { m = computeCxMeta(frames); cache[name] = m; }
    return m;
  }

  function drawSpriteCore(ctx, name, frames, srcFrames, frameIdx, x, y, scale, flip, alpha, tint, cxCache, tintC, useAnchor) {
    var fi = frameIdx % frames.length;
    var img = frames[fi];
    scale *= scaleOf(name);
    var w = img.width * 2 * scale, h = img.height * 2 * scale;
    // 重锚定:把当前帧内容质心拉回整组帧的平均质心,消除动画里的横向弹跳
    var cxOff = 0;
    if (frames.length > 1) {
      // 质心用"未翻转"帧计算,翻转时再对 cxOff 取反;若用已翻转帧算质心
      // 再取反会双重镜像,反而让身体在翻转动画里错位。
      var meta = cxMeta(cxCache, name, srcFrames);
      if (!meta.stable) {
        var fx = meta.per[fi];
        cxOff = (meta.avg - fx) / img.width;
        if (flip) cxOff = -cxOff;
      }
    }
    var ox = cxOff * w;
    var left = x - w / 2 + ox, top = y - h / 2;
    if (useAnchor && img._atlasAnchor) {
      left = x - img._atlasAnchor.x / img.width * w;
      top = y - img._atlasAnchor.y / img.height * h;
      ox = 0;
    }
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, left, top, w, h);
    if (tint) {
      var tc = getTint(tintC, name, srcFrames, fi, tint);
      ctx.globalAlpha = (alpha !== 1 ? alpha : 1) * 0.65;
      if (flip) {
        ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
        if (useAnchor && srcFrames[fi]._atlasAnchor) {
          var ta = srcFrames[fi]._atlasAnchor;
          ctx.drawImage(tc, -ta.x / tc.width * w, -ta.y / tc.height * h, w, h);
        } else {
          ctx.drawImage(tc, -w / 2 - ox, -h / 2, w, h);
        }
        ctx.restore();
      } else {
        ctx.drawImage(tc, left, top, w, h);
      }
    }
    if (alpha !== 1 || tint) ctx.globalAlpha = 1;
  }

  function drawSprite(ctx, name, frameIdx, x, y, scale, flip, alpha, tint) {
    var src = getFrames(name, false);
    var frames = flip ? getFrames(name, true) : src;
    drawSpriteCore(ctx, name, frames, src, frameIdx, x, y, scale, flip, alpha, tint, _spriteCx, tintCache);
  }
  // 稳定帧版本:只给怪物/商人这类 AI 母版循环动画用,过滤掉空白过渡帧。
  function drawSpriteStable(ctx, name, frameIdx, x, y, scale, flip, alpha, tint) {
    var src = getStableFrames(name, false);
    var frames = flip ? getStableFrames(name, true) : src;
    drawSpriteCore(ctx, name, frames, src, frameIdx, x, y, scale, flip, alpha, tint, _spriteCxStable, tintStableCache);
  }

  function drawActorSprite(ctx, name, frameIdx, x, groundY, scale, flip, alpha, tint, stable) {
    var src = stable ? getStableFrames(name, false) : getFrames(name, false);
    var frames = flip ? (stable ? getStableFrames(name, true) : getFrames(name, true)) : src;
    drawSpriteCore(ctx, name, frames, src, frameIdx, x, groundY, scale, flip, alpha, tint,
      stable ? _spriteCxStable : _spriteCx, stable ? tintStableCache : tintCache, true);
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

  function drawExitGate(ctx, gate, t) {
    var pulse = 0.5 + Math.sin(t * 2.4) * 0.5;
    var openAmt = gate.open ? E.clamp((t - (gate.openedAt || t)) / 1.1, 0, 1) : 0;
    var gateFrames = SpriteGen.frames('vfx_darklord_escape_gate');
    var img = gateFrames && gateFrames.length === 4
      ? gateFrames[Math.min(3, Math.floor(openAmt * 4))]
      : SpriteGen.get('exit_gate');
    var gw = 166, gh = 248;
    ctx.save();
    // First paint the dynamic portal light, then the authored stone/iron gate.
    // It produces a real opening seam without moving the landmark itself.
    if (gate.open) {
      ctx.globalAlpha = 0.24 + pulse * 0.26;
      ctx.drawImage(SpriteGen.glow('#cf244c'), gate.x - 132, gate.y - 222, 264, 264);
    }
    ctx.globalAlpha = gate.open ? 0.98 : 0.88;
    ctx.drawImage(img, gate.x - gw / 2, gate.y - gh, gw, gh);
    if (gate.open) {
      var slit = 5 + openAmt * 28;
      ctx.globalAlpha = 0.52 + pulse * 0.30;
      ctx.fillStyle = '#b91e47'; ctx.fillRect(gate.x - slit / 2, gate.y - gh + 54, slit, gh - 74);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#f1c16c'; ctx.lineWidth = 1;
      ctx.strokeRect(gate.x - slit / 2 - 2, gate.y - gh + 54, slit + 4, gh - 74);
      ctx.globalAlpha = 1; ctx.fillStyle = '#f4d292'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('撤离之门  [E]', gate.x, gate.y - gh - 12); ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function draw(ctx, run) {
    var i, e, g, it, p = run.player;
    var animF = Math.floor(run.t * 6);
    var shadow = SpriteGen.get('vfx_shadow');
    if (run.exitGate) drawExitGate(ctx, run.exitGate, run.t);

    // 宝石
    for (i = 0; i < gems.length; i++) {
      g = gems[i];
      if (!g.alive) continue;
      var gname = g.v >= 30 ? 'gem_big' : (g.v >= 10 ? 'gem3' : (g.v >= 3 ? 'gem2' : 'gem1'));
      var bob = Math.sin(g.t * 4 + i) * 2;
      // 大颗经验加一圈微光(用缓存贴图,不再每帧建渐变)
      if (g.v >= 10) {
        ctx.globalAlpha = 0.55;
        var gemGlow = g.v >= 30 ? 28 : 20;
        ctx.drawImage(SpriteGen.glow(g.v >= 30 ? '#b96cff' : '#59c2ff'),
          g.x - gemGlow, g.y - gemGlow, gemGlow * 2, gemGlow * 2);
        ctx.globalAlpha = 1;
      }
      var gemScale = g.v >= 30 ? 1.06 : (g.v >= 10 ? 0.86 : (g.v >= 3 ? 0.70 : 0.56));
      drawSprite(ctx, gname, 0, g.x, g.y + bob, gemScale, false, 1, null);
    }
    // 道具
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.alive) continue;
      var bob2 = Math.sin(it.t * 3 + i) * 2;
      var nm = it.type === 'coin' ? 'coin' : (it.type === 'chest' ? 'chest' : it.type);
      // 拾取物地面柔光,远处也能看见
      var glowCol = it.type === 'chest' ? '#ffd76b'
        : (it.type === 'coin' ? '#ffeb78'
        : (it.type === 'meat' ? '#ff788c' : '#78c8ff'));
      var gr = it.type === 'chest' ? 38 : 24;
      var pulse = 0.5 + Math.sin(it.t * 4) * 0.5;
      // 即将消失前闪烁提醒玩家(宝箱 ttl=-1 不参与)
      if (it.ttl > 0 && it.ttl < ITEM_BLINK && Math.floor(it.ttl * 6) % 2 === 0) continue;
      // 拾取物地面柔光:缓存贴图,不再每帧建渐变
      ctx.globalAlpha = 0.45 + pulse * 0.30;
      ctx.drawImage(SpriteGen.glow(glowCol), it.x - gr, it.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      // 维持辨识度但回到与角色比例协调的尺寸；硬像素轮廓足够清晰，毋须占半个屏幕。
      var itemScale = it.type === 'chest' ? 0.58 : (it.type === 'coin' ? 0.47 : 0.55);
      drawSprite(ctx, nm, it.type === 'coin' ? animF : 0, it.x, it.y + bob2, itemScale, false, 1, null);
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
      var sc = (e.boss ? 2 : 1) * (e.elite ? CFG.ELITE.scale : 1) * (e.phase2 ? 1 : 1)
        * ((e.def && e.def.drawScale) || 1);
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
        if (e.id === 'zombie') {
          // 烂泥行者有独立出土条带:一次性播放,不循环通用动作。
          var emergeFrames = getFrames('zombie_emerge', false);
          var emergeF = Math.min(emergeFrames.length - 1, Math.floor(prog * emergeFrames.length));
          drawActorSprite(ctx, 'zombie_emerge', emergeF, e.x, e.y + 4 + rise, sc, e.face < 0, 1, '#8a7a5a', false);
        } else {
          var burrowF = Math.floor(run.t * animFps(e.id, 6));
          drawActorSprite(ctx, e.id, burrowF + (e.animo | 0), e.x, e.y + 4 + rise, sc, e.face < 0, 1, '#8a7a5a', true);
        }
        ctx.restore();
        // 飞溅的土屑
        if ((run.frame & 7) === 0) FX.trail(e.x + (Math.random() * 20 - 10), e.y, '#6b5a42', 2);
        continue;
      }
      ctx.globalAlpha = 0.4;
      ctx.drawImage(shadow, e.x - 12 * sc, e.y + e.r * 0.7, 24 * sc, 8 * sc);
      ctx.globalAlpha = 1;
      var tint = null;
      if (e.phase2) tint = '#3c1528';
      else if (e.guard > 0) tint = '#9cf';
      // Boss 蓄力/受击不再叠加白色闪白图层，否则动作帧会被白光完全盖住。
      else if (e.flash > 0 && !e.boss) tint = '#ffffff';
      else if (run.freezeT > 0 || e.frozen > 0) tint = '#5fd0ff';
      else if (e.slowT > 0) tint = '#8ab6ff';
      var wob = e.boss ? 0 : Math.sin(run.t * 8 + e.animo) * 1.5;
      // 史莱姆跳跃:hop 抬高机体,squash 做蓄力压扁/腾空拉伸
      var hop = e.hop || 0, sq = e.squash || 1;
      var enemySprite = e.boss ? e.bossType : (e.elite ? 'elite_' + e.id : e.id);
      var visualState = e.boss ? (e.bossAction || e.netAnimState || '') : (e.netAnimState || '');      if (!visualState) {
        if (e.attackAnimT > 0) visualState = 'attack';
        else if (e.boss && (e.chargeSeq > 0 || e.aiPhase === 1)) visualState = 'charge';
        else if (e.vx !== 0 || e.vy !== 0) visualState = 'walk';
        else visualState = 'idle';
      }
      // 受击动作只在 idle/walk/recover 时抢表现,永远不能覆盖死亡。
      if (e.boss && !e.dying && e.hurtT > 0 &&
          (visualState === 'idle' || visualState === 'walk')) visualState = 'hurt';
      if (e.boss && (e.dying || visualState === 'death')) visualState = 'death';
      var oneShotBoss = false;
      if (e.boss) {
        if (visualState === 'telegraph') visualState = e.bossSkill === 'jump' || e.bossSkill === 'bounce' ? 'charge' : 'attack';
        if (e.bossType === 'boss_darklord') {
          enemySprite = e.phase2 ? 'boss_darklord_phase2' : 'boss_darklord';
          if (visualState === 'transform') enemySprite = 'boss_darklord_transform';
          else if (visualState === 'death') enemySprite = 'boss_darklord_death';
          else if (visualState === 'hurt') enemySprite = e.phase2 ? 'boss_darklord_phase2_hurt' : 'boss_darklord_hurt';
          else if (visualState === 'walk') enemySprite = e.phase2 ? 'boss_darklord_phase2_walk' : 'boss_darklord_walk';
          else if (visualState === 'attack') enemySprite = e.phase2 ? 'boss_darklord_phase2_breath' : 'boss_darklord_attack';
          else if (visualState === 'charge') enemySprite = 'boss_darklord_charge';
          oneShotBoss = visualState === 'attack' || visualState === 'charge' || visualState === 'death' ||
            visualState === 'hurt' || visualState === 'transform';
        } else if (e.bossType === 'boss_abysseye') {          // Split-phase eyes use their role-specific authored sheets.
          if (e.phase2 && e.eyeRole === 'caster') {
            enemySprite = 'boss_abysseye_remote';
            if (visualState === 'attack') enemySprite = 'boss_abysseye_remote_cast';
            else if (visualState === 'hurt') enemySprite = 'boss_abysseye_remote_hurt';
            else if (visualState === 'death') enemySprite = 'boss_abysseye_remote_death';
          } else if (e.phase2 && e.eyeRole === 'charger') {
            enemySprite = 'boss_abysseye_charge';
            if (visualState === 'charge') enemySprite = 'boss_abysseye_charge_dash';
            else if (visualState === 'hurt') enemySprite = 'boss_abysseye_charge_hurt';
            else if (visualState === 'death') enemySprite = 'boss_abysseye_charge_death';
          } else {
            enemySprite = 'boss_abysseye';
            if (visualState === 'split') enemySprite = 'boss_abysseye_split';
            else if (visualState === 'hurt') enemySprite = 'boss_abysseye_hurt';
            else if (visualState === 'death') enemySprite = 'boss_abysseye_death';
            else if (visualState === 'walk') enemySprite = 'boss_abysseye_walk';
            else if (visualState === 'attack' || visualState === 'charge') enemySprite = 'boss_abysseye_remote_cast';
          }
          oneShotBoss = visualState === 'attack' || visualState === 'charge' || visualState === 'death' ||
            visualState === 'split' || visualState === 'hurt';
        } else {
          var actionSuffix = { idle: '', walk: '_walk', attack: '_attack', charge: '_charge',
            shield: '_shield', hurt: '_hurt', death: '_death', resurrect: '_resurrect' }[visualState];
          if (actionSuffix === undefined) actionSuffix = '';
          enemySprite += actionSuffix;
          oneShotBoss = actionSuffix !== '' && actionSuffix !== '_walk';
        }
      } else if (visualState === 'attack') enemySprite += '_attack';
      else if (visualState === 'charge' && e.boss) enemySprite += '_charge';
      else if (visualState === 'walk') enemySprite += '_walk';
      var animAge = e.bossAction && e.bossActionTick ? Math.max(0, (run.frame - e.bossActionTick) / 60)
        : (e.netAnimState ? Math.max(0, (run.frame - e.netAnimEpoch) / 60) : run.t);
      var enemyF = Math.floor(animAge * animFps(enemySprite, visualState === 'idle' ? 6 : 10));
      if (oneShotBoss) {
        var authored = SpriteGen.frames(enemySprite);
        if (authored && authored.length > 1) enemyF = Math.min(enemyF, authored.length - 1);
      }
      // 一次性动作(变招/死亡/变身/受击)必须从服务器动作纪元精确推进,
      // 不能叠加每个敌人随机的 animo 相位:否则 8 帧动画 + animo 取模会
      // 跳到中间帧,把残缺的动作帧画出来。循环动画仍用 animo 错相。
      var enemyFrameIdx = oneShotBoss ? enemyF : enemyF + (e.animo | 0);
      drawActorSprite(ctx, enemySprite, enemyFrameIdx,
                 e.x, e.y + e.r * 0.7 + wob - hop, sc * sq * (e.boss ? bossActionVisualScale(enemySprite) : 1),
                 e.face < 0, e.alpha, tint, true);
      // 被强化的小怪：血气贴着身体向外逸散，不再画一圈廉价的黄色圆环。
      if (e.buffed && !e.elite && !e.boss) {
        var mistFrames = getFrames('vfx_smoke', false);
        var mistF = (Math.floor(run.t * 7) + (e.animo | 0)) % mistFrames.length;
        var mistSize = Math.max(30, e.r * sc * 3.3);
        var mistScale = mistSize / Math.max(1, mistFrames[mistF].width * 2 * SpriteGen.renderScale('vfx_smoke'));
        drawSprite(ctx, 'vfx_smoke', mistF, e.x, e.y - mistSize * 0.10, mistScale,
          false, 0.20 + Math.sin(run.t * 4 + e.animo) * 0.035, '#a51f32');
        ctx.globalAlpha = 0.28;
        for (var bloodI = 0; bloodI < 3; bloodI++) {
          var bloodA = run.t * (0.52 + bloodI * 0.09) + e.animo * 1.7 + bloodI * 2.1;
          var bloodR = e.r * sc * (0.75 + bloodI * 0.18);
          ctx.fillStyle = bloodI === 1 ? '#d34a4f' : '#7d1426';
          ctx.fillRect(Math.round(e.x + Math.cos(bloodA) * bloodR),
            Math.round(e.y - 3 + Math.sin(bloodA) * bloodR * 0.46), 2, 2);
        }
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
    var shotFrames = getFrames('p_enemy_bolt', false);
    var webFrames = getFrames('p_web', false);
    for (i = 0; i < shots.length; i++) {
      var sh = shots[i];
      if (!sh.alive) continue;
      if (sh.webType) {
        var webImg = webFrames[0];
        ctx.drawImage(webImg, sh.x - 9, sh.y - 9, 18, 18);
        continue;
      }
      var authored = getFrames(sh.sprite || 'p_enemy_blood', false);
      var shotImg = (authored && authored[0]) || shotFrames[0];
      var shotSize = Math.max(16, (sh.size || 16) * 1.25);
      if (sh.col) {
        ctx.globalAlpha = 0.22;
        ctx.drawImage(SpriteGen.glow(sh.col), sh.x - shotSize, sh.y - shotSize, shotSize * 2, shotSize * 2);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(shotImg, sh.x - shotSize / 2, sh.y - shotSize / 2, shotSize, shotSize);
    }
    // 玩家
    ctx.globalAlpha = 0.4;
    ctx.drawImage(shadow, p.x - 12, p.y + 8, 24, 8);
    ctx.globalAlpha = 1;
    var blink = p.iframe > 0 && (Math.floor(run.t * 14) & 1);
    if (p.downed) {
      var downDir = p.dir || 'down';
      var downSprite = p.char.sprite + '_death_' + downDir;
      var downFrames = getFrames(downSprite, false);
      drawActorSprite(ctx, downSprite, downFrames.length - 1, p.x, p.y + 8, 1, false, 0.55, '#ff6688', false);
      if (p.reviveT > 0) {
        var revivePct = E.clamp(p.reviveT / CFG.COOP.reviveTime, 0, 1);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#7ce87c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * revivePct);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (!blink) {
      var playerDir = p.dir || (p.face < 0 ? 'left' : 'right');
      var playerSprite = p.char.sprite + '_idle_' + playerDir;
      var pf = 0;
      if (p.hurtFlash > 0 && p.attackAnimT <= 0) {
        playerSprite = p.char.sprite + '_hurt_' + playerDir;
        pf = Math.floor((0.18 - Math.min(0.18, p.hurtFlash)) * animFps(playerSprite, 10));
      } else if (p.attackAnimT > 0) {
        playerSprite = p.char.sprite + '_attack_' + playerDir;
        pf = Math.floor(p.attackAnimAge * animFps(playerSprite, 13));
      } else if (p.moving) {
        playerSprite = p.char.sprite + '_walk_' + playerDir;
        pf = Math.floor(p.animT * animFps(playerSprite, 10));
      } else {
        // 待机固定第一帧,不做旋转动画
        pf = 0;
      }
      // Four-direction sheets already contain independent left and right art.
      // Flipping the left row a second time was the root cause of missing and
      // contradictory right-facing movement.
      drawActorSprite(ctx, playerSprite, pf, p.x, p.y + 8, 1, false, 1, p.hurtFlash > 0 ? '#ff4444' : null, false);
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
  // 客户端不跑敌人 AI。按稳定 UID 保留实体与动画纪元，并使用约 100ms
  // 的服务器 Tick 缓冲线性插值，避免 15Hz 快照到达节奏直接传到画面。
  var netRenderTick = 0, netServerTick = 0;
  function applySnapshot(run, snap) {
    var i, s, e;
    var byUid = {};
    freeIdx.length = 0;
    for (i = 0; i < POOL; i++) {
      e = enemies[i]; e.netSeen = false;
      if (e.alive && e.uid) byUid[e.uid] = e;
      else freeIdx.push(i);
    }
    for (i = 0; i < snap.e.length; i++) {
      s = snap.e[i];
      e = byUid[s.u];
      var fresh = !e;
      if (!e) {
        if (!freeIdx.length) break;
        var idx = freeIdx.pop();
        e = enemies[idx]; e.poolIdx = idx;
      }
      var def = CFG.ENEMIES[s.i] || CFG.BOSSES[s.i];
      if (!def) continue;
      e.alive = true; e.uid = s.u; e.id = s.i; e.def = def;
      if (fresh) { e.x = s.x; e.y = s.y; e.netSamples = []; }
      e.netX = s.x; e.netY = s.y; e.netVx = s.vx || 0; e.netVy = s.vy || 0;
      if (!e.netSamples) e.netSamples = [];
      var sampleTick = snap.tk || 0;
      var lastSample = e.netSamples.length ? e.netSamples[e.netSamples.length - 1] : null;
      if (!lastSample || sampleTick > lastSample.t) {
        e.netSamples.push({ t: sampleTick, x: s.x, y: s.y });
        if (e.netSamples.length > 6) e.netSamples.shift();
      }
      e.vx = e.netVx; e.vy = e.netVy; e.netSeen = true;
      e.hp = s.h; e.maxHp = s.m;
      e.r = def.r; e.dmg = def.dmg; e.spd = def.spd;
      e.boss = !!CFG.BOSSES[s.i]; e.bossType = e.boss ? s.i : '';
      e.elite = !!s.el; e.face = s.f || 1;
      e.aiPhase = s.ap || 0; e.chargePhase = s.cp || 0; e.eliteSkill = s.es || '';
      e.phase2 = !!s.ph; e.eyeRole = s.er || ''; e.eyeGroup = e.phase2 && e.bossType === 'boss_abysseye' ? 1 : 0;
      e.flash = 0; e.alpha = 1; e.animo = (s.u % 10);
      e.netAnimState = s.ac || 'idle';
      e.netAnimEpoch = run.frame - Math.max(0, (snap.tk || 0) - (s.ae || snap.tk || 0));
      e.bossAction = e.boss ? (s.ac || 'idle') : '';
      e.bossActionTick = e.netAnimEpoch;
      e.bossActionPhase = e.boss ? (s.ap || 0) : 0;
      e.dying = e.boss && s.h <= 0;
      e.guard = s.g || 0; e.burrowT = s.b || 0; e.burrowMax = def.burrow || 0;
      e.buffed = !!s.bf; e.buffSpd = 1; e.buffDmg = 1;
      e.slow = 0; e.slowT = 0; e.stun = 0; e.frozen = 0; e.kx = 0; e.ky = 0;
    }
    for (i = 0; i < POOL; i++) {
      e = enemies[i];
      if (e.alive && !e.netSeen) { e.alive = false; freeIdx.push(i); }
    }
    // 客户端视觉索敌也要能用:为快照敌人重建空间哈希
    E.gridClear();
    for (i = 0; i < POOL; i++) if (enemies[i].alive) E.gridInsert(enemies[i]);
    // 敌方弹幕
    for (i = 0; i < shots.length; i++) shots[i].alive = false;
    for (i = 0; i < snap.s.length && i < shots.length; i++) {
      s = snap.s[i];
      shots[i].alive = true;
      shots[i].x = s.x; shots[i].y = s.y; shots[i].vx = s.vx; shots[i].vy = s.vy;
      shots[i].webType = !!s.w; shots[i].col = s.c || null; shots[i].size = s.z || 16;
      shots[i].sprite = s.sp || shots[i].sprite || '';
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
    for (i = 0; i < gems.length; i++) gems[i].alive = false;
    freeGem.length = 0;
    for (i = 0; i < gems.length; i++) freeGem.push(i);
    for (i = 0; i < snap.g.length && freeGem.length; i++) {
      s = snap.g[i];
      var g = gems[freeGem.pop()];
      g.alive = true; g.uid = s.u || 0; g.x = s.x; g.y = s.y; g.v = s.v; g.pull = false; g.t = 0;
    }
    for (i = 0; i < items.length; i++) items[i].alive = false;
    for (i = 0; i < snap.it.length && i < items.length; i++) {
      s = snap.it[i];
      items[i].alive = true; items[i].uid = s.u || 0; items[i].type = s.k;
      items[i].x = s.x; items[i].y = s.y; items[i].t = 0; items[i].pull = false;
      items[i].ttl = (s.k === 'chest') ? -1 : ITEM_TTL;   // 与 spawnItem 同规则
    }
    run.t = snap.t;
    netServerTick = Math.max(netServerTick, snap.tk || 0);
    if (!netRenderTick) netRenderTick = Math.max(0, netServerTick - 6);
    if (snap.bh !== undefined) run.bossHpPct = snap.bh;
  }

  function updateRemote(dt) {
    netRenderTick = Math.min(netServerTick - 2, netRenderTick + dt * 60);
    for (var i = 0; i < POOL; i++) {
      var e = enemies[i];
      if (!e.alive || e.netX === undefined) continue;
      var samples = e.netSamples || [];
      if (samples.length < 2) {
        var k = Math.min(1, dt * 12);
        e.x += (e.netX - e.x) * k; e.y += (e.netY - e.y) * k;
        continue;
      }
      while (samples.length > 2 && samples[1].t <= netRenderTick) samples.shift();
      var a = samples[0], b = samples[1] || a;
      var span = Math.max(1, b.t - a.t);
      var q = E.clamp((netRenderTick - a.t) / span, 0, 1);
      e.x = E.lerp(a.x, b.x, q); e.y = E.lerp(a.y, b.y, q);
    }
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
        var mateDownDir = m.dir || (m.face < 0 ? 'left' : 'right');
        var mateDownSprite = cd.sprite + '_death_' + mateDownDir;
        var mateDownFrames = getFrames(mateDownSprite, false);
        drawActorSprite(ctx, mateDownSprite, mateDownFrames.length - 1, m.x, m.y + 8, 1, false, 0.55, '#ff6688', false);
        if (m.reviveT > 0) {
          var pr = E.clamp(m.reviveT / CFG.COOP.reviveTime, 0, 1);
          ctx.strokeStyle = '#7ce87c'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(m.x, m.y - 18, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
          ctx.stroke();
        }
      } else {
        var mateDir = m.dir || (m.face < 0 ? 'left' : 'right');
        var mateSprite = cd.sprite + '_idle_' + mateDir;
        var mateF = 0;   // 静止:固定帧 0(修复队友空闲不停动画)
        var mateAge = Math.max(0, (run.frame - (m.actionEpoch || 0)) / 60);
        if (m.action === 'attack' || m.attacking) {
          mateSprite = cd.sprite + '_attack_' + mateDir;
          mateF = Math.floor(mateAge * animFps(mateSprite, 13));
        } else if (m.action === 'walk' || m.moving) {
          mateSprite = cd.sprite + '_walk_' + mateDir;
          mateF = Math.floor(mateAge * animFps(mateSprite, 10));
        }
        var mateWeapons = m.weapons || [], nativeEvo = null;
        for (var mw = 0; mw < mateWeapons.length; mw++) {
          var entry = mateWeapons[mw];
          var wid = Array.isArray(entry) ? entry[0] : entry.id;
          var evolved = Array.isArray(entry) ? !!entry[2] : !!entry.evolved;
          if (wid === cd.weapon && evolved) { nativeEvo = entry; break; }
        }
        if (nativeEvo) {
          var mateAction = (m.action === 'attack' || m.attacking) ? 'attack'
            : ((m.action === 'walk' || m.moving) ? 'walk' : 'idle');
          var avatarName = 'avatar_' + cd.id + '_' + mateAction + '_' + mateDir;
          var avatarFrames = getFrames(avatarName, false);
          var avatarFrame = avatarFrames[Math.floor(mateAge * animFps(avatarName, mateAction === 'attack' ? 13 : 10)) % avatarFrames.length];
          var avatarKills = Array.isArray(nativeEvo) ? (nativeEvo[3] || 0) : (nativeEvo.phantomKills || 0);
          var avatarGrow = 1 + E.clamp(avatarKills / 300, 0, 1) * 1.5;
          var avatarSize = Math.round(64 * avatarGrow);
          ctx.globalAlpha = 0.42 + E.clamp(avatarKills / 300, 0, 1) * 0.16;
          ctx.drawImage(avatarFrame, m.x - avatarSize / 2, m.y + 8 - Math.round(54 * avatarGrow),
            avatarSize, avatarSize);
          ctx.globalAlpha = 1;
        }
        drawActorSprite(ctx, mateSprite, mateF, m.x, m.y + 8, 1, false, 1, null, false);
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

  function reset() { initPools(); netRenderTick = 0; netServerTick = 0; }

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
    spawnGem: spawnGem, spawnItem: spawnItem, collectItemByUid: collectItemByUid, addXp: addXp, bombBlast: bombBlast,
    director: director, draw: draw, drawLobMarkers: drawLobMarkers, reset: reset,
    clearEnemies: clearEnemies, cleanseWebs: cleanseWebs, clearSlow: clearSlow, tryExitGate: tryExitGate,
    pool: enemies, countAlive: countAlive, drawSprite: drawSprite,
    getGems: function () { return gems; },
    getItems: function () { return items; },
    getShots: function () { return shots; },
    getLobs: function () { return lobs; },
    // 联机:客户端用房主快照覆盖本地世界
    applySnapshot: applySnapshot, updateRemote: updateRemote,
    drawMates: drawMates,
    // 倒地标记的唯一入口:同时置 player.downed 与条目上的 downed,
    // 并做全员倒地判定。main.js 代跑队友时也要用它,避免各写一份走偏。
    markTeamDowned: markTeamDowned
  };
})();
