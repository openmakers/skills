# OpenMakers Skills

Agent skills for Claude Code and other agent CLIs. Each top-level directory is one self-contained skill: a `SKILL.md` plus whatever references and scripts it needs. Drop a directory into your agent's skills folder and it becomes available. Documentation is written in Chinese.

面向 Claude Code 等 Agent 命令行工具的技能（skill）集合。每个顶层目录就是一个独立技能，复制到本地技能目录即可使用。

## 什么是技能

技能是一份写给 AI 的作业指导书。它不是提示词模板，而是把一套做事流程固化下来：什么时候该用、按什么顺序做、每一步的质量标准是什么、做完产出什么。AI 读到用户的需求与技能描述匹配时自动加载，按里面的流程执行。

技能的结构是三层渐进加载的：

| 层 | 内容 | 何时进入上下文 |
|---|---|---|
| 元信息 | `SKILL.md` 的 name 与 description | 始终 |
| 主流程 | `SKILL.md` 正文 | 技能被触发时 |
| 参考资料 | `references/`、`scripts/` | 需要用到时才读 |

## 技能清单

| 技能 | 作用 | 触发场景 |
|---|---|---|
| [code-coach](code-coach/) | 代码教练：把任意代码仓库讲给开发者听 | 接手陌生项目、给新人做入职讲解、读懂开源仓库、面试前突击理解一个代码库 |
| [web-frame-video](web-frame-video/) | 网页逐帧视频：把产品介绍、功能演示、知识点漫画讲解写成网页，逐帧截图出 MP4 | 产品宣传片、功能演示视频、发布预告、漫画风知识讲解、给视频配音加字幕 |
| [ai-concept-video](ai-concept-video/) | AI 科普讲解视频：只写分镜脚本，配音决定节奏，自动排画面与字幕 | 讲清一个 AI 概念（Skill、MCP、Agent 等）、教一套 AI 方法、盘点一批 AI 工具 |
| [podcast-video](podcast-video/) | 播客样式解读视频：两位主持人一问一答，竖屏音频海报画面，声波跟着真实人声起伏 | 读书播客、书籍 / 文章解读、双人对谈视频、听书短视频 |

## 安装

克隆之后把需要的技能目录复制到本地技能目录：

```bash
git clone https://github.com/openmakers/skills.git
cp -r skills/code-coach ~/.claude/skills/
```

不同工具的技能目录：

| 工具 | 目录 |
|---|---|
| Claude Code（用户级） | `~/.claude/skills/` |
| Claude Code（项目级） | `<项目>/.claude/skills/` |
| Codex | `~/.codex/skills/` |
| Antigravity / Gemini | `~/.gemini/config/skills/` |

项目级安装只在该仓库内生效，适合把技能随仓库一起分发给团队。

## code-coach 代码教练

给开发者讲清楚一个代码仓库：技术栈、目录地图、前后端架构、一条功能从点击到落库的全链路、开发规范、`CLAUDE.md` 与 `AGENTS.md` 等 AI 协作配置、踩坑清单、分阶段学习路径。可以只在对话里讲，也可以产出一份《代码讲解手册》存档。

安装后直接说「讲解这个仓库」「带我熟悉这个项目」「解读一下这个项目的 CLAUDE.md」「给我一条学习路径」即可触发。

它和让 AI 随口介绍一个项目的区别在四条硬约束：

**先扫描，再开口。** 内置 `scripts/repo_scan.sh` 先采集十二类确定性事实：语言构成、依赖清单、目录地图、工程化配置、AI 协作配置、测试分布、近半年变更热点、最大文件、环境变量名、入口文件。没跑过扫描不准下架构判断，看见 React 就说「典型 React 项目」属于编造。

**每个论断都要能指到文件。** 讲解中的事实句必须带可点链接指向具体文件与行号，指不到的要明说是推测。

**变更热点优先于目录树。** 一个上千文件的仓库，近半年真正在动的通常不到四十个，那才是项目当下的核心。技能从热点文件切入，而不是从目录树顺序讲。

**AI 协作配置不复述，要翻译。** 逐条把 `CLAUDE.md` 的规则翻译成「它在防什么坑」，并抽查代码验证规则是否已经漂移，输出「现行有效 / 已漂移 / 已失效」三档表。仓库里没有这类配置的，反过来给一份建议写入的初始条目清单。

### 结构

```
code-coach/
├── SKILL.md                          主流程：确认听众 → 事实扫描 → 全景 → 章节菜单 → 深讲 → 存档
├── scripts/repo_scan.sh              仓库事实扫描，输出十二节，密钥自动打码
└── references/
    ├── recon-playbook.md             探查手法，按技术栈分支；追全链路的六步法
    ├── manual-template.md            《代码讲解手册》十二章骨架与质量标准
    ├── ai-config-guide.md            CLAUDE.md / AGENTS.md / 技能 / MCP 的解读法与漂移检测
    ├── learning-path.md              四阶段学习路径与练习出题规矩
    └── teaching-style.md             讲解深度分级、类比与反面例子的用法
```

### 单独用扫描脚本

脚本本身不依赖 AI，可以单独跑，用来快速摸底一个陌生仓库：

```bash
bash code-coach/scripts/repo_scan.sh <仓库路径> --months 6
```

只读，不修改目标仓库。输出中凡是 `sk-`、`sbp_`、`ghp_`、`eyJ` 开头的长串凭据一律打码，`.env` 只列变量名不列值。

## web-frame-video 网页逐帧视频

视频不是剪出来的，是网页一帧一帧拍出来的。整段视频写成一个 HTML 页面，核心是一个 `seek(t)` 函数：给它一个时间，它把画面里每个元素摆到这一刻该在的位置。Playwright 驱动无头 Chrome 按 60fps 逐帧截图（两倍分辨率再缩小），ffmpeg 编码；背景音乐与点击声、打字声、转场声全部用代码合成，时间点和画面来自同一条时间轴，天然对齐。

适合文字必须百分之百准确、要随时改字重出的视频：画面里是仿真的产品界面（鼠标移动点击、下拉选择、打字、AI 流式写入、出图揭晓），中文不会错字。45 秒的片子共 2700 帧，6 个浏览器并行，约 45 秒出片。

可选中文配音：MiniMax Speech 2.8 HD 逐句合成，按句子时长出字幕，人声处自动压低音乐；改配音不必重拍画面，几秒换好音轨。

`template/` 是一支 45 秒产品介绍片的完整源码，`references/` 里有场景套路、音频配方、漫画风讲解做法和配音说明。

## ai-concept-video AI 科普讲解视频

在 web-frame-video 的基础上做的知识讲解版，节奏由旁白决定：只写一份分镜脚本 `script.js`，每一场选一种讲解场景、写画面文字和旁白。`plan.js` 先把旁白逐句配音，拿每句的真实时长排出整条时间轴：哪一秒切场、哪个元素在哪个字念到时出现、字幕怎么切。改一句旁白，只重新合成那一句，整片节奏自动重排。

- 13 种讲解场景：开场钩子、术语卡、类比、对比、结构树、步骤、要点、对话演示、终端演示、工具卡、金句、大图、收尾
- 米白纸面、深色两套主题；横屏 16:9 与竖屏 9:16 用同一份脚本
- `node render.js --still auto` 每场截一张样图拼成总览，并自动检查有没有文字超出画面，有溢出不出片
- 配音后可用语音识别逐句回听，标出错读漏读

`template/` 是「什么是 Skill」的完整源码（11 场、26 句旁白、约 130 秒）。

## podcast-video 播客样式解读视频

把一本书、一篇文章或一个观点做成两个人聊天的播客视频。只写一份对白（谁说、说什么、哪一章、要点卡挂在哪句），`tts.js` 用两个音色逐句配音，按真实时长把句子首尾接起来，同时算出每句的音量包络；画面和配乐都从这份结果里取时间，改一句台词只需重新配音。

- 竖屏音频海报：模糊封面做背景、封面卡缓慢推近、声波按真实人声起伏、说话人头像高亮、字幕逐字点亮
- 分章贴纸与要点卡挂在具体台词上，随对话弹出
- 代码合成 Lo-fi 配乐，有人说话时自动压低；换章轻铃、要点卡提示音
- `references/script.md` 讲双人对白怎么写：角色分工、每章节奏、字数估算、要点卡挑法

`template/` 是《原子习惯》解读样片的完整源码（19 句对白、6 章、约 86 秒）。字体不随仓库分发，按 `SKILL.md` 从 Google Fonts 下载。

### 三个视频技能的依赖

- Node 18+、ffmpeg（含 ffprobe），`npm i` 安装 Playwright
- 配音走 OpenAI 兼容的 `/v1/audio/speech` 接口，模型 `speech-2.8-hd`：设置 `TTS_BASE_URL` 与 `TTS_API_KEY`。不配音可以跳过
- 成片目录读 `VIDEO_OUTPUT_DIR`，默认 `~/Movies/ai-video`

模板里的 AI 产品 logo 来自开源图标库，商标归各自公司所有，仅用于示例画面。

## 贡献

欢迎提 Issue 和 PR。新增技能请保证：`SKILL.md` 有可被严格 YAML 解析的 frontmatter（name 与 description 必填，description 要写清什么时候该触发）；主流程控制在五百行以内，更长的内容拆进 `references/`；技能不写入用户数据、不打印凭据、不做未经确认的破坏性操作。

## License

MIT
