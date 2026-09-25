// 小程序登录客户端逻辑验证：用假的 wx 环境跑真实的 session.js / request.js / api/index.js
// （开发者工具里跑不到的「401 自动重登重试」「并发登录去重」「token 存储」在这里验证）
// 用法：env -u PYTHONPATH node scripts/verify-login.mjs
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(__dirname, '..');
const SERVER = path.join(APP, '..', 'OpenVenues-server');
const DB = path.join(SERVER, 'data', 'venue.db');
// better-sqlite3 装在服务端，从那边解析
const Database = createRequire(path.join(SERVER, 'package.json'))('better-sqlite3');
const db = new Database(DB);
const require = createRequire(import.meta.url);

const errs = [];
const ok = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${extra !== undefined ? ' → ' + extra : ''}`); errs.push(name); }
};

// ===== 假 wx 环境 =====
const TEST_OPENID = '__T_CLIENT_OPENID__';
db.prepare('DELETE FROM venue_user_tokens WHERE openid = ?').run(TEST_OPENID);
db.prepare('DELETE FROM venue_users WHERE openid = ?').run(TEST_OPENID);
const uid = 'u_' + crypto.randomBytes(6).toString('hex');
db.prepare('INSERT INTO venue_users (uid, openid) VALUES (?, ?)').run(uid, TEST_OPENID);
const realToken = crypto.randomBytes(32).toString('hex');
db.prepare(
  "INSERT INTO venue_user_tokens (token, uid, openid, expires_at) VALUES (?, ?, ?, datetime('now','+90 days'))"
).run(realToken, uid, TEST_OPENID);

const stats = { login: 0, requests: 0, loginBody: null, lastHeaders: null };
let store = {};
let loginCodeResult = 'fake_code_from_wx';

global.wx = {
  // 让 config.js 判定为开发者工具环境（apiBase 用 127.0.0.1）
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getSystemInfoSync: () => ({ platform: 'devtools' }),
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  // 微信头像：chooseAvatar 给的是本机临时文件 → compressImage + readFile(base64)
  compressImage: ({ src, success }) => setTimeout(() => success({ tempFilePath: 'wxfile://tmp_compressed.jpg' }), 5),
  getFileSystemManager: () => ({
    readFile: ({ filePath, encoding, success }) => setTimeout(() => success({ data: PNG_1PX }), 5),
  }),
  login({ success, fail }) {
    stats.login += 1;
    setTimeout(() => success({ code: loginCodeResult }), 5);
  },
  request({ url, method = 'GET', data, header = {}, success, fail }) {
    stats.requests += 1;
    stats.lastHeaders = header;
    // 登录接口 → 让服务端真跑一遍（假 code 时会 401）；
    // 但为了验证后续链路，这里模拟「拿到真 token 的登录成功响应」
    if (url.endsWith('/api/auth/wx-login')) {
      stats.loginBody = data;
      setTimeout(() => success({ statusCode: 200, data: { ok: true, data: { token: realToken, uid, isNew: false, user: { uid, nickname: null, avatar: null, phone: null } } } }), 5);
      return;
    }
    // 其它接口 → 真打到本地服务（检验 token 真的被服务端接受）
    fetch(url, { method, headers: header, body: data ? JSON.stringify(data) : undefined })
      .then(async (r) => success({ statusCode: r.status, data: await r.json().catch(() => ({})) }))
      .catch((e) => fail({ errMsg: e.message }));
  },
};
global.getApp = () => ({ globalData: {} });

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const session = require(path.join(APP, 'utils/session.js'));
const api = require(path.join(APP, 'api/index.js'));

console.log('--- 1) 首次启动：无 token → 自动微信登录并拿到 token ---');
ok('初始未登录', session.isLoggedIn() === false);
const t1 = await session.login();
ok('session.login() 返回 token', t1 === realToken, String(t1).slice(0, 12));
ok('token 已写入 storage', wx.getStorageSync('wx_token') === realToken);
ok('uid 已写入 storage', session.getUid() === uid);
ok('wx.login 被调用 1 次', stats.login === 1, stats.login);
ok('登录请求体只带 code', JSON.stringify(stats.loginBody) === '{"code":"fake_code_from_wx"}', JSON.stringify(stats.loginBody));

console.log('\n--- 2) 已登录时不重复登录 ---');
await session.ready();
await session.ready();
ok('已有 token 时 ready() 不再调用 wx.login', stats.login === 1, stats.login);

console.log('\n--- 3) 带 token 打真实接口（服务端查表校验）---');
const orders = await api.myOrders();
ok('GET /api/orders/my 成功', Array.isArray(orders), JSON.stringify(orders).slice(0, 80));
ok('请求头带 Authorization: Bearer', String(stats.lastHeaders.Authorization).startsWith('Bearer '), stats.lastHeaders.Authorization);
const me = await api.authMe();
ok('GET /api/auth/me 返回当前用户 uid', me && me.uid === uid, JSON.stringify(me));
ok('/api/auth/me 不回传完整 openid', me && me.openid === undefined && me.openidTail === TEST_OPENID.slice(-6), JSON.stringify(me));

console.log('\n--- 4) token 失效 → 自动清掉、重新登录、重试原请求（关键恢复路径）---');
store.wx_token = 'deadbeef'.repeat(8); // 伪造一个服务端不认的 token
stats.login = 0;
const orders2 = await api.myOrders();
ok('401 后仍拿到数据（已自动重登重试）', Array.isArray(orders2), JSON.stringify(orders2).slice(0, 80));
ok('触发了一次重新登录', stats.login === 1, stats.login);
ok('storage 里换成了有效 token', session.getToken() === realToken);

console.log('\n--- 5) 并发登录去重（多个页面同时请求）---');
session.clear();
stats.login = 0;
const results = await Promise.all([session.login(), session.login(), session.login()]);
ok('3 个并发登录只调用 1 次 wx.login', stats.login === 1, stats.login);
ok('三个结果都是同一个 token', results.every((t) => t === realToken));

console.log('\n--- 6) 真实登录接口：假 code 时给出可读错误 ---');
loginCodeResult = 'definitely_not_a_valid_code';
const r6 = await fetch('http://127.0.0.1:8810/api/auth/wx-login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: loginCodeResult }),
});
const b6 = await r6.json();
ok('无效 code → 401 + 中文提示', r6.status === 401 && /code/.test(b6.error), `${r6.status} ${JSON.stringify(b6)}`);

console.log('\n--- 7) 头像上传（微信本机临时文件 → 服务端落盘 → 可长期访问）---');
const avatarUtil = require(path.join(APP, 'utils/avatar.js'));
ok('识别微信临时路径（需要上传）', avatarUtil.isLocalTemp('wxfile://tmp_abc.jpg') === true);
ok('识别服务端相对路径（无需再传）', avatarUtil.isLocalTemp('/uploads/avatars/a.jpg') === false);
const rel = await avatarUtil.uploadAvatar('wxfile://tmp_original.png');
ok('上传后拿到服务端相对路径', /^\/uploads\/avatars\/.+\.(jpg|png)$/.test(rel), rel);
const imgRes = await fetch('http://127.0.0.1:8810' + rel);
ok('上传的图能通过 URL 访问（别人/后台也能看到）', imgRes.status === 200, imgRes.status);
const meAfter = await api.authMe();
ok('/api/auth/me 的头像已更新为该路径', meAfter.avatar === rel, JSON.stringify(meAfter));
ok('displayAvatar 把相对路径拼成完整地址', session.displayAvatar(rel) === 'http://127.0.0.1:8810' + rel, session.displayAvatar(rel));
ok('网络图/临时路径原样返回', session.displayAvatar('https://a.com/x.png') === 'https://a.com/x.png');
const saved = await api.saveProfile({ nickname: '微信昵称测试', avatar: rel });
ok('昵称+头像一起保存成功', saved.nickname === '微信昵称测试' && saved.avatar === rel, JSON.stringify(saved));
const fsMod = await import('node:fs');
const pathMod = await import('node:path');
const avatarFile = pathMod.join(APP, '..', 'OpenVenues-server', 'data', rel.replace('/uploads/', 'uploads/'));
if (fsMod.existsSync(avatarFile)) fsMod.unlinkSync(avatarFile);

console.log('\n--- 8) 退出登录清理本地 + 服务端 token ---');
session.clear();
ok('本地 token 已清', session.getToken() === '' && !session.isLoggedIn());
ok('老版本伪 openid 键也被清', wx.getStorageSync('openid') === '');

// 清理
db.prepare('DELETE FROM venue_user_tokens WHERE uid = ?').run(uid);
db.prepare('DELETE FROM venue_users WHERE uid = ?').run(uid);
ok('测试数据已清理', db.prepare('SELECT COUNT(*) n FROM venue_users WHERE openid = ?').get(TEST_OPENID).n === 0);
db.close();

console.log('\n--- 结果 ---');
console.log(errs.length ? errs.map((e) => '  ✗ ' + e).join('\n') : '  ✓ 全部通过');
process.exit(errs.length ? 1 : 0);
