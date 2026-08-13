/**
 * /audit 会话命令：直接在对话/UI 里查看事件审计摘要，无需打开面板。
 * 服务名 ctx.commands（dsh-commands，core 服务）；用 ctx.inject 动态注入
 * （与 webServer 同模式，无 commands 服务的 profile 不阻塞加载）。
 *
 * 用鸭子类型接口（不 import @deepseek-ai/dsh-commands），避免远程类型依赖
 * 与 rc/master 漂移。签名依据 master 源码 packages/interaction/commands：
 *   register(def: {name, description, handler(inv): {kind, text}}): () => void
 */
import type { AuditorService } from './auditor.js';
/** commands.register 兼容的最小接口。 */
export interface CommandsRegistrar {
    register(definition: {
        name: string;
        description: string;
        handler(invocation: {
            commandId: string;
            rawInput: string;
        }): {
            kind: string;
            text?: string;
        } | Promise<{
            kind: string;
            text?: string;
        }>;
    }): () => void;
}
export declare function registerAuditCommand(commands: CommandsRegistrar, auditor: AuditorService): () => void;
