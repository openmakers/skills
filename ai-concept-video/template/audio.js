// 背景音乐与音效全部用代码合成，时间点来自 timeline.js 的 events，与画面逐帧对齐。
//   out/music.wav  温和的 lo-fi 铺底：电钢琴和弦 + 软铺底 + 低音 + 轻鼓，给人声让路
//   out/sfx.wav    转场嗖声、元素弹出、重音、终端敲键
//   out/mix.wav    有配音时：人声统一响度，音乐在人声处自动压低，三轨混合后整体统一到 -14 LUFS；成片和预览都用它
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const TL = require('./timeline.js');

const OUT = path.join(__dirname, 'out');
const SR = 48000;
const DUR = TL.duration;
const N = Math.ceil(DUR * SR);
const TAU = Math.PI * 2;
const BPM = 86;
const beat = 60 / BPM, bar = beat * 4;

let seed = 20260924;
const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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
const bus = () => [new Float32Array(N), new Float32Array(N)];
const mus = bus(), drm = bus(), sfx = bus();
const verbSend = new Float32Array(N);
function place(b, start, dur, fn, gain = 1, pan = 0, send = 0) {
  const i0 = Math.max(0, Math.round(start * SR)), i1 = Math.min(N, Math.round((start + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR);
    b[0][i] += v * gl;
    b[1][i] += v * gr;
    if (send) verbSend[i] += v * gain * send;
  }
}

// ---------- 和声：IV – iii – ii – I（Fmaj9 → Em7 → Dm9 → Cmaj9），一小节一个和弦 ----------
const PROG = [[53, 57, 60, 64, 67], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]];
const ROOT = [41, 40, 38, 36];
const bars = Math.ceil(DUR / bar);
const endBar = Math.max(1, Math.floor((DUR - 2.5) / bar)); // 从这一小节起落到主和弦，长音收尾
const chordOf = (b) => (b >= endBar ? PROG[3] : PROG[b % 4]);
const rootOf = (b) => (b >= endBar ? ROOT[3] : ROOT[b % 4]);
const drumsOn = (t) => t >= bar * 2 && t < endBar * bar;

// 电钢琴：FM（调制比 1，调制深度随时间衰减），轻微颤音
function ep(f, len) {
  return (t) => {
    const idx = 1.1 * Math.exp(-t * 3) + 0.15;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 1.1) * Math.min(1, (len - t) / 0.25);
    return Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) * env * (1 + 0.08 * Math.sin(TAU * 4.5 * t));
  };
}
for (let b = 0; b < bars; b++) {
  const st = b * bar, chord = chordOf(b), final = b >= endBar;
  const len = final ? DUR - st : bar * 0.62;
  chord.forEach((m, k) => place(mus, st + k * 0.018, len, ep(mtof(m), len), 0.07, (k / (chord.length - 1) - 0.5) * 0.6, 0.35));
  if (!final) chord.slice(1, 4).forEach((m, k) => place(mus, st + beat * 2.5 + k * 0.014, beat * 1.3, ep(mtof(m + 12), beat * 1.3), 0.035, 0.3 - k * 0.3, 0.4));
  if (final) break;
}

// 软铺底：三角波和弦，低通到 900Hz，给整段一层底色
{
  const padL = new Float32Array(N), padR = new Float32Array(N);
  for (let b = 0; b < bars; b++) {
    const st = b * bar, final = b >= endBar, len = final ? DUR - st : bar + 0.6;
    chordOf(b).slice(0, 4).forEach((m, k) => {
      const f = mtof(m) * (k % 2 ? 1.002 : 0.998);
      const i0 = Math.round(st * SR), i1 = Math.min(N, Math.round((st + len) * SR));
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SR;
        const env = Math.min(1, t / 0.6) * (final ? 1 : Math.min(1, (len - t) / 0.6));
        const ph = (f * t) % 1, tri = 4 * Math.abs(ph - 0.5) - 1;
        (k % 2 ? padR : padL)[i] += tri * env * 0.022;
      }
    });
    if (final) break;
  }
  const c = biquad('lp', 900, 0.7), fl = filterState(), fr = filterState();
  for (let i = 0; i < N; i++) { mus[0][i] += fl(c, padL[i] * 0.8 + padR[i] * 0.2); mus[1][i] += fr(c, padR[i] * 0.8 + padL[i] * 0.2); }
}

// 低音：正弦，第一拍长音 + 第三拍后半拍短音
for (let b = 0; b < endBar + 1 && b < bars; b++) {
  const f = mtof(rootOf(b) + 12), final = b >= endBar;
  const hits = final ? [[0, DUR - b * bar]] : [[0, beat * 1.8], [beat * 2.5, beat * 1.2]];
  hits.forEach(([o, len]) => place(mus, b * bar + o, len, (x) => (Math.sin(TAU * f * x) + 0.2 * Math.sin(TAU * 2 * f * x)) * Math.min(1, x / 0.01) * Math.min(1, (len - x) / 0.08) * (final ? Math.exp(-x * 0.8) : 1), 0.22));
}

// 轻鼓：底鼓在 1 和 3 拍后半拍，指响在 2、4 拍，沙锤走八分音符带一点摇摆
for (let t = 0; t < DUR; t += bar) {
  if (!drumsOn(t)) continue;
  [0, beat * 2.5].forEach((o) => place(drm, t + o, 0.35, (x) => Math.sin(TAU * (48 * x + (70 / 25) * (1 - Math.exp(-x * 25)))) * Math.exp(-x * 9), 0.42));
  [1, 3].forEach((k) => {
    const c = biquad('bp', 1900, 1.2), f = filterState();
    place(drm, t + beat * k, 0.12, (x) => f(c, rand() * 2 - 1) * Math.exp(-x * 45), 0.2, 0.15, 0.3);
  });
  for (let k = 0; k < 8; k++) {
    const c = biquad('hp', 6500, 0.7), f = filterState();
    const at = t + k * beat / 2 + (k % 2 ? beat * 0.08 : 0);
    place(drm, at, 0.07, (x) => f(c, rand() * 2 - 1) * Math.exp(-x * 60) * Math.min(1, x / 0.004), k % 2 ? 0.07 : 0.045, 0.35);
  }
}

// ---------- 音效 ----------
TL.events.whoosh.forEach((start) => {
  const t0 = start - 0.34, d = 0.56, flt = filterState();
  place(sfx, t0, d, (x) => {
    const p = x / d;
    return flt(biquad('bp', 280 + 2200 * Math.pow(p, 1.3), 1.1), rand() * 2 - 1) * Math.pow(Math.sin(Math.PI * p), 1.8);
  }, 0.32, 0, 0.3);
});
// 元素出现：木质「嗒」一声，音高随机小幅变化
TL.events.pop.forEach((t) => {
  const f = 880 * (1 + (rand() - 0.5) * 0.25);
  place(sfx, t, 0.14, (x) => (Math.sin(TAU * f * x * (1 - 0.3 * Math.min(1, x / 0.05))) * Math.exp(-x * 38) + (rand() * 2 - 1) * 0.25 * Math.exp(-x * 700)) * Math.min(1, x / 0.0015), 0.14, (rand() - 0.5) * 0.4, 0.2);
});
// 重音：开场标题与收尾品牌，低频冲击 + 钟声和弦
TL.events.hit.forEach((t) => {
  place(sfx, t, 1.4, (x) => Math.sin(TAU * (42 * x + (28 / 6) * (1 - Math.exp(-x * 6)))) * Math.exp(-x * 3) * Math.min(1, x / 0.005), 0.5);
  [72, 76, 79, 83].forEach((m, k) => place(sfx, t + k * 0.015, 2.4, (x) => Math.sin(TAU * mtof(m) * x + 0.8 * Math.exp(-x * 8) * Math.sin(TAU * mtof(m) * 3.5 * x)) * Math.exp(-x * 2.2) * Math.min(1, x / 0.003), 0.05, (k - 1.5) * 0.3, 0.7));
});
// 终端敲键
TL.events.keys.forEach(({ start, n, cps }) => {
  for (let i = 0; i < n; i++) {
    const c = biquad('hp', 3000, 0.7), flt = filterState(), f = 1800 + rand() * 800;
    place(sfx, start + i / cps + (rand() - 0.5) * 0.012, 0.05, (x) => flt(c, rand() * 2 - 1) * Math.exp(-x * 380) + 0.5 * Math.sin(TAU * f * x) * Math.exp(-x * 280), 0.08 * (0.8 + rand() * 0.4), (rand() - 0.5) * 0.3);
  }
});

// ---------- 混响（Schroeder：4 梳状 + 2 全通） ----------
function reverb(input) {
  const out = new Float32Array(N);
  const combs = [1687, 1601, 1867, 1777].map((d) => ({ buf: new Float32Array(d), i: 0, s: 0 }));
  const aps = [556, 241].map((d) => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.s = o * 0.7 + c.s * 0.3;
      c.buf[c.i] = input[n] + c.s * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const o = a.buf[a.i], v = -0.5 * y + o;
      a.buf[a.i] = y + 0.5 * v;
      a.i = (a.i + 1) % a.buf.length;
      y = v;
    }
    out[n] = y * 0.25;
  }
  return out;
}
const wet = reverb(verbSend);

// ---------- 写文件 ----------
function writeWav(file, L, R, k) {
  const data = Buffer.alloc(44 + N * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * k)) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * k)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, data);
}
const peakOf = (L, R) => { let p = 1e-9; for (let i = 0; i < N; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); return p; };
fs.mkdirSync(OUT, { recursive: true });
const fade = (t) => Math.min(1, t / 1.2) * (t > DUR - 2.5 ? Math.max(0, (DUR - t) / 2.5) ** 1.3 : 1);
const mL = new Float32Array(N), mR = new Float32Array(N), sL = new Float32Array(N), sR = new Float32Array(N);
const warm = biquad('lp', 6000, 0.7), wl = filterState(), wr = filterState();
for (let i = 0; i < N; i++) {
  const f = fade(i / SR), w = wet[i], w2 = i > 700 ? wet[i - 700] : 0;
  mL[i] = Math.tanh(wl(warm, mus[0][i] + drm[0][i] + w * 0.7) * f * 1.2);
  mR[i] = Math.tanh(wr(warm, mus[1][i] + drm[1][i] + w2 * 0.7) * f * 1.2);
  sL[i] = sfx[0][i] + w * 0.3;
  sR[i] = sfx[1][i] + w2 * 0.3;
}
const music = path.join(OUT, 'music.wav'), sfxFile = path.join(OUT, 'sfx.wav'), voice = path.join(OUT, 'voice.wav'), mix = path.join(OUT, 'mix.wav');
// 两轨用同一个归一系数，保持原本的相对音量；音效峰值过高时单独压一点
const k = 0.89 / peakOf(mL, mR);
writeWav(music, mL, mR, k);
writeWav(sfxFile, sL, sR, Math.min(k, 0.98 / peakOf(sL, sR)));

// 混音：人声 -16 LUFS 做侧链，把音乐在说话处再压低约 10 dB；音效不压；最后整体 -14 LUFS
const MUSIC_LEVEL = 0.5;
const hasVoice = fs.existsSync(voice);
const graph = hasVoice
  ? `[2:a]loudnorm=I=-16:TP=-2:LRA=7,asplit=2[key][vo];[0:a]volume=${MUSIC_LEVEL}[m];[m][key]sidechaincompress=threshold=0.012:ratio=12:attack=20:release=400[bg];[1:a]volume=${MUSIC_LEVEL}[fx];[bg][fx][vo]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]`
  : `[0:a][1:a]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
const args = ['-y', '-loglevel', 'error', '-i', music, '-i', sfxFile, ...(hasVoice ? ['-i', voice] : []), '-filter_complex', graph, '-map', '[a]', '-ar', '48000', '-ac', '2', mix];
execFile('ffmpeg', args, (err, _o, stderr) => {
  if (err) { console.error(`混音失败：${stderr || err.message}`); process.exit(1); }
  console.log(`out/music.wav + out/sfx.wav → out/mix.wav（${DUR}s，${hasVoice ? '含配音' : '无配音'}）`);
});
