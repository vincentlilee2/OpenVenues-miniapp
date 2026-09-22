// 微信一键登录
//   wx.login() → code → POST /api/auth/wx-login
//   → 服务端调 jscode2session 换真实 openid，签发 token 入库
//   → 小程序存 token，之后请求带 Authorization: Bearer <token>
// 身份由真实 openid 决定：同一微信 + 同一小程序 = 永远同一个用户（换设备/清缓存都不丢订单）
const { apiBase } = require('../config.js');

const TOKEN_KEY = 'wx_token';
const UID_KEY = 'wx_uid';
const PROFILE_KEY = 'wx_profile';

let _inflight = null; // 并发登录去重

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}
function getUid() {
  return wx.getStorageSync(UID_KEY) || '';
}
function getProfile() {
  return wx.getStorageSync(PROFILE_KEY) || null;
}
function isLoggedIn() {
  return !!getToken();
}

/**
 * 头像地址转成可直接给 <image src> 用的完整地址
 * 服务端存的是相对路径（/uploads/avatars/xxx.jpg），本机临时路径/网络图原样返回
 */
function displayAvatar(a) {
  if (!a) return '';
  if (/^(https?:|wxfile:|data:)/.test(a)) return a;
  return apiBase + a;
}

function saveSession(data) {
  wx.setStorageSync(TOKEN_KEY, data.token);
  wx.setStorageSync(UID_KEY, data.uid);
  if (data.user) wx.setStorageSync(PROFILE_KEY, data.user);
}

function setProfile(user) {
  wx.setStorageSync(PROFILE_KEY, user || null);
}

function clear() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(UID_KEY);
  wx.removeStorageSync(PROFILE_KEY);
  wx.removeStorageSync('openid'); // 清掉老版本留下的伪 openid
}

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res && res.code) resolve(res.code);
        else reject(new Error('wx.login 未返回 code'));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || 'wx.login 调用失败'));
      },
    });
  });
}

/**
 * 登录（force=true 时忽略缓存强制重新登录）
 * @returns {Promise<string>} token
 */
function login(force) {
  if (!force && getToken()) return Promise.resolve(getToken());
  if (_inflight) return _inflight;

  _inflight = new Promise((resolve, reject) => {
    wxLoginCode()
      .then(
        (code) =>
          new Promise((res2, rej2) => {
            wx.request({
              url: apiBase + '/api/auth/wx-login',
              method: 'POST',
              header: { 'content-type': 'application/json' },
              data: { code },
              success(r) {
                const body = r.data || {};
                // 服务端没配 WX_APPID/WX_APPSECRET 时返回 503 + code = WX_CREDENTIALS_MISSING
                // 小程序端拿到这个 code 应当让登录按钮变成"未启用"提示，而不是当成错误
                if (body.code === 'WX_CREDENTIALS_MISSING') {
                  const err = new Error(body.error || '微信登录未启用');
                  err.code = 'WX_CREDENTIALS_MISSING';
                  rej2(err);
                  return;
                }
                if (r.statusCode >= 200 && r.statusCode < 300 && body.ok) {
                  saveSession(body.data);
                  console.log('[login] 微信登录成功 uid=', body.data.uid, 'isNew=', body.data.isNew);
                  res2(body.data.token);
                } else {
                  rej2(new Error(body.error || '登录失败 HTTP ' + r.statusCode));
                }
              },
              fail(err) {
                console.error('[login FAIL]', apiBase, err);
                rej2(new Error('连不上服务器 ' + apiBase + '（检查手机与电脑是否同一 WiFi，或该 IP 是否已变）'));
              },
            });
          })
      )
      .then(resolve, reject);
  });

  // 无论成败都释放，避免卡住后续重试
  _inflight.then(
    () => {
      _inflight = null;
    },
    () => {
      _inflight = null;
    }
  );
  return _inflight;
}

/** 请求封装里 await 它：没登录就先去登录 */
function ready() {
  if (getToken()) return Promise.resolve(getToken());
  return login(false);
}

module.exports = {
  displayAvatar,
  getToken,
  getUid,
  getProfile,
  setProfile,
  isLoggedIn,
  login,
  ready,
  clear,
};
