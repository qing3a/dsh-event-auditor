# dsh-event-auditor

Harness 事件流审计面板：观察事件类型、分发模式、计数与最近事件，帮助插件作者理解 DeepSeek Harness 内部发生了什么。

> 状态：**✅ 已在本地 DSH 源码环境验证运行**（2026-08-14）。v0.3：settings 热改 + headless dump + **waterfall 运行时捕获实证**（74 事件/12 waterfall 全部捕获，mock-llm 方案）。

## 功能

- 监听 22 个 harness `emit` 事件（agent 生命周期 / 会话 / 工具 / subagent / 配置）
- **v0.2**：监听 10 个 waterfall 事件（tools/execute、approval/request、fs/write-intent、llm/stream 等，观察性透传 next()）
- **v0.3**：settings 面板热改（installSettingsSection，实时开关分组无需重启）、headless dump（`DSH_EVENT_AUDIT_DUMP`）
- 按事件名与分发模式计数，环形缓冲保留最近 500 条
- `/audit` 面板（纯静态页）+ `/api/audit/events` JSON 接口（支持 `?since=` 增量）
- 分组开关（agent/session/tools/subagent/config/waterfall；config 默认关闭）

## 安装

```bash
# 开发模式（需 Node >= 22 + pnpm）
git clone https://github.com/your-handle/dsh-event-auditor.git
cd dsh-event-auditor && pnpm install && pnpm build

cd <path-to-deepseek-harness>
dsh plugin --profile <profile> add link:$(pwd)/dsh-event-auditor
dsh --profile <profile>
# 打开 http://localhost:<port>/audit
```

## 卸载

```bash
dsh plugin --profile <profile> remove @dsh-external/dsh-event-auditor
```

## 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `bufferSize` | `500` | 环形缓冲上限 |
| `truncateAt` | `4096` | 单条参数序列化上限（字节） |
| `groups.agent/session/tools/subagent` | `true` | 分组开关 |
| `groups.config` | `false` | 配置类事件默认关闭 |
| `groups.waterfall` | `true` | waterfall 事件观察（v0.2） |

## 事件来源

事件清单与声明位置：`docs/event-producer-consumer.zh.md`（仓库生成内容）。
waterfall 事件（`tools/execute`、`approval/request` 等）v0.2 已启用，签名逐条从源码确认（next 均无参），观察性透传 `next()`。

## 许可

MIT
