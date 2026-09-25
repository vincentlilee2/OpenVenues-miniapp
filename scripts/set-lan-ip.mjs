// 把 config.js 里的 LAN_HOST 更新成当前 Mac 的局域网 IP
// 用法：env -u PYTHONPATH node scripts/set-lan-ip.mjs
// 什么时候需要：换 WiFi、重启路由器、Mac 重连网络后（手机连不上时先跑这个）
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(__dirname, '..', 'config.js');

function detectIp() {
  for (const iface of ['en0', 'en1', 'en2']) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (ip) return { ip, iface };
    } catch (_) {
      /* 该网卡没有地址 */
    }
  }
  return null;
}

const found = detectIp();
if (!found) {
  console.error('✗ 没找到局域网 IP（Mac 是不是没连 WiFi/网线？）');
  process.exit(1);
}

const src = fs.readFileSync(cfgPath, 'utf8');
const m = src.match(/const LAN_HOST = 'http:\/\/([0-9.]+):(\d+)'/);
if (!m) {
  console.error('✗ config.js 里没找到 LAN_HOST 那一行');
  process.exit(1);
}

const oldIp = m[1];
const next = src.replace(
  /const LAN_HOST = 'http:\/\/[0-9.]+:(\d+)'/,
  `const LAN_HOST = 'http://${found.ip}:${m[2]}'`
);
fs.writeFileSync(cfgPath, next);

console.log(`  ✓ LAN_HOST: ${oldIp} → ${found.ip}  (网卡 ${found.iface})`);
if (oldIp === found.ip) console.log('    （IP 没变，无需重新上传体验版）');
else console.log('    ⚠ config.js 变了 → 需要在开发者工具重新「上传」体验版才生效');
