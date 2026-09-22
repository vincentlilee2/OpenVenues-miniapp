// OpenVenues 小程序入口
const { apiBase } = require('./config.js');
const session = require('./utils/session.js');

App({
  globalData: {
    apiBase,
    token: '',
    userInfo: null,
  },

  onLaunch() {
    // 微信一键登录（静默）：wx.login → 服务端 jscode2session 换真实 openid → 拿 token
    // 失败不阻塞启动：各接口请求前会再 await session.ready()
    session
      .login()
      .then((token) => {
        this.globalData.token = token;
        console.log('[app] 微信登录就绪 uid=', session.getUid());
      })
      .catch((e) => {
        console.warn('[app] 微信登录失败（接口请求时会自动重试）:', e.message || e);
      });
  },

  onShow() {},

  onError(err) {
    console.error('[app onError]', err);
  },
});
