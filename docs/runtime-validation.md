# DSH 插件运行时验证方法论（无需真实 API Key）

> 作者：qing3a ｜ 日期：2026-08-14 ｜ 实证对象：dsh-event-auditor
> 生态背景：awesome-dsh-plugins 雷达显示 286 个插件仅 5 个做过运行时测试、0 个通过——**运行时验证是生态最大的空白**。本文给出一个可复制的方案，让任何插件作者都能无 key 验证自己的插件在真实 agent 循环里的行为。

---

## 一、为什么需要运行时验证

静态检查（schema、patch、类型）只能证明"插件能加载"，不能证明"插件在真实运行时不破坏行为"。

最典型的风险：**waterfall 事件监听器**。`tools/execute`、`approval/request`、`fs/write-intent` 这类事件的监听器必须调用 `next()` 并透传返回值，否则**静默吞掉下游所有默认行为**（仓库常设纪律）。这类错误只在真实 agent 循环运行时才暴露。

传统验证需要真实 LLM API key + 真金白银的 token。本文用 DSH 仓库自带的 **mock-llm 服务器** 零成本解决。

## 二、核心思路

```
mock-llm（脚本化 LLM 响应）  ←   DSH headless profile（真实 agent 循环）  ←  你的插件（挂监听）
        │                                                            │
        └────── 触发 tool_call_success ──────────────────────→ 走完整个 waterfall 链
                                                                   │
                                                            DSH_EVENT_AUDIT_DUMP 导出审计快照
```

- **headless profile**：无 UI 的 agent 循环，从命令行直接喂 prompt
- **mock-llm**：`@deepseek-ai/dsh-llm-mock-server`，可脚本化返回 `tool_call_success`（要求模型调用 bash 工具）→ 触发完整的 waterfall 链
- **DSH_EVENT_AUDIT_DUMP**：dsh-event-auditor 提供的环境变量，进程退出前把事件审计写盘

## 三、环境准备（一次性）

前置：Node ≥ 22、corepack、Git ≥ 2.26。仓库固定 pnpm 版本：

```sh
corepack enable && corepack prepare pnpm@11.7.0 --activate
```

blobless + sparse clone（省磁盘，C 盘 9.4G 也能跑）：

```sh
git clone --filter=blob:none --sparse --depth=50 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
# 一次加全！缺任何一个目录都会在 install 或 build 时踩坑：
git sparse-checkout set packages vendor native apps website patches scripts docs
pnpm install --frozen-lockfile
```

## 四、步骤一：构建 DSH（三层缺一不可）

```sh
pnpm run build:lib:host      # 缺 → typert.host.js 找不到
pnpm run build:lib:client    # 缺 → dsh-client-* 的 lib 找不到
pnpm --filter @deepseek-ai/dsh-web-frontend run build   # 缺 → web-app: frontend dist not built
```

（headless 验证理论上只需要 host lib，但 web profile 需要全部三层；都构建最省心。）

## 五、步骤二：双 profile 安装插件

```sh
pnpm dsh plugin --profile web add link:<你的插件绝对路径>
pnpm dsh plugin --profile headless add link:<你的插件绝对路径>
```

插件要支持 headless，需注意两点：
- **可选服务用 `ctx.inject` 动态注入**（不是 `inject` 数组，也不是 `ctx.get` 直接读）：
  ```ts
  ctx.inject(['webServer'], (sctx) => {
    sctx.effect(() => registerAuditRoutes(sctx.webServer, auditor), 'routes')
  })
  ```
  `ctx.get('webServer')` 在未注入时**直接抛错**（cordis 安全机制）；`inject: ['webServer']` 会阻塞无该服务的 profile 加载。
- **无 webServer 时的审计出口**：环境变量 dump（见下）。

## 六、步骤三：启动 mock-llm

```sh
pnpm run mock:llm --port 8000 --api-key mock-key \
  --sequence tool_call_success,success --repeat-last \
  --tool-name bash --tool-arguments '{"command":"ls"}'
```

要点：
- `tool_call_success` 让第一个请求返回"调用 bash 工具"——触发 `tools/pre-execute → execute → post-execute` 全链
- 第二个 `success` 让工具结果之后模型正常回复；`--repeat-last` 保证序列耗尽后仍复用最后一项
- ⚠️ 不要用 `pnpm run mock:llm -- --port ...`（多一个 `--` 会被当成位置参数报错）

## 七、步骤四：headless 跑 agent + 导出审计

```sh
DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1 \
DEEPSEEK_API_KEY=mock-key \
DSH_EVENT_AUDIT_DUMP=/tmp/audit.json \
pnpm dsh --profile headless "run the bash tool once and report"
```

正常输出 `mock response recovered` 表示 agent 完整跑完一轮。

## 八、步骤五：分析验证结果（什么算"通过"）

```sh
python -c "
import json
d = json.load(open('/tmp/audit.json'))
print('byMode:', d['byMode'])
print('事件类型:', list(d['counts'].keys()))
"
```

**通过标准**：
1. `byMode` 同时包含 `emit` 和 `waterfall`（waterfall 监听器确实注册了）
2. waterfall 链完整出现：`system-prompt/assemble → agent/pre-step → agent/request → llm/stream → tools/pre-execute → tools/execute → tools/post-execute`
3. **关键安全证明**：agent 完整跑完工具循环（输出 `mock response recovered`）——说明所有 waterfall 监听器都正确透传了 `next()`，零副作用
4. （web profile）`/api/audit/events`、`/audit` 页面均 200

## 九、实测结果（dsh-event-auditor，2026-08-14）

```
byMode: {'emit': 62, 'waterfall': 12}
总事件数: 74
事件类型: [tools/change, subagent/provider-added, session/created, agent/created,
          agent/session-start, agent/inbox/inserted, agent/status, agent/inbox/claimed,
          system-prompt/assemble, agent/pre-step, agent/request, llm/stream,
          tools/pre-execute, tools/execute, tools/post-execute, tools/result,
          subagent/provider-removed]
```

完整 agent 生命周期被捕获：`session/created → agent/created → session-start → inbox 系列 → (waterfall 链) → tools/result`。**这是雷达里第一个完整的运行时验证案例。**

## 十、常见坑

| 坑 | 现象 | 解法 |
|---|---|---|
| pnpm 版本不对 | install 报错 | corepack 激活仓库锁定的 11.7.0 |
| sparse 缺 vendor/ | `Cannot find package '@deepseek-ai/cordis'` | `git sparse-checkout add vendor`（cordis 全家在 vendor/） |
| 缺 native/apps/website | 构建/启动报缺包 | 一次性加全（见第三节） |
| 缺构建产物 | `lib/typert.host.js`、`frontend dist not built` | 三层构建缺一不可 |
| npm rc 与 master API 漂移 | 服务名/类名不一致 | 以实际运行版本 `lib/types/` 为准；鸭子类型接口解耦 |
| `ctx.get` 未注入服务 | `cannot get property without inject` | 用 `ctx.inject` 动态注入 |
| mock:llm 报"Unexpected argument" | 多传了 `--` | 去掉 `pnpm run mock:llm --` 的 `--` |
| git push 被墙 | 连 github.com:443 超时 | `gh api` Contents API 逐文件上传（参考 dsh-event-auditor/scripts/push-via-api.mjs） |

## 十一、附录：dsh-event-auditor

- 仓库：`github.com/qing3a/dsh-event-auditor`
- 功能：事件审计面板（22 emit + 10 waterfall 监听、settings 热改、headless dump、/audit 静态页）
- 设计文档含全部 API 漂移记录与验证细节

**欢迎其他插件作者用本方案验证自己的插件，并把结果贴回来**——一起把雷达的"运行时 0 通过"变成过去式。
