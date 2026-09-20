# 探查手册：怎么在一小时内摸清一个陌生仓库

目录：
1. 三条摸底原则
2. 并行派子代理的四个任务
3. 按技术栈分支的排查清单
4. 追一条功能全链路的六步法
5. 分辨活代码与死代码
6. 检测"规范已漂移"

---

## 1. 三条摸底原则

**热点优先于目录树。** `repo_scan.sh` 第 9 节给出近半年改动最频繁的文件，那就是项目当下的核心。一个 1400 文件的仓库，真正天天动的通常不到 40 个。先读热点，再补结构。

**入口优先于抽象。** 从 `main`/`App`/路由表/`index` 顺着调用链往下读，而不是从 `utils/` 往上猜。抽象层脱离调用点看不出意图。

**提交历史是最诚实的文档。** README 会过期，`git log` 不会。`git log --oneline -60`、`git log -S'<关键词>'`、`git log --follow <文件>` 三招能回答"这段代码为什么长这样"。

---

## 2. 并行派子代理的四个任务

源码超 1500 文件时用。派 `Explore` 类子代理，要求**只回结论与文件路径，不要回贴大段源码**。

- **A 前端结构**：路由表在哪、共几个页面、状态管理方案、数据获取方式（fetch/axios/react-query/SWR）、组件分层（pages / features / ui）、样式方案（Tailwind / CSS Modules / styled）、有没有设计系统或组件库。回：一张表 + 每项的代表文件路径。
- **B 后端与数据**：服务端代码在哪（自建服务 / serverless / BaaS）、API 形态（REST / RPC / GraphQL / Edge Function）、数据库与迁移目录、鉴权方案、权限控制在哪一层、外部服务清单（支付、存储、AI、邮件）。回：数据流向的一段描述 + 关键文件。
- **C 工程化与规范**：构建工具与配置、lint/format 规则里被改过默认值的那几条、测试怎么跑、CI 做了什么、部署到哪、提交信息风格（`git log --format=%s -50` 归纳）、分支策略。
- **D 文档与 AI 配置**：README/docs/Devbook 里值得读的篇目清单、CLAUDE.md 与 AGENTS.md 的条目归类、`.claude/` 下的技能与子代理清单、MCP 配置的服务名（不看 token）。

四个结论回来后交叉验证：文档说的和代码里的对不对得上，对不上的记进"规范漂移"清单。

---

## 3. 按技术栈分支的排查清单

### 前端单页应用（Vite / CRA + React、Vue）
先看：`vite.config.*`（别名、代理、分包）、`src/main.*`、路由文件（搜 `createBrowserRouter`、`<Routes>`、`router/index`）、`src/hooks` 或 `composables`、全局 Provider 链（`App.tsx` 里包了几层 Context 就是几个全局子系统）。
关键信号：`@tanstack/react-query` 表示服务端状态与本地状态分治；`zustand`/`redux` 看 store 目录大小判断复杂度；`shadcn/ui`（`components/ui/` + `cn()` 工具）表示组件是复制进仓库的、可以随便改。

### Next.js / Nuxt（全栈框架）
先看：`app/` 还是 `pages/`（App Router 与 Pages Router 差别巨大）、`middleware.ts`、`app/api/` 或 `server/api/`、`next.config.*`。
关键信号：文件里有没有 `"use client"`，服务端组件与客户端组件的边界在哪；数据获取是 server component 直接查库还是走 API route。

### Node 服务端（Express / Koa / NestJS / Fastify）
先看：入口 `src/index|server|app.ts`、路由注册处、中间件链的顺序（鉴权在哪一环）、ORM（Prisma `schema.prisma` / TypeORM entities / Drizzle schema）。
关键信号：NestJS 看 `*.module.ts` 的依赖注入图；Express 看中间件顺序，错误处理中间件是否兜底。

### Python（Django / FastAPI / Flask）
先看：`manage.py`+`settings.py`+各 app 的 `models.py`/`urls.py`；FastAPI 看 `main.py` 的 `include_router` 与 Pydantic 模型；`requirements.txt` 或 `pyproject.toml`。
关键信号：Django 的 `migrations/` 数量与最近一次时间；有没有 Celery（异步任务）。

### Go / Rust
Go 先看 `cmd/` 下的 main、`internal/` 分层、`go.mod` 依赖、接口定义处；Rust 先看 `Cargo.toml` 的 workspace 成员、`main.rs`/`lib.rs` 的 `mod` 树。

### BaaS / Serverless（Supabase、Firebase、Cloudflare Workers）
先看：`supabase/migrations/`（**表结构与 RLS 策略就是这个项目真正的后端**）、`supabase/functions/*/index.ts`、客户端的 SDK 初始化处。
关键信号：权限是写在 RLS 策略里还是写在函数里；有没有 `service_role` 泄漏到前端；数据库函数（RPC）承担了多少业务逻辑。讲解时**务必把 RLS 单独讲一节**，新人最容易在这里栽。

### Monorepo（pnpm workspace / turborepo / nx）
先看：根 `package.json` 的 workspaces、`turbo.json`/`nx.json` 的任务依赖图、`packages/` 里谁依赖谁。
讲解切入点：先讲包与包的依赖方向，再讲单个应用。

### 移动端
iOS 看 `*.xcodeproj`/`Package.swift`/SwiftUI 的 `App` 入口；RN 看 `App.tsx` 与 `react-navigation` 的导航树；Flutter 看 `lib/main.dart` 与 `pubspec.yaml`。

---

## 4. 追一条功能全链路的六步法（第 7 章的做法）

选一个**用户看得见、又贯穿全栈**的功能（登录、下单、发一条消息、上传一张图）。避开最简单的健康检查，也避开最复杂的核心引擎。

1. **找触发点**：在页面/组件里搜按钮文案或 `onClick`，定位事件处理函数。
2. **跟到数据层**：函数调用了哪个 service/hook/api client，用 `rg -n "functionName" --type ts` 反查。
3. **过网络边界**：请求打到哪个路由/函数/RPC，把请求体字段列出来。
4. **看服务端处理**：鉴权在哪一步、参数怎么校验、调用了哪些外部服务、失败怎么返回。
5. **落库**：写了哪几张表、有没有事务、有没有触发器/RLS 在背后起作用（这里最容易有隐藏逻辑）。
6. **回传与渲染**：返回值怎么更新前端状态、有没有乐观更新、错误怎么提示。

输出形态：一张分层的链路表（层 / 文件 / 干了什么），加一段"如果要在这条链路上加一个字段，你要依次改这 5 个地方"。后面这句是新人最需要的。

---

## 5. 分辨活代码与死代码

- `git log --since="12 months ago" --name-only` 里从未出现的文件，重点怀疑。
- 反查引用：`rg -n "ComponentName" --glob '!*test*'`，只有定义没有调用的，标为"疑似废弃"。
- 存在 `xxx.old.ts`、`xxxV2`、`legacy/`、`deprecated/` 的，问用户或看 CLAUDE.md 确认哪套是现役。
- 讲解时把"两套并存"如实说明，并指出新代码该走哪套——这是接手者第一天最需要的信息。

---

## 6. 检测"规范已漂移"

把 CLAUDE.md / AGENTS.md / README 里的每条硬规则，抽查代码验证一次：

| 规则类型 | 怎么验 |
|---|---|
| "禁止使用 X" | `rg "X" src/` 看还有多少处 |
| "所有 A 必须走 B" | 找 B 的引用数与 A 的总数对比 |
| "改了 X 要同步改 Y" | `git log --name-only` 看两者是否总是同 commit 出现 |
| "用 XX 命令部署" | 命令在 package.json / CI 里是否还存在 |

漂移的条目不要当规范讲，要标注："文档这么写，但代码里还有 N 处例外，实际执行时问一下团队。"这是代码教练区别于复读机的地方。
