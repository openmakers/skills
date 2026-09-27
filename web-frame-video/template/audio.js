// 背景音乐与音效全部用代码合成：和弦铺底、琶音、贝斯、鼓，加上点击、打字、转场、弹出、重音。
// 时间点全部来自 timeline.js，与画面逐帧对齐。输出 out/music.wav（48kHz 立体声 16bit）。
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');

const SR = 48000;
const N = Math.ceil(TL.duration * SR);
const beat = 60 / TL.bpm;
const bar = beat * 4;

// 三条总线：音乐（受底鼓压缩）、鼓、音效；另有一路混响发送
const mus = [new Float32Array(N), new Float32Array(N)];
const drm = [new Float32Array(N), new Float32Array(N)];
const sfx = [new Float32Array(N), new Float32Array(N)];
const verbSend = new Float32Array(N);

let seed = 20260923;
const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;

function biquad(type, f, q) {
  const w = TAU * f / SR, cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = a; b1 = 0; b2 = -a; }
  const a0 = 1 + a;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cw / a0, a2: (1 - a) / a0 };
}
function filterState() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (c, x) => { const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

// 把一个声音写进总线：fn(t) 返回单声道采样，pan -1..1，send 为混响发送量
function place(bus, start, dur, fn, gain = 1, pan = 0, send = 0) {
  const i0 = Math.max(0, Math.round(start * SR)), i1 = Math.min(N, Math.round((start + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR, i);
    bus[0][i] += v * gl;
    bus[1][i] += v * gr;
    if (send) verbSend[i] += v * gain * send;
  }
}

// ---------- 和声 ----------
const CH = [
  [53, 57, 60, 64], // Fmaj7
  [57, 60, 64, 67], // Am7
  [50, 53, 57, 60], // Dm7
  [46, 50, 53, 57], // Bbmaj7
];
const FINAL = [41, 53, 57, 60, 64, 67]; // Fmaj9，收尾长音
const bars = Math.ceil(TL.duration / bar);
const chordAt = (b) => (b >= 21 ? FINAL.slice(1, 5) : b === 20 ? CH[3] : CH[b % 4]);
const rootAt = (b) => [41, 45, 38, 34][b % 4];

// 铺底：每音三个微失谐锯齿（加法合成），低通后铺满
const padL = new Float32Array(N), padR = new Float32Array(N);
for (let b = 0; b < bars; b++) {
  const st = b * bar, last = b >= 21;
  const len = last ? TL.duration - st : bar + 0.9;
  const lvl = st < 5.5 ? 0.75 : st >= 39.5 ? 0.9 : 1;
  chordAt(b).forEach((m) => {
    [-8, 0, 8].forEach((cents, v) => {
      const f = mtof(m) * Math.pow(2, cents / 1200);
      const ph = rand() * TAU;
      const pan = v - 1;
      const gl = Math.cos((pan * 0.6 + 1) * Math.PI / 4), gr = Math.sin((pan * 0.6 + 1) * Math.PI / 4);
      const i0 = Math.round(st * SR), i1 = Math.min(N, Math.round((st + len) * SR));
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SR;
        const env = Math.min(1, t / 0.45) * (last ? 1 : Math.min(1, (len - t) / 0.9));
        let s = 0;
        for (let h = 1; h <= 6; h++) s += Math.sin(TAU * f * h * t + ph * h) / h;
        const val = s * env * lvl * 0.03;
        padL[i] += val * gl;
        padR[i] += val * gr;
      }
    });
  });
}
{
  const c = biquad('lp', 1600, 0.7), fl = filterState(), fr = filterState();
  for (let i = 0; i < N; i++) { mus[0][i] += fl(c, padL[i]); mus[1][i] += fr(c, padR[i]); }
}

// 琶音：FM 木琴音色，开场与结尾走四分音符，中段八分音符
const PATTERN = [0, 1, 2, 3, 1, 2, 3, 2];
function pluck(f, bright) {
  return (t) => {
    const idx = bright * Math.exp(-t * 14);
    return Math.sin(TAU * f * t + idx * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 7) * Math.min(1, t / 0.003);
  };
}
for (let b = 0; b < bars; b++) {
  const st = b * bar;
  const chord = chordAt(b);
  for (let k = 0; k < 8; k++) {
    const t = st + k * beat / 2;
    if (t >= 43) break;
    const dense = t >= 5.5 && t < 39.5;
    if (!dense && k % 2 === 1) continue;
    const m = chord[PATTERN[k] % chord.length] + 12;
    const lvl = t < 5.5 ? 0.16 : t >= 36 && t < 39.5 ? 0.2 : 0.17;
    place(mus, t, 0.8, pluck(mtof(m), 1.6), lvl, k % 2 ? 0.35 : -0.35, 0.5);
  }
}

// 贝斯：八分音符，根音与高八度交替
for (let b = 0; b < bars; b++) {
  for (let k = 0; k < 8; k++) {
    const t = b * bar + k * beat / 2;
    if (t < 5.5 || t >= 39.0) continue;
    const m = rootAt(b) + (k % 4 === 3 ? 12 : 0);
    const f = mtof(m + 12);
    place(mus, t, 0.24, (x) => (Math.sin(TAU * f * x) + 0.35 * Math.sin(TAU * 2 * f * x)) * Math.min(1, x / 0.004) * Math.exp(-x * 5) * Math.min(1, (0.24 - x) / 0.03), 0.3);
  }
}

// 鼓：底鼓每拍，拍手在 2、4 拍，踩镲在反拍
const kicks = [];
for (let t = 5.5; t < 39.0 - 1e-6; t += beat) kicks.push(t);
kicks.forEach((t) => {
  place(drm, t, 0.45, (x) => Math.sin(TAU * (45 * x + (110 / 30) * (1 - Math.exp(-x * 30)))) * Math.exp(-x * 8) + (x < 0.004 ? (rand() * 2 - 1) * 0.3 : 0), 0.75);
});
for (let t = 5.5; t < 39.0 - 1e-6; t += beat) {
  const beatIdx = Math.round((t - 0) / beat) % 4;
  if (beatIdx === 1 || beatIdx === 3) {
    const c = biquad('bp', 1500, 0.9), f = filterState();
    place(drm, t, 0.25, (x) => f(c, rand() * 2 - 1) * (Math.exp(-x * 18) + (x > 0.011 ? 0.6 * Math.exp(-(x - 0.011) * 60) : 0)), 0.55, 0.1, 0.2);
  }
  const c2 = biquad('hp', 7000, 0.7), f2 = filterState();
  place(drm, t + beat / 2, 0.06, (x) => f2(c2, rand() * 2 - 1) * Math.exp(-x * 70), 0.16, 0.3);
}

// 底鼓压缩音乐总线，制造呼吸感
const duck = new Float32Array(N).fill(1);
kicks.forEach((t) => {
  const i0 = Math.round(t * SR);
  for (let i = i0; i < Math.min(N, i0 + SR * 0.4); i++) duck[i] = Math.min(duck[i], 1 - 0.45 * Math.exp(-((i - i0) / SR) * 9));
});
for (let i = 0; i < N; i++) { mus[0][i] *= duck[i]; mus[1][i] *= duck[i]; }

// ---------- 音效 ----------
// 点击
TL.clicks.forEach((t) => {
  place(sfx, t, 0.08, (x) => Math.sin(TAU * 2400 * x) * Math.exp(-x * 260) + 0.6 * Math.sin(TAU * 1100 * x) * Math.exp(-x * 110) + (rand() * 2 - 1) * 0.4 * Math.exp(-x * 900), 0.42, 0, 0.15);
});

// 打字
Object.values(TL.typing).forEach(({ text, start, cps }) => {
  [...text].forEach((_, i) => {
    const f = 1700 + rand() * 900, g = 0.1 * (0.8 + rand() * 0.4), pan = (rand() - 0.5) * 0.4;
    const c = biquad('hp', 3000, 0.7), flt = filterState();
    place(sfx, start + i / cps, 0.05, (x) => flt(c, rand() * 2 - 1) * Math.exp(-x * 380) + 0.5 * Math.sin(TAU * f * x) * Math.exp(-x * 280), g, pan);
  });
});

// 转场嗖声：带通噪声扫频，峰值落在切换点前一点
TL.scenes.slice(1).forEach(({ start }) => {
  if (TL.hits.includes(start)) return;
  const t0 = start - 0.38, d = 0.62, flt = filterState();
  place(sfx, t0, d, (x) => {
    const p = x / d;
    const c = biquad('bp', 300 + 2600 * Math.pow(p, 1.4), 1.2);
    return flt(c, rand() * 2 - 1) * Math.pow(Math.sin(Math.PI * p), 1.6);
  }, 0.55, 0, 0.3);
});

// 弹出
TL.pops.forEach((t) => {
  place(sfx, t, 0.12, (x) => Math.sin(TAU * (520 * x + 450 * Math.min(x, 0.04) * (1 - Math.min(x, 0.04) / 0.08))) * Math.exp(-x * 32) * Math.min(1, x / 0.002), 0.2, (rand() - 0.5) * 0.5, 0.25);
});

// 重音：品牌字标出现时的低频冲击 + 钟声和弦 + 反向镲铺垫
TL.hits.forEach((t) => {
  place(sfx, t, 1.6, (x) => Math.sin(TAU * (40 * x + (30 / 6) * (1 - Math.exp(-x * 6)))) * Math.exp(-x * 2.6) * Math.min(1, x / 0.005), 0.75);
  [65, 69, 72, 76].forEach((m, k) => place(sfx, t + k * 0.012, 2.6, pluck(mtof(m + 12), 1.1), 0.09, (k - 1.5) * 0.3, 0.8));
  const c = biquad('hp', 5000, 0.7), flt = filterState(), d = 0.8;
  place(sfx, t - d, d, (x) => flt(c, rand() * 2 - 1) * Math.pow(x / d, 3), 0.22, 0, 0.3);
});

// 升调铺垫
TL.risers.forEach(([a, b]) => {
  const d = b - a, flt = filterState();
  place(sfx, a, d, (x) => {
    const p = x / d;
    return flt(biquad('bp', 400 + 5600 * p * p, 1.4), rand() * 2 - 1) * p * p;
  }, 0.45, 0, 0.4);
});

// ---------- 混响（Schroeder：4 梳状 + 2 全通） ----------
function reverb(input) {
  const out = new Float32Array(N);
  const combs = [1687, 1601, 1867, 1777].map((d) => ({ buf: new Float32Array(d), i: 0, s: 0 }));
  const aps = [556, 241].map((d) => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = input[n];
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.s = o * 0.7 + c.s * 0.3;
      c.buf[c.i] = x + c.s * 0.82;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const o = a.buf[a.i];
      const v = -0.5 * y + o;
      a.buf[a.i] = y + 0.5 * v;
      a.i = (a.i + 1) % a.buf.length;
      y = v;
    }
    out[n] = y * 0.25;
  }
  return out;
}
const wet = reverb(verbSend);

// ---------- 混音与母带 ----------
const fadeOut = (t) => (t < 43 ? 1 : Math.max(0, 1 - (t - 43) / 2) ** 1.5);
const L = new Float32Array(N), R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const wl = wet[i], wr = i > 700 ? wet[i - 700] : 0; // 左右错开一点，拉宽空间
  const f = fadeOut(t);
  L[i] = (mus[0][i] + drm[0][i] + wl) * f + sfx[0][i];
  R[i] = (mus[1][i] + drm[1][i] + wr) * f + sfx[1][i];
  L[i] = Math.tanh(L[i] * 1.1);
  R[i] = Math.tanh(R[i] * 1.1);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;

const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVE', 8);
data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'music.wav'), data);
console.log(`out/music.wav  ${TL.duration}s  峰值归一系数 ${norm.toFixed(2)}`);
