// 从 script.js 生成 timeline.js 与人声轨 out/voice.wav。画面节奏跟着配音走：
//   node plan.js          逐句合成配音（按文本 + 音色 + 语速缓存，改哪句只重合成哪句），用每句真实时长排出场次、元素出现时刻与字幕
//   node plan.js --dry    不调配音接口，按字数估算时长，先检查画面排版
//   node plan.js --check  合成后用语音识别回听这次新合成的句子，标出错读、漏读（--check-all 回听全部）
// 配音模型：MiniMax Speech 2.8 HD，经 OpenAI 兼容接口调用，地址读 TTS_BASE_URL，key 读 TTS_API_KEY。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const VOICE_DIR = path.join(OUT, 'voice');
const BASE = (process.env.TTS_BASE_URL || '').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry');
const CHECK_ALL = process.argv.includes('--check-all');
const CHECK = CHECK_ALL || process.argv.includes('--check');
const S = require('./script.js');

const FORMATS = { landscape: [1920, 1080], portrait: [1080, 1920] };
const [W, H] = FORMATS[S.format || 'landscape'] || (() => { throw new Error(`format 只能是 landscape 或 portrait，收到 ${S.format}`); })();
const PORTRAIT = H > W;
const VOICE = S.voice === false ? null : { model: 'speech-2.8-hd', voice: 'presenter_female', speed: 1.05, ...(S.voice || {}) };

// 节奏参数（秒）：场首留白、句间停顿、场尾留白
const LEAD = 0.55, FIRST_LEAD = 0.8, GAP = 0.3, TAIL = 0.75, LAST_TAIL = 2.2;
const MIN_DUR = { hook: 3, outro: 4, quote: 3.5 };
const SUB_MAX = PORTRAIT ? 15 : 22; // 一条字幕最多多少个汉字宽

// ---------- 每种场景有几个「出现单元」，缺字段直接报错 ----------
const need = (sc, i, keys) => keys.forEach((k) => { if (sc[k] === undefined) throw new Error(`第 ${i + 1} 场（${sc.type}）缺少字段 ${k}`); });
function unitCount(sc, i) {
  switch (sc.type) {
    case 'hook': need(sc, i, ['title']); return 1 + !!sc.sub;
    case 'term': need(sc, i, ['term']); return 1 + !!sc.def;
    case 'metaphor': need(sc, i, ['left', 'right']); return 2 + !!sc.caption;
    case 'compare': need(sc, i, ['left', 'right']); return 2;
    case 'layers': need(sc, i, ['rows']); return sc.rows.length;
    case 'steps': need(sc, i, ['steps']); return sc.steps.length;
    case 'list': need(sc, i, ['items']); return sc.items.length;
    case 'chat': need(sc, i, ['messages']); return sc.messages.length;
    case 'terminal': need(sc, i, ['cmds']); return sc.cmds.length;
    case 'tools': need(sc, i, ['tools']); return sc.tools.length;
    case 'quote': need(sc, i, ['text']); return 1;
    case 'image': need(sc, i, ['src']); return 1 + !!sc.caption;
    case 'outro': need(sc, i, ['brand']); return 1 + !!sc.sub + !!sc.cta;
    default: throw new Error(`第 ${i + 1} 场：未知场景类型 ${sc.type}`);
  }
}

// ---------- 文本 ----------
const strip = (s) => s.replace(/\||\*\*|==/g, '');
// 朗读时长的权重：汉字 1，英文字母 0.4，数字 0.8，标点算停顿 0.5
const weight = (s) => [...s].reduce((w, c) => w + (/[㐀-鿿]/.test(c) ? 1 : /[A-Za-z]/.test(c) ? 0.4 : /\d/.test(c) ? 0.8 : /[，。！？；：、,!?;:]/.test(c) ? 0.5 : 0), 0);
// 显示宽度：汉字 1，其它 0.55
const width = (s) => [...s].reduce((w, c) => w + (/[　-鿿＀-￯]/.test(c) ? 1 : 0.55), 0);

// 把一句旁白切成若干条字幕：按标点切，再贪心合并到不超过 SUB_MAX
function subChunks(text) {
  const parts = text.match(/[^，。！？；：、,!?;:]+[，。！？；：、,!?;:]*/g) || [text];
  const out = [];
  parts.forEach((p) => {
    const last = out[out.length - 1];
    if (last !== undefined && width(strip(last + p)) <= SUB_MAX) out[out.length - 1] = last + p;
    else out.push(p);
  });
  return out;
}

function parseLine(raw, si, li) {
  const l = typeof raw === 'string' ? { text: raw } : { ...raw };
  if (!l.text) throw new Error(`第 ${si + 1} 场第 ${li + 1} 句没有 text`);
  const segs = l.text.split('|');
  const total = weight(strip(l.text)) || 1;
  let acc = 0;
  l.marks = segs.slice(0, -1).map((seg) => (acc += weight(strip(seg))) / total); // 每个 | 在句中的位置（比例）
  l.plain = strip(l.text);
  l.speech = strip(l.read || l.text);
  l.id = `s${String(si + 1).padStart(2, '0')}-${li + 1}`;
  return l;
}

// ---------- 配音接口 ----------
function apiKey() {
  if (!BASE) throw new Error('找不到配音接口地址：设置环境变量 TTS_BASE_URL（提供 speech-2.8-hd 的 OpenAI 兼容服务）');
  if (!process.env.TTS_API_KEY) throw new Error('找不到配音 key：设置环境变量 TTS_API_KEY');
  return process.env.TTS_API_KEY;
}
const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(`${cmd} 失败：${stderr || err.message}`)) : resolve(stdout)));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 远端调用 3 次退避重试（1s / 3s / 6s）；上游限流或负载饱和时改成 15s 起步的长等待
async function withRetry(label, fn) {
  const waits = [1000, 3000, 6000], slow = [15000, 30000, 45000, 60000];
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const limited = /rate limit|RPM|429|饱和|负载/i.test(e.message);
      const w = (limited ? slow : waits)[i];
      if (w === undefined) throw new Error(`${label}：${e.message}`);
      console.warn(`  ${label} 第 ${i + 1} 次失败，${w / 1000}s 后重试：${limited ? '上游限流（每分钟请求数）' : e.message}`);
      await sleep(w);
    }
  }
}
// 固定并发的工作池：做完一个立刻领下一个
async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}
async function synth(key, l, file) {
  await withRetry(`合成 ${l.id}`, async () => {
    const res = await fetch(`${BASE}/v1/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: VOICE.model, input: l.speech, voice: l.voice || VOICE.voice, speed: l.speed || VOICE.speed }),
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
async function transcribe(key, file) {
  return withRetry(`识别 ${path.basename(file)}`, async () => {
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('language', 'zh');
    form.append('prompt', '以下是一段简体中文普通话。'); // 不加会输出繁体，比对全部误报
    form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
    const res = await fetch(`${BASE}/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    const j = await res.json();
    if (!res.ok || typeof j.text !== 'string') throw new Error(JSON.stringify(j).slice(0, 200));
    return j.text;
  });
}
// 识别结果里的阿拉伯数字转回中文读法，再做字级比对
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
  return ((hi ? four(hi) + '万' : '') + (lo ? (hi && lo < 1000 ? '零' : '') + four(lo) : '')).replace(/^一十/, '十');
}
const norm = (s) => s.toLowerCase().replace(/\d+/g, (d) => (d.length <= 8 ? cnNum(+d) : d)).replace(/[^\p{L}\p{N}]/gu, '');
function similarity(a, b) {
  const x = [...norm(a)], y = [...norm(b)];
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return x.length ? dp[x.length][y.length] / x.length : 1;
}

const r2 = (x) => Math.round(x * 100) / 100;

async function main() {
  const scenes = S.scenes.map((sc, si) => ({ ...sc, units: unitCount(sc, si), lines: (sc.say || []).map((l, li) => parseLine(l, si, li)) }));
  const lines = scenes.flatMap((sc) => sc.lines);
  fs.mkdirSync(VOICE_DIR, { recursive: true });

  // 1. 每句时长：真合成，或按字数估
  if (VOICE && !DRY) {
    const key = apiKey();
    let fresh = 0;
    await pool(lines, 4, async (l) => { // 上游每分钟限流，并发 4 足够
      const hash = crypto.createHash('sha1').update([VOICE.model, l.voice || VOICE.voice, l.speed || VOICE.speed, l.speech].join('|')).digest('hex').slice(0, 8);
      l.file = path.join(VOICE_DIR, `${l.id}-${hash}.mp3`);
      if (!fs.existsSync(l.file)) { await synth(key, l, l.file); l.fresh = true; fresh++; }
      l.dur = await duration(l.file);
    });
    console.log(`配音 ${lines.length} 句，新合成 ${fresh} 句（${VOICE.model} / ${VOICE.voice} / 语速 ${VOICE.speed}）`);
  } else {
    lines.forEach((l) => { l.dur = r2(weight(l.speech) / 4.6 + 0.2); });
    console.log(DRY ? '--dry：按字数估算时长（约 4.6 字/秒），不生成人声轨' : '未启用配音：按字数估算字幕时长');
  }

  // 2. 排时间：每句接着上一句，场次跟着句子伸缩
  const warns = [];
  const events = { whoosh: [], pop: [], hit: [], keys: [] };
  let t = 0;
  const out = scenes.map((sc, si) => {
    const last = si === scenes.length - 1;
    const start = t;
    let cur = start + (si === 0 ? FIRST_LEAD : LEAD) + (sc.lead || 0);
    const beats = [];
    sc.lines.forEach((l) => {
      l.at = r2(cur);
      if (l.beat !== false) beats.push(cur);
      l.marks.forEach((f) => beats.push(cur + f * l.dur));
      cur += l.dur + GAP + (l.pause || 0);
    });
    const spokenEnd = sc.lines.length ? cur - GAP : start + 0.6;
    let end = Math.max(spokenEnd + (last ? LAST_TAIL : TAIL) + (sc.hold || 0), start + (sc.dur || MIN_DUR[sc.type] || 3));

    // 单元出现时刻：先用句首和 |，不够的在剩余时间里均匀补齐，多出来的忽略
    if (!beats.length) beats.push(start + 0.5);
    const b = beats.slice(0, sc.units);
    if (b.length < sc.units) {
      const from = b[b.length - 1], to = Math.max(from + 0.45 * (sc.units - b.length), spokenEnd - 0.3);
      const rest = sc.units - b.length;
      for (let j = 1; j <= rest; j++) b.push(from + (to - from) * j / rest);
    }
    const scene = { ...sc, id: `s${String(si + 1).padStart(2, '0')}`, start: r2(start), beats: b.map(r2) };
    delete scene.say; delete scene.lines; delete scene.units;

    // 对话：AI 回复先显示「正在输入」，再逐字流出，在下一个单元出现前写完
    if (sc.type === 'chat') {
      scene.streams = sc.messages.map((m, i) => {
        if (m.role === 'user') return null;
        const st = b[i] + 0.45, until = (b[i + 1] ?? end - 0.7) - 0.2;
        const len = [...strip(m.text)].length;
        const cps = Math.max(12, len / Math.max(0.6, until - st));
        if (cps > 40) warns.push(`${scene.id} 第 ${i + 1} 条 AI 回复太长（需要每秒 ${cps.toFixed(0)} 字才打得完），缩短回复或给这场多写一句旁白`);
        end = Math.max(end, st + len / cps + 0.8);
        return { i, start: r2(st), cps: r2(cps) };
      });
    }
    // 终端：命令逐字敲出，敲完 0.25 秒后出结果
    if (sc.type === 'terminal') {
      scene.typing = sc.cmds.map((c, i) => {
        const st = b[i] + 0.15, cps = 18;
        const outAt = st + [...c.cmd].length / cps + 0.25;
        if (b[i + 1] !== undefined && outAt > b[i + 1]) warns.push(`${scene.id} 第 ${i + 1} 条命令还没敲完，下一条就出现了，命令写短一点或把下一句旁白往后放`);
        end = Math.max(end, outAt + 1);
        events.keys.push({ start: r2(st), n: [...c.cmd].length, cps });
        return { start: r2(st), cps, outAt: r2(outAt) };
      });
    }

    // 字幕：每句切成几条，按字数比例分时间
    scene.subs = sc.lines.flatMap((l) => {
      const chunks = subChunks(l.text);
      const total = chunks.reduce((w, c) => w + weight(strip(c)), 0) || 1;
      let acc = 0;
      return chunks.map((c) => {
        const text = strip(c).replace(/[，。、；：,;:]+$/, '');
        if (width(text) > SUB_MAX + 2) warns.push(`${l.id} 字幕「${text}」过长，句中加个逗号好断行`);
        const at = l.at + (acc / total) * l.dur;
        acc += weight(strip(c));
        return { text, at: r2(at), dur: r2((weight(strip(c)) / total) * l.dur) };
      });
    });

    if (si > 0) events.whoosh.push(scene.start);
    if (sc.type !== 'terminal') b.forEach((x, i) => ((sc.type === 'hook' && si === 0 && i === 0) || (sc.type === 'outro' && i === 0) ? events.hit : events.pop).push(r2(x)));
    scene.end = r2(end);
    t = end;
    return scene;
  });

  const TL = {
    title: S.title, series: S.series || '', theme: S.theme || 'paper', subtitles: S.subtitles !== false,
    width: W, height: H, fps: S.fps || 60, duration: r2(t), output: S.output || 'ai-concept.mp4',
    voiced: !!(VOICE && !DRY), events, scenes: out,
  };
  fs.writeFileSync(path.join(ROOT, 'timeline.js'), `// 由 plan.js 从 script.js 生成，勿手改\nvar TL = ${JSON.stringify(TL, null, 1)};\nif (typeof module !== 'undefined') module.exports = TL;\n`);

  // 3. 打印节奏表
  console.log('\n场次  类型       开始    结束   时长  旁白');
  out.forEach((sc, i) => console.log(`${sc.id}  ${sc.type.padEnd(9)} ${sc.start.toFixed(2).padStart(6)} ${sc.end.toFixed(2).padStart(6)} ${(sc.end - sc.start).toFixed(1).padStart(5)}  ${scenes[i].lines.map((l) => l.plain).join(' / ').slice(0, 60)}`));
  console.log(`\n总时长 ${TL.duration}s，${TL.width}×${TL.height}，timeline.js 已生成`);

  // 4. 人声轨：按时间轴拼成一条 48kHz 立体声 out/voice.wav
  const voiceWav = path.join(OUT, 'voice.wav');
  if (VOICE && !DRY) {
    const args = ['-y', '-loglevel', 'error'];
    lines.forEach((l) => args.push('-i', l.file));
    const chains = lines.map((l, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.at * 1000)}:all=1,volume=${l.gain || 1}[v${i}]`);
    const mix = `${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:duration=longest,apad,atrim=0:${TL.duration}[out]`;
    args.push('-filter_complex', `${chains.join(';')};${mix}`, '-map', '[out]', '-ar', '48000', '-ac', '2', voiceWav);
    await run('ffmpeg', args);
    console.log('人声轨 out/voice.wav');
  } else if (fs.existsSync(voiceWav)) {
    fs.unlinkSync(voiceWav); // 旧人声轨和新时间轴对不上，删掉（它是生成物）
  }

  // 5. 回听校对
  if (CHECK && VOICE && !DRY) {
    const todo = CHECK_ALL ? lines : lines.filter((l) => l.fresh);
    console.log(`\n回听校对（whisper-1，${todo.length} 句${CHECK_ALL ? '' : '新合成的'}）：`);
    const key = apiKey();
    const res = [];
    // 识别通道容易负载饱和：并发 2，单句失败只记下来，不影响其它句
    await pool(todo, 2, async (l, i) => {
      try { const heard = await transcribe(key, l.file); res[i] = { l, heard, s: similarity(l.speech, heard) }; } catch (e) { res[i] = { l, err: e.message }; }
    });
    res.forEach(({ l, heard, s, err }) => console.log(err ? `未识别 ${l.id}  ${err.slice(0, 80)}` : `${s >= 0.85 ? '通过' : '可疑'} ${l.id} ${(s * 100).toFixed(0)}%  听到：${heard}`));
    console.log('提示：识别模型会把英文术语和产品名听成同音字，「可疑」的句子要人工听一遍再决定改不改。');
  }

  if (warns.length) console.warn('\n注意：\n  ' + warns.join('\n  '));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
