// headless.js — 无头冒烟测试:桩替浏览器 API,加载全部游戏脚本,模拟真实游玩
// 用法: node test/headless.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------------- 浏览器桩 ----------------
function makeCtx(canvas) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    canvas,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '', globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false, lineCap: '', lineJoin: '', shadowBlur: 0, shadowColor: '',
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, rect: noop,
    fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop,
    drawImage: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 10 }),
    createRadialGradient: () => grad, createLinearGradient: () => grad, createPattern: () => null,
    getImageData: (x, y, w, hh) => ({ data: new Uint8ClampedArray(Math.max(1, w * hh) * 4), width: w, height: hh }),
    putImageData: noop,
    createImageData: (w, hh) => ({ data: new Uint8ClampedArray(Math.max(1, w * hh) * 4), width: w, height: hh }),
    clip: noop, ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop
  };
}

let elCount = 0;
function makeEl(tag) {
  const el = {
    _id: ++elCount, tagName: (tag || 'div').toUpperCase(),
    children: [], parent: null,
    style: new Proxy({}, { get: () => '', set: () => true }),
    _cls: new Set(),
    _text: '',
    width: 0, height: 0, value: '', type: '', min: 0, max: 100,
    _handlers: {},
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      toggle: (c, force) => { if (force === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else if (force) el._cls.add(c); else el._cls.delete(c); },
      contains: c => el._cls.has(c)
    },
    get className() { return [...el._cls].join(' '); },
    set className(v) { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return el._text; },
    set textContent(v) { el._text = String(v); el.children.length = 0; },
    get innerHTML() { return ''; },
    set innerHTML(v) { if (v === '') el.children.length = 0; },
    appendChild(c) { c.parent = el; el.children.push(c); return c; },
    insertBefore(c, ref) { c.parent = el; const i = el.children.indexOf(ref); if (i >= 0) el.children.splice(i, 0, c); else el.children.push(c); return c; },
    remove() { if (el.parent) { const i = el.parent.children.indexOf(el); if (i >= 0) el.parent.children.splice(i, 1); } },
    addEventListener(ev, fn) { (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
    removeEventListener: () => {},
    getContext: () => { if (!el._ctx) el._ctx = makeCtx(el); return el._ctx; },
    get firstChild() { return el.children[0] || null; },
    get offsetWidth() { return 100; },
    setAttribute: () => {}, getAttribute: () => null,
    click(evt) { (el._handlers.click || []).forEach(f => f(evt || { pointerType: 'mouse' })); }
  };
  return el;
}

// 深度查找:按 textContent 包含匹配
function findByText(rootEl, text) {
  if (rootEl._text && rootEl._text.indexOf(text) >= 0) return rootEl;
  for (const c of rootEl.children) {
    const r = findByText(c, text);
    if (r) return r;
  }
  return null;
}
function findAll(rootEl, pred, out) {
  out = out || [];
  if (pred(rootEl)) out.push(rootEl);
  for (const c of rootEl.children) findAll(c, pred, out);
  return out;
}

const bodyEl = makeEl('body');
const gameCanvas = makeEl('canvas');
const uiRoot = makeEl('div');
const byId = { game: gameCanvas, ui: uiRoot };
bodyEl.appendChild(gameCanvas); bodyEl.appendChild(uiRoot);

let rafCb = null;
const store = {};
const winHandlers = {};

const windowObj = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener: (ev, fn) => { (winHandlers[ev] = winHandlers[ev] || []).push(fn); },
  removeEventListener: () => {},
  location: { reload: () => {} },
  AudioContext: undefined, webkitAudioContext: undefined,
  performance: { now: () => nowMs },
  requestAnimationFrame: cb => { rafCb = cb; return 1; }
};
const documentObj = {
  readyState: 'complete',
  body: bodyEl,
  createElement: t => makeEl(t),
  getElementById: id => byId[id] || null,
  addEventListener: (ev, fn) => { (winHandlers['doc_' + ev] = winHandlers['doc_' + ev] || []).push(fn); },
  removeEventListener: () => {},
  hidden: false
};

let nowMs = 0;

const sandboxGlobals = {
  window: windowObj, document: documentObj,
  navigator: { userAgent: 'headless', maxTouchPoints: 0 },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  performance: windowObj.performance,
  requestAnimationFrame: windowObj.requestAnimationFrame,
  cancelAnimationFrame: () => {},
  setInterval: () => 0, clearInterval: () => {},
  setTimeout: (fn) => { pendingTimeouts.push(fn); return 0; },
  clearTimeout: () => {},
  confirm: () => true, alert: () => {},
  Image: function () { return makeEl('img'); },
  AudioContext: undefined,
  console
};
const pendingTimeouts = [];

// window 上也要能取到这些全局
windowObj.document = documentObj;
windowObj.localStorage = sandboxGlobals.localStorage;
windowObj.setTimeout = sandboxGlobals.setTimeout;
windowObj.confirm = sandboxGlobals.confirm;

// ---------------- 加载脚本 ----------------
// 直接把 windowObj 作为沙箱全局:游戏代码 window.X = ... 即写到全局,裸引用 X 可解析;
// 未定义的名字(Math/Map/Object…)自动落到 VM 上下文的真实内置对象。
const vm = require('vm');
Object.assign(windowObj, sandboxGlobals);
windowObj.window = windowObj;
windowObj.globalThis = windowObj;
const context = vm.createContext(windowObj);

const files = ['js/config.js', 'js/sprites.js', 'js/audio.js', 'js/fx.js', 'js/engine.js', 'js/meta.js', 'js/entities.js', 'js/weapons.js', 'js/minimap.js', 'js/ui.js', 'js/main.js'];
let failed = false;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    vm.runInContext(src, context, { filename: f });
    console.log('LOAD OK   ' + f);
  } catch (e) {
    console.error('LOAD FAIL ' + f + ' :: ' + e.stack.split('\n').slice(0, 8).join(' | '));
    failed = true;
  }
}
if (failed) process.exit(1);

const G = k => vm.runInContext(k, context);

// ---------------- 模拟游玩 ----------------
function step(frames, label) {
  for (let i = 0; i < frames; i++) {
    nowMs += 16.67;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('rAF 循环停止于 ' + label);
    cb(nowMs);
    // 处理 setTimeout(宝箱按钮等)
    while (pendingTimeouts.length) pendingTimeouts.shift()();
  }
}

try {
  // 启动帧
  step(5, 'boot');
  console.log('BOOT OK   引擎循环运行中');

  // 1. 点击标题进入主菜单
  const title = uiRoot.children[0];
  title.click();
  step(3, 'title→menu');

  // 2. 主菜单 → 开始远征
  const startBtn = findByText(uiRoot, '开始远征');
  if (!startBtn) throw new Error('找不到"开始远征"按钮');
  startBtn.click();
  step(3, 'menu→chars');

  // 3. 下一步 → 选图
  findByText(uiRoot, '下一步').click();
  step(3, 'chars→maps');

  // 4. 出发!
  findByText(uiRoot, '出发').click();
  console.log('RUN OK    开局成功(骑士 · 幽暗墓园)');

  // 5. 跑 60 秒游戏逻辑(3600帧),期间自动处理升级弹窗
  //    弹窗可见 = 顶层元素 classList 恰好含 'modal' 且不含 'hidden'
  function clickModals() {
    const openModals = findAll(uiRoot, el => el.classList.contains('modal') && !el.classList.contains('hidden'));
    let clicked = 0;
    for (const m of openModals) {
      const cards = findAll(m, el => el.classList.contains('lu-card'));
      if (cards.length) { cards[0].click(); clicked++; continue; }
      const take = findByText(m, '收下');
      if (take) { take.click(); clicked++; }
    }
    return clicked;
  }
  const stats = () => G('Meta.data().stats');

  // 模拟走位:随机八方向,每 2 秒换向
  function isVisible(el) { let cur = el; while (cur) { if (cur._cls && cur._cls.has('hidden')) return false; cur = cur.parent; } return true; }
  const DIRS = [['KeyW'], ['KeyW', 'KeyD'], ['KeyD'], ['KeyS', 'KeyD'], ['KeyS'], ['KeyS', 'KeyA'], ['KeyA'], ['KeyW', 'KeyA']];
  let held = [];
  function setDir(codes) {
    held.forEach(c => (winHandlers.keyup || []).forEach(f => f({ code: c })));
    held = codes;
    held.forEach(c => (winHandlers.keydown || []).forEach(f => f({ code: c, preventDefault: () => {} })));
  }

  // 拟真节奏:走 1 秒(聚怪/捡晶)、站 2 秒(输出)
  function paceDir(sec, salt) {
    if (sec % 3 === 0) setDir(DIRS[(sec / 3 + salt) % 8 | 0]);
    else setDir([]);
  }
  let picks = 0, died = false;
  for (let sec = 0; sec < 60; sec++) {
    paceDir(sec, 0);
    step(60, 't=' + sec + 's');
    picks += clickModals();
    const again = findByText(uiRoot, '再来一局');
    if (again && isVisible(again)) { died = true; console.log('  死亡于 t≈' + sec + 's(站桩+随机走位下正常)'); break; }
    if (sec % 20 === 19) {
      console.log('  probe t=' + (sec + 1) + 's alive=' + G('Entities.countAlive()') + ' kills=' + stats().kills + ' picks=' + picks);
    }
  }
  console.log('SIM OK    第一阶段完成,升级选择 ' + picks + ' 次,累计击杀 ' + stats().kills);
  if (picks < 1) console.warn('WARN      没有触发升级——经验链路可能有问题');

  // 6. ESC 暂停/恢复(仅在仍在局内时)
  if (!died) {
    (winHandlers.keydown || []).forEach(f => f({ code: 'Escape', preventDefault: () => {} }));
    step(3, 'pause');
    const resume = findByText(uiRoot, '继续');
    if (resume && isVisible(resume)) { resume.click(); step(3, 'resume'); console.log('PAUSE OK  暂停/恢复正常'); }
  }

  // 7. 继续跑到 160 秒或死亡(覆盖 2:00 精英与 2:30 蝙蝠环事件)
  for (let sec = 0; sec < 100 && !died; sec++) {
    paceDir(sec, 3);
    step(60, 'phase2 t=' + sec);
    clickModals();
    const again = findByText(uiRoot, '再来一局');
    if (again && isVisible(again)) { died = true; console.log('  死亡于第二阶段 t≈' + (60 + sec) + 's'); }
  }
  setDir([]);
  const st2 = stats();
  const aliveSec = Math.max(1, st2.bestSurvive || 160);
  const rate = st2.kills / aliveSec;
  console.log('SIM2 OK   击杀 ' + st2.kills + '(' + rate.toFixed(2) + '/秒),金币获得 ' + st2.goldEarned + ',最佳存活 ' + st2.bestSurvive + 's');
  if (rate < 0.25) { console.error('FAIL      击杀效率 ' + rate.toFixed(2) + '/秒过低,战斗链路异常'); process.exit(1); }

  // 8. 死亡后重开一局(验证对象池/状态复位)
  if (died) {
    findByText(uiRoot, '再来一局').click(); step(3, 'restart→chars');
    findByText(uiRoot, '下一步').click(); step(3, 'chars→maps');
    findByText(uiRoot, '出发').click();
    const beforeKills = stats().kills;
    for (let sec = 0; sec < 20; sec++) {
      paceDir(sec, 0);
      step(60, 'run2 t=' + sec);
      clickModals();
    }
    setDir([]);
    const afterKills = stats().kills;
    console.log('RUN2 OK   第二局 20 秒,新增击杀 ' + (afterKills - beforeKills));
    if (afterKills - beforeKills < 3) { console.error('FAIL      重开后战斗异常'); process.exit(1); }
  }
  console.log('\n=== 无头冒烟测试全部通过 ===');
} catch (e) {
  console.error('\n!!! 冒烟测试失败: ' + e.stack);
  process.exit(1);
}
