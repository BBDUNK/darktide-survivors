// engine.js — 游戏循环 / 输入 / 相机 / 空间哈希 / 通用工具
window.Engine = (function () {
  'use strict';

  // ---------- 数学与工具 ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y) { // 确定性 2D 哈希 → [0,1)
    var h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function pick(rand, arr) { return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]; }

  // ---------- 输入 ----------
  var keys = {};
  var touch = { active: false, sx: 0, sy: 0, dx: 0, dy: 0, id: -1 };
  var inputVec = { x: 0, y: 0 };
  var lastDir = { x: 1, y: 0 };

  function initInput(canvas) {
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') { if (Engine.onPause) Engine.onPause(); }
      if (e.code === 'KeyM') { if (Engine.onToggleMap) Engine.onToggleMap(); }
      if (e.code === 'Space') e.preventDefault();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    // 滚轮:切换索敌方式
    window.addEventListener('wheel', function (e) {
      if (Engine.onScroll) Engine.onScroll(e.deltaY);
    }, { passive: true });
    window.addEventListener('blur', function () { keys = {}; if (Engine.onBlur) Engine.onBlur(); });
    // 触屏虚拟摇杆
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' && !touch.active) {
        // 落点在小地图上时交给点击切换处理,不启动摇杆
        if (Engine.isOverMinimap && Engine.isOverMinimap(e.clientX, e.clientY)) return;
        touch.active = true; touch.id = e.pointerId;
        touch.sx = e.clientX; touch.sy = e.clientY; touch.dx = 0; touch.dy = 0;
      }
    });
    window.addEventListener('pointermove', function (e) {
      if (touch.active && e.pointerId === touch.id) {
        touch.dx = e.clientX - touch.sx; touch.dy = e.clientY - touch.sy;
      }
    });
    function endTouch(e) { if (touch.active && e.pointerId === touch.id) { touch.active = false; touch.dx = 0; touch.dy = 0; } }
    window.addEventListener('pointerup', endTouch);
    window.addEventListener('pointercancel', endTouch);
  }

  function readInput() {
    var x = 0, y = 0;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (touch.active) {
      var len = Math.hypot(touch.dx, touch.dy);
      if (len > 12) { x = touch.dx / len; y = touch.dy / len; }
    }
    var l = Math.hypot(x, y);
    if (l > 0.001) { x /= l; y /= l; lastDir.x = x; lastDir.y = y; }
    inputVec.x = x; inputVec.y = y;
    return inputVec;
  }

  // ---------- 空间哈希(每帧重建,查询敌人) ----------
  var CELL = 72;
  var grid = new Map();
  function gridKey(cx, cy) { return cx * 100003 + cy; }
  function gridClear() { grid.clear(); }
  function gridInsert(e) {
    var k = gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    var arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(e);
  }
  // 回调遍历圆形范围内的实体;cb 返回 true 则提前终止
  function gridQuery(x, y, r, cb) {
    var x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    var y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    var r2 = r * r;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var arr = grid.get(gridKey(cx, cy));
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var e = arr[i];
          if (!e.alive) continue;
          var dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy <= r2) { if (cb(e)) return; }
        }
      }
    }
  }
  // 找范围内最近的存活实体(可传排除的 hitSet)
  function gridNearest(x, y, r, exclude) {
    var best = null, bd = r * r;
    var x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    var y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var arr = grid.get(gridKey(cx, cy));
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var e = arr[i];
          if (!e.alive) continue;
          if (exclude && exclude.has(e.uid)) continue;
          var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = e; }
        }
      }
    }
    return best;
  }

  // ---------- 相机 ----------
  var cam = { x: 0, y: 0 };

  // ---------- 主循环(固定步长 60Hz) ----------
  var running = false, lastT = 0, acc = 0;
  var STEP = 1 / 60;
  var updateFn = null, renderFn = null;
  var timeScale = 1;

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    acc += dt * timeScale;
    var steps = 0;
    while (acc >= STEP && steps < 5) {
      if (updateFn) updateFn(STEP);
      acc -= STEP; steps++;
    }
    if (steps === 5) acc = 0; // 追不上就丢弃,防螺旋死亡
    if (renderFn) renderFn();
  }

  function start(update, render) {
    updateFn = update; renderFn = render;
    if (!running) {
      running = true; lastT = performance.now(); acc = 0;
      requestAnimationFrame(frame);
    }
  }

  // ---------- 设备判定 ----------
  // 触屏优先:有触点且无精确指针(排除带触摸屏的笔记本被误判为手机)
  var isTouch = (function () {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    var pts = navigator.maxTouchPoints || 0;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return pts > 0 && !!coarse;
  })();

  // ---------- 画布缩放 ----------
  // UI 层与画布共用同一缩放系数,保证 HUD 与画面严格对齐;
  // 同时把安全区(刘海/圆角)让出来,避免边框裁掉 HUD。
  // 适配档位(CFG.GAME.UI_SCALE):
  //   contain(默认) 等比缩放到完整放进窗口,任一轴富余居中留黑边 —— 永不裁切 HUD。
  //   fill           拉伸填满整个窗口,超出部分裁掉(超宽屏可选,会裁到 HUD 角)。
  //   native         不缩放,1:1 逻辑像素(适合很小的窗口)。
  var viewScale = 1;
  var resizeRef = null;
  function computeFit(w, h) {
    var mode = typeof CFG.GAME.UI_SCALE !== 'undefined' ? CFG.GAME.UI_SCALE : 'contain';
    if (mode === 'fill') return Math.max(w / CFG.GAME.W, h / CFG.GAME.H);
    if (mode === 'native') return 1;
    return Math.min(w / CFG.GAME.W, h / CFG.GAME.H);
  }
  function fitCanvas(canvas) {
    var ui = document.getElementById('ui');
    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      var scale = computeFit(w, h);
      viewScale = scale;
      var cw = Math.round(CFG.GAME.W * scale), ch = Math.round(CFG.GAME.H * scale);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      if (ui) {
        ui.style.width = CFG.GAME.W + 'px';
        ui.style.height = CFG.GAME.H + 'px';
        ui.style.left = '50%';
        ui.style.top = '50%';
        ui.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
        ui.style.transformOrigin = 'center center';
      }
      document.body.classList.toggle('touch-device', isTouch);
      document.body.classList.toggle('portrait', h > w);
    }
    resizeRef = resize;
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
    resize();
  }
  function refit() { if (resizeRef) resizeRef(); }

  var uidCounter = 1;

  return {
    clamp: clamp, lerp: lerp, dist2: dist2, mulberry32: mulberry32, hash2: hash2,
    fmtTime: fmtTime, pick: pick,
    initInput: initInput, readInput: readInput, keys: function () { return keys; },
    lastDir: lastDir, touchState: touch,
    gridClear: gridClear, gridInsert: gridInsert, gridQuery: gridQuery, gridNearest: gridNearest,
    cam: cam, start: start, fitCanvas: fitCanvas, refit: refit,
    isTouch: function () { return isTouch; },
    viewScale: function () { return viewScale; },
    setTimeScale: function (s) { timeScale = s; },
    nextUid: function () { return uidCounter++; },
    onPause: null, onBlur: null, onToggleMap: null, onScroll: null, isOverMinimap: null
  };
})();
