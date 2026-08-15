// fx.js — 模块C:粒子/伤害数字/震屏/闪光特效系统(window.FX;全对象池,update/draw 零分配)
(function () {
  'use strict';

  // ---------- 常量 ----------
  var TAU = Math.PI * 2;
  var GW = (window.CFG && window.CFG.GAME && window.CFG.GAME.W) || 960;
  var GH = (window.CFG && window.CFG.GAME && window.CFG.GAME.H) || 540;

  var P_MAX = 1500;   // 粒子池上限(SPEC)
  var T_MAX = 80;     // 伤害数字池上限(SPEC)
  var R_MAX = 48;     // 圆环池
  var L_MAX = 24;     // 闪电池
  var F_MAX = 6;      // 全屏闪光池
  var L_SEG = 16;     // 闪电段数(17 个点)

  // 粒子形状
  var SH_RECT = 0;    // 像素方块
  var SH_CROSS = 1;   // 十字/星光
  var SH_BEAM = 2;    // 竖直光柱(str = 定高)
  var SH_SPRITE = 3;  // 图集多帧特效(str = SpriteGen 名字)

  var FONT_N = 'bold 10px "Courier New", monospace';
  var FONT_C = 'bold 15px "Courier New", monospace';
  var FONT_H = 'bold 11px "Courier New", monospace';
  var FONTS = [FONT_N, FONT_C, FONT_H];

  var FIRE_COLS = ['#fff3b0', '#ffd24a', '#ff9531', '#ff5722'];
  var GOLD_COLS = ['#fff6c8', '#ffd24a', '#ffb020'];

  var _fxFrames = {};
  function cachedFrames(name) {
    var c = _fxFrames[name];
    if (!c) { c = SpriteGen.frames(name); _fxFrames[name] = c; }
    return c;
  }

  // ---------- 种子 RNG(mulberry32) ----------
  var _seed = 0x9e3779b9;
  function rand() {
    _seed = (_seed + 0x6d2b79f5) | 0;
    var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------- 对象池(启动时一次性分配) ----------
  var P = new Array(P_MAX);   // 粒子
  var pCur = 0;
  for (var i0 = 0; i0 < P_MAX; i0++) {
    P[i0] = { x: 0, y: 0, vx: 0, vy: 0, grav: 0, damp: 0, life: 0, inv: 0,
      s0: 0, s1: 0, a0: 0, a1: 0, color: '#fff', glow: false, shape: 0, str: 0, rot: 0 };
  }

  var T = new Array(T_MAX);   // 伤害数字
  var tCur = 0;
  for (var i1 = 0; i1 < T_MAX; i1++) {
    T[i1] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, str: '', color: '#fff', font: 0, crit: false };
  }

  var R = new Array(R_MAX);   // 扩散圆环
  var rCur = 0;
  for (var i2 = 0; i2 < R_MAX; i2++) {
    R[i2] = { x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 0, w: 3, color: '#fff' };
  }

  var L = new Array(L_MAX);   // 闪电
  var lCur = 0;
  for (var i3 = 0; i3 < L_MAX; i3++) {
    L[i3] = { pts: new Float32Array((L_SEG + 1) * 2), n: 0, life: 0, max: 0.15, color: '#8fd8ff', width: 3 };
  }

  var F = new Array(F_MAX);   // 全屏闪光
  var fCur = 0;
  for (var i4 = 0; i4 < F_MAX; i4++) {
    F[i4] = { color: '#fff', a0: 0, dur: 0, t: 1 };
  }

  // ---------- 震屏状态 ----------
  var shakePow = 0, shakeDur = 0, shakeT = 0, shakeAmpNow = 0;
  var time = 0;
  var _off = { x: 0, y: 0 };  // getOffset 复用对象,零分配

  // ---------- 开关 ----------
  var cfg = { shake: true, dmgText: true };

  // 暗角渐变缓存(每个 ctx 只建一次)
  var vg = null, vgFor = null;

  // ---------- 内部生成器 ----------
  function spawnP(x, y, vx, vy, life, s0, s1, a0, a1, color, glow, grav, damp, shape, str) {
    var p = P[pCur];
    pCur++; if (pCur >= P_MAX) { pCur = 0; }  // 环形游标:满了自动复用最旧
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.inv = 1 / life;
    p.s0 = s0; p.s1 = s1;
    p.a0 = a0 > 1 ? 1 : a0; p.a1 = a1 < 0 ? 0 : a1;
    p.color = color; p.glow = glow;
    p.grav = grav; p.damp = damp;
    p.shape = shape; p.str = str;
    return p;
  }

  function spawnVfx(x, y, name, life, size, glow, alpha, angle) {
    var p = spawnP(x, y, 0, 0, life, size, size,
      typeof alpha === 'number' ? alpha : 1, 0, '#fff', !!glow,
      0, 0, SH_SPRITE, name);
    p.rot = angle || 0;
    return p;
  }

  function spawnRing(x, y, r, color, life, w) {
    var rg = R[rCur];
    rCur++; if (rCur >= R_MAX) { rCur = 0; }
    rg.x = x; rg.y = y;
    rg.r0 = r * 0.15; rg.r1 = r;
    rg.life = life; rg.max = life;
    rg.w = w; rg.color = color;
  }

  function genBolt(b, x1, y1, x2, y2) {
    var pts = b.pts;
    pts[0] = x1; pts[1] = y1;
    pts[L_SEG * 2] = x2; pts[L_SEG * 2 + 1] = y2;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;          // 垂直方向单位向量
    var amp = len * 0.18;
    for (var step = L_SEG; step > 1; step >>= 1) {   // 递推式中点位移
      var half = step >> 1;
      for (var i = 0; i < L_SEG; i += step) {
        var a = i * 2, c = (i + step) * 2, m = (i + half) * 2;
        var off = (rand() - 0.5) * 2 * amp;
        pts[m] = (pts[a] + pts[c]) * 0.5 + nx * off;
        pts[m + 1] = (pts[a + 1] + pts[c + 1]) * 0.5 + ny * off;
      }
      amp *= 0.5;
    }
    b.n = L_SEG + 1;
  }

  // ---------- 公共接口 ----------
  var FX = {};
  // Public atlas-driven one-shot VFX.  Gameplay systems emit a semantic
  // effect once; the pooled renderer advances all authored frames exactly
  // once and never loops back to a spawn/explosion frame.
  FX.sprite = function (x, y, name, life, size, glow, alpha, angle) {
    return spawnVfx(x, y, name, life, size, glow, alpha, angle);
  };

  // ---------- 环境氛围粒子(浮游尘埃/萤火) ----------
  // 由游戏循环按地图配色每帧少量调用;粒子便宜,但给画面增加深度感。
  var ambAcc = 0;
  FX.ambient = function (x, y, w, h, opts) {
    if (!cfg || cfg.ambient === false) return;
    opts = opts || {};
    var rate = opts.rate || 60;      // 每秒生成数
    var life = opts.life || 3.5;
    ambAcc += (rate * (opts.dt || 0.016));
    while (ambAcc >= 1) {
      ambAcc -= 1;
      var px = x + rand() * w;
      var py = y + rand() * h;
      spawnP(px, py,
        (rand() - 0.5) * 12, -(6 + rand() * 16),
        life * (0.6 + rand() * 0.7),
        1.5 + rand() * 1.5, 0.2,
        0.25 + rand() * 0.3, 0,
        opts.color || '#ffe9a3', !!opts.glow, 0, 0.8, SH_RECT, 0);
    }
  };

  // 击杀灵魂飘升:几缕白色魂光上升消散
  FX.soul = function (x, y, color) {
    var c = color || '#e8e4ff';
    spawnVfx(x, y - 12, 'vfx_spirit', 0.55, 30, true);
    for (var i = 0; i < 3; i++) {
      var ax = x + (rand() - 0.5) * 14;
      spawnP(ax, y - 2, (rand() - 0.5) * 10, -(26 + rand() * 26),
        0.9 + rand() * 0.6, 2.2 + rand() * 1.5, 0.4,
        0.55, 0, c, true, -8, 0.7, SH_RECT, 0);
    }
  };

  // 脚步尘土:移动时从脚下扬起小土粒
  FX.step = function (x, y, color) {
    // 传入的是脚底世界坐标。烟雾保持贴地，避免大贴图中心落到角色躯干。
    spawnVfx(x, y + 1, 'vfx_smoke', 0.22, 10, false);
    for (var i = 0; i < 1; i++) {
      spawnP(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 2,
        (rand() - 0.5) * 26, -(14 + rand() * 20),
        0.35 + rand() * 0.25, 1.2 + rand() * 1.2, 0.2,
        0.5, 0, color || '#b9b0c8', false, 60, 1.4, SH_RECT, 0);
    }
  };

  FX.reset = function () {
    for (var i = 0; i < P_MAX; i++) { P[i].life = 0; }
    for (var j = 0; j < T_MAX; j++) { T[j].life = 0; }
    for (var k = 0; k < R_MAX; k++) { R[k].life = 0; }
    for (var m = 0; m < L_MAX; m++) { L[m].life = 0; }
    for (var n = 0; n < F_MAX; n++) { F[n].t = F[n].dur; }
    pCur = 0; tCur = 0; rCur = 0; lCur = 0; fCur = 0;
    shakePow = 0; shakeT = 0; shakeDur = 0; shakeAmpNow = 0;
    _off.x = 0; _off.y = 0;
  };

  FX.setCfg = function (o) {
    if (!o || typeof o !== 'object') { return; }
    if (o.shake !== undefined) { cfg.shake = !!o.shake; }
    if (o.dmgText !== undefined) { cfg.dmgText = !!o.dmgText; }
    if (o.ambient !== undefined) { cfg.ambient = !!o.ambient; }
  };

  FX.shake = function (power, dur) {
    power = +power; dur = +dur;
    if (!(power > 0)) { return; }
    if (!(dur > 0)) { dur = 0.3; }
    if (power > 60) { power = 60; }
    if (dur > 3) { dur = 3; }
    var cur = 0;
    if (shakePow > 0 && shakeDur > 0) {
      cur = shakePow * Math.exp(-4.2 * shakeT / shakeDur);   // 现有震动的当前强度
    }
    if (power >= cur) {                                      // 叠加取最大
      shakePow = power; shakeDur = dur; shakeT = 0;
    }
  };

  FX.getOffset = function () {
    return _off;   // 复用对象,零分配
  };

  FX.update = function (dt) {
    dt = +dt;
    if (!(dt > 0)) { return; }
    if (dt > 0.1) { dt = 0.1; }
    time += dt;

    // ---- 震屏:指数衰减 + sin 混频平滑噪声 ----
    shakeAmpNow = 0;
    if (shakePow > 0) {
      shakeT += dt;
      if (shakeT >= shakeDur) {
        shakePow = 0; _off.x = 0; _off.y = 0;
      } else if (cfg.shake) {
        var amp = shakePow * Math.exp(-4.2 * shakeT / shakeDur);
        shakeAmpNow = amp;
        _off.x = amp * (Math.sin(time * 47.7) * 0.6 + Math.sin(time * 92.3 + 1.7) * 0.4);
        _off.y = amp * (Math.sin(time * 39.1 + 0.8) * 0.6 + Math.sin(time * 84.7 + 2.4) * 0.4);
      } else {
        _off.x = 0; _off.y = 0;
      }
    } else {
      _off.x = 0; _off.y = 0;
    }

    // ---- 粒子 ----
    for (var i = 0; i < P_MAX; i++) {
      var p = P[i];
      if (p.life <= 0) { continue; }
      p.life -= dt;
      if (p.life <= 0) { p.life = 0; continue; }
      if (p.damp > 0) {
        var d = 1 / (1 + p.damp * dt);
        p.vx *= d; p.vy *= d;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // ---- 伤害数字:上飘减速 + 水平漂移衰减 ----
    for (var j = 0; j < T_MAX; j++) {
      var t = T[j];
      if (t.life <= 0) { continue; }
      t.life -= dt;
      if (t.life <= 0) { t.life = 0; continue; }
      var td = 1 / (1 + 2.4 * dt);
      t.vx *= td; t.vy *= td;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
    }

    // ---- 圆环 ----
    for (var k = 0; k < R_MAX; k++) {
      var rg = R[k];
      if (rg.life <= 0) { continue; }
      rg.life -= dt;
      if (rg.life <= 0) { rg.life = 0; }
    }

    // ---- 闪电 ----
    for (var m = 0; m < L_MAX; m++) {
      var b = L[m];
      if (b.life <= 0) { continue; }
      b.life -= dt;
      if (b.life <= 0) { b.life = 0; }
    }

    // ---- 闪光 ----
    for (var n = 0; n < F_MAX; n++) {
      var f = F[n];
      if (f.t < f.dur) { f.t += dt; }
    }
  };

  // ---------- 绘制:按 glow 分两批,减少状态切换 ----------
  function drawParticle(ctx, p) {
    var t01 = 1 - p.life * p.inv;
    var s = p.s0 + (p.s1 - p.s0) * t01;
    var a = p.a0 + (p.a1 - p.a0) * t01;
    if (a <= 0.004 || s <= 0.15) { return; }
    if (a > 1) { a = 1; }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.shape === SH_RECT) {
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    } else if (p.shape === SH_CROSS) {
      var th = s * 0.34; if (th < 1) { th = 1; }
      ctx.fillRect(p.x - s * 0.5, p.y - th * 0.5, s, th);
      ctx.fillRect(p.x - th * 0.5, p.y - s * 0.5, th, s);
    } else if (p.shape === SH_BEAM) {
      ctx.fillRect(p.x - s * 0.5, p.y - p.str, s, p.str);   // SH_BEAM:定高竖梁,底端锚定
    } else {
      var frames = cachedFrames(p.str);
      var frame = frames[Math.min(frames.length - 1, Math.floor(t01 * frames.length))];
      // Preserve authored aspect ratio: non-square strips such as the jade
      // spirit dragon must never be squashed into a square particle quad.
      var drawH = frame.height === frame.width ? s : s * frame.height / frame.width;
      if (p.rot) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(frame, -s * 0.5, -drawH * 0.5, s, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(frame, p.x - s * 0.5, p.y - drawH * 0.5, s, drawH);
      }
    }
  }

  FX.draw = function (ctx) {
    if (!ctx) { return; }
    var i, p;

    // 批1:普通粒子(source-over)
    for (i = 0; i < P_MAX; i++) {
      p = P[i];
      if (p.life > 0 && !p.glow) { drawParticle(ctx, p); }
    }

    // 批2:发光体(lighter,状态切换一次)
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < P_MAX; i++) {
      p = P[i];
      if (p.life > 0 && p.glow) { drawParticle(ctx, p); }
    }

    // 圆环(加色描边)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (i = 0; i < R_MAX; i++) {
      var rg = R[i];
      if (rg.life <= 0) { continue; }
      var rt = 1 - rg.life / rg.max;
      var e = 1 - (1 - rt) * (1 - rt) * (1 - rt);            // easeOutCubic 扩散
      var rr = rg.r0 + (rg.r1 - rg.r0) * e;
      ctx.globalAlpha = 1 - rt;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = rg.w * (1 - rt * 0.7);
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rr, 0, TAU);
      ctx.stroke();
    }

    // 闪电:外晕 + 亮心两层
    for (i = 0; i < L_MAX; i++) {
      var b = L[i];
      if (b.life <= 0) { continue; }
      var la = b.life / b.max;
      var pts = b.pts, n2 = b.n * 2, j;
      ctx.globalAlpha = la * 0.4;                            // 外晕
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * 1.6;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (j = 2; j < n2; j += 2) { ctx.lineTo(pts[j], pts[j + 1]); }
      ctx.stroke();
      ctx.globalAlpha = la;                                  // 亮心
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, b.width * 0.6);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (j = 2; j < n2; j += 2) { ctx.lineTo(pts[j], pts[j + 1]); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';            // 状态还原

    // 伤害数字(最上层)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < T_MAX; i++) {
      var t = T[i];
      if (t.life <= 0) { continue; }
      var fade = t.max * 0.3;
      var ta = t.life < fade ? t.life / fade : 1;
      ctx.globalAlpha = ta;
      ctx.font = FONTS[t.font];
      var tx = t.x, ty = t.y, scaled = false;
      if (t.crit) {
        var age = t.max - t.life;
        var kk = age * 14;
        if (kk < Math.PI) {                                  // 暴击缩放弹跳
          var sc = 1 + 0.5 * Math.sin(kk);
          ctx.save();
          ctx.translate(tx, ty);
          ctx.scale(sc, sc);
          tx = 0; ty = 0; scaled = true;
        }
      }
      ctx.fillStyle = '#000000';                             // 1px 黑描边(4 向偏移)
      ctx.fillText(t.str, tx - 1, ty);
      ctx.fillText(t.str, tx + 1, ty);
      ctx.fillText(t.str, tx, ty - 1);
      ctx.fillText(t.str, tx, ty + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, tx, ty);
      if (scaled) { ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  };

  FX.drawUI = function (ctx) {
    if (!ctx) { return; }
    // 全屏闪光:快速平方淡出
    for (var i = 0; i < F_MAX; i++) {
      var f = F[i];
      if (f.t >= f.dur || f.dur <= 0) { continue; }
      var k = 1 - f.t / f.dur;
      var a = f.a0 * k * k;
      if (a <= 0.003) { continue; }
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, GW, GH);
    }
    // 重震时的暗角脉冲
    if (cfg.shake && shakeAmpNow > 1.5) {
      if (vgFor !== ctx) {                                   // 渐变按 ctx 缓存,仅建一次
        vgFor = ctx;
        vg = ctx.createRadialGradient(GW * 0.5, GH * 0.5, GH * 0.42, GW * 0.5, GH * 0.5, GH * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,1)');
      }
      var va = shakeAmpNow * 0.022;
      if (va > 0.26) { va = 0.26; }
      ctx.globalAlpha = va;
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, GW, GH);
    }
    ctx.globalAlpha = 1;
  };

  // ---------- 生成器 ----------
  FX.dmgText = function (x, y, amount, opts) {
    if (!cfg.dmgText) { return; }                            // 关闭时静默忽略
    if (!isFinite(x) || !isFinite(y)) { return; }
    var n = +amount;
    if (!isFinite(n)) { n = 0; }
    var crit = !!(opts && opts.crit);
    var heal = !!(opts && opts.heal);
    var color = (opts && typeof opts.color === 'string') ? opts.color
      : (heal ? '#6ef08a' : (crit ? '#ffd24a' : '#ffffff'));
    var t = T[tCur];
    tCur++; if (tCur >= T_MAX) { tCur = 0; }                 // 满了复用最旧
    t.x = x; t.y = y;
    t.vx = (rand() - 0.5) * 30;                              // 轻微随机水平漂移
    t.vy = crit ? -64 : -48;                                 // 上飘
    t.max = crit ? 0.9 : 0.7;
    t.life = t.max;
    t.str = (heal ? '+' : '') + Math.round(n);
    t.color = color;
    t.font = crit ? 1 : (heal ? 2 : 0);                      // 普通10px/暴击15px/治疗11px
    t.crit = crit;
  };

  FX.burst = function (x, y, opts) {
    if (!isFinite(x) || !isFinite(y)) { return; }
    var color = (opts && typeof opts.color === 'string') ? opts.color : '#ffffff';
    var n = (opts && opts.n > 0) ? (opts.n | 0) : 8;
    if (n > 300) { n = 300; }
    var speed = (opts && isFinite(+opts.speed)) ? +opts.speed : 90;
    var life = (opts && opts.life > 0) ? +opts.life : 0.5;
    if (life > 6) { life = 6; }
    var size = (opts && opts.size > 0) ? +opts.size : 3;
    if (size > 40) { size = 40; }
    var grav = (opts && isFinite(+opts.gravity)) ? +opts.gravity : 0;
    var glow = !!(opts && opts.glow);
    for (var i = 0; i < n; i++) {
      var a = rand() * TAU;
      var sp = speed * (0.35 + rand() * 0.75);
      spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        life * (0.6 + rand() * 0.5), size * (0.6 + rand() * 0.7), size * 0.15,
        1, 0, color, glow, grav, 1.6, SH_RECT, 0);
    }
  };

  FX.blood = function (x, y, color) {
    if (!isFinite(x) || !isFinite(y)) { return; }
    var c = (typeof color === 'string') ? color : '#9c1a2f';
    for (var i = 0; i < 7; i++) {
      var a = rand() * TAU;
      var sp = 40 + rand() * 110;
      spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40,
        0.3 + rand() * 0.3, 1.5 + rand() * 2.5, 0.6,
        1, 0.15, c, false, 300, 2.2, SH_RECT, 0);
    }
  };

  FX.explosion = function (x, y, r) {
    if (!isFinite(x) || !isFinite(y)) { return; }
    r = +r;
    if (!(r > 0)) { r = 40; }
    if (r > 400) { r = 400; }
    FX.shake(Math.min(11, 3 + r * 0.09), 0.32);
    FX.flash('#ffd9a0', Math.min(0.16, 0.05 + r * 0.0016), 0.16);
    spawnVfx(x, y, 'vfx_explosion', 0.42, Math.max(34, r * 1.65), true);
    spawnRing(x, y, r * 1.5, '#ffc26e', 0.32, 3);            // 冲击环
    var core = spawnP(x, y, 0, 0, 0.14, r * 0.9, r * 0.2, 0.9, 0, '#fff3b0', true, 0, 0, SH_RECT, 0);
    core.a1 = 0;
    var n = (10 + r * 0.7) | 0;                              // 火粒子
    if (n > 56) { n = 56; }
    for (var i = 0; i < n; i++) {
      var a = rand() * TAU;
      var sp = r * (0.8 + rand() * 2.2);
      spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.25 + rand() * 0.4, 2 + rand() * 4, 0.5,
        1, 0, FIRE_COLS[(rand() * 4) | 0], true, -60, 3, SH_RECT, 0);
    }
    for (var j = 0; j < 6; j++) {                            // 烟
      var sa = rand() * TAU;
      var ss = r * (0.2 + rand() * 0.5);
      spawnP(x, y, Math.cos(sa) * ss, Math.sin(sa) * ss - 20,
        0.5 + rand() * 0.5, 3 + rand() * 3, 8 + rand() * 6,
        0.35, 0, '#3a3a44', false, -30, 2, SH_RECT, 0);
    }
  };

  FX.ring = function (x, y, opts) {
    if (!isFinite(x) || !isFinite(y)) { return; }
    var r = (opts && opts.r > 0) ? +opts.r : 40;
    if (r > 600) { r = 600; }
    var color = (opts && typeof opts.color === 'string') ? opts.color : '#ffffff';
    var life = (opts && opts.life > 0) ? +opts.life : 0.35;
    if (life > 3) { life = 3; }
    var w = (opts && opts.width > 0) ? +opts.width : 3;
    if (w > 20) { w = 20; }
    spawnRing(x, y, r, color, life, w);
  };

  FX.lightning = function (x1, y1, x2, y2, color, width) {
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) { return; }
    var b = L[lCur];
    lCur++; if (lCur >= L_MAX) { lCur = 0; }
    b.color = (typeof color === 'string') ? color : '#8fd8ff';
    b.width = (typeof width === 'number' && width > 0) ? width : 3;
    if (b.width > 12) b.width = 12;
    b.max = 0.15;
    b.life = 0.15;
    genBolt(b, x1, y1, x2, y2);
    spawnVfx(x2, y2, 'vfx_lightning', 0.24, 30, true);
    for (var i = 0; i < 2; i++) {                            // 落点电火花
      var a = rand() * TAU;
      var sp = 40 + rand() * 80;
      spawnP(x2, y2, Math.cos(a) * sp, Math.sin(a) * sp,
        0.18 + rand() * 0.12, 2 + rand() * 2, 0.4,
        1, 0, b.color, true, 0, 2, SH_CROSS, 0);
    }
  };

  FX.heal = function (x, y) {
    spawnVfx(x, y - 8, 'vfx_heal', 0.5, 42, true);
    if (!isFinite(x) || !isFinite(y)) { return; }
    for (var i = 0; i < 6; i++) {                            // 绿色十字上升
      spawnP(x + (rand() - 0.5) * 22, y + (rand() - 0.5) * 10,
        (rand() - 0.5) * 16, -(34 + rand() * 40),
        0.6 + rand() * 0.4, 3 + rand() * 3, 1,
        1, 0, (i & 1) ? '#a5ffbf' : '#58e07a', true, -20, 1.5, SH_CROSS, 0);
    }
  };

  FX.levelBeam = function (x, y) {
    spawnVfx(x, y - 12, 'vfx_circle', 0.58, 64, true);
    if (!isFinite(x) || !isFinite(y)) { return; }
    spawnP(x, y + 6, 0, -30, 0.55, 14, 0, 0.85, 0, '#ffe98a', true, 0, 0, SH_BEAM, 96);
    spawnP(x, y + 6, 0, -18, 0.7, 6, 0, 1, 0, '#fff6c8', true, 0, 0, SH_BEAM, 120);
    for (var i = 0; i < 22; i++) {                           // 上升金色光尘
      spawnP(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 8,
        (rand() - 0.5) * 20, -(90 + rand() * 170),
        0.45 + rand() * 0.45, 2 + rand() * 2.5, 0.5,
        1, 0, GOLD_COLS[(rand() * 3) | 0], true, -40, 1.2, SH_RECT, 0);
    }
    spawnRing(x, y, 46, '#ffd24a', 0.4, 3);
  };

  FX.pickup = function (x, y, color) {
    if (!isFinite(x) || !isFinite(y)) { return; }
    var c = (typeof color === 'string') ? color : '#ffe98a';
    spawnVfx(x, y, 'vfx_spark', 0.32, 24, true);
    for (var i = 0; i < 4; i++) {                            // 小星星
      var a = rand() * TAU;
      var sp = 26 + rand() * 40;
      spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 30,
        0.3 + rand() * 0.15, 2.5 + rand() * 2, 0.4,
        1, 0, c, true, 0, 2.5, SH_CROSS, 0);
    }
  };

  FX.flash = function (color, alpha, dur) {
    var f = F[fCur];
    fCur++; if (fCur >= F_MAX) { fCur = 0; }
    f.color = (typeof color === 'string') ? color : '#ffffff';
    alpha = +alpha;
    f.a0 = (alpha > 0) ? (alpha > 1 ? 1 : alpha) : 0.3;
    dur = +dur;
    f.dur = (dur > 0) ? (dur > 2 ? 2 : dur) : 0.15;
    f.t = 0;
  };

  FX.trail = function (x, y, color, size) {
    if (!isFinite(x) || !isFinite(y)) { return; }            // 高频路径:单粒子直写池
    var p = P[pCur];
    pCur++; if (pCur >= P_MAX) { pCur = 0; }
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    p.life = 0.22; p.inv = 4.5454545454545455;
    p.s0 = (size > 0) ? +size : 3; p.s1 = 0;
    p.a0 = 0.5; p.a1 = 0;
    p.color = (typeof color === 'string') ? color : '#ffffff';
    p.glow = true; p.grav = 0; p.damp = 0;
    p.shape = SH_RECT; p.str = 0;
  };

  window.FX = FX;

  // ---------- 接口覆盖率自检(SPEC 模块C 全部名字) ----------
  var REQUIRED = ['reset', 'update', 'draw', 'drawUI', 'shake', 'getOffset', 'setCfg',
    'dmgText', 'burst', 'blood', 'explosion', 'ring', 'lightning', 'heal',
    'levelBeam', 'pickup', 'flash', 'trail'];
  var missing = 0;
  for (var ri = 0; ri < REQUIRED.length; ri++) {
    if (typeof FX[REQUIRED[ri]] !== 'function') {
      missing++;
      console.warn('[FX] 缺失接口: ' + REQUIRED[ri]);
    }
  }
  console.assert(missing === 0,
    '[FX] 接口覆盖率 ' + (REQUIRED.length - missing) + '/' + REQUIRED.length);
})();
