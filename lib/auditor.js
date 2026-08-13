/**
 * AuditorService：纯业务类，不直接触碰 ctx（便于单测）。
 * 职责：环形缓冲 + 按事件计数 + 快照导出。
 */
/** 参数快照的序列化上限，超出则截断并标记。 */
const TRUNCATED = Symbol('truncated');
export class AuditorService {
    bufferSize;
    truncateAt;
    buffer = [];
    counts = new Map();
    byMode = new Map();
    seq = 0;
    since = Date.now();
    constructor(options = {}) {
        this.bufferSize = options.bufferSize ?? 500;
        this.truncateAt = options.truncateAt ?? 4096;
    }
    /** 记录一条事件。mode 由调用方（监听注册处）传入。 */
    record(event, mode, args) {
        const snapshot = this.snapshotArgs(args);
        const rec = {
            event,
            at: Date.now(),
            seq: this.seq++,
            mode,
            args: snapshot.args,
            truncated: snapshot.truncated,
        };
        this.buffer.push(rec);
        if (this.buffer.length > this.bufferSize)
            this.buffer.shift();
        this.counts.set(event, (this.counts.get(event) ?? 0) + 1);
        this.byMode.set(mode, (this.byMode.get(mode) ?? 0) + 1);
    }
    /** 取快照。since 传 seq 时只返回增量记录。 */
    snapshot(since = 0) {
        return {
            counts: Object.fromEntries(this.counts),
            byMode: Object.fromEntries(this.byMode),
            recent: since > 0 ? this.buffer.filter((r) => r.seq > since) : [...this.buffer],
            since: this.since,
            seq: this.seq,
        };
    }
    reset() {
        this.buffer = [];
        this.counts.clear();
        this.byMode.clear();
        this.seq = 0;
    }
    /** 防御性序列化：大对象/循环引用/不可序列化值一律截断标记，不抛错。 */
    snapshotArgs(args) {
        try {
            const json = JSON.stringify(args);
            if (json.length > this.truncateAt) {
                // 只保留能容纳进上限的前缀，避免整条丢失
                const head = JSON.stringify(args[0]);
                return { args: [head, TRUNCATED], truncated: true };
            }
            return { args, truncated: false };
        }
        catch {
            return { args: [TRUNCATED], truncated: true };
        }
    }
}
