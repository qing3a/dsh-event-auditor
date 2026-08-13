# AGENTS.md — dsh-event-auditor

DSH（DeepSeek Harness）插件：事件流审计面板。给插件作者 / 开发者观察 harness 内部发生了什么。

## 仓库速览

- `src/index.ts` — cordis apply 风格入口（name / inject / apply / Config）
- `src/events.ts` — 事件清单与分组（来自官方 event-producer-consumer 矩阵 + 各包 declare module）
- `src/auditor.ts` — AuditorService：环形缓冲 + 计数 + 防御性序列化
- `src/routes.ts` — `/api/audit/events` 与 `/api/audit/reset` 路由
- `src/client/index.html` — 最小前端（纯 fetch 轮询，无框架）
- `cordis.patch.yml` — insert 声明（把自己插入 profile 插件清单）

## 开发

```sh
pnpm install
pnpm build        # tsc 编译 → lib/
```

- 编译产物为 ESM；`package.json` 设 `"type": "module"`，源码 import 必须带 `.js` 后缀
- `@deepseek-ai/cordis` 是 devDependency（仅类型）
- 运行时依赖：`@deepseek-ai/dsh-host-webserver`（提供 `ctx.httpServer`）、`@deepseek-ai/schemastery`

## 关键约束

- **事件签名纪律**：本插件用万能观察者 `(...args)` 监听，不做按事件名类型声明（事件参数形态不统一）
- **waterfall 纪律**：v0.1 只监听 emit 事件；waterfall 组（tools/execute、approval/request 等）加入前必须读声明位置源码确认签名，且只观察的监听器必须调用 `next()`
- **API 漂移（已踩坑）**：npm rc 版（0.0.1-rc.1）的 dsh-host-webserver 服务名是 `ctx.httpServer`、类名 `HttpServerService`；master 源码是 `ctx.webServer`、类名 `WebServer`。profile 从本地 workspace 链接时运行 master 语义 → 用 `webServer`。本插件用鸭子类型接口（`RouteRegistrar`）解耦类名，仅跟随服务名

## 本地验证（已通过 2026-08-14）

在 deepseek-harness 源码 checkout 中（sparse 需含 packages/vendor/native/apps/website/patches/scripts/docs）：

```sh
pnpm install --frozen-lockfile
pnpm run build:lib:host && pnpm run build:lib:client
pnpm --filter @deepseek-ai/dsh-web-frontend run build   # web profile 需要 dist
pnpm dsh plugin --profile web add link:<本插件绝对路径>
pnpm dsh --profile web     # 启动后 dsh web: http://127.0.0.1:3080
curl http://127.0.0.1:3080/api/audit/events   # → 200，含 tools/change 等事件计数
curl -X POST http://127.0.0.1:3080/api/audit/reset  # → {"ok":true}
```

验证结果：插件激活、监听 57 次 `tools/change`、GET/POST 接口均 200。
