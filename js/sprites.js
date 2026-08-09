// sprites.js — 模块A:程序化像素美术生成器(window.SpriteGen)。1px 深色描边、2~3 级明暗、种子 RNG 确定性生成。
(function () {
  'use strict';

  // ---------- 种子 RNG(mulberry32,固定种子,每次刷新一致) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(0x9e3779b9);
  function ri(lo, hi) { return (lo + rnd() * (hi - lo + 1)) | 0; }

  // ---------- 颜色 ----------
  var OUT = '#131020';          // 全局 1px 深色描边
  var ICON_BG = '#1a1626';      // 图标深底
  var ICON_RIM = '#2c2545';
  var ICON_RIM_HI = '#453a6b';
  var GOLD = '#f2c14e', GOLD_D = '#b07d1f', GOLD_L = '#ffe9a3';
  var BONE = '#e8e4d8', BONE_D = '#b8b2a0';

  function h2(v) { v = v < 0 ? 0 : (v > 255 ? 255 : v | 0); var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
  // f>0 向白提亮,f<0 乘法压暗
  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return '#' + h2(r) + h2(g) + h2(b);
  }

  // ---------- 像素画布(绘图 DSL:px/rect/disc/line/hmirror/outline/blit) ----------
  function Pix(w, h) {
    this.w = w; this.h = h;
    this.d = new Array(w * h);
    for (var i = 0; i < w * h; i++) this.d[i] = null;
  }
  Pix.prototype.px = function (x, y, c) {
    x |= 0; y |= 0;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  };
  Pix.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.d[y * this.w + x];
  };
  Pix.prototype.rect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.px(x + i, y + j, c);
  };
  Pix.prototype.hline = function (x0, x1, y, c) { for (var x = x0; x <= x1; x++) this.px(x, y, c); };
  Pix.prototype.vline = function (x, y0, y1, c) { for (var y = y0; y <= y1; y++) this.px(x, y, c); };
  Pix.prototype.box = function (x, y, w, h, c) {
    this.hline(x, x + w - 1, y, c); this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c); this.vline(x + w - 1, y, y + h - 1, c);
  };
  Pix.prototype.line = function (x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  };
  Pix.prototype.disc = function (cx, cy, r, c) {
    var r2 = r * r + r * 0.6;
    var ir = Math.ceil(r);
    for (var dy = -ir; dy <= ir; dy++) for (var dx = -ir; dx <= ir; dx++) {
      if (dx * dx + dy * dy <= r2) this.px(cx + dx, cy + dy, c);
    }
  };
  Pix.prototype.ell = function (cx, cy, rx, ry, c) {
    for (var dy = -ry; dy <= ry; dy++) for (var dx = -rx; dx <= rx; dx++) {
      var nx = dx / (rx + 0.4), ny = dy / (ry + 0.4);
      if (nx * nx + ny * ny <= 1) this.px(cx + dx, cy + dy, c);
    }
  };
  Pix.prototype.eraseDisc = function (cx, cy, r) {
    var r2 = r * r + r * 0.6;
    var ir = Math.ceil(r);
    for (var dy = -ir; dy <= ir; dy++) for (var dx = -ir; dx <= ir; dx++) {
      if (dx * dx + dy * dy <= r2) this.px(cx + dx, cy + dy, null);
    }
  };
  Pix.prototype.eraseRect = function (x, y, w, h) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.px(x + i, y + j, null);
  };
  // 左半镜像到右半(左右对称素材少画一半)
  Pix.prototype.hmirror = function () {
    var hw = this.w >> 1;
    for (var y = 0; y < this.h; y++) for (var x = 0; x < hw; x++) {
      var c = this.d[y * this.w + x];
      if (c !== null && c !== undefined) this.d[y * this.w + (this.w - 1 - x)] = c;
    }
  };
  // 自动 1px 描边:透明像素若 4 邻接不透明则染描边色
  Pix.prototype.outline = function (c) {
    var w = this.w, h = this.h, src = this.d.slice();
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      var n = (x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) ||
              (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x]);
      if (n) this.d[y * w + x] = c;
    }
  };
  Pix.prototype.blit = function (src, dx, dy) {
    for (var y = 0; y < src.h; y++) for (var x = 0; x < src.w; x++) {
      var c = src.d[y * src.w + x];
      if (c) this.px(dx + x, dy + y, c);
    }
  };
  Pix.prototype.toCanvas = function () {
    var cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var cur = null;
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      var c = this.d[y * this.w + x];
      if (!c) continue;
      if (c !== cur) { ctx.fillStyle = c; cur = c; }
      ctx.fillRect(x, y, 1, 1);
    }
    return cv;
  };

  // ---------- 注册表 ----------
  var defs = {};    // name -> builder() => [Pix,...]
  var store = null; // name -> [canvas,...](init 后填充;get/frames 高频路径零分配)
  var warned = {};
  var PLACEHOLDER = null;

  function def(name, fn) { defs[name] = fn; }
  function two(fn) { return function () { return [fn(0), fn(1)]; }; }
  function one(fn) { return function () { return [fn()]; }; }
  function multi(n, fn) {
    return function () { var out = []; for (var i = 0; i < n; i++) out.push(fn(i)); return out; };
  }

  // ---------- 通用 16×16 人形(2 帧:躯干上下 1px + 腿部交替) ----------
  // o:{skin,eye,hair,torso,torsoHi,torsoLo,leg,boot,sleeve,robe,noFace,pre(p,f,dy),post(p,f,dy)}
  function humanoid(o) {
    var frames = [];
    for (var f = 0; f < 2; f++) {
      var p = new Pix(16, 16);
      var dy = f;
      if (o.pre) o.pre(p, f, dy);
      // 腿(锚定地面 y=14)
      var lg = o.leg || '#3a3444', bt = o.boot || shade(lg, -0.35);
      if (!o.robe) {
        if (f === 0) {
          p.rect(5, 12, 2, 2, lg); p.rect(9, 12, 2, 2, lg);
          p.rect(5, 14, 2, 1, bt); p.rect(9, 14, 2, 1, bt);
        } else {
          p.rect(6, 12, 2, 2, lg); p.rect(8, 12, 2, 2, lg);
          p.rect(6, 14, 2, 1, bt); p.rect(8, 14, 2, 1, bt);
        }
      }
      // 躯干 y7+dy..11
      p.rect(5, 7 + dy, 6, 5 - dy, o.torso);
      p.vline(5, 7 + dy, 11, o.torsoHi);
      p.vline(10, 7 + dy, 11, o.torsoLo);
      // 长袍下摆
      if (o.robe) {
        p.rect(5, 11, 6, 3, o.torso);
        p.rect(4, 13, 8, 2, o.torsoLo);
        if (f === 0) { p.px(4, 12, o.torsoLo); p.px(11, 14, null); }
        else { p.px(11, 12, o.torsoLo); p.px(4, 14, null); }
      }
      // 手臂(摆动)
      var sl = o.sleeve || o.torso, sk = o.skin || '#e8b88a';
      if (f === 0) {
        p.px(4, 8 + dy, sl); p.px(4, 9 + dy, sk);
        p.px(11, 9 + dy, sl); p.px(11, 10 + dy, sk);
      } else {
        p.px(4, 9 + dy, sl); p.px(4, 10 + dy, sk);
        p.px(11, 8 + dy, sl); p.px(11, 9 + dy, sk);
      }
      // 头 y2+dy..6+dy
      p.rect(5, 2 + dy, 6, 5, o.skin || '#e8b88a');
      if (o.hair) { p.rect(5, 2 + dy, 6, 2, o.hair); p.px(5, 4 + dy, o.hair); p.px(10, 4 + dy, o.hair); }
      if (!o.noFace) { p.px(6, 5 + dy, o.eye || '#221f30'); p.px(9, 5 + dy, o.eye || '#221f30'); }
      if (o.post) o.post(p, f, dy);
      p.outline(o.out || OUT);
      frames.push(p);
    }
    return frames;
  }

  // ---------- 角色(16×16,2 帧) ----------
  def('char_knight', function () {
    return humanoid({
      skin: '#e8b88a', torso: '#aab2c8', torsoHi: '#e2e8f4', torsoLo: '#6b7390',
      leg: '#4a4f66', boot: '#31374a', sleeve: '#8a90a4', noFace: true,
      pre: function (p, f, dy) { // 蓝披风
        p.rect(3, 7 + dy, 2, 6 - f, '#2e56c8');
        p.vline(2, 9 + dy, 12, '#1d3a94');
        p.px(3, 13 + dy - f, '#1d3a94');
      },
      post: function (p, f, dy) { // 银盔+面缝+蓝翎;佩剑
        p.rect(5, 1 + dy, 6, 6, '#c4cad8');
        p.vline(5, 1 + dy, 6 + dy, '#eef2f8');
        p.vline(10, 1 + dy, 6 + dy, '#8a90a4');
        p.rect(6, 4 + dy, 4, 1, '#141a28');
        p.px(7, 0 + dy, '#3a63e8'); p.px(8, 0 + dy, '#5a83f8');
        p.rect(5, 7 + dy, 6, 1, '#8a90a4'); // 护颈
        p.vline(12, 8 + dy, 12 + dy, '#d8dce8'); // 剑
        p.hline(11, 13, 8 + dy, GOLD_D);
        p.px(12, 7 + dy, GOLD);
      }
    });
  });

  def('char_mage', function () {
    return humanoid({
      skin: '#eec096', eye: '#3a2a68', torso: '#5a35a8', torsoHi: '#7d55d4', torsoLo: '#3d2378',
      robe: true,
      post: function (p, f, dy) { // 紫尖帽+金星+法杖
        p.hline(3, 12, 2 + dy, '#4a2a90');
        p.rect(6, 1 + dy, 4, 1, '#5a35a8');
        p.rect(7, 0 + dy, 2, 1, '#6a45c0');
        p.px(9, 1 + dy, GOLD);
        p.hline(5, 10, 12, GOLD_D); // 腰带
        p.vline(13, 6 + dy, 11 + dy, '#7a5230'); // 杖
        p.px(13, 5 + dy, f === 0 ? '#c88aff' : '#e8c2ff'); // 杖顶辉光
      }
    });
  });

  def('char_ranger', function () {
    return humanoid({
      skin: '#e0aa7e', eye: '#1f3a1a', torso: '#6b4a2f', torsoHi: '#8a6540', torsoLo: '#4a3220',
      leg: '#3a3020', boot: '#241d12', sleeve: '#3f7d3a',
      pre: function (p, f, dy) { // 暗绿披风
        p.rect(3, 7 + dy, 2, 5, '#28551f');
        p.px(2, 10 + dy + f, '#1b3a14');
      },
      post: function (p, f, dy) { // 绿兜帽+弓
        p.rect(5, 1 + dy, 6, 3, '#3f7d3a');
        p.px(4, 2 + dy, '#3f7d3a'); p.px(11, 2 + dy, '#2a5c26');
        p.px(11, 3 + dy, '#2a5c26'); p.px(5, 4 + dy, '#2a5c26'); p.px(10, 4 + dy, '#2a5c26');
        p.hline(5, 10, 6 + dy, '#2a5c26'); // 帽沿阴影
        p.vline(13, 6 + dy, 12 + dy, '#8a6238'); // 弓臂
        p.px(12, 6 + dy, '#8a6238'); p.px(12, 12 + dy, '#8a6238');
        p.vline(12, 7 + dy, 11 + dy, '#d8d2c0'); // 弓弦
      }
    });
  });

  def('char_cleric', function () {
    return humanoid({
      skin: '#f0c8a0', eye: '#6a5a20', torso: '#e8e4da', torsoHi: '#fbfaf5', torsoLo: '#b8b2a4',
      robe: true, hair: '#d8b868',
      post: function (p, f, dy) { // 金环+金边+圣书
        p.hline(6, 9, 0 + dy, GOLD);
        p.hline(5, 10, 2 + dy, GOLD_D);
        p.hline(4, 11, 14, GOLD_D); // 下摆金边
        p.hline(5, 10, 12, GOLD_D);
        p.rect(11, 9 + dy, 3, 2, '#b07d1f'); // 圣书
        p.px(12, 9 + dy, '#fbfaf5');
      }
    });
  });

  def('char_berserker', function () {
    return humanoid({
      skin: '#d99a6c', eye: '#7a1616', torso: '#d99a6c', torsoHi: '#efb98a', torsoLo: '#a86e48',
      leg: '#5e4028', boot: '#8a7050', sleeve: '#d99a6c', hair: '#c8382a',
      post: function (p, f, dy) { // 狂野红发+伤疤+双斧
        p.px(4, 1 + dy, '#c8382a'); p.px(6, 0 + dy, '#e05038'); p.px(9, 0 + dy, '#c8382a');
        p.px(11, 1 + dy, '#e05038'); p.px(7, 1 + dy, '#e05038');
        p.px(7, 8 + dy, '#8a2a1a'); p.px(8, 9 + dy, '#8a2a1a'); // 疤
        var ay = f === 0 ? 0 : 1;
        p.vline(2, 8 + ay, 12, '#6b4a2f'); p.rect(1, 6 + ay, 2, 2, '#c8ccd8'); p.px(1, 8 + ay, '#eef2f8');
        p.vline(13, 8 + 1 - ay, 12, '#6b4a2f'); p.rect(13, 6 + 1 - ay, 2, 2, '#c8ccd8'); p.px(14, 8 - ay + 1, '#eef2f8');
      }
    });
  });

  def('char_chrono', function () {
    return humanoid({
      skin: '#e6d8d0', eye: '#38d8f0', torso: '#2a8f9d', torsoHi: '#59c4cf', torsoLo: '#1a5f6d',
      robe: true,
      post: function (p, f, dy) { // 青蓝兜帽+金怀表+链
        p.rect(5, 1 + dy, 6, 3, '#1f6e7d');
        p.px(4, 2 + dy, '#1f6e7d'); p.px(11, 2 + dy, '#14505c');
        p.px(5, 4 + dy, '#14505c'); p.px(10, 4 + dy, '#14505c');
        p.px(8, 10 + dy, GOLD); p.px(7, 10 + dy, GOLD_D); // 怀表
        p.px(8, 9 + dy, GOLD_L);
        p.px(6, 9 + dy, GOLD_D); p.px(5, 8 + dy, GOLD_D); // 表链
      }
    });
  });

  // 行商浪人:宽檐帽 + 深褐斗篷 + 拄拐,背着货物包裹
  def('merchant', function () {
    return humanoid({
      skin: '#d8a878', eye: '#2a1e14', torso: '#6b4a2f', torsoHi: '#8a6540', torsoLo: '#46301e',
      leg: '#3a2a1a', boot: '#241a10', sleeve: '#7a5a38',
      hair: '#8a8a96',
      pre: function (p, f, dy) { // 背后货包
        p.rect(2, 6 + dy, 2, 5, '#5a4026');
        p.rect(2, 7 + dy, 2, 3, '#6b4a2f');
        p.px(2, 5 + dy, '#7a5a38'); p.px(1, 7 + dy, '#46301e');
      },
      post: function (p, f, dy) { // 宽檐帽 + 拄拐
        p.hline(3, 12, 0 + dy, '#3a2a1a');           // 帽檐
        p.rect(5, 1 + dy, 6, 3, '#4a3520');          // 帽身
        p.px(8, 2 + dy, '#6b4a2f'); p.px(7, 2 + dy, '#5a4026');
        p.px(8, 0 + dy, '#8a6540');                  // 帽顶亮
        p.hline(4, 11, 12, GOLD_D);                  // 腰带扣
        p.vline(13, 5 + dy, 12 + dy, '#7a5a38');     // 拐杖
        p.px(13, 4 + dy, '#5a4026');
        p.px(10, 4 + dy, GOLD); p.px(11, 4 + dy, GOLD_D);  // 胸饰铜币
      }
    });
  });

  // ---------- 敌人(16×16,蝙蝠 3 帧扇翅) ----------
  def('bat', function () {
    // 三帧:翅展开 → 半收 → 上挥,扇翅更流畅
    var frames = [];
    var body = function (p) {
      p.disc(7, 8, 2.2, '#584668');
      p.px(6, 5, '#584668'); p.px(6, 4, '#584668');
      p.hmirror();
      p.rect(7, 6, 2, 3, '#6a5680');
      p.px(6, 8, '#ff5a4a'); p.px(9, 8, '#ff5a4a');
      p.px(7, 10, '#e8e4d8');
    };
    var W = '#3a2c50', M = '#4e3c6a';
    for (var f = 0; f < 3; f++) {
      var p = new Pix(16, 16);
      if (f === 0) {       // 展开
        p.hline(1, 4, 6, W); p.hline(2, 5, 7, M); p.hline(3, 5, 8, W); p.px(1, 7, W);
      } else if (f === 1) { // 半收
        p.hline(2, 4, 6, W); p.hline(3, 5, 7, M); p.px(2, 7, W);
      } else {              // 上挥
        p.px(3, 3, W); p.rect(3, 4, 2, 2, W); p.rect(4, 6, 2, 2, M);
      }
      body(p);
      p.outline(OUT);
      frames.push(p);
    }
    return frames;
  });

  def('slime', two(function (f) {
    var p = new Pix(16, 16), G = '#4ab83e', GH = '#8ce46a', GL = '#2a7a2c';
    if (f === 0) {
      p.ell(8, 9, 5, 4, G); p.rect(4, 11, 9, 3, G);
      p.hline(3, 12, 13, GL); p.ell(6, 7, 1, 1, GH); p.px(5, 6, GH);
      p.px(6, 10, '#153a16'); p.px(10, 10, '#153a16');
      p.hline(7, 9, 12, '#153a16');
    } else { // 压扁
      p.ell(8, 11, 6, 3, G); p.rect(3, 12, 11, 2, G);
      p.hline(2, 13, 13, GL); p.ell(6, 9, 1, 1, GH); p.px(5, 8, GH);
      p.px(6, 11, '#153a16'); p.px(10, 11, '#153a16');
      p.hline(7, 9, 13, '#153a16');
    }
    p.outline(OUT);
    return p;
  }));

  def('slime_big', two(function (f) {
    var p = new Pix(16, 16), G = '#2e8f3a', GH = '#5cc45e', GL = '#1a5c22';
    if (f === 0) {
      p.ell(8, 8, 6, 5, G); p.rect(2, 10, 12, 4, G);
      p.hline(2, 13, 13, GL); p.ell(5, 6, 2, 1, GH);
      p.px(5, 9, '#0e2e12'); p.px(11, 9, '#0e2e12');
      p.hline(6, 10, 11, '#0e2e12'); p.px(7, 11, '#e8e4d8'); p.px(9, 11, '#e8e4d8');
      p.px(11, 5, GH); p.px(12, 7, GH); // 气泡
    } else {
      p.ell(8, 10, 7, 4, G); p.rect(1, 11, 14, 3, G);
      p.hline(1, 14, 13, GL); p.ell(5, 8, 2, 1, GH);
      p.px(5, 10, '#0e2e12'); p.px(11, 10, '#0e2e12');
      p.hline(6, 11, 12, '#0e2e12'); p.px(7, 12, '#e8e4d8'); p.px(9, 12, '#e8e4d8');
      p.px(12, 8, GH);
    }
    p.outline(OUT);
    return p;
  }));

  def('zombie', function () {
    return humanoid({
      skin: '#7ba05a', eye: '#dfe8c8', torso: '#4a4438', torsoHi: '#5e574a', torsoLo: '#332e24',
      leg: '#3a3428', boot: '#2a2418', sleeve: '#4a4438',
      post: function (p, f, dy) { // 前伸双臂+烂斑+歪嘴
        p.px(9, 5 + dy, '#1a2210');           // 一只黑眼
        p.hline(6, 8, 6 + dy, '#54703a');     // 嘴
        p.px(7, 9 + dy, '#5c7a40'); p.px(6, 10 + dy, '#5c7a40'); // 破洞露肉
        var ay = f === 0 ? 0 : 1;
        p.hline(2, 4, 8 + ay + dy, '#7ba05a');  // 左臂前伸
        p.hline(11, 13, 9 - ay + dy, '#7ba05a');// 右臂前伸
        p.px(2, 9 + ay + dy, '#8fb46a'); p.px(13, 10 - ay + dy, '#8fb46a'); // 手
      }
    });
  });

  def('skeleton', two(function (f) {
    var p = new Pix(16, 16), dy = f;
    p.rect(5, 1 + dy, 6, 4, BONE);            // 颅骨
    p.px(5, 1 + dy, null); p.px(10, 1 + dy, null);
    p.rect(6, 5 + dy, 4, 1, BONE_D);          // 颌
    p.px(6, 5 + dy, BONE); p.px(8, 5 + dy, BONE);
    p.px(6, 3 + dy, '#131020'); p.px(9, 3 + dy, '#131020'); // 眼窝
    p.px(8, 4 + dy, '#131020');               // 鼻
    p.vline(7, 7 + dy, 10, BONE); p.vline(8, 7 + dy, 10, BONE_D); // 脊柱
    p.hline(5, 10, 7 + dy, BONE);             // 肋
    p.hline(5, 10, 9 + dy, BONE);
    p.hline(6, 9, 8 + dy, BONE_D);
    p.rect(6, 11, 4, 1, BONE_D);              // 盆骨
    var ay = f === 0 ? 0 : 1;
    p.vline(4, 7 + ay + dy, 10 + ay, BONE_D); // 臂骨
    p.vline(11, 8 - ay + dy, 11 - ay, BONE_D);
    if (f === 0) { p.vline(6, 12, 14, BONE); p.vline(9, 12, 14, BONE); }
    else { p.vline(7, 12, 14, BONE); p.vline(9, 12, 14, BONE_D); }
    p.outline(OUT);
    return p;
  }));

  def('ghost', two(function (f) {
    var p = new Pix(16, 16);
    var B = 'rgba(208,226,255,0.78)', S = 'rgba(148,178,228,0.6)', E = 'rgba(16,22,44,0.9)';
    p.ell(8, 7, 4, 5, B);
    p.rect(4, 8, 9, 4, B);
    p.vline(11, 5, 11, S); p.vline(12, 7, 11, S);
    if (f === 0) { p.px(4, 12, B); p.px(5, 13, S); p.px(7, 12, B); p.px(8, 13, S); p.px(10, 12, B); p.px(11, 13, S); }
    else { p.px(5, 12, B); p.px(6, 13, S); p.px(8, 12, B); p.px(9, 13, S); p.px(11, 12, B); p.px(12, 13, S); }
    p.px(6, 6, E); p.px(10, 6, E);            // 空洞眼
    p.px(8, 9, E);                             // O 嘴
    p.px(5, 4, 'rgba(255,255,255,0.85)');      // 高光
    p.outline('rgba(70,90,150,0.55)');
    return p;
  }));

  def('spider', two(function (f) {
    var p = new Pix(16, 16), L = '#241a30';
    var s = f === 0 ? 0 : 1;
    p.line(5, 8, 2, 4 + s, L); p.px(2, 5 + s, L);      // 腿×3(左)
    p.line(5, 9, 1, 9 - s, L);
    p.line(5, 10, 2, 13 - s, L); p.px(2, 12 - s, L);
    p.disc(8, 10, 3, '#3a2a4a');               // 腹
    p.disc(8, 5, 2, '#2c2038');                // 头
    p.hmirror();
    p.px(8, 8, '#8a4ad8'); p.px(8, 10, '#8a4ad8'); p.px(7, 9, '#8a4ad8'); p.px(9, 9, '#8a4ad8'); // 紫纹
    p.px(7, 4, '#ff4a5e'); p.px(9, 4, '#ff4a5e'); // 红眼
    p.px(7, 6, '#d8d2e8'); p.px(9, 6, '#d8d2e8'); // 毒牙
    p.outline(OUT);
    return p;
  }));

  def('cultist', function () {
    return humanoid({
      skin: '#100c16', eye: '#ffd84a', torso: '#7a1f2e', torsoHi: '#a53344', torsoLo: '#521320',
      robe: true, out: OUT,
      post: function (p, f, dy) { // 深红兜帽+黑脸金瞳+祭刀
        p.rect(5, 1 + dy, 6, 3, '#7a1f2e');
        p.px(7, 0 + dy, '#7a1f2e'); p.px(8, 0 + dy, '#8f2637');
        p.px(4, 2 + dy, '#7a1f2e'); p.px(11, 2 + dy, '#521320');
        p.px(5, 4 + dy, '#521320'); p.px(10, 4 + dy, '#521320');
        p.rect(6, 4 + dy, 4, 2, '#100c16');
        p.px(6, 5 + dy, '#ffd84a'); p.px(9, 5 + dy, '#ffd84a');
        p.hline(5, 10, 11, '#3d3020');         // 绳腰带
        p.vline(13, 8 + dy, 10 + dy, '#c4cbd8'); p.px(13, 11 + dy, '#4a3550'); // 祭刀
      }
    });
  });

  def('orc', two(function (f) {
    var p = new Pix(16, 16), dy = f, SK = '#4a6b2e', SH = '#638a3e', SL = '#31491c';
    if (f === 0) { p.rect(4, 12, 3, 2, '#5e4028'); p.rect(9, 12, 3, 2, '#5e4028'); }
    else { p.rect(5, 12, 3, 2, '#5e4028'); p.rect(8, 12, 3, 2, '#5e4028'); }
    p.rect(4, 7 + dy, 8, 5 - dy, SK);          // 宽躯干
    p.vline(4, 7 + dy, 11, SH); p.vline(11, 7 + dy, 11, SL);
    p.rect(5, 10 + dy, 6, 2, '#6b4a2f');       // 兽皮腰布
    var ay = f === 0 ? 0 : 1;
    p.rect(2, 7 + ay + dy, 2, 4, SK); p.px(2, 11 + ay + dy, SH);   // 粗臂
    p.rect(12, 8 - ay + dy, 2, 4, SK); p.px(13, 12 - ay + dy, SH);
    p.rect(4, 1 + dy, 8, 6, SK);               // 大头
    p.vline(4, 1 + dy, 6 + dy, SH); p.vline(11, 1 + dy, 6 + dy, SL);
    p.px(6, 3 + dy, '#ffd84a'); p.px(9, 3 + dy, '#ffd84a'); // 黄眼
    p.hline(5, 10, 5 + dy, SL);                // 阔嘴
    p.px(5, 5 + dy, '#e8e4d8'); p.px(10, 5 + dy, '#e8e4d8'); // 獠牙上翘
    p.px(5, 4 + dy, '#e8e4d8'); p.px(10, 4 + dy, '#e8e4d8');
    p.px(8, 0 + dy, '#2a1a10');                // 发髻
    p.outline(OUT);
    return p;
  }));

  def('imp', two(function (f) {
    var p = new Pix(16, 16), B = '#e0622e', BH = '#f08a4e', BL = '#a8401c';
    var dy = f;
    p.px(5, 3 + dy, '#5e1a0a'); p.px(4, 2 + dy, '#5e1a0a'); // 角
    if (f === 0) { p.px(3, 8, '#6e2812'); p.px(2, 9, '#6e2812'); }  // 小翼
    else { p.px(3, 6, '#6e2812'); p.px(2, 5, '#6e2812'); }
    p.disc(8, 5, 2.4, B);                      // 头
    p.rect(6, 8, 4, 4 - dy, B);                // 身
    p.vline(6, 8, 11 - dy, BH); p.vline(9, 8, 11 - dy, BL);
    if (f === 0) { p.vline(6, 12, 13, BL); p.vline(9, 12, 13, BL); }
    else { p.vline(7, 11, 13, BL); p.vline(9, 12, 13, BL); }
    p.hmirror();
    p.px(7, 5, '#ffe95a'); p.px(9, 5, '#ffe95a'); // 黄眼
    p.px(8, 6, '#5e1a0a');                      // 坏笑
    if (f === 0) { p.line(10, 12, 13, 10, '#a8401c'); p.px(14, 9, '#e0622e'); } // 尾
    else { p.line(10, 12, 13, 12, '#a8401c'); p.px(14, 13, '#e0622e'); }
    p.outline(OUT);
    return p;
  }));

  def('knight_armored', two(function (f) {
    var p = new Pix(16, 16), dy = f, A = '#2e2e3c', AH = '#4c4c60', AL = '#1c1c26';
    if (f === 0) { p.rect(5, 12, 2, 3, AL); p.rect(9, 12, 2, 3, AL); }
    else { p.rect(6, 12, 2, 3, AL); p.rect(8, 12, 2, 3, AL); }
    p.rect(5, 7 + dy, 6, 5 - dy, A);           // 胸甲
    p.vline(5, 7 + dy, 11, AH); p.vline(10, 7 + dy, 11, AL);
    p.px(7, 9 + dy, '#c03a3a'); p.px(8, 9 + dy, '#8a1f1f'); // 猩红纹章
    p.rect(3, 7 + dy, 2, 3, AH); p.rect(11, 7 + dy, 2, 3, AH); // 巨型肩甲
    p.px(3, 6 + dy, AH); p.px(12, 6 + dy, AH);
    p.rect(5, 1 + dy, 6, 6, A);                // 全盔
    p.vline(5, 1 + dy, 6 + dy, AH); p.vline(10, 1 + dy, 6 + dy, AL);
    p.px(7, 0 + dy, AH); p.px(8, 0 + dy, AH);  // 盔脊
    p.hline(6, 9, 3 + dy, '#0c0c14');          // T 面缝
    p.px(6, 3 + dy, '#ff3a3a'); p.px(9, 3 + dy, '#ff3a3a'); // 红光眼
    p.vline(7, 4 + dy, 5 + dy, '#0c0c14'); p.vline(8, 4 + dy, 5 + dy, '#0c0c14');
    p.rect(1, 8 + dy, 2, 5, '#3a3a4c');        // 塔盾
    p.px(1, 8 + dy, AH); p.px(2, 12 + dy, AL);
    p.vline(13, 7 + dy, 12 + dy, '#8a90a4');   // 巨剑
    p.px(13, 6 + dy, '#c8ccd8'); p.hline(12, 14, 12 + dy, AL);
    p.outline(OUT);
    return p;
  }));

  def('werewolf', two(function (f) {
    var p = new Pix(16, 16), dy = f, FU = '#6e6e78', FH = '#90909c', FL = '#48484f';
    p.px(4, 1 + dy, FU); p.px(5, 0 + dy, FU); p.px(8, 0 + dy, FU); p.px(9, 1 + dy, FU); // 竖耳
    p.rect(4, 2 + dy, 6, 4, FU);               // 头
    p.rect(1, 4 + dy, 3, 2, FH);               // 突出口鼻
    p.px(1, 4 + dy, '#26262e');                // 鼻
    p.px(2, 6 + dy, '#e8e4d8'); p.px(3, 6 + dy, '#e8e4d8'); // 龇牙
    p.px(5, 3 + dy, '#ff3a3a'); p.px(8, 3 + dy, '#ff3a3a'); // 红眼
    p.rect(5, 6 + dy, 8, 4, FU);               // 弓背躯干
    p.rect(9, 5 + dy, 4, 2, FH);               // 隆起的背
    p.vline(12, 6 + dy, 9 + dy, FL);
    var ay = f === 0 ? 0 : 1;
    p.rect(4, 9 + dy, 2, 4 - ay, FL);          // 长臂垂地
    p.px(4, 13 + dy - ay, '#e8e4d8'); p.px(5, 13 + dy - ay, '#e8e4d8'); // 白爪
    p.rect(10, 10 + dy, 2, 3, FL);             // 后腿
    p.px(10, 13 + dy, '#e8e4d8');
    if (f === 0) { p.px(13, 7, FU); p.px(14, 6, FU); } // 尾
    else { p.px(13, 8, FU); p.px(14, 8, FU); }
    p.px(6, 7 + dy, FH); p.px(8, 8 + dy, FH);  // 毛簇
    p.outline(OUT);
    return p;
  }));

  def('mummy', function () {
    return humanoid({
      skin: '#d8c9a3', eye: '#ffd84a', torso: '#d8c9a3', torsoHi: '#efe4c4', torsoLo: '#a89670',
      leg: '#c4b490', boot: '#a89670', sleeve: '#d8c9a3', noFace: true,
      post: function (p, f, dy) { // 缠布纹+独眼+垂布条
        p.px(6, 5 + dy, '#ffd84a');            // 独眼(另一只被布缠住)
        p.hline(5, 10, 3 + dy, '#a89670');     // 头部缠布
        p.hline(5, 10, 5 + dy, '#b8a884'); p.px(6, 5 + dy, '#ffd84a');
        p.hline(5, 10, 8 + dy, '#b8a884');     // 躯干缠布
        p.hline(5, 10, 10 + dy, '#a89670');
        p.hline(5, 10, 12, '#b8a884');
        var ay = f === 0 ? 0 : 1;
        p.hline(2, 4, 8 + ay + dy, '#d8c9a3'); // 前伸手臂
        p.hline(11, 13, 9 - ay + dy, '#d8c9a3');
        if (f === 0) { p.px(3, 10 + dy, '#c4b490'); p.px(3, 11 + dy, '#a89670'); } // 垂布条
        else { p.px(4, 10 + dy, '#c4b490'); p.px(4, 12 + dy, '#a89670'); }
      }
    });
  });

  def('gargoyle', two(function (f) {
    var p = new Pix(16, 16), dy = f, ST = '#8a8a96', SH = '#adadb8', SL = '#5e5e6c';
    if (f === 0) { // 翼展开(石翼上扬)
      p.line(1, 3, 4, 6, SL); p.line(1, 4, 4, 7, '#70707e'); p.px(1, 2, SL);
    } else {       // 翼收拢
      p.line(2, 8, 4, 6, SL); p.px(2, 9, SL); p.px(1, 8, '#70707e');
    }
    p.px(5, 1 + dy, SL); p.px(4, 0 + dy, SL);  // 弯角
    p.rect(5, 2 + dy, 6, 4, ST);               // 头
    p.vline(5, 2 + dy, 5 + dy, SH);
    p.rect(4, 6 + dy, 8, 5 - dy, ST);          // 蹲踞躯干
    p.vline(4, 6 + dy, 10, SH); p.vline(11, 6 + dy, 10, SL);
    p.rect(4, 11, 3, 3, SL); p.rect(9, 11, 3, 3, SL); // 兽足
    p.px(4, 14, SH); p.px(11, 14, SH);         // 石爪
    p.hmirror();
    p.px(6, 4 + dy, '#ffb43a'); p.px(9, 4 + dy, '#ffb43a'); // 炽目
    p.hline(7, 8, 5 + dy, SL);                 // 兽吻
    p.px(7, 8 + dy, '#70707e'); p.px(8, 9 + dy, '#70707e'); // 石裂纹
    p.outline(OUT);
    return p;
  }));

  def('bloodbat', two(function (f) {
    var p = new Pix(16, 16), W = '#5e1620', M = '#7a1f2e';
    if (f === 0) {
      p.hline(0, 4, 5, W); p.hline(1, 5, 6, M); p.hline(2, 5, 7, W); p.hline(3, 6, 8, M); p.px(0, 6, W);
    } else {
      p.px(2, 2, W); p.rect(2, 3, 2, 3, W); p.rect(3, 5, 3, 3, M);
    }
    p.disc(7, 8, 3, '#8a2430');                // 大身躯
    p.px(5, 4, '#8a2430'); p.px(5, 3, '#8a2430'); // 耳
    p.hmirror();
    p.rect(6, 6, 4, 3, '#b8394a');             // 胸腹亮面
    p.px(6, 7, '#ffd84a'); p.px(9, 7, '#ffd84a'); // 黄眼
    p.px(6, 10, '#e8e4d8'); p.px(9, 10, '#e8e4d8'); // 双獠牙
    p.px(7, 9, '#5e1620'); p.px(8, 9, '#5e1620');   // 口
    p.outline(OUT);
    return p;
  }));

  def('wraith', two(function (f) {
    var p = new Pix(16, 16), dy = f;
    var B = '#241f33', BH = '#3a3352', FA = 'rgba(36,31,51,0.55)';
    p.rect(5, 1 + dy, 6, 4, B);                // 兜帽
    p.px(7, 0 + dy, B); p.px(8, 0 + dy, BH);
    p.px(4, 2 + dy, B); p.px(11, 2 + dy, B);
    p.rect(6, 3 + dy, 4, 2, '#0c0a14');        // 帽内漆黑
    p.px(6, 4 + dy, '#5ee8ff'); p.px(9, 4 + dy, '#5ee8ff'); // 幽蓝眼
    p.rect(5, 5 + dy, 6, 4, B);                // 袍身
    p.vline(5, 5 + dy, 8 + dy, BH);
    p.rect(6, 9 + dy, 4, 2, B);                // 收窄
    p.px(3, 6 + dy, '#8a84a8'); p.px(12, 7 + dy, '#8a84a8'); // 爪手
    p.px(4, 6 + dy, B); p.px(11, 7 + dy, B);
    if (f === 0) { // 飘散的裾尾
      p.px(6, 11, B); p.px(8, 11, B); p.px(9, 12, FA); p.px(6, 12, FA); p.px(7, 13, FA);
    } else {
      p.px(7, 11, B); p.px(9, 11, B); p.px(6, 12, FA); p.px(8, 13, FA); p.px(10, 12, FA);
    }
    p.outline('rgba(19,16,32,0.85)');
    return p;
  }));

  // ---------- Boss(32×32,2 帧) ----------
  def('boss_slimeking', two(function (f) {
    var p = new Pix(32, 32), G = '#3aa832', GH = '#74d95e', GL = '#1f6e24';
    var sq = f;                                 // 帧2压扁
    p.ell(16, 20 + sq, 12 + sq * 2, 9 - sq, G);
    p.rect(4 - sq * 2, 24, 24 + sq * 4, 4, G);
    p.hline(3 - sq * 2, 28 + sq * 2, 27, GL);
    p.hline(4 - sq * 2, 27 + sq * 2, 28, GL);
    p.ell(10, 15 + sq, 3, 2, GH);               // 大高光
    p.px(7, 13 + sq, GH);
    p.disc(11, 19 + sq, 2, '#eef8ee');          // 双眼
    p.disc(21, 19 + sq, 2, '#eef8ee');
    var pdx = f === 0 ? 0 : 1;
    p.px(11 + pdx, 19 + sq, '#12240f'); p.px(21 + pdx, 19 + sq, '#12240f'); // 瞳孔游移
    p.hline(13, 19, 24 + sq, '#12240f');        // 阔嘴
    p.px(12, 23 + sq, '#12240f'); p.px(20, 23 + sq, '#12240f');
    p.px(14, 25 + sq, '#eef8ee'); p.px(17, 25 + sq, '#eef8ee'); // 牙
    p.px(26, 22 + sq, GH); p.px(25, 25, GH);    // 泡
    p.px(6, 29, G); p.px(24, 29, G);            // 滴落
    var cy = 6 + sq * 2;                        // 金冠
    p.rect(11, cy + 2, 10, 3, GOLD);
    p.hline(11, 20, cy + 4, GOLD_D);
    p.px(11, cy, GOLD); p.px(12, cy + 1, GOLD);
    p.px(15, cy - 1, GOLD); p.px(16, cy - 1, GOLD_L); p.px(15, cy, GOLD); p.px(16, cy, GOLD);
    p.px(20, cy, GOLD); p.px(19, cy + 1, GOLD);
    p.px(13, cy + 3, '#e04848'); p.px(16, cy + 3, '#3a63e8'); p.px(19, cy + 3, '#e04848'); // 冠珠
    p.outline(OUT);
    return p;
  }));

  def('boss_bonelord', two(function (f) {
    var p = new Pix(32, 32), dy = f, R = '#2c2438', RH = '#413a55', RL = '#1b1626';
    p.rect(8, 12 + dy, 16, 12 - dy, R);         // 巨袍
    p.vline(8, 12 + dy, 23, RH); p.vline(23, 12 + dy, 23, RL);
    p.rect(6, 24, 20, 4, R);                    // 裾摆
    p.px(6, 28, RL); p.px(10, 28, R); p.px(15, 29, RL); p.px(21, 28, R); p.px(25, 28, RL); // 破烂下摆
    p.rect(6, 12 + dy, 4, 3, BONE_D);           // 骨肩甲
    p.rect(22, 12 + dy, 4, 3, BONE_D);
    p.px(6, 11 + dy, BONE); p.px(25, 11 + dy, BONE);
    p.hline(13, 18, 16 + dy, BONE);             // 胸前肋骨
    p.hline(13, 18, 18 + dy, BONE);
    p.hline(14, 17, 20 + dy, BONE_D);
    p.rect(11, 3 + dy, 10, 7, BONE);            // 巨颅
    p.px(11, 3 + dy, null); p.px(20, 3 + dy, null);
    p.vline(11, 4 + dy, 9 + dy, '#f4f0e8');
    p.rect(12, 10 + dy, 8, 2, BONE_D);          // 颌
    p.px(13, 10 + dy, BONE); p.px(15, 10 + dy, BONE); p.px(17, 10 + dy, BONE); p.px(19, 10 + dy, BONE);
    p.rect(13, 5 + dy, 2, 2, '#0c0a14');        // 眼窝
    p.rect(17, 5 + dy, 2, 2, '#0c0a14');
    p.px(13, 5 + dy, '#b44aff'); p.px(18, 5 + dy, '#b44aff'); // 紫瞳
    p.px(15, 8 + dy, '#0c0a14'); p.px(16, 8 + dy, '#0c0a14'); // 鼻腔
    p.hline(10, 21, 2 + dy, '#3d3548');         // 铁冠
    p.px(10, 1 + dy, '#3d3548'); p.px(15, 0 + dy, '#4c445c'); p.px(16, 0 + dy, '#4c445c'); p.px(21, 1 + dy, '#3d3548');
    p.vline(27, 8 + dy, 26, '#6b4a2f');         // 法杖
    p.px(26, 14 + dy, BONE_D);                  // 持杖骨手
    var ob = f === 0 ? '#b44aff' : '#d98aff';
    p.disc(27, 5 + dy, 2, ob);                  // 杖顶魔球(脉动)
    p.px(27, 4 + dy, '#ecc6ff');
    p.px(25, 5 + dy, 'rgba(180,74,255,0.45)'); p.px(29, 5 + dy, 'rgba(180,74,255,0.45)');
    p.outline(OUT);
    return p;
  }));

  def('boss_abysseye', two(function (f) {
    var p = new Pix(32, 32), T = '#3a2a55', TH = '#54407a';
    var wob = f === 0 ? 0 : 1;
    p.line(4, 24, 1, 28 - wob * 3, T); p.px(1, 27 - wob * 3, TH);   // 触手×6
    p.line(9, 27, 7, 31 - wob, T); p.px(6, 30 - wob, TH);
    p.line(16, 28, 16, 31, T); p.px(15 + wob, 31, TH);
    p.line(22, 27, 25, 31 - wob, T); p.px(26, 30 - wob, TH);
    p.line(27, 24, 30, 28 - wob * 2, T); p.px(30, 27 - wob * 2, TH);
    p.line(3, 18, 0, 20 + wob, T);
    p.line(28, 18, 31, 20 + wob, T);
    p.disc(16, 15, 11, '#d8d4e8');              // 眼球
    p.disc(13, 11, 3, '#f2f0f8');               // 上部高光
    p.line(6, 12, 9, 14, '#c05050'); p.line(26, 11, 23, 13, '#c05050'); // 血丝
    p.line(7, 20, 10, 18, '#c05050'); p.line(25, 20, 22, 18, '#c05050');
    p.line(16, 4, 16, 6, '#c05050');
    p.disc(16, 16, 5.5, '#8a2fd8');             // 紫虹膜
    p.disc(16, 16, 4, '#5a1a9a');
    var pw = f === 0 ? 1 : 0;                   // 竖裂瞳(帧2收缩)
    p.rect(15 - pw, 12, 2 + pw, 9, '#0c0a14');
    p.px(14, 13, '#e8e0ff');                    // 瞳側反光
    p.hline(8, 24, 4, '#2a2040');               // 眉脊
    p.hline(6, 26, 5, '#2a2040');
    p.outline(OUT);
    return p;
  }));

  def('boss_darklord', two(function (f) {
    var p = new Pix(32, 32), dy = f, A = '#26202e', AH = '#3d3450', AL = '#161219';
    var cw = f === 0 ? 0 : 1;
    p.rect(5 - cw, 12 + dy, 4, 14, '#5e1620');  // 血披风(摆动)
    p.vline(4 - cw, 14 + dy, 25, '#400e16');
    p.px(5 - cw, 26, '#400e16'); p.px(7 - cw, 27, '#5e1620');
    p.rect(11, 24, 4, 5, AL); p.rect(17, 24, 4, 5, AL); // 甲腿
    p.hline(11, 14, 29, AH); p.hline(17, 20, 29, AH);   // 铁靴
    p.rect(10, 12 + dy, 12, 12 - dy, A);        // 胸甲
    p.vline(10, 12 + dy, 23, AH); p.vline(21, 12 + dy, 23, AL);
    p.disc(16, 17 + dy, 2, '#8a2fd8');          // 魔纹核心
    p.px(16, 17 + dy, '#d98aff');
    p.rect(7, 11 + dy, 4, 3, AH); p.px(7, 10 + dy, AH); p.px(6, 9 + dy, AL);   // 棘刺肩甲
    p.rect(21, 11 + dy, 4, 3, AH); p.px(24, 10 + dy, AH); p.px(25, 9 + dy, AL);
    p.rect(12, 4 + dy, 8, 7, A);                // 魔盔
    p.vline(12, 4 + dy, 10 + dy, AH);
    p.rect(13, 7 + dy, 6, 2, '#0c0a14');        // 面部黑缝
    var ey = f === 0 ? '#c44aff' : '#e89aff';
    p.px(14, 7 + dy, ey); p.px(17, 7 + dy, ey); // 紫瞳(闪烁)
    p.line(12, 4 + dy, 9, 1 + dy, AH); p.px(8, 0 + dy, '#4c445c'); p.px(9, 0 + dy, AH); // 左巨角
    p.px(10, 2 + dy, A);
    p.line(19, 4 + dy, 22, 1 + dy, AH); p.px(23, 0 + dy, '#4c445c'); p.px(22, 0 + dy, AH); // 右巨角
    p.px(21, 2 + dy, A);
    p.vline(26, 6 + dy, 24, '#3d3450');         // 魔剑
    p.vline(27, 7 + dy, 23, '#1b1626');
    p.px(26, 5 + dy, '#c44aff');                // 剑尖泛紫
    p.hline(24, 29, 22 + dy, AL);               // 护手
    p.px(26, 12 + dy, '#8a2fd8'); p.px(26, 17 + dy, '#8a2fd8'); // 剑刃魔纹
    p.outline(OUT);
    return p;
  }));

  // ---------- 弹体 ----------
  function crescent(p, cx, cy, r, cOuter, cMid, cIn) {
    p.disc(cx, cy, r, cOuter);
    p.disc(cx, cy, r - 1.4, cMid);
    p.disc(cx, cy, r - 2.8, cIn);
    p.eraseDisc(cx - Math.round(r * 0.55), cy, r - 0.6);
  }
  def('p_slash', one(function () {
    var p = new Pix(16, 16);
    crescent(p, 7, 8, 6.6, '#f4feff', '#9fe8ff', '#4ab8e8');
    p.outline('#123a58');
    return p;
  }));
  def('p_slash_big', one(function () {
    var p = new Pix(24, 24);
    crescent(p, 11, 12, 10.2, '#fff6d8', GOLD_L, GOLD);
    p.px(19, 6, '#fff6d8'); p.px(21, 12, '#fff6d8'); // 刃光
    p.outline('#6b4a10');
    return p;
  }));
  def('p_bolt', one(function () {
    var p = new Pix(8, 8);
    p.disc(4, 4, 2.6, '#8a4ad8');
    p.disc(4, 4, 1.2, '#c99aff');
    p.px(3, 3, '#f0e2ff');
    p.outline('#2c1050');
    return p;
  }));
  def('p_arrow', one(function () {
    var p = new Pix(16, 8);
    p.hline(1, 10, 3, '#8a6238');
    p.hline(2, 10, 4, '#6b4a2f');
    p.px(11, 3, '#c8ccd8'); p.px(12, 3, '#c8ccd8'); p.px(13, 3, '#eef2f8'); // 箭镞
    p.px(11, 2, '#c8ccd8'); p.px(11, 4, '#8a90a4'); p.px(12, 4, '#8a90a4');
    p.px(1, 2, '#5cc45e'); p.px(2, 2, '#5cc45e'); p.px(1, 5, '#3f8d3a'); p.px(2, 5, '#3f8d3a'); // 羽
    p.px(0, 3, '#5cc45e');
    p.outline(OUT);
    return p;
  }));
  // 绿龙:进化箭矢的贯穿弹丸,横向扁平龙形
  def('p_dragon', one(function () {
    var p = new Pix(32, 14);
    var G1 = '#44ff88', G2 = '#22cc66', G3 = '#116644', G4 = '#00ff55', OUT2 = '#003322';
    // 龙身:渐变绿色
    p.hline(4, 24, 7, G2);  p.hline(4, 24, 6, G2);
    p.hline(3, 25, 8, G3);  p.hline(3, 25, 5, G3);
    p.hline(6, 22, 9, G3);  p.hline(6, 22, 4, G3);
    // 龙头(右侧)
    p.rect(25, 4, 6, 6, G1);
    p.px(30, 5, G4); p.px(31, 5, G4); p.px(30, 7, G4); p.px(31, 7, G4);  // 口
    p.px(27, 4, '#ffffff'); p.px(28, 4, '#aaffcc'); // 眼
    // 龙脊
    for (var i = 8; i < 24; i += 4) {
      p.px(i, 3, G4); p.px(i + 1, 2, G1); p.px(i + 2, 3, G4);
      p.px(i, 10, G4); p.px(i + 1, 11, G1); p.px(i + 2, 10, G4);
    }
    // 龙尾
    p.px(3, 7, G2); p.px(2, 7, G3); p.px(1, 6, G3); p.px(0, 5, G1);
    p.px(1, 8, G3); p.px(0, 9, G1);
    p.outline(OUT2);
    return p;
  }));
  def('p_axe', one(function () {
    var p = new Pix(16, 16);
    p.line(4, 13, 10, 7, '#6b4a2f');
    p.line(5, 13, 11, 7, '#54381f');
    p.rect(8, 2, 5, 5, '#c8ccd8');              // 斧刃
    p.px(8, 2, null); p.px(8, 6, null);
    p.vline(12, 2, 6, '#eef2f8');               // 锋口
    p.px(13, 3, '#eef2f8'); p.px(13, 5, '#eef2f8');
    p.vline(9, 2, 6, '#8a90a4');
    p.px(10, 1, '#c8ccd8'); p.px(11, 1, '#c8ccd8');
    p.px(10, 7, '#8a90a4');
    p.outline(OUT);
    return p;
  }));
  def('p_dagger', one(function () {
    var p = new Pix(12, 6);
    p.hline(1, 7, 2, '#cfd6e6');
    p.hline(2, 7, 3, '#8a90a4');
    p.px(0, 2, '#eef2f8'); p.px(1, 3, '#cfd6e6');
    p.vline(8, 1, 4, GOLD_D);                   // 护手
    p.rect(9, 2, 2, 2, '#4a3550');              // 柄
    p.px(11, 2, GOLD);
    p.outline(OUT);
    return p;
  }));
  def('p_orbitblade', one(function () {
    var p = new Pix(16, 16);
    p.px(7, 0, '#eef2f8'); p.px(8, 0, '#9aa4bc');
    p.vline(7, 1, 9, '#e8ecf4');
    p.vline(8, 1, 9, '#9aa4bc');
    p.px(7, 5, '#5ee8ff');                      // 符文闪光
    p.hline(5, 10, 10, GOLD);                   // 护手
    p.rect(7, 11, 2, 3, '#5a3a20');
    p.px(7, 14, GOLD); p.px(8, 14, GOLD_D);
    p.outline(OUT);
    return p;
  }));
  def('p_book', one(function () {
    var p = new Pix(16, 16);
    p.rect(2, 5, 5, 7, '#f4f0e4');              // 左页
    p.rect(9, 5, 5, 7, '#f4f0e4');              // 右页
    p.px(2, 5, null); p.px(13, 5, null);
    p.rect(7, 4, 2, 9, '#c8a24e');              // 书脊
    p.hline(2, 6, 12, '#8a6238'); p.hline(9, 13, 12, '#8a6238'); // 封底
    p.hline(3, 5, 7, '#b8b2a4'); p.hline(3, 5, 9, '#b8b2a4');    // 行文
    p.px(11, 7, GOLD); p.px(10, 8, GOLD); p.px(11, 8, GOLD_L); p.px(12, 8, GOLD); p.px(11, 9, GOLD); // 金十字
    p.outline(OUT);
    return p;
  }));
  def('p_fireflask', one(function () {
    var p = new Pix(12, 12);
    p.disc(6, 7, 3.4, '#3f7c62');               // 玻璃瓶
    p.rect(3, 7, 7, 3, '#ff7a2e');              // 火油
    p.px(3, 7, '#3f7c62'); p.px(9, 7, '#3f7c62');
    p.px(4, 8, '#ffb23a');
    p.rect(5, 2, 2, 3, '#3f7c62');              // 瓶颈
    p.rect(5, 1, 2, 1, '#8a6238');              // 木塞
    p.px(7, 1, '#e8e4d8');                      // 布条
    p.px(8, 0, '#ffd84a');                      // 火星
    p.px(4, 5, '#bfe8d8');                      // 玻璃高光
    p.outline(OUT);
    return p;
  }));
  def('p_firepool', two(function (f) {
    var p = new Pix(32, 32);
    p.ell(16, 20, 13, 8, 'rgba(150,40,8,0.85)');
    p.ell(16, 20, 10, 6, '#d1491a');
    p.ell(14, 19, 6, 4, '#f07a22');
    p.ell(13, 19, 3, 2, '#ffc23a');
    var i, fx;
    var fl0 = [5, 9, 14, 19, 24, 27];
    for (i = 0; i < fl0.length; i++) {
      fx = fl0[i] + (f === 0 ? 0 : 1);
      p.px(fx, 15 - (i % 3) - f, '#f07a22');
      p.px(fx, 14 - (i % 3) - f, i % 2 === 0 ? '#ffc23a' : '#ffe95a');
      if (i % 2 === f) p.px(fx, 12 - (i % 3), '#ffe95a');
    }
    p.px(8, 23, '#ffc23a'); p.px(22 + f, 22, '#ffe95a');
    p.outline('rgba(80,16,4,0.8)');
    return p;
  }));
  def('p_spark', one(function () {
    var p = new Pix(8, 8);
    p.rect(3, 3, 2, 2, '#ffffff');
    p.vline(3, 0, 2, '#ffe95a'); p.vline(4, 5, 7, '#ffe95a');
    p.hline(0, 2, 4, '#ffe95a'); p.hline(5, 7, 3, '#ffe95a');
    p.px(1, 1, '#ffd84a'); p.px(6, 6, '#ffd84a');
    return p;
  }));
  def('p_shadow', one(function () {
    var p = new Pix(10, 10);
    p.disc(5, 5, 3.6, '#3a2455');
    p.disc(5, 5, 1.8, '#14091f');
    p.px(3, 2, '#b03ae0'); p.px(2, 4, '#b03ae0'); p.px(7, 7, '#8a2fb0'); // 魔焰边
    p.px(3, 3, '#7a4ab0');
    p.outline('#0c0614');
    return p;
  }));
  def('p_turret', two(function (f) {
    var p = new Pix(16, 16);
    p.rect(4, 12, 8, 3, '#3a3a4c');             // 基座
    p.hline(4, 11, 12, '#4c4c60');
    p.px(5, 13, '#22222e'); p.px(10, 13, '#22222e'); // 铆钉
    p.rect(6, 6, 4, 6, '#5e5e70');              // 塔身
    p.vline(6, 6, 11, '#7a7a8c');
    p.hline(6, 9, 7, '#c87a3a'); p.hline(6, 9, 9, '#c87a3a'); p.hline(6, 9, 11, '#a05e28'); // 铜线圈
    if (f === 0) {
      p.disc(8, 3, 2, '#39b8d8'); p.px(8, 3, '#7ae0f0');
    } else {
      p.disc(8, 3, 2.4, '#7ae8ff'); p.px(8, 3, '#e8fcff');
      p.px(4, 2, '#aef7ff'); p.px(12, 3, '#aef7ff'); p.px(11, 0, '#7ae8ff'); // 电弧
    }
    p.outline(OUT);
    return p;
  }));
  def('tesla_tower', one(function () {
    var p = new Pix(32, 64);
    var COPPER = '#b06a34', COPPER_H = '#d8934f', COPPER_D = '#6f3d1c';
    p.rect(5, 56, 22, 7, COPPER_D);             // 基座
    p.hline(5, 26, 56, COPPER_H);
    p.vline(8, 12, 56, COPPER); p.vline(23, 12, 56, COPPER); // 两侧立柱
    p.vline(16, 12, 56, COPPER_D);
    for (var y = 20; y <= 48; y += 14) {
      p.hline(8, 23, y, COPPER);
      p.px(8, y, COPPER_H); p.px(23, y, COPPER_H);
    }
    p.line(9, 20, 15, 34, COPPER); p.line(23, 20, 17, 34, COPPER);
    p.line(9, 48, 15, 34, COPPER); p.line(23, 48, 17, 34, COPPER);
    p.disc(16, 9, 5, '#3f8fb0');                // 顶部电球
    p.disc(16, 9, 3.2, '#6fd8f0');
    p.disc(16, 9, 1.5, '#e8fdff');
    p.line(16, 2, 10, 0, '#7ae8ff');
    p.line(16, 4, 23, 1, '#aef7ff');
    p.line(16, 3, 18, 0, '#ffffff');
    p.outline(OUT);
    return p;
  }));
  def('p_enemy_bolt', one(function () {
    var p = new Pix(8, 8);
    p.disc(4, 4, 2.6, '#c42030');
    p.disc(4, 4, 1.2, '#ff7a5a');
    p.px(3, 3, '#ffd0b0');
    p.outline('#3a0a10');
    return p;
  }));
  def('p_holy', one(function () {
    var p = new Pix(12, 12);
    p.disc(6, 6, 3.4, GOLD_L);
    p.disc(6, 6, 1.8, '#fffcf0');
    p.vline(6, 0, 1, GOLD); p.vline(6, 10, 11, GOLD);
    p.hline(0, 1, 6, GOLD); p.hline(10, 11, 6, GOLD);
    p.outline('#8a6a20');
    return p;
  }));
  // 蛛网弹:白色黏丝团,与红色普通弹幕明确区分
  def('p_web', one(function () {
    var p = new Pix(12, 12);
    var W = '#f4f6ff', W2 = '#c8cee6', W3 = '#9aa2c0';
    // 放射蛛丝
    p.line(6, 1, 6, 10, W2);
    p.line(1, 6, 10, 6, W2);
    p.line(2, 2, 9, 9, W3);
    p.line(9, 2, 2, 9, W3);
    // 内圈网格
    p.disc(6, 6, 2.2, W);
    p.px(6, 6, '#ffffff');
    p.px(3, 6, W2); p.px(9, 6, W2);
    p.px(6, 3, W2); p.px(6, 9, W2);
    p.outline('#6a7090');
    return p;
  }));

  // ---------- 拾取物 ----------
  function gem(size, cx, cy, r, hi, mid, lo) {
    var p = new Pix(size, size);
    for (var dy = -r; dy <= r; dy++) {
      var half = r - Math.abs(dy);
      p.hline(cx - half, cx + half, cy + dy, dy <= 0 ? mid : lo);
    }
    p.hline(cx - (r - 1), cx - 1, cy - 1, hi);
    p.px(cx - 1, cy - r + 1, '#ffffff');
    p.px(cx, cy + 1, lo);
    p.outline(OUT);
    return p;
  }
  def('gem1', one(function () { return gem(16, 8, 8, 3, '#9ad0ff', '#4aa8ff', '#1d5cc4'); }));
  def('gem2', one(function () { return gem(16, 8, 8, 4, '#a0f0a0', '#44c454', '#1f7a30'); }));
  def('gem3', one(function () { return gem(16, 8, 8, 5, '#ff9a9a', '#e8434a', '#961a2a'); }));
  def('gem_big', one(function () {
    var p = gem(16, 7, 8, 5, '#d8a8ff', '#9a4ae0', '#5c1f96');
    var s = gem(16, 8, 8, 2, '#e8ccff', '#b478ec', '#7a3ab8');
    p.blit(s, 4, -2);
    p.outline(OUT);
    return p;
  }));
  def('coin', two(function (f) {
    var p = new Pix(16, 16);
    if (f === 0) {
      p.disc(8, 8, 4.4, GOLD);
      p.disc(8, 8, 4.4, GOLD); p.px(5, 5, GOLD_L); p.px(6, 5, GOLD_L); p.px(5, 6, GOLD_L);
      p.hline(7, 9, 10, GOLD_D); p.vline(10, 7, 9, GOLD_D); p.vline(11, 6, 9, GOLD_D);
      p.rect(7, 6, 2, 4, GOLD_L);               // 币纹
    } else {
      p.ell(8, 8, 2, 4, GOLD);
      p.vline(7, 5, 11, GOLD_L);
      p.vline(9, 5, 11, GOLD_D);
    }
    p.outline('#6b4a10');
    return p;
  }));
  def('chest', two(function (f) {
    var p = new Pix(16, 16), WD = '#8a5a2e', WH = '#a8763e', WL = '#5e3a1c';
    if (f === 0) {
      p.rect(2, 7, 12, 7, WD);
      p.rect(2, 5, 12, 3, WH);                  // 盖
      p.hline(2, 13, 4, WH);
      p.vline(4, 4, 13, GOLD_D); p.vline(11, 4, 13, GOLD_D); // 金箍
      p.hline(2, 13, 8, WL);
      p.rect(7, 7, 2, 3, GOLD); p.px(7, 9, GOLD_D); // 锁
    } else {
      p.rect(2, 1, 12, 3, WH);                  // 掀开的盖
      p.hline(2, 13, 0, WH); p.vline(4, 0, 3, GOLD_D); p.vline(11, 0, 3, GOLD_D);
      p.rect(2, 7, 12, 7, WD);
      p.rect(3, 7, 10, 2, '#14101d');           // 内部
      p.px(5, 7, GOLD_L); p.px(8, 8, GOLD); p.px(10, 7, GOLD_L); // 金光
      p.vline(4, 7, 13, GOLD_D); p.vline(11, 7, 13, GOLD_D);
      p.px(7, 5, GOLD_L); p.px(12, 4, '#fff6d8'); // 溢光
    }
    p.outline(OUT);
    return p;
  }));
  // 金库宝箱:地图四角专用,金色外壳 + 顶部红宝石,与普通宝箱区分
  def('vault_chest', two(function (f) {
    var p = new Pix(16, 16), GD = '#c89a2e', GH = '#e8c45e', GL2 = '#8a6a1c';
    p.rect(2, 7, 12, 7, GD);
    p.rect(2, 5, 12, 3, GH);
    p.hline(2, 13, 4, GH);
    p.vline(3, 4, 13, '#f2d98a'); p.vline(12, 4, 13, '#a87f20');
    p.hline(2, 13, 8, GL2);
    p.rect(7, 6, 2, 4, GOLD); p.px(7, 9, GOLD_D);
    // 顶部宝石
    p.px(8, 4 - (f ? 1 : 0), '#ff5a6e'); p.px(7, 4 - (f ? 1 : 0), '#c92a44'); p.px(9, 4 - (f ? 1 : 0), '#c92a44');
    p.outline(OUT);
    return p;
  }));
  def('magnet', one(function () {
    var p = new Pix(16, 16);
    p.rect(4, 3, 3, 9, '#d83a3a');
    p.rect(9, 3, 3, 9, '#3a5ad8');
    p.rect(4, 2, 8, 3, '#d83a3a');
    p.rect(9, 2, 3, 3, '#3a5ad8');
    p.px(5, 3, '#f07a7a'); p.px(6, 2, '#f07a7a');
    p.rect(4, 11, 3, 2, '#d8dce8');             // 银极
    p.rect(9, 11, 3, 2, '#d8dce8');
    p.px(6, 14, '#7ae8ff'); p.px(9, 15, '#7ae8ff'); p.px(3, 14, '#aef7ff'); // 磁性火花
    p.outline(OUT);
    return p;
  }));
  def('bomb', one(function () {
    var p = new Pix(16, 16);
    p.disc(7, 10, 4.2, '#26262e');
    p.px(5, 8, '#4c4c5c'); p.px(6, 7, '#4c4c5c'); p.px(5, 7, '#3a3a48');
    p.rect(6, 5, 3, 1, '#3a3a48');              // 引口
    p.px(9, 4, '#8a6238'); p.px(10, 3, '#8a6238'); // 引线
    p.px(11, 2, '#ffd84a'); p.px(12, 1, '#ffffff'); p.px(12, 3, '#ffb23a'); // 火花
    p.outline(OUT);
    return p;
  }));
  def('meat', one(function () {
    var p = new Pix(16, 16);
    p.ell(6, 9, 4, 3, '#b8542e');
    p.ell(5, 8, 2, 1, '#d8764a');
    p.px(4, 11, '#8a3a1c');
    p.line(10, 7, 12, 5, '#e8e4d8');            // 骨柄
    p.px(13, 4, '#e8e4d8'); p.px(13, 5, '#e8e4d8'); p.px(12, 4, '#f8f6ec'); // 骨节
    p.outline(OUT);
    return p;
  }));
  def('clock', one(function () {
    var p = new Pix(16, 16);
    p.disc(8, 9, 5, GOLD_D);
    p.disc(8, 9, 3.8, '#dceff4');
    p.px(8, 6, '#4a6a8a'); p.px(8, 12, '#4a6a8a'); p.px(5, 9, '#4a6a8a'); p.px(11, 9, '#4a6a8a'); // 刻度
    p.vline(8, 7, 9, '#1a3a5a');                // 时针
    p.px(9, 9, '#1a3a5a'); p.px(10, 10, '#1a3a5a'); // 分针
    p.rect(7, 2, 3, 2, GOLD);                   // 表冠
    p.px(8, 1, GOLD_L);
    p.px(5, 6, '#aef4ff'); p.px(12, 12, '#aef4ff'); // 寒气
    p.outline(OUT);
    return p;
  }));

  // ---------- 图标(16×16:深色圆角底 + 亮主体;进化版金边+星芒) ----------
  function iconTile(evo) {
    var p = new Pix(16, 16);
    p.rect(2, 1, 12, 14, ICON_BG);
    p.rect(1, 2, 14, 12, ICON_BG);
    var rim = evo ? GOLD_D : ICON_RIM;
    p.hline(2, 13, 1, evo ? GOLD : ICON_RIM_HI);
    p.hline(2, 13, 14, rim);
    p.vline(1, 2, 13, rim); p.vline(14, 2, 13, rim);
    p.px(2, 2, rim); p.px(13, 2, rim); p.px(2, 13, rim); p.px(13, 13, rim);
    return p;
  }
  function makeIcon(evo, glyph) {
    var g = new Pix(16, 16);
    glyph(g, evo);
    g.outline('#0c0a14');
    var t = iconTile(evo);
    t.blit(g, 0, 0);
    if (evo) {
      t.px(3, 3, GOLD_L); t.px(12, 3, GOLD_L); t.px(3, 12, GOLD_L); t.px(12, 12, GOLD_L);
      t.px(12, 2, '#ffffff');
    }
    return t;
  }
  function defIcon(name, glyph) { def(name, function () { return [makeIcon(false, glyph)]; }); }
  function defEvoIcon(name, glyph) { def(name, function () { return [makeIcon(true, glyph)]; }); }

  // 武器图形(进化版 evo=true 时替换为金色调)
  function gCrossblade(p, evo) {
    var a = evo ? GOLD_L : '#cfeffc', b = evo ? GOLD : '#5ac8f0';
    p.line(4, 11, 11, 4, a); p.line(5, 11, 11, 5, b);
    p.line(4, 4, 11, 11, a); p.line(4, 5, 10, 11, b);
    p.px(8, 8, '#ffffff');
  }
  function gArcanebolt(p, evo) {
    var a = evo ? GOLD : '#8a4ad8';
    p.disc(9, 7, 2.6, a); p.disc(9, 7, 1.2, evo ? '#fff6d8' : '#c99aff');
    p.px(5, 9, a); p.px(4, 10, evo ? GOLD_D : '#5c2f96'); p.px(3, 11, evo ? GOLD_D : '#5c2f96');
  }
  function gWindbow(p, evo) {
    var w = evo ? GOLD : '#8a6238';
    p.px(9, 3, w); p.px(10, 4, w); p.vline(11, 5, 10, w); p.px(10, 11, w); p.px(9, 12, w);
    p.vline(9, 4, 11, evo ? GOLD_L : '#d8d2c0');
    p.hline(3, 8, 7, evo ? '#fff6d8' : '#5cc45e'); p.px(2, 7, evo ? GOLD_L : '#8ce46a');
    p.px(4, 6, evo ? GOLD : '#3f8d3a'); p.px(4, 8, evo ? GOLD : '#3f8d3a');
  }
  function gHolyaura(p, evo) {
    p.disc(8, 8, 5, evo ? GOLD_L : GOLD);
    p.eraseDisc(8, 8, 3);
    p.px(8, 8, evo ? '#ffffff' : GOLD_L); p.px(7, 7, evo ? GOLD_L : GOLD);
  }
  function gWhirlaxe(p, evo) {
    var m = evo ? GOLD_L : '#c8ccd8', d = evo ? GOLD : '#8a90a4';
    p.line(4, 12, 9, 7, '#6b4a2f'); p.px(5, 12, '#54381f');
    p.rect(7, 2, 5, 5, m);
    p.px(7, 2, null); p.px(7, 6, null);
    p.vline(11, 2, 6, evo ? '#fff6d8' : '#eef2f8');
    p.vline(8, 3, 6, d);
  }
  function gChainlight(p, evo) {
    var a = evo ? '#fff6d8' : '#ffe95a', b = evo ? GOLD : '#e8b820';
    p.line(9, 2, 6, 7, a); p.line(10, 2, 7, 7, b);
    p.line(6, 7, 9, 8, a);
    p.line(9, 8, 5, 13, a); p.line(10, 8, 6, 13, b);
    p.px(5, 14, '#ffffff');
  }
  function gFrostnova(p, evo) {
    var a = evo ? GOLD_L : '#aef4ff', b = evo ? GOLD : '#4ab8e8';
    p.vline(8, 2, 13, a); p.hline(2, 13, 8, a);
    p.line(4, 4, 12, 12, b); p.line(12, 4, 4, 12, b);
    p.px(8, 2, b); p.px(8, 13, b); p.px(2, 8, b); p.px(13, 8, b);
    p.rect(7, 7, 2, 2, '#ffffff');
  }
  function gFireflask(p, evo) {
    p.disc(8, 9, 3, evo ? GOLD : '#3f7c62');
    p.rect(6, 9, 5, 2, '#ff7a2e'); p.px(7, 10, '#ffb23a');
    p.rect(7, 4, 2, 3, evo ? GOLD : '#3f7c62');
    p.rect(7, 3, 2, 1, '#8a6238');
    p.px(9, 2, '#ffd84a'); p.px(10, 1, evo ? '#ffffff' : '#ffb23a');
  }
  function gShadowdagger(p, evo) {
    var bl = evo ? GOLD_L : '#7a68a8', dk = evo ? GOLD : '#4a3868';
    p.line(3, 12, 9, 6, bl); p.line(4, 12, 9, 7, dk);
    p.px(2, 13, '#ffffff');
    p.line(10, 5, 11, 4, evo ? GOLD_D : '#b03ae0');
    p.px(9, 4, evo ? GOLD_D : '#2c2244'); p.px(11, 6, evo ? GOLD_D : '#2c2244'); // 护手
    p.px(12, 3, evo ? GOLD : '#3a2a55');
  }
  function gOrbitblade(p, evo) {
    var m = evo ? GOLD_L : '#e8ecf4';
    p.vline(8, 3, 9, m); p.px(8, 2, '#ffffff');
    p.hline(6, 10, 10, evo ? GOLD : GOLD_D);
    p.vline(8, 11, 12, '#5a3a20');
    p.px(3, 5, evo ? GOLD : '#5ee8ff'); p.px(13, 6, evo ? GOLD : '#5ee8ff'); p.px(4, 12, evo ? GOLD : '#5ee8ff'); // 环绕点
  }
  function gHolytome(p, evo) {
    p.rect(4, 4, 8, 9, evo ? GOLD_D : '#8a5a2e');
    p.rect(5, 3, 7, 9, evo ? GOLD : '#a8763e');
    p.vline(5, 3, 11, evo ? GOLD_L : '#c8944e');
    p.px(8, 6, GOLD_L); p.hline(7, 9, 7, GOLD_L); p.px(8, 8, GOLD_L); p.px(8, 9, GOLD_L); // 封面十字
  }
  function gTeslacoil(p, evo) {
    p.rect(5, 11, 6, 2, '#3a3a4c');
    p.rect(7, 6, 3, 5, '#5e5e70');
    p.hline(7, 9, 7, '#c87a3a'); p.hline(7, 9, 9, '#c87a3a');
    p.disc(8, 4, 1.6, evo ? GOLD_L : '#7ae8ff');
    p.px(5, 2, evo ? GOLD : '#aef7ff'); p.px(11, 3, evo ? GOLD : '#aef7ff');
    p.px(12, 1, '#ffffff');
  }

  defIcon('w_crossblade', gCrossblade);   defEvoIcon('we_crossjudge', gCrossblade);
  defIcon('w_arcanebolt', gArcanebolt);   defEvoIcon('we_arcanestorm', gArcanebolt);
  defIcon('w_windbow', gWindbow);         defEvoIcon('we_featherstorm', gWindbow);
  defIcon('w_holyaura', gHolyaura);       defEvoIcon('we_sanctuary', gHolyaura);
  defIcon('w_whirlaxe', gWhirlaxe);       defEvoIcon('we_worldender', gWhirlaxe);
  defIcon('w_chainlight', gChainlight);   defEvoIcon('we_thorwrath', gChainlight);
  defIcon('w_frostnova', gFrostnova);     defEvoIcon('we_absolutezero', gFrostnova);
  defIcon('w_fireflask', gFireflask);     defEvoIcon('we_infernosea', gFireflask);
  defIcon('w_shadowdagger', gShadowdagger); defEvoIcon('we_thousandcuts', gShadowdagger);
  defIcon('w_orbitblade', gOrbitblade);   defEvoIcon('we_bladestorm', gOrbitblade);
  defIcon('w_holytome', gHolytome);       defEvoIcon('we_forbidden', gHolytome);
  defIcon('w_teslacoil', gTeslacoil);     defEvoIcon('we_skynet', gTeslacoil);

  // ---------- 被动图标 ----------
  function heartShape(p, cx, cy, hi, mid, lo) {
    p.disc(cx - 2, cy - 1, 1.6, mid);
    p.disc(cx + 2, cy - 1, 1.6, mid);
    p.rect(cx - 3, cy, 7, 2, mid);
    p.hline(cx - 2, cx + 2, cy + 2, lo);
    p.hline(cx - 1, cx + 1, cy + 3, lo);
    p.px(cx, cy + 4, lo);
    p.px(cx - 2, cy - 1, hi); p.px(cx - 3, cy, hi);
  }
  defIcon('ps_power', function (p) {
    p.px(6, 3, GOLD_D); p.px(5, 4, GOLD_D); p.px(10, 3, GOLD_D); p.px(11, 4, GOLD_D); // 链
    for (var dy = -3; dy <= 3; dy++) { var hf = 3 - Math.abs(dy); p.hline(8 - hf, 8 + hf, 9 + dy, dy <= 0 ? '#e8434a' : '#961a2a'); }
    p.px(7, 7, '#ff9a9a'); p.px(6, 8, '#ff9a9a');
  });
  defIcon('ps_core', function (p) {
    p.disc(8, 8, 3.4, '#8a4ad8');
    p.disc(8, 8, 1.4, '#e0ccff');
    p.ell(8, 8, 6, 2, '#5c2f96');               // 环带
    p.ell(8, 8, 4.6, 1, null); p.disc(8, 8, 3.4, '#8a4ad8'); p.disc(8, 8, 1.4, '#e0ccff');
    p.px(6, 6, '#ffffff');
  });
  defIcon('ps_eagle', function (p) {
    p.ell(8, 8, 5, 3, '#f4f0e4');
    p.disc(8, 8, 2, GOLD);
    p.px(8, 8, '#131020'); p.px(7, 7, '#ffffff');
    p.hline(3, 5, 5, '#c8a24e'); p.hline(11, 13, 5, '#c8a24e'); // 眉羽
  });
  defIcon('ps_pendant', function (p) {
    p.px(5, 2, GOLD_D); p.px(4, 3, GOLD_D); p.px(11, 2, GOLD_D); p.px(12, 3, GOLD_D);
    p.px(6, 1, GOLD); p.px(8, 1, GOLD); p.px(10, 1, GOLD);
    heartShape(p, 8, 8, '#ff9a9a', '#e8434a', '#961a2a');
  });
  defIcon('ps_belt', function (p) {
    p.rect(2, 6, 12, 4, '#6b4a2f');
    p.hline(2, 13, 6, '#8a6540'); p.hline(2, 13, 9, '#4a3220');
    p.rect(6, 5, 4, 6, GOLD);
    p.box(6, 5, 4, 6, GOLD_D);
    p.px(7, 7, GOLD_L);
  });
  defIcon('ps_boots', function (p) {
    p.rect(6, 3, 3, 7, '#2a8f9d');
    p.rect(6, 9, 6, 3, '#2a8f9d');
    p.vline(6, 3, 11, '#59c4cf');
    p.hline(6, 11, 12, '#1a5f6d');
    p.px(4, 4, '#e8fcff'); p.px(3, 5, '#aef7ff'); p.px(4, 6, '#aef7ff'); // 翼
    p.px(11, 9, '#59c4cf');
  });
  defIcon('ps_magnetstone', function (p) {
    p.rect(5, 5, 6, 7, '#4a5a78');
    p.px(4, 6, '#4a5a78'); p.px(11, 7, '#4a5a78'); p.px(5, 4, '#66789a'); p.px(8, 3, '#66789a');
    p.vline(5, 5, 11, '#66789a'); p.vline(10, 6, 11, '#2f3c54');
    p.px(8, 7, '#aef7ff'); p.px(7, 9, '#7ae8ff');
    p.px(3, 3, '#7ae8ff'); p.px(13, 5, '#7ae8ff'); p.px(12, 12, '#aef7ff'); // 磁吸粒子
  });
  defIcon('ps_clover', function (p) {
    var G = '#44c454', GD = '#1f7a30', GH = '#a0f0a0';
    p.disc(6, 6, 1.8, G); p.disc(10, 6, 1.8, G);
    p.disc(6, 10, 1.8, G); p.disc(10, 10, 1.8, GD);
    p.px(8, 8, GD);
    p.px(5, 5, GH);
    p.line(11, 11, 12, 13, GD);
  });

  // ---------- 杂项图标 ----------
  defIcon('icon_gold', function (p) {
    p.disc(7, 7, 3.6, GOLD);
    p.px(5, 5, GOLD_L); p.px(6, 5, GOLD_L);
    p.rect(6, 6, 2, 3, GOLD_L);
    p.disc(10, 10, 2.6, GOLD_D);
    p.disc(10, 10, 2, GOLD);
    p.px(9, 9, GOLD_L);
  });
  defIcon('icon_hp', function (p) { heartShape(p, 8, 7, '#ff9a9a', '#e8434a', '#961a2a'); });
  defIcon('icon_dmg', function (p) {
    p.line(4, 12, 11, 5, '#e8ecf4'); p.px(12, 4, '#ffffff');
    p.line(12, 12, 5, 5, '#9aa4bc'); p.px(4, 4, '#c8ccd8');
    p.px(4, 11, GOLD_D); p.px(3, 12, GOLD); p.px(11, 11, GOLD_D); p.px(12, 12, GOLD); // 柄
  });
  defIcon('icon_armor', function (p) {
    p.rect(4, 3, 8, 6, '#7a90b8');
    p.rect(5, 9, 6, 2, '#7a90b8');
    p.rect(6, 11, 4, 1, '#586c94'); p.rect(7, 12, 2, 1, '#586c94');
    p.vline(4, 3, 8, '#a8bcd8'); p.hline(4, 11, 3, '#a8bcd8');
    p.vline(11, 3, 8, '#4a5a78');
    p.px(7, 5, GOLD); p.px(8, 5, GOLD); p.px(7, 6, GOLD_D); p.px(8, 6, GOLD_D); // 纹章
  });
  defIcon('icon_speed', function (p) {
    var c = '#7ae8ff', d = '#39b8d8';
    p.line(3, 5, 5, 7, c); p.line(3, 9, 5, 7, d);
    p.line(7, 5, 9, 7, c); p.line(7, 9, 9, 7, d);
    p.line(11, 5, 13, 7, '#ffffff'); p.line(11, 9, 13, 7, c);
  });
  defIcon('icon_magnet', function (p) {
    p.rect(5, 3, 2, 7, '#d83a3a'); p.rect(9, 3, 2, 7, '#3a5ad8');
    p.rect(5, 3, 6, 2, '#d83a3a'); p.rect(9, 3, 2, 2, '#3a5ad8');
    p.px(5, 3, '#f07a7a');
    p.rect(5, 10, 2, 2, '#d8dce8'); p.rect(9, 10, 2, 2, '#d8dce8');
    p.px(7, 13, '#7ae8ff'); p.px(10, 14, '#aef7ff');
  });
  defIcon('icon_luck', function (p) {
    var G = '#44c454', GD = '#1f7a30';
    p.disc(7, 6, 1.6, G); p.disc(10, 7, 1.6, G); p.disc(7, 9, 1.6, GD);
    p.px(8, 8, GD); p.px(6, 5, '#a0f0a0');
    p.line(10, 10, 11, 12, GD);
    p.px(12, 3, GOLD_L); p.px(3, 10, GOLD_L);   // 幸运星
  });
  defIcon('icon_revive', function (p) {
    p.line(5, 12, 10, 4, '#f07a22');            // 凤羽
    p.line(6, 12, 10, 6, '#ffb23a');
    p.px(10, 3, '#ffe95a'); p.px(11, 3, '#ffd84a');
    p.px(7, 8, '#ffe95a'); p.px(6, 10, '#ffc23a');
    p.px(4, 13, '#d1491a');
    p.px(12, 5, '#ffffff');
  });
  defIcon('icon_reroll', function (p) {
    p.rect(4, 4, 8, 8, '#f4f0e4');
    p.px(4, 4, '#d8d2c0'); p.px(11, 4, '#d8d2c0'); p.px(4, 11, '#d8d2c0'); p.px(11, 11, '#d8d2c0');
    p.vline(11, 5, 10, '#b8b2a4'); p.hline(5, 10, 11, '#b8b2a4');
    p.px(6, 6, '#131020'); p.px(9, 9, '#131020'); p.px(9, 6, '#131020'); p.px(6, 9, '#131020'); p.px(8, 8, '#131020');
  });
  defIcon('icon_banish', function (p) {
    p.disc(8, 8, 5, '#e8434a');
    p.eraseDisc(8, 8, 3.4);
    p.line(4, 12, 12, 4, '#e8434a'); p.line(5, 12, 12, 5, '#961a2a');
    p.px(4, 4, '#3a2a55'); p.px(11, 11, '#3a2a55'); // 被放逐的残影
  });
  defIcon('icon_cd', function (p) {
    p.hline(5, 11, 3, GOLD_D); p.hline(5, 11, 12, GOLD_D);
    p.vline(5, 4, 5, GOLD); p.vline(11, 4, 5, GOLD);
    p.vline(5, 10, 11, GOLD); p.vline(11, 10, 11, GOLD);
    p.rect(6, 4, 5, 2, '#f4e0b0');              // 上砂
    p.px(8, 6, '#e8c880'); p.px(8, 7, '#e8c880');
    p.px(7, 9, GOLD); p.px(8, 9, GOLD_L);       // 下堆
    p.rect(7, 10, 3, 2, GOLD);
  });
  defIcon('icon_area', function (p) {
    p.disc(8, 8, 5.4, '#39b8d8'); p.eraseDisc(8, 8, 4.2);
    p.disc(8, 8, 2.4, '#7ae8ff'); p.eraseDisc(8, 8, 1.2);
    p.px(8, 8, '#ffffff');
    p.px(13, 3, '#aef7ff'); p.px(3, 13, '#aef7ff');
  });
  defIcon('icon_growth', function (p) {
    p.vline(8, 7, 12, '#3f8d3a');
    p.disc(5, 6, 1.8, '#44c454'); p.px(6, 7, '#3f8d3a');   // 左叶
    p.disc(11, 5, 1.8, '#8ce46a'); p.px(10, 6, '#44c454'); // 右叶
    p.hline(5, 11, 13, '#54381f');              // 土
    p.px(4, 14, '#54381f'); p.px(12, 14, '#54381f');
  });
  defIcon('icon_kill', function (p) {
    p.rect(5, 4, 6, 5, BONE);
    p.px(5, 4, null); p.px(10, 4, null);
    p.rect(6, 9, 4, 2, BONE_D);
    p.px(6, 6, '#131020'); p.px(9, 6, '#131020');
    p.px(6, 6, '#c03a3a'); p.px(9, 6, '#c03a3a'); // 凶光
    p.px(8, 8, '#131020');
    p.px(6, 10, '#131020'); p.px(8, 10, '#131020');
  });
  defIcon('icon_time', function (p) {
    p.disc(8, 8, 5, GOLD_D);
    p.disc(8, 8, 4, '#eef4f8');
    p.px(8, 5, '#4a6a8a'); p.px(8, 11, '#4a6a8a'); p.px(5, 8, '#4a6a8a'); p.px(11, 8, '#4a6a8a');
    p.vline(8, 6, 8, '#1a3a5a');
    p.px(9, 9, '#1a3a5a'); p.px(10, 10, '#1a3a5a');
  });
  def('elite_crown', one(function () {           // 透明底,叠加在精英头上
    var p = new Pix(16, 16);
    p.rect(4, 8, 8, 2, GOLD);
    p.hline(4, 11, 10, GOLD_D);
    p.px(4, 6, GOLD); p.px(4, 7, GOLD);
    p.px(7, 5, GOLD); p.px(8, 5, GOLD_L); p.px(7, 6, GOLD); p.px(8, 6, GOLD); p.px(7, 7, GOLD); p.px(8, 7, GOLD);
    p.px(11, 6, GOLD); p.px(11, 7, GOLD);
    p.px(5, 8, GOLD_L);
    p.px(6, 9, '#e04848'); p.px(9, 9, '#3a63e8'); // 冠珠
    p.outline(OUT);
    return p;
  }));

  // ---------- 地图装饰 ----------
  def('deco_grave', one(function () {
    var p = new Pix(16, 16), ST = '#6e6a80', SH = '#8b87a0', SL = '#4c4860';
    p.disc(8, 6, 4, ST);
    p.rect(4, 6, 9, 7, ST);
    p.vline(4, 5, 12, SH); p.px(5, 3, SH);
    p.vline(12, 6, 12, SL); p.hline(5, 12, 12, SL);
    p.vline(8, 5, 8, SL); p.hline(7, 9, 6, SL);  // 刻痕十字
    p.px(6, 10, SL); p.px(10, 9, SL);            // 风化
    p.px(5, 12, '#2e5b33'); p.px(11, 12, '#2e5b33'); // 苔
    p.hline(3, 13, 13, '#2e5b33');               // 草基
    p.px(2, 13, '#3f7d3a'); p.px(14, 13, '#3f7d3a');
    p.outline(OUT);
    return p;
  }));
  def('deco_deadtree', one(function () {
    var p = new Pix(16, 24), T = '#3d3348', TH = '#554a68';
    p.rect(7, 10, 2, 13, T);
    p.vline(7, 10, 22, TH);
    p.px(5, 22, T); p.px(6, 22, T); p.px(10, 22, T); p.px(11, 23, T); // 根
    p.line(7, 11, 3, 6, T); p.line(3, 6, 1, 5, TH); p.px(4, 3, T); p.line(4, 6, 4, 4, T); // 左枝
    p.line(9, 9, 12, 4, T); p.line(12, 4, 14, 3, TH); p.px(11, 1, T); p.line(12, 4, 11, 2, T); // 右枝
    p.px(8, 8, T); p.px(8, 7, TH); p.px(8, 6, T);  // 枯梢
    p.px(6, 14, '#2a2438');                       // 树洞
    p.outline(OUT);
    return p;
  }));
  def('deco_bone', one(function () {
    var p = new Pix(16, 16);
    p.line(4, 12, 11, 8, BONE_D);
    p.px(3, 11, BONE); p.px(3, 13, BONE); p.px(12, 7, BONE); p.px(12, 9, BONE); // 骨节
    p.line(9, 13, 13, 12, BONE_D); p.px(8, 13, BONE); p.px(14, 11, BONE);
    p.rect(4, 3, 4, 3, BONE);                     // 半埋的头骨
    p.px(4, 3, null);
    p.px(5, 4, '#131020'); p.px(7, 4, '#131020');
    p.px(5, 6, BONE_D); p.px(7, 6, BONE_D);
    p.outline(OUT);
    return p;
  }));
  def('deco_fence', one(function () {
    var p = new Pix(16, 16), IR = '#4a4560', IH = '#5e5878';
    p.vline(3, 3, 14, IR); p.vline(8, 3, 14, IR); p.vline(13, 3, 14, IR);
    p.px(3, 2, IH); p.px(8, 2, IH); p.px(13, 2, IH);   // 矛尖
    p.px(3, 4, IH); p.px(8, 4, IH);
    p.hline(1, 15, 6, IR); p.hline(1, 15, 11, IR);
    p.px(1, 6, IH); p.px(15, 11, '#3a3550');
    p.px(8, 9, '#6e4a2a');                        // 锈
    p.outline(OUT);
    return p;
  }));
  def('deco_skullpost', one(function () {
    var p = new Pix(16, 24), W = '#4a3b30', WH = '#63503f';
    p.rect(7, 8, 2, 15, W);
    p.vline(7, 8, 22, WH);
    p.px(6, 21, W); p.px(10, 22, W);
    p.rect(5, 2, 6, 4, BONE);                     // 头骨
    p.px(5, 2, null); p.px(10, 2, null);
    p.rect(6, 6, 4, 1, BONE_D);
    p.px(6, 4, '#131020'); p.px(9, 4, '#131020');
    p.px(6, 4, '#ffd84a');                        // 邪光
    p.px(4, 7, '#6e5a3a'); p.px(11, 7, '#6e5a3a'); // 绳结
    p.hline(6, 10, 7, '#6e5a3a');
    p.outline(OUT);
    return p;
  }));
  def('deco_tree2', one(function () {
    var p = new Pix(16, 24), T = '#4a3320', C = '#5e2320', CH = '#7a2f28', CL = '#3d1512';
    p.rect(7, 13, 2, 10, T);
    p.vline(7, 13, 22, '#63452c');
    p.px(5, 22, T); p.px(11, 22, T);
    p.line(7, 14, 4, 11, T); p.line(9, 13, 12, 11, T);
    p.disc(8, 7, 5, C);                           // 血色树冠
    p.disc(5, 6, 2.6, CH); p.disc(11, 5, 2, CH);
    p.px(4, 4, '#96453a'); p.px(9, 3, '#96453a');
    p.hline(5, 11, 11, CL); p.px(12, 9, CL);
    p.outline(OUT);
    return p;
  }));
  def('deco_rock', one(function () {
    var p = new Pix(16, 16), R = '#5a4a38', RH = '#77644c', RL = '#3d3225';
    p.disc(8, 10, 5, R);
    p.rect(3, 10, 11, 4, R);
    p.disc(6, 8, 2.6, RH); p.px(4, 6, RH);
    p.hline(3, 13, 13, RL); p.hline(4, 12, 12, RL);
    p.line(9, 7, 11, 10, RL);                     // 裂缝
    p.px(12, 8, RH);
    for (var i = 0; i < 5; i++) p.px(ri(4, 12), ri(8, 12), rnd() < 0.5 ? RL : RH); // 种子噪点
    p.outline(OUT);
    return p;
  }));
  def('deco_bush', one(function () {
    var p = new Pix(16, 16), B = '#2e4a26', BH = '#476b38', BL = '#1c3016';
    p.disc(8, 10, 5, B);
    p.disc(5, 9, 2.6, BH); p.disc(11, 8, 2, B);
    p.rect(3, 11, 11, 3, B);
    p.hline(3, 13, 13, BL);
    p.px(6, 7, BH); p.px(10, 6, BH);
    p.px(5, 11, '#c43a3a'); p.px(9, 12, '#c43a3a'); p.px(12, 10, '#e05050'); // 血浆果
    p.outline(OUT);
    return p;
  }));
  def('deco_mushroom', one(function () {
    var p = new Pix(16, 16);
    p.rect(5, 9, 3, 5, '#d8c9a3');                // 大蘑菇茎
    p.vline(5, 9, 13, '#efe4c4');
    p.disc(6, 6, 4, '#b83a3a');                   // 菌盖
    p.eraseRect(2, 8, 10, 2); p.rect(3, 7, 8, 1, '#8a2430');
    p.px(4, 5, '#f0e0d0'); p.px(7, 4, '#f0e0d0'); p.px(8, 6, '#f0e0d0'); // 白斑
    p.rect(11, 11, 2, 3, '#d8c9a3');              // 小蘑菇
    p.disc(12, 10, 2, '#d1491a');
    p.px(11, 9, '#f0a060');
    p.px(9, 14, '#ff9a5a');                       // 孢子微光
    p.outline(OUT);
    return p;
  }));
  def('deco_pillar', one(function () {
    var p = new Pix(16, 24), S = '#3a4066', SH = '#4d5480', SL = '#282d4a';
    p.rect(5, 4, 6, 17, S);
    p.vline(5, 4, 20, SH); p.vline(10, 4, 20, SL);
    p.rect(4, 2, 8, 2, SH);                       // 柱头
    p.rect(4, 21, 8, 2, SL);                      // 柱基
    p.hline(4, 11, 2, '#5d6494');
    p.line(7, 8, 8, 12, SL);                      // 裂纹
    p.px(8, 13, SL);
    p.px(7, 16, '#5ee8ff'); p.px(8, 17, '#39b8d8'); // 符文微光
    p.outline(OUT);
    return p;
  }));
  def('deco_crystal', one(function () {
    var p = new Pix(16, 24), C = '#4ad8e8', CH = '#aef7ff', CL = '#2a8fd8';
    p.line(8, 3, 6, 12, C); p.line(8, 3, 10, 12, CL); p.line(9, 4, 9, 12, C);
    p.rect(6, 12, 5, 5, C); p.vline(6, 12, 16, CH); p.vline(10, 12, 16, CL);
    p.px(8, 2, CH); p.px(7, 6, CH); p.px(7, 9, CH);
    p.line(3, 12, 4, 17, CL); p.px(3, 17, C); p.px(3, 11, CH);   // 左小晶
    p.line(13, 10, 12, 17, C); p.px(13, 17, CL); p.px(13, 9, CH); // 右小晶
    p.rect(3, 18, 11, 3, '#2f3c54');              // 岩基
    p.hline(3, 13, 20, '#232c40');
    p.px(1, 8, 'rgba(122,232,255,0.5)'); p.px(15, 13, 'rgba(122,232,255,0.5)'); // 辉光
    p.outline(OUT);
    return p;
  }));
  def('deco_rune', one(function () {
    var p = new Pix(16, 16);
    p.ell(8, 10, 6, 4, '#2a3060');
    p.ell(8, 9, 6, 4, '#3d4580');
    p.ell(8, 9, 4, 2, '#2a3060');
    var RG = '#6ae8ff';
    p.vline(7, 7, 11, RG);                        // 符文 ᚱ
    p.px(8, 7, RG); p.px(9, 8, RG); p.px(8, 9, RG); p.px(9, 10, RG); p.px(10, 11, RG);
    p.px(4, 8, 'rgba(106,232,255,0.6)'); p.px(12, 12, 'rgba(106,232,255,0.6)');
    p.outline(OUT);
    return p;
  }));
  def('deco_stalag', one(function () {
    var p = new Pix(16, 24), S = '#3d4468', SH = '#565e8c', SL = '#262c48';
    var dy, hf;
    for (dy = 0; dy <= 18; dy++) { hf = 1 + (dy * 2.4 / 18) | 0; p.hline(7 - hf, 7 + hf, 4 + dy, S); }
    p.line(6, 8, 5, 20, SH); p.vline(7, 4, 7, SH);
    p.line(9, 10, 10, 20, SL);
    for (dy = 0; dy <= 8; dy++) { hf = (dy * 2 / 8) | 0; p.hline(2 - hf, 2 + hf, 13 + dy, S); }
    p.px(1, 15, SH);
    for (dy = 0; dy <= 7; dy++) { hf = (dy * 1.6 / 7) | 0; p.hline(13 - hf, 13 + hf, 15 + dy, SL); }
    p.rect(1, 21, 14, 2, '#232c40');              // 地基
    p.px(7, 2, '#7ae8ff');                        // 滴水微光
    p.outline(OUT);
    return p;
  }));
  def('vfx_shadow', one(function () {             // 脚底影(免描边)
    var p = new Pix(16, 6);
    p.ell(8, 3, 7, 2, 'rgba(0,0,0,0.22)');
    p.ell(8, 3, 5, 1, 'rgba(0,0,0,0.32)');
    return p;
  }));

  def('vfx_explosion', multi(5, function (f) {
    var p = new Pix(32, 32);
    var r = 3 + f * 2.8;
    p.disc(16, 17, r + 2, '#7a1c08');
    p.disc(16, 17, r, '#e85a1a');
    p.disc(16, 17, Math.max(1, r - 2), '#ffb23a');
    p.disc(16, 17, Math.max(1, r - 4), '#ffd84a');
    var i;
    for (i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 + f * 0.4;
      var len = r + 1 + ((i + f) % 3);
      p.line(16, 17, Math.round(16 + Math.cos(a) * len), Math.round(17 + Math.sin(a) * len), '#ffd84a');
      p.line(16, 17, Math.round(16 + Math.cos(a) * (len - 2)), Math.round(17 + Math.sin(a) * (len - 2)), '#fff6c0');
    }
    p.px(16, 17, '#ffffff');
    p.outline('#3a0a04');
    return p;
  }));

  def('vfx_spirit', multi(5, function (f) {
    var p = new Pix(32, 32);
    var cy = 22 - f * 2;
    p.disc(16, cy, 6, '#1a5a70');
    p.disc(16, cy - 1, 4.4, '#3fa8c8');
    p.disc(16, cy - 2, 2.6, '#b8f7ff');
    p.disc(12, cy - 6, 2, '#8fe8f8');
    p.disc(20, cy - 6, 2, '#8fe8f8');
    p.line(16, cy + 6, 16, cy + 9, '#4ac8e0');
    p.line(13, cy + 7, 13, cy + 10, '#2a90a8');
    p.line(19, cy + 7, 19, cy + 10, '#2a90a8');
    p.px(16, cy - 2, '#ffffff');
    p.outline('#0a3040');
    return p;
  }));

  def('vfx_heal', multi(4, function (f) {
    var p = new Pix(32, 32);
    var r = 2 + f * 2;
    p.disc(16, 18, r + 1, '#1d5c38');
    p.disc(16, 18, r, '#4edb7c');
    p.disc(16, 18, Math.max(1, r - 1.4), '#b6ffc8');
    p.rect(14, 12, 4, 12, '#d9ffd9');
    p.rect(10, 16, 12, 4, '#d9ffd9');
    p.px(16, 12, '#ffffff'); p.px(16, 23, '#ffffff');
    p.px(10, 18, '#ffffff'); p.px(21, 18, '#ffffff');
    p.outline('#0e3a22');
    return p;
  }));

  def('vfx_spark', multi(5, function (f) {
    var p = new Pix(32, 32);
    p.disc(16, 16, 2.4, '#ffe95a');
    p.disc(16, 16, 1, '#ffffff');
    var i;
    for (i = 0; i < 10; i++) {
      var a = i * Math.PI * 2 / 10 + f * 0.35;
      var len = 4 + (i % 3) + f * 1.4;
      var c = i % 2 === 0 ? '#ffd84a' : '#fff6c0';
      p.line(16, 16, Math.round(16 + Math.cos(a) * len), Math.round(16 + Math.sin(a) * len), c);
    }
    return p;
  }));

  def('vfx_smoke', multi(6, function (f) {
    var p = new Pix(32, 32);
    var base = 26 - f * 2;
    var i;
    for (i = 0; i < 5; i++) {
      var cx = 12 + i * 3 + ((i + f) % 2);
      var cy = base - ((i * 4 + f) % 9);
      var r = 2 + (i % 3) + f * 0.5;
      p.disc(cx, cy, r, 'rgba(120,128,140,0.55)');
      p.disc(cx - 1, cy - 1, Math.max(1, r - 1), 'rgba(190,196,206,0.5)');
    }
    return p;
  }));

  // Atlas-free emergency terrain. The production build uses the authored V4
  // 128px tiles; these tiny opaque patterns keep the game fully playable when
  // atlas loading fails without exposing magenta placeholders or square gaps.
  function fallbackTerrain(base, fleck) {
    return one(function () {
      var p = new Pix(16, 16);
      p.rect(0, 0, 16, 16, base);
      for (var y = 1; y < 16; y += 5) {
        for (var x = (y * 3) % 5; x < 16; x += 7) p.rect(x, y, 1, 1, fleck);
      }
      return p;
    });
  }
  def('tile_graveyard', fallbackTerrain('#201d25', '#39313b'));
  def('tile_wilds', fallbackTerrain('#30251b', '#55412a'));
  def('tile_abyss', fallbackTerrain('#151c2b', '#283651'));

  def('vfx_lightning', multi(5, function (f) {
    var p = new Pix(32, 32);
    var x = 16, y = 2;
    var i;
    p.line(16, 2, 18, 8, '#5ab8e8');
    p.line(18, 8, 14, 16, '#8ed4ff');
    p.line(14, 16, 17, 28, '#bfe8ff');
    for (i = 0; i < 7; i++) {
      var nx = x + (((i * 7 + f * 3) % 5) - 2);
      var ny = y + 3 + ((i + f) % 3);
      p.line(x, y, nx, ny, i % 2 === 0 ? '#bfe8ff' : '#e8fbff');
      x = nx; y = ny;
    }
    p.px(16, 2, '#ffffff');
    return p;
  }));

  def('vfx_ice', multi(9, function (f) {
    var p = new Pix(32, 32);
    var i;
    for (i = 0; i < 12; i++) {
      var a = i * Math.PI * 2 / 12 + f * 0.22;
      var len = 5 + (i % 3) * 2 + f * 1.1;
      var c = i % 3 === 0 ? '#9ff8ff' : (i % 3 === 1 ? '#5ed8ff' : '#2a7ab0');
      p.line(16, 16, Math.round(16 + Math.cos(a) * len), Math.round(16 + Math.sin(a) * len), c);
      p.line(16, 16, Math.round(16 + Math.cos(a + 0.35) * (len - 1)), Math.round(16 + Math.sin(a + 0.35) * (len - 1)), '#d6fcff');
    }
    p.disc(16, 16, 1.4, '#ffffff');
    return p;
  }));

  def('vfx_circle', multi(3, function (f) {
    var p = new Pix(32, 32);
    var r = 5 + f * 5;
    p.disc(16, 17, r, '#ffe9a3');
    p.eraseDisc(16, 17, Math.max(1, r - 2.5));
    p.disc(16, 17, 1.5, '#ffffff');
    p.outline('#8a6a20');
    return p;
  }));

  def('vfx_slash', multi(4, function (f) {
    var p = new Pix(32, 32);
    crescent(p, 15, 17, 10 + f, '#f4feff', '#9fe8ff', '#4ab8e8');
    p.line(12, 11, 21, 23, '#ffffff');
    p.px(23, 9, '#ffffff'); p.px(25, 13, '#ffffff'); p.px(7, 24, '#ffffff');
    p.outline('#123a58');
    return p;
  }));

  def('vfx_shield', multi(6, function (f) {
    var p = new Pix(32, 32);
    var r = 8 + (f % 2);
    p.disc(16, 17, r, 'rgba(138,232,255,0.45)');
    p.eraseDisc(16, 17, Math.max(1, r - 2));
    p.disc(16, 17, 1.6, '#eafcff');
    var i;
    for (i = 0; i < 6; i++) {
      var a = i * Math.PI * 2 / 6 + f * 0.5;
      p.px(Math.round(16 + Math.cos(a) * (r + 1)), Math.round(17 + Math.sin(a) * (r + 1)), '#ffffff');
    }
    p.outline('#1a5a70');
    return p;
  }));

  // 预渲染柔光贴图:64×64 径向渐变,每帧 drawImage 代替 createRadialGradient(后者很贵)
  // 绘制时按需缩放,白底半透明,调用方用 globalAlpha 控制强度、用合成模式着色
  function buildGlowTexture() {
    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    var g = cv.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return [cv];
  }

  // ---------- SPEC 模块A 名字清单(覆盖率自检用) ----------
  var NAMES = [
    'char_knight', 'char_mage', 'char_ranger', 'char_cleric', 'char_berserker', 'char_chrono',
    'merchant',
    'bat', 'slime', 'slime_big', 'zombie', 'skeleton', 'ghost', 'spider', 'cultist',
    'orc', 'imp', 'knight_armored', 'werewolf', 'mummy', 'gargoyle', 'bloodbat', 'wraith',
    'boss_slimeking', 'boss_bonelord', 'boss_abysseye', 'boss_darklord',
    'p_slash', 'p_slash_big', 'p_bolt', 'p_arrow', 'p_axe', 'p_dagger', 'p_orbitblade',
    'p_book', 'p_fireflask', 'p_firepool', 'p_spark', 'p_shadow', 'p_turret', 'p_enemy_bolt', 'p_holy',
    'gem1', 'gem2', 'gem3', 'gem_big', 'coin', 'chest', 'vault_chest', 'magnet', 'bomb', 'meat', 'clock',
    'vfx_glow',
    'w_crossblade', 'w_arcanebolt', 'w_windbow', 'w_holyaura', 'w_whirlaxe', 'w_chainlight',
    'w_frostnova', 'w_fireflask', 'w_shadowdagger', 'w_orbitblade', 'w_holytome', 'w_teslacoil',
    'we_crossjudge', 'we_arcanestorm', 'we_featherstorm', 'we_sanctuary', 'we_worldender', 'we_thorwrath',
    'we_absolutezero', 'we_infernosea', 'we_thousandcuts', 'we_bladestorm', 'we_forbidden', 'we_skynet',
    'ps_power', 'ps_core', 'ps_eagle', 'ps_pendant', 'ps_belt', 'ps_boots', 'ps_magnetstone', 'ps_clover',
    'icon_gold', 'icon_hp', 'icon_dmg', 'icon_armor', 'icon_speed', 'icon_magnet', 'icon_luck',
    'icon_revive', 'icon_reroll', 'icon_banish', 'icon_cd', 'icon_area', 'icon_growth',
    'icon_kill', 'icon_time', 'elite_crown',
    'deco_grave', 'deco_deadtree', 'deco_bone', 'deco_fence', 'deco_skullpost',
    'deco_tree2', 'deco_rock', 'deco_bush', 'deco_mushroom',
    'deco_pillar', 'deco_crystal', 'deco_rune', 'deco_stalag',
    'vfx_shadow',
    'vfx_explosion', 'vfx_spirit', 'vfx_heal', 'vfx_spark', 'vfx_smoke', 'vfx_lightning',
    'vfx_ice', 'vfx_circle', 'vfx_slash', 'vfx_shield'
  ];

  function buildPlaceholder() {
    var p = new Pix(8, 8);
    p.rect(0, 0, 8, 8, '#ff00ff');
    p.rect(0, 0, 4, 4, '#1a1626'); p.rect(4, 4, 4, 4, '#1a1626');
    return [p.toCanvas()];
  }

  // 未知名/未初始化兜底:占位素材缓存进 store,后续调用零分配
  function fallback(name) {
    var key = typeof name === 'string' ? name : String(name);
    if (!warned[key]) {
      warned[key] = true;
      console.warn('[SpriteGen] 未知素材名: ' + key);
    }
    store[key] = PLACEHOLDER;
    return PLACEHOLDER;
  }

  function fallbackKey(name) {
    var base = name.replace(/_(idle|walk|attack|hurt|death)_(down|left|right|up)$/, '')
      .replace(/_(walk|attack|death|charge|overload|deploy)$/, '');
    if (base.indexOf('elite_') === 0) base = base.slice(6);
    if (base === 'merchant_prone' || base === 'merchant') return 'merchant';
    if (base.indexOf('tesla_tower') === 0) return 'tesla_tower';
    if (base.indexOf('deco_deadtree_large') === 0) return 'deco_deadtree';
    if (base === 'deco_deadstump' || base === 'deco_fallenlog' || base === 'deco_deadroots') return 'deco_deadtree';
    if (base === 'deco_deadreeds') return 'deco_bush';
    if (base === 'deco_wither_cluster1' || base === 'deco_wither_cluster2' ||
        base === 'deco_swamp_reeds' || base === 'deco_lilypad') return 'deco_bush';
    if (base === 'deco_road_marker') return 'deco_grave';
    if (base === 'deco_wagon_rut') return 'deco_deadtree';
    if (base === 'deco_abyss_coral') return 'deco_crystal';
    if (base === 'deco_rune_cluster') return 'deco_rune';
    if (base.indexOf('terrain_grave_') === 0) return 'tile_graveyard';
    if (base.indexOf('terrain_wild_') === 0) return 'tile_wilds';
    if (base.indexOf('terrain_abyss_') === 0) return 'tile_abyss';
    if (base === 'vfx_holy_aura') return 'vfx_circle';
    if (base === 'vfx_frost_impact') return 'vfx_ice';
    if (base === 'ps_barrier') return 'ps_core';
    return base;
  }

  var atlasState = {
    loaded: false,
    count: 0,
    image: null,
    error: null,
    promise: null,
    names: {},
    scales: {},
    fps: {}
  };
  var proceduralReady = false;

  window.SpriteGen = {
    // 同步构建全部素材;启动时调用一次(重复调用无副作用)
    init: function () {
      if (proceduralReady) return;
      if (!store) store = {};
      if (!PLACEHOLDER) PLACEHOLDER = buildPlaceholder();
      if (!store.vfx_glow) store.vfx_glow = buildGlowTexture();
      if (!store.hud_minimap_frame) store.hud_minimap_frame = [new Pix(8, 8).toCanvas()];
      var name, i;
      for (name in defs) {
        if (store[name]) continue;
        if (typeof defs[name] !== 'function') {
          throw new Error('SpriteGen bad def: ' + name + ' -> ' + typeof defs[name]);
        }
        var pxFrames = defs[name]();
        var cs = [];
        for (i = 0; i < pxFrames.length; i++) cs.push(pxFrames[i].toCanvas());
        store[name] = cs;
      }
      proceduralReady = true;
      // 覆盖率自检:对照 SPEC 清单逐一核对
      var missing = 0;
      for (i = 0; i < NAMES.length; i++) {
        if (!store[NAMES[i]]) { missing++; console.warn('[SpriteGen] 缺失素材: ' + NAMES[i]); }
      }
      console.assert(missing === 0, '[SpriteGen] 覆盖率自检未通过,缺失 ' + missing + ' 项');
    },
    // 本地图集优先覆盖同名程序素材；加载失败时保留完整的离线程序兜底。
    // 未注入 atlas-data.js 时返回 null，让无 DOM/旧页面保持同步启动。
    loadAtlas: function () {
      var cfg = window.SPRITE_ATLAS;
      if (!cfg || !cfg.image || !cfg.frames) return null;
      if (atlasState.promise) return atlasState.promise;
      // 正常路径只准备三个轻量兜底，不再先生成整套程序精灵再立刻被图集覆盖。
      // 图集失败时才惰性构建完整程序素材，显著缩短首屏前的主线程阻塞。
      if (!store) store = {};
      if (!PLACEHOLDER) PLACEHOLDER = buildPlaceholder();
      if (!store.vfx_glow) store.vfx_glow = buildGlowTexture();
      if (!store.hud_minimap_frame) store.hud_minimap_frame = [new Pix(8, 8).toCanvas()];
      atlasState.image = cfg.image;
      atlasState.promise = new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () {
          try {
            var replacements = {};
            var names = Object.keys(cfg.frames);
            for (var ni = 0; ni < names.length; ni++) {
              var name = names[ni];
              var sourceFrames = cfg.frames[name];
              var canvases = [];
              for (var fi = 0; fi < sourceFrames.length; fi++) {
                var frame = sourceFrames[fi];
                var cv = document.createElement('canvas');
                cv.width = frame.w; cv.height = frame.h;
                var g = cv.getContext('2d');
                g.imageSmoothingEnabled = false;
                g.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
                canvases.push(cv);
              }
              replacements[name] = canvases;
            }
            for (var key in replacements) {
              store[key] = replacements[key];
              atlasState.names[key] = true;
            }
            atlasState.scales = cfg.renderScale || {};
            atlasState.fps = cfg.animationFps || {};
            atlasState.count = names.length;
            atlasState.loaded = true;
            console.info('[SpriteGen] 本地图集已加载: ' + names.length + ' 项');
            resolve(true);
          } catch (err) {
            atlasState.error = String(err && err.message ? err.message : err);
            console.warn('[SpriteGen] 图集切片失败,继续使用程序素材:', err);
            window.SpriteGen.init();
            resolve(false);
          }
        };
        image.onerror = function () {
          atlasState.error = 'image load failed: ' + cfg.image;
          console.warn('[SpriteGen] 图集加载失败,继续使用程序素材: ' + cfg.image);
          window.SpriteGen.init();
          resolve(false);
        };
        image.decoding = 'async';
        image.fetchPriority = 'high';
        image.src = cfg.image;
      });
      return atlasState.promise;
    },
    isAtlas: function (name) { return !!atlasState.names[name]; },
    renderScale: function (name) {
      var base = name.replace(/_(idle|walk|attack|hurt|death)_(down|left|right|up)$/, '')
        .replace(/_(walk|attack|death|charge)$/, '');
      return atlasState.scales[name] || atlasState.scales[base] || 1;
    },
    animationFps: function (name, fallback) {
      var base = name.replace(/_(idle|walk|attack|hurt|death)_(down|left|right|up)$/, '')
        .replace(/_(walk|attack|death|charge)$/, '');
      return atlasState.fps[name] || atlasState.fps[base] || fallback || 6;
    },
    atlasStatus: function () {
      return {
        loaded: atlasState.loaded,
        count: atlasState.count,
        image: atlasState.image,
        error: atlasState.error
      };
    },
    // → HTMLCanvasElement;未知名字返回 8×8 洋红占位并 console.warn(每名一次)
    get: function (name) {
      if (!store) this.init();
      var arr = store[name];
      // 动作图集缺失时退回角色基础帧，离线/图集加载失败也不会显示占位块。
      if (!arr) arr = store[fallbackKey(name)];
      if (!arr) arr = fallback(name);
      return arr[0];
    },
    // 按颜色取柔光贴图(首用构建并缓存,后续零分配)。color 格式 '#rrggbb'
    _glowCache: {},
    glow: function (color) {
      if (!store) this.init();
      if (!this._glowCache[color]) {
        var base = buildGlowTexture()[0];
        var cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        var g = cv.getContext('2d');
        g.drawImage(base, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color;
        g.fillRect(0, 0, 64, 64);
        g.globalCompositeOperation = 'source-over';
        this._glowCache[color] = cv;
      }
      return this._glowCache[color];
    },
    // → [canvas,...] 动画帧数组(≥1);单帧素材返回 [同一 canvas]
    frames: function (name) {
      if (!store) this.init();
      var arr = store[name];
      if (!arr) arr = store[fallbackKey(name)];
      if (!arr) arr = fallback(name);
      return arr;
    }
  };
})();
