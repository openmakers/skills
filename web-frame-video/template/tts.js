// 配音：按 timeline.js 的 TL.voice 逐句合成，生成 out/voice.wav（与画面同一条时间轴）和 voice.js（字幕与时长）。
//   node tts.js           合成缺失的句子（按文本 + 音色 + 语速做缓存，改哪句只重合成哪句）
//   node tts.js --check   合成后再用语音识别回听每一句，和原文比对，错读、漏读会被标出来
// 模型：MiniMax Speech 2.8 HD，经 OpenAI 兼容接口 /v1/audio/speech 调用，地址读 TTS_BASE_URL，key 读 TTS_API_KEY。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const TL = require('./timeline.js');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out', 'voice');
const BASE = (process.env.TTS_BASE_URL || '').replace(/\/+$/, '');
const CHECK = process.argv.includes('--check');

function apiKey() {
  if (!BASE) throw new Error('找不到配音接口地址：设置环境变量 TTS_BASE_URL（提供 speech-2.8-hd 的 OpenAI 兼容服务）');
  if (!process.env.TTS_API_KEY) throw new Error('找不到配音 key：设置环境变量 TTS_API_KEY');
  return process.env.TTS_API_KEY;
}
const KEY = apiKey();

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(`${cmd} 失败：${stderr || err.message}`)) : resolve(stdout)));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 远端调用统一 3 次退避重试（1s / 3s / 6s）
async function withRetry(label, fn) {
  const waits = [1000, 3000, 6000];
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= waits.length) throw new Error(`${label}：${e.message}`);
      console.warn(`  ${label} 第 ${i + 1} 次失败，${waits[i] / 1000}s 后重试：${e.message}`);
      await sleep(waits[i]);
    }
  }
}

async function synth(line, cfg, file) {
  await withRetry(`合成 ${line.id}`, async () => {
    const res = await fetch(`${BASE}/v1/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, input: line.text, voice: line.voice || cfg.voice, speed: line.speed || cfg.speed }),
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

async function transcribe(file) {
  return withRetry(`识别 ${path.basename(file)}`, async () => {
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('language', 'zh');
    form.append('prompt', '以下是一段简体中文普通话。'); // 不加会输出繁体，比对全部误报
    form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
    const res = await fetch(`${BASE}/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form });
    const j = await res.json();
    if (!res.ok || typeof j.text !== 'string') throw new Error(JSON.stringify(j).slice(0, 200));
    return j.text;
  });
}
// 识别结果里的阿拉伯数字转回中文读法（30 → 三十，300 → 三百），再做字级比对
const DIG = '零一二三四五六七八九';
function cnNum(n) {
  if (n === 0) return '零';
  const units = ['', '十', '百', '千'];
  const four = (x) => {
    let out = '', zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(x / 10 ** i) % 10;
      if (d === 0) { zero = out !== ''; continue; }
      if (zero) { out += '零'; zero = false; }
      out += DIG[d] + units[i];
    }
    return out;
  };
  const hi = Math.floor(n / 10000), lo = n % 10000;
  let s = (hi ? four(hi) + '万' : '') + (lo ? (hi && lo < 1000 ? '零' : '') + four(lo) : '');
  return s.replace(/^一十/, '十');
}
// 字级相似度（最长公共子序列 / 原文长度），忽略标点与空格；英文统一小写
const norm = (s) => s.toLowerCase().replace(/\d+/g, (d) => (d.length <= 8 ? cnNum(+d) : d)).replace(/[^\p{L}\p{N}]/gu, '');
function similarity(a, b) {
  const x = [...norm(a)], y = [...norm(b)];
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return x.length ? dp[x.length][y.length] / x.length : 1;
}

async function main() {
  const cfg = { model: 'speech-2.8-hd', voice: 'presenter_female', speed: 1, gain: 1, ...(TL.voice || {}) };
  const lines = (cfg.lines || []).filter((l) => l.text);
  if (!lines.length) throw new Error('timeline.js 里没有 TL.voice.lines');
  fs.mkdirSync(OUT, { recursive: true });

  // 1. 合成（并发全开，已有缓存的跳过）
  await Promise.all(lines.map(async (l) => {
    const hash = crypto.createHash('sha1').update([cfg.model, l.voice || cfg.voice, l.speed || cfg.speed, l.text].join('|')).digest('hex').slice(0, 8);
    l.file = path.join(OUT, `${l.id}-${hash}.mp3`);
    if (!fs.existsSync(l.file)) { await synth(l, cfg, l.file); l.fresh = true; }
    l.dur = await duration(l.file);
  }));

  // 2. 时间校验：句子不能互相压住，也不能超出片尾
  const sorted = [...lines].sort((a, b) => a.at - b.at);
  const problems = [];
  sorted.forEach((l, i) => {
    const end = l.at + l.dur, next = sorted[i + 1];
    if (next && end > next.at - 0.15) problems.push(`${l.id} 结束于 ${end.toFixed(2)}s，压到了 ${next.id}（${next.at}s 开始），至少要把 ${next.id} 挪到 ${(end + 0.2).toFixed(2)}s 或缩短这句`);
    if (end > TL.duration - 0.3) problems.push(`${l.id} 结束于 ${end.toFixed(2)}s，超出片长 ${TL.duration}s`);
  });
  console.log('句子      开始    时长    结束    文本');
  sorted.forEach((l) => console.log(`${l.id.padEnd(8)} ${l.at.toFixed(2).padStart(6)} ${l.dur.toFixed(2).padStart(6)} ${(l.at + l.dur).toFixed(2).padStart(7)}  ${l.fresh ? '[新] ' : ''}${l.text}`));

  // 3. 回听校对（可选）
  if (CHECK) {
    console.log('\n回听校对（whisper-1）：');
    for (const l of sorted) {
      const heard = await transcribe(l.file);
      const s = similarity(l.text, heard);
      console.log(`${s >= 0.85 ? '通过' : '可疑'} ${l.id} ${(s * 100).toFixed(0)}%  听到：${heard}`);
    }
    console.log('提示：识别模型会把生僻的产品名听成同音字，「可疑」的句子要人工听一遍再决定改不改。');
  }

  // 4. 按时间轴拼成一条人声轨 out/voice.wav（48kHz 立体声）
  const args = ['-y', '-loglevel', 'error'];
  sorted.forEach((l) => args.push('-i', l.file));
  const chains = sorted.map((l, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.at * 1000)}:all=1,volume=${l.gain || cfg.gain}[v${i}]`);
  const mix = `${sorted.map((_, i) => `[v${i}]`).join('')}amix=inputs=${sorted.length}:normalize=0:duration=longest,apad,atrim=0:${TL.duration}[out]`;
  args.push('-filter_complex', `${chains.join(';')};${mix}`, '-map', '[out]', '-ar', '48000', '-ac', '2', path.join(ROOT, 'out', 'voice.wav'));
  await run('ffmpeg', args);

  // 5. 字幕与时长给页面用
  const data = { model: cfg.model, voice: cfg.voice, lines: sorted.map(({ id, at, dur, text }) => ({ id, at, dur, text })) };
  fs.writeFileSync(path.join(ROOT, 'voice.js'), `// 由 tts.js 生成，勿手改\nvar VOICE = ${JSON.stringify(data, null, 2)};\nif (typeof module !== 'undefined') module.exports = VOICE;\n`);
  console.log(`\n人声轨 out/voice.wav，字幕数据 voice.js（${sorted.length} 句）`);
  if (problems.length) {
    console.error('\n时间冲突：\n  ' + problems.join('\n  '));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
