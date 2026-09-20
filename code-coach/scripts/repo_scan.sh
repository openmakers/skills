#!/usr/bin/env bash
# repo_scan.sh — 陌生仓库事实清单（只读，绝不打印密钥值）
# 用法: bash repo_scan.sh [仓库路径] [--months N]
# 输出: 结构化纯文本，供「代码教练」技能作为讲解的事实底座

set -uo pipefail

REPO="${1:-.}"
MONTHS=6
[ "${2:-}" = "--months" ] && MONTHS="${3:-6}"
cd "$REPO" 2>/dev/null || { echo "路径不存在: $REPO"; exit 1; }
REPO_ABS="$(pwd)"

EXCL='node_modules|\.git/|dist/|build/|out/|\.next/|target/|vendor/|venv/|\.venv/|__pycache__|\.cache/|coverage/|\.turbo/|Pods/|DerivedData/'
h() { printf '\n========== %s ==========\n' "$1"; }
# 任何可能含凭证的文件内容都要过这层：长 token / key 一律打码
redact() { sed -E 's/(sk-|sk_live_|sk_test_|sbp_|ghp_|gho_|github_pat_|xox[baprs]-|AKIA|eyJ)[A-Za-z0-9_./+-]{10,}/\1<REDACTED>/g'; }

h "1. 基本信息"
echo "路径: $REPO_ABS"
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "远端: $(git remote get-url origin 2>/dev/null || echo 无)"
  echo "分支: $(git branch --show-current 2>/dev/null)"
  echo "提交总数: $(git rev-list --count HEAD 2>/dev/null)"
  echo "首次提交: $(git log --reverse --format=%ad --date=short 2>/dev/null | head -1)"
  echo "最近提交: $(git log -1 --format=%ad --date=short 2>/dev/null)"
  echo "贡献者(按提交数):"
  git shortlog -sn --all 2>/dev/null | head -8 | sed 's/^/  /'
  echo "最近 15 条提交:"
  git log -15 --format='  %ad %an: %s' --date=short 2>/dev/null
else
  echo "(非 git 仓库)"
fi

h "2. 语言构成 (代码行数, 已排除依赖与产物目录)"
BIN='png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf|eot|mp4|mp3|wav|pdf|zip|gz|tgz|jar|so|dylib|dll|bin|lock|map|log|csv|DS_Store'
find . -type f 2>/dev/null | grep -Ev "$EXCL" | grep -E '\.[a-zA-Z0-9]+$' \
  | sed 's/.*\.//' | grep -Eiv "^($BIN)$" | sort | uniq -c | sort -rn | head -15 \
  | while read -r n ext; do
      lines=$(find . -type f -name "*.${ext}" 2>/dev/null | grep -Ev "$EXCL" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
      printf '  %-10s 文件 %-6s 行 %s\n' ".$ext" "$n" "${lines:-?}"
    done
echo "  -- 静态资源(仅计文件数) --"
find . -type f 2>/dev/null | grep -Ev "$EXCL" | sed 's/.*\.//' | grep -Ei "^($BIN)$" \
  | sort | uniq -c | sort -rn | head -6 | sed 's/^/    /'

h "3. 包管理与依赖清单"
if [ -f package.json ] && command -v jq >/dev/null; then
  echo "--- package.json ---"
  jq -r '"  name: \(.name // "?")  version: \(.version // "?")  type: \(.type // "commonjs")"' package.json
  echo "  dependencies:"; jq -r '.dependencies // {} | to_entries[] | "    \(.key)@\(.value)"' package.json
  echo "  devDependencies:"; jq -r '.devDependencies // {} | to_entries[] | "    \(.key)@\(.value)"' package.json
  echo "  scripts (超长命令已截断, 完整内容自行读 package.json):"
  jq -r '.scripts // {} | to_entries[] | "    \(.key): \(.value)"' package.json | cut -c1-180
elif [ -f package.json ]; then
  echo "--- package.json (无 jq, 原样前 80 行) ---"; head -80 package.json
fi
for f in deno.json deno.jsonc requirements.txt pyproject.toml go.mod Cargo.toml Gemfile pom.xml build.gradle composer.json pubspec.yaml Package.swift; do
  [ -f "$f" ] && { echo "--- $f ---"; head -60 "$f"; echo; }
done
echo "锁文件:"; ls -1 2>/dev/null | grep -E 'lock|\.lock$|yarn\.lock|pnpm-lock|bun\.lock' | sed 's/^/  /'

h "4. 目录地图 (顶层 + 主要源码目录二级, 括号内为文件数)"
for d in $(find . -maxdepth 1 -type d ! -name '.' 2>/dev/null | grep -Ev "$EXCL" | sort); do
  n=$(find "$d" -type f 2>/dev/null | grep -Ev "$EXCL" | wc -l | tr -d ' ')
  printf '  %-28s %s\n' "$d" "$n"
done
for base in src app lib packages apps supabase server backend frontend services components; do
  [ -d "$base" ] && {
    echo "  -- $base/ 二级 --"
    for d in $(find "$base" -maxdepth 1 -type d ! -path "$base" 2>/dev/null | grep -Ev "$EXCL" | sort); do
      n=$(find "$d" -type f 2>/dev/null | grep -Ev "$EXCL" | wc -l | tr -d ' ')
      printf '    %-34s %s\n' "$d" "$n"
    done
  }
done

h "5. 配置与工程化文件"
find . -maxdepth 2 -type f 2>/dev/null | grep -Ev "$EXCL" \
  | grep -Ei '(tsconfig|jsconfig|eslint|biome|prettier|vite\.config|webpack|rollup|next\.config|nuxt\.config|tailwind|postcss|babel|jest|vitest|playwright|cypress|dockerfile|docker-compose|makefile|justfile|procfile|netlify|vercel|zeabur|fly\.toml|railway|\.editorconfig|\.nvmrc|\.tool-versions|renovate|dependabot)' \
  | sed 's/^/  /' | sort | head -40
echo "  -- CI --"
ls -1 .github/workflows/ 2>/dev/null | sed 's/^/    .github\/workflows\//'
ls -1 .gitlab-ci.yml .circleci 2>/dev/null | sed 's/^/    /'
echo "  -- git hooks / 提交规范 --"
ls -1 .husky 2>/dev/null | sed 's/^/    .husky\//'
ls -1 2>/dev/null | grep -Ei 'commitlint|lint-staged|\.czrc|CONTRIBUTING' | sed 's/^/    /'

h "6. AI 协作配置 (本技能必须逐个解读)"
for f in CLAUDE.md AGENTS.md GEMINI.md .cursorrules .windsurfrules .mcp.json .clinerules; do
  [ -f "$f" ] && echo "  [有] $f ($(wc -l < "$f" | tr -d ' ') 行)"
done
[ -f .github/copilot-instructions.md ] && echo "  [有] .github/copilot-instructions.md"
find . -maxdepth 4 -name 'CLAUDE.md' -o -maxdepth 4 -name 'AGENTS.md' 2>/dev/null | grep -Ev "$EXCL" | grep -v '^\./CLAUDE.md$' | grep -v '^\./AGENTS.md$' | sed 's/^/  [子目录] /'
for d in .claude .codex .cursor .gemini; do
  [ -d "$d" ] && { echo "  [有] $d/"; find "$d" -maxdepth 2 2>/dev/null | sed 's/^/      /' | head -30; }
done
[ -f .claude/settings.json ] && { echo "  --- .claude/settings.json (已脱敏) ---"; head -40 .claude/settings.json | redact | sed 's/^/    /'; }
[ -f .mcp.json ] && { echo "  --- .mcp.json 里配置的 MCP server 名 (不打印参数, 可能含 token) ---"
  grep -Eo '"[a-zA-Z0-9_-]+"[[:space:]]*:[[:space:]]*\{' .mcp.json | head -12 | sed 's/^/    /'; }

h "7. 文档入口"
find . -maxdepth 2 -type f -iname '*.md' 2>/dev/null | grep -Ev "$EXCL" | sed 's/^/  /' | head -40
for d in docs Devbook doc documentation wiki; do
  [ -d "$d" ] && { echo "  -- $d/ 下 md 共 $(find "$d" -name '*.md' | wc -l | tr -d ' ') 篇, 最近改动 10 篇 --"
    ls -t "$d"/*.md 2>/dev/null | head -10 | sed 's/^/    /'; }
done

h "8. 测试与质量"
tn=$(find . -type f 2>/dev/null | grep -Ev "$EXCL" | grep -Ei '(\.|_|/)(test|spec)s?\.(ts|tsx|js|jsx|py|go|rb|java|rs)$|/(tests?|__tests__|spec)/' | wc -l | tr -d ' ')
echo "  测试文件数: $tn"
find . -type f 2>/dev/null | grep -Ev "$EXCL" | grep -Ei '(\.|_|/)(test|spec)s?\.' | head -10 | sed 's/^/    /'

h "9. 变更热点 (近 ${MONTHS} 个月改动最频繁的文件 = 项目当前核心)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git log --since="${MONTHS} months ago" --name-only --format= 2>/dev/null \
    | grep -Ev "$EXCL" | grep -v '^$' | sort | uniq -c | sort -rn | head -25 | sed 's/^/  /'
fi

h "10. 体量最大的源码文件 (行数 top 15, 往往是核心或待拆分的债)"
find . -type f 2>/dev/null | grep -Ev "$EXCL" \
  | grep -E '\.(ts|tsx|js|jsx|py|go|rb|java|rs|php|swift|kt|vue|svelte|sql)$' \
  | xargs wc -l 2>/dev/null | sort -rn | grep -v ' total$' | head -15 | sed 's/^/  /'

h "11. 环境变量 KEY (只列名, 绝不打印值)"
for f in .env.example .env.sample .env.template .env.local.example; do
  [ -f "$f" ] && { echo "  --- $f ---"; grep -Eo '^[A-Za-z_][A-Za-z0-9_]*' "$f" | sed 's/^/    /'; }
done
for f in .env .env.local; do
  [ -f "$f" ] && { echo "  --- $f (存在, 仅列 KEY) ---"; grep -Eo '^[A-Za-z_][A-Za-z0-9_]*' "$f" | sed 's/^/    /'; }
done

h "12. 入口文件候选"
for f in README.md README.zh.md main.ts main.py main.go index.ts index.js src/main.tsx src/main.ts src/index.ts src/App.tsx app/layout.tsx app/page.tsx manage.py cmd/main.go; do
  [ -f "$f" ] && echo "  [有] $f"
done

printf '\n========== 扫描完成 ==========\n'
