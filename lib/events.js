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
export const WATCHED_EVENTS = [
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
];
/** 第二版增强：waterfall 事件。加入前先读声明位置源码确认签名，并遵守 next() 纪律。 */
export const ENHANCED_WATERFALL_EVENTS = [
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
];
/** 分组 → 事件名集合（与 Config.groups 键对应） */
export const EVENT_GROUPS = {
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
};
