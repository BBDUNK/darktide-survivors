// audio.js — 模块B:WebAudio 全合成音频引擎(芯片风音效 + 16 步进音序音乐),window.AudioSys
(function () {
  'use strict';

  // ---------------- 清单(覆盖率自检 / 限流表以此为准) ----------------
  const SFX_NAMES = [
    'ui_click', 'ui_hover', 'ui_back', 'run_start',
    'shoot_slash', 'shoot_bolt', 'shoot_arrow', 'shoot_axe', 'shoot_dagger',
    'shoot_book', 'shoot_flask', 'zap', 'nova', 'turret_place',
    'hit1', 'hit2', 'crit', 'enemy_die', 'splat', 'player_hurt',
    'gem', 'coin', 'meat', 'magnet', 'bomb', 'freeze', 'chest_open',
    'levelup', 'upgrade_pick', 'evolve', 'summon_demon',
    'boss_spawn', 'boss_die', 'elite_spawn', 'achievement', 'gameover', 'victory'
  ];
  const THEME_NAMES = ['menu', 'graveyard', 'wilds', 'abyss'];
  // 录音文件主题:直接播放音频文件(走音乐总线),优先于程序化主题;文件加载失败自动退程序化
  // 路径基于本脚本自身解析,保证从任意页面/子目录加载都指向 assets/audio/music/
  const JS_DIR = (function () {
    try {
      const s = document.currentScript && document.currentScript.src;
      if (s) { return s.slice(0, s.lastIndexOf('/') + 1); }
    } catch (e) { /* 无 DOM 环境 */ }
    return 'js/';
  })();
  // 主菜单 = The Dark Amulet(Dark Mage Theme,CC-BY);四 Boss = Battle Theme A(CC0 史诗弦乐+号角)
  const FILE_THEMES = {
    menu: JS_DIR + '../assets/audio/music/dark-amulet.mp3',
    boss_slime: JS_DIR + '../assets/audio/music/battle-theme-a.mp3',
    boss_bone: JS_DIR + '../assets/audio/music/battle-theme-a.mp3',
    boss_abyss: JS_DIR + '../assets/audio/music/battle-theme-a.mp3',
    boss_dark: JS_DIR + '../assets/audio/music/battle-theme-a.mp3'
  };
  const API_NAMES = ['unlock', 'play', 'playMusic', 'setIntensity', 'stopMusic', 'setVolumes'];

  const MIN_GAP = 0.04;     // 同名音效最小间隔(秒)
  const LOOKAHEAD = 0.12;   // 音序器提前调度窗口(秒)
  const TICK_MS = 25;       // 调度器轮询周期(毫秒)

  // ---------------- 内部状态 ----------------
  let ctx = null;           // AudioContext(惰性,首次手势创建)
  let comp = null;          // 总线压缩器(防爆音)
  let sfxBus = null;        // 音效总线
  let musicBus = null;      // 音乐总线
  let noiseBuf = null;      // 共享白噪声缓冲
  let unlocked = false;
  let broken = false;       // WebAudio 不可用时永久静默
  let volMusic = 0.7;
  let volSfx = 0.8;
  let pendingTheme = null;  // unlock 前请求的主题,解锁后自动开播

  const warned = Object.create(null);   // console.warn 每键一次
  const lastAt = Object.create(null);   // 音效限流:名字 → 上次触发时刻(预填充,热路径零属性新增)
  const SFX_SET = Object.create(null);  // 合法音效名集合(防原型链污染查表)
  for (let i = 0; i < SFX_NAMES.length; i++) {
    SFX_SET[SFX_NAMES[i]] = 1;
    lastAt[SFX_NAMES[i]] = -10;
  }

  // ---------------- 小工具 ----------------
  function warnOnce(key, msg) {
    if (warned[key] !== 1) {
      warned[key] = 1;
      console.warn(msg);
    }
  }

  function clamp01(v) {
    v = +v;
    if (v !== v) { return 0; }
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // ---------------- 合成原语 ----------------
  // 单振荡器:快攻击 + 指数衰减;f1>0 且不等于 f0 时做指数滑音;det 为音分失谐;atk 可选攻击时长
  function _tone(dest, t, dur, type, f0, f1, vol, det, atk) {
    if (!(vol > 0.0001)) { vol = 0.0001; }
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) { o.frequency.exponentialRampToValueAtTime(f1, t + dur); }
    if (det && o.detune) { o.detune.value = det; }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + (atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // 失谐双振荡器(±音分),芯片增厚
  function _duo(dest, t, dur, type, f, vol, atk) {
    _tone(dest, t, dur, type, f, 0, vol, 5, atk);
    _tone(dest, t, dur, type, f, 0, vol * 0.72, -6, atk);
  }

  // 白噪声:可选滤波(ftype/f0→f1/q)与 playbackRate 变调
  function _noise(dest, t, dur, vol, ftype, f0, f1, q, rate) {
    if (!(vol > 0.0001)) { vol = 0.0001; }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = rate || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let head = src;
    if (ftype) {
      const f = ctx.createBiquadFilter();
      f.type = ftype;
      f.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) { f.frequency.exponentialRampToValueAtTime(f1, t + dur); }
      f.Q.value = q || 1;
      src.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.9);
    src.stop(t + dur + 0.05);
  }

  // ---------------- 音乐声部 ----------------
  function drumKick(g, t, v) {
    const dv = mus.def.drumVol;
    _tone(g, t, 0.12, 'sine', 155, 42, 0.5 * v * dv, 0, 0.003);
    _noise(g, t, 0.02, 0.09 * v * dv, 'lowpass', 1000, 0, 1, 1);
  }

  function drumSnare(g, t) {
    const dv = mus.def.drumVol;
    _noise(g, t, 0.09, 0.22 * dv, 'bandpass', 1800, 900, 1, 1);
    _tone(g, t, 0.05, 'triangle', 215, 150, 0.13 * dv);
  }

  function drumHat(g, t) {
    _noise(g, t, 0.035, 0.07 * mus.def.drumVol, 'highpass', 7000, 0, 1, 1.6);
  }

  function bassNote(g, t, midi, dur, vol, type) {
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = f;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = Math.min(f * 6, 1600);
    flt.Q.value = 0.8;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(vol, t + 0.008);
    gg.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(flt);
    flt.connect(gg);
    gg.connect(g);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function padVoice(g, t, dur, type, f, vol, det) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    if (o.detune) { o.detune.value = det; }
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(vol, t + 0.3);
    gg.gain.setValueAtTime(vol, t + dur - 0.25);
    gg.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(gg);
    gg.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // 和弦垫:每音 2 个 ±5 音分失谐振荡器
  function padChord(g, t, dur, tones, rootMidi, type, vol) {
    for (let i = 0; i < tones.length; i++) {
      const f = mtof(rootMidi + tones[i]);
      padVoice(g, t, dur, type, f, vol, 5);
      padVoice(g, t, dur, type, f, vol, -5);
    }
  }

  function leadNote(g, t, midi, dur, vol, type) {
    const f = mtof(midi);
    _tone(g, t, dur, type, f, 0, vol, 6, 0.005);
    _tone(g, t, dur, type, f, 0, vol * 0.65, -7, 0.005);
  }

  // 音乐盒主奏:钟琴式快速衰减 + 泛音层(基音/八度/八度五度)+ 微颤音,有机的八音盒感
  function boxNote(g, t, midi, dur, vol, vib) {
    const f = mtof(midi);
    const ring = Math.max(dur, 0.25) * 1.4;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g0 = ctx.createGain();
    g0.gain.setValueAtTime(0, t);
    g0.gain.linearRampToValueAtTime(vol, t + 0.004);
    g0.gain.exponentialRampToValueAtTime(0.0006, t + ring);
    o.connect(g0);
    g0.connect(g);
    o.start(t);
    o.stop(t + ring + 0.05);
    if (vib > 0) {   // 微颤音(音分),让音色"活"一点
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = vib;
      lfo.connect(lg);
      lg.connect(o.detune);
      lfo.start(t);
      lfo.stop(t + ring);
    }
    const o2 = ctx.createOscillator();   // 八度泛音(闪亮感)
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vol * 0.30, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + ring * 0.8);
    o2.connect(g2);
    g2.connect(g);
    o2.start(t);
    o2.stop(t + ring * 0.8 + 0.05);
    const o3 = ctx.createOscillator();   // 八度+五度泛音(更亮的一层)
    o3.type = 'sine';
    o3.frequency.value = f * 3;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0, t);
    g3.gain.linearRampToValueAtTime(vol * 0.14, t + 0.004);
    g3.gain.exponentialRampToValueAtTime(0.0004, t + ring * 0.55);
    o3.connect(g3);
    g3.connect(g);
    o3.start(t);
    o3.stop(t + ring * 0.55 + 0.05);
  }

  // 旋律度数 → 半音(相对当前和弦根音;third 由和弦大小三度决定)
  function degSemi(deg, third) {
    switch (deg) {
      case 0: return 0;
      case 1: return third;
      case 2: return 7;
      case 3: return 12;
      case 4: return 10;
      case 5: return 14;
      case 6: return third + 12;
      default: return 19;
    }
  }

  // ---------------- 主题编曲数据 ----------------
  // 模式串 16 字符('1' 触发);bass:相对和弦根音的半音(null 休止);
  // lead:可多条 16 步乐句按小节循环交替,-1 休止;leadAbs:true 时 lead 值为
  //   相对主题主音的绝对半音(支持完整二段式旋律),否则为和弦音度数(0..7,+10 高八度);
  // leadDurMul:主旋律音符时值倍率(默认 2.2,十六分跑动用更小值);
  // sections:每段 4 小节(roots 相对主题根音 / thirds 三度性质 / pads 垫声部音)
  const N = null;
  const THEMES = {
    menu: { // 平静小调琶音,A 小调,92 BPM
      bpm: 92, root: 57, bassOct: -24, leadOct: 12,
      padType: 'triangle', padVol: 0.045,
      leadType: 'triangle', leadVol: 0.075,
      bassVol: 0.18, drumVol: 0.55,
      kick: '1.......1.......',
      kickX: '....1.......1...',
      snare: '................',
      hat: '....1.......1...',
      hat3: '..1...1...1...1.',
      bass: [0, N, N, N, N, N, 7, N, 0, N, N, N, 7, N, N, N],
      lead: [
        [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 0, -1, 2, -1],
        [0, -1, 1, -1, 2, -1, 3, -1, 5, -1, 3, -1, 2, -1, 1, -1]
      ],
      sections: [
        { roots: [0, -4, 3, -2], thirds: [3, 4, 4, 4],
          pads: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },          // Am F C G
        { roots: [0, 5, -5, 0], thirds: [3, 3, 3, 3],
          pads: [[0, 3, 7], [-7, -4, 0], [-5, -2, 2], [0, 3, 7]] }          // Am Dm Em Am
      ]
    },
    graveyard: { // 阴郁 e 小调(安达卢西亚下行),112 BPM
      bpm: 112, root: 52, bassOct: -12, leadOct: 12,
      padType: 'square', padVol: 0.028,
      leadType: 'square', leadVol: 0.08,
      bassVol: 0.24, drumVol: 1,
      kick: '1...1...1...1...',
      kickX: '..........1...1.',
      snare: '....1.......1...',
      hat: '..1...1...1...1.',
      hat3: '1.1.1.1.1.1.1.11',
      bass: [0, N, 0, N, 0, N, 0, N, 0, N, 0, N, 0, N, 12, N],
      lead: [
        [3, -1, -1, 2, -1, -1, 1, -1, 2, -1, -1, 0, -1, -1, 1, 2],
        [3, -1, -1, 4, -1, -1, 3, -1, 2, -1, 1, -1, 0, -1, -1, -1]
      ],
      sections: [
        { roots: [0, -4, -7, -5], thirds: [3, 4, 3, 4],
          pads: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]] },        // Em C Am B
        { roots: [0, -2, -4, -5], thirds: [3, 4, 4, 4],
          pads: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]] }          // Em D C B
      ]
    },
    wilds: { // 紧张 d 多利亚,126 BPM,疾驰节奏
      bpm: 126, root: 50, bassOct: -12, leadOct: 12,
      padType: 'square', padVol: 0.026,
      leadType: 'square', leadVol: 0.08,
      bassVol: 0.26, drumVol: 1.05,
      kick: '1..1..1...1..1..',
      kickX: '..1.......1....1',
      snare: '....1.......1..1',
      hat: '1.1.1.1.1.1.1.1.',
      hat3: '1111111111111111',
      bass: [0, N, 0, 0, N, 0, N, 0, 0, N, 0, 0, N, 0, 7, 0],
      lead: [
        [0, 0, -1, 3, -1, 0, 2, -1, 0, 0, -1, 4, -1, 2, 3, -1],
        [0, 0, -1, 3, -1, 0, 5, -1, 3, -1, 2, 1, 2, -1, 0, -1]
      ],
      sections: [
        { roots: [0, 3, 5, 0], thirds: [3, 4, 4, 3],
          pads: [[0, 3, 7], [3, 7, 10], [-7, -3, 0], [0, 3, 7]] },          // Dm F G Dm
        { roots: [0, -2, -5, -7], thirds: [3, 4, 3, 4],
          pads: [[0, 3, 7], [-2, 2, 5], [-5, -2, 2], [-7, -3, 0]] }         // Dm C Am G
      ]
    },
    abyss: { // 压迫低音半音阶,c 小调,100 BPM
      bpm: 100, root: 48, bassOct: -12, leadOct: 12,
      padType: 'triangle', padVol: 0.04,
      leadType: 'triangle', leadVol: 0.09,
      bassVol: 0.3, drumVol: 0.9,
      kick: '1.....1.1.......',
      kickX: '............1.1.',
      snare: '....1.......1...',
      hat: '..1...1...1...1.',
      hat3: '.1.1.1.1.1.1.1.1',
      bass: [0, N, N, N, 0, N, 1, N, 0, N, N, N, 0, N, -1, N],
      lead: [
        [0, -1, -1, -1, -1, -1, 1, -1, -1, -1, 0, -1, -1, -1, -1, -1],
        [3, -1, -1, -1, -1, -1, 2, -1, -1, 1, -1, -1, 0, -1, -1, -1]
      ],
      sections: [
        { roots: [0, 1, 0, -1], thirds: [3, 4, 3, 3],
          pads: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-1, 2, 5]] },            // Cm Db Cm Bdim
        { roots: [0, -4, -7, -5], thirds: [3, 4, 3, 4],
          pads: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]] }         // Cm Ab Fm G
      ]
    }
  };

  // Boss 战斗音乐:四首差异化古典主题,能量一路抬升(leadAbs = 绝对半音完整旋律)
  THEMES.boss_slime = { // 腐液之王:欢快谐谑曲,D 大调 132BPM,弹跳 oom-pah 果冻脉冲
    bpm: 132, root: 50, bassOct: -12, leadOct: 12,
    leadAbs: true, leadDurMul: 1.6,
    padType: 'triangle', padVol: 0.04,
    leadType: 'square', leadVol: 0.10,
    bassVol: 0.34, drumVol: 0.95,
    kick: '1.......1.......',
    kickX: '..1...1...1...1.',
    snare: '....1.......1...',
    hat: '1.1.1.1.1.1.1.1.',
    hat3: '1111111111111111',
    bass: [0, -1, 7, -1, 0, -1, 7, -1, 0, -1, 7, -1, 0, -1, 7, -1],   // oom-pah(8 分)
    lead: [
      [0, -1, -1, -1, 4, -1, -1, -1, 7, -1, -1, -1, 4, -1, -1, -1],
      [5, -1, -1, -1, 7, -1, -1, -1, 9, -1, -1, -1, 5, -1, -1, -1],
      [7, -1, -1, -1, 11, -1, -1, -1, 14, -1, -1, -1, 11, -1, -1, -1],
      [0, -1, -1, -1, 4, -1, -1, -1, 7, -1, -1, -1, -1, -1, -1, -1],
      [9, -1, -1, -1, 12, -1, -1, -1, 16, -1, -1, -1, 12, -1, -1, -1],
      [5, -1, -1, -1, 9, -1, -1, -1, 12, -1, -1, -1, 9, -1, -1, -1],
      [7, -1, -1, -1, 9, -1, -1, -1, 11, -1, -1, -1, 7, -1, -1, -1],
      [4, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1]
    ],
    sections: [
      { roots: [0, 5, 7, 0], thirds: [4, 4, 4, 4],
        pads: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]] },            // D G A D
      { roots: [9, 5, 7, 0], thirds: [3, 4, 4, 4],
        pads: [[9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7]] }          // Bm G A D
    ]
  };
  THEMES.boss_bone = { // 骸骨领主:骷髅塔兰泰拉,E 小调 150BPM,骨铃跳音 + 行军脉冲
    bpm: 150, root: 52, bassOct: -12, leadOct: 12,
    leadAbs: true, leadDurMul: 1.5,
    padType: 'sawtooth', padVol: 0.035,
    leadType: 'triangle', leadVol: 0.11,
    bassVol: 0.32, drumVol: 1.0,
    kick: '1.......1.......',
    kickX: '................',
    snare: '....1.......1...',
    hat: '1.1.1.1.1.1.1.1.',
    hat3: '1111111111111111',
    bass: [0, -1, -1, -1, 7, -1, -1, -1, 0, -1, -1, -1, 7, -1, -1, -1],   // 骨架行军(二分脉冲)
    lead: [
      [12, 7, 3, 7, 12, 7, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1],
      [8, 12, 15, 12, 8, 10, 12, 10, -1, -1, -1, -1, -1, -1, -1, -1],
      [10, 14, 17, 14, 10, 12, 14, 12, -1, -1, -1, -1, -1, -1, -1, -1],
      [7, 8, 10, 12, 15, 14, 12, 10, -1, -1, -1, -1, -1, -1, -1, -1],
      [5, 8, 12, 17, 15, 12, 8, 5, -1, -1, -1, -1, -1, -1, -1, -1],
      [7, 11, 14, 19, 17, 14, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1],
      [12, 11, 12, 14, 15, 14, 12, 7, -1, -1, -1, -1, -1, -1, -1, -1],
      [7, 8, 10, 12, 10, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1]
    ],
    sections: [
      { roots: [0, -4, -2, 0], thirds: [3, 4, 4, 3],
        pads: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]] },            // Em C D Em
      { roots: [-7, 2, 0, 2], thirds: [3, 4, 3, 4],
        pads: [[-7, -4, 0], [2, 6, 9], [0, 3, 7], [2, 6, 9]] }             // Am B Em B
    ]
  };
  THEMES.boss_abyss = { // 深渊之眼:催眠螺旋托卡塔,C 小调 144BPM,十六分无限琶音
    bpm: 144, root: 48, bassOct: -12, leadOct: 12,
    leadAbs: true, leadDurMul: 1.0,
    padType: 'sawtooth', padVol: 0.045,
    leadType: 'triangle', leadVol: 0.10,
    bassVol: 0.30, drumVol: 0.8,
    kick: '1.......1.......',
    kickX: '........1.......',
    snare: '................',
    hat: '1.1.1.1.1.1.1.1.',
    hat3: '1111111111111111',
    bass: [0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1], // 催眠根音脉冲
    lead: [
      [0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 7, 3, 0, 3, 7, 12],
      [8, 12, 15, 12, 8, 12, 15, 12, 8, 12, 15, 12, 8, 12, 15, 12],
      [10, 14, 17, 14, 10, 14, 17, 14, 10, 14, 17, 14, 10, 14, 17, 14],
      [7, 12, 15, 12, 7, 12, 15, 12, 7, 12, 15, 12, 7, 12, 15, 12],
      [0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 7, 3, 0, 3, 7, 12],
      [5, 8, 12, 8, 5, 8, 12, 8, 5, 8, 12, 8, 5, 8, 12, 8],
      [7, 11, 14, 11, 7, 11, 14, 11, 7, 11, 14, 11, 7, 11, 14, 11],
      [0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 7, 12, 0, -1, -1, -1]
    ],
    sections: [
      { roots: [0, 8, 10, 0], thirds: [3, 4, 4, 3],
        pads: [[0, 3, 7], [8, 12, 15], [10, 14, 17], [0, 3, 7]] },         // Cm Ab Bb Cm
      { roots: [0, 5, 7, 0], thirds: [3, 3, 4, 3],
        pads: [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7]] }            // Cm Fm G Cm
    ]
  };
  THEMES.boss_dark = { // 暗潮魔王:终局礼赞进行曲,D 小调 152BPM,鼓号齐鸣 + 圣咏桥段
    bpm: 152, root: 50, bassOct: -12, leadOct: 12,
    leadAbs: true, leadDurMul: 2.0,
    padType: 'sawtooth', padVol: 0.055,
    leadType: 'square', leadVol: 0.13,
    bassVol: 0.40, drumVol: 1.1,
    kick: '1...1...1...1...',
    kickX: '..1...1...1...1.',
    snare: '....1.......1...',
    hat: '1.1.1.1.1.1.1.1.',
    hat3: '1111111111111111',
    bass: [0, -1, 0, -1, 7, -1, 7, -1, 0, -1, 0, -1, 7, -1, 7, -1],      // 重低音驱动(8 分)
    lead: [
      [12, -1, -1, -1, 15, -1, -1, -1, 19, -1, -1, -1, 15, -1, -1, -1],
      [8, -1, -1, -1, 12, -1, -1, -1, 15, -1, -1, -1, 12, -1, -1, -1],
      [7, -1, -1, -1, 11, -1, -1, -1, 14, -1, -1, -1, 19, -1, -1, -1],
      [19, -1, -1, -1, 15, -1, -1, -1, 12, -1, -1, -1, -1, -1, -1, -1],
      [12, -1, -1, -1, 12, -1, -1, -1, 15, -1, -1, -1, 15, -1, -1, -1],
      [8, -1, -1, -1, 8, -1, -1, -1, 17, -1, -1, -1, 17, -1, -1, -1],
      [12, -1, -1, -1, 15, -1, -1, -1, 19, -1, -1, -1, 15, -1, -1, -1],
      [11, -1, -1, -1, 10, -1, -1, -1, 7, -1, -1, -1, 7, -1, -1, -1]
    ],
    sections: [
      { roots: [0, 8, 7, 0], thirds: [3, 4, 4, 3],
        pads: [[0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]] },          // Dm Bb A Dm
      { roots: [0, 5, 8, 7], thirds: [3, 3, 4, 4],
        pads: [[0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 11, 14]] }          // Dm Gm Bb A
    ]
  };

  // ---------------- 16 步进音序器(lookahead 调度) ----------------
  const mus = {
    playing: false,
    theme: null,
    def: null,
    gain: null,      // 当前主题的淡入淡出 gain
    timer: 0,
    step: 0,
    bar: 0,
    nextT: 0,
    stepDur: 0,
    intensity: 2,
    mediaEl: null,   // 录音文件主题:播放元素
    mediaSrc: null   // 录音文件主题:MediaElementSource
  };

  function fadeOutGain(g) {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    setTimeout(function () {
      try { g.disconnect(); } catch (e) { /* 已断开 */ }
    }, 900);
  }

  function startTheme(name) {
    const d = THEMES[name];
    const now = ctx.currentTime;
    if (mus.gain) { fadeOutGain(mus.gain); }       // 自动淡出上一首
    if (mus.timer) { clearInterval(mus.timer); mus.timer = 0; }
    stopFilePlayback();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(1, now + 0.25);
    g.connect(musicBus);
    mus.gain = g;
    mus.def = d;
    mus.theme = name;
    mus.stepDur = 60 / (d.bpm * 4);
    mus.step = 0;
    mus.bar = 0;
    mus.nextT = now + 0.06;
    mus.playing = true;
    mus.timer = setInterval(tick, TICK_MS);
    pendingTheme = null;
  }

  // 停止当前录音文件播放(暂停元素 + 断开 MediaElementSource)
  function stopFilePlayback() {
    if (mus.mediaEl) {
      try { mus.mediaEl.pause(); } catch (e) { /* 已停 */ }
      mus.mediaEl = null;
    }
    if (mus.mediaSrc) {
      try { mus.mediaSrc.disconnect(); } catch (e) { /* 已断 */ }
      mus.mediaSrc = null;
    }
  }

  // 播放录音文件主题:HTMLAudio 循环 + MediaElementSource 进音乐总线
  function startFileTheme(name, url) {
    const now = ctx.currentTime;
    if (mus.gain) { fadeOutGain(mus.gain); }
    if (mus.timer) { clearInterval(mus.timer); mus.timer = 0; }
    stopFilePlayback();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(1, now + 0.25);
    g.connect(musicBus);
    mus.gain = g;
    mus.def = null;
    mus.theme = name;
    mus.playing = true;
    pendingTheme = null;
    const el = new Audio();
    el.src = url;
    el.loop = true;
    el.preload = 'auto';
    mus.mediaEl = el;
    el.addEventListener('error', function () {
      if (mus.playing && mus.theme === name) { startTheme(name); }  // 文件失败退程序化
    });
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(g);
      mus.mediaSrc = src;
    } catch (e) {
      el.volume = 0.8;   // 退化:不走音乐总线,元素直放
    }
    const p = el.play();
    if (p && typeof p.catch === 'function') { p.catch(function () {}); }
  }

  // 统一入口:录音文件优先,否则程序化
  function startMusic(theme) {
    if (FILE_THEMES[theme]) { startFileTheme(theme, FILE_THEMES[theme]); }
    else { startTheme(theme); }
  }

  function tick() {
    if (!mus.playing || !ctx) { return; }
    const now = ctx.currentTime;
    if (mus.nextT < now - 0.25) { mus.nextT = now + 0.05; }   // 后台节流后重新对齐
    const limit = now + LOOKAHEAD;
    let guard = 0;
    try {
      while (mus.nextT < limit && guard++ < 64) { scheduleStep(); }
    } catch (e) {
      warnOnce('muserr', '[AudioSys] 音乐调度异常,已停止: ' + e);
      stopMusic();
    }
  }

  function scheduleStep() {
    const d = mus.def;
    const t = mus.nextT;
    const s = mus.step;
    const bar = mus.bar;
    const g = mus.gain;
    const inten = mus.intensity;
    const sec = d.sections[(bar >> 2) % d.sections.length];  // 每 4 小节换和弦段
    const ci = bar & 3;
    const chordRoot = d.root + sec.roots[ci];

    // 层 0:鼓 + 贝斯
    if (d.kick.charCodeAt(s) === 49) { drumKick(g, t, 1); }
    if (inten >= 3 && d.kickX.charCodeAt(s) === 49) { drumKick(g, t, 0.65); }
    if (d.snare.charCodeAt(s) === 49) { drumSnare(g, t); }
    if ((inten >= 3 ? d.hat3 : d.hat).charCodeAt(s) === 49) { drumHat(g, t); }
    const b = d.bass[s];
    if (typeof b === 'number') {
      bassNote(g, t, chordRoot + d.bassOct + b, mus.stepDur * 1.9, d.bassVol, d.bassType);
    }

    // 层 1:+ 和弦垫(整小节)
    if (inten >= 1 && s === 0) {
      padChord(g, t, mus.stepDur * 16, sec.pads[ci], d.root, d.padType, d.padVol);
    }

    // 层 2:+ 主旋律;层 3:+ 高八度回声副旋律 + 密集鼓点
    if (inten >= 2) {
      const lines = d.lead;
      const v = lines[bar % lines.length][s];
      if (v >= 0) {
        const durMul = (typeof d.leadDurMul === 'number') ? d.leadDurMul : 2.2;
        let midi;
        if (d.leadAbs) {
          midi = d.root + d.leadOct + v;              // 绝对半音:相对主题主音(完整旋律作曲)
        } else {
          const deg = v % 10;
          const oct = v >= 10 ? 12 : 0;
          midi = chordRoot + d.leadOct + oct + degSemi(deg, sec.thirds[ci]);
        }
        // 可选主奏音色:box = 音乐盒(钟琴泛音+微颤音);默认芯片 lead
        const box = d.leadVoice === 'box';
        const leadFn = box ? boxNote : leadNote;
        const arg5 = box ? (d.leadVib || 0) : d.leadType;
        leadFn(g, t, midi, mus.stepDur * durMul, d.leadVol, arg5);
        if (inten >= 3 && d.leadEcho !== false) {
          leadFn(g, t + mus.stepDur * 2, midi + 12, mus.stepDur * 1.7, d.leadVol * 0.45, arg5);
        }
      }
    }

    mus.nextT += mus.stepDur;
    mus.step = (s + 1) & 15;
    if (mus.step === 0) { mus.bar = (bar + 1) & 0x3fffffff; }
  }

  // ---------------- 音效表(全部走 sfxBus) ----------------
  // 文件音效:Kenney CC0 录音(tools/audio/build-sfx.py 从 vendor 包转码)。
  // play() 优先播放文件版;加载失败(file:// 或 404)永久退回程序合成。
  // rate 为基准播放速率,运行时再叠加 ±5% 随机微调,避免重复机械感。
  const SFX_DIR = JS_DIR + '../assets/audio/sfx/';
  const SFX_FILE = {
    ui_click: { f: 'ui_click.wav', rate: 1.0 },
    ui_hover: { f: 'ui_hover.wav', rate: 1.0 },
    ui_back: { f: 'ui_back.wav', rate: 0.92 },
    run_start: { f: 'run_start.wav', rate: 1.0 },
    levelup: { f: 'levelup.wav', rate: 1.0 },
    upgrade_pick: { f: 'upgrade_pick.wav', rate: 1.0 },
    evolve: { f: 'evolve.wav', rate: 1.0 },
    achievement: { f: 'achievement.wav', rate: 1.0 },
    gameover: { f: 'gameover.wav', rate: 0.8 },
    victory: { f: 'victory.wav', rate: 1.05 },
    shoot_slash: { f: 'shoot_slash.wav', rate: 1.0 },
    shoot_bolt: { f: 'shoot_bolt.wav', rate: 1.0 },
    shoot_arrow: { f: 'shoot_arrow.wav', rate: 0.96 },
    shoot_axe: { f: 'shoot_axe.wav', rate: 1.0 },
    shoot_dagger: { f: 'shoot_dagger.wav', rate: 1.3 },
    shoot_book: { f: 'shoot_book.wav', rate: 1.0 },
    shoot_flask: { f: 'shoot_flask.wav', rate: 0.9 },
    zap: { f: 'zap.wav', rate: 1.0 },
    nova: { f: 'nova.wav', rate: 0.9 },
    turret_place: { f: 'turret_place.wav', rate: 1.0 },
    summon_demon: { f: 'summon_demon.wav', rate: 0.58 },
    hit1: { f: 'hit1.wav', rate: 1.0 },
    hit2: { f: 'hit2.wav', rate: 1.0 },
    crit: { f: 'crit.wav', rate: 0.9 },
    enemy_die: { f: 'enemy_die.wav', rate: 0.85 },
    splat: { f: 'splat.wav', rate: 0.8 },
    player_hurt: { f: 'player_hurt.wav', rate: 0.7 },
    boss_spawn: { f: 'boss_spawn.wav', rate: 0.5 },
    boss_die: { f: 'boss_die.wav', rate: 0.9 },
    elite_spawn: { f: 'elite_spawn.wav', rate: 0.72 },
    gem: { f: 'gem.wav', rate: 1.15 },
    coin: { f: 'coin.wav', rate: 1.1 },
    meat: { f: 'meat.wav', rate: 0.85 },
    magnet: { f: 'magnet.wav', rate: 1.0 },
    bomb: { f: 'bomb.wav', rate: 1.0 },
    freeze: { f: 'freeze.wav', rate: 0.9 },
    chest_open: { f: 'chest_open.wav', rate: 1.0 }
  };
  const sfxBuffers = Object.create(null);   // name -> AudioBuffer | 'failed' | undefined(加载中)
  const fileSfxUsable = !!(window.fetch && window.AudioContext);
  function loadSfxBuffer(name) {
    const state = sfxBuffers[name];
    if (state !== undefined) return state;
    const spec = SFX_FILE[name];
    if (!spec || !fileSfxUsable) { sfxBuffers[name] = 'failed'; return 'failed'; }
    sfxBuffers[name] = 'failed';          // 先标记失败,成功后覆盖(防止并发重复请求)
    fetch(SFX_DIR + spec.f).then(function (resp) {
      if (!resp.ok) throw new Error('http ' + resp.status);
      return resp.arrayBuffer();
    }).then(function (ab) {
      const p = ctx.decodeAudioData(ab, function (buf) {
        sfxBuffers[name] = buf;
      }, function () { sfxBuffers[name] = 'failed'; });
      if (p && typeof p.catch === 'function') p.then(function (buf) { sfxBuffers[name] = buf; })
        .catch(function () { sfxBuffers[name] = 'failed'; });
    }).catch(function () { sfxBuffers[name] = 'failed'; });
    return undefined;                      // 本次先走合成兜底
  }
  function playSfxFile(name) {
    const buf = loadSfxBuffer(name);
    if (!buf || buf === 'failed') return false;
    const spec = SFX_FILE[name];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // 基准速率 + 每次微调,录音音效不再像循环样本一样机械
    src.playbackRate.value = spec.rate * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g); g.connect(sfxBus);
    src.start();
    return true;
  }
  // 手势解锁后预热最常用的一批,首次触发即零延迟
  function warmSfxFiles() {
    const warm = ['ui_click', 'hit1', 'hit2', 'coin', 'gem', 'shoot_bolt', 'enemy_die', 'crit'];
    for (let i = 0; i < warm.length; i++) loadSfxBuffer(warm[i]);
  }

  const SFX = {
    // --- UI / 流程 ---
    ui_click: function (t) {
      _tone(sfxBus, t, 0.06, 'square', 880, 640, 0.16);
    },
    ui_hover: function (t) {
      _tone(sfxBus, t, 0.035, 'sine', 1250, 1400, 0.06);
    },
    ui_back: function (t) {
      _tone(sfxBus, t, 0.08, 'square', 620, 400, 0.15);
    },
    run_start: function (t) {
      _tone(sfxBus, t, 0.1, 'square', 220, 0, 0.14);
      _tone(sfxBus, t + 0.09, 0.1, 'square', 330, 0, 0.14);
      _duo(sfxBus, t + 0.18, 0.28, 'square', 440, 0.13);
      _noise(sfxBus, t, 0.3, 0.06, 'highpass', 1500, 5000, 1, 1);
    },

    // --- 攻击 ---
    shoot_slash: function (t) {
      const m = 0.9 + Math.random() * 0.2;
      _noise(sfxBus, t, 0.12, 0.16, 'bandpass', 800 * m, 3200 * m, 1.4, 1);
      _tone(sfxBus, t, 0.09, 'triangle', 620 * m, 1500 * m, 0.06);
    },
    shoot_bolt: function (t) {
      const m = 0.92 + Math.random() * 0.16;
      _tone(sfxBus, t, 0.12, 'square', 960 * m, 300 * m, 0.12, 4);
      _tone(sfxBus, t, 0.1, 'square', 970 * m, 320 * m, 0.06, -6);
    },
    shoot_arrow: function (t) {
      const m = 0.92 + Math.random() * 0.16;
      _noise(sfxBus, t, 0.05, 0.09, 'highpass', 2600, 5200, 1, 1.3);
      _tone(sfxBus, t, 0.07, 'triangle', 1500 * m, 850 * m, 0.08);
    },
    shoot_axe: function (t) {
      const m = 0.9 + Math.random() * 0.2;
      _noise(sfxBus, t, 0.16, 0.14, 'bandpass', 320 * m, 900 * m, 1, 0.8);
      _tone(sfxBus, t, 0.14, 'triangle', 250 * m, 105 * m, 0.13);
    },
    shoot_dagger: function (t) {
      const m = 0.88 + Math.random() * 0.24;
      _tone(sfxBus, t, 0.045, 'square', 1850 * m, 1250 * m, 0.07);
    },
    shoot_book: function (t) {
      const m = 0.92 + Math.random() * 0.16;
      _noise(sfxBus, t, 0.08, 0.12, 'lowpass', 1400, 500, 1, 1);
      _tone(sfxBus, t, 0.09, 'triangle', 500 * m, 780 * m, 0.07);
    },
    shoot_flask: function (t) {
      const m = 0.92 + Math.random() * 0.16;
      _tone(sfxBus, t, 0.11, 'sine', 660 * m, 1050 * m, 0.11);
      _noise(sfxBus, t, 0.05, 0.05, 'highpass', 3600, 0, 1, 1);
    },
    zap: function (t) {
      const m = 0.88 + Math.random() * 0.24;
      _tone(sfxBus, t, 0.08, 'square', 1500 * m, 160, 0.12, 8);
      _noise(sfxBus, t, 0.06, 0.09, 'highpass', 2800, 7500, 1, 1.5);
    },
    nova: function (t) {
      _tone(sfxBus, t, 0.32, 'triangle', 900, 170, 0.2);
      _noise(sfxBus, t, 0.3, 0.12, 'bandpass', 2600, 380, 1, 1);
      _tone(sfxBus, t, 0.38, 'sine', 2400, 1900, 0.05, 0, 0.02);
    },
    turret_place: function (t) {
      _tone(sfxBus, t, 0.05, 'square', 290, 0, 0.15);
      _tone(sfxBus, t + 0.07, 0.07, 'square', 460, 0, 0.15);
      _noise(sfxBus, t, 0.03, 0.09, 'highpass', 4200, 0, 1, 1);
    },

    // --- 命中 / 受击(随机音高 ±15% 防疲劳) ---
    hit1: function (t) {
      const m = 0.85 + Math.random() * 0.3;
      _noise(sfxBus, t, 0.05, 0.18, 'bandpass', 1150 * m, 480 * m, 1.2, m);
      _tone(sfxBus, t, 0.06, 'square', 330 * m, 140 * m, 0.16);
    },
    hit2: function (t) {
      const m = 0.85 + Math.random() * 0.3;
      _noise(sfxBus, t, 0.055, 0.18, 'bandpass', 820 * m, 380 * m, 1.2, m);
      _tone(sfxBus, t, 0.065, 'square', 260 * m, 115 * m, 0.16);
    },
    crit: function (t) {
      const m = 0.85 + Math.random() * 0.3;
      _tone(sfxBus, t, 0.09, 'square', 1050 * m, 320 * m, 0.2, 5);
      _tone(sfxBus, t, 0.07, 'square', 1580 * m, 500 * m, 0.09, -5);
      _noise(sfxBus, t, 0.07, 0.15, 'highpass', 1800 * m, 900, 1, m);
    },
    enemy_die: function (t) {
      const m = 0.85 + Math.random() * 0.3;
      _tone(sfxBus, t, 0.17, 'square', 420 * m, 68, 0.18);
      _noise(sfxBus, t, 0.15, 0.16, 'lowpass', 1300 * m, 260, 1, m);
    },
    splat: function (t) {
      const m = 0.85 + Math.random() * 0.3;
      _noise(sfxBus, t, 0.13, 0.26, 'lowpass', 640 * m, 180, 1, 0.55 * m);
      _tone(sfxBus, t, 0.09, 'sine', 200 * m, 70, 0.15);
    },
    player_hurt: function (t) {
      _tone(sfxBus, t, 0.24, 'square', 210, 78, 0.26);
      _tone(sfxBus, t, 0.24, 'square', 222, 84, 0.15);
      _noise(sfxBus, t, 0.12, 0.18, 'bandpass', 900, 300, 1, 0.9);
    },

    // --- 拾取 / 成长 ---
    gem: function (t) {
      const m = 0.94 + Math.random() * 0.12;
      _tone(sfxBus, t, 0.045, 'square', 1245 * m, 0, 0.06);
      _tone(sfxBus, t + 0.045, 0.09, 'square', 1865 * m, 0, 0.06);
    },
    coin: function (t) {
      _tone(sfxBus, t, 0.06, 'square', 988, 0, 0.1);
      _tone(sfxBus, t + 0.06, 0.16, 'square', 1319, 0, 0.1);
    },
    meat: function (t) {
      _noise(sfxBus, t, 0.09, 0.2, 'lowpass', 480, 160, 1, 0.7);
      _tone(sfxBus, t, 0.1, 'sine', 165, 70, 0.18);
    },
    magnet: function (t) {
      _tone(sfxBus, t, 0.28, 'triangle', 300, 1500, 0.11, 0, 0.01);
      _tone(sfxBus, t, 0.28, 'triangle', 306, 1530, 0.06, 0, 0.01);
      _tone(sfxBus, t + 0.24, 0.12, 'sine', 2200, 2600, 0.05);
    },
    bomb: function (t) {
      _tone(sfxBus, t, 0.5, 'sine', 130, 28, 0.6, 0, 0.006);
      _noise(sfxBus, t, 0.5, 0.45, 'lowpass', 3000, 110, 0.7, 1);
      _noise(sfxBus, t, 0.07, 0.25, 'highpass', 1400, 0, 1, 1);
    },
    freeze: function (t) {
      _tone(sfxBus, t, 0.12, 'sine', 2093, 0, 0.09);
      _tone(sfxBus, t + 0.09, 0.12, 'sine', 1568, 0, 0.09);
      _tone(sfxBus, t + 0.18, 0.3, 'sine', 1319, 0, 0.09);
      _noise(sfxBus, t, 0.4, 0.04, 'highpass', 7000, 0, 1.4, 1);
    },
    chest_open: function (t) {
      _noise(sfxBus, t, 0.14, 0.09, 'lowpass', 750, 280, 1, 0.5);
      _tone(sfxBus, t + 0.1, 0.09, 'square', 659, 0, 0.1);
      _tone(sfxBus, t + 0.2, 0.2, 'square', 880, 0, 0.1);
      _tone(sfxBus, t + 0.3, 0.18, 'sine', 1760, 0, 0.06);
    },
    levelup: function (t) {
      _tone(sfxBus, t, 0.08, 'square', 523, 0, 0.1);
      _tone(sfxBus, t + 0.08, 0.08, 'square', 659, 0, 0.1);
      _tone(sfxBus, t + 0.16, 0.08, 'square', 784, 0, 0.1);
      _duo(sfxBus, t + 0.24, 0.32, 'square', 1047, 0.1);
      _noise(sfxBus, t + 0.24, 0.28, 0.04, 'highpass', 6000, 0, 1, 1);
    },
    upgrade_pick: function (t) {
      _tone(sfxBus, t, 0.05, 'square', 660, 0, 0.12);
      _tone(sfxBus, t + 0.07, 0.14, 'square', 990, 0, 0.12);
    },
    evolve: function (t) {
      _tone(sfxBus, t, 0.09, 'square', 392, 0, 0.12);
      _tone(sfxBus, t + 0.09, 0.09, 'square', 587, 0, 0.12);
      _tone(sfxBus, t + 0.18, 0.09, 'square', 784, 0, 0.12);
      _duo(sfxBus, t + 0.27, 0.5, 'square', 1175, 0.11);
      _noise(sfxBus, t + 0.27, 0.45, 0.05, 'highpass', 5500, 0, 1, 1);
      _tone(sfxBus, t, 0.6, 'sine', 98, 45, 0.22, 0, 0.05);
    },
    // 禁忌典籍恶魔入场:低频轰鸣 + 向下扫频的黑烟 + 尖啸泛音
    summon_demon: function (t) {
      _noise(sfxBus, t, 0.85, 0.3, 'lowpass', 900, 90, 0.9, 0.6);
      _tone(sfxBus, t, 0.8, 'sawtooth', 130, 38, 0.3, -3, 0.25);
      _tone(sfxBus, t + 0.12, 0.5, 'square', 620, 140, 0.09, 2);
      _tone(sfxBus, t + 0.4, 0.6, 'sine', 55, 30, 0.4);
    },

    // --- 事件 stinger ---
    boss_spawn: function (t) {
      _tone(sfxBus, t, 1.1, 'square', 55, 0, 0.22, 0, 0.4);      // 低音三全音涌动
      _tone(sfxBus, t, 1.1, 'square', 78, 0, 0.15, 5, 0.4);
      _noise(sfxBus, t, 1.2, 0.18, 'lowpass', 150, 60, 1, 0.5);
      _tone(sfxBus, t + 0.85, 0.3, 'sine', 100, 34, 0.4);
    },
    boss_die: function (t) {
      _noise(sfxBus, t, 0.7, 0.4, 'lowpass', 3000, 100, 0.8, 1);
      _tone(sfxBus, t, 0.55, 'sine', 150, 30, 0.55);
      _tone(sfxBus, t + 0.15, 0.12, 'square', 784, 0, 0.11);
      _tone(sfxBus, t + 0.27, 0.12, 'square', 622, 0, 0.11);
      _tone(sfxBus, t + 0.39, 0.12, 'square', 523, 0, 0.11);
      _duo(sfxBus, t + 0.51, 0.45, 'square', 392, 0.11);
      _tone(sfxBus, t + 0.6, 0.7, 'sine', 60, 26, 0.45);
    },
    elite_spawn: function (t) {
      _tone(sfxBus, t, 0.22, 'square', 233, 0, 0.15, 0, 0.01);   // 不谐和双音警报
      _tone(sfxBus, t, 0.22, 'square', 220, 0, 0.15, 0, 0.01);
      _tone(sfxBus, t + 0.3, 0.28, 'square', 233, 0, 0.15, 0, 0.01);
      _tone(sfxBus, t + 0.3, 0.28, 'square', 311, 0, 0.11, 0, 0.01);
    },
    achievement: function (t) {
      _tone(sfxBus, t, 0.07, 'square', 660, 0, 0.08);
      _tone(sfxBus, t + 0.07, 0.07, 'square', 784, 0, 0.08);
      _tone(sfxBus, t + 0.14, 0.07, 'square', 988, 0, 0.08);
      _tone(sfxBus, t + 0.21, 0.07, 'square', 1319, 0, 0.08);
      _duo(sfxBus, t + 0.28, 0.3, 'square', 1760, 0.07);
    },
    gameover: function (t) {
      _duo(sfxBus, t, 0.34, 'square', 440, 0.1);
      _duo(sfxBus, t + 0.36, 0.34, 'square', 330, 0.1);
      _duo(sfxBus, t + 0.72, 0.34, 'square', 262, 0.1);
      _duo(sfxBus, t + 1.08, 0.8, 'square', 220, 0.11);
      _tone(sfxBus, t + 1.08, 0.9, 'sine', 55, 38, 0.28, 0, 0.05);
    },
    victory: function (t) {
      _tone(sfxBus, t, 0.11, 'square', 523, 0, 0.12);
      _tone(sfxBus, t + 0.12, 0.11, 'square', 659, 0, 0.12);
      _tone(sfxBus, t + 0.24, 0.11, 'square', 784, 0, 0.12);
      _duo(sfxBus, t + 0.36, 0.7, 'square', 1047, 0.12);
      _noise(sfxBus, t + 0.36, 0.5, 0.04, 'highpass', 6000, 0, 1, 1);
      _tone(sfxBus, t, 0.5, 'sine', 131, 60, 0.28);
    }
  };

  // ---------------- 图构建 ----------------
  function buildGraph() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(comp);
    musicBus = ctx.createGain();
    musicBus.connect(comp);
    try {  // 音乐总线混响:给声音放进一个"空间",去掉干巴巴的合成塑料感
      const conv = ctx.createConvolver();
      const irLen = (ctx.sampleRate * 2.2) | 0;
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
        }
      }
      conv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      musicBus.connect(conv);
      conv.connect(wet);
      wet.connect(comp);
    } catch (e) { /* 混响不可用时静默跳过,纯干声仍可播 */ }

    const len = (ctx.sampleRate * 1.2) | 0;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) { data[i] = Math.random() * 2 - 1; }
  }

  function applyVolumes() {
    if (!ctx) { return; }
    const now = ctx.currentTime;
    musicBus.gain.setTargetAtTime(volMusic * volMusic * 0.9, now, 0.05);  // 平方近似等响曲线
    sfxBus.gain.setTargetAtTime(volSfx * volSfx, now, 0.05);
  }

  // ---------------- 公共接口(unlock 前调用一律安全) ----------------
  function unlock() {
    if (broken) { return; }
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
          broken = true;
          warnOnce('noctx', '[AudioSys] 本环境不支持 WebAudio,音频停用');
          return;
        }
        ctx = new AC();
        buildGraph();
      } catch (e) {
        broken = true;
        ctx = null;
        warnOnce('ctxfail', '[AudioSys] AudioContext 创建失败,音频停用: ' + e);
        return;
      }
    }
    if (ctx.state === 'suspended') {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') { p.catch(function () {}); }
      } catch (e) { /* 忽略,下次手势再试 */ }
    }
    if (!unlocked) {
      unlocked = true;
      applyVolumes();
      warmSfxFiles();
      if (pendingTheme) { startMusic(pendingTheme); }
    } else if (mus.playing && mus.mediaEl && mus.mediaEl.paused) {
      // 首个手势解锁时,重试此前被自动播放策略拦下的录音曲(过场自动跳菜单后必点才能出声的场景)
      const p = mus.mediaEl.play();
      if (p && typeof p.catch === 'function') { p.catch(function () {}); }
    }
  }

  function play(name) {
    if (SFX_SET[name] !== 1) {
      warnOnce('sfx:' + name, '[AudioSys] 未知音效名: ' + name);
      return;
    }
    if (!unlocked || !ctx) { return; }
    const now = ctx.currentTime;
    if (now - lastAt[name] < MIN_GAP) { return; }   // 同名限流 ≥40ms
    lastAt[name] = now;
    // 录音版优先;尚未就绪/加载失败时退回程序合成,反馈永不缺席
    if (SFX_FILE[name]) {
      try {
        if (playSfxFile(name)) return;
      } catch (e) { /* 文件路径异常,走合成 */ }
    }
    try {
      SFX[name](now);
    } catch (e) {
      warnOnce('sfxerr:' + name, '[AudioSys] 音效播放异常 ' + name + ': ' + e);
    }
  }

  function playMusic(theme) {
    const known = THEMES[theme] || FILE_THEMES[theme];
    if (typeof theme !== 'string' || !known) {
      warnOnce('theme:' + theme, '[AudioSys] 未知音乐主题: ' + theme);
      return;
    }
    if (!unlocked || !ctx) {
      pendingTheme = theme;   // 解锁后自动开播
      return;
    }
    if (mus.playing && mus.theme === theme) { return; }
    try {
      startMusic(theme);
    } catch (e) {
      warnOnce('musstart', '[AudioSys] 音乐启动异常: ' + e);
    }
  }

  function setIntensity(n) {
    n = +n;
    if (n !== n) { n = 0; }
    mus.intensity = (n < 0 ? 0 : (n > 3 ? 3 : n)) | 0;
  }

  function stopMusic() {
    pendingTheme = null;
    if (mus.timer) { clearInterval(mus.timer); mus.timer = 0; }
    stopFilePlayback();
    if (!mus.playing) { return; }
    mus.playing = false;
    if (mus.gain && ctx) { fadeOutGain(mus.gain); }
    mus.gain = null;
    mus.theme = null;
    mus.def = null;
  }

  function setVolumes(music01, sfx01) {
    volMusic = clamp01(music01);
    volSfx = clamp01(sfx01);
    if (unlocked) { applyVolumes(); }
  }

  window.AudioSys = {
    unlock: unlock,
    play: play,
    playMusic: playMusic,
    setIntensity: setIntensity,
    stopMusic: stopMusic,
    setVolumes: setVolumes,
    state: function () {
      return { theme: mus.theme || pendingTheme || '', intensity: mus.intensity | 0, playing: !!mus.playing };
    }
  };

  // ---------------- 覆盖率自检(加载即执行,对照 SPEC 清单) ----------------
  (function selfCheck() {
    const missing = [];
    for (let i = 0; i < SFX_NAMES.length; i++) {
      if (typeof SFX[SFX_NAMES[i]] !== 'function') { missing.push('sfx:' + SFX_NAMES[i]); }
    }
    for (const name in THEMES) {
      if (!Object.prototype.hasOwnProperty.call(THEMES, name)) { continue; }
      const d = THEMES[name];
      if (!d) {
        missing.push('music:' + name);
        continue;
      }
      const leadOk = Array.isArray(d.lead) && d.lead.length >= 2 &&
        d.lead.length % 2 === 0 && d.lead.every(l => Array.isArray(l) && l.length === 16);
      if (d.kick.length !== 16 || d.kickX.length !== 16 || d.snare.length !== 16 ||
          d.hat.length !== 16 || d.hat3.length !== 16 || d.bass.length !== 16 ||
          !leadOk || d.sections.length < 2) {
        missing.push('musicdata:' + name);
      }
    }
    for (let i = 0; i < API_NAMES.length; i++) {
      if (typeof window.AudioSys[API_NAMES[i]] !== 'function') { missing.push('api:' + API_NAMES[i]); }
    }
    console.assert(missing.length === 0, '[AudioSys] 实现覆盖率不完整');
    if (missing.length > 0) {
      console.warn('[AudioSys] 缺失实现: ' + missing.join(', '));
    }
  })();
})();
