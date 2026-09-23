# OpenVenues 场馆预定小程序 · 微信小程序客户端

按小时订场 + 畅打团购，配合 [`OpenVenues-server`](../OpenVenues-server) 后端使用。

> **两个仓必须都 clone**：本仓是小程序端，API 在 [OpenVenues-server](https://github.com/vincentlilee2/OpenVenues-server) 里。

## 5 步跑起来

```bash
# 1) 拿到客户端代码
git clone https://github.com/vincentlilee2/OpenVenues-miniapp.git
cd OpenVenues-miniapp

# 2) 安装依赖 + 导入到开发者工具
#    用微信开发者工具「导入项目」→ 选本目录
#    注意：project.config.json 已写好 AppID，导入时按提示选择「测试号」或填自己的 AppID

# 3) 启动后端（在另一个终端）
#    详见 OpenVenues-server/README.md 的 5 步说明

# 4) 改 config.js：填你的 Mac 局域网 IP（真机预览时需要）
#    或者把 REAL_DEVICE_TARGET 改为 'prod' → 走线上
sed -i '' 's/YOUR_LAN_IP/192.168.1.x/' config.js   # ← 改成你的

# 5) 微信开发者工具点「编译」→ 模拟器应能看到场馆列表
```

## `config.js` 怎么选服务器地址

```js
const DEVTOOLS_HOST = 'https://your-domain/venue-api';  // 开发者工具（也走线上，单一真源）
const LAN_HOST      = 'http://YOUR_LAN_IP:8810';         // 真机与本机同 WiFi（临时联调）
const PROD_HOST     = 'https://your-domain/venue-api';   // 体验版/正式版
const REAL_DEVICE_TARGET = 'prod';                       // 'prod' | 'lan'
```

**把 `your-domain` 换成你自己的后端域名**（后端仓 `OpenVenues-server` 的部署域名，含 `/venue-api` 前缀）。

### 开源占位双轨（本项目约定）

仓里提交的 `config.js` 与 `project.config.json` 是**占位版**（`your-domain` / `touristappid`），
本地真实值靠 `git update-index --skip-worktree` 对 git 隐藏——本地开发照常，push 恒为占位。

```bash
# 看某个文件是否处于隐藏态（'S' 前缀 = skip-worktree 生效）
git ls-files -v config.js project.config.json

# 需要改「占位版」时先解除隐藏，改完再重新隐藏
git update-index --no-skip-worktree config.js project.config.json
#   ...编辑占位内容...
git update-index --skip-worktree config.js project.config.json
```

`REAL_DEVICE_TARGET = 'lan'` 时真机走 `LAN_HOST`（用于本地临时联调）。
默认 `prod`（走线上 https）。

## 项目结构

```
pages/
  index/         首页（场馆列表）
  book/          约场页（绝对定位网格，避开小程序 CSS Grid 不可靠）
    grid.js          排版引擎（可在 Node 单测）
    merge.js         连续小时合并
    book.{js,wxml,wxss}
  promos/        畅打活动列表
  promo-detail/  畅打详情 + 报名
  order-list/    订单列表（按订单汇总）
  order-detail/  订单详情
  my/            我的（微信一键登录、头像昵称设置）
  venue-detail/  场馆详情
api/            HTTP 请求 + 接口
  index.js          各业务接口
  request.js        Bearer token + 401 自动重登
custom-tab-bar/ 自定义 tabBar（避免官方限制）
components/     通用组件
utils/
  session.js        登录态（token、UID）
  avatar.js         头像上传（compressImage + base64）
  time.js           时间解析
```

## 测试

测试脚本在客户端仓的 `scripts/` 下，跑前先 `git init`（如果还没）：

```bash
env -u PYTHONPATH node scripts/verify-login.mjs
```

需要服务端运行中（默认 `127.0.0.1:8810`）。

## 上传体验版 / 正式

按微信开发者工具要求：先在公众平台登记 request/downloadFile 合法域名（正式域名见 `OpenVenues-server/README.md`），然后「上传」按钮即可。

---

参考后端仓的 README：[OpenVenues-server](https://github.com/vincentlilee2/OpenVenues-server)