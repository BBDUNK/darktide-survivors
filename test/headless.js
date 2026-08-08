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

  console.log('\n=== 无头冒烟测试全部通过 ===');
} catch (e) {
  console.error('\n!!! 冒烟测试失败: ' + e.stack);
  process.exit(1);
}
