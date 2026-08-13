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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "event-auditor";
/** 依赖注入：全部可选（webServer/settings 用 ctx.get 判空）。 */
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    bufferSize: number;
    truncateAt: number;
    groups: {
        agent: boolean;
        session: boolean;
        tools: boolean;
        subagent: boolean;
        config: boolean;
        waterfall: boolean;
    };
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;
