/**
 * AuditorService：纯业务类，不直接触碰 ctx（便于单测）。
 * 职责：环形缓冲 + 按事件计数 + 快照导出。
 */

import { writeFileSync } from 'node:fs'

export interface AuditRecord {
  event: string
  at: number
  seq: number
  mode: string
  args: unknown[]
  truncated: boolean
}

export interface AuditSnapshot {
  counts: Record<string, number>
  byMode: Record<string, number>
  recent: AuditRecord[]
  since: number
  seq: number
}

export interface AuditorOptions {
  bufferSize?: number
  truncateAt?: number
}

/** 参数快照的序列化上限，超出则截断并标记。 */
const TRUNCATED = Symbol('truncated')

export class AuditorService {
  private readonly bufferSize: number
  private readonly truncateAt: number
  private buffer: AuditRecord[] = []
  private counts = new Map<string, number>()
  private byMode = new Map<string, number>()
  private seq = 0
  private readonly since = Date.now()

  constructor(options: AuditorOptions = {}) {
    this.bufferSize = options.bufferSize ?? 500
    this.truncateAt = options.truncateAt ?? 4096
  }

  /** 记录一条事件。mode 由调用方（监听注册处）传入。 */
  record(event: string, mode: string, args: unknown[]): void {
    const snapshot = this.snapshotArgs(args)
    const rec: AuditRecord = {
      event,
      at: Date.now(),
      seq: this.seq++,
      mode,
      args: snapshot.args,
      truncated: snapshot.truncated,
    }
    this.buffer.push(rec)
    if (this.buffer.length > this.bufferSize) this.buffer.shift()
    this.counts.set(event, (this.counts.get(event) ?? 0) + 1)
    this.byMode.set(mode, (this.byMode.get(mode) ?? 0) + 1)
  }

  /** 取快照。since 传 seq 时只返回增量记录。 */
  snapshot(since = 0): AuditSnapshot {
    return {
      counts: Object.fromEntries(this.counts),
      byMode: Object.fromEntries(this.byMode),
      recent: since > 0 ? this.buffer.filter((r) => r.seq > since) : [...this.buffer],
      since: this.since,
      seq: this.seq,
    }
  }

  reset(): void {
    this.buffer = []
    this.counts.clear()
    this.byMode.clear()
    this.seq = 0
  }

  /** 同步写审计快照到文件（headless 场景，进程退出前调用）。 */
  dumpToFile(path: string): void {
    writeFileSync(path, JSON.stringify(this.snapshot(), null, 2))
  }

  /** 防御性序列化：大对象/循环引用/不可序列化值一律截断标记，不抛错。 */
  private snapshotArgs(args: unknown[]): { args: unknown[]; truncated: boolean } {
    try {
      const json = JSON.stringify(args)
      if (json.length > this.truncateAt) {
        // 只保留能容纳进上限的前缀，避免整条丢失
        const head = JSON.stringify(args[0])
        return { args: [head, TRUNCATED], truncated: true }
      }
      return { args, truncated: false }
    } catch {
      return { args: [TRUNCATED], truncated: true }
    }
  }
}
