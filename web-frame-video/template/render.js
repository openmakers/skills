// 逐帧截图 → ffmpeg 编码。
//   node render.js                 全片：6 个浏览器并行截不同片段，各自编码后拼接，再合入 out/music.wav 与 out/voice.wav
//   node render.js --still 2.5,7.8 只截指定时刻的静帧到 out/still-*.png，用于检查画面
//   node render.js --mix           不重拍画面，只把新的音乐 / 配音重新混进已有成片（改配音后秒出）
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '?render=1';
// playwright 版本常比本机缓存的浏览器新，自带路径不存在时退回缓存里最新的 headless shell，免得再下载一遍
function findChrome() {
  const own = chromium.executablePath();
  if (fs.existsSync(own)) return own;
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of dirs) {
    const bin = path.join(cache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error('找不到 Chromium：先运行 npx playwright install chromium-headless-shell');
}
const CHROME = findChrome();
const WORKERS = 6;
const SCALE = 2; // 2 倍分辨率截图，再缩回成片尺寸，文字更清晰

fs.mkdirSync(OUT, { recursive: true });

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))));
    if (opts.onSpawn) opts.onSpawn(p);
  });
}

async function openPage(browser, scale) {
  const page = await browser.newPage({ viewport: { width: TL.width, height: TL.height }, deviceScaleFactor: scale });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(URL);
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  return page;
}

async function stills(times) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await openPage(browser, 1);
  for (const t of times) {
    await page.evaluate((x) => window.seek(x), t);
    const file = path.join(OUT, `still-${t.toFixed(2)}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
}

async function renderSegment(browser, w, from, to) {
  const page = await openPage(browser, SCALE);
  const file = path.join(OUT, `seg${w}.mp4`);
  let ff;
  const done = run('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(TL.fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${TL.width}:${TL.height}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
    '-pix_fmt', 'yuv420p', '-r', String(TL.fps), file,
  ], { onSpawn: (p) => { ff = p; } });
  for (let f = from; f < to; f++) {
    await page.evaluate((x) => window.seek(x), f / TL.fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - from) % 60 === 0) console.log(`worker ${w}: ${f - from}/${to - from}`);
  }
  ff.stdin.end();
  await done;
  await page.close();
  return file;
}

async function full() {
  const t0 = Date.now();
  const total = Math.round(TL.duration * TL.fps);
  const per = Math.ceil(total / WORKERS);
  const browsers = await Promise.all(Array.from({ length: WORKERS }, () => chromium.launch({ executablePath: CHROME })));
  const segs = await Promise.all(browsers.map((b, w) => renderSegment(b, w, w * per, Math.min(total, (w + 1) * per))));
  await Promise.all(browsers.map((b) => b.close()));
  console.log(`截图完成 ${total} 帧，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);

  const list = path.join(OUT, 'segs.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
  const final = path.join(OUT, TL.output);
  await mux(['-f', 'concat', '-safe', '0', '-i', list], final);
  segs.forEach((s) => fs.unlinkSync(s));
  console.log(`完成：${final}，总用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
}

// 合成音轨：有配音时人声先统一到 -16 LUFS，音乐整体降到六成，并在人声处再用侧链压缩压低约 10 dB，最后整体统一到 -14 LUFS
async function mux(videoIn, final) {
  const music = path.join(OUT, 'music.wav'), voice = path.join(OUT, 'voice.wav');
  const hasM = fs.existsSync(music), hasV = fs.existsSync(voice);
  const args = ['-y', '-loglevel', 'error', ...videoIn];
  if (hasM) args.push('-i', music);
  if (hasV) args.push('-i', voice);
  if (hasM && hasV) {
    args.push('-filter_complex', '[2:a]loudnorm=I=-16:TP=-2:LRA=7,asplit=2[key][vo];[1:a]volume=0.6[m];[m][key]sidechaincompress=threshold=0.012:ratio=12:attack=20:release=400[bg];[bg][vo]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]', '-map', '0:v', '-map', '[a]');
  } else if (hasM || hasV) {
    args.push('-map', '0:v', '-map', '1:a');
  } else {
    args.push('-map', '0:v');
  }
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final);
  await run('ffmpeg', args);
}

async function remix() {
  const final = path.join(OUT, TL.output);
  if (!fs.existsSync(final)) throw new Error(`还没有成片 ${final}，先跑一次 node render.js`);
  const tmp = final.replace(/\.mp4$/, '.remix.mp4');
  await mux(['-i', final], tmp);
  fs.renameSync(tmp, final);
  console.log(`已重新混音：${final}`);
}

const i = process.argv.indexOf('--still');
const job = i > -1 ? stills(process.argv[i + 1].split(',').map(Number)) : process.argv.includes('--mix') ? remix() : full();
job.catch((e) => {
  console.error(e);
  process.exit(1);
});
