// OpenVenues 小程序全局配置
//
// 服务器地址按运行环境自动选择（不用手改）：
//   · 开发者工具（模拟器跑在 Mac 上）→ 本机 127.0.0.1（改代码只影响本地库）
//   · 真机 / 体验版 / 正式版          → 线上 HTTPS 域名（无需「不校验合法域名」）
//
// 正式域名已部署：https://blog.mgarden.org.cn/venue-api  （nginx → 本机 8810, pm2: openvenues-api）
// 注意：该域名必须在小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」里登记，
//       否则真机/体验版会直接拦掉请求（报「不在以下 request 合法域名列表中」）。
const DEVTOOLS_HOST = 'http://127.0.0.1:8810';
const PROD_HOST = 'https://blog.mgarden.org.cn/venue-api';

// 真机临时联调时指向本地 Mac（IP 填你的局域网地址；IP 变了跑 scripts/set-lan-ip.mjs 自动改）
// 默认值占位，clone 下来后请改成你自己电脑的 IP
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
