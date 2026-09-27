// AI 科普讲解视频的画面引擎：按 timeline.js（由 plan.js 从 script.js 生成）搭出每一场的 DOM，
// seek(t) 只由时间决定画面。场景类型见 references/scene-types.md。
(function () {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    out5: (x) => 1 - Math.pow(1 - x, 5),
    in: (x) => x * x * x,
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const P = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)));

  // ---------- 舞台 ----------
  const stage = $('stage');
  const portrait = TL.height > TL.width;
  stage.style.width = TL.width + 'px';
  stage.style.height = TL.height + 'px';
  stage.className = (TL.theme || 'paper') + (portrait ? ' portrait' : '');
  $('series').lastElementChild.textContent = TL.series || '';
  if (!TL.series) $('series').style.display = 'none';

  // ---------- 文本与素材 ----------
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // **关键词** → 马克笔高亮；==关键词== → 强调色
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/==(.+?)==/g, '<em class="hl">$1</em>').replace(/\n/g, '<br>');
  const src = (key, dir) => (/[/.]/.test(key) ? key : `assets/${dir}/${key}.webp`);
  const icon = (key, cls = 'icon') => (key ? `<img class="${cls}" src="${src(key, 'icons')}">` : '');
  const logo = (tool) => (tool.logo ? `<img class="lg" src="${/\//.test(tool.logo) ? tool.logo : 'assets/logos/' + tool.logo}">` : tool.icon ? `<img class="lg icon" src="${src(tool.icon, 'icons')}">` : '');
  const TAGS = { term: '概念', metaphor: '打个比方', compare: '对比', layers: '结构', steps: '步骤', list: '要点', chat: '实操', terminal: '实操', tools: '工具' };

  // 每个 data-u 是一个「出现单元」，按 plan.js 算好的 beats 依次出现；data-k 是出现方式，data-d 是相对延迟
  const B = {
    hook: (s) => ({ bg: '<div class="blob"></div>', body: `<div class="hook"><h1 data-u="0" data-k="rise">${md(s.title)}</h1>${s.sub ? `<p data-u="1">${md(s.sub)}</p>` : ''}</div>` }),
    term: (s) => ({
      body: `<div class="term">${s.icon ? icon(s.icon).replace('<img', '<img data-u="0" data-k="pop"') : ''}<div class="tx">
        <div class="name latin" data-u="0">${md(s.term)}</div>${s.alias ? `<div class="alias" data-u="0" data-d="0.15">${md(s.alias)}</div>` : ''}
        <div class="rule" data-u="0" data-k="draw" data-d="0.3"></div>${s.def ? `<div class="def" data-u="1">${md(s.def)}</div>` : ''}</div></div>`,
    }),
    metaphor: (s) => {
      const tile = (x, u) => `<div class="tile" data-u="${u}" data-k="pop">${icon(x.icon)}<div><b>${md(x.label)}</b>${x.note ? `<span>${md(x.note)}</span>` : ''}</div></div>`;
      return { body: `<div class="meta"><div class="pair">${tile(s.left, 0)}<div class="sign latin" data-u="1" data-k="pop" data-d="-0.12">${esc(s.sign || '≈')}</div>${tile(s.right, 1)}</div>${s.caption ? `<div class="cap" data-u="2">${md(s.caption)}</div>` : ''}</div>` };
    },
    compare: (s) => {
      const col = (c, cls, u) => `<div class="col ${cls}" data-u="${u}"><h3>${md(c.title)}</h3><ul>${c.items.map((it, i) => `<li data-u="${u}" data-k="left" data-d="${0.15 + i * 0.14}">${md(it)}</li>`).join('')}</ul></div>`;
      return { body: `<div class="cmp">${col(s.left, 'bad', 0)}${col(s.right, 'good', 1)}</div>` };
    },
    layers: (s) => ({ body: `<div class="tree">${s.rows.map((r, i) => `<div class="node d${r.depth || 0}" data-u="${i}" data-k="left"><div class="nm ${r.mono === false ? '' : 'mono'}">${md(r.name)}</div><div class="ds">${md(r.desc || '')}</div></div>`).join('')}</div>` }),
    steps: (s) => ({
      body: `<div class="steps">${s.steps.map((st, i) => `${i ? `<div class="arr" data-arrow="${i}"><svg viewBox="0 0 64 40"><path d="M2 20 H56 M42 6 L58 20 L42 34" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1"/></svg></div>` : ''}<div class="step" data-u="${i}" data-k="pop"><div class="n latin">${i + 1}</div><b>${md(st.title)}</b>${st.desc ? `<p>${md(st.desc)}</p>` : ''}</div>`).join('')}</div>`,
    }),
    list: (s) => ({ body: `<ul class="list">${s.items.map((it, i) => { const x = typeof it === 'string' ? { text: it } : it; return `<li data-u="${i}" data-k="left">${x.icon ? icon(x.icon) : `<span class="n latin">${String(i + 1).padStart(2, '0')}</span>`}<span class="t">${md(x.text)}</span></li>`; }).join('')}</ul>` }),
    chat: (s) => ({
      body: `<div class="chat"><div class="win-bar"><i></i><i></i><i></i><span>${esc(s.app || 'AI 对话')}</span></div><div class="msgs">${s.messages.map((m, i) => m.role === 'user'
        ? `<div class="msg user" data-u="${i}" data-k="pop"><div class="bb">${md(m.text)}</div></div>`
        : `<div class="msg ai" data-u="${i}" data-k="pop"><div class="av latin">${esc(s.aiName || 'AI')}</div><div class="bb" data-stream="${i}"></div></div>`).join('')}</div></div>`,
    }),
    terminal: (s) => ({
      body: `<div class="term-win"><div class="win-bar"><i></i><i></i><i></i><span>${esc(s.app || '终端')}</span></div><div class="tbody mono">${s.cmds.map((l, i) => `<div data-u="${i}" data-k="none"><div><span class="pr">$</span><span data-cmd="${i}"></span></div>${l.out ? `<div class="out" data-out="${i}">${esc(l.out)}</div>` : ''}</div>`).join('')}</div></div>`,
    }),
    tools: (s) => {
      const cols = portrait ? 2 : Math.min(4, s.tools.length);
      return { body: `<div class="tools" style="grid-template-columns:repeat(${cols},1fr)">${s.tools.map((tl, i) => `<div class="tool" data-u="${i}" data-k="pop">${logo(tl)}<b>${md(tl.name)}</b>${tl.by ? `<div class="by">${md(tl.by)}</div>` : ''}${tl.desc ? `<p>${md(tl.desc)}</p>` : ''}${tl.tag ? `<span class="tg">${md(tl.tag)}</span>` : ''}</div>`).join('')}</div>` };
    },
    quote: (s) => ({ body: `<div class="quote"><div class="bar" data-u="0" data-k="draw"></div><q data-u="0" data-d="0.1">${md(s.text)}</q>${s.by ? `<div class="by" data-u="0" data-d="0.5">${md(s.by)}</div>` : ''}</div>` }),
    image: (s) => ({ body: `<div class="pic" data-u="0" data-k="zoom"><img src="${esc(s.src)}">${s.caption ? `<div class="cap" data-u="1">${md(s.caption)}</div>` : ''}</div>` }),
    outro: (s) => ({ body: `<div class="outro"><div class="brand" data-u="0" data-k="pop">${md(s.brand)}</div>${s.sub ? `<div class="sub2" data-u="${1}">${md(s.sub)}</div>` : ''}${s.cta ? `<div class="cta" data-u="${s.sub ? 2 : 1}" data-k="pop">${md(s.cta)}</div>` : ''}</div>` }),
  };

  // ---------- 搭场景 ----------
  const scenes = TL.scenes.map((s, idx) => {
    const build = B[s.type];
    if (!build) throw new Error(`未知场景类型 ${s.type}（第 ${idx + 1} 场）`);
    const { bg = '', body } = build(s);
    const tag = s.tag === undefined ? TAGS[s.type] : s.tag;
    const head = tag || s.title && !['hook', 'quote', 'outro'].includes(s.type)
      ? `<div class="head">${tag ? `<span class="chip">${esc(tag)}</span>` : ''}${s.title && !['hook', 'quote', 'outro'].includes(s.type) ? `<div class="title">${md(s.title)}</div>` : ''}</div>` : '';
    const el = document.createElement('section');
    el.className = 'scene';
    el.innerHTML = `${bg}<div class="frame">${head}<div class="body">${body}</div></div>`;
    $('scenes').appendChild(el);
    const units = $$('[data-u]', el).map((u) => ({ el: u, i: +u.dataset.u, k: u.dataset.k || 'up', d: +(u.dataset.d || 0), marks: $$('mark', u) }));
    const headEls = $$('.head > *', el);
    return { s, el, units, headEls, blob: el.querySelector('.blob') };
  });

  function applyUnit(u, t, t0) {
    const el = u.el;
    const shown = t >= t0;
    if (u.k === 'none') {
      el.style.opacity = shown ? 1 : 0;
    } else if (u.k === 'draw') {
      el.style.opacity = shown ? 1 : 0;
      el.style.transform = `scaleX(${P(t, t0, t0 + 0.45, E.inOut)})`;
    } else if (u.k === 'pop') {
      const p = P(t, t0, t0 + 0.5, E.back);
      el.style.opacity = shown ? clamp(p * 2) : 0;
      el.style.transform = `scale(${0.6 + 0.4 * p})`;
    } else if (u.k === 'left') {
      const p = P(t, t0, t0 + 0.5, E.out5);
      el.style.opacity = shown ? p : 0;
      el.style.transform = `translateX(${(1 - p) * -60}px)`;
    } else if (u.k === 'rise') {
      const p = P(t, t0, t0 + 0.8, E.out5);
      el.style.opacity = shown ? p : 0;
      el.style.transform = `translateY(${(1 - p) * 60}px) scale(${1.04 - 0.04 * p})`;
      el.style.filter = p < 1 ? `blur(${(1 - p) * 14}px)` : 'none';
    } else if (u.k === 'zoom') {
      const p = P(t, t0, t0 + 0.7, E.out);
      el.style.opacity = shown ? p : 0;
      const img = el.querySelector('img');
      if (img) img.style.transform = `scale(${1.12 - 0.06 * p - 0.02 * clamp((t - t0) / 8)})`;
    } else {
      const p = P(t, t0, t0 + 0.55, E.out5);
      el.style.opacity = shown ? p : 0;
      el.style.transform = `translateY(${(1 - p) * 36}px)`;
    }
    u.marks.forEach((m) => { m.style.backgroundSize = `${P(t, t0 + 0.3, t0 + 0.8, E.inOut) * 100}% 100%`; });
  }

  function renderScene(sc, t) {
    const { s } = sc;
    const b = s.beats || [];
    sc.headEls.forEach((h, i) => {
      const p = P(t, s.start + 0.05 + i * 0.08, s.start + 0.6 + i * 0.08, E.out5);
      h.style.opacity = p;
      h.style.transform = `translateY(${(1 - p) * 24}px)`;
    });
    if (sc.blob) sc.blob.style.transform = `scale(${0.7 + 0.3 * P(t, s.start, s.start + 1.2)})`;
    sc.units.forEach((u) => applyUnit(u, t, (b[u.i] ?? s.start) + u.d));

    if (s.type === 'steps') {
      $$('[data-arrow]', sc.el).forEach((a) => {
        const i = +a.dataset.arrow, t0 = (b[i] ?? s.start) - 0.3;
        a.querySelector('path').style.strokeDashoffset = 1 - P(t, t0, t0 + 0.35, E.inOut);
        a.style.opacity = t >= t0 ? 1 : 0;
      });
    }
    if (s.type === 'chat') {
      (s.streams || []).forEach((st) => {
        if (!st) return;
        const bb = sc.el.querySelector(`[data-stream="${st.i}"]`);
        const text = [...s.messages[st.i].text.replace(/\*\*|==/g, '')];
        if (t < st.start) {
          const k = Math.floor(t * 3) % 3;
          bb.innerHTML = `<span style="letter-spacing:.2em;color:var(--muted)">${'•'.repeat(k + 1)}</span>`;
          return;
        }
        const n = clamp(Math.floor((t - st.start) * st.cps) + 1, 0, text.length);
        bb.innerHTML = esc(text.slice(0, n).join('')) + (n < text.length ? '<i class="caret"></i>' : '');
      });
    }
    if (s.type === 'terminal') {
      const lastI = s.typing.length - 1;
      s.typing.forEach((ty, i) => {
        const chars = [...s.cmds[i].cmd];
        const n = t < ty.start ? 0 : clamp(Math.floor((t - ty.start) * ty.cps) + 1, 0, chars.length);
        // 打字时光标常亮；最后一条敲完后光标闪烁
        const caret = (t >= ty.start && t < ty.outAt) || (i === lastI && t >= ty.outAt && Math.floor(t * 2) % 2 === 0);
        sc.el.querySelector(`[data-cmd="${i}"]`).innerHTML = esc(chars.slice(0, n).join('')) + (caret ? '<i class="caret"></i>' : '');
        const out = sc.el.querySelector(`[data-out="${i}"]`);
        if (out) out.style.opacity = P(t, ty.outAt, ty.outAt + 0.25);
      });
    }
  }

  function seekScenes(t) {
    $('dots').style.transform = `translate(${-((t * 6) % 36)}px, ${-((t * 3) % 36)}px)`;
    const last = scenes.length - 1;
    scenes.forEach((sc, i) => {
      const { s } = sc;
      const on = t >= s.start && (t < s.end || i === last);
      sc.el.style.display = on ? 'block' : 'none';
      if (!on) return;
      const pin = i === 0 ? 1 : P(t, s.start, s.start + 0.35);
      const out = i === last ? 0 : P(t, s.end - 0.3, s.end, E.in);
      sc.el.style.opacity = pin * (1 - out);
      sc.el.style.transform = `translateY(${(1 - pin) * 20 - out * 20}px)`;
      renderScene(sc, t);
    });
    $('progress').style.width = `${clamp(t / TL.duration) * 100}%`;
    // 字幕
    const sub = $('sub');
    let line = null;
    if (TL.subtitles !== false) TL.scenes.forEach((s) => (s.subs || []).forEach((l) => { if (t >= l.at - 0.08 && t < l.at + l.dur + 0.15) line = l; }));
    sub.style.display = line ? '' : 'none';
    if (line) {
      sub.firstElementChild.textContent = line.text.replace(/\*\*|==/g, '');
      sub.style.opacity = P(t, line.at - 0.08, line.at + 0.04) * (1 - P(t, line.at + line.dur + 0.03, line.at + line.dur + 0.15));
    }
  }

  window.seek = seekScenes;

  window.__ready = false;
  (async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch((e) => {
      console.error('图片解码失败', img.src, e);
      throw e;
    })));
    window.seek(0);
    window.__ready = true;
    if (!/render/.test(location.search)) startPreview();
  })();

  function startPreview() {
    const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / TL.width, (innerHeight - 44) / TL.height)})`; };
    fit();
    addEventListener('resize', fit);
    const ctrl = $('ctrl'), scrub = $('scrub'), label = $('tlabel'), btn = $('play'), audio = $('music');
    audio.src = 'out/mix.wav'; // 只在预览时加载，出片时不需要
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
