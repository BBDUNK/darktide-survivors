// tools/optimize-atlas.js
// 把 RGBA 图集转成索引色 PNG,大幅缩小体积 —— 但刻意不做抖动(dithering)。
//
// 为什么不抖动:
//   codex 之前给的 2.1MB 版本用了带抖动的量化器,体积降到 30%,但
//   vfx_frost_radial / vfx_holy_aura 这类柔和渐变特效上出现了明显的
//   棋盘格噪点(抖动是用两种颜色交替来"骗"出中间色)。像素游戏里这看起来
//   就是"脏像素",正是 WORKLOG B8b 要治的毛病。
//   本工具改用"就近取色 + 不抖动":渐变会轻微断层,但绝不产生噪点网格。
//
// 前提(已实测):图集里 alpha 是纯二值的(0 或 255,零个半透明像素),
// 所以可以用调色板的 tRNS 单一透明索引表达,不需要 8 位 alpha 通道。
//
// 用法: node tools/optimize-atlas.js <输入.png> <输出.png> [颜色数=256]
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function decodeRGBA(path) {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    chunks.push({ type: type, data: buf.slice(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  const ih = chunks.find(c => c.type === 'IHDR');
  const w = ih.data.readUInt32BE(0), h = ih.data.readUInt32BE(4);
  if (ih.data[8] !== 8 || ih.data[9] !== 6 || ih.data[12] !== 0) {
    throw new Error('只支持 8 位 RGBA 非隔行 PNG');
  }
  const bpp = 4, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data)));
  const px = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    raw.copy(px, y * stride, pos, pos + stride);
    pos += stride;
    const cur = px.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = cur[x];
      if (ft === 1) v = (v + a) & 0xff;
      else if (ft === 2) v = (v + b) & 0xff;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
      }
      cur[x] = v;
    }
  }
  return { px: px, w: w, h: h };
}

// ---- 中位切分(median cut)选调色板 ----
// 按出现频次加权,保证常见颜色优先获得精确表达。
function buildPalette(px, maxColors) {
  const freq = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  let box = [];
  for (const [key, n] of freq) {
    box.push({ r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff, n: n });
  }
  let boxes = [box];
  while (boxes.length < maxColors) {
    // 找"加权体积"最大的盒子来切
    let bi = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.length < 2) continue;
      let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, tot = 0;
      for (const c of bx) {
        if (c.r < rmin) rmin = c.r; if (c.r > rmax) rmax = c.r;
        if (c.g < gmin) gmin = c.g; if (c.g > gmax) gmax = c.g;
        if (c.b < bmin) bmin = c.b; if (c.b > bmax) bmax = c.b;
        tot += c.n;
      }
      // 用等权体积,不要按亮度敏感度加权。
      // 亮度权重(绿 .59 / 蓝 .11)会严重低估蓝紫方向的差异,导致
      // 蓝紫渐变的盒子迟迟不被切分 —— 结果霜冻特效的紫色整片塌成灰色。
      const vol = (rmax - rmin) + (gmax - gmin) + (bmax - bmin);
      const score = vol * Math.log(tot + 1);
      if (score > best) { best = score; bi = i; }
    }
    if (bi < 0) break;
    const bx = boxes[bi];
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (const c of bx) {
      if (c.r < rmin) rmin = c.r; if (c.r > rmax) rmax = c.r;
      if (c.g < gmin) gmin = c.g; if (c.g > gmax) gmax = c.g;
      if (c.b < bmin) bmin = c.b; if (c.b > bmax) bmax = c.b;
    }
    const dr = rmax - rmin, dg = gmax - gmin, db = bmax - bmin;
    const ch = dr >= dg && dr >= db ? 'r' : (dg >= db ? 'g' : 'b');
    bx.sort((p, q) => p[ch] - q[ch]);
    // 按累计频次的中位切,而不是按数量中位 —— 让高频色分到更细的盒子
    let total = 0;
    for (const c of bx) total += c.n;
    let acc = 0, cut = 1;
    for (let i = 0; i < bx.length - 1; i++) {
      acc += bx[i].n;
      if (acc >= total / 2) { cut = i + 1; break; }
    }
    boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut));
  }
  // 每个盒子取频次加权平均色
  return boxes.map(bx => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of bx) { r += c.r * c.n; g += c.g * c.n; b += c.b * c.n; n += c.n; }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
  });
}

const [inPath, outPath, argN] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('用法: node tools/optimize-atlas.js <输入.png> <输出.png> [颜色数]');
  process.exit(1);
}
const maxColors = Math.min(255, parseInt(argN || '255', 10)); // 留 1 个索引给透明

const { px, w, h } = decodeRGBA(inPath);

// 前置校验:alpha 必须是二值的,否则索引色无法无损表达透明度
let semi = 0;
for (let i = 3; i < px.length; i += 4) {
  if (px[i] !== 0 && px[i] !== 255) semi++;
}
if (semi > 0) {
  throw new Error('存在 ' + semi + ' 个半透明像素,索引色 + tRNS 无法表达,已中止');
}

const palette = buildPalette(px, maxColors);
// 索引 0 保留为透明色
const pal = [[0, 0, 0]].concat(palette);

// 就近取色(不抖动)。用缓存避免对同色重复搜索。
const cache = new Map();
function nearest(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2];
    // 等权欧氏距离:亮度加权会把蓝紫压成灰,像素美术里色相跑偏比
    // 亮度轻微偏差更容易被看出来。
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  cache.set(key, best);
  return best;
}

// 第一步:算出每个像素的调色板索引,同时统计取色误差。
// (索引和滤波必须分两步做:Paeth 预测要用"原始索引"作左邻/上邻,
//  若边算边就地写差值,后续像素读到的就是差值而不是索引。)
const indices = Buffer.alloc(h * w);
let maxErr = 0, errSum = 0, errN = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (px[i + 3] === 0) { indices[y * w + x] = 0; continue; }
    const idx = nearest(px[i], px[i + 1], px[i + 2]);
    indices[y * w + x] = idx;
    const e = Math.max(Math.abs(px[i] - pal[idx][0]),
                       Math.abs(px[i + 1] - pal[idx][1]),
                       Math.abs(px[i + 2] - pal[idx][2]));
    if (e > maxErr) maxErr = e;
    errSum += e; errN++;
  }
}
// 第二步:Paeth 滤波

const filtered = Buffer.alloc(h * (w + 1));
for (let y = 0; y < h; y++) {
  const ro = y * (w + 1);
  filtered[ro] = 4;
  for (let x = 0; x < w; x++) {
    const cur = indices[y * w + x];
    const a = x > 0 ? indices[y * w + x - 1] : 0;
    const b = y > 0 ? indices[(y - 1) * w + x] : 0;
    const c = (y > 0 && x > 0) ? indices[(y - 1) * w + x - 1] : 0;
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
    filtered[ro + 1 + x] = (cur - pred) & 0xff;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 3;   // color type: indexed
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const plte = Buffer.alloc(pal.length * 3);
pal.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
// tRNS:索引 0 完全透明,其余不透明
const trns = Buffer.alloc(1);
trns[0] = 0;

const deflated = zlib.deflateSync(filtered, { level: 9, memLevel: 9 });
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  makeChunk('IHDR', ihdr),
  makeChunk('PLTE', plte),
  makeChunk('tRNS', trns),
  makeChunk('IDAT', deflated),
  makeChunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(outPath, png);

const srcSize = fs.statSync(inPath).size;
console.log('输入: ' + w + 'x' + h + '  ' + (srcSize / 1024 / 1024).toFixed(2) + 'MB (RGBA)');
console.log('调色板: ' + pal.length + ' 色 (含 1 个透明索引),未使用抖动');
console.log('取色误差: 平均 Δ' + (errN ? (errSum / errN).toFixed(2) : 0) + '  最大 Δ' + maxErr);
console.log('输出: ' + (png.length / 1024 / 1024).toFixed(2) + 'MB  降幅 ' +
            ((1 - png.length / srcSize) * 100).toFixed(1) + '%');
