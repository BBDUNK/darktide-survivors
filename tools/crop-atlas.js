// tools/crop-atlas.js
// 无损裁剪图集底部的空白区域,并用 zlib 最高等级重新编码。
//
// 背景:atlas.png 是 2048x8192,但精灵内容只到第 5269 行 —— 底部 2920 行
// (占 35.6%)完全透明,却仍被编码进 PNG 并被玩家下载。裁掉它是纯粹的
// 无损优化:不动任何像素、不改色深、不做调色板量化,因此不会产生
// 抖动网格(dithering)之类的画质损失。
//
// 用法: node tools/crop-atlas.js <输入.png> <输出.png> [目标高度]
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function readChunks(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    chunks.push({ type: type, data: data });
    off += 12 + len;
  }
  return chunks;
}

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

// PNG 逐行滤波器的反解与重编码
function unfilter(raw, w, h, bpp) {
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    line.copy(cur);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
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
  return out;
}

// 用 Paeth(滤波器 4)重新编码:对精灵图这类内容通常压得最好
function refilter(pixels, w, h, bpp) {
  const stride = w * bpp;
  const out = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const cur = pixels.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : null;
    out[y * (stride + 1)] = 4;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      out[y * (stride + 1) + 1 + x] = (cur[x] - pred) & 0xff;
    }
  }
  return out;
}

const [inPath, outPath, argH] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('用法: node tools/crop-atlas.js <输入.png> <输出.png> [目标高度]');
  process.exit(1);
}

const src = fs.readFileSync(inPath);
const chunks = readChunks(src);
const ihdr = chunks.find(c => c.type === 'IHDR');
const w = ihdr.data.readUInt32BE(0), h = ihdr.data.readUInt32BE(4);
const depth = ihdr.data[8], colorType = ihdr.data[9];
const interlace = ihdr.data[12];
if (depth !== 8 || colorType !== 6 || interlace !== 0) {
  throw new Error('只支持 8 位 RGBA 非隔行 PNG,当前 depth=' + depth +
                  ' colorType=' + colorType + ' interlace=' + interlace);
}
const bpp = 4;

const idat = Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
const raw = zlib.inflateSync(idat);
const pixels = unfilter(raw, w, h, bpp);

// 自动探测最后一行非透明像素
let lastY = -1;
for (let y = h - 1; y >= 0; y--) {
  let any = false;
  for (let x = 0; x < w; x++) {
    if (pixels[(y * w + x) * bpp + 3] !== 0) { any = true; break; }
  }
  if (any) { lastY = y; break; }
}
// 目标高度:向上取整到 8 的倍数,保留对齐
const newH = argH ? parseInt(argH, 10) : Math.min(h, Math.ceil((lastY + 1) / 8) * 8);
if (newH >= h) {
  console.log('无空白可裁(最后非透明行 ' + lastY + ',高度 ' + h + ')');
  process.exit(0);
}

// 安全校验:裁掉的区域必须全透明,否则拒绝
let lost = 0;
for (let y = newH; y < h; y++) {
  for (let x = 0; x < w; x++) if (pixels[(y * w + x) * bpp + 3] !== 0) lost++;
}
if (lost > 0) throw new Error('拒绝裁剪:目标高度以下仍有 ' + lost + ' 个非透明像素');

const cropped = pixels.slice(0, newH * w * bpp);
const refiltered = refilter(cropped, w, newH, bpp);
const deflated = zlib.deflateSync(refiltered, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });

const newIhdr = Buffer.from(ihdr.data);
newIhdr.writeUInt32BE(newH, 4);

// 只保留必要的块:IHDR + IDAT + IEND(丢掉 tEXt 之类的元数据)
const out = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  makeChunk('IHDR', newIhdr),
  makeChunk('IDAT', deflated),
  makeChunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(outPath, out);

console.log('输入: ' + w + 'x' + h + '  ' + (src.length / 1024 / 1024).toFixed(2) + 'MB');
console.log('最后非透明行: ' + lastY);
console.log('输出: ' + w + 'x' + newH + '  ' + (out.length / 1024 / 1024).toFixed(2) + 'MB');
console.log('降幅: ' + ((1 - out.length / src.length) * 100).toFixed(1) + '%  (无损:未改动任何像素)');
