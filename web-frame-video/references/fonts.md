# 字体规范（讲解类 / 科普类视频）

结论先行：**标题用有性格的展示字体，正文用干净的黑体**，两者分工，不要全片一种手写体。站酷快乐体只适合低龄向，面向成人或严肃主题（历史、科学、商业）一律不用。

样例：人类进化史手绘白板视频，从下面五套方案里对比后选定「马善政毛笔 + 思源黑体」。

## 默认搭配（已定稿）

| 用途 | 字体 | 文件（放 `assets/`） | 来源 |
|---|---|---|---|
| 标题（片头片尾、场景标题、人物 / 概念名、强调词） | 马善政毛笔楷书 Ma Shan Zheng | `MaShanZheng-Regular.ttf`（5.9MB） | google/fonts `ofl/mashanzheng/` |
| 正文（要点、年代、字幕、标签、图表数字） | 思源黑体可变字重 Noto Sans SC，用 500 | `NotoSansSC-Variable.ttf`（17MB） | google/fonts `ofl/notosanssc/NotoSansSC[wght].ttf` |
| 拉丁学名 / 英文小字 | EB Garamond 斜体，用 500 | `EBGaramond-Italic.ttf` | google/fonts `ofl/ebgaramond/EBGaramond-Italic[wght].ttf` |

三款都是 SIL OFL 开源协议，可商用。下载（GitHub 访问慢时在命令前加 `HTTPS_PROXY=<代理地址>`）：

```bash
cd assets
curl -sL -o MaShanZheng-Regular.ttf https://github.com/google/fonts/raw/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
curl -sL -o EBGaramond-Italic.ttf "https://github.com/google/fonts/raw/main/ofl/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf"
curl -sL -o NotoSansSC-Variable.ttf "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
file *.ttf   # 必须是 TrueType Font data，不是 HTML 错误页
```

## 接入写法

```css
@font-face { font-family: 'Brush'; src: url('assets/MaShanZheng-Regular.ttf') format('truetype'); }
@font-face { font-family: 'NotoSC'; src: url('assets/NotoSansSC-Variable.ttf') format('truetype'); font-weight: 100 900; }
@font-face { font-family: 'Garamond'; src: url('assets/EBGaramond-Italic.ttf') format('truetype'); font-style: italic; font-weight: 400 800; }
#stage { font-family: 'NotoSC', 'PingFang SC', sans-serif; font-weight: 500; }  /* 全片默认正文 */
.ft { font-family: 'Brush', serif; font-weight: 400; }                            /* 标题元素加 ft 类 */
.latin { font-family: 'Garamond', Georgia, serif; font-style: italic; font-weight: 500; color: #7A7784; }
```

截图前三款都要等到位，缺一款就会量错文字宽度、下划线画短：

```js
await Promise.all([
  document.fonts.load('60px "Brush"'),
  document.fonts.load('500 60px "NotoSC"'),
  document.fonts.load('italic 500 40px "Garamond"'),
]);
await document.fonts.ready;
```

SVG `<text>` 不写 `font-family` 就继承 `#stage` 的正文字体，不用单独设。

## 字号（1920×1080 画布）

毛笔字笔画散、字面偏小，**同等视觉大小要比黑体大一档**：

| 元素 | 字号 |
|---|---|
| 片尾大标题 | 210px |
| 片头大标题 | 176px |
| 人物 / 概念名 | 128px |
| 场景标题（左上角） | 100–110px |
| 强调词（如「约三倍」） | 84px |
| 正文要点 | 48px |
| 年代、标签、地图洲名 | 42–44px |
| 字幕、次要说明 | 40px |
| 拉丁学名 | 40px |

标题下的马克笔下划线画在文字底边下 5–10px（128px 标题 top 176 → 下划线 y≈330）。

## 踩过的坑

- **毛笔字里不要放阿拉伯数字**：「约 3 倍」在马善政里数字很难看，改写成「约三倍」。数字多的内容（年代、毫升数）一律放正文黑体。
- **标题放大后要重查碰撞**：毛笔标题比原字体宽一截，「走出非洲」从 84px 放到 100px 就压到了地图上的南美洲，改成 92px 并上移。每次换字体都要重抽静帧看一遍标题周边。
- **居中标题的写出动画要收窄盒子**：整行宽的 `div` + `text-align:center` 做左到右 `clip-path` 揭示，前 30% 时间都在揭空白，笔在空处划。改用 `left:50%; transform:translateX(-50%)` 让盒子只包住文字。
- **替换而非并存**：换字体后把旧字体文件从 `assets/` 删掉，`grep` 确认 CSS / JS 里没有旧字体名残留。

## 备选方案（给用户选字体时的五套）

让用户挑字体时做一张对比画板，按下面五套各出一张真实画面（站点画面 + 片头片尾）。Google Fonts 上没有的字体先用 fonttools 按全片用字子集化再上传（`pyftsubset in.ttf --text-file=chars.txt --flavor=woff2`，霞鹜文楷 24MB 子集后约 100KB）：

| 方案 | 标题 / 正文 | 气质 | 适合 |
|---|---|---|---|
| 霞鹜文楷 LXGW WenKai | 全片一种 | 手写楷体，温和书卷气 | 和手绘白板最搭，偏温柔 |
| 得意黑 Smiley Sans + 思源黑体 | 斜体标题 / 黑体正文 | 现代利落，有速度感 | 年轻化短视频 |
| 思源宋体 Noto Serif SC | 粗宋 900 / 中宋 600 | 纪录片、博物馆感 | 权威严肃 |
| **马善政毛笔 + 思源黑体**（默认） | 毛笔标题 / 黑体正文 | 历史感、有人味 | 历史、人文、科普 |
| 庆科黄油体 ZCOOL QingKe HuangYou + 思源黑体 | 粗壮标题 / 黑体正文 | 海报感、活泼不幼稚 | 保留趣味的成人向 |

五套全部 OFL 可商用。
