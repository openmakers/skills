// 逐帧截图 → ffmpeg 编码。
//   node render.js                  全片：6 个浏览器并行截不同片段，各自编码后拼接，再合入 out/mix.wav
//   node render.js --still auto     每场截一张「元素全部出齐」的样图，拼成 out/contact.png，并检查有没有内容溢出画面
//   node render.js --still 2.5,7.8  只截指定时刻
//   node render.js --mix            不重拍画面，只把新的 out/mix.wav 换进已有成片（改配音、改音乐后秒出）
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

// 当前画面里超出内容区的元素（内容区 = .body；画面整体 = 舞台）
function findOverflow() {
  const sc = [...document.querySelectorAll('.scene')].find((e) => e.style.display !== 'none');
  if (!sc) return [];
  const body = sc.querySelector('.body').getBoundingClientRect();
  const probs = [];
  sc.querySelectorAll('.body [data-u], .body > *').forEach((el) => {
    if (el.closest('.pic') && el.tagName === 'IMG') return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const over = [r.top < body.top - 2 && `上 ${Math.round(body.top - r.top)}px`, r.bottom > body.bottom + 2 && `下 ${Math.round(r.bottom - body.bottom)}px`, r.left < body.left - 2 && `左 ${Math.round(body.left - r.left)}px`, r.right > body.right + 2 && `右 ${Math.round(r.right - body.right)}px`].filter(Boolean);
    if (over.length) probs.push(`<${el.tagName.toLowerCase()} class="${el.className}"> 超出 ${over.join('、')}：${el.textContent.trim().slice(0, 16)}`);
  });
  return probs;
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

// 每场在淡出前 0.35 秒截一张（此时元素已全部出齐），拼成一张总览图
async function contact() {
  const dir = path.join(OUT, 'stills');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await openPage(browser, 1);
  let bad = 0;
  for (const [i, sc] of TL.scenes.entries()) {
    const t = Math.max(sc.start + 0.4, sc.end - 0.35);
    await page.evaluate((x) => window.seek(x), t);
    await page.screenshot({ path: path.join(dir, `scene-${String(i + 1).padStart(2, '0')}.png`) });
    const probs = await page.evaluate(findOverflow);
    if (probs.length) { bad++; console.warn(`${sc.id} ${sc.type} @${t.toFixed(2)}s 溢出：\n    ${probs.join('\n    ')}`); }
  }
  await browser.close();
  const n = TL.scenes.length, cols = TL.width > TL.height ? 3 : 5, rows = Math.ceil(n / cols);
  const w = TL.width > TL.height ? 640 : 324;
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'scene-%02d.png'),
    '-vf', `scale=${w}:-2:flags=lanczos,tile=${cols}x${rows}:padding=12:margin=12:color=0x2a2a2a`, '-frames:v', '1', path.join(OUT, 'contact.png')]);
  console.log(`${n} 场样图在 out/stills/，总览 out/contact.png${bad ? `；${bad} 场有溢出，先修再出片` : '；没有发现溢出'}`);
  if (bad) process.exitCode = 1;
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
    if ((f - from) % 300 === 0) console.log(`worker ${w}: ${f - from}/${to - from}`);
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

async function mux(videoIn, final) {
  const mix = path.join(OUT, 'mix.wav');
  const args = ['-y', '-loglevel', 'error', ...videoIn];
  if (fs.existsSync(mix)) args.push('-i', mix, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest');
  else { console.warn('没有 out/mix.wav，成片无声（先跑 node audio.js）'); args.push('-map', '0:v'); }
  args.push('-c:v', 'copy', '-movflags', '+faststart', final);
  await run('ffmpeg', args);
}

async function remix() {
  const final = path.join(OUT, TL.output);
  if (!fs.existsSync(final)) throw new Error(`还没有成片 ${final}，先跑一次 node render.js`);
  const tmp = final.replace(/\.mp4$/, '.remix.mp4');
  await mux(['-i', final], tmp);
  fs.renameSync(tmp, final);
  console.log(`已换上新音轨：${final}`);
}

const i = process.argv.indexOf('--still');
const job = i > -1 ? (process.argv[i + 1] === 'auto' ? contact() : stills(process.argv[i + 1].split(',').map(Number)))
  : process.argv.includes('--mix') ? remix() : full();
job.catch((e) => {
  console.error(e);
  process.exit(1);
});
