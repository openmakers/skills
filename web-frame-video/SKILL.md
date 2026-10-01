---
name: web-frame-video
description: >-
  把产品介绍、功能演示、发布预告、知识点漫画讲解做成「网页逐帧截图」的 MP4 视频（可选 AI 中文配音 + 字幕）：整段视频写成一个 HTML 页面，核心是 seek(t) 函数，按时间摆好每个元素；Playwright 驱动无头 Chrome 逐帧截图（2 倍分辨率再缩小），ffmpeg 编码；背景音乐与点击声、打字声、转场声全部用代码合成，与画面逐帧对齐。画面里是仿真的产品界面（鼠标移动点击、下拉选择、打字、AI 流式写入、出图揭晓、卡片弹出），中文 100% 准确、可随时改字重出。当用户说「做产品介绍视频」「产品演示视频」「功能宣传片」「网页录屏式动画」「用代码做视频」「逐帧截图做视频」「把网页做成视频」「发布会预告视频」「漫画风讲解视频」「知识点动画讲解」「给视频配音」「加旁白 / 字幕」，或给出类似「视频不是剪出来的，是网页一帧一帧拍下来的」的思路时使用。区别于 explainer-video（Remotion 知识讲解大字卡片）和 short-video / video-gen（AI 生成画面，文字不可控）。
---

# 网页逐帧视频（web-frame-video）

一个视频 = 一个 HTML 页面 + 一个 `seek(t)` 函数。给它一个时间，它把画面里每个元素摆到这一刻该在的位置。画面只由 t 决定，不靠浏览器自己播放动画，所以同一个 t 永远渲染出同一帧。然后逐帧截图、编码、合入代码算出来的音乐。

实测：45 秒 60fps 共 2700 帧，6 个浏览器并行，截图加编码约 45 秒跑完。样片是 MakerOS 产品介绍（`template/` 就是它的完整源码）。

## 常量

```bash
SKILL_DIR="$HOME/.claude/skills/web-frame-video"
OUTPUT_DIR="${VIDEO_OUTPUT_DIR:-$HOME/Movies/ai-video}"   # 成片目录，设环境变量 VIDEO_OUTPUT_DIR 可改
```

依赖：Node 18+、ffmpeg（含 ffprobe）。npm 或 Playwright 下载慢时，在命令前加 `HTTPS_PROXY=<代理地址>`。

## 文件分工

| 文件 | 作用 |
|---|---|
| `timeline.js` | **时间轴唯一真源**：画布尺寸、时长、fps、BPM、场景起止、打字（文本 + 起点 + 每秒字数）、鼠标轨迹、点击、弹出、重音、升调。画面和音频都读它，所以声音和画面天然对齐 |
| `index.html` | 画面结构与样式。每个场景一个 `<section class="scene">`，右侧仿真产品窗口、左侧标题说明 |
| `scenes.js` | 每个场景一个 `R.sX(t)` 渲染函数 + 通用工具（缓动、入场、打字、光标闪烁、鼠标）。浏览器直接打开 index.html 即进入预览模式（播放条、空格暂停、拖动） |
| `audio.js` | 纯 Node 合成 `out/music.wav`：和弦铺底、FM 琶音、贝斯、底鼓 / 拍手 / 踩镲、底鼓压缩，加点击 / 打字 / 转场 / 弹出 / 重音 / 升调音效，简易混响，tanh 软限幅 |
| `render.js` | `--still 2.5,7.8` 抽静帧；无参数出全片：N 个浏览器分段并行截 JPEG → 各自管道进 ffmpeg 编码 → concat 无损拼接 → 合入音频；`--mix` 不重拍画面，只把新音乐 / 新配音重新混进成片 |
| `tts.js` | 配音：按 `TL.voice.lines` 逐句调 MiniMax Speech 2.8 HD 合成（按文本 + 音色 + 语速缓存），校验句子是否互相压住，拼成 `out/voice.wav`，并写出 `voice.js`（每句时长，供字幕用）；`--check` 用语音识别回听比对 |
| `voice.js` | tts.js 生成的字幕数据；还没配音时是 `var VOICE = null` |

## 工作流

### 1. 搭项目（首次）

```bash
P=~/Dev/<项目名>-video   # 任选工作目录
cp -R "$SKILL_DIR/template" "$P" && cd "$P"
npm i
```

Playwright 版本常比本机缓存的 Chromium 新，`render.js` 的 `findChrome()` 会自动退回 `~/Library/Caches/ms-playwright` 里最新的 headless shell，不用重新下载浏览器。新增 Playwright 这个依赖要跟用户说明理由（驱动浏览器截图）。

### 2. 收集产品素材（不要编）

从产品仓库里取真东西：首页文案（定位语、模块名、卖点、注册福利）、`public/` 里的 logo、头像、图标、示例成品图、品牌字体。复制到 `assets/`。文案口径以站内现有说法为准，功能名称全站统一。

### 3. 写分镜 = 写 timeline.js

- 结构：开场品牌（约 5s）→ 每个功能一个场景（6–6.5s）→ 能力总览（3.5s）→ 收尾 CTA（5.5s）。4–6 个功能，总长 40–50s。
- **BPM 120，一拍 0.5s，所有场景切换落在拍点上**，重音（品牌字标出现）也落拍点。
- 每个功能场景的节奏：0–0.9s 左栏与窗口入场 → 约 1s 后鼠标入画 → 一次核心交互（选择 / 打字 / 发送）→ 结果出现 → 最后 0.35s 淡出。
- 打字速度 10 字/秒左右；AI 流式写入 24 字/秒；鼠标每段移动 0.6s（到达时刻前 0.6s 才开始动，其余时间停着）。
- 鼠标关键帧目标写**选择器**，不写坐标：初始化时先 `seek` 到该关键帧时刻，再读元素的 `getBoundingClientRect()` 中心（可加 `dx/dy` 或 `fx/fy` 比例偏移）。改布局不用重算坐标。

### 4. 写画面（index.html + scenes.js）

场景套路见 `references/scene-patterns.md`（左栏说明 + 右侧产品窗口、下拉选模型、@ 智能体筛选、对话写作流式落稿 + 划词菜单、生图加载到揭晓、卡片弹出与悬停、图标汇聚、品牌收尾）。视觉按项目的产品界面规范走；页面上出现的产品名、功能名用中文业务说法。

### 5. 抽静帧检查 →【确认门】

```bash
node render.js --still 1.0,4.0,7.6,10.8,13.3,15.8,21.0,23.6,26.5,29.8,33.2,37.6,43.5
```

每个场景抽 1–2 个关键时刻，用 ffmpeg 拼成 2×2 审阅图再看，不要把十几张原图逐张读进上下文：

```bash
cd out && ffmpeg -loglevel error -y -i still-1.00.png -i still-4.00.png -i still-7.60.png -i still-10.80.png \
  -filter_complex "[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" g1.png
```

检查：文字是否换行出孤字、浮层是否压字、鼠标是否挡住关键文字、元素有没有全部显示。

### 6. 出片

```bash
node audio.js                      # 改了 timeline 的任何时间都要重跑
node render.js                     # 超过 5 分钟的长片用 nohup 脱离会话跑，日志写进文件
```

合成完先测响度：`ffmpeg -i out/music.wav -af ebur128 -f null - 2>&1 | grep -A2 Integrated`，社交平台 -14 LUFS 左右合适（样片 -13）。

### 6.5 配音（可选）

模型选定 **MiniMax Speech 2.8 HD**：2026 年 Artificial Analysis 与 Hugging Face 两个 TTS 盲听榜都排第一，中文语气、停顿、多音字处理最好；走 OpenAI 兼容接口 `/v1/audio/speech`。接口地址读 `TTS_BASE_URL`（任何提供 `speech-2.8-hd` 的 OpenAI 兼容服务都可以），key 读 `TTS_API_KEY`。音色、语速、写稿节奏见 `references/voiceover.md`。

1. 在 `timeline.js` 写 `TL.voice`：`{ model: 'speech-2.8-hd', voice: 'presenter_female', speed: 1.05, subtitles: true, lines: [{ id: 'v1', at: 1.6, text: '…' }] }`。每句放在对应场景开头后 0.3–0.6 秒，一场一句为主。
2. `node tts.js --check`：合成、打印每句起止时间；句子互相压住会报错并给出该挪到几秒；`--check` 用 whisper 回听，比对不到 85% 标「可疑」。**识别模型分不清同音词**（「一图」会听成「意图」），可疑句先看是不是同音误报，真错读再改写法（数字写成汉字、英文缩写之间留空）。
3. 画面要字幕就设 `subtitles: true`（模板已带底部字幕条，读 `voice.js`），改了字幕需要重拍；只改配音不改画面用 `node render.js --mix`，几秒出新片。
4. 混音链在 render.js：人声统一到 -16 LUFS，音乐整体降到六成，并在人声处侧链压缩再压约 10 dB，最后整片 -14 LUFS。验收时把有人声的片段截出来给 whisper 识别，能完整识别出原句说明人声没被音乐盖住。

### 7. 验收成片

从 mp4 里抽帧拼图（覆盖分段接缝附近的帧号，如 450、900）：

```bash
ffmpeg -loglevel error -y -i out/<成片>.mp4 -vf "select='eq(n\,150)+eq(n\,450)+eq(n\,834)+eq(n\,1194)+eq(n\,1644)+eq(n\,1880)+eq(n\,2220)+eq(n\,2400)+eq(n\,2699)',scale=640:360,tile=3x3" -frames:v 1 -vsync 0 check.png
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -of compact out/<成片>.mp4
```

帧数 = 时长 × fps、有 aac 音轨才算完成。成片复制到 `$OUTPUT_DIR`，文件名带日期，已存在就加 `-v2`，不覆盖。

## 铁律（每条都踩过）

1. **画面只由 t 决定**：禁止 CSS `transition` / `animation`、`Date.now()`、`Math.random()`；光标闪烁用 `Math.floor(t * 2) % 2`，加载条流光用 `background-position` 随 t 变化，随机数用固定种子。
2. **不要在 CSS 里 `display: none` 再用 `el.style.display = ''` 显示**：清空内联值会回落到 CSS 的 none，整场景消失（首轮静帧全白就是这个）。场景根节点 CSS 不写 display，显隐全交给 JS。
3. **同优先级的类后写的赢**：`.abs` 写在 `.pillswap { position: relative }` 前面会被覆盖，要叠放的元素直接写内联 `position:absolute`。
4. **截图前等资源就绪**：`document.fonts.load` + `document.fonts.ready` + 每张 `img.decode()`，全部完成才置 `window.__ready = true`；解码失败要抛错，不许吞。
5. **2 倍截图再缩小**：`deviceScaleFactor: 2` 截 JPEG（质量 95），ffmpeg `scale=...:flags=lanczos` 缩回 1080p，文字比 1 倍截图锐利得多；JPEG 比 PNG 快且不落盘，直接写进 ffmpeg 的 stdin（注意 `drain` 背压）。
6. **分段并行而不是分帧并行**：每个浏览器负责一段连续帧、编码成一个 mp4，最后 `concat -c copy` 拼接，参数一致即可无损拼接。
7. **声音从同一份时间轴生成**：点击、打字、弹出的时刻只写在 timeline.js，画面的按下回弹、音频的点击声都读它；改了时间必须重跑 audio.js。
8. **流式写入的段落避免孤字换行**：按正文栏宽估算每行字数（栏宽 ÷ 字号），超了就缩句；划词浮层放在段落间距里，段距至少留出浮层高度。
9. 不用 emoji、不写生造词；标题名词化、单行不过长（文案规范同样适用于视频画面）。
10. **被设了 transform 的容器会变成绝对定位子元素的定位参照**：常驻层（如角色 + 对白层）一旦在 JS 里加了抖动 transform，就必须 `position:absolute; inset:0`，否则里面用 `bottom:` 定位的气泡会跑出画面。
11. **页面事件和声音清单互相校验**：用 `data-slam` / `data-pop` / `data-stamp` 声明入场时刻时，初始化时逐个检查是否登记在 timeline 的 slams / pops / stamps 里，公式分块数也和 timeline 的 `n` 比对，不一致直接抛错——声音漏配在静帧里看不出来。
12. **配音按句合成、按句定位**：不要整段一次合成再切，逐句合成才能拿到每句精确时长去对画面；句子之间至少留 0.15 秒。数字写成汉字、读法才可控。
13. **截图前等所有字体到位**：每款 `@font-face` 都要 `document.fonts.load(...)`，缺一款就会按回退字体量宽度，下划线、手绘边、气泡宽度全部偏差。

## 改尺寸与复用

- 竖版 9:16：`timeline.js` 改 `width: 1080, height: 1920`，`index.html` 的 `#stage` 同步改宽高，版式改成上下结构（标题在上、产品窗口在下）。
- 只想换音乐风格：改 `audio.js` 顶部的和弦表 `CH`、`bpm` 和各声部增益，参考 `references/audio-recipes.md`。
- 预览：浏览器直接打开 `index.html`（音频读 `out/music.wav`，先跑一次 audio.js）。
- 讲解类（知识点、课程）用漫画风：分镜格落下、对白气泡、角色、公式逐块写出、盖章。做法与样例项目见 `references/comic-explainer.md`。
- 字体：讲解 / 科普类默认「标题马善政毛笔楷书 + 正文思源黑体 500 + 学名 EB Garamond 斜体」，站酷快乐体只用于低龄向。下载地址、接入写法、字号表、五套备选方案见 `references/fonts.md`。
