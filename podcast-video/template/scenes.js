// 画面只由时间 t 决定：seek(t) 把每个元素摆到这一刻该在的位置。
// 音频海报式播客：模糊封面做背景，封面卡缓慢推近，声波按真实人声包络跳动，说话人高亮，字幕逐字点亮，分章贴纸与要点卡随台词弹出。
// 所有时间都来自 voice.js（tts.js 按真实配音时长排出），timeline.js 只写内容。
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    in: (x) => x * x * x,
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const P = (t, a, b, e = E.out) => (b <= a ? (t >= a ? 1 : 0) : e(clamp((t - a) / (b - a))));
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (typeof VOICE === 'undefined' || !VOICE) throw new Error('还没有 voice.js：先运行 node tts.js');
  const LINES = VOICE.lines;
  const byId = Object.fromEntries(LINES.map((l) => [l.id, l]));
  const lineAt = (id) => { const l = byId[id]; if (!l) throw new Error('timeline.js 引用了不存在的台词 ' + id); return l; };
  const D = TL.duration;

  // ---------- 静态内容 ----------
  $('showName').textContent = TL.show.name;
  $('ep').textContent = TL.show.episode;
  $('title').textContent = TL.book.title;
  $('author').textContent = [TL.book.author, TL.book.note].filter(Boolean).join(' · ');
  [['hostA', 'a'], ['hostB', 'b']].forEach(([id, who]) => {
    const c = TL.cast[who], el = $(id);
    el.querySelector('.av').textContent = c.name.slice(-1);
    el.querySelector('.av').style.background = c.color;
    el.querySelector('.nm').textContent = c.name;
    el.querySelector('.rl').textContent = c.role;
  });

  // 分章：起点 = 该章第一句开口前 0.4 秒
  const CH = TL.chapters.map((c, i) => ({ ...c, no: String(i).padStart(2, '0'), t: Math.max(0, lineAt(c.from).at - 0.4) }));
  CH.forEach((c, i) => { c.end = i < CH.length - 1 ? CH[i + 1].t : D; });
  const prog = $('prog');
  CH.slice(1).forEach((c) => { const k = document.createElement('div'); k.className = 'tick'; k.style.left = `${(c.t / D) * 840 - 2}px`; prog.appendChild(k); });

  // 要点卡：在指定台词开口时弹出，留到下一张卡或本章结束
  const KEYS = [];
  CH.forEach((c) => (c.keys || []).forEach((k) => KEYS.push({ ...k, t: lineAt(k.at).at + 0.15, chapEnd: c.end })));
  KEYS.forEach((k, i) => {
    k.end = Math.min(k.chapEnd - 0.2, i < KEYS.length - 1 ? KEYS[i + 1].t - 0.05 : D);
    const el = document.createElement('div');
    el.className = 'abs key';
    el.innerHTML = k.text;
    $('keys').appendChild(el);
    k.el = el;
  });

  // 字幕分页：按标点切成小段，每页最多 30 字（两行）；逐字点亮的时间按字数加权，标点处多停一会儿
  const PUNCT = /[，。、；：？！,.;:?!《》「」（）]/;
  LINES.forEach((l) => {
    const chars = [...l.text];
    const w = chars.map((ch) => (PUNCT.test(ch) ? 2.2 : 1));
    const total = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    l.cum = w.map((x) => (acc += x) / total);
    const pages = [];
    let cur = [], seg = [];
    chars.forEach((ch, i) => {
      seg.push(i);
      if (/[，。；？！：]/.test(ch) || i === chars.length - 1) {
        if (cur.length && cur.length + seg.length > 30) { pages.push(cur); cur = []; }
        cur = cur.concat(seg);
        seg = [];
      }
    });
    if (cur.length) pages.push(cur);
    l.pages = pages.map((idx) => ({ idx, t0: l.at + (idx[0] ? l.cum[idx[0] - 1] : 0) * l.dur }));
    l.chars = chars;
  });

  // ---------- 背景：封面预先模糊成一张小图，之后每帧只做位移，不再重算模糊 ----------
  const bg = $('bg');
  const coverImg = $('coverImg');
  coverImg.src = TL.cover;

  // ---------- 声波 ----------
  const wave = $('wave'), wctx = wave.getContext('2d');
  const BARS = 42, BW = 18, GAP = (1680 - BARS * BW) / (BARS - 1);
  const shape = Array.from({ length: BARS }, (_, i) => { const x = i / (BARS - 1); return 0.35 + 0.65 * Math.sin(Math.PI * x) ** 0.8; });
  function envAt(l, t) {
    const f = (t - l.at) * VOICE.envFps;
    const i = Math.floor(f), a = l.env[i] || 0, b = l.env[i + 1] || 0;
    return (a + (b - a) * (f - i)) / 100;
  }
  const activeLine = (t) => LINES.find((l) => t >= l.at && t < l.at + l.dur);
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function renderWave(t) {
    wctx.clearRect(0, 0, 1680, 300);
    const l = activeLine(t);
    const lv = l ? Math.pow(envAt(l, t), 0.6) : 0;
    const col = l ? TL.cast[l.who].color : '#ffffff';
    for (let i = 0; i < BARS; i++) {
      // 每根柱子的起伏 = 当前音量 × 中间高两边低的轮廓 × 随时间变化的确定性抖动
      const jit = 0.55 + 0.45 * Math.abs(Math.sin(t * (7.3 + (i % 7) * 1.9) + i * 1.7) * Math.cos(t * 3.1 + i * 0.6));
      const h = Math.max(16, lv * shape[i] * jit * 296);
      const x = i * (BW + GAP), y = 150 - h / 2;
      wctx.fillStyle = l ? (i % 2 ? '#ffffff' : hexA(col, 1)) : 'rgba(255,255,255,.35)';
      wctx.beginPath();
      wctx.roundRect(x, y, BW, h, BW / 2);
      wctx.fill();
    }
  }

  // ---------- 每帧 ----------
  const cap = $('cap'), capWho = cap.querySelector('.who'), capTx = cap.querySelector('.tx');
  let capKey = '';
  function renderCaption(t) {
    // 当前句；句间空隙里继续显示上一句，避免字幕闪烁
    let l = null;
    for (const x of LINES) { if (t >= x.at - 0.1) l = x; else break; }
    if (!l || t > l.at + l.dur + 1.2) { cap.style.opacity = 0; return; }
    const page = [...l.pages].reverse().find((p) => t >= p.t0 - 0.05) || l.pages[0];
    const key = l.id + ':' + l.pages.indexOf(page);
    if (key !== capKey) {
      capKey = key;
      const c = TL.cast[l.who];
      capWho.textContent = c.name;
      capWho.style.color = c.color;
      capTx.innerHTML = page.idx.map((i) => `<span>${l.chars[i].replace(/[<>&]/g, '')}</span>`).join('');
    }
    const prog = clamp((t - l.at) / l.dur);
    capTx.querySelectorAll('span').forEach((s, j) => { const i = page.idx[j]; s.className = prog >= (i ? l.cum[i - 1] : 0) ? 'on' : ''; });
    cap.style.opacity = P(t, l.at - 0.1, l.at + 0.1);
  }

  function renderHosts(t) {
    const l = activeLine(t);
    [['hostA', 'a'], ['hostB', 'b']].forEach(([id, who]) => {
      const el = $(id), on = l && l.who === who;
      // 说话人高亮跟着声音淡入淡出：取最近一句的开口与收口
      const mine = LINES.filter((x) => x.who === who);
      let k = 0;
      mine.forEach((x) => { k = Math.max(k, P(t, x.at - 0.15, x.at + 0.1) * (1 - P(t, x.at + x.dur, x.at + x.dur + 0.3))); });
      el.style.opacity = 0.42 + 0.58 * k;
      el.style.transform = `scale(${1 + 0.05 * k})`;
      el.style.transformOrigin = who === 'a' ? '0 50%' : '100% 50%';
      const lv = on ? envAt(l, t) : 0;
      el.querySelector('.av').style.boxShadow = `0 0 0 ${4 + lv * 12}px ${hexA(TL.cast[who].color, 0.35 * k)}`;
    });
  }

  function renderChapter(t) {
    const c = [...CH].reverse().find((x) => t >= x.t) || CH[0];
    const el = $('chap');
    if (el.dataset.id !== c.id) {
      el.dataset.id = c.id;
      el.querySelector('.no').textContent = c.no;
      el.querySelector('.tt').textContent = c.title;
    }
    const p = P(t, c.t, c.t + 0.45, E.back), q = P(t, c.end - 0.25, c.end, E.in);
    el.style.opacity = clamp(p * 1.5) * (1 - q);
    el.style.transform = `translateX(${(1 - p) * -40}px)`;
  }

  function renderKeys(t) {
    KEYS.forEach((k) => {
      const p = P(t, k.t, k.t + 0.45, E.back), q = P(t, k.end - 0.25, k.end, E.in);
      const on = t >= k.t - 0.05 && t < k.end;
      k.el.style.display = on ? 'block' : 'none';
      if (!on) return;
      k.el.style.opacity = clamp(p * 1.6) * (1 - q);
      k.el.style.transform = `translateX(-50%) translateY(-100%) scale(${(0.6 + 0.4 * p) * (1 - 0.1 * q)})`;
    });
  }

  function seekAll(t) {
    // 封面缓慢推近，背景缓慢漂移
    coverImg.style.transform = `scale(${1 + 0.09 * (t / D)})`;
    bg.style.transform = `translate(${Math.sin(t * 0.07) * 40}px, ${Math.cos(t * 0.05) * 50}px) scale(${1.05 + 0.04 * Math.sin(t * 0.04)})`;
    // 片头淡入、片尾淡出
    const fade = P(t, 0, 0.6) * (1 - P(t, D - 0.8, D, E.in));
    ['cover', 'title', 'author', 'show', 'ep', 'wave', 'prog', 'tcur', 'tend'].forEach((id) => { $(id).style.opacity = fade; });
    renderWave(t);
    renderHosts(t);
    if (fade < 1) ['hostA', 'hostB'].forEach((id) => { $(id).style.opacity = parseFloat($(id).style.opacity) * fade; });
    renderCaption(t);
    renderChapter(t);
    renderKeys(t);
    prog.querySelector('.fill').style.width = `${(t / D) * 840}px`;
    $('tcur').textContent = mmss(t);
  }
  window.seek = seekAll;

  window.__ready = false;
  (async () => {
    await Promise.all([document.fonts.load('60px "Brush"'), document.fonts.load('700 60px "NotoSC"')]);
    await document.fonts.ready;
    await coverImg.decode();
    const bctx = bg.getContext('2d');
    bctx.filter = 'blur(28px) saturate(1.3)';
    bctx.drawImage(coverImg, -60, -60, 900, 1320);
    $('tend').textContent = mmss(D);
    // 要点卡太宽会出画：量一遍，超过 840px 直接报错，提示去改 timeline.js 里的文字
    KEYS.forEach((k) => { k.el.style.display = 'block'; const w = k.el.offsetWidth; k.el.style.display = 'none'; if (w > 860) throw new Error(`要点卡太宽（${w}px）：${k.text}`); });
    window.seek(0);
    window.__ready = true;
    if (!/render/.test(location.search)) startPreview();
  })().catch((e) => { console.error(e); document.title = 'ERROR ' + e.message; throw e; });

  function startPreview() {
    const stage = $('stage');
    const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / TL.width, (innerHeight - 44) / TL.height)})`; };
    fit();
    addEventListener('resize', fit);
    const ctrl = $('ctrl'), scrub = $('scrub'), label = $('tlabel'), btn = $('play'), audio = $('music');
    ctrl.style.display = 'flex';
    scrub.max = D;
    let playing = true, t0 = performance.now(), base = 0;
    const now = () => (playing ? base + (performance.now() - t0) / 1000 : base);
    const play = () => { t0 = performance.now(); playing = true; audio.currentTime = base; audio.play().catch(() => {}); btn.textContent = '暂停'; };
    const pause = () => { base = now(); playing = false; audio.pause(); btn.textContent = '播放'; };
    btn.onclick = () => (playing ? pause() : play());
    scrub.oninput = () => { base = +scrub.value; t0 = performance.now(); audio.currentTime = base; };
    addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); btn.onclick(); } });
    play();
    (function loop() {
      let t = now();
      if (t >= D) { base = 0; t0 = performance.now(); audio.currentTime = 0; t = 0; }
      window.seek(t);
      scrub.value = t;
      label.textContent = t.toFixed(2);
      requestAnimationFrame(loop);
    })();
  }
})();
