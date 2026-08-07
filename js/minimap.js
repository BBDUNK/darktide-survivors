// minimap.js — 小地图:局部视野 / 全图 两种模式(点击小地图或按 M 切换)
window.Minimap = (function () {
  'use strict';

  var SIZE = 116;        // 小地图边长
  var EDGE = 6;          // 距右边缘留白,避免贴边被裁
  var LOCAL_RANGE = 420; // 局部模式显示半径
  var mode = 'local';    // local | full

  function toggle() {
    mode = (mode === 'local' ? 'full' : 'local');
    return mode;
  }
  function getMode() { return mode; }

  // 世界坐标 → 小地图坐标;超出范围返回 null
  function project(wx, wy, p, cx, cy, half) {
    var R = CFG.GAME.MAP_R;
    if (mode === 'full') {
      return { x: cx + (wx / R) * half, y: cy + (wy / R) * half };
    }
    var dx = wx - p.x, dy = wy - p.y;
    if (Math.hypot(dx, dy) > LOCAL_RANGE) return null;
    return { x: cx + (dx / LOCAL_RANGE) * half, y: cy + (dy / LOCAL_RANGE) * half };
  }

  function dot(ctx, pt, color, size) {
    ctx.fillStyle = color;
    ctx.fillRect(pt.x - size / 2, pt.y - size / 2, size, size);
  }

  function draw(ctx, run) {
    var p = run.player;
    var x0 = CFG.GAME.W - SIZE - EDGE;   // 贴右边,留少量边距
    var y0 = 16;                  // 贴经验条下沿
    var half = SIZE / 2 - 3;
    var cx = x0 + SIZE / 2;
    var cy = y0 + SIZE / 2;

    // 底板(不透明,避免场景透上来看不清)
    ctx.fillStyle = 'rgba(9,7,18,0.95)';
    ctx.fillRect(x0, y0, SIZE, SIZE);
    ctx.strokeStyle = '#6a5a85';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, SIZE - 2, SIZE - 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 1, y0 + 1, SIZE - 2, SIZE - 2);
    ctx.clip();

    // 全图模式:画出地图边界与网格
    if (mode === 'full') {
      ctx.strokeStyle = 'rgba(150,90,255,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
      ctx.strokeStyle = 'rgba(90,70,130,0.35)';
      for (var g = 1; g < 4; g++) {
        var off = -half + (half * 2 / 4) * g;
        ctx.beginPath(); ctx.moveTo(cx + off, cy - half); ctx.lineTo(cx + off, cy + half); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - half, cy + off); ctx.lineTo(cx + half, cy + off); ctx.stroke();
      }
    }

    // 经验宝石
    var gems = Entities.getGems();
    for (var i = 0; i < gems.length; i++) {
      var gm = gems[i];
      if (!gm.alive) continue;
      var gp = project(gm.x, gm.y, p, cx, cy, half);
      if (gp) dot(ctx, gp, '#59c2ff', gm.v >= 10 ? 3 : 2);
    }

    // 道具(宝箱最显眼)
    var items = Entities.getItems();
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (!it.alive) continue;
      var ip = project(it.x, it.y, p, cx, cy, half);
      if (!ip) continue;
      if (it.type === 'chest') {
        var tw = 0.5 + Math.sin(run.t * 6) * 0.5;
        ctx.globalAlpha = 0.55 + tw * 0.45;
        dot(ctx, ip, '#ffd76b', 6);
        ctx.globalAlpha = 1;
      } else if (it.type === 'coin') {
        dot(ctx, ip, '#ffeb3b', 3);
      } else {
        dot(ctx, ip, '#ff6b9d', 4);
      }
    }

    // Boss / 精英
    var pool = Entities.pool;
    for (var k = 0; k < pool.length; k++) {
      var e = pool[k];
      if (!e.alive || (!e.boss && !e.elite)) continue;
      var ep = project(e.x, e.y, p, cx, cy, half);
      if (ep) dot(ctx, ep, e.boss ? '#ff5964' : '#ff9d5c', e.boss ? 7 : 5);
    }

    // 玩家
    ctx.fillStyle = '#7dff7d';
    var pp = mode === 'full' ? project(p.x, p.y, p, cx, cy, half) : { x: cx, y: cy };
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y - 4);
    ctx.lineTo(pp.x - 3.5, pp.y + 3.5);
    ctx.lineTo(pp.x + 3.5, pp.y + 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 模式标签
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(230,220,255,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(mode === 'full' ? '全图 ⇄点击' : '周围 ⇄点击', x0 + SIZE - 4, y0 + SIZE - 4);
    // 索敌模式提示:小地图下方一行小字,右对齐到索敌按钮左缘,避免被按钮盖住
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(230,220,255,0.85)';
    ctx.strokeStyle = 'rgba(8,6,18,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText('🎯 ' + Weapons.getTargetModeName(), x0 + SIZE - 56, y0 + SIZE + 14);
    ctx.fillText('🎯 ' + Weapons.getTargetModeName(), x0 + SIZE - 56, y0 + SIZE + 14);
    ctx.textAlign = 'left';
  }

  // 命中区域(逻辑像素),供点击/触摸判定复用,避免与绘制位置脱节
  function hitBox() {
    return { x: CFG.GAME.W - SIZE - EDGE, y: 16, w: SIZE, h: SIZE };
  }

  return { draw: draw, toggle: toggle, getMode: getMode, hitBox: hitBox };
})();
