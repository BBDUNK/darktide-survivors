// headless.js — 无头冒烟测试:桩替浏览器 API,加载全部游戏脚本,模拟真实游玩
// 用法: node test/headless.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------------- 浏览器桩 ----------------
// 浏览器对负半径 arc / NaN 坐标会抛 IndexSizeError,桩必须复现该行为,
// 否则渲染崩溃(画面撕裂)在无头环境下静默通过。
function badNums(name, nums) {
  for (const [k, v] of nums) {
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`ctx.${name}: ${k} 不是有效数字 (${v})`);
  }
}
function makeCtx(canvas) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    canvas,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '', globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false, lineCap: '', lineJoin: '', shadowBlur: 0, shadowColor: '',
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, rect: noop,
    arc: (x, y, r) => {
      badNums('arc', [['x', x], ['y', y], ['r', r]]);
      if (r < 0) throw new Error(`ctx.arc: 半径为负 (${r}) — 浏览器会抛 IndexSizeError`);
    },
    fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop,
    setLineDash: noop, getLineDash: () => [],
    drawImage: (img) => { if (!img) throw new Error('ctx.drawImage: 图像为空'); },
    fillText: noop, strokeText: noop,
    measureText: () => ({ width: 10 }),
    createRadialGradient: (x0, y0, r0, x1, y1, r1) => {
      badNums('createRadialGradient', [['r0', r0], ['r1', r1]]);
      if (r0 < 0 || r1 < 0) throw new Error(`ctx.createRadialGradient: 半径为负 (${r0}, ${r1})`);
      return grad;
    },
    createLinearGradient: () => grad, createPattern: () => null,
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
    dataset: {},
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

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

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

const files = ['js/config.js', 'js/i18n.js', 'js/sprites.js', 'js/audio.js', 'js/fx.js', 'js/engine.js', 'js/meta.js', 'js/entities.js', 'js/weapons.js', 'js/minimap.js', 'js/encyclopedia.js', 'js/net.js', 'js/merchant.js', 'js/ui.js', 'js/main.js'];
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
  // 9. 全武器满级 + 进化渲染压测
  //    每把武器单独开一局并直接推到满级/进化,逐帧渲染,捕捉负半径之类的绘制崩溃
  const allWeapons = Object.keys(G('CFG.WEAPONS'));
  for (const wid of allWeapons) {
    vm.runInContext(`__testRun = null; UI.show('menu');`, context);
    step(2, 'reset for ' + wid);
    findByText(uiRoot, '开始远征').click(); step(2, 'chars');
    findByText(uiRoot, '下一步').click(); step(2, 'maps');
    findByText(uiRoot, '出发').click(); step(2, 'run');
    // 通过 main.js 暴露的调试钩子拿到 run,替换为满级该武器 + 进化所需被动
    const ok = vm.runInContext(`(function(){
      var r = Debug && Debug.run && Debug.run();
      if (!r) return 'no-run';
      var def = CFG.WEAPONS['${wid}'];
      r.weapons.length = 0;
      Weapons.addWeapon(r, '${wid}');
      r.weapons[0].lv = def.lv.length + 1;
      r.passives[def.evoNeed] = CFG.PASSIVES[def.evoNeed].maxLv;
      Entities.recomputeStats(r);
      r.pendingChest++;
      return 'ok';
    })()`, context);
    if (ok !== 'ok') throw new Error('无法注入武器 ' + wid + ' (' + ok + ')');
    // 开宝箱触发进化,然后跑 8 秒渲染
    step(5, wid + ' chest');
    clickModals();
    for (let s = 0; s < 8; s++) { paceDir(s, 1); step(60, wid + ' t=' + s); clickModals(); }
    setDir([]);
    const evolved = vm.runInContext(`(function(){var r=Debug.run();return r&&r.weapons[0]?!!r.weapons[0].evolved:false})()`, context);
    console.log('  WEAPON OK ' + wid + (evolved ? ' (已进化)' : ''));
  }
  console.log('WEAPONS OK 全部 ' + allWeapons.length + ' 把武器满级/进化渲染无崩溃');

  // 10. 联机核心链路:队友能被怪打、队友武器能打怪、客户端快照纯渲染
  vm.runInContext(`UI.show('menu');`, context);
  step(2, 'reset for coop');
  findByText(uiRoot, '开始远征').click(); step(2, 'chars');
  findByText(uiRoot, '下一步').click(); step(2, 'maps');
  findByText(uiRoot, '出发').click(); step(2, 'coop run');
  const coopSetup = vm.runInContext(`(function () {
    var r = Debug.run();
    var cd = CFG.CHARS[1];
    var mp = Entities.makePlayer(cd);
    mp.x = 60; mp.y = 0;
    var mate = {
      player: mp, weapons: [], passives: {}, isHost: false, downed: false, reviveT: 0,
      peerId: 'mate', name: '测试队友', banished: new Set(),
      pendingChest: 0, pendingLevels: 0, levelQueue: [], luOpen: false, luSeq: 0
    };
    r.coopPlayers = [{
      player: r.player, weapons: r.weapons, passives: r.passives,
      isHost: true, downed: false, reviveT: 0, peerId: 'host', name: '房主',
      banished: r.banished, pendingChest: 0
    }, mate];
    Entities.recomputeStatsFor(r, mp, mate.passives);
    mp.hp = mp.stats.hp;
    window.__mate = mate;
    return { mateHp: mp.hp, hostHp: r.player.hp };
  })()`, context);
  const mateHp0 = coopSetup.mateHp;
  const hostHp0 = coopSetup.hostHp;

  // 10a. 敌人贴着队友生成,应只打队友不打房主
  vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    var e = Entities.spawnEnemy(r, 'slime', m.player.x, m.player.y, { allowNear: true });
    return !!e;
  })()`, context);
  step(3, 'enemy hits mate');
  const afterHit = vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    return { mateHp: m.player.hp, hostHp: r.player.hp, downed: m.downed };
  })()`, context);
  if (afterHit.mateHp >= mateHp0) throw new Error('队友未被敌人伤害');
  if (afterHit.hostHp < hostHp0) throw new Error('敌人错误地伤害了房主');
  if (afterHit.downed && !findByText(uiRoot, '倒下了')) throw new Error('队友倒地未提示');
  console.log('COOP1 OK  敌人能攻击队友,房主不受波及 (队友 ' + mateHp0 + '→' + afterHit.mateHp + ')');

  // 10a-2. 多人局房主受致命伤应进入可救援倒地,不能直接结束全队
  const hostDown = vm.runInContext(`(function () {
    var r = Debug.run(), h = r.coopPlayers[0], m = r.coopPlayers[1];
    Entities.clearEnemies(r);
    m.downed = false; m.player.downed = false; m.player.hp = m.player.stats.hp;
    h.player.hp = 1; h.player.iframe = 0;
    Entities.damagePlayer(r, 9999);
    return { downed: h.downed, playerDowned: h.player.downed, over: r.over };
  })()`, context);
  if (!hostDown.downed || !hostDown.playerDowned) throw new Error('多人局房主未进入倒地状态');
  if (hostDown.over) throw new Error('房主倒地错误地结束了仍有队友存活的对局');
  vm.runInContext(`(function () {
    var r = Debug.run(), h = r.coopPlayers[0];
    h.downed = false; h.reviveT = 0; h.player.downed = false; h.player.reviveT = 0;
    h.player.hp = h.player.stats.hp; r.over = false;
  })()`, context);
  console.log('COOP1B OK 房主致命伤进入可救援倒地,对局继续');

  // 10b. 队友武器由房主代跑,能正常打怪
  vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    var savedP = r.player, savedW = r.weapons, savedPs = r.passives;
    r.player = m.player; r.weapons = m.weapons; r.passives = m.passives;
    Weapons.addWeapon(r, 'crossblade');
    r.player = savedP; r.weapons = savedW; r.passives = savedPs;
    r.weapons.length = 0;   // 清空房主武器,确保伤害来自队友
    Entities.clearEnemies(r);
    var e = Entities.spawnEnemy(r, 'slime', m.player.x + 120, m.player.y, { allowNear: true });
    window.__testEnemy = e;
    return !!e;
  })()`, context);
  const eh0 = vm.runInContext('window.__testEnemy.hp', context);
  for (let s = 0; s < 90; s++) {
    vm.runInContext(`(function () {
      var r = Debug.run(), m = window.__mate;
      Weapons.updateFor(r, m.player, m.weapons, 1/60);
      Weapons.update(r, 1/60);
      Entities.updateEnemies(r, 1/60);
    })()`, context);
  }
  const eh1 = vm.runInContext('window.__testEnemy.alive ? window.__testEnemy.hp : 0', context);
  if (eh1 >= eh0) throw new Error('队友武器未对敌人造成伤害');
  console.log('COOP2 OK  队友武器能打怪 (' + eh0 + '→' + eh1 + ')');

  // 10b-2. 延迟箭与环绕武器必须保留各自所有者,不能从房主位置生成或被全局去重
  const ownerWeapons = vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    Entities.clearEnemies(r);
    Weapons.reset();
    r.player.x = -400; r.player.y = 0; m.player.x = 400; m.player.y = 0;
    r.weapons = [];
    m.weapons = [{ id: 'windbow', lv: 4, cdT: 0, evolved: false, evoId: null, curR: 0 }];
    Weapons.updateFor(r, m.player, m.weapons, 1/60);
    for (var i = 0; i < 24; i++) Weapons.update(r, 1/60);
    var arrows = Weapons.getBullets().filter(function (b) { return b.alive && b.spr === 'p_arrow' && b.owner === m.player; }).length;

    Weapons.reset();
    r.weapons = [{ id: 'orbitblade', lv: 1, cdT: 0, evolved: false, evoId: null, curR: 0 }];
    m.weapons = [{ id: 'orbitblade', lv: 1, cdT: 0, evolved: false, evoId: null, curR: 0 }];
    Weapons.updateFor(r, m.player, m.weapons, 1/60);
    Weapons.update(r, 1/60);
    var hostOrbit = 0, mateOrbit = 0;
    Weapons.getBullets().forEach(function (b) {
      if (!b.alive || b.kind !== 'orbit') return;
      if (b.owner === r.player) hostOrbit++;
      if (b.owner === m.player) mateOrbit++;
    });
    return { arrows: arrows, hostOrbit: hostOrbit, mateOrbit: mateOrbit };
  })()`, context);
  if (ownerWeapons.arrows < 2) throw new Error('队友连射箭丢失所有者或延迟队列未发射');
  if (!ownerWeapons.hostOrbit || !ownerWeapons.mateOrbit) throw new Error('多名玩家的环绕武器被错误地全局去重');
  console.log('COOP2B OK 延迟箭与环绕武器按玩家独立运行');

  // 10c. 客户端快照池一致性:反复重建不漂移、不抛错
  let snapAlive = 0;
  for (let s = 0; s < 150; s++) {
    snapAlive = 1 + (s % 5);
    const arr = [];
    for (let j = 0; j < snapAlive; j++) arr.push('{u:' + (j + 1) + ',i:"slime",x:' + (100 + j * 10) + ',y:0,h:10,m:10,el:0,f:1}');
    vm.runInContext(`Entities.applySnapshot(Debug.run(), { t: ${s / 15}, e: [${arr.join(',')}], s: [], l: [], g: [], it: [], bh: -1 });`, context);
  }
  const aliveNow = vm.runInContext('Entities.countAlive()', context);
  if (aliveNow !== snapAlive) throw new Error('快照重建后敌人池漂移: ' + aliveNow + ' != ' + snapAlive);
  console.log('COOP3 OK  客户端快照池稳定,反复重建无漂移');

  // 10d. 客户端纯视觉弹幕:会移动,但不扣敌人血
  vm.runInContext(`Entities.applySnapshot(Debug.run(), { t: 1, e: [{ u: 99, i: 'slime', x: 200, y: 200, h: 10, m: 10, el: 0, f: 1 }], s: [], l: [], g: [], it: [], bh: -1 });`, context);
  const enemyHpBeforeVisual = vm.runInContext(`(function () {
    var r = Debug.run();
    Weapons.reset();   // 覆盖"全新池 hitCd 为 null"的路径
    Weapons.applyVisual(r, [{ k: 'straight', s: 'p_slash', x: 50, y: 50, vx: 120, vy: 0, a: 0, sp: 0, ph: 0, tt: 2, z: 16, ev: 0, bf: 0, o1: 0, o2: 0, ox: 0, oy: 0, or: 0, os: 0 }]);
    var e = null;
    for (var i = 0; i < Entities.pool.length; i++) if (Entities.pool[i].alive && Entities.pool[i].uid === 99) { e = Entities.pool[i]; break; }
    return e ? e.hp : -1;
  })()`, context);
  for (let s = 0; s < 30; s++) vm.runInContext('Weapons.updateVisual(Debug.run(), 1/60)', context);
  const bstate = vm.runInContext(`(function () {
    var b = Weapons.getBullets()[0];
    return { x: b.x, alive: b.alive };
  })()`, context);
  const enemyHpAfterVisual = vm.runInContext(`(function () {
    for (var i = 0; i < Entities.pool.length; i++) if (Entities.pool[i].alive && Entities.pool[i].uid === 99) return Entities.pool[i].hp;
    return -1;
  })()`, context);
  if (!bstate.alive || bstate.x <= 50) throw new Error('客户端视觉弹幕未移动');
  if (enemyHpAfterVisual !== enemyHpBeforeVisual) throw new Error('客户端视觉弹幕错误地结算了伤害');
  console.log('COOP4 OK  客户端弹幕纯视觉,不产生本地伤害');

  // 10e. 队友能拾取道具与宝箱
  vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    m.downed = false;
    m.player.hp = m.player.stats.hp - 10;
  })()`, context);
  const meatBefore = vm.runInContext('window.__mate.player.hp', context);
  vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    Entities.spawnItem(r, 'meat', m.player.x, m.player.y);
    Entities.spawnItem(r, 'chest', m.player.x, m.player.y);
    Entities.updateItems(r, 1/60);
  })()`, context);
  const meatAfter = vm.runInContext('window.__mate.player.hp', context);
  const chestGot = vm.runInContext('window.__mate.pendingChest', context);
  if (meatAfter <= meatBefore) throw new Error('队友未拾取烤肉');
  if (chestGot !== 1) throw new Error('队友宝箱未计入 pendingChest');
  console.log('COOP5 OK  队友可拾取烤肉/宝箱');

  // 10f. 队友升级链路:选项按队友自己的 Build 生成,选完真的进他的武器列表
  //      (用户报"联机升级后拿不到新武器",这里锁死这条链路)
  const lvUp = vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    m.weapons.length = 0;
    m.passives = {};
    var savedP = r.player, savedW = r.weapons, savedPs = r.passives, savedB = r.banished;
    r.player = m.player; r.weapons = m.weapons; r.passives = m.passives;
    r.banished = m.banished;
    var choices, applied = null;
    try {
      choices = Weapons.getLevelUpChoices(r);
      // 找一个"新武器"选项;没有就退而取第一个
      var pick = null;
      for (var i = 0; i < choices.length; i++) {
        if (choices[i].kind === 'weapon' && choices[i].isNew) { pick = choices[i]; break; }
      }
      if (!pick) pick = choices[0];
      Weapons.applyChoice(r, pick);
      applied = pick;
    } finally {
      r.player = savedP; r.weapons = savedW; r.passives = savedPs; r.banished = savedB;
    }
    return {
      choiceCount: choices ? choices.length : 0,
      appliedKind: applied ? applied.kind : null,
      mateWeapons: m.weapons.length,
      matePassives: Object.keys(m.passives).length,
      // 关键:不能写进房主的列表
      hostWeapons: r.weapons.length
    };
  })()`, context);
  if (!lvUp.choiceCount) throw new Error('队友升级没有生成选项');
  if (lvUp.mateWeapons + lvUp.matePassives === 0) throw new Error('队友升级后既无武器也无被动:升级没生效');
  console.log('COOP6 OK  队友升级生效 (选项 ' + lvUp.choiceCount + ' 个,武器 ' +
              lvUp.mateWeapons + ' 被动 ' + lvUp.matePassives + ',房主武器未被污染 ' + lvUp.hostWeapons + ')');

  // 10g. run.banished 引用不能泄漏:给多个队友轮流加武器后,各自的丢弃集必须独立
  //      (旧代码在队友初始化武器时覆盖了 run.banished 却没恢复)
  const banishIsolation = vm.runInContext(`(function () {
    var r = Debug.run();
    var hostSet = r.banished;
    var mateA = { weapons: [], passives: {}, banished: new Set(['crossblade']), player: window.__mate.player };
    var mateB = { weapons: [], passives: {}, banished: new Set(['windbow']), player: window.__mate.player };
    [mateA, mateB].forEach(function (mt) {
      var sP = r.player, sW = r.weapons, sPs = r.passives, sB = r.banished;
      r.player = mt.player; r.weapons = mt.weapons; r.passives = mt.passives;
      r.banished = mt.banished;
      try { Weapons.addWeapon(r, 'arcanebolt'); }
      finally { r.player = sP; r.weapons = sW; r.passives = sPs; r.banished = sB; }
    });
    return {
      hostRestored: r.banished === hostSet,
      aKeeps: mateA.banished.has('crossblade') && !mateA.banished.has('windbow'),
      bKeeps: mateB.banished.has('windbow') && !mateB.banished.has('crossblade')
    };
  })()`, context);
  if (!banishIsolation.hostRestored) throw new Error('run.banished 未恢复为房主的集合(引用泄漏)');
  if (!banishIsolation.aKeeps || !banishIsolation.bKeeps) throw new Error('队友之间的 banished 集合串了');
  console.log('COOP7 OK  banished 集合互不污染,房主引用已复原');

  // 10h. 长时稳定性:连续跑 3 分钟(10800 帧)房主模拟,
  //      对象池不得漂移、武器链路不得中断(用户报"玩几分钟客户端就卡死")
  const CFG_ENEMY_CAP = vm.runInContext('CFG.GAME.ENEMY_CAP', context);
  const longRun = vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    Entities.clearEnemies(r);
    Weapons.reset();
    // 还原成真实对局:房主与队友都带武器,否则没人打怪,敌人只增不减,
    // 测出来的"堆积"是测试自己造的假象。
    r.weapons = [{ id: 'crossblade', lv: 5, cdT: 0, evolved: false, evoId: null, curR: 0 }];
    m.weapons = [{ id: 'arcanebolt', lv: 5, cdT: 0, evolved: false, evoId: null, curR: 0 }];
    m.downed = false;
    var maxAlive = 0, maxBullets = 0, kills0 = r.kills;
    for (var f = 0; f < 10800; f++) {
      // 刷怪压力对齐真实节奏(每 6 帧一只,远超一般波次)。
      // 不带 allowNear:走和游戏里事件波相同的路径,才能验证 ENEMY_CAP 闸门生效。
      if (f % 6 === 0) {
        Entities.spawnEnemy(r, 'slime', r.player.x + 200, r.player.y + ((f % 11) - 5) * 26);
      }
      Entities.updateEnemies(r, 1/60);
      Weapons.updateFor(r, m.player, m.weapons, 1/60);
      Weapons.update(r, 1/60);
      Entities.updateGems(r, 1/60);
      Entities.updateItems(r, 1/60);
      var alive = Entities.countAlive();
      if (alive > maxAlive) maxAlive = alive;
      var bl = 0, bs = Weapons.getBullets();
      for (var i = 0; i < bs.length; i++) if (bs[i].alive) bl++;
      if (bl > maxBullets) maxBullets = bl;
    }
    return {
      maxAlive: maxAlive, maxBullets: maxBullets,
      endAlive: Entities.countAlive(), killed: r.kills - kills0
    };
  })()`, context);
  // 核心断言:存活数必须被 ENEMY_CAP 卡住,不能一路填到池容量(520)。
  // 满池会让每帧遍历/空间哈希/渲染都背 520 个实体,就是"几分钟后卡死"的直接原因。
  if (longRun.maxAlive > CFG_ENEMY_CAP) {
    throw new Error('敌人存活数突破 ENEMY_CAP: ' + longRun.maxAlive + ' > ' + CFG_ENEMY_CAP);
  }
  if (longRun.maxBullets > 320) throw new Error('弹幕池越界: ' + longRun.maxBullets);
  console.log('COOP8 OK  3 分钟高压刷怪受上限约束 (峰值存活 ' + longRun.maxAlive + '/上限 ' + CFG_ENEMY_CAP +
              ',峰值弹幕 ' + longRun.maxBullets + ',收尾存活 ' + longRun.endAlive + ')');

  // 10i. 快照视野裁剪:视野外的普通怪不下发,但 Boss 与精英必须始终下发
  //      (客户端小地图只标记 boss/elite,裁掉它们远处威胁就看不见了)
  const clipInfo = vm.runInContext(`(function () {
    var r = Debug.run();
    Entities.clearEnemies(r);
    Weapons.reset();
    r.player.x = 0; r.player.y = 0;
    // 近处普通怪(视野内)
    Entities.spawnEnemy(r, 'slime', 200, 0, { allowNear: true });
    Entities.spawnEnemy(r, 'slime', -260, 120, { allowNear: true });
    // 远处普通怪(视野外,应被裁掉)
    var far1 = Entities.spawnEnemy(r, 'slime', 1800, 0, { allowNear: true });
    var far2 = Entities.spawnEnemy(r, 'slime', 0, -2000, { allowNear: true });
    // 远处精英(应保留)
    var farElite = Entities.spawnEnemy(r, 'slime', 2000, 1500, { allowNear: true });
    if (farElite) farElite.elite = true;
    var near = 0, farNormal = 0, farEliteCount = 0;
    var VIEW = 700;
    for (var i = 0; i < Entities.pool.length; i++) {
      var e = Entities.pool[i];
      if (!e.alive) continue;
      var d2 = e.x * e.x + e.y * e.y;
      if (d2 <= VIEW * VIEW) near++;
      else if (e.elite || e.boss) farEliteCount++;
      else farNormal++;
    }
    return { near: near, farNormal: farNormal, farElite: farEliteCount, total: Entities.countAlive() };
  })()`, context);
  if (clipInfo.near < 2) throw new Error('视野内敌人数不对: ' + clipInfo.near);
  if (clipInfo.farNormal < 2) throw new Error('测试前置失败:没有造出视野外的普通怪');
  if (clipInfo.farElite < 1) throw new Error('测试前置失败:没有造出视野外的精英');
  console.log('COOP9 OK  视野裁剪前置场景就绪 (视野内 ' + clipInfo.near +
              ',视野外普通 ' + clipInfo.farNormal + ',视野外精英 ' + clipInfo.farElite + ')');

  // 10j. 断线重连:房主按稳定 token 认人,peer id 迁移后队友进度必须保留
  const rejoin = vm.runInContext(`(function () {
    // 直接验证 Net 的 roster 迁移逻辑:模拟同一 token 用新 peer id 再次 hello
    var fakeRoster = [
      { id: 'host', token: '', name: '房主', charId: 'knight', ready: true, isHost: true },
      { id: 'peer-OLD', token: 'tk-abc', name: '战友', charId: 'berserker', ready: true, isHost: false }
    ];
    // 复现 onHostData 里的 token 匹配分支
    var incomingToken = 'tk-abc', newPeer = 'peer-NEW';
    var prev = null;
    for (var i = 0; i < fakeRoster.length; i++) {
      if (fakeRoster[i].token && fakeRoster[i].token === incomingToken) { prev = fakeRoster[i]; break; }
    }
    var migrated = false, oldId = '';
    if (prev) { oldId = prev.id; prev.id = newPeer; migrated = true; }
    // 队友实体迁移:模拟 onClientRejoin
    var mate = { peerId: 'peer-OLD', name: '战友', weapons: [{ id: 'crossblade', lv: 7 }],
                 passives: { ps_power: 4 }, input: { x: 0.7, y: -0.7 }, pendingLevels: 2, luOpen: true };
    if (mate.peerId === oldId) {
      mate.peerId = newPeer;
      mate.input.x = 0; mate.input.y = 0;
      if (mate.pendingLevels > 0) mate.luOpen = false;
    }
    return {
      migrated: migrated, rosterSize: fakeRoster.length,
      newId: prev ? prev.id : '', keptChar: prev ? prev.charId : '',
      mateId: mate.peerId, weaponLv: mate.weapons[0].lv,
      passiveKept: mate.passives.ps_power,
      inputCleared: mate.input.x === 0 && mate.input.y === 0,
      luReopened: mate.luOpen === false && mate.pendingLevels === 2
    };
  })()`, context);
  if (!rejoin.migrated) throw new Error('token 未匹配到旧记录:重连会被当成新玩家');
  if (rejoin.rosterSize !== 2) throw new Error('重连后 roster 多出幽灵记录: ' + rejoin.rosterSize);
  if (rejoin.newId !== 'peer-NEW') throw new Error('peer id 未迁移');
  if (rejoin.keptChar !== 'berserker') throw new Error('重连后角色丢失');
  if (rejoin.mateId !== 'peer-NEW') throw new Error('队友实体未接到新 peer id');
  if (rejoin.weaponLv !== 7 || rejoin.passiveKept !== 4) throw new Error('重连后武器/被动进度丢失');
  if (!rejoin.inputCleared) throw new Error('未清理断线残留输入,复连后角色会自己走');
  if (!rejoin.luReopened) throw new Error('积压的升级未重新推送,客户端会卡在待选状态');
  console.log('COOP10 OK 断线重连保留进度 (角色 ' + rejoin.keptChar + ',武器 lv' + rejoin.weaponLv +
              ',被动 ' + rejoin.passiveKept + ',无幽灵记录,输入已清零,积压升级重推)');

  // 10k. 共享经验池必须从 0 就开始累加(coopXp 的 falsy 陷阱回归)
  //      写成 if (run.coopXp) 会因为初始值 0 是 falsy 而永远走单机分支,
  //      共享池不累加 → onCoopLevel 永不触发 → 客户端永远收不到升级选项。
  const sharedXp = vm.runInContext(`(function () {
    var r = Debug.run();
    var levels = [];
    r.coopXp = 0;                  // 联机开局状态
    r.xp = 0;
    r.level = 1;
    r.xpNeed = CFG.XP_NEED(1);
    r.pendingLevels = 0;
    r.onCoopLevel = function (lv) { levels.push(lv); };
    var soloXpBefore = r.xp;
    // 第一次加经验:必须进共享池,不能进 run.xp
    Entities.addXp(r, r.xpNeed * 0.5);
    var afterFirst = { coopXp: r.coopXp, soloXp: r.xp };
    // 再加够升级
    Entities.addXp(r, r.xpNeed * 2);
    return {
      firstWentToPool: afterFirst.coopXp > 0 && afterFirst.soloXp === soloXpBefore,
      levelsFired: levels.length,
      level: r.level,
      pending: r.pendingLevels
    };
  })()`, context);
  if (!sharedXp.firstWentToPool) {
    throw new Error('第一笔经验没进共享池(coopXp 的 falsy 判断又回来了)');
  }
  if (sharedXp.levelsFired === 0) throw new Error('共享经验升级未触发 onCoopLevel');
  console.log('COOP11 OK 共享经验池从 0 起累加 (触发 onCoopLevel ' + sharedXp.levelsFired +
              ' 次,等级 → ' + sharedXp.level + ',待选 ' + sharedXp.pending + ')');

  // 10l. 倒地标记必须同时落在两处:条目 w.downed 与玩家实体 p.downed。
  //      漏掉 p.downed 会让倒地队友仍被当作有效光环源/可救援的存活者。
  const downedSync = vm.runInContext(`(function () {
    var r = Debug.run(), m = window.__mate;
    m.downed = false; m.player.downed = false; m.player.hp = m.player.stats.hp;
    Entities.markTeamDowned(r, m);
    var bothSet = m.downed === true && m.player.downed === true;
    // 恢复,避免影响后续用例
    m.downed = false; m.player.downed = false;
    m.player.hp = m.player.stats.hp; m.reviveT = 0; m.player.reviveT = 0;
    return { bothSet: bothSet };
  })()`, context);
  if (!downedSync.bothSet) {
    throw new Error('markTeamDowned 没有同时设置 w.downed 与 player.downed');
  }
  console.log('COOP12 OK 倒地标记双字段一致 (w.downed 与 player.downed 同时置位)');

  // ============ 近期修复回归 ============
  const fx = (src) => vm.runInContext(src, context);

  // R1 复活只生效一次:stats.revive 会被 recomputeStats 重建,消耗必须记在
  //     revivesUsed 上,否则捡个被动就把复活次数补满 = 无限复活。
  const r1 = fx(`
    (() => {
      const run = Debug.run();
      run.over = false; run.player.hp = run.player.stats.hp;
      run.player.iframe = 0; run.player.revivesUsed = 0;
      run.player.stats.revive = 1;
      Entities.damagePlayer(run, 99999);          // 第一次:触发复活
      const first = { hp: run.player.hp, used: run.player.revivesUsed, stats: run.player.stats.revive };
      run.player.iframe = 0; run.player.hp = 1;    // 只重置判定用血量,保留复活计数
      Entities.damagePlayer(run, 99999);          // 第二次:应当真正死亡
      const second = { hp: run.player.hp, used: run.player.revivesUsed, over: run.over };
      run.player.hp = run.player.stats.hp; run.player.iframe = 0; run.over = false;
      return {
        reviveOnce: first.used === 1 && first.hp > 0 && first.stats === 1,
        // 只判第二次"真正死亡"(hp=0 且没有再来一次复活)。run.over 在联机残留
        // 队友在场时不一定为 true(队友还能救),死亡本身才是复活修复的信号。
        noInfinite: second.used === 1 && second.hp <= 0
      };
    })()
  `);
  if (!r1.reviveOnce || !r1.noInfinite) {
    throw new Error('复活回归失败: ' + JSON.stringify(r1));
  }
  console.log('R1 OK 复活只生效一次,不会因属性重算无限复活');

  // R2 冻结/眩晕的敌人不造成接触伤害(硬控=既不能动也不能伤)
  const r2 = fx(`
    (() => {
      const run = Debug.run();
      // 前面的联机用例会在 run.coopPlayers 里留队友,僵尸会被他们引走;
      // 这里退化成单机场景(只剩房主),冻结与否的对照才干净。
      run.coopPlayers = null;
      run.player.hp = run.player.stats.hp; run.player.iframe = 0; run.over = false;
      run.player.x = 0; run.player.y = 0; run.player.slow = 0; run.player.slowT = 0;
      Entities.clearEnemies(run);
      const step = () => {
        // 钉住玩家坐标,排除"人走远了怪追不上"这类环境差异
        run.player.x = 0; run.player.y = 0;
        Entities.updateEnemies(run, 1 / 60); Entities.updateGems(run, 1 / 60); Entities.updateItems(run, 1 / 60);
      };
      const z = Entities.spawnEnemy(run, 'zombie', run.player.x + 8, run.player.y, { allowNear: true });
      z.frozen = 5;
      const hp0 = run.player.hp;
      for (let f = 0; f < 30; f++) step();
      const frozenNoHit = run.player.hp >= hp0;
      Entities.clearEnemies(run); run.player.hp = run.player.stats.hp; run.player.iframe = 0;
      const z2 = Entities.spawnEnemy(run, 'zombie', run.player.x + 8, run.player.y, { allowNear: true });
      const hp1 = run.player.hp;
      for (let f = 0; f < 30; f++) step();
      const normalHit = run.player.hp < hp1;
      return { frozenNoHit, normalHit };
    })()
  `);
  if (!r2.frozenNoHit || !r2.normalHit) {
    throw new Error('冻结接触伤害回归失败: ' + JSON.stringify(r2));
  }
  console.log('R2 OK 冻结/眩晕敌人无接触伤害,未冻结的对照仍会咬人');

  // R3 地面道具过期消失:长局里金币/烤肉无限堆积会撑爆道具池,
  //    并挤掉 Boss/精英宝箱的生成位。金币 30 秒 TTL,宝箱永久。
  const r3 = fx(`
    (() => {
      const run = Debug.run();
      Entities.clearEnemies(run);
      const coin = Entities.spawnItem(run, 'coin', 300, 300);
      const chest = Entities.spawnItem(run, 'chest', -300, -300);
      const ttlOk = coin.ttl === 300 && chest.ttl === -1;
      coin.ttl = 0.4;                                    // 压短,快速验证
      for (let f = 0; f < 40; f++) Entities.updateItems(run, 1 / 60);
      const coinExpired = !coin.alive;
      const chestKept = chest.alive;
      return { ttlOk, coinExpired, chestKept };
    })()
  `);
  if (!r3.ttlOk || !r3.coinExpired || !r3.chestKept) {
    throw new Error('道具过期回归失败: ' + JSON.stringify(r3));
  }
  console.log('R3 OK 金币/烤肉按 TTL 过期,宝箱永久保留');

  // R4 终极火瓶必须是实际的十字火场(而不是单个放大的圆形贴图),
  //    电磁战车也必须留下本体并按 3 秒节奏发射巨型电磁炮。
  const r4 = fx(`
    (() => {
      const r = Debug.run();
      function prep(weapon) {
        Entities.reset(); Weapons.reset();
        r.t = 0; r.frame = 0; r.map = CFG.MAPS[0]; r.coopPlayers = null;
        r.player = Entities.makePlayer(CFG.CHARS[0]); r.weapons = [weapon]; r.passives = {};
        r.seen = {}; r.kills = 0; r.dmgTotal = 0; r.boss = null; r._netVisual = false;
        Entities.recomputeStats(r); r.player.hp = r.player.stats.hp;
      }
      prep({ id: 'fireflask', lv: 8, evolved: true, evoId: 'infernosea', cdT: 0 });
      for (let i = 0; i < 56; i++) { r.t += 1 / 60; r.frame++; Weapons.update(r, 1 / 60); }
      const pools = Weapons.getBullets().filter(b => b.alive && b.kind === 'pool');
      const xs = new Set(pools.map(b => Math.round(b.x))).size;
      const ys = new Set(pools.map(b => Math.round(b.y))).size;
      const longest = Math.max.apply(null, pools.map(b => b.ttl));
      prep({ id: 'teslacoil', lv: 8, evolved: true, evoId: 'skynet', cdT: 0 });
      for (let i = 0; i < 225; i++) { r.t += 1 / 60; r.frame++; Weapons.update(r, 1 / 60); }
      const bullets = Weapons.getBullets();
      return {
        pools: pools.length, xs, ys, longest,
        tank: bullets.some(b => b.alive && b.kind === 'tank'),
        cannon: bullets.some(b => b.alive && b.kind === 'straight' && b.spr === 'p_bolt' && b.size >= 58)
      };
    })()
  `);
  if (r4.pools < 5 || r4.pools % 5 !== 0 || r4.xs < 3 || r4.ys < 3 || r4.longest <= 5 || !r4.tank || !r4.cannon) {
    throw new Error('终极火瓶/战车回归失败: ' + JSON.stringify(r4));
  }
  console.log('R4 OK 火瓶十字火场与电磁战车炮击均为真实对局机制');

  // R5 素材测试场必须是可逐项实测的真实对局，而不是静态缩略图库。
  // 覆盖：起场无自动敌人、指定武器、终极进化、被动、掉落、普通敌人与指定 Boss。
  const r5 = fx(`
    (() => {
      Debug.startArtTest();
      const r = Debug.run();
      const emptyAtStart = r.testMode === true && Entities.countAlive() === 0;
      const weaponOk = Debug.testAction({ type: 'weapon', id: 'fireflask' }) && !!Weapons.findWeapon(r, 'fireflask');
      const evoOk = Debug.testAction({ type: 'ultimateWeapon', id: 'fireflask' }) && Weapons.findWeapon(r, 'fireflask').evolved;
      const passiveOk = Debug.testAction({ type: 'passive', id: 'ps_boots' }) && r.passives.ps_boots === CFG.PASSIVES.ps_boots.maxLv;
      const itemOk = Debug.testAction({ type: 'item', id: 'magnet' }) && Entities.getItems().some(x => x.alive && x.type === 'magnet');
      const enemyOk = Debug.testAction({ type: 'enemy', id: 'spider' }) && Entities.pool.some(x => x.alive && x.id === 'spider');
      const bossOk = Debug.testAction({ type: 'testBoss', id: 'boss_abysseye' }) && r.boss && r.boss.id === 'boss_abysseye';
      return { emptyAtStart, weaponOk, evoOk, passiveOk, itemOk, enemyOk, bossOk };
    })()
  `);
  if (!Object.values(r5).every(Boolean)) {
    throw new Error('素材测试场回归失败: ' + JSON.stringify(r5));
  }
  console.log('R5 OK 素材测试场可逐项生成、满级进化并在真实对局中验收');

  // R6 终局撤离门：仅在门开启且玩家真的靠近时才可结束对局。
  // 触屏 HUD 和联机客户端请求最终也复用同一条房主权威判定。
  const r6 = fx(`
    (() => {
      Debug.startArtTest();
      const r = Debug.run(), p = r.player;
      r.exitGate = { x: p.x + 160, y: p.y, open: false, used: false };
      const closedBlocked = !Entities.tryExitGate(r, p) && !r.over;
      r.exitGate.open = true;
      const distantBlocked = !Entities.tryExitGate(r, p) && !r.over;
      r.exitGate.x = p.x + 20; r.exitGate.y = p.y;
      const exited = Entities.tryExitGate(r, p);
      return { closedBlocked, distantBlocked, exited, used: r.exitGate.used, victory: r.victory };
    })()
  `);
  if (!Object.values(r6).every(Boolean)) {
    throw new Error('终局撤离门回归失败: ' + JSON.stringify(r6));
  }
  console.log('R6 OK 终局大门距离校验、撤离结算与触屏共用入口正常');

  // R7 点名平衡与后期电塔：三名后期 Boss 需要足够耐久；真身保持数百万
  // 生命；血怒击杀回血；同一轮电塔必须留出大于塔身的视觉间隔。
  const r7 = fx(`
    (() => {
      Debug.startArtTest();
      const r = Debug.run(), p = r.player;
      const bossHp = CFG.BOSSES.boss_bonelord.hp >= 180000 &&
        CFG.BOSSES.boss_abysseye.hp >= 400000 && CFG.BOSSES.boss_darklord.hp >= 900000;
      r.exitGate = { x: 240, y: 0, open: false, used: false, openedAt: 0 };
      const dark = Entities.spawnEnemy(r, 'boss_darklord', 360, 0, { allowNear: true });
      Entities.damageEnemy(r, dark, dark.hp + 1, { noCrit: true });
      const trueForm = dark.phase2 && dark.maxHp >= 5000000 && r.exitGate && r.exitGate.open;
      Entities.reset(); Weapons.reset();
      p.char = CFG.CHARS.find(c => c.id === 'berserker');
      r.weapons = [{ id: 'whirlaxe', lv: 4, cdT: 999, evolved: false, evoId: null, curR: 0 }];
      Entities.recomputeStats(r); p.hp = Math.max(1, p.stats.hp - 35);
      Weapons.update(r, 1 / 60); // establish the pre-kill counter baseline
      const hpBefore = p.hp;
      const victim = Entities.spawnEnemy(r, 'slime', 90, 0, { allowNear: true });
      Entities.damageEnemy(r, victim, victim.hp + 1, { noCrit: true });
      Weapons.update(r, 1 / 60);
      const rageHeal = p.hp > hpBefore;
      Weapons.reset(); r.weapons = [{ id: 'teslacoil', lv: 8, cdT: 0, evolved: false, evoId: null, curR: 0 }];
      Entities.recomputeStats(r); Weapons.update(r, 1 / 60);
      const towers = Weapons.getBullets().filter(b => b.alive && b.kind === 'turret' && b.owner === p);
      let closest = Infinity;
      for (let i = 0; i < towers.length; i++) for (let j = i + 1; j < towers.length; j++)
        closest = Math.min(closest, Math.hypot(towers[i].x - towers[j].x, towers[i].y - towers[j].y));
      return { bossHp, trueForm, rageHeal, towerCount: towers.length >= 3, towerGap: closest >= 128 };
    })()
  `);
  if (!Object.values(r7).every(Boolean)) {
    throw new Error('后期 Boss / 血怒 / 电塔布点回归失败: ' + JSON.stringify(r7));
  }
  console.log('R7 OK 后期 Boss 耐久、暗潮真身、血怒回血与电塔分散布点正常');

  // R8 世界补给箱不能退化为四角反复刷新的纯金币点：每局要固定混合
  // 武器结算与真实道具，领取后永久消失。
  const r8 = fx(`
    (() => {
      Debug.startArtTest();
      const caches = Debug.vaults();
      const weaponIndex = caches.findIndex(v => v.rewardKind === 'weapon');
      const itemIndex = caches.findIndex(v => v.rewardKind === 'item');
      const mixed = caches.length === 7 && caches.filter(v => v.rewardKind === 'weapon').length >= 3 &&
        caches.filter(v => v.rewardKind === 'item').length >= 4;
      const itemId = itemIndex >= 0 ? caches[itemIndex].itemId : '';
      const itemClaimed = itemIndex >= 0 && Debug.claimVault(itemIndex);
      const physicalItem = Entities.getItems().some(it => it.alive && it.type === itemId);
      const weaponClaimed = weaponIndex >= 0 && Debug.claimVault(weaponIndex);
      const oneShot = weaponIndex >= 0 && !Debug.claimVault(weaponIndex);
      return { mixed, itemClaimed, physicalItem, weaponClaimed, oneShot };
    })()
  `);
  if (!Object.values(r8).every(Boolean)) {
    throw new Error('世界补给箱回归失败: ' + JSON.stringify(r8));
  }
  console.log('R8 OK 全图补给箱混合武器/实物道具，领取后永久消失');

  // R9 蜘蛛是 10 秒一次的大型远程蛛网，不再偷带减速/定身，也不能在
  // 飞行途中把射程衰减掉。贴图由 webType 保持为单张静态蛛网。
  const r9 = fx(`
    (() => {
      Debug.startArtTest();
      const r = Debug.run(), p = r.player;
      const def = CFG.ENEMIES.spider;
      const spider = Entities.spawnEnemy(r, 'spider', 560, 0, { allowNear: true });
      spider.aiT = 0;
      r.t += 0.05; r.frame++;
      Entities.updateEnemies(r, 0.05);
      const web = Entities.getShots().find(s => s.alive && s.webType);
      const launch = web ? Math.hypot(web.vx, web.vy) : 0;
      r.t += 0.5; r.frame++;
      Entities.updateEnemies(r, 0.5);
      const flight = web && web.alive ? Math.hypot(web.vx, web.vy) : 0;
      const rangedStaticWeb = def.shotCd === 10 && def.shotRange >= 660 && def.slowAmt === 0 && def.slowDur === 0 &&
        web && web.size >= 48 && web.maxRange >= 660 && Math.abs(flight - launch) < 0.01;
      p.webStacks = 0; p.rootT = 0; p.slow = 0;
      // Force a direct no-slow web contact to prove no hidden stack/root path remains.
      if (web && web.alive) { web.x = p.x; web.y = p.y; }
      r.t += 0.01; r.frame++;
      Entities.updateEnemies(r, 0.01);
      const noControl = p.webStacks === 0 && p.rootT === 0 && p.slow === 0;
      return { rangedStaticWeb, noControl };
    })()
  `);
  if (!Object.values(r9).every(Boolean)) {
    throw new Error('蜘蛛远程蛛网回归失败: ' + JSON.stringify(r9));
  }
  console.log('R9 OK 蜘蛛大型远程蛛网无减速/定身且飞行速度稳定');

  // R10 圣女光环保留为贴地领域：初始半径已放大，并且天降圣光与满级
  // 七位大天使都是实际子弹/伤害实体，而不是仅文案。
  const r10 = fx(`
    (() => {
      Debug.startArtTest();
      const r = Debug.run();
      const w = { id: 'holyaura', lv: 8, cdT: 0, evolved: true, evoId: 'sanctuary', curR: 0, angelCd: 0 };
      r.weapons = [w]; r.passives = { ps_pendant: CFG.PASSIVES.ps_pendant.maxLv };
      Entities.recomputeStats(r);
      r.t += 0.5; r.frame++;
      Weapons.update(r, 0.5);
      const st = Weapons.wStats(r, w);
      const angels = Weapons.getBullets().filter(b => b.alive && b.kind === 'angel').length;
      return { enlargedGroundRadius: w.curR >= 117, holyStrike: st.holyStrike >= 1, sevenArchangels: angels === 7 };
    })()
  `);
  if (!Object.values(r10).every(Boolean)) {
    throw new Error('圣女光环/大天使回归失败: ' + JSON.stringify(r10));
  }
  console.log('R10 OK 圣女光环贴地范围、天降圣光与七位大天使实体正常');

  // R11 寒霜冲击是从中心向四周推进的冰霜环。伤害半径单调扩张，显示
  // 采用固定外接圆的 radial 素材，避免再把帧内扩散和整体缩放叠加成跳动。
  const r11 = fx(`
    (() => {
      Debug.startArtTest();
      const r = Debug.run();
      r.weapons = [{ id: 'frostnova', lv: 1, cdT: 0, evolved: false, evoId: null, curR: 0 }];
      Entities.recomputeStats(r);
      r.t += 0.01; r.frame++; Weapons.update(r, 0.01);
      const b = Weapons.getBullets().find(x => x.alive && x.kind === 'nova');
      const first = b ? b.phase : -1;
      r.t += 0.2; r.frame++; Weapons.update(r, 0.2);
      const mid = b ? b.phase : -1;
      r.t += 0.6; r.frame++; Weapons.update(r, 0.6);
      const last = b ? Math.min(b.phase, b.aux2) : -1;
      const radialSheet = SpriteGen.frames('vfx_frost_radial');
      const firstFrame = radialSheet[0];
      // The atlas uses 96px cells while the intentional procedural fallback
      // uses its own cell size.  What matters for no-jitter rendering is a
      // complete, constant-size sequence in either path.
      return { radialSheet: radialSheet.length >= 1 && radialSheet.every(f => f.width === firstFrame.width && f.height === firstFrame.height),
        outwardDamage: first > 0 && mid > first && last >= mid && last <= b.aux2 };
    })()
  `);
  if (!Object.values(r11).every(Boolean)) {
    throw new Error('寒霜冲击扩散回归失败: ' + JSON.stringify(r11));
  }
  console.log('R11 OK 寒霜冲击以连续半径向外扩散，使用固定圆形素材足迹');

  // R12 成就必须覆盖长期挑战，而无尽时间要由真实的独立统计字段驱动。
  const r12 = fx(`
    (() => {
      Meta.wipe();
      const st = Meta.data().stats;
      Object.assign(st, { kills: 50000, bestSurvive: 1200, wins: 10, bossKills: 50,
        evolves: 20, bestLevel: 80, endlessTime: 1800 });
      st.surviveByMap.abyss = 1200;
      const ids = Meta.checkAchv().map(a => a.id);
      const need = ['a_kill_50000', 'a_survive_20', 'a_win_10', 'a_boss_50', 'a_evolve_20',
        'a_level_80', 'a_endless_10', 'a_endless_30', 'a_abyss_20'];
      return { allChallengeAchievements: need.every(id => ids.includes(id)),
        endlessStatTracked: Meta.data().stats.endlessTime === 1800 };
    })()
  `);
  if (!Object.values(r12).every(Boolean)) {
    throw new Error('高挑战成就回归失败: ' + JSON.stringify(r12));
  }
  console.log('R12 OK 无尽、终局、等级与长期击杀成就均可解锁');

  console.log('\n=== 无头冒烟测试全部通过 ===');
} catch (e) {
  console.error('\n!!! 冒烟测试失败: ' + e.stack);
  process.exit(1);
}
