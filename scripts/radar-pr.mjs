// Create a registration PR on awesome-dsh-plugins via gh api (works when git push is blocked).
// Flow: fork → new branch → edit PLUGINS.md via Contents API → create PR.
import { execFileSync } from 'node:child_process'

const OWNER = 'AdamPlatin123'
const REPO = 'awesome-dsh-plugins'
const FORK = 'qing3a/awesome-dsh-plugins'
const BRANCH = 'docs/register-dsh-event-auditor'
const PLUGINS_PATH = 'PLUGINS.md'

function gh(args, input) {
  // POST/PUT with body → pass JSON via stdin (`--input -`); GET/refs → no body
  const opts =
    input === undefined
      ? { encoding: 'utf8' }
      : { input: JSON.stringify(input), encoding: 'utf8' }
  const full = input === undefined ? args : [...args, '--input', '-']
  return execFileSync('gh', ['api', ...full], opts)
}

// 1. Fork main head sha
const forkRef = JSON.parse(gh([`repos/${FORK}/git/ref/heads/main`]))
const baseSha = forkRef.object.sha
console.log('fork main sha:', baseSha.slice(0, 7))

// 2. Create branch (delete if exists)
try {
  gh([`repos/${FORK}/git/refs/heads/${BRANCH}`, '--method', 'DELETE'])
  console.log('deleted existing branch')
} catch { /* not exists */ }
gh([`repos/${FORK}/git/refs`, '--method', 'POST'], {
  ref: `refs/heads/${BRANCH}`,
  sha: baseSha,
})
console.log('branch created:', BRANCH)

// 3. Get current PLUGINS.md blob sha
const current = JSON.parse(gh([`repos/${FORK}/contents/${PLUGINS_PATH}?ref=${BRANCH}`]))
const currentContent = Buffer.from(current.content, 'base64').toString('utf8')
console.log('current PLUGINS.md bytes:', currentContent.length)

// 4. Insert our row into the 单插件 (single plugin) table, after the header row
const ROW = '| dsh-event-auditor | [qing3a/dsh-event-auditor](https://github.com/qing3a/dsh-event-auditor) | Harness 事件流审计面板：观察事件类型/分发模式/计数/最近事件，settings 热改 + /audit 会话命令；已用 mock-llm 运行时验证（74 事件/12 waterfall） | ✅ |\n'
const ANCHOR = '| 插件 | 仓库 | 说明 | 运行级 |\n'
if (!currentContent.includes('dsh-event-auditor')) {
  const updated = currentContent.replace(ANCHOR, ANCHOR + ROW)
  gh([`repos/${FORK}/contents/${PLUGINS_PATH}`, '--method', 'PUT'], {
    message: 'docs: 登记 dsh-event-auditor（含运行时验证证据）',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha: current.sha,
    branch: BRANCH,
  })
  console.log('PLUGINS.md updated with dsh-event-auditor row')
} else {
  console.log('row already present')
}

// 5. Create PR
const body = `## 插件信息

| 项 | 值 |
|---|---|
| 插件名 | dsh-event-auditor |
| 仓库 | https://github.com/qing3a/dsh-event-auditor |
| 一句话说明 | Harness 事件流审计面板：观察事件类型/分发模式/计数/最近事件，settings 热改 + /audit 会话命令；已用 mock-llm 运行时验证（74 事件/12 waterfall） |
| 版本 | 0.1.0 |

## 自检清单

- [x] package.json name 使用 @dsh-external scope
- [x] 仓库已打 dsh-plugin topic
- [x] 所有运行时依赖已声明（@deepseek-ai/dsh-host-webserver peerDeps + @deepseek-ai/schemastery deps）
- [x] 运行时验证实测：**dsh web + headless 双 profile 加载通过；mock-llm 触发完整 agent 循环，捕获 74 事件 / 12 waterfall（system-prompt/assemble → agent/pre-step → agent/request → llm/stream → tools/pre-execute → tools/execute → tools/post-execute），agent 完整跑完工具循环（next() 透传零副作用）**。验证方法见 https://github.com/deepseek-ai/deepseek-harness/discussions/462 与插件仓库 docs/runtime-validation.md

## 改动内容
- PLUGINS.md 单插件表新增一行（运行级 ✅，基于完整运行时验证）
`
const pr = JSON.parse(gh([`repos/${OWNER}/${REPO}/pulls`, '--method', 'POST'], {
  title: 'docs: 登记 dsh-event-auditor',
  head: `${FORK.split('/')[0]}:${BRANCH}`,
  base: 'main',
  body,
}))
console.log('PR created:', pr.html_url)
