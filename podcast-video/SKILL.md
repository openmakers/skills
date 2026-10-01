---
name: podcast-video
description: 做「播客样式」的解读视频（音频海报式）：两位主持人一问一答聊一本书、一篇文章、一个观点，画面是竖屏音频海报——模糊封面做背景、封面卡缓慢推近、声波按真实人声起伏、说话人头像高亮、字幕逐字点亮、分章贴纸与要点卡随台词弹出。只写一份对白脚本，MiniMax 双音色逐句配音后按真实时长自动排时间，代码合成 Lo-fi 配乐并在人声处自动压低，网页逐帧截图出 MP4。当用户说「播客视频」「播客样式解读」「做成播客」「双人对谈视频」「两个人聊这本书」「读书播客」「书籍解读视频」「音频海报」「audiogram」「把这篇文章做成播客」「听书视频」时使用，即使用户只说「用对话的方式讲讲这本书」也应触发。区别于 web-frame-video（单人旁白 + 手绘 / 产品画面讲解）和 ai-concept-video（AI 概念科普分镜）。
---

# 播客样式解读视频（podcast-video）

一期节目 = 一份对白脚本 + 一张封面。脚本写在 `timeline.js`，`tts.js` 用两个音色逐句合成，句子按真实时长首尾相接，时间、声波包络一起写进 `voice.js`；画面和配乐都只读 `voice.js`，所以**改台词只需重跑配音，画面和音乐自动跟上**。

样片：《原子习惯》解读，竖屏 1080×1920，86 秒，19 句对白、6 章；`template/` 就是它的完整源码。截图加编码约 2 分钟。

画面机制沿用 web-frame-video：页面只由时间 t 决定（`seek(t)`），Playwright 逐帧截图，ffmpeg 编码。那边的铁律在这里同样成立，不再重复。

## 常量

```bash
SKILL_DIR="$HOME/.claude/skills/podcast-video"
OUTPUT_DIR="${VIDEO_OUTPUT_DIR:-$HOME/Movies/ai-video}"
```

依赖：Node 18+、ffmpeg（含 ffprobe）、环境变量 `TTS_BASE_URL` 与 `TTS_API_KEY`（任何提供 MiniMax `speech-2.8-hd` 的 OpenAI 兼容服务）。

## 画面结构（竖屏 1080×1920）

| 区域 | 位置 | 内容 |
|---|---|---|
| 背景 | 满屏 | 封面预先模糊成小图（只算一次）+ 由上到下压暗，随时间缓慢漂移 |
| 顶栏 | y 84 | 左：麦克风图标 + 节目名；右：期数 |
| 封面卡 | 840×840，y 200–1040 | 圆角 34 + 大投影，图片缓慢推近 9% |
| 分章贴纸 | 封面左上角 | 「02 目标与系统」，换章时从左滑入 |
| 要点卡 | 封面底边居中 | 白底大字（公式、口诀、四字词），指定台词开口时弹出，留到下一张或本章结束 |
| 书名 / 作者 | y 1066 / 1206 | 书名用马善政毛笔楷书，作者一行灰字 |
| 声波 | y 1272–1422 | 42 根圆角柱，高度 = 当前说话人的真实音量包络 × 中间高两边低的轮廓 × 确定性抖动，颜色交替用说话人主色 |
| 说话人 | y 1452 | 左右两个头像卡，说话的一方亮起、放大 5%，头像外圈随音量扩散 |
| 字幕 | y 1580 | 说话人名（主色）+ 54px 正文，最多两行，逐字点亮；`text-wrap: balance` 防孤字 |
| 进度条 | y 1812 | 白色进度 + 分章刻度 + 当前 / 总时长 |

## 文件分工

| 文件 | 作用 |
|---|---|
| `timeline.js` | **唯一需要写的文件**：节目名、书名、封面路径、两位主持人（名字、身份、音色、语速、主色）、分章（标题、从哪句开始、要点卡挂在哪句）、对白（谁说、说什么、额外停顿） |
| `tts.js` | 逐句合成（按文本 + 音色 + 语速缓存），首句在 `lead` 秒开口、换人停 0.28 秒、同一人停 0.18 秒，再加各句的 `gap`；算每秒 30 帧的音量包络；拼 `out/voice.wav`，写 `voice.js`；`--check` 用 whisper 回听比对 |
| `voice.js` | tts.js 生成：每句 who / at / dur / text / env，以及对白结束时刻 end |
| `scenes.js` | 画面：背景、封面、分章、要点卡、声波、说话人、字幕、进度条，全部从 voice.js 取时间 |
| `audio.js` | Lo-fi 配乐（82 BPM，Fmaj7–Em7–Dm7–Cmaj7，电钢琴 + 低音 + 轻鼓 + 黑胶底噪）+ 换章轻铃 + 要点卡弹出音；另混一份 `out/preview.wav` 给网页预览 |
| `render.js` | 同 web-frame-video：`--still` 抽静帧、无参数全片、`--mix` 只重混音频；人声统一 -16 LUFS，配乐降到六成并在人声处侧链压低，整片 -14 LUFS |
| `srt.js` | 从 voice.js 导出 srt 字幕 |

## 工作流

### 1. 搭项目

```bash
P=~/Dev/<书名拼音>-podcast
cp -R "$SKILL_DIR/template" "$P" && cd "$P"
npm i                                   # Playwright，用来驱动浏览器截图
```

字体不随模板分发（体积大），从 Google Fonts 官方仓库下到 `assets/`（都是 SIL OFL，可商用）：

```bash
cd assets
curl -sL -o MaShanZheng-Regular.ttf https://github.com/google/fonts/raw/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
curl -sL -o NotoSansSC-Variable.ttf "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
file *.ttf   # 必须是 TrueType Font data
```

GitHub 慢时在命令前加 `HTTPS_PROXY=<代理地址>`。

### 2. 写对白 → 改 timeline.js

先读 `references/script.md`（双人对白怎么写、时长怎么估、要点卡怎么挑），再动笔。要点：

- **a 是听众代言人**（提问、复述、表示惊讶、帮忙总结），**b 是讲解人**（给观点、给例子）。不要两个人轮流念稿。
- 时长按约 **5.3 字 / 秒** 估：90 秒 ≈ 430 字，3 分钟 ≈ 900 字。
- 每章第一句加 `gap: 0.5`，给换章铃声留气口。
- 数字写成汉字（「三十七倍」「百分之一」），读法才可控；画面上的要点卡再用阿拉伯数字。
- 讲书只概述观点，不大段引用原文；片中出现书名和作者，作者栏注明中译本书名。

### 3. 封面

一张 1:1 的无字插画，放 `assets/cover.jpg`（长边 1600 左右的 jpg 即可，太大拖慢截图）。

- **不要用真实书封**（版权），画一张表达全书核心意象的插画。原子习惯样片：一个人把发光的小方块一块块垒成通向天空的台阶。
- 提示词写明「无任何文字、字母、数字、水印」，上下留呼吸空间（顶部压分章贴纸，底部压要点卡）。
- 暖色、高饱和、有明暗对比的图做背景模糊效果最好；灰暗的图模糊后会脏。
- 用任意生图工具出图，比例 1:1；提示词留档，下一期换书时照着改。

### 4. 配音

```bash
node tts.js            # 打印每句开始时间、时长、全片时长
node tts.js --check    # 可选：whisper 回听，比对不到 85% 标「可疑」
```

改了哪句只重合成哪句。时长超了就删句子或压短 b 的长句，不要调快语速（超过 1.1 听着赶）。

### 5. 配乐与静帧检查 →【确认门】

```bash
node audio.js
node render.js --still 4,15,36,62,70       # 挑开场、每章一个要点卡出现后的时刻
```

竖屏静帧用 ffmpeg 横拼成一排审阅：

```bash
cd out && ffmpeg -loglevel error -y $(for t in 4.00 15.00 36.00 62.00 70.00; do printf -- "-i still-$t.png "; done) \
  -filter_complex "$(for i in 0 1 2 3 4; do printf "[$i]scale=360:640[v$i];"; done)[v0][v1][v2][v3][v4]hstack=5" row.png
```

检查：要点卡是否压住封面主体、字幕有没有孤字或第三行、分章贴纸文字是否完整、声波在说话时是否明显起伏。

### 6. 出片与验收

```bash
node render.js         # 全片，约 2 分钟；超过 5 分钟的长节目用 nohup 脱离会话跑
node srt.js out/<名字>.srt
```

验收：`ffprobe` 帧数 = 时长 × 60、有 aac 音轨；`ffmpeg -af ebur128` 整片约 -14 LUFS。成片复制到 `$OUTPUT_DIR`，文件名带日期，已存在加 `-v2`，不覆盖。

## 可调项

| 想改 | 改哪里 |
|---|---|
| 主持人名字、身份、音色、语速、主色 | `timeline.js` 的 `cast` |
| 片头先走多久音乐 / 片尾留多久 | `lead` / `tail` |
| 配乐风格、速度 | `audio.js` 顶部和弦表 `CH`、`TL.bpm`（默认 82） |
| 字幕字号、每页字数 | `index.html` 的 `#cap .tx`；`scenes.js` 分页上限 30 字 |
| 横屏 16:9 | `timeline.js` 宽高改 1920×1080，`index.html` 改成左右结构（封面在左、声波与字幕在右），其余逻辑不变 |

常用音色：`presenter_female`（女主持）、`presenter_male`（男主持）、`female-chengshu`（成熟女声，偏慢）、`male-qn-jingying`（精英青年，偏快）、`Chinese (Mandarin)_News_Anchor`（新闻主播）。两位主持人一男一女、或一快一慢，听感上才分得开。

## 踩坑

1. **时间只从 voice.js 取**：分章、要点卡、字幕、声波、换章铃声都按「挂在哪句台词上」定位，不写绝对秒数。写死秒数的话，改一句台词全片错位。
2. **背景模糊要预先算一次**：`filter: blur(70px)` 写在 CSS 上，每帧位移都会重算模糊，截图慢几倍。模板在初始化时把封面画进一张小 canvas（`ctx.filter = 'blur(28px)'`），之后只做 transform。
3. **声波要用真实包络**：随机跳动的假声波一眼就假，停顿处也在跳。tts.js 解码每句音频算均方根，句间停顿时声波自然落平。
4. **字幕分页按标点切，再交给 `text-wrap: balance`**：只按字数硬切会出现「勾。」这种孤字成行；每页上限 30 字（两行 × 15 字，54px 字号、840px 宽）。
5. **要点卡宽度初始化时自检**：超过 860px 会出封面，模板直接抛错并指出是哪张卡；两行内容用 `<br>`。
6. **毛笔字只给书名**：字幕、贴纸、要点卡全用思源黑体粗体，竖屏小字用毛笔会糊。
7. **竖屏 2 倍截图更吃内存**：6 个浏览器并行在 16GB 机器上没问题；内存紧张时把 render.js 的 `WORKERS` 降到 4。
