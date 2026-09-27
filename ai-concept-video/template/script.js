// 分镜脚本：这是唯一需要手写的文件。改完跑 node plan.js，画面节奏会按配音重新排。
// 场景类型与字段见 SKILL 的 references/scene-types.md，写法见 references/writing.md。
//   say    旁白，一句一个字符串。默认每句开头出现下一个元素；一句里要出多个元素，用 | 标出位置
//   **x**  画面上的马克笔高亮；==x== 强调色
//   read   旁白里某句要换一种读法时用 { text: '字幕写法', read: '朗读写法' }
module.exports = {
  title: '什么是 Skill',
  series: 'AI 小课堂',
  theme: 'paper', // paper 米白纸面 | night 深色
  format: 'landscape', // landscape 1920×1080 | portrait 1080×1920
  output: 'ai-concept-skill.mp4',
  voice: { voice: 'presenter_female', speed: 1.05 }, // 不要配音写 voice: false

  scenes: [
    {
      type: 'hook',
      title: '同一句话，两种结果',
      sub: '差别在一个词：**Skill**',
      say: ['同样一句话交给 AI，为什么别人的 AI 做得又快又好？', '答案往往就藏在一个词里：Skill。'],
    },
    {
      type: 'term',
      icon: 'book',
      term: 'Skill',
      alias: '技能包',
      def: '写给 AI 的一份**操作手册**\n教它把一类事情做对',
      say: ['Skill，中文常叫它技能包。', '它是一份写给 AI 的操作手册，专门教它把某一类事情做对。'],
    },
    {
      type: 'metaphor',
      left: { icon: 'avatar-sky', label: '大模型', note: '聪明，但不懂你的规矩' },
      sign: '+',
      right: { icon: 'notebook', label: 'Skill', note: '流程、模板、注意事项' },
      caption: '= 上手就能干活的**老员工**',
      say: [
        '打个比方，大模型像一个聪明的新员工，懂得很多，但不懂你们的规矩。',
        'Skill 就是交到它手里的岗位手册。',
        '两样合在一起，就成了上手就能干活的老员工。',
      ],
    },
    {
      type: 'compare',
      title: '提示词与 Skill',
      left: { title: '每次写提示词', items: ['每次从头交代', '说漏一句就跑偏', '换个人效果就变'] },
      right: { title: '装一个 Skill', items: ['写一次，反复用', '步骤和标准固定', '整个团队共用'] },
      say: [
        '没有 Skill 的时候，每次都得从头交代，说漏一句，结果就跑偏。',
        '有了 Skill，写一次就能反复用，整个团队拿到的都是同一套标准。',
      ],
    },
    {
      type: 'layers',
      title: 'Skill 的结构',
      rows: [
        { name: 'my-skill/', desc: '一个普通的文件夹', depth: 0 },
        { name: 'SKILL.md', desc: '名字、什么时候用、怎么做', depth: 1 },
        { name: 'scripts/', desc: '能直接运行的脚本', depth: 1 },
        { name: 'references/', desc: '用到时才翻的参考资料', depth: 1 },
      ],
      say: [
        '它的样子很朴素，就是一个文件夹。',
        { text: '核心是一份叫 SKILL.md 的说明书，写着它叫什么、什么时候用、怎么做。', read: '核心是一份叫 SKILL 点 MD 的说明书，写着它叫什么、什么时候用、怎么做。' },
        '旁边还可以放脚本，|和需要时才翻的参考资料。',
      ],
    },
    {
      type: 'steps',
      title: '按需加载',
      steps: [
        { title: '只记目录', desc: '平时只记住名字和一句话用途' },
        { title: '对上再翻开', desc: '任务对口，才读完整说明书' },
        { title: '用到才拿', desc: '脚本和资料按需调用' },
      ],
      say: [
        { text: 'AI 用 Skill 的方式很聪明。', beat: false },
        '平时，它只记住每个技能的名字和一句话用途；',
        '遇到对口的任务，才把整本说明书翻开；',
        '脚本和资料，用到的时候再拿。',
        '所以装上几十个 Skill，也不会把 AI 的脑子塞满。',
      ],
    },
    {
      type: 'chat',
      title: '一句话调用',
      app: 'Claude',
      messages: [
        { role: 'user', text: '把这篇讲稿做成一支两分钟的科普视频' },
        { role: 'ai', text: '好的，我按「科普视频」这个 Skill 来：先拆分镜，再配音，最后逐帧出片。' },
      ],
      say: [
        '用的时候，你不需要记任何命令，说一句要做什么就行。',
        'AI 会自己认出该用哪个 Skill，照着手册一步步做完。',
      ],
    },
    {
      type: 'tools',
      title: '支持 Skill 的工具',
      tools: [
        { logo: 'claude-color.svg', name: 'Claude', by: 'Anthropic', desc: '网页版、桌面端、Claude Code', tag: '最早推出' },
        { logo: 'openai.svg', name: 'Codex', by: 'OpenAI', desc: '编程智能体', tag: '已支持' },
        { logo: 'gemini-color.svg', name: 'Gemini CLI', by: 'Google', desc: '命令行智能体', tag: '已支持' },
        { logo: 'cursor.svg', name: 'Cursor', by: 'Anysphere', desc: 'AI 编程编辑器', tag: '已支持' },
      ],
      say: [
        { text: 'Skill 最早由 Anthropic 推出，2025 年底成了一个开放标准。', read: 'Skill 最早由 Anthropic 推出，二零二五年底成了一个开放标准。' },
        '现在 Codex、|Gemini CLI、|Cursor 这些工具，都能用同一个 Skill 文件夹。',
      ],
    },
    {
      type: 'list',
      title: '写好 Skill 的三个要点',
      items: [
        { icon: 'bulb', text: '说清**什么时候用**' },
        { icon: 'revise', text: '步骤写成**能照做的清单**' },
        { icon: 'pen', text: '踩过的坑**随手补进去**' },
      ],
      say: [
        { text: '想自己写一个，记住三点：|一句话说清什么时候用；', beat: false },
        '步骤写成能照着做的清单；',
        '每次踩了坑，随手补进去，它会越用越好用。',
      ],
    },
    {
      type: 'quote',
      text: '提示词解决一次\n**Skill 解决一类**',
      say: ['记住这一句：提示词解决一次问题，Skill 解决一类问题。'],
    },
    {
      type: 'outro',
      brand: 'AI 小课堂',
      sub: '把你最拿手的一件事，写成一个 Skill',
      cta: '关注，一起学 AI',
      say: ['今天就试试，把你最拿手的一件事，写成一个 Skill。'],
    },
  ],
};
