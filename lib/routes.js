/**
 * HTTP 路由：/api/audit/events 与 /api/audit/reset。
 *
 * 运行时服务：ctx.webServer（dsh-host-webserver）。⚠️ 注意 API 漂移：
 *  - master 源码：类 WebServer，服务名 ctx.webServer
 *  - npm rc 版（0.0.1-rc.1）：类 HttpServerService，服务名 ctx.httpServer
 * 本插件用鸭子类型接口（register 签名两者一致），类型不绑定具体类名，
 * 运行时跟随实际安装（profile 链接到本地源码时是 webServer）。
 */
import { readFileSync } from 'node:fs';
function json(res, code, body) {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}
/** 注册审计路由，返回总 disposer（卸载全部路由）。 */
export function registerAuditRoutes(webServer, auditor) {
    // 静态面板页：从 lib/ 相对解析 src/client/index.html（发布时 files 包含 src/client）
    let auditHtml = '';
    try {
        auditHtml = readFileSync(new URL('../src/client/index.html', import.meta.url), 'utf8');
    }
    catch {
        // 发布形态不含 src 时降级：返回占位
        auditHtml = '<!doctype html><meta charset="utf-8"><title>event-auditor</title><p>panel page unavailable</p>';
    }
    const disposers = [
        webServer.register({
            kind: 'exact',
            path: '/audit',
            handler: (_req, res) => {
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(auditHtml);
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/audit/events',
            handler: (req, res) => {
                const since = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('since') ?? 0);
                json(res, 200, auditor.snapshot(Number.isFinite(since) ? since : 0));
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/audit/reset',
            handler: (_req, res) => {
                auditor.reset();
                json(res, 200, { ok: true });
            },
        }),
    ];
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
