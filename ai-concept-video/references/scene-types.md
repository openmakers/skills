# 场景类型

每一场是 `scenes` 数组里的一个对象：`type` 选下面一种，填对应字段，再写旁白 `say`。

## 通用字段

| 字段 | 说明 |
|---|---|
| `type` | 场景类型，必填 |
| `say` | 旁白数组。每项是字符串，或 `{ text, read, beat, pause, voice, speed }` |
| `title` | 场景标题，名词短语（hook / quote / outro 不显示标题） |
| `tag` | 标题上方的小标签，不写时按类型给默认值（概念 / 打个比方 / 对比 / 结构 / 步骤 / 要点 / 实操 / 工具）；写 `tag: ''` 不显示 |
| `hold` | 旁白说完后多停几秒，默认 0 |
| `lead` | 场首多留几秒再开口，默认 0 |
| `dur` | 没有旁白时的场景时长 |

`say` 的单项字段：

| 字段 | 说明 |
|---|---|
| `text` | 字幕与画面节奏用的文字。`\|` 标出元素出现的位置 |
| `read` | 朗读用的文字（英文缩写、年份、符号换读法），不写就读 `text` |
| `beat: false` | 这句开头不出元素（铺垫句） |
| `pause` | 这句说完多停几秒 |
| `voice` / `speed` | 这一句单独换音色或语速 |

**元素出现规则**：每场的「出现单元」按顺序对应「出现时刻」。出现时刻 = 每句开头（除非 `beat: false`）+ 每个 `|` 的位置。时刻比单元多，多的忽略；时刻比单元少，剩下的单元在最后一个时刻到旁白结束之间均匀补齐。

文字里 `**词**` 渲染成马克笔高亮（元素出现后 0.3 秒扫过），`==词==` 渲染成强调色，`\n` 换行。

---

## hook 开场钩子

片头第一场。大标题从模糊中浮现，伴随低频重音。

```js
{ type: 'hook', title: '同一句话，两种结果', sub: '差别在一个词：**Skill**',
  say: ['同样一句话交给 AI，为什么别人的 AI 做得又快又好？', '答案往往就藏在一个词里：Skill。'] }
```

单元：标题、副标题。标题 8–14 字，用名词短语；问题写在旁白里。

## term 术语卡

给一个概念下定义：左图标、右边术语名 + 中文叫法 + 一句话定义。

```js
{ type: 'term', icon: 'book', term: 'Skill', alias: '技能包', def: '写给 AI 的一份**操作手册**\n教它把一类事情做对',
  say: ['Skill，中文常叫它技能包。', '它是一份写给 AI 的操作手册，专门教它把某一类事情做对。'] }
```

单元：术语（连同图标、中文名、横线）、定义。定义不超过两行、每行 14 字以内。

## metaphor 类比

两张卡片 + 中间符号 + 一句结论，把陌生概念挂到熟悉的东西上。

```js
{ type: 'metaphor',
  left: { icon: 'avatar-sky', label: '大模型', note: '聪明，但不懂你的规矩' },
  sign: '+',   // 默认 ≈，也可以是 → 或 ×
  right: { icon: 'notebook', label: 'Skill', note: '流程、模板、注意事项' },
  caption: '= 上手就能干活的**老员工**',
  say: ['打个比方……新员工……', 'Skill 就是……岗位手册。', '两样合在一起……老员工。'] }
```

单元：左卡、右卡（连同符号）、结论。

## compare 对比

左灰右亮两栏，左边是旧做法，右边是新做法。

```js
{ type: 'compare', title: '提示词与 Skill',
  left: { title: '每次写提示词', items: ['每次从头交代', '说漏一句就跑偏', '换个人效果就变'] },
  right: { title: '装一个 Skill', items: ['写一次，反复用', '步骤和标准固定', '整个团队共用'] },
  say: ['没有 Skill 的时候……', '有了 Skill……'] }
```

单元：左栏、右栏（栏内条目依次滑入）。每栏 2–4 条，每条 10 字以内，两栏条数一致。

## layers 结构树

文件夹结构、系统组成、概念层级。`depth` 0 / 1 / 2 控制缩进。

```js
{ type: 'layers', title: 'Skill 的结构',
  rows: [
    { name: 'my-skill/', desc: '一个普通的文件夹', depth: 0 },
    { name: 'SKILL.md', desc: '名字、什么时候用、怎么做', depth: 1 },
    { name: 'scripts/', desc: '能直接运行的脚本', depth: 1 },
  ],
  say: ['……就是一个文件夹。', '核心是一份……说明书……', '旁边还可以放脚本，|和……参考资料。'] }
```

单元：每一行。`name` 默认等宽字体，写中文层级名时加 `mono: false`。最多 5 行。

## steps 步骤

横向流程（竖屏自动改成纵向），带编号与箭头。

```js
{ type: 'steps', title: '按需加载',
  steps: [{ title: '只记目录', desc: '平时只记住名字和一句话用途' }, { title: '对上再翻开', desc: '……' }, { title: '用到才拿', desc: '……' }],
  say: [{ text: 'AI 用 Skill 的方式很聪明。', beat: false }, '平时……', '遇到对口的任务……', '脚本和资料……'] }
```

单元：每一步（箭头提前 0.3 秒画出）。3–4 步，超过 4 步拆两场。

## list 要点

编号或图标 + 一句话，适合「三个要点」「四个误区」。

```js
{ type: 'list', title: '写好 Skill 的三个要点',
  items: [{ icon: 'bulb', text: '说清**什么时候用**' }, { icon: 'revise', text: '步骤写成**能照做的清单**' }, '踩过的坑随手补进去'],
  say: [{ text: '想自己写一个，记住三点：|一句话说清什么时候用；', beat: false }, '步骤写成……', '每次踩了坑……'] }
```

单元：每一条。条目写字符串时显示 01 / 02 编号，写 `{ icon, text }` 时显示图标。3–5 条。

## chat 对话演示

一个通用的 AI 对话窗口：用户消息整条弹出，AI 回复先显示「正在输入」再逐字流出。

```js
{ type: 'chat', title: '一句话调用', app: 'Claude', aiName: 'AI',
  messages: [{ role: 'user', text: '把这篇讲稿做成一支两分钟的科普视频' }, { role: 'ai', text: '好的，我按「科普视频」这个 Skill 来……' }],
  say: ['用的时候……说一句要做什么就行。', 'AI 会自己认出……'] }
```

单元：每条消息。AI 回复的流速自动算，保证下一条出现前写完（每秒 12 字起），太长会在节奏表下方提示。窗口是示意，不仿某个产品的真界面。

## terminal 终端演示

深色终端，命令逐字敲出（带敲键声），0.25 秒后出结果。

```js
{ type: 'terminal', title: '安装方式', app: '终端',
  cmds: [{ cmd: 'cp -r my-skill ~/.claude/skills/' }, { cmd: 'ls ~/.claude/skills', out: 'my-skill   web-frame-video' }],
  say: ['装一个 Skill，就是把文件夹放进指定目录。', '放进去，AI 下次打开就认得它。'] }
```

单元：每条命令。每秒敲 18 个字符，命令控制在 40 字符内；`out` 可多行（`\n`）。

## tools 工具卡

一排工具卡：logo、名称、出品方、一句话用途、标签。横屏最多 4 列，竖屏 2 列。

```js
{ type: 'tools', title: '支持 Skill 的工具',
  tools: [
    { logo: 'claude-color.svg', name: 'Claude', by: 'Anthropic', desc: '网页版、桌面端、Claude Code', tag: '最早推出' },
    { logo: 'openai.svg', name: 'Codex', by: 'OpenAI', desc: '编程智能体', tag: '已支持' },
    { icon: 'wand', name: '某个没有 logo 的工具', desc: '……' },
  ],
  say: ['……Anthropic 推出……', '现在 Codex、|Gemini CLI、|Cursor 这些工具……'] }
```

单元：每张卡。`logo` 写 `assets/logos/` 下的文件名或完整相对路径，没有 logo 用 `icon`。超过 4 个拆两场，或改用 list。工具信息必须查证。

## quote 金句

一句总结，居中大字，上方一道强调色短线。

```js
{ type: 'quote', text: '提示词解决一次\n**Skill 解决一类**', by: '',
  say: ['记住这一句：提示词解决一次问题，Skill 解决一类问题。'] }
```

单元：整句（短线、金句、署名依次出现）。两行以内，每行 10 字以内。不加引号装饰。

## image 大图

整幅配图或真实截图，缓慢推近，可带说明条。

```js
{ type: 'image', src: 'assets/shots/claude-skills.png', caption: 'Claude 设置里的 Skills 页面', say: ['……'] }
```

单元：图、说明。配图用 AI 生图出（16:9 或 9:16，与视频同比例），图上不要让 AI 写字，文字用 caption 或上一场的标题承载。真截图放 `assets/shots/`。

## outro 收尾

品牌 / 栏目名 + 一句行动建议 + 按钮样式的号召语，品牌出现时有重音。

```js
{ type: 'outro', brand: 'AI 小课堂', sub: '把你最拿手的一件事，写成一个 Skill', cta: '关注，一起学 AI',
  say: ['今天就试试，把你最拿手的一件事，写成一个 Skill。'] }
```

单元：品牌、副句、号召语。不承诺「下一期」内容，除非用户确认过。

---

## 图标 key

`assets/icons/` 里的扁平插画图标（来自 MakerOS 通用图标库）：

| key | 适合 |
|---|---|
| book、notebook、scroll | 手册、文档、知识 |
| bulb | 想法、要点、原理 |
| wand | 自动化、魔法、一键 |
| pen、quill、revise | 写作、修改、清单 |
| chat、bubble | 对话、提问 |
| chart | 数据、效果 |
| calendar | 计划、时间 |
| mic、megaphone | 语音、宣传 |
| clapper、easel | 视频、演示 |
| envelope | 通知、邮件 |
| wechat、xhs | 公众号、小红书 |
| avatar-sky / -mint / -rose / -apricot / -aqua / -blossom / -citron / -lime / -orchid / -periwinkle | 人物（新员工、用户、老师） |

需要别的物件时，按同一风格（扁平插画、粉彩底铺满整格、无 3D 与白底）用生图工具出一张，压成 512 WebP 放进 `assets/icons/`。
