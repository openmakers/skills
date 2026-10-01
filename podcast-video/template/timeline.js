// 播客解读视频的唯一真源：节目信息、两位主持人、分章对白、每章的要点卡。
// 时间不用手排：tts.js 逐句合成后按真实时长把句子首尾相接，写进 voice.js（每句 at / dur / 声波包络），
// 画面（scenes.js）和配乐（audio.js）都从 voice.js 读时间，所以改一句台词只需重跑 tts.js。
//
// 内容口径：James Clear《Atomic Habits》（中译本《掌控习惯》），只做观点概述，不引用原文段落。
var TL = (function () {
  const V = typeof VOICE !== 'undefined' ? VOICE
    : typeof require !== 'undefined' ? (() => { try { return require('./voice.js'); } catch (e) { return null; } })() : null;

  return {
    width: 1080, height: 1920, fps: 60, output: 'atomic-habits-podcast.mp4',
    lead: 1.6,  // 片头音乐先走多久，第一句才开口
    tail: 3.2,  // 最后一句之后留给收尾音乐的时长
    duration: V && V.end ? +(V.end + 3.2).toFixed(2) : 90,

    show: { name: '好书播客', episode: 'EP.01' },
    book: { title: '原子习惯', author: 'James Clear', note: '中译本《掌控习惯》' },
    cover: 'assets/cover.jpg',

    // 两位主持人：a 负责提问、代表听众，b 负责讲解
    cast: {
      a: { name: '小林', role: '主持', voice: 'presenter_female', speed: 1.08, color: '#E0703A' },
      b: { name: '老周', role: '嘉宾', voice: 'presenter_male', speed: 1.05, color: '#2F8F8A' },
    },

    // 分章：标题出现在封面左上角；keys 是这一章的要点卡，at 指向哪句台词开口时弹出
    chapters: [
      { id: 'c0', title: '开场', from: 'l1' },
      { id: 'c1', title: '复利效应', from: 'l3', keys: [{ at: 'l4', text: '1.01<sup>365</sup> ≈ 37.78' }, { at: 'l6', text: '0.99<sup>365</sup> ≈ 0.03' }] },
      { id: 'c2', title: '目标与系统', from: 'l7', keys: [{ at: 'l8', text: '目标定方向 · 系统定进步' }] },
      { id: 'c3', title: '身份认同', from: 'l10', keys: [{ at: 'l12', text: '每次行动 = 一票' }] },
      { id: 'c4', title: '四大定律', from: 'l13', keys: [{ at: 'l14', text: '显而易见 · 有吸引力<br>简便易行 · 令人愉悦' }, { at: 'l16', text: '跑鞋放门口 · 只跑两分钟' }] },
      { id: 'c5', title: '收尾', from: 'l17', keys: [{ at: 'l18', text: '每天进步 1%' }] },
    ],

    // 对白：gap 是这句开口前额外停顿（秒），默认换人 0.28、同一人 0.18
    lines: [
      { id: 'l1', who: 'a', text: '欢迎收听好书播客。今天聊一本讲习惯的书，《原子习惯》。' },
      { id: 'l2', who: 'b', text: '一句话概括：小习惯，大改变。' },
      { id: 'l3', who: 'a', text: '为什么叫原子习惯？', gap: 0.5 },
      { id: 'l4', who: 'b', text: '原子很小，能量却很大。习惯也一样，每天进步百分之一，一年后是三十七倍。' },
      { id: 'l5', who: 'a', text: '那每天退步百分之一呢？' },
      { id: 'l6', who: 'b', text: '会缩到只剩零点零三。差距，就藏在每天那一点点里。' },
      { id: 'l7', who: 'a', text: '可我立过好多目标，最后都没坚持下来。', gap: 0.5 },
      { id: 'l8', who: 'b', text: '因为目标只管方向。赢家和输家的目标往往一样，真正拉开差距的，是每天运转的系统。' },
      { id: 'l9', who: 'a', text: '所以要少盯结果，多搭系统。' },
      { id: 'l10', who: 'b', text: '还有更深的一层，是身份。别说我要戒烟，要说我不抽烟。', gap: 0.5 },
      { id: 'l11', who: 'a', text: '听起来像在给自己贴标签。' },
      { id: 'l12', who: 'b', text: '没错。你做的每一件小事，都是在为想成为的人投上一票。' },
      { id: 'l13', who: 'a', text: '那具体要怎么做？', gap: 0.5 },
      { id: 'l14', who: 'b', text: '记住四条定律：让它显而易见，有吸引力，简便易行，令人愉悦。' },
      { id: 'l15', who: 'a', text: '能举个例子吗？' },
      { id: 'l16', who: 'b', text: '想跑步，就把跑鞋放在门口；只在跑步时听喜欢的节目；先只跑两分钟；跑完在日历上打个勾。' },
      { id: 'l17', who: 'a', text: '原来改变可以这么小。', gap: 0.5 },
      { id: 'l18', who: 'b', text: '从今天起，每天进步百分之一。' },
      { id: 'l19', who: 'a', text: '我们下期见。' },
    ],
  };
})();

if (typeof module !== 'undefined') module.exports = TL;
