/**
 * /audit 会话命令：直接在对话/UI 里查看事件审计摘要，无需打开面板。
 * 服务名 ctx.commands（dsh-commands，core 服务）；用 ctx.inject 动态注入
 * （与 webServer 同模式，无 commands 服务的 profile 不阻塞加载）。
 *
 * 用鸭子类型接口（不 import @deepseek-ai/dsh-commands），避免远程类型依赖
 * 与 rc/master 漂移。签名依据 master 源码 packages/interaction/commands：
 *   register(def: {name, description, handler(inv): {kind, text}}): () => void
 */
/** 渲染审计摘要为给人看的文本。 */
function renderSummary(auditor) {
    const snap = auditor.snapshot();
    const total = Object.values(snap.counts).reduce((a, b) => a + b, 0);
    const lines = [];
    lines.push(`audit: ${total} events since ${new Date(snap.since).toLocaleTimeString()}`);
    const modeSummary = Object.entries(snap.byMode)
        .map(([m, n]) => `${m} ${n}`)
        .join(' / ');
    lines.push(`  byMode: ${modeSummary}`);
    const counts = Object.entries(snap.counts).sort((a, b) => b[1] - a[1]);
    for (const [name, n] of counts) {
        lines.push(`  ${name}: ${n}`);
    }
    const recent = snap.recent.slice(-5);
    if (recent.length > 0) {
        lines.push('recent:');
        for (const rec of recent) {
            lines.push(`  #${rec.seq} ${rec.event} (${rec.mode}) @ ${new Date(rec.at).toLocaleTimeString()}`);
        }
    }
    return lines.join('\n');
}
export function registerAuditCommand(commands, auditor) {
    return commands.register({
        name: 'audit',
        description: '查看 dsh-event-auditor 捕获的事件摘要（byMode / 计数 / 最近事件）',
        handler: () => {
            return { kind: 'success', text: renderSummary(auditor) };
        },
    });
}
