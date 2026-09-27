// 画面只由时间 t 决定：seek(t) 把每个元素摆到这一刻该在的位置，同一个 t 永远渲染出同一帧。
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const E = {
    lin: (x) => x,
    out: (x) => 1 - Math.pow(1 - x, 3),
    out5: (x) => 1 - Math.pow(1 - x, 5),
    in: (x) => x * x * x,
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const P = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)));
  const L = (a, b, p) => a + (b - a) * p;
  // 0→1→0 的短脉冲，用于按下回弹
  const bump = (t, c, d = 0.2) => (t >= c && t <= c + d ? Math.sin(Math.PI * (t - c) / d) : 0);

  function set(el, { o = 1, x = 0, y = 0, s = 1, sx, blur = 0 } = {}) {
    el.style.opacity = o;
    el.style.transform = `translate(${x}px, ${y}px) ` + (sx !== undefined ? `scale(${sx}, ${s})` : `scale(${s})`);
    el.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
  }
  const up = (el, t, t0, d = 0.6, dist = 26) => { const p = P(t, t0, t0 + d); set(el, { o: p, y: (1 - p) * dist }); };
  const show = (el, on) => { el.style.display = on ? '' : 'none'; };

  function typed(key, t) {
    const d = TL.typing[key];
    if (t < d.start) return '';
    return d.text.slice(0, clamp(Math.floor((t - d.start) * d.cps) + 1, 0, d.text.length));
  }
  const typingEnd = (key) => TL.typing[key].start + (TL.typing[key].text.length - 1) / TL.typing[key].cps;
  // 打字时光标常亮，停下后按 0.5 秒闪烁
  const caretOn = (t, from, activeUntil) => t >= from && (t <= activeUntil + 0.4 || Math.floor(t * 2) % 2 === 0);

  // ---------- 开场标题拆字 ----------
  const head = $('s1-head');
  const headChars = [...head.textContent].map((c) => {
    const s = document.createElement('span');
    s.textContent = c;
    return s;
  });
  head.textContent = '';
  headChars.forEach((s) => head.appendChild(s));

  // ---------- 通用：左栏与窗口入场 ----------
  function enterSide(root, t, t0) {
    const lcol = root.querySelector('.lcol');
    if (lcol) [...lcol.children].forEach((el, i) => up(el, t, t0 + 0.1 + i * 0.1, 0.6, 30));
    const win = root.querySelector('.win');
    if (win) {
      const p = P(t, t0 + 0.1, t0 + 0.85, E.out5);
      set(win, { o: p, x: (1 - p) * 90, s: 0.97 + 0.03 * p });
    }
  }

  const R = {};

  R.s1 = (t) => {
    headChars.forEach((s, i) => {
      const t0 = 0.25 + i * 0.07;
      const p = P(t, t0, t0 + 0.5);
      set(s, { o: p, y: (1 - p) * 40, blur: (1 - p) * 8 });
    });
    const m = P(t, 1.85, 2.6, E.inOut);
    head.style.transform = `translateY(${-m * 196}px) scale(${1 - m * 0.56})`;
    head.style.opacity = 1 - m * 0.35;
    const w = P(t, 2.0, 2.8, E.out5);
    $('s1-word').style.transform = `translateY(${(1 - w) * 290}px)`;
    const b = P(t, 2.6, 3.2);
    set($('s1-bar'), { o: b > 0 ? 1 : 0, sx: b, s: 1 });
    up($('s1-sub'), t, 3.0, 0.6, 20);
  };

  R.s2 = (t) => {
    const root = $('s2');
    enterSide(root, t, 5.5);
    up($('s2-hello'), t, 5.95, 0.6, 20);

    const po = P(t, 7.05, 7.35), pc = P(t, 8.5, 8.7, E.in);
    const a = po * (1 - pc);
    const drop = $('s2-drop');
    show(drop, a > 0.001);
    set(drop, { o: a, y: (1 - po) * 16 + pc * 10, s: 0.95 + 0.05 * a });
    for (let i = 0; i < 9; i++) $('s2-row-' + i).style.opacity = P(t, 7.05 + i * 0.03, 7.35 + i * 0.03);
    const m = P(t, 7.75, 8.3, E.inOut);
    $('s2-hl').style.top = 8 + L(1, 2, m) * 44 + 'px';
    const sw = P(t, 8.45, 8.55);
    $('s2-ok1').style.opacity = 1 - sw;
    $('s2-ok2').style.opacity = sw;

    const ps = P(t, 8.5, 8.8);
    set($('s2-pa'), { o: 1 - ps, y: -ps * 12 });
    set($('s2-pb'), { o: ps, y: (1 - ps) * 12 });
    set($('s2-pill'), { s: 1 - 0.06 * bump(t, 7.0) - 0.06 * bump(t, 8.45) });

    const txt = typed('s2q', t);
    $('s2-text').textContent = txt;
    show($('s2-ph'), !txt);
    $('s2-caret').style.opacity = caretOn(t, 8.9, typingEnd('s2q')) ? 1 : 0;
    set($('s2-send'), { s: 1 - 0.12 * bump(t, 11.0) });
  };

  R.s3 = (t) => {
    const root = $('s3');
    enterSide(root, t, 11.5);
    const chipOn = t >= 13.9;
    const at = chipOn ? '' : typed('s3at', t);
    const q = typed('s3q', t);
    $('s3-text').textContent = chipOn ? q : at;
    show($('s3-ph'), !at && !chipOn);
    show($('s3-chip'), chipOn);
    const pc = P(t, 13.9, 14.2, E.back);
    set($('s3-chip'), { o: clamp(pc * 2), s: 0.6 + 0.4 * pc });
    $('s3-caret').style.opacity = caretOn(t, 12.2, Math.max(t < 13.9 ? typingEnd('s3at') : typingEnd('s3q'), 13.9)) ? 1 : 0;

    const po = P(t, 12.35, 12.6), pcl = P(t, 13.9, 14.1, E.in);
    const a = po * (1 - pcl);
    const drop = $('s3-drop');
    show(drop, a > 0.001);
    set(drop, { o: a, y: (1 - po) * -12, s: 0.96 + 0.04 * a });
    const f = P(t, 12.75, 13.05, E.inOut);
    [0, 2, 3].forEach((i) => {
      const r = $('s3-row-' + i);
      r.style.height = 86 * (1 - f) + 'px';
      r.style.opacity = 1 - f;
    });
    $('s3-row-1').style.background = `rgba(244,244,245,${P(t, 13.45, 13.7)})`;

    set($('s3-send'), { s: 1 - 0.12 * bump(t, 16.35) });
    const st = $('s3-status');
    show(st, t >= 16.45);
    up(st, t, 16.45, 0.4, 12);
    [...st.querySelectorAll('.dots i')].forEach((d, i) => {
      d.style.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t * 1.6 - i * 0.22)));
    });
  };

  const DOC = [
    ['s4-title', '小团队的 AI 工作流'],
    ['s4-p1', '五人团队，每天写文案、做海报、回客户。'],
    ['s4-sel', 'AI 先出初稿，人来定方向、做判断。'],
    ['s4-p3', '省下来的时间，留给真正需要你的地方。'],
  ];
  const DOC_TOTAL = DOC.reduce((n, [, s]) => n + [...s].length, 0);
  const docCaret = document.createElement('i');
  docCaret.className = 'caret';

  R.s4 = (t) => {
    const root = $('s4');
    enterSide(root, t, 17.5);
    up($('s4-u'), t, 18.3, 0.5, 18);
    up($('s4-a'), t, 18.9, 0.5, 18);
    const pv = P(t, 22.2, 22.6, E.back);
    set($('s4-v'), { o: clamp(pv * 2), y: (1 - pv) * 20, s: 0.92 + 0.08 * pv });

    let n = t < TL.stream.start ? 0 : Math.floor((t - TL.stream.start) * TL.stream.cps) + 1;
    let caretHost = null;
    DOC.forEach(([id, s]) => {
      const chars = [...s];
      const k = clamp(n, 0, chars.length);
      $(id).textContent = chars.slice(0, k).join('');
      if (k > 0) caretHost = $(id);
      n -= chars.length;
    });
    const streamEnd = TL.stream.start + (DOC_TOTAL - 1) / TL.stream.cps;
    if (caretHost && t < 22.4) {
      caretHost.appendChild(docCaret);
      docCaret.style.opacity = caretOn(t, 0, streamEnd) ? 1 : 0;
    } else if (docCaret.parentNode) {
      docCaret.remove();
    }

    const sp = P(t, 22.5, 23.1, E.inOut);
    $('s4-sel').style.backgroundSize = `${sp * 100}% 100%`;
    const pm = P(t, 23.15, 23.45, E.back);
    const menu = $('s4-menu');
    show(menu, t >= 23.15);
    set(menu, { o: clamp(pm * 1.6), y: (1 - pm) * 10, s: 0.85 + 0.15 * pm });
  };

  const REVEAL = [28.0, 28.35, 28.7, 29.05, 29.05];
  R.s5 = (t) => {
    const root = $('s5');
    enterSide(root, t, 24);
    up($('s5-title'), t, 24.35, 0.6, 16);
    const txt = typed('s5q', t);
    $('s5-text').textContent = txt;
    show($('s5-ph'), !txt);
    $('s5-caret').style.opacity = caretOn(t, 24.8, typingEnd('s5q')) && t < 26.9 ? 1 : 0;
    set($('s5-send'), { s: 1 - 0.12 * bump(t, 26.85) });

    REVEAL.forEach((rv, i) => {
      const card = $('s5-g' + i);
      const pa = P(t, 27.0 + i * 0.06, 27.4 + i * 0.06);
      set(card, { o: pa, y: (1 - pa) * 24 });
      const r = P(t, rv, rv + 0.55);
      const load = card.querySelector('.load');
      load.style.opacity = 1 - r;
      load.style.backgroundPosition = `${100 - (((t - 27) * 70) % 100)}% 0`;
      load.textContent = i < 3 ? `生成中 ${Math.floor(clamp((t - 27) / (rv - 27)) * 99)}%` : '';
      const img = card.querySelector('img');
      img.style.opacity = r;
      img.style.transform = `scale(${1.08 - 0.08 * r})`;
      img.style.filter = r < 0.99 ? `blur(${(1 - r) * 18}px)` : 'none';
    });
    [...root.querySelectorAll('.gmeta')].forEach((m, i) => { m.style.opacity = P(t, REVEAL[Math.min(i, 3)], REVEAL[Math.min(i, 3)] + 0.5); });
  };

  const HOVER = { 0: [32.45, 33.55], 3: [33.75, 34.85], 4: [34.85, 36.2] };
  R.s6 = (t) => {
    const root = $('s6');
    enterSide(root, t, 30.5);
    up($('s6-tabs'), t, 30.85, 0.5, 14);
    up($('s6-desc'), t, 30.95, 0.5, 14);
    for (let i = 0; i < 6; i++) {
      const c = $('s6-card-' + i);
      const t0 = 31.0 + i * 0.12;
      const p = P(t, t0, t0 + 0.5, E.back);
      const hv = HOVER[i] ? P(t, HOVER[i][0], HOVER[i][0] + 0.25) * (1 - P(t, HOVER[i][1], HOVER[i][1] + 0.25)) : 0;
      set(c, { o: clamp(p * 2), y: (1 - p) * 30 - hv * 10, s: 0.9 + 0.1 * p });
      c.style.boxShadow = `0 ${4 + hv * 20}px ${14 + hv * 30}px -${8 + hv * 6}px rgba(24,24,27,${0.12 + hv * 0.18})`;
      c.style.borderColor = hv > 0.01 ? `rgba(24,24,27,${0.08 + hv * 0.22})` : '';
    }
  };

  R.s7 = (t) => {
    const c = P(t, 38.8, 39.45, E.in);
    const pt = P(t, 36.1, 36.7);
    set($('s7-title'), { o: pt * (1 - c), y: (1 - pt) * 24 - c * 20 });
    for (let i = 0; i < 6; i++) {
      const t0 = 36.4 + i * 0.1;
      const p = P(t, t0, t0 + 0.55, E.back);
      set($('s7-t' + i), {
        o: clamp(p * 2) * (1 - c),
        x: -(i - 2.5) * 196 * c,
        y: (1 - p) * 40 - c * 60,
        s: (0.7 + 0.3 * p) * (1 - 0.8 * c),
      });
    }
  };

  R.s8 = (t) => {
    const w = P(t, 39.55, 40.45, E.out5);
    set($('s8-word'), { o: w, s: 1.08 - 0.08 * w, blur: (1 - w) * 14 });
    up($('s8-tag'), t, 40.2, 0.6, 18);
    const p = P(t, 40.6, 41.1, E.back);
    set($('s8-pill'), { o: clamp(p * 2), s: 0.8 + 0.2 * p - 0.06 * bump(t, 42.45) });
    up($('s8-sub'), t, 41.0, 0.6, 16);
  };

  const LAST = TL.scenes.length - 1;
  function seekScenes(t) {
    $('bgdots').style.transform = `translate(${-((t * 6) % 34)}px, ${-((t * 3) % 34)}px)`;
    const mk = P(t, 5.6, 6.2) * (1 - P(t, 35.6, 36.0));
    $('mark').style.opacity = mk;

    TL.scenes.forEach((sc, i) => {
      const el = $(sc.id);
      const on = t >= sc.start && (t < sc.end || i === LAST);
      show(el, on);
      if (!on) return;
      const out = i === LAST ? 0 : P(t, sc.end - 0.35, sc.end, E.in);
      const drift = i === 0 || i === LAST ? 1 + (t - sc.start) * 0.005 : 1;
      el.style.opacity = 1 - out;
      el.style.transform = `translateY(${-out * 24}px) scale(${drift * (1 - out * 0.02)})`;
      R[sc.id](t);
    });
  }

  // ---------- 鼠标 ----------
  const MOVE = 0.6;
  let resolved = false;
  function resolveCursor() {
    const stageRect = $('stage').getBoundingClientRect();
    const scale = stageRect.width / TL.width;
    TL.cursor.forEach((seg) => {
      seg.pts = seg.kf.map(([kt, target, off = {}]) => {
        if (typeof target !== 'string') return { t: kt, x: target.x, y: target.y };
        seekScenes(kt);
        const r = document.querySelector(target).getBoundingClientRect();
        const fx = off.fx ?? 0.5, fy = off.fy ?? 0.5;
        return {
          t: kt,
          x: (r.left - stageRect.left + r.width * fx) / scale + (off.dx || 0),
          y: (r.top - stageRect.top + r.height * fy) / scale + (off.dy || 0),
        };
      });
    });
    resolved = true;
  }

  function cursorPos(seg, t) {
    const pts = seg.pts;
    if (t <= pts[0].t) return pts[0];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (t < b.t) {
        const m0 = Math.max(a.t, b.t - MOVE);
        const p = E.inOut(clamp((t - m0) / (b.t - m0)));
        return { x: L(a.x, b.x, p), y: L(a.y, b.y, p) };
      }
    }
    return pts[pts.length - 1];
  }

  function seekCursor(t) {
    const cur = $('cursor'), rip = $('ripple');
    const seg = TL.cursor.find((s) => t >= s.from && t <= s.to);
    if (!seg) { cur.style.opacity = 0; rip.style.opacity = 0; return; }
    const o = P(t, seg.from, seg.from + 0.2) * (1 - P(t, seg.to - 0.25, seg.to));
    const pos = cursorPos(seg, t);
    const press = TL.clicks.reduce((s, c) => s + bump(t, c, 0.18), 0);
    cur.style.opacity = o;
    cur.style.transform = `translate(${pos.x - 4}px, ${pos.y - 4}px) scale(${1 - 0.15 * press})`;

    const c = TL.clicks.filter((c) => t >= c && t - c <= 0.45).pop();
    if (c === undefined) { rip.style.opacity = 0; return; }
    const p = (t - c) / 0.45;
    const cp = cursorPos(seg, c);
    rip.style.opacity = 0.6 * (1 - p);
    rip.style.transform = `translate(${cp.x}px, ${cp.y}px) scale(${0.2 + 0.8 * E.out(p)})`;
  }

  // 配音字幕：读 tts.js 生成的 voice.js，按句显示，前后各淡入淡出 0.12 秒
  function seekSubtitle(t) {
    const box = $('subtitle');
    const lines = window.VOICE && TL.voice && TL.voice.subtitles ? window.VOICE.lines : [];
    const l = lines.find((x) => t >= x.at - 0.1 && t < x.at + x.dur + 0.2);
    box.style.display = l ? '' : 'none';
    if (!l) return;
    box.firstElementChild.textContent = l.text;
    box.style.opacity = P(t, l.at - 0.1, l.at + 0.02) * (1 - P(t, l.at + l.dur + 0.08, l.at + l.dur + 0.2));
  }

  window.seek = function (t) {
    if (!resolved) resolveCursor();
    seekScenes(t);
    seekCursor(t);
    seekSubtitle(t);
  };

  // ---------- 就绪：字体与图片全部解码后才允许截图 ----------
  window.__ready = false;
  (async () => {
    await document.fonts.load('700 100px "EB Garamond"');
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch((e) => {
      console.error('图片解码失败', img.src, e);
      throw e;
    })));
    resolveCursor();
    window.seek(0);
    window.__ready = true;
    if (!/render/.test(location.search)) startPreview();
  })();

  // ---------- 预览模式：直接用浏览器打开 index.html 时自动播放 ----------
  function startPreview() {
    const stage = $('stage');
    const fit = () => {
      const s = Math.min(innerWidth / TL.width, (innerHeight - 44) / TL.height);
      stage.style.transform = `scale(${s})`;
    };
    fit();
    addEventListener('resize', fit);
    const ctrl = $('ctrl'), scrub = $('scrub'), label = $('tlabel'), btn = $('play'), audio = $('music');
    ctrl.style.display = 'flex';
    scrub.max = TL.duration;
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
      if (t >= TL.duration) { base = 0; t0 = performance.now(); audio.currentTime = 0; t = 0; }
      window.seek(t);
      scrub.value = t;
      label.textContent = t.toFixed(2);
      requestAnimationFrame(loop);
    })();
  }
})();
