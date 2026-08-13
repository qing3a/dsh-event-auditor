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
export declare const WATCHED_EVENTS: ReadonlyArray<readonly [string, string]>;
/**
 * 第二版增强：waterfall 事件（v0.2 启用）。
 * 签名纪律（已从源码逐条确认，2026-08-14）：
 *  - tools/pre-execute(exec, next)、tools/execute(exec, next)、tools/post-execute(exec, result, next)
 *  - agent/request(payload, next)、agent/pre-step(payload, next)
 *  - approval/request(req, next)、fs/write-intent(target, actor, next)、fs/edit-intent(target, actor, next)
 *  - system-prompt/assemble(assembly, context, next)、llm/stream(options, next)
 *  共同点：next 永远无参；只观察的监听器必须调用 next() 并透传返回值。
 */
export declare const ENHANCED_WATERFALL_EVENTS: ReadonlyArray<readonly [string, string]>;
/** 分组 → 事件名集合（与 Config.groups 键对应） */
export declare const EVENT_GROUPS: Record<string, ReadonlySet<string>>;
