// 统一请求封装：自动带 Authorization: Bearer <token> + 解包 {ok, data, error}
// 401（登录过期/未登录）→ 自动清 token、重新微信登录一次并重试原请求
const { apiBase } = require('../config.js');
const session = require('../utils/session.js');

function rawRequest(opts, retried) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json', ...(opts.header || {}) };
    const needAuth = opts.auth !== false;
    if (needAuth) {
      const token = session.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    }
    console.log('[request]', opts.method || 'GET', opts.url, needAuth ? '(auth)' : '');
    wx.request({
      url: apiBase + opts.url,
      method: opts.method || 'GET',
      data: opts.data,
      header: headers,
      success(res) {
        const body = res.data || {};
        if (res.statusCode === 401 && needAuth && !retried) {
          console.warn('[request] 401，重新登录后重试:', opts.url);
          session.clear();
          session
            .login(true)
            .then(() => rawRequest(opts, true))
            .then(resolve, reject);
          return;
        }
        console.log('[request OK]', opts.url, 'status', res.statusCode, 'body', JSON.stringify(body).slice(0, 200));
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok) {
          resolve(body.data);
        } else {
          reject({ status: res.statusCode, error: body.error || `HTTP ${res.statusCode}` });
        }
      },
      fail(err) {
        console.error('[request FAIL]', opts.url, err);
        // 把服务器地址带进提示：真机连不上时最容易排查的一条信息
        reject({
          status: -1,
          error: '连不上服务器 ' + apiBase + '（检查手机与电脑是否同一 WiFi，或该 IP 是否已变）',
        });
      },
    });
  });
}

function request(opts) {
  // 公开接口（auth:false）直接发；其余先确保已登录
  if (opts.auth === false) return rawRequest(opts, true);
  return session.ready().then(
    () => rawRequest(opts, false),
    (e) => Promise.reject({ status: 401, error: (e && e.message) || '微信登录失败' })
  );
}

module.exports = { request };
