// OpenVenues 小程序全局配置
//
// 服务器地址按运行环境自动选择（不用手改）：
//   · 开发者工具（模拟器跑在 Mac 上）→ 线上 HTTPS 域名（与真机/正式版同源）
//   · 真机 / 体验版 / 正式版          → 线上 HTTPS 域名
//
// 重要：开发者工具和小程序真机**都**指向线上 API，本地 dev server 只用来跑后台看数据。
// 这样：① 单一真源（线上 db），不会出现"两处各下一笔"造成的占用冲突
//      ② 在 DevTools 里点预约 = 顾客真实在体验版点的同一份订单，本地立刻看到
//
// 正式域名：https://blog.mgarden.org.cn/venue-api（nginx → 本机 8810, pm2: openvenues-api）
// 注意：该域名必须在小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」里登记，
//       否则真机/体验版直接拦掉请求。
const DEVTOOLS_HOST = 'https://blog.mgarden.org.cn/venue-api';  // DevTools 也走线上（单一真源）
const PROD_HOST = 'https://blog.mgarden.org.cn/venue-api';

// 临时：想在本地 dev server 上自测订单 / 报名（不推荐，会和线上脱节）
//      改回 'http://127.0.0.1:8810' + 把 server.js 启动时加 OPENVENUES_ALLOW_LOCAL_WRITE=1
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
