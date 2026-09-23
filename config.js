// OpenVenues 小程序全局配置
//
// ⚠️ 本文件在开源仓里是**占位版**：`your-domain` 需要换成你自己的后端域名。
//    本地开发时把真实域名填进来即可（本仓用 git update-index --skip-worktree
//    把本地真实值对 git 隐藏，push 上去的永远是这份占位版）。
//    查看/取消隐藏：git ls-files -v config.js   →   'S' 表示已隐藏（skip-worktree）
//                  git update-index --no-skip-worktree config.js
//
// 服务器地址按运行环境自动选择（不用手改）：
//   · 开发者工具（模拟器跑在 Mac 上）→ 线上 HTTPS 域名（与真机/正式版同源）
//   · 真机 / 体验版 / 正式版          → 线上 HTTPS 域名
//
// 为什么开发者工具也走线上：① 单一真源（线上 db），不会出现"两处各下一笔"的占用冲突
//                          ② 在 DevTools 里点预约 = 顾客在体验版点的同一份订单，本地立刻看到
//
// 注意：该域名必须在小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」里登记，
//       否则真机/体验版直接拦掉请求。
const DEVTOOLS_HOST = 'https://your-domain/venue-api';  // DevTools 也走线上（单一真源）
const PROD_HOST = 'https://your-domain/venue-api';

// 临时：想在本地 dev server 上自测订单 / 报名（不推荐，会和线上脱节）
//      把 REAL_DEVICE_TARGET 改成 'lan'，并保证 LAN_HOST 是本机局域网 IP，
//      同时后端启动时加 OPENVENUES_ALLOW_LOCAL_WRITE=1
const LAN_HOST = 'http://YOUR_LAN_IP:8810';
const REAL_DEVICE_TARGET = 'prod'; // 'prod' | 'lan'

function detectPlatform() {
  try {
    if (typeof wx !== 'undefined' && wx.getDeviceInfo) {
      return (wx.getDeviceInfo() || {}).platform || '';
    }
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      return (wx.getSystemInfoSync() || {}).platform || '';
    }
  } catch (e) {
    /* 取不到就按真机处理 */
  }
  return '';
}

const platform = detectPlatform();
const isDevtools = platform === 'devtools';
const deviceHost = REAL_DEVICE_TARGET === 'lan' ? LAN_HOST : PROD_HOST;
const apiBase = isDevtools ? DEVTOOLS_HOST : deviceHost;

// 启动时打印一次，连不上时一眼看出小程序在找哪台机器
console.log('[config] platform=' + (platform || 'unknown') + ' apiBase=' + apiBase);

module.exports = {
  apiBase,
  isDevtools,
  theme: 'garden', // 默认主题色（与参考截图一致：绿色）
  version: '0.1.0',
};
