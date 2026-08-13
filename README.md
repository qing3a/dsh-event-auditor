# dsh-event-auditor

Harness 事件流审计面板：观察事件类型、分发模式、计数与最近事件，帮助插件作者理解 DeepSeek Harness 内部发生了什么。

> 状态：**✅ 已在本地 DSH 源码环境验证运行**（2026-08-14，事件计数 + GET/POST 接口均通过）。

## 功能

- 监听 22 个 harness `emit` 事件（agent 生命周期 / 会话 / 工具 / subagent / 配置）
- 按事件名与分发模式计数，环形缓冲保留最近 500 条
- `/audit` 面板实时刷新 + `/api/audit/events` JSON 接口
- 分组开关（默认关闭配置组）

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

## 事件来源

事件清单与声明位置：`docs/event-producer-consumer.zh.md`（仓库生成内容）。
waterfall 事件（`tools/execute`、`approval/request` 等）列为第二版增强项，加入前需确认 listener 签名并遵守 **next() 纪律**。

## 许可

MIT
