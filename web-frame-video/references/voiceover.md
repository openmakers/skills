# 配音参考

## 选型结论（2026-09-23）

| 方案 | 结论 |
|---|---|
| **MiniMax Speech 2.8 HD**（`speech-2.8-hd`） | **默认**。两个 TTS 盲听榜第一，中文自然度最好；OpenAI 兼容接口直接可用，现成 key |
| MiniMax Speech 2.8 Turbo（`speech-2.8-turbo`） | 同音色更快更便宜，赶时间或长稿时用，把 `model` 换掉即可 |
| Qwen-Audio 3.0 TTS Plus（ZenMux） | 榜上同样靠前，但 2026-09-23 实测 ZenMux 调用报 `cosyvoice Engine error 411`，暂不可用 |
| OpenAI gpt-4o-mini-tts（apilio） | 接口可用，中文音质未实测，只作兜底 |

接口：`POST <TTS_BASE_URL>/v1/audio/speech`（作者用 apilio 中转，默认 `https://api.apilio.ai`），`{ model, input, voice, speed }`，返回 32kHz 单声道 mp3。`speed` 生效（1.2 约快 10%），`response_format: wav` 不支持，情绪参数在这个接口上看不出效果。MiniMax 原生接口 `/minimax/v1/t2a_v2`（带字幕时间戳）在 apilio 上 2.8 HD 未开价，不用。

## 已验证可用的音色

以下音色用同一句话逐个试听过。

| voice | 说明 |
|---|---|
| `presenter_female` | 女主持人，产品介绍默认 |
| `presenter_male` | 男主持人 |
| `male-qn-jingying` | 精英青年男声，节奏偏快 |
| `female-chengshu` | 成熟女声，偏慢 |
| `female-yujie` | 御姐，停顿长，同一句比别的音色慢近一倍，不适合快节奏 |
| `Chinese (Mandarin)_Reliable_Executive` | 沉稳高管 |
| `Chinese (Mandarin)_News_Anchor` | 新闻主播 |
| `Chinese (Mandarin)_Warm_Bestie` | 温暖闺蜜 |

## 写稿节奏

- 实测 `presenter_female` speed 1.05：约 **4.5–5 字/秒**（标点处有自然停顿）。一场 6 秒的画面，旁白 18–22 字刚好。
- 一场一句，句子开头比画面动作晚 0.3–0.6 秒；最后一句要在片尾前 0.3 秒说完。
- 数字写汉字（「三十秒」「十万张」），读法可控；英文缩写「PPT」「AI」实测回听识别无误。
- 旁白说画面的「意义」，不重复画面上的字：画面写「300+ 图片类型」，旁白说「三百多种图片类型，五十种视觉风格，自由搭配」。

## 回听校对

`node tts.js --check` 用 apilio 的 `whisper-1` 识别（`gpt-4o-transcribe` 在该通道常报负载饱和）。必须带 prompt「以下是一段简体中文普通话。」，否则输出繁体导致全部误报；识别结果里的阿拉伯数字会转回汉字再比对。同音词会误报（一图 → 意图、胜千言 → 圣签言），看到「可疑」先判断是不是同音。
