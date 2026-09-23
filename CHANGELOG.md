# Changelog

所有 OpenVenues 小程序客户端的改动记录在这里。版本号遵循 [Semantic Versioning](https://semver.org/)。

---

## v0.1.0 (2026-09-23)

### 首次稳定发布

#### 功能

- 8 个 tabBar 页面：首页 / 约场 / 畅打 / 畅打详情 / 订单列表 / 订单详情 / 我的 / 场馆详情
- 微信一键登录 + 头像昵称设置（`chooseAvatar` + `type="nicname"` 一键填入）
- 头像上传（`compressImage` + base64 走服务端落盘）

#### 约场页

- 绝对定位网格引擎（避开小程序 CSS Grid 不可靠）
- 同场地连续小时合并为一个订单（`merge.js`）
- 当天已过去时段置灰不可订 + 服务端拦截

#### 关键修复

- 输入框用外层 view + flex + 88rpx 高度修复被裁问题
- `custom-tab-bar` 用 `this.getTabBar()` 实例化
- 后台订单页 / 报名名单 显示微信用户头像昵称

#### API 地址自动选择（`config.js`）

- 开发者工具 + 真机 + 体验版 + 正式版 **都指向线上 https**（单一真源）
- DevTools 模拟器下单 = 顾客真实下单，避免本地/线上脱节导致时段冲突
- `LAN_HOST` 占位，临时联调改 `'lan'`

#### 对应后端

- [vincentlilee2/OpenVenues-server v0.1.0](https://github.com/vincentlilee2/OpenVenues-server/releases/tag/v0.1.0)（同步发布）

---

## [Unreleased]

暂无。