// 从 voice.js 的句子时间轴生成 srt 字幕文件。
//   node srt.js 输出路径 [前导偏移秒]       例如：node srt.js out/motu-zine.srt
// 若未给输出路径，打印到标准输出。
const fs = require('fs');
const path = require('path');
const VOICE = require('./voice.js');

const out = process.argv[2];
const shift = +(process.argv[3] || 0);

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
function ts(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(ss)},${String(ms).padStart(3, '0')}`;
}

const lines = (VOICE && VOICE.lines ? VOICE.lines : []).slice().sort((a, b) => a.at - b.at);
if (!lines.length) throw new Error('voice.js 里没有句子，先跑 node tts.js');

const body = lines
  .map((l, i) => `${i + 1}\n${ts(l.at + shift)} --> ${ts(l.at + l.dur + shift)}\n${l.text}\n`)
  .join('\n');

if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, body, 'utf8');
  console.log(`${out}  ${lines.length} 条字幕`);
} else {
  process.stdout.write(body);
}
