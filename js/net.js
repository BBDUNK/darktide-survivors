// net.js — P2P 联机层(PeerJS / WebRTC)
//
// 架构:房主(host)权威。房主跑完整模拟(敌人 AI、刷怪、伤害判定),
// 客户端只上报输入、接收快照并本地插值。这样避免了两端各自模拟导致的分歧,
// 代价是客户端有一个 RTT 的操作延迟——对这类俯视角生存游戏可以接受。
//
// 消息类型:
//   hello    客户端→房主   加入房间,带昵称
//   roster   房主→客户端   大厅成员列表(含选人状态)
//   pick     客户端→房主   选择角色 / 切换准备状态
//   start    房主→客户端   开始游戏(带地图与种子)
//   input    客户端→房主   每帧输入向量
//   snap     房主→客户端   世界快照(玩家/敌人/弹幕/掉落)
//   levelup  房主→客户端   该客户端触发升级,附选项
//   pickup   客户端→房主   升级选择结果
//   over     房主→客户端   本局结束
window.Net = (function () {
  'use strict';

  var PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var ROOM_PREFIX = 'darktide-';
  var SNAP_HZ = 15;          // 快照频率:够用且省带宽,客户端做插值
  var MAX_PLAYERS = 4;

  var peer = null;
  var mode = 'off';          // off | host | client
  var conns = [];            // host: 所有客户端连接
  var hostConn = null;       // client: 与房主的连接
  var roomCode = '';
  var selfName = '';
  var loaded = false;
  var cb = {};               // 回调集合,由 main.js 注入

  // 大厅成员: { id, name, charId, ready, isHost }
  var roster = [];
  var mapId = null;      // 房主选定的地图,随 roster 一起同步

  // 房主选图:广播给所有客户端
  function setMap(mid) {
    mapId = mid;
    if (mode === 'host') broadcast({ t: 'roster', roster: roster, map: mapId });
  }
  function getMap() { return mapId; }

  function log(msg) { if (window.console) console.log('[Net] ' + msg); }

  // ---------- 动态加载 PeerJS ----------
  function ensureLib() {
    if (loaded) return Promise.resolve();
    if (window.Peer) { loaded = true; return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PEERJS_CDN;
      s.onload = function () { loaded = true; resolve(); };
      s.onerror = function () { reject(new Error('PeerJS 加载失败(需要联网)')); };
      document.head.appendChild(s);
    });
  }

  function randCode() {
    var C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉易混字符
    var s = '';
    for (var i = 0; i < 5; i++) s += C[Math.floor(Math.random() * C.length)];
    return s;
  }

  // ---------- 建房 ----------
  function host(name) {
    selfName = name || '房主';
    return ensureLib().then(function () {
      return new Promise(function (resolve, reject) {
        roomCode = randCode();
        peer = new window.Peer(ROOM_PREFIX + roomCode, { debug: 0 });
        var settled = false;
        peer.on('open', function () {
          if (settled) return;
          settled = true;
          mode = 'host';
          roster = [{ id: 'host', name: selfName, charId: null, ready: false, isHost: true }];
          log('房间已创建: ' + roomCode);
          if (cb.onRoster) cb.onRoster(roster);
          resolve(roomCode);
        });
        peer.on('connection', function (c) { acceptClient(c); });
        peer.on('error', function (e) {
          log('错误: ' + e.type);
          if (!settled) { settled = true; reject(e); }
          else if (cb.onError) cb.onError(e);
        });
      });
    });
  }

  function acceptClient(c) {
    if (conns.length >= MAX_PLAYERS - 1) { try { c.close(); } catch (e) {} return; }
    conns.push(c);
    c.on('data', function (m) { onHostData(c, m); });
    c.on('close', function () {
      conns = conns.filter(function (x) { return x !== c; });
      roster = roster.filter(function (r) { return r.id !== c.peer; });
      broadcast({ t: 'roster', roster: roster, map: mapId });
      if (cb.onRoster) cb.onRoster(roster);
      log('客户端断开: ' + c.peer);
    });
  }

  function onHostData(c, m) {
    if (!m || !m.t) return;
    if (m.t === 'hello') {
      if (!roster.some(function (r) { return r.id === c.peer; })) {
        roster.push({ id: c.peer, name: (m.name || '玩家').slice(0, 10), charId: null, ready: false, isHost: false });
      }
      broadcast({ t: 'roster', roster: roster, map: mapId });
      if (cb.onRoster) cb.onRoster(roster);
    } else if (m.t === 'pick') {
      var r = roster.filter(function (x) { return x.id === c.peer; })[0];
      if (r) { r.charId = m.charId; r.ready = !!m.ready; }
      broadcast({ t: 'roster', roster: roster, map: mapId });
      if (cb.onRoster) cb.onRoster(roster);
    } else if (m.t === 'input') {
      if (cb.onClientInput) cb.onClientInput(c.peer, m);
    } else if (m.t === 'pickup') {
      if (cb.onClientPick) cb.onClientPick(c.peer, m.optIdx);
    }
  }

  // ---------- 加入房间 ----------
  function join(code, name) {
    selfName = name || '玩家';
    roomCode = (code || '').toUpperCase().trim();
    return ensureLib().then(function () {
      return new Promise(function (resolve, reject) {
        peer = new window.Peer(null, { debug: 0 });
        var settled = false;
        peer.on('open', function () {
          hostConn = peer.connect(ROOM_PREFIX + roomCode, { reliable: true });
          hostConn.on('open', function () {
            if (settled) return;
            settled = true;
            mode = 'client';
            hostConn.send({ t: 'hello', name: selfName });
            log('已连接房间 ' + roomCode);
            resolve();
          });
          hostConn.on('data', function (m) { onClientData(m); });
          hostConn.on('close', function () { if (cb.onHostLost) cb.onHostLost(); });
          hostConn.on('error', function (e) { if (!settled) { settled = true; reject(e); } });
        });
        peer.on('error', function (e) {
          if (!settled) { settled = true; reject(e); }
          else if (cb.onError) cb.onError(e);
        });
        setTimeout(function () {
          if (!settled) { settled = true; reject(new Error('连接超时,请检查房间号')); }
        }, 12000);
      });
    });
  }

  function onClientData(m) {
    if (!m || !m.t) return;
    if (m.t === 'roster') { roster = m.roster; mapId = m.map || mapId; if (cb.onRoster) cb.onRoster(roster, mapId); }
    else if (m.t === 'start' && cb.onStart) cb.onStart(m);
    else if (m.t === 'snap' && cb.onSnap) cb.onSnap(m);
    else if (m.t === 'levelup' && cb.onRemoteLevelUp) cb.onRemoteLevelUp(m);
    else if (m.t === 'pickdone' && cb.onPickDone) cb.onPickDone(m);
    else if (m.t === 'over' && cb.onOver) cb.onOver(m);
  }

  // ---------- 发送 ----------
  function broadcast(msg) {
    for (var i = 0; i < conns.length; i++) {
      try { if (conns[i].open) conns[i].send(msg); } catch (e) { /* 忽略单个连接失败 */ }
    }
  }
  function sendTo(peerId, msg) {
    for (var i = 0; i < conns.length; i++) {
      if (conns[i].peer === peerId) { try { conns[i].send(msg); } catch (e) {} return; }
    }
  }
  function toHost(msg) {
    if (hostConn && hostConn.open) { try { hostConn.send(msg); } catch (e) {} }
  }

  function setMyPick(charId, ready) {
    if (mode === 'host') {
      roster[0].charId = charId; roster[0].ready = !!ready;
      broadcast({ t: 'roster', roster: roster, map: mapId });
      if (cb.onRoster) cb.onRoster(roster);
    } else if (mode === 'client') {
      toHost({ t: 'pick', charId: charId, ready: !!ready });
    }
  }

  function close() {
    try { conns.forEach(function (c) { c.close(); }); } catch (e) {}
    try { if (hostConn) hostConn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = null; conns = []; hostConn = null; mode = 'off'; roster = []; roomCode = '';
  }

  return {
    init: function (callbacks) { cb = callbacks || {}; },
    host: host, join: join, close: close,
    broadcast: broadcast, sendTo: sendTo, toHost: toHost,
    setMyPick: setMyPick, setMap: setMap, getMap: getMap,
    mode: function () { return mode; },
    selfId: function () { return peer && peer.id ? peer.id : ''; },
    isHost: function () { return mode === 'host'; },
    isClient: function () { return mode === 'client'; },
    isOnline: function () { return mode !== 'off'; },
    code: function () { return roomCode; },
    getRoster: function () { return roster; },
    playerCount: function () { return mode === 'off' ? 1 : roster.length; },
    SNAP_HZ: SNAP_HZ, MAX_PLAYERS: MAX_PLAYERS
  };
})();
