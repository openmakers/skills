// 播客配乐，全部代码合成，输出 out/music.wav（48kHz 立体声 16bit）；有 out/voice.wav 时顺手混一份 out/preview.wav 给网页预览用。
// 编配：Lo-fi 慢板（82 BPM），电钢琴和弦 + 低音 + 轻底鼓 / 刷子军鼓 / 踩镲 + 黑胶底噪；
// 片头 lead 秒内先起一句完整的和弦铺垫，片尾最后一句之后落在主和弦上。
// 音效只有两种：换章的轻铃、要点卡弹出的柔和「嘟」。人声处的压低由 render.js 的侧链压缩负责。
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');
const VOICE = require('./voice.js');

const SR = 48000;
const D = TL.duration;
const N = Math.ceil(D * SR);
const TAU = Math.PI * 2;
const BPM = TL.bpm || 82, beat = 60 / BPM, bar = beat * 4;

const mus = [new Float32Array(N), new Float32Array(N)];
const sfx = [new Float32Array(N), new Float32Array(N)];
const verbSend = new Float32Array(N);

let seed = 20261001;
const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const noise = () => rand() * 2 - 1;
const att = (x, a = 0.004) => Math.min(1, x / a);

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
function place(bus, start, dur, fn, gain = 1, pan = 0, send = 0) {
  const i0 = Math.max(0, Math.round(start * SR)), i1 = Math.min(N, Math.round((start + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR);
    bus[0][i] += v * gl; bus[1][i] += v * gr;
    if (send) verbSend[i] += v * gain * send;
  }
}

// ---------- 和声：Fmaj7 → Em7 → Dm7 → Cmaj7 ----------
const CH = [
  { root: 29, tones: [57, 60, 64, 69] },
  { root: 28, tones: [55, 59, 62, 64] },
  { root: 26, tones: [53, 57, 60, 65] },
  { root: 24, tones: [55, 59, 60, 64] },
];
const END = VOICE.end + 0.6;                 // 最后一句说完，落到主和弦
const bars = Math.floor(END / bar);
const DRUMS_FROM = TL.lead || 1.5;           // 片头只有电钢琴，第一句开口时进鼓

// 电钢琴：FM 正弦 + 轻颤音，起音柔、尾音长
const rhodes = (f, dur) => (x) => {
  const env = Math.min(1, x / 0.02) * Math.exp(-x * 1.6) * Math.min(1, (dur - x) / 0.3);
  return Math.sin(TAU * f * x + 0.9 * Math.exp(-x * 4) * Math.sin(TAU * f * x)) * env * (1 + 0.12 * Math.sin(TAU * 4.5 * x));
};
for (let b = 0; b < bars; b++) {
  const st = b * bar, ch = CH[b % 4];
  ch.tones.forEach((m, j) => place(mus, st + j * 0.035, bar + 0.4, rhodes(mtof(m), bar + 0.4), 0.075, (j - 1.5) * 0.25, 0.35));
  // 第三拍补一次轻和弦，留出摇摆感
  ch.tones.slice(1).forEach((m, j) => place(mus, st + 2.5 * beat + j * 0.03, beat * 1.4, rhodes(mtof(m + 12), beat * 1.4), 0.03, (j - 1) * 0.4, 0.4));
  // 低音：根音长音
  place(mus, st, bar, (x) => (Math.sin(TAU * mtof(ch.root + 12) * x) + 0.25 * Math.sin(TAU * mtof(ch.root + 24) * x)) * Math.min(1, x / 0.03) * Math.exp(-x * 0.9), 0.24);
  if (st + bar <= DRUMS_FROM) continue;
  for (let k = 0; k < 4; k++) {
    const t = st + k * beat;
    if (t < DRUMS_FROM) continue;
    if (k === 0 || (k === 2 && b % 2)) place(mus, t, 0.4, (x) => Math.sin(TAU * (45 * x + (80 / 22) * (1 - Math.exp(-x * 22)))) * Math.exp(-x * 8), 0.34);
    if (k === 1 || k === 3) { const c = biquad('bp', 1800, 0.8), f = filterState(); place(mus, t, 0.22, (x) => f(c, noise()) * Math.exp(-x * 18), 0.13, 0.1, 0.2); }
    [0, 0.5].forEach((o) => { const c = biquad('hp', 7000, 0.7), f = filterState(); place(mus, t + o * beat + (o ? 0.03 : 0), 0.05, (x) => f(c, noise()) * Math.exp(-x * 90), o ? 0.035 : 0.05, 0.35); });
  }
}
// 收尾：主和弦 Fmaj9 长音
[41, 53, 57, 60, 64, 67].forEach((m, j) => place(mus, END, 3.4, rhodes(mtof(m), 3.4), 0.07, (j - 2.5) * 0.2, 0.5));

// 黑胶底噪：极轻的嘶声 + 稀疏的噼啪
{
  const c = biquad('lp', 5000, 0.7), f = filterState();
  place(mus, 0, D, (x) => f(c, noise()) * 0.5, 0.012);
  for (let t = 0.3; t < D; t += 0.15 + rand() * 0.9) place(mus, t, 0.006, (x) => noise() * Math.exp(-x * 900), 0.05 * rand(), (rand() - 0.5) * 0.8);
}

// ---------- 音效 ----------
const at = (id) => VOICE.lines.find((l) => l.id === id).at;
TL.chapters.slice(1).forEach((c) => {
  const t = at(c.from) - 0.45;
  [84, 91].forEach((m, j) => place(sfx, t + j * 0.09, 1.6, (x) => Math.sin(TAU * mtof(m) * x + 0.8 * Math.exp(-x * 5) * Math.sin(TAU * mtof(m) * 2.76 * x)) * Math.exp(-x * 3.2) * att(x, 0.002), 0.055, j ? 0.25 : -0.25, 0.6));
});
TL.chapters.forEach((c) => (c.keys || []).forEach((k) => {
  place(sfx, at(k.at) + 0.15, 0.18, (x) => Math.sin(TAU * (520 * x + 900 * x * x)) * Math.exp(-x * 24) * att(x, 0.003), 0.08, 0, 0.3);
}));

// ---------- 混响 ----------
function reverb(input) {
  const out = new Float32Array(N);
  const combs = [1687, 1601, 1867, 1777].map((d) => ({ buf: new Float32Array(d), i: 0, s: 0 }));
  const aps = [556, 241].map((d) => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let y = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.s = o * 0.6 + c.s * 0.4; c.buf[c.i] = input[n] + c.s * 0.82; c.i = (c.i + 1) % c.buf.length; y += o; }
    for (const a of aps) { const o = a.buf[a.i]; const v = -0.5 * y + o; a.buf[a.i] = y + 0.5 * v; a.i = (a.i + 1) % a.buf.length; y = v; }
    out[n] = y * 0.25;
  }
  return out;
}
const wet = reverb(verbSend);

// ---------- 母带 ----------
const fade = (t) => Math.min(1, t / 0.4) * (t < D - 1.5 ? 1 : Math.max(0, (D - t) / 1.5));
const L = new Float32Array(N), R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const g = fade(i / SR);
  L[i] = Math.tanh((mus[0][i] + wet[i] + sfx[0][i]) * g * 1.6);
  R[i] = Math.tanh((mus[1][i] + (i > 700 ? wet[i - 700] : 0) + sfx[1][i]) * g * 1.6);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.86 / peak;
function writeWav(file, l, r) {
  const data = Buffer.alloc(44 + N * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l(i))) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r(i))) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, data);
}
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
writeWav(path.join(OUT, 'music.wav'), (i) => L[i] * norm, (i) => R[i] * norm);
console.log(`out/music.wav  ${D.toFixed(2)}s`);

// 预览混音：人声原样 + 配乐压到三成（成片的混音以 render.js 为准）
const vf = path.join(OUT, 'voice.wav');
if (fs.existsSync(vf)) {
  const v = fs.readFileSync(vf), off = v.indexOf('data') + 8, vn = Math.min(N, (v.length - off) / 4);
  const vs = (i, ch) => (i < vn ? v.readInt16LE(off + i * 4 + ch * 2) / 32768 : 0);
  writeWav(path.join(OUT, 'preview.wav'), (i) => L[i] * norm * 0.3 + vs(i, 0), (i) => R[i] * norm * 0.3 + vs(i, 1));
  console.log('out/preview.wav（网页预览用）');
}
