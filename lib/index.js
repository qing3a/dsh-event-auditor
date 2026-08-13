/**
 * dsh-event-auditor 入口：apply 风格 cordis 插件。
 *
 * 已按实际运行环境核实的 API：
 *  - webServer（可选，ctx.get 判空）：headless 无此服务时跳过路由
 *  - schemastery：@deepseek-ai/schemastery 默认导入
 *  - settings（可选）：installSettingsSection 接入热改（v0.3）
 *  - ctx.effect / ctx.on：cordis 4（事件监听随插件卸载自动清理）
 *
 * 事件监听用万能观察者（转义类型），因为各事件参数形态不统一
 * （agent/* 是单 payload，tools/result 是双参数）——审计工具观察一切即可。
 */
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { AuditorService } from './auditor.js';
import { registerAuditCommand } from './commands.js';
import { ENHANCED_WATERFALL_EVENTS, EVENT_GROUPS, WATCHED_EVENTS } from './events.js';
import { registerAuditRoutes } from './routes.js';
export const name = 'event-auditor';
/** 依赖注入：全部可选（webServer/settings 用 ctx.get 判空）。 */
export const inject = [];
export const Config = z.object({
    enabled: z.boolean().default(true),
    bufferSize: z.number().default(500),
    truncateAt: z.number().default(4096),
    groups: z.object({
        agent: z.boolean().default(true),
        session: z.boolean().default(true),
        tools: z.boolean().default(true),
        subagent: z.boolean().default(true),
        config: z.boolean().default(false),
        waterfall: z.boolean().default(true),
    }),
});
/** 归一化配置（合并默认值）。 */
function resolveConfig(config) {
    return {
        enabled: config?.enabled ?? true,
        bufferSize: config?.bufferSize ?? 500,
        truncateAt: config?.truncateAt ?? 4096,
        groups: {
            agent: config?.groups?.agent ?? true,
            session: config?.groups?.session ?? true,
            tools: config?.groups?.tools ?? true,
            subagent: config?.groups?.subagent ?? true,
            config: config?.groups?.config ?? false,
            waterfall: config?.groups?.waterfall ?? true,
        },
    };
}
/**
 * 万能观察者（emit 事件）：任意事件名的宽松监听器，观察零副作用。
 * cordis 4 的 ctx.on 未声明事件名也可在运行时监听（emit 按字符串查表）。
 */
function watch(ctx, event, handler) {
    const on = ctx.on;
    return on(event, handler);
}
/**
 * 万能观察者（waterfall 事件）：最后一个参数是 next()，只观察的监听器
 * 必须调用 next() 并透传返回值，否则静默吞掉下游默认行为（仓库常设纪律）。
 * 已确认所有 waterfall 的 next 均无参。
 */
function watchWaterfall(ctx, event, handler) {
    const on = ctx.on;
    return on(event, (...args) => {
        handler(...args);
        const next = args[args.length - 1];
        if (typeof next === 'function') {
            return next();
        }
        return undefined;
    });
}
/**
 * 按当前分组开关挂载全部监听，返回总 disposer（热改重建用）。
 * 分组开关通过 thunk 实时读取，dispose 后按新配置重建。
 */
function mountListeners(ctx, auditor, getGroups) {
    const disposers = [];
    const groups = getGroups();
    for (const [eventName, mode] of WATCHED_EVENTS) {
        const group = Object.keys(EVENT_GROUPS).find((g) => EVENT_GROUPS[g].has(eventName));
        if (group && !groups[group])
            continue;
        disposers.push(watch(ctx, eventName, (...args) => {
            auditor.record(eventName, mode, args);
        }));
    }
    if (groups.waterfall) {
        for (const [eventName, mode] of ENHANCED_WATERFALL_EVENTS) {
            disposers.push(watchWaterfall(ctx, eventName, (...args) => {
                auditor.record(eventName, mode, args);
            }));
        }
    }
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
export function apply(ctx, config) {
    const initial = resolveConfig(config);
    if (!initial.enabled)
        return;
    const auditor = new AuditorService({
        bufferSize: initial.bufferSize,
        truncateAt: initial.truncateAt,
    });
    // 可变配置持有器：settings 热改时更新，监听按最新值重建
    let active = initial;
    // 监听挂载（effect 包裹，卸载时自动清理；热改时手动 dispose 后重建）
    let unmount = () => { };
    ctx.effect(() => {
        unmount = mountListeners(ctx, auditor, () => active.groups);
        return () => unmount();
    }, 'event-auditor: listeners');
    // HTTP 接口（register 返回 disposer）。webServer 可选：用 ctx.inject 动态注入
    // （与 installSettingsSection 同模式），web profile 有 webServer 时注册路由，
    // headless 无 webServer 时回调不执行（不阻塞插件加载）。
    ctx.inject(['webServer'], (sctx) => {
        const ws = sctx.webServer;
        sctx.effect(() => registerAuditRoutes(ws, auditor), 'event-auditor: routes');
    });
    // settings 热改（可选）：无 settings 服务时 installSettingsSection 内部安全跳过。
    // onChange 时重读解析值，更新活动配置并重建监听（bufferSize/truncateAt 变更需重建 auditor）。
    installSettingsSection(ctx, settingsNamespace('event-auditor'), Config, initial, {
        setSource(current) {
            // 更新 buffer/truncate 与监听（source 变更或变更提交时调用）
            const next = resolveConfig(current());
            if (next.bufferSize !== active.bufferSize ||
                next.truncateAt !== active.truncateAt ||
                next.groups !== active.groups) {
                active = next;
            }
        },
        onChange() {
            unmount();
            unmount = mountListeners(ctx, auditor, () => active.groups);
        },
    });
    // /audit 会话命令（可选）：ctx.commands 动态注入，无该服务的 profile 不阻塞
    ctx.inject(['commands'], (sctx) => {
        const commands = sctx.commands;
        sctx.effect(() => registerAuditCommand(commands, auditor), 'event-auditor: command');
    });
    // headless dump：DSH_EVENT_AUDIT_DUMP=<path> 时进程退出前写快照
    const dumpPath = process.env.DSH_EVENT_AUDIT_DUMP;
    if (dumpPath !== undefined && dumpPath.length > 0) {
        process.on('exit', () => {
            auditor.dumpToFile(dumpPath);
        });
    }
}
