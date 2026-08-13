# dsh-event-auditor — 事件审计面板（插件设计 v0.1）

> 立项日期：2026-08-14 ｜ 状态：**✅ 已验证运行（2026-08-14）**
> 定位：给插件作者 / 开发者的 **harness 事件流观察性工具**——实时查看事件类型、分发模式、计数、最近事件、waterfall 链上的监听器顺序。

---

## 1. 定位与差异化

生态雷达里没有"事件审计"方向。最接近的邻居是 `fuhefei/dsh-sentinel`（事件驱动**唤醒** agent loop，传感器→触发动作）。差异化：

| | dsh-sentinel | dsh-event-auditor |
|---|---|---|
| 方向 | 事件 → 触发动作 | 事件 → 可视化观察 |
| 目标用户 | 自动化工作流 | 插件作者 / 调试者 |
| 价值 | 让 agent 响应外部信号 | 看清 harness 内部发生了什么 |

同时它是一个**刻意的最小练手插件**，覆盖速查表全部核心点：事件类型声明合并、`ctx.effect` 生命周期、`ctx.webServer` 路由、schemastery 配置、waterfall 纪律（第二版增强项）。

## 2. 监听清单（第一版：纯 emit 事件，零副作用风险）

依据 `docs/event-producer-consumer.zh.md`（56 个 harness 自有事件矩阵）。第一版**只监听 emit 模式**——观察性监听器零风险，不需要 next()。

### 2.1 核心组（agent 生命周期）

| 事件 | 模式 | 声明位置 | 用途 |
|---|---|---|---|
| `agent/status` | emit | `packages/core/agent/src/runtime-types.ts:178` | agent 状态流转 |
| `agent/error` | emit | `runtime-types.ts:290` | 错误审计 |
| `agent/session-start` | emit | `runtime-types.ts:217` | 会话启动 |
| `agent/created` / `agent/disposed` | emit | `runtime-types.ts:159/168` | agent 生命周期 |
| `agent/inbox/inserted` / `claimed` / `discarded` | emit | `runtime-types.ts:186/197/205` | inbox 事件 |

### 2.2 会话组

`session/created`（`session/src/index.ts:54`）、`session/disposed`（`:64`）

### 2.3 工具组

`tools/change`（`tools/src/index.ts:207`，工具注册表变化）、`tools/result`（`:197`，工具执行结果）

### 2.4 subagent 组

`subagent/start` / `subagent/end`（`subagent/src/index.ts:157/166`）、`subagent/provider-added` / `provider-removed`（`:140/146`）

### 2.5 配置组（可选开关）

`skills/change`、`settings/updated`、`credentials/updated`、`llm/adapters-updated`、`commands/change`、`agent-preset/selected`

### 2.6 增强组（第二版：waterfall 事件，需 next()）

`tools/pre-execute` / `tools/execute` / `tools/post-execute`、`agent/request`、`approval/request`、`fs/write-intent` / `fs/edit-intent`、`system-prompt/assemble`、`agent/pre-step`、`llm/stream`

> ⚠️ waterfall 事件的 listener 签名带 `next` 参数，**只观察的监听器必须调用 `next()`**，否则会静默吞掉下游所有默认行为（仓库常设纪律）。第二版加入时的正确写法见 §7 示范。

## 3. 架构与文件结构（单包，非 monorepo）

```
dsh-event-auditor/
  cordis.patch.yml        # insert 声明：把自己插入 profile 插件清单
  package.json            # dsh.bundle.patch + peerDeps + cordis 仅 devDep
  tsconfig.json
  README.md               # 安装/卸载/最小用法（雷达收录条件要求）
  src/
    index.ts              # apply 入口：name/inject/apply + Config(schemastery)
    auditor.ts            # AuditorService：环形缓冲 + 计数 + 过滤 + 快照
    events.ts             # 事件清单常量 + declare module 类型声明
    routes.ts             # ctx.webServer.register('/api/audit/events') 等
    client/index.html     # 最小前端：fetch 轮询 + 表格（无 react/dsh.client）
```

## 4. 数据模型

```ts
interface AuditRecord {
  event: string        // 事件名
  at: number           // epoch ms
  seq: number          // 全局序号
  mode: 'emit' | 'waterfall' | 'serial' | 'parallel' | 'bail'
  args: unknown[]      // 快照的参数（结构化克隆风险：大对象截断）
}

interface AuditSnapshot {
  counts: Record<string, number>       // 按事件名的累计计数
  recent: AuditRecord[]                // 环形缓冲（默认 500 条）
  byMode: Record<string, number>       // 按模式分布
  since: number                        // 面板启动时间
}
```

**边界**：`args` 快照需防大对象——默认截断到 `JSON.stringify` ≤ 4KB 并标注 `[truncated]`；任何异常（如不可序列化）只记录错误标记，不阻塞监听。

## 5. HTTP 接口

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/audit/events` | GET | 返回 `AuditSnapshot`（含 `?since=<seq>` 增量） |
| `/api/audit/reset` | POST | 清空计数与缓冲（`enabled` 配置开关） |
| `/audit` | GET | 静态面板页 |

## 6. 配置（schemastery）

```ts
export const Config = z.object({
  enabled: z.boolean().default(true),      // 总开关
  bufferSize: z.number().default(500),     // 环形缓冲上限
  truncateAt: z.number().default(4096),    // 单条 args 序列化上限
  groups: z.object({
    agent: z.boolean().default(true),
    session: z.boolean().default(true),
    tools: z.boolean().default(true),
    subagent: z.boolean().default(true),
    config: z.boolean().default(false),
  }),
})
```

## 7. 验证步骤（落地清单）

```bash
# 1) 克隆 DSH 并装依赖（Node >= 22 + pnpm）
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness && pnpm install && pnpm build

# 2) 本地链接本插件
dsh plugin --profile <your-profile> add link:$(pwd)/dsh-event-auditor

# 3) 启动并打开面板
dsh --profile <your-profile>
# 浏览器访问 http://localhost:<port>/audit

# 4) 触发事件：跑一轮对话/工具调用，确认 agent/*、tools/result、session/* 在面板出现

# 5) 自我检查：确认"审计监听不改变任何行为"（对比加插件前后的对话结果）
```

## 8. 已知不确定点（验证记录 2026-08-14）

✅ **已解决**：

1. **事件 listener 签名**：agent/* 是单 payload（`'agent/status'(payload: {agent, status}): void`，`this: Scoped<Agent>`）；tools/result 是双参数 `(exec, result)`——万能观察者 `(...args)` 正确。
2. **`webServer.register` 签名**：`register(route: {kind, path, handler: (req,res)=>void|Promise<void>}): () => void`，返回 disposer，放入 `ctx.effect` 即自动清理。
3. **静态 HTML 挂载**：未接入 `/audit` 页面（v0.1 只做 JSON 接口，curl 验证通过）；页面留待 v0.3 dsh.client 方案。
4. **`dsh plugin add link:`**：验证通过，reconcile 自动加入 bundle 栈。

⚠️ **重大教训——API 漂移**：npm rc 版（0.0.1-rc.1）`ctx.httpServer`/`HttpServerService` vs master 源码 `ctx.webServer`/`WebServer`。profile 从本地 workspace 链接时**运行 master 语义**。插件改为鸭子类型接口（`RouteRegistrar`）解耦类名，仅跟随服务名。遇到疑似漂移，先读实际运行版本的 `lib/types/`。

⚠️ **环境提示**：本地验证需完整构建（`build:lib:host` + `build:lib:client` + web-frontend dist），sparse-checkout 需含 `packages vendor native apps website patches scripts docs`；C 盘 98% 已用时构建仍可行（最终 7.4G 余量）。

## 9. 路线图

- **v0.1（本设计）**：emit 组审计 + JSON 接口 + 最小前端
- **v0.2**：waterfall 增强组（按 §7 先确认签名）+ settings 面板热改（`installSettingsSection` 模式，参考 dsh-remote-web-ui）
- **v0.3**：dsh.client 浏览器侧面板（替换静态 HTML）、waterfall 链可视化（监听器执行顺序）
- **v0.4**：发布 npm → 打 `dsh-plugin` topic → 进雷达 → 收录 PLUGINS.md
