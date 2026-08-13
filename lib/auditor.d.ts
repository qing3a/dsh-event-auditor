/**
 * AuditorService：纯业务类，不直接触碰 ctx（便于单测）。
 * 职责：环形缓冲 + 按事件计数 + 快照导出。
 */
export interface AuditRecord {
    event: string;
    at: number;
    seq: number;
    mode: string;
    args: unknown[];
    truncated: boolean;
}
export interface AuditSnapshot {
    counts: Record<string, number>;
    byMode: Record<string, number>;
    recent: AuditRecord[];
    since: number;
    seq: number;
}
export interface AuditorOptions {
    bufferSize?: number;
    truncateAt?: number;
}
export declare class AuditorService {
    private readonly bufferSize;
    private readonly truncateAt;
    private buffer;
    private counts;
    private byMode;
    private seq;
    private readonly since;
    constructor(options?: AuditorOptions);
    /** 记录一条事件。mode 由调用方（监听注册处）传入。 */
    record(event: string, mode: string, args: unknown[]): void;
    /** 取快照。since 传 seq 时只返回增量记录。 */
    snapshot(since?: number): AuditSnapshot;
    reset(): void;
    /** 防御性序列化：大对象/循环引用/不可序列化值一律截断标记，不抛错。 */
    private snapshotArgs;
}
