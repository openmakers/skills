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

## 贡献

欢迎提 Issue 和 PR。新增技能请保证：`SKILL.md` 有可被严格 YAML 解析的 frontmatter（name 与 description 必填，description 要写清什么时候该触发）；主流程控制在五百行以内，更长的内容拆进 `references/`；技能不写入用户数据、不打印凭据、不做未经确认的破坏性操作。

## License

MIT
