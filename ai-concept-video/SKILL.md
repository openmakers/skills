---
name: ai-concept-video
description: >-
  做 AI 科普讲解视频：讲清一个 AI 概念（Skill、MCP、Agent、RAG、上下文、提示词等）、一套 AI 用法或方法、一批实用 AI 工具。只写一份分镜脚本 script.js（旁白 + 场景类型 + 画面文字），先用 MiniMax Speech 2.8 HD 逐句配音，再按每句真实时长自动排出画面节奏、元素出现时刻和字幕，最后网页逐帧截图出 MP4。内置 13 种讲解场景（开场钩子、术语卡、类比、对比、结构树、步骤、要点、对话演示、终端演示、工具卡、金句、大图、收尾），米白纸面 / 深色两套主题，横屏 16:9 与竖屏 9:16 同一份脚本切换。当用户说「做一个 AI 科普视频」「讲解 XX 概念的视频」「介绍 Skill / MCP / Agent 的视频」「AI 工具推荐视频」「AI 知识讲解短视频」「把这篇 AI 教程做成视频」「AI 小课堂」时使用。产品宣传片、仿真产品界面演示用 web-frame-video；AI 生成画面的短视频用 short-video。
---

# AI 科普讲解视频（ai-concept-video）

一支科普视频 = 一份分镜脚本。脚本里每一场选一种讲解场景、写上画面文字和旁白；`plan.js` 先把旁白逐句配成音，拿每句的真实时长排出整条时间轴：哪一秒切场、哪个元素在哪个字念到时出现、字幕怎么切。画面、字幕、音效全部跟着配音走，改一句旁白，节奏自动重排。

画面和出片沿用 web-frame-video 的原理：整段视频是一个网页，`seek(t)` 按时间摆好画面，Playwright 逐帧截图，ffmpeg 编码，音乐与音效用代码合成。

样片：`template/` 就是「什么是 Skill」的完整源码（11 场、26 句旁白、约 130 秒）。

## 常量

```bash
SKILL_DIR="$HOME/.claude/skills/ai-concept-video"
OUTPUT_DIR="${VIDEO_OUTPUT_DIR:-$HOME/Movies/ai-video}"   # 成片目录，设环境变量 VIDEO_OUTPUT_DIR 可改
```

依赖：Node 18+、ffmpeg（含 ffprobe）。npm 或 Playwright 下载慢时，在命令前加 `HTTPS_PROXY=<代理地址>`。

配音接口：OpenAI 兼容的 `/v1/audio/speech`，模型 MiniMax `speech-2.8-hd`。地址读 `TTS_BASE_URL`（任何提供 `speech-2.8-hd` 的 OpenAI 兼容服务），key 读 `TTS_API_KEY`。回听校对用同一个服务的 `whisper-1`。

## 文件分工

| 文件 | 作用 |
|---|---|
| `script.js` | **唯一手写的文件**：标题、栏目名、主题、横竖屏、音色，以及每一场的类型、画面文字、旁白 `say` |
| `plan.js` | 读脚本 → 逐句配音（缓存）→ 排时间 → 生成 `timeline.js` 和人声轨 `out/voice.wav`；`--dry` 按字数估时长不配音；`--check` 回听新合成的句子，`--check-all` 回听全部 |
| `timeline.js` | plan.js 的产物，勿手改：每场起止、元素出现时刻 `beats`、字幕 `subs`、对话流式与终端打字的节奏、音效事件 |
| `index.html` + `scenes.js` | 画面：两套主题的样式、13 种场景的 DOM 生成与动画、字幕、进度条。浏览器直接打开 index.html 是预览模式（播放条、空格暂停、拖动） |
| `audio.js` | 合成 `out/music.wav`（温和 lo-fi 铺底）与 `out/sfx.wav`（转场、元素出现、重音、敲键），再和人声混成 `out/mix.wav`：人声 -16 LUFS 作侧链把音乐压低，整体 -14 LUFS |
| `render.js` | `--still auto` 每场截一张出齐后的样图拼成 `out/contact.png` 并检查溢出；`--still 3.2,15` 截指定时刻；无参数出全片；`--mix` 只换音轨不重拍 |
| `assets/icons/` | 通用图标库的扁平插画图标（book、bulb、notebook、pen、revise、wand、chat、avatar-* 等 29 个），脚本里写 key 即可 |
| `assets/logos/` | 常见 AI 产品 logo：claude-color、openai、gemini-color、google-color、deepseek、kimi、qwen、doubao、zai、grok、cursor、notion、sora、workbuddy |

## 工作流

### 1. 搭项目

```bash
P=~/Dev/<主题>-concept-video   # 任选工作目录
cp -R "$SKILL_DIR/template" "$P" && cd "$P"
npm i
```

依赖只有 Playwright（驱动浏览器截图）。`render.js` 找不到 Playwright 自带的 Chromium 时，会自动用 `~/Library/Caches/ms-playwright` 里最新的 headless shell。

### 2. 查证事实

科普最怕讲错。脚本里出现的**发布时间、出品方、支持哪些工具、价格、版本号、数字**，先联网查证（WebSearch 搜官方文档或官方公告），查不到的不写。来源链接记进项目 `README.md`，交付时一并告诉用户。工具 logo 从 `assets/logos/` 取，没有的去官网下载 SVG，不要让 AI 画 logo。

### 3. 写分镜（script.js）

先读 `references/writing.md`（选题结构、旁白写法、画面文字规范），再按 `references/scene-types.md` 选场景、填字段。要点：

- 一场只讲一件事，一句旁白对应画面上一个元素的出现。
- `say` 里默认**每句开头出现下一个元素**；一句里要出多个元素，用 `|` 标在对应的字前面；某句不出元素写 `{ text, beat: false }`。
- 画面文字用 `**关键词**` 打马克笔高亮，`==词==` 标强调色。
- 英文术语、数字要换读法时写 `{ text: '字幕写法', read: '朗读写法' }`。

### 4. 先看排版，再花钱配音

```bash
node plan.js --dry && node audio.js && node render.js --still auto
```

读 `out/contact.png`（每场出齐后的样子）。`render.js` 会列出超出内容区的元素并以非 0 退出，先把字改短或换场景类型，**有溢出不出片**。横竖屏都要交付时，把 `format` 改成 `portrait` 再跑一遍 `--still auto`。

### 5. 配音定节奏

```bash
node plan.js --check      # 首次全部合成；之后只重合成改过的句子
node audio.js
node render.js --still auto
```

`plan.js` 打印节奏表（每场起止与旁白）和注意事项（字幕过长、AI 回复打不完、命令没敲完）。`--check` 用 whisper-1 回听，英文术语常被听成同音词（Skill → scale、Claude → Cloud），「可疑」的先判断是不是同音再决定改不改。

再抽几个时刻看字幕与中间态：`node render.js --still 3.2,15.6,40`。

### 6. 出片与交付

```bash
nohup sh -c "node render.js > out/render.log 2>&1; echo exit=\$? >> out/render.log" > /dev/null 2>&1 & disown
```

一分钟视频约 1 分钟出片（60fps、6 个浏览器并行）；超过 5 分钟的任务按上面脱离会话跑，再用 `until grep -q "^exit=" out/render.log; do sleep 20; done` 等结束。

成片复制到 `$OUTPUT_DIR/<主题>-科普讲解-<日期>.mp4`（竖版加 `-竖版`），**先检查同名文件，存在就加 -v2**，不覆盖旧片。交付前用 ffprobe 确认时长、分辨率、音轨，再用 `ffmpeg -af ebur128` 确认整体约 -14 LUFS。

### 7. 改稿

| 改了什么 | 要跑什么 |
|---|---|
| 旁白 | `plan.js --check` → `audio.js` → `render.js`（时间轴变了，画面必须重拍） |
| 只改画面文字 / 样式 | `render.js --still auto` 看一眼 → `render.js` |
| 只改音乐或音量 | `audio.js` → `render.js --mix`（几秒换好音轨） |
| 换音色 / 语速 | 改 `voice` → `plan.js --check-all`（全部重合成） |

## 铁律

1. **旁白决定节奏**：不手写时间。要让画面停久一点，给该场加 `hold: 1.5` 秒，或多写一句旁白。
2. **画面文字不抄旁白**：画面放关键词和结构，旁白负责讲道理。画面上的一整句话，观众读不完。
3. **标题名词化**：场景标题写「Skill 的结构」「按需加载」，不写「一个 Skill 长什么样？」。问题交给旁白去问。开场钩子也用名词短语（「同一句话，两种结果」）。
4. **事实先查证**，工具信息标明出品方；没把握的数字不上画面。
5. **有溢出不出片**，`--still auto` 零溢出才开始全片渲染。
6. **数字写法**：画面和字幕用阿拉伯数字，读法有歧义时用 `read` 写成汉字（`2025 年` → `二零二五年`）。
7. **不编造使用场景的截图**：要展示真实产品界面，用 `image` 场景放真截图；做不到就用 `chat` / `terminal` 场景示意，不伪装成某产品的真界面。
8. **配音接口限流**：MiniMax 按分钟限流，plan.js 并发 4、遇限流自动等 15 秒起步重试；识别通道常报「负载饱和」，回听并发 2，单句失败不影响出片。
9. 画面只由 t 决定：不用 CSS transition / animation、`Date.now()`、`Math.random()`（同 web-frame-video）。
10. 成片不覆盖旧文件；配音缓存在 `out/voice/`，按文本 + 音色 + 语速命名，不要手动删。

## 与其它视频技能的分工

| 技能 | 适合 |
|---|---|
| ai-concept-video（本技能） | 讲概念、讲方法、盘点工具，旁白驱动的知识类视频 |
| web-frame-video | 产品宣传片、功能演示：仿真产品界面 + 鼠标操作，音乐驱动 |
| short-video / video-gen | AI 生成画面的短视频，文字不可控 |
