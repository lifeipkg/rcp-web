# rcp-web · 风控运营台

平台前端。**只经 `api-gateway` 访问后端**，不直连任何巡查线或数据服务（红线 RL-002）。

零构建：纯静态 HTML/CSS/JS，直接打开 `index.html` 或由 nginx 托管即可跑。

## 能做什么

1. **提交巡查事件**：选巡查线、填事件 ID 与版本、编辑 payload → `POST /api/v1/patrol/dispatch`；
2. **看裁决**：决策徽章、风险分、原因、处置动作、`accepted` / `stateRollbackProtected` 标记、原始响应；
3. **验纪律**：`重放同版本` 按钮用于看幂等拒绝，`版本 +1` 用于看状态机前进；
4. **会话记录**：本次打开期间的提交历史（不落库，刷新即清）。

## 本地跑

```bash
# 方式一：直接打开
start index.html

# 方式二：静态服务器（避免 file:// 的 CORS 限制）
python -m http.server 5173

# 先起后端（在 rcp-api-gateway 仓）
java -jar target/api-gateway-1.0.0.jar --server.port=8080
```

打开后点「探测巡查线」验证网关连通；网关地址存在 localStorage（键 `rcp.apiBase`）。

## 注意

- 网关需允许跨域：本地开发用不同端口时，请在网关侧确认 CORS 配置，或把页面与网关放到同源（nginx/ingress）下访问；
- 页面不做本地判定，所有结论都来自后端，避免出现"前端一套规则、后端一套规则"的双真源。
