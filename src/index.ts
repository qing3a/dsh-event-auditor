/**
 * dsh-event-auditor 入口：apply 风格 cordis 插件。
 *
 * 已按实际运行环境核实的 API：
 *  - 依赖注入：ctx.webServer（dsh-host-webserver，master 语义）。
 *    ⚠️ npm rc 版服务名是 httpServer，有漂移；profile 链接本地源码时用 webServer。
 *  - schemastery：@deepseek-ai/schemastery 默认导入
 *  - ctx.effect / ctx.on：cordis 4（事件监听随插件卸载自动清理）
 *
 * 事件监听用万能观察者（转义类型），因为各事件参数形态不统一
 * （agent/* 是单 payload，tools/result 是双参数）——审计工具观察一切即可。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { AuditorService } from './auditor.js'
import { ENHANCED_WATERFALL_EVENTS, EVENT_GROUPS, WATCHED_EVENTS } from './events.js'
import { registerAuditRoutes, type RouteRegistrar } from './routes.js'

export const name = 'event-auditor'

/** 依赖注入：webServer（路由注册）。settings 留待 v0.3 接入热改。 */
export const inject = ['webServer']

export interface Config {
  enabled: boolean
  bufferSize: number
  truncateAt: number
  groups: {
    agent: boolean
    session: boolean
    tools: boolean
    subagent: boolean
    config: boolean
    waterfall: boolean
  }
}

export const Config: z<Config> = z.object({
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
})

/**
 * 万能观察者（emit 事件）：任意事件名的宽松监听器，观察零副作用。
 * cordis 4 的 ctx.on 未声明事件名也可在运行时监听（emit 按字符串查表）。
 */
function watch(ctx: Context, event: string, handler: (...args: unknown[]) => void): () => void {
  const on = ctx.on as unknown as (name: string, listener: (...args: unknown[]) => void) => () => void
  return on(event, handler)
}

/**
 * 万能观察者（waterfall 事件）：最后一个参数是 next()，只观察的监听器
 * 必须调用 next() 并透传返回值，否则静默吞掉下游默认行为（仓库常设纪律）。
 * 已确认所有 waterfall 的 next 均无参。
 */
function watchWaterfall(
  ctx: Context,
  event: string,
  handler: (...args: unknown[]) => void,
): () => void {
  const on = ctx.on as unknown as (
    name: string,
    listener: (...args: unknown[]) => unknown,
  ) => () => void
  return on(event, (...args: unknown[]) => {
    handler(...args)
    const next = args[args.length - 1]
    if (typeof next === 'function') {
      return (next as () => unknown)()
    }
    return undefined
  })
}

export function apply(ctx: Context, config?: Config): void {
  const resolved: Config = {
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
  }

  if (!resolved.enabled) return

  const auditor = new AuditorService({
    bufferSize: resolved.bufferSize,
    truncateAt: resolved.truncateAt,
  })

  // 按分组开关注册监听。emit 事件观察零副作用。
  for (const [eventName, mode] of WATCHED_EVENTS) {
    const group = Object.keys(EVENT_GROUPS).find((g) => EVENT_GROUPS[g].has(eventName))
    if (group && !resolved.groups[group as keyof Config['groups']]) continue
    ctx.effect(
      () =>
        watch(ctx, eventName, (...args: unknown[]) => {
          auditor.record(eventName, mode, args)
        }),
      `event-auditor: watch ${eventName}`,
    )
  }

  // waterfall 组（v0.2）：观察 + 必须 next() 透传，保证零副作用。
  if (resolved.groups.waterfall) {
    for (const [eventName, mode] of ENHANCED_WATERFALL_EVENTS) {
      ctx.effect(
        () =>
          watchWaterfall(ctx, eventName, (...args: unknown[]) => {
            auditor.record(eventName, mode, args)
          }),
        `event-auditor: watch ${eventName}`,
      )
    }
  }

  // HTTP 接口（register 返回 disposer，effect 负责卸载）
  const webServer = (ctx as unknown as { webServer: RouteRegistrar }).webServer
  ctx.effect(
    () => registerAuditRoutes(webServer, auditor),
    'event-auditor: routes',
  )
}
