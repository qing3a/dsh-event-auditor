/**
 * 事件清单与分组配置。
 *
 * 事件声明位置的权威来源是各 dsh 包内的 `declare module '@deepseek-ai/cordis'`：
 *  - agent/*          → @deepseek-ai/dsh-agent   （packages/core/agent/src/runtime-types.ts）
 *  - session/*        → @deepseek-ai/dsh-session （packages/core/session/src/index.ts）
 *  - tools/*          → @deepseek-ai/dsh-tools   （packages/core/tools/src/index.ts）
 *  - subagent/*       → @deepseek-ai/dsh-subagent（packages/subagent/subagent/src/index.ts）
 *  - settings/*       → @deepseek-ai/dsh-settings
 *
 * 事件参数形态不统一（单 payload / 双参数 / 更多），因此本插件用万能观察者
 * `(...args: unknown[])` 监听，不做按事件名的类型声明——这正是审计工具的定位：
 * 观察一切，不改变任何语义。
 *
 * 注意：waterfall 事件的监听器签名带 next()，只观察的监听器必须调用 next()，
 * 否则静默吞掉下游默认行为。v0.1 不监听 waterfall 组。
 */

/** 第一版监听清单：纯 emit 事件（观察零副作用）。每个条目 [事件名, 模式] */
export const WATCHED_EVENTS: ReadonlyArray<readonly [string, string]> = [
  // agent 生命周期（@deepseek-ai/dsh-agent）
  ['agent/status', 'emit'],
  ['agent/error', 'emit'],
  ['agent/session-start', 'emit'],
  ['agent/created', 'emit'],
  ['agent/disposed', 'emit'],
  ['agent/inbox/inserted', 'emit'],
  ['agent/inbox/claimed', 'emit'],
  ['agent/inbox/discarded', 'emit'],
  // 会话（@deepseek-ai/dsh-session）
  ['session/created', 'emit'],
  ['session/disposed', 'emit'],
  // 工具（@deepseek-ai/dsh-tools）
  ['tools/change', 'emit'],
  ['tools/result', 'emit'],
  // subagent（@deepseek-ai/dsh-subagent）
  ['subagent/start', 'emit'],
  ['subagent/end', 'emit'],
  ['subagent/provider-added', 'emit'],
  ['subagent/provider-removed', 'emit'],
  // 配置（默认关闭，见 Config.groups.config）
  ['skills/change', 'emit'],
  ['settings/updated', 'emit'],
  ['credentials/updated', 'emit'],
  ['llm/adapters-updated', 'emit'],
  ['commands/change', 'emit'],
  ['agent-preset/selected', 'emit'],
]

/**
 * 第二版增强：waterfall 事件（v0.2 启用）。
 * 签名纪律（已从源码逐条确认，2026-08-14）：
 *  - tools/pre-execute(exec, next)、tools/execute(exec, next)、tools/post-execute(exec, result, next)
 *  - agent/request(payload, next)、agent/pre-step(payload, next)
 *  - approval/request(req, next)、fs/write-intent(target, actor, next)、fs/edit-intent(target, actor, next)
 *  - system-prompt/assemble(assembly, context, next)、llm/stream(options, next)
 *  共同点：next 永远无参；只观察的监听器必须调用 next() 并透传返回值。
 */
export const ENHANCED_WATERFALL_EVENTS: ReadonlyArray<readonly [string, string]> = [
  ['tools/pre-execute', 'waterfall'],
  ['tools/execute', 'waterfall'],
  ['tools/post-execute', 'waterfall'],
  ['agent/request', 'waterfall'],
  ['approval/request', 'waterfall'],
  ['fs/write-intent', 'waterfall'],
  ['fs/edit-intent', 'waterfall'],
  ['system-prompt/assemble', 'waterfall'],
  ['agent/pre-step', 'waterfall'],
  ['llm/stream', 'waterfall'],
]

/** 分组 → 事件名集合（与 Config.groups 键对应） */
export const EVENT_GROUPS: Record<string, ReadonlySet<string>> = {
  agent: new Set(WATCHED_EVENTS.slice(0, 8).map(([name]) => name)),
  session: new Set(['session/created', 'session/disposed']),
  tools: new Set(['tools/change', 'tools/result']),
  subagent: new Set([
    'subagent/start',
    'subagent/end',
    'subagent/provider-added',
    'subagent/provider-removed',
  ]),
  config: new Set(WATCHED_EVENTS.slice(16).map(([name]) => name)),
  waterfall: new Set(ENHANCED_WATERFALL_EVENTS.map(([name]) => name)),
}
