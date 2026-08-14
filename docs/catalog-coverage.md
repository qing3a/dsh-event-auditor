# 事件覆盖对照：dsh-event-auditor vs 官方 persistence-catalog

> 对照日期：2026-08-14 ｜ 官方来源：`deepseek-harness/docs/persistence-catalog.md`（GENERATED，源 `scripts/gen-persistence-catalog.ts`，mainline `47f94385`）
> 用途：校准 event-auditor 的事件覆盖，找出"官方 durable 事件全集"里我们没观察的方向。

## 0. 两层概念（必须先分清，否则校准会跑偏）

- **persistence-catalog** 是 **durable session log** 的事件全集（`SessionEvent`，带 `type/seq/time/data`），
  只通过**单个 `session/event` emit** 到达监听者——它是"会话可重放历史"，不是 cordis 事件总线。
- **event-auditor** 监听的是 **cordis 事件总线**（`ctx.on`/`ctx.watch` 的 emit/waterfall 事件）。
- 所以校准的正确姿势：**不是把 catalog 的事件名逐个补进 auditor 监听表**（很多 catalog 事件名
  在总线层面不存在同名 emit），而是：
  1. 看 catalog 的 namespace 方向 → 评估 auditor 的**分组覆盖方向**是否完整；
  2. 看 catalog 的**配对/隐式契约** → 给 auditor 加配对完整性检查（它观测的就是总线事件，
     配对关系是可重放性的关键）。

## 1. catalog namespace vs auditor 分组（方向覆盖矩阵）

官方 catalog 24 个 namespace（`agent/*`、`agent-preset/*`、`approval/*`、`assistant/*`、`command/*`、
`compaction/*`、`feedback/*`、`goal/*`、`hook/*`、`llm/*`、`permission/*`、`plan/*`、`request/*`、
`sandbox/*`、`schedule/*`、`session/*`、`step/*`、`subagent/*`、`todo/*`、`tool/*`、`tool-workflow/*`、
`turn/*`、`user/*`、`web/*`）。

| catalog namespace | auditor 对应分组/事件 | 状态 |
|---|---|---|
| `agent/*`（inbox/spliced 等） | agent 组 8 事件（status/error/session-start/created/disposed/inbox-inserted/claimed/discarded） | ✅ 方向覆盖（catalog 的 `agent/inbox/spliced` 是 durable 归一化，总线层对应 inserted/claimed/discarded） |
| `session/*` | session 组 2 事件 | ✅ |
| `tool/*` | tools 组 2 事件 + 3 waterfall（pre/execute/post） | ✅ |
| `subagent/*` | subagent 组 4 事件 | ✅ |
| `approval/*` | approval/request（waterfall）+ approval/asked/decided（auditor 未监听） | 🟡 **部分**：waterfall 有，audit 事件（asked/decided）缺——catalog 里 `approval/asked`↔`approval/decided` 是配对关系 |
| `command/*` | commands/change（config 组，默认关） | 🟡 catalog 有 `command/run`↔`command/done` 配对，auditor 只监听 change 通知 |
| `compaction/*` | 无 | ⬜ **缺口**：catalog 有 `compaction/start`↔`compaction/end` 配对（compactionId） |
| `feedback/*` | 无 | ⬜ 缺口（catalog 有 feedback 事件族） |
| `goal/*` | 无 | ⬜ 缺口 |
| `hook/*` | 无 | ⬜ 缺口 |
| `llm/*`（retry/retry-started） | llm/stream（waterfall）+ llm/adapters-updated（config 组） | 🟡 部分（retry 序列未监听） |
| `permission/*` | 无（approval 相邻） | ⬜ 缺口 |
| `plan/*` | 无 | ⬜ 缺口 |
| `sandbox/*`、`schedule/*`、`step/*`、`todo/*`、`tool-workflow/*`、`turn/*`、`user/*`、`web/*`、`request/*`、`agent-preset/*`、`assistant/*` | 无 | ⬜ 大部分缺口 |

**结论**：auditor 的核心方向（agent/session/tools/subagent）已覆盖，但 durable 层还有
approval-audit、compaction、feedback、goal、plan、permission、schedule 等方向没观察。
这些方向**不是马上要补监听**——大多数官方也是 log-only，价值判断见 §3。

## 2. 配对完整性检查（隐式契约，可加小代码）

catalog 的事件间成对关系是**可重放性的隐式契约**（按 id 关联）。auditor 观测总线事件时，
可以加一个轻量配对检查（监听两两事件，记录配对 id，dump 时报告未闭合对）：

| 配对 | 关联键 |
|---|---|
| `approval/asked` ↔ `approval/decided` | `id` |
| `command/run` ↔ `command/done` | `commandId` |
| `tool/call` ↔ `tool/result` | `callId` |
| `compaction/start` ↔ `compaction/end` | `compactionId` |
| `llm/retry` → `llm/retry-started` | 顺序 |

**落地建议（轻量）**：在 event-auditor 加 `pair-tracker`（监听上述事件 + 取 id 字段），
dump 时输出 `pairs: { open: [], closed: n }`。成本低（一个模块 + 事件清单追加），
价值 = 审计报告从"事件计数"升级为"契约完整性"。
→ **先落档此文档，配对检查代码列入 event-auditor 待办**（v0.4 之后，避免扩大本轮改动面）。

## 3. 校准后的优先级（落档，不扩本轮改动）

1. **事件方向不追全**：catalog 24 namespace 里，`user/message`、`assistant/message`、`tool/result`
   是仅有的 3 个 surface 事件（进 LLM 有序 surface），其余全是 log-only——auditor 追全部 log-only
   方向收益低。**方向缺口里最值得补的是 approval 审计（asked/decided）**——审批是协作决策点，
   与 dsh-plugin-verify 的 approval/request waterfall 验证呼应。
2. **配对检查**：价值明确、成本低，做（见 §2 建议）。
3. **envelope 层不动**：catalog 的 `ignorable` 标记、`surfaceOp`/`sourceEventSeqs` 是 durable
   重建语义，与 auditor 的总线观测无关，不引入。

## 附：reference

- 官方 catalog 生成源：`scripts/gen-persistence-catalog.ts`（deepseek-harness）
- auditor 事件清单：`dsh-event-auditor/src/events.ts`（22 emit + 10 waterfall = 32 监听）
- 配对契约来源：persistence-catalog 各 namespace 的事件类型声明
