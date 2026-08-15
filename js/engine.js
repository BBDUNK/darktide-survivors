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
  var pinch = { ids: [], points: {}, distance: 0 };
  var pointer = { active: false, x: 0, y: 0, worldX: 0, worldY: 0, type: 'mouse' };
  var inputVec = { x: 0, y: 0 };
  var lastDir = { x: 1, y: 0 };
  var dashRequest = null, lastTap = {};
  // Touch has no physical direction keys, so a quick second flick of the
  // virtual stick in the same direction is the mobile equivalent of a double
  // tap.  It is deliberately detected on release and never consumes a second
  // finger, preserving pinch zoom and HUD multitouch.
  var lastTouchFlick = { t: 0, x: 0, y: 0 };

  function initInput(canvas) {
    function trackPointer(e) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * CFG.GAME.W / Math.max(1, rect.width);
      pointer.y = (e.clientY - rect.top) * CFG.GAME.H / Math.max(1, rect.height);
      pointer.worldX = cam.x + pointer.x - CFG.GAME.W / 2;
      pointer.worldY = cam.y + pointer.y - CFG.GAME.H / 2;
      pointer.type = e.pointerType || 'mouse';
      pointer.active = true;
    }
    // 表单控件(训练场的下拉/输入框)拿到焦点时,键盘事件不应触达游戏 —— 否则
    // 在原生下拉里按方向键会让角色乱走,甚至 keyup 被下拉吞掉导致"自动按住 W"。
    function uiFormEvent(e) {
      var t = e && e.target;
      return !!(t && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
    }
    window.addEventListener('keydown', function (e) {
      if (uiFormEvent(e)) return;
      keys[e.code] = true;
      var dir = e.code === 'KeyW' || e.code === 'ArrowUp' ? { x: 0, y: -1 } :
        (e.code === 'KeyS' || e.code === 'ArrowDown' ? { x: 0, y: 1 } :
        (e.code === 'KeyA' || e.code === 'ArrowLeft' ? { x: -1, y: 0 } :
        (e.code === 'KeyD' || e.code === 'ArrowRight' ? { x: 1, y: 0 } : null)));
      if (dir && !e.repeat) {
        var now = performance.now();
        if (now - (lastTap[e.code] || 0) < 270) dashRequest = dir;
        lastTap[e.code] = now;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') { if (Engine.onPause) Engine.onPause(); }
      if (e.code === 'KeyM') { if (Engine.onToggleMap) Engine.onToggleMap(); }
      if (e.code === 'Space') e.preventDefault();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      if (uiFormEvent(e)) return;
      keys[e.code] = false;
    });
    // 滚轮:切换索敌方式。在训练场控制台上滚动只应滚动面板,不该触发游戏缩放。
    window.addEventListener('wheel', function (e) {
      if (e.target && e.target.closest && e.target.closest('.test-panel')) return;
      if (Engine.onScroll) Engine.onScroll(e.deltaY);
    }, { passive: true });
    window.addEventListener('blur', function () { keys = {}; if (Engine.onBlur) Engine.onBlur(); });
    // 触屏虚拟摇杆
    canvas.addEventListener('pointerdown', function (e) {
      trackPointer(e);
      if (e.pointerType === 'mouse' && e.button === 1) {
        e.preventDefault();
        if (Engine.onMiddleClick) Engine.onMiddleClick();
        return;
      }
      if (e.pointerType === 'touch') {
        pinch.points[e.pointerId] = { x: e.clientX, y: e.clientY };
        pinch.ids = Object.keys(pinch.points);
        if (pinch.ids.length === 2) {
          var pa = pinch.points[pinch.ids[0]], pb = pinch.points[pinch.ids[1]];
          pinch.distance = Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1;
        }
      }
      if (e.pointerType === 'touch' && !touch.active) {
        // 落点在小地图上时交给点击切换处理,不启动摇杆
        if (Engine.isOverMinimap && Engine.isOverMinimap(e.clientX, e.clientY)) return;
        touch.active = true; touch.id = e.pointerId;
        touch.sx = e.clientX; touch.sy = e.clientY; touch.dx = 0; touch.dy = 0;
      }
    });
    window.addEventListener('pointermove', function (e) {
      trackPointer(e);
      if (touch.active && e.pointerId === touch.id) {
        touch.dx = e.clientX - touch.sx; touch.dy = e.clientY - touch.sy;
      }
      if (e.pointerType === 'touch' && pinch.points[e.pointerId]) {
        pinch.points[e.pointerId] = { x: e.clientX, y: e.clientY };
        pinch.ids = Object.keys(pinch.points);
        if (pinch.ids.length === 2) {
          var p0 = pinch.points[pinch.ids[0]], p1 = pinch.points[pinch.ids[1]];
          var distance = Math.hypot(p0.x - p1.x, p0.y - p1.y) || 1;
          if (Engine.onPinch && pinch.distance) Engine.onPinch(distance / pinch.distance);
          pinch.distance = distance;
        }
      }
    });
    function endTouch(e) {
      if (touch.active && e.pointerId === touch.id) {
        var len = Math.hypot(touch.dx, touch.dy);
        if (len > 22 && e.pointerType === 'touch') {
          var fx = touch.dx / len, fy = touch.dy / len, now = performance.now();
          var sameDirection = fx * lastTouchFlick.x + fy * lastTouchFlick.y > 0.72;
          if (now - lastTouchFlick.t < 320 && sameDirection) dashRequest = { x: fx, y: fy };
          lastTouchFlick.t = now; lastTouchFlick.x = fx; lastTouchFlick.y = fy;
        }
        touch.active = false; touch.dx = 0; touch.dy = 0;
      }
      delete pinch.points[e.pointerId]; pinch.ids = Object.keys(pinch.points); pinch.distance = 0;
    }
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

  // ---------- 空间哈希(固定桶数组 + 代际复用,避免每帧分配) ----------
  var CELL = 72;
  var GRID_BUCKETS = 1024;
  var gridCells = new Array(GRID_BUCKETS);
  var gridState = new Int32Array(GRID_BUCKETS);
  var gridStamp = 1;
  var gridUsed = [];
  var gridRecycle = [];
  function gridKey(cx, cy) { return (cx * 100003 + cy) & (GRID_BUCKETS - 1); }
  function gridClear() {
    gridStamp++;
    if (gridStamp > 2000000000) {
      gridStamp = 1;
      for (var i = 0; i < GRID_BUCKETS; i++) gridState[i] = 0;
    }
    for (var i = 0; i < gridUsed.length; i++) gridRecycle.push(gridCells[gridUsed[i]]);
    gridUsed.length = 0;
  }
  function gridInsert(e) {
    var k = gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    if (gridState[k] !== gridStamp) {
      gridState[k] = gridStamp;
      gridUsed.push(k);
      var arr = gridRecycle.pop();
      if (arr) arr.length = 0; else arr = [];
      gridCells[k] = arr;
    }
    gridCells[k].push(e);
  }
  // 回调遍历圆形范围内的实体;cb 返回 true 则提前终止
  function gridQuery(x, y, r, cb) {
    var x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    var y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    var r2 = r * r;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var k = gridKey(cx, cy);
        var arr = gridState[k] === gridStamp ? gridCells[k] : null;
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
        var k = gridKey(cx, cy);
        var arr = gridState[k] === gridStamp ? gridCells[k] : null;
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

  // ---------- 世界地形与装饰 ----------
  // 绘制和移动判定共用同一组确定性函数；镜头移动或重新载入后地形不会漂移。
  // 沼泽/水域生成阈值:hash 值高于此才生成。调高 = 数量更少。
  // 与 main.js drawTerrain 的 wet 判定必须保持同一个数,否则视觉与减速判定会脱节。
  var SWAMP_THRESHOLD = 0.91;
  // 水坑精灵里"真正的水面"占外框的比例(其余是泥巴边)。只有踩进水面才减速。
  var SWAMP_WATER_RATIO = 0.58;

  function terrainSeed(map) {
    var id = map && map.id ? map.id : map;
    return id === 'graveyard' ? 0.8 : (id === 'wilds' ? 2.4 : 4.1);
  }
  function roadBend(v, seed) {
    return Math.sin(v * 0.0017 + seed) * 145 + Math.sin(v * 0.0041 + seed * 2) * 28;
  }
  function terrainEffect(map, x, y) {
    var id = map && map.id ? map.id : map;
    var seed = terrainSeed(map);
    var roadHalf = id === 'wilds' ? 36 : (id === 'graveyard' ? 30 : 25);
    if (Math.abs(y - roadBend(x, seed)) <= roadHalf ||
        Math.abs(x - roadBend(y, seed)) <= roadHalf * 0.64) {
      return { type: 'road', mul: 1.20 };
    }
    var region = 260;
    var rx0 = Math.floor(x / region), ry0 = Math.floor(y / region);
    for (var ry = ry0 - 1; ry <= ry0 + 1; ry++) {
      for (var rx = rx0 - 1; rx <= rx0 + 1; rx++) {
        var rh = hash2(rx * 61 + id.length * 13, ry * 67 - id.length * 7);
        if (rh <= SWAMP_THRESHOLD || id === 'wilds') continue;
        var wx = rx * region + 34 + hash2(rx * 73, ry * 79) * 190;
        var wy = ry * region + 28 + hash2(rx * 83, ry * 89) * 194;
        var dx = x - wx, dy = y - wy;
        if (id === 'graveyard') {
          // 墓园沼泽绘制用的是固定尺寸水坑精灵(见 main.js drawTerrain),
          // 判定必须跟它同一组尺寸,否则会出现"还在泥边就已经减速"。
          // 精灵外框 pw×ph 里,泥巴边占外圈,真正的水面约在中心 60%,
          // 只有踩进水面才减速。
          // ⚠ 这两行必须与 main.js drawTerrain 的 pw/ph 公式逐字一致
          var pw = 372 + Math.floor(hash2(rx * 127, ry * 131) * 174);
          var ph = 225 + Math.floor(hash2(rx * 137, ry * 139) * 102);
          var wrx = pw * 0.5 * SWAMP_WATER_RATIO;
          var wry = ph * 0.5 * SWAMP_WATER_RATIO;
          if ((dx * dx) / (wrx * wrx) + (dy * dy) / (wry * wry) <= 1) {
            return { type: 'swamp', mul: 0.60 };
          }
          continue;
        }
        var rw = 116 + hash2(rx * 97, ry * 101) * 152;
        var rhh = 48 + hash2(rx * 103, ry * 107) * 72;
        var rot = rh * Math.PI, co = Math.cos(rot), si = Math.sin(rot);
        var lx = dx * co + dy * si, ly = -dx * si + dy * co;
        if ((lx * lx) / (rw * rw) + (ly * ly) / (rhh * rhh) <= 1) {
          return { type: 'water', mul: 0.75 };
        }
      }
    }
    return { type: id === 'wilds' ? 'grass' : 'ground', mul: 1 };
  }

  // 每格只放一件装饰并扩大安全间距；这样两棵大树/墓碑的实际轮廓
  // 不会在相邻格随机偏移后相互叠穿。
  var DECOR_CELL = 304;

  // 按物件"设定"分配出现率:体量越大越稀疏,越显眼的地标越罕见。
  // 全部用同一个密度会让大树和小石头一样多,视觉上既拥挤又没有层次。
  var DECOR_RARITY = {
    // 大型地标:很稀疏,一屏最多见到一两个
    deco_deadtree_large1: 0.30, deco_deadtree_large2: 0.30,
    deco_deadtree_large3: 0.30, deco_deadtree_large4: 0.30,
    deco_pillar: 0.34, deco_crystal: 0.30, deco_stalag: 0.40,
    deco_burned_cottage: 0.16, deco_broken_wagon: 0.24,
    // 中型:适度
    deco_grave: 0.62, deco_fence: 0.50, deco_skullpost: 0.46,
    deco_fallenlog: 0.44, deco_deadstump: 0.55, deco_wagon_rut: 0.50,
    deco_road_marker: 0.34, deco_abyss_coral: 0.44,
    deco_rune_cluster: 0.42, deco_wither_cluster1: 0.55, deco_wither_cluster2: 0.55,
    // 小型植被/碎物:可以铺得密一些,负责填满空地
    deco_rock: 0.90, deco_bush: 0.86, deco_mushroom: 0.80, deco_bone: 0.78,
    deco_rune: 0.70, deco_lilypad: 0.74, deco_deadroots: 0.80,
    deco_swamp_reeds: 0.72, deco_deadreeds: 0.72
  };
  var decorCandidateCache = Object.create(null);

  function decorRadius(name) {
    if (!name) return 18;
    if (name === 'deco_burned_cottage') return 66;
    if (name === 'deco_broken_wagon') return 52;
    if (name.indexOf('tree') >= 0) return 50;
    if (name === 'deco_pillar' || name === 'deco_crystal' || name === 'deco_stalag') return 40;
    if (name === 'deco_grave' || name === 'deco_fence' || name === 'deco_fallenlog') return 30;
    if (name === 'deco_deadstump') return 42;   // V4 stump visual base is 84px wide; match it
    return 22;
  }

  // Pure candidate generation permits neighbor tests without recursion.  The
  // final visible set is therefore independent of camera order and cannot
  // produce two large props intersecting one another.
  function decorCandidate(map, cx, cy) {
    if (!map || !map.decors || !map.decors.length) return null;
    var cacheKey = (map.id || 'map') + ':' + cx + ':' + cy;
    if (Object.prototype.hasOwnProperty.call(decorCandidateCache, cacheKey)) {
      return decorCandidateCache[cacheKey] || null;
    }
    var density = hash2(cx * 3 + 1, cy * 3 + 1);
    if (density < 0.23) { decorCandidateCache[cacheKey] = false; return null; }
    var h1 = hash2(cx * 7 + 17, cy * 7 + 31);
    var h2 = hash2(cx * 11 + 43, cy * 11 + 59);
    var wx = cx * DECOR_CELL + DECOR_CELL * 0.5 + (h1 - 0.5) * 28;
    var wy = cy * DECOR_CELL + DECOR_CELL * 0.5 + (h2 - 0.5) * 24;
    if (Math.abs(wx - CFG.MERCHANT.x) < 190 && Math.abs(wy - CFG.MERCHANT.y) < 190) {
      decorCandidateCache[cacheKey] = false; return null;
    }
    // Roads remain legible and pools remain self-contained terrain features.
    // This especially prevents trees/houses from appearing on the road or
    // visually sticking into a swamp edge.
    var terrain = terrainEffect(map, wx, wy);
    if (terrain.type === 'road' || terrain.type === 'swamp' || terrain.type === 'water') {
      decorCandidateCache[cacheKey] = false; return null;
    }
    var name = map.decors[Math.floor(hash2(cx * 19 + 5, cy * 23 + 7) * map.decors.length)];
    var rarity = DECOR_RARITY[name];
    if (rarity !== undefined && hash2(cx * 29 + 11, cy * 31 + 13) > rarity) {
      decorCandidateCache[cacheKey] = false; return null;
    }
    return (decorCandidateCache[cacheKey] = {
      x: wx, y: wy, name: name, hash: h1, priority: hash2(cx * 37 + 71, cy * 41 + 73)
    });
  }

  function decorEntry(map, cx, cy) {
    var current = decorCandidate(map, cx, cy);
    if (!current) return null;
    var radius = decorRadius(current.name);
    for (var ny = cy - 1; ny <= cy + 1; ny++) for (var nx = cx - 1; nx <= cx + 1; nx++) {
      if (nx === cx && ny === cy) continue;
      var other = decorCandidate(map, nx, ny);
      if (!other || other.priority > current.priority) continue;
      var safe = radius + decorRadius(other.name) + 18;
      if (dist2(current.x, current.y, other.x, other.y) < safe * safe) return null;
    }
    return current;
  }
  function forEachDecor(map, minX, minY, maxX, maxY, callback) {
    var x0 = Math.floor(minX / DECOR_CELL), x1 = Math.floor(maxX / DECOR_CELL);
    var y0 = Math.floor(minY / DECOR_CELL), y1 = Math.floor(maxY / DECOR_CELL);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var d = decorEntry(map, cx, cy);
        if (d) callback(d);
      }
    }
  }
  function decorCollisionRadius(name) {
    if (!name) return 0;
    if (name.indexOf('tree') >= 0) return 31;
    if (name === 'deco_burned_cottage') return 42;
    if (name === 'deco_broken_wagon') return 30;
    if (name === 'deco_broken_sword') return 11;
    if (name === 'deco_deadstump') return 42;   // must match the 84px authored visual base
    if (name === 'deco_grave' || name === 'deco_pillar' || name === 'deco_stalag') return 18;
    if (name === 'deco_fence' || name === 'deco_skullpost' || name === 'deco_road_marker') return 14;
    if (name === 'deco_deadroots' || name === 'deco_fallenlog') return 13;
    return 0;
  }
  function resolveDecorCollision(map, body) {
    var br = body.r || 9;
    forEachDecor(map, body.x - 80, body.y - 80, body.x + 80, body.y + 80, function (d) {
      var dr = decorCollisionRadius(d.name);
      if (!dr) return;
      var dx = body.x - d.x, dy = body.y - d.y;
      var minD = br + dr, d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) return;
      var len = Math.sqrt(d2) || 0.001;
      body.x = d.x + dx / len * minD;
      body.y = d.y + dy / len * minD;
    });
  }

  var uidCounter = 1;

  return {
    clamp: clamp, lerp: lerp, dist2: dist2, mulberry32: mulberry32, hash2: hash2,
    fmtTime: fmtTime, pick: pick,
    initInput: initInput, readInput: readInput, keys: function () { return keys; },
    lastDir: lastDir, touchState: touch, pointerState: pointer,
    consumeDash: function () { var d = dashRequest; dashRequest = null; return d; },
    gridClear: gridClear, gridInsert: gridInsert, gridQuery: gridQuery, gridNearest: gridNearest,
    cam: cam, start: start, fitCanvas: fitCanvas, refit: refit,
    isTouch: function () { return isTouch; },
    viewScale: function () { return viewScale; },
    terrainEffect: terrainEffect, roadBend: roadBend,
    // 绘制侧(main.js drawTerrain)必须复用这两个常量,保证视觉与减速判定同步
    SWAMP_THRESHOLD: SWAMP_THRESHOLD, SWAMP_WATER_RATIO: SWAMP_WATER_RATIO,
    forEachDecor: forEachDecor, decorCollisionRadius: decorCollisionRadius, decorVisualRadius: decorRadius,
    resolveDecorCollision: resolveDecorCollision,
    setTimeScale: function (s) { timeScale = s; },
    nextUid: function () { return uidCounter++; },
    onPause: null, onBlur: null, onToggleMap: null, onScroll: null, onMiddleClick: null, onPinch: null, isOverMinimap: null
  };
})();
