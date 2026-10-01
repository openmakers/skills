// 双人对白配音：按 timeline.js 的 TL.lines 逐句合成，句子按真实时长首尾相接，生成
//   out/voice.wav  整条人声轨（与画面同一条时间轴）
//   voice.js       每句 who / at / dur / text，以及每秒 30 帧的声波包络 env（画面声波、说话人高亮都读它）
//
//   node tts.js           合成缺失的句子（按文本 + 音色 + 语速做缓存，改哪句只重合成哪句）
//   node tts.js --check   合成后再用语音识别回听每一句，和原文比对
//
// 接口：任何提供 MiniMax speech-2.8-hd 的 OpenAI 兼容服务，POST <TTS_BASE_URL>/v1/audio/speech，key 读 TTS_API_KEY。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const TL = require('./timeline.js');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out', 'voice');
const BASE = (process.env.TTS_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.TTS_API_KEY;
const MODEL = TL.ttsModel || 'speech-2.8-hd';
const CHECK = process.argv.includes('--check');
const ENV_FPS = 30;
if (!BASE || !KEY) throw new Error('先设置环境变量 TTS_BASE_URL 与 TTS_API_KEY');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024, ...opts }, (err, stdout, stderr) => (err ? reject(new Error(`${cmd} 失败：${stderr || err.message}`)) : resolve(stdout)));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 远端调用统一 3 次退避重试（1s / 3s / 6s）；限流时并发高也能慢慢跑完
async function withRetry(label, fn) {
  const waits = [1000, 3000, 6000];
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= waits.length) throw new Error(`${label}：${e.message}`);
      console.warn(`  ${label} 第 ${i + 1} 次失败，${waits[i] / 1000}s 后重试：${e.message.slice(0, 120)}`);
      await sleep(waits[i]);
    }
  }
}

async function synth(line, file) {
  await withRetry(`合成 ${line.id}`, async () => {
    const res = await fetch(`${BASE}/v1/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: line.text, voice: line.voice, speed: line.speed }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !/audio/.test(res.headers.get('content-type') || '')) throw new Error(`HTTP ${res.status} ${buf.toString('utf8', 0, 200)}`);
    fs.writeFileSync(file, buf);
  });
}

async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return +(+out.trim()).toFixed(3);
}

// 声波包络：解成 8kHz 单声道 PCM，每 1/30 秒取一次均方根
async function envelope(file) {
  const pcm = await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer' });
  const n = pcm.length / 2, win = 8000 / ENV_FPS, out = [];
  for (let s = 0; s < n; s += win) {
    let acc = 0, c = 0;
    for (let i = Math.floor(s); i < Math.min(n, s + win); i++) { const v = pcm.readInt16LE(i * 2) / 32768; acc += v * v; c++; }
    out.push(Math.sqrt(acc / Math.max(1, c)));
  }
  return out;
}

async function transcribe(file) {
  const cacheFile = file.replace(/\.mp3$/, '.txt');
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf8');
  return withRetry(`识别 ${path.basename(file)}`, async () => {
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('language', 'zh');
    form.append('prompt', '以下是一段简体中文普通话。');
    form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
    const res = await fetch(`${BASE}/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    const j = await res.json();
    if (!res.ok || typeof j.text !== 'string') throw new Error(JSON.stringify(j).slice(0, 200));
    fs.writeFileSync(cacheFile, j.text);
    return j.text;
  });
}
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function similarity(a, b) {
  const x = [...norm(a)], y = [...norm(b)];
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return x.length ? dp[x.length][y.length] / x.length : 1;
}

async function main() {
  const lines = TL.lines.map((l) => {
    const c = TL.cast[l.who];
    if (!c) throw new Error(`${l.id} 的 who=${l.who} 不在 TL.cast 里`);
    return { ...l, voice: l.voice || c.voice, speed: l.speed || c.speed || 1 };
  });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. 合成（并发 4 路，已有缓存的跳过）
  let next = 0;
  const worker = async () => {
    while (next < lines.length) {
      const l = lines[next++];
      const hash = crypto.createHash('sha1').update([MODEL, l.voice, l.speed, l.text].join('|')).digest('hex').slice(0, 8);
      l.file = path.join(OUT, `${l.id}-${hash}.mp3`);
      if (!fs.existsSync(l.file)) { await synth(l, l.file); l.fresh = true; }
      l.dur = await duration(l.file);
      l.env = await envelope(l.file);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // 2. 排时间：首句在 lead 秒开口，之后每句接在上一句后面（换人默认 0.28 秒，同一人 0.18 秒，gap 另加）
  let t = TL.lead || 1.5;
  lines.forEach((l, i) => {
    if (i) t += (l.who === lines[i - 1].who ? 0.18 : 0.28) + (l.gap || 0);
    l.at = +t.toFixed(3);
    t += l.dur;
  });
  const end = +t.toFixed(3);
  const peak = Math.max(...lines.flatMap((l) => l.env));
  console.log('句子  谁    开始    时长  文本');
  lines.forEach((l) => console.log(`${l.id.padEnd(5)} ${TL.cast[l.who].name.padEnd(4)} ${l.at.toFixed(2).padStart(6)} ${l.dur.toFixed(2).padStart(5)}  ${l.fresh ? '[新] ' : ''}${l.text}`));
  console.log(`对白结束于 ${end.toFixed(2)}s，全片 ${(end + (TL.tail || 3)).toFixed(2)}s`);

  // 3. 回听校对（可选）。上游限流时只跳过该句，不中断
  if (CHECK) {
    console.log('\n回听校对（whisper-1）：');
    for (const l of lines) {
      let heard;
      try { heard = await transcribe(l.file); } catch (e) { console.log(`未校对 ${l.id}（${e.message.slice(0, 60)}）`); continue; }
      const s = similarity(l.text, heard);
      console.log(`${s >= 0.85 ? '通过' : '可疑'} ${l.id} ${(s * 100).toFixed(0)}%  听到：${heard}`);
    }
    console.log('提示：识别会把阿拉伯数字、同音词写成别的样子，「可疑」先人工听一遍再决定改不改。');
  }

  // 4. 拼成一条人声轨
  const total = end + (TL.tail || 3);
  const args = ['-y', '-loglevel', 'error'];
  lines.forEach((l) => args.push('-i', l.file));
  const chains = lines.map((l, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.at * 1000)}:all=1[v${i}]`);
  const mix = `${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)}[out]`;
  args.push('-filter_complex', `${chains.join(';')};${mix}`, '-map', '[out]', '-ar', '48000', '-ac', '2', path.join(ROOT, 'out', 'voice.wav'));
  await run('ffmpeg', args);

  // 5. 写 voice.js：包络按全片峰值归一到 0–100 的整数，省体积
  const data = {
    end, envFps: ENV_FPS,
    lines: lines.map(({ id, who, at, dur, text, env }) => ({ id, who, at, dur, text, env: env.map((v) => Math.round((v / peak) * 100)) })),
  };
  fs.writeFileSync(path.join(ROOT, 'voice.js'), `// 由 tts.js 生成，勿手改\nvar VOICE = ${JSON.stringify(data)};\nif (typeof module !== 'undefined') module.exports = VOICE;\n`);
  console.log(`\n人声轨 out/voice.wav，时间与包络 voice.js（${lines.length} 句）`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
