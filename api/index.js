const { request } = require('./request.js');

module.exports = {
  // ===== 微信登录 =====
  authMe: () => request({ url: '/api/auth/me' }),
  saveProfile: (payload) => request({ url: '/api/auth/profile', method: 'POST', data: payload }),
  uploadAvatar: (payload) => request({ url: '/api/auth/avatar', method: 'POST', data: payload }),
  logout: () => request({ url: '/api/auth/logout', method: 'POST' }),
  savePhone: (code) => request({ url: '/api/auth/phone', method: 'POST', data: { code } }),

  listVenues: (type) => request({ url: '/api/venues' + (type ? `?type=${type}` : ''), auth: false }),
  listTypes: () => request({ url: '/api/venues/types', auth: false }),
  getVenue: (id) => request({ url: `/api/venues/${id}`, auth: false }),
  venueCourts: (id) => request({ url: `/api/venues/${id}/courts`, auth: false }),
  // ⚠️ 没有「场馆级 availability」接口（后端只有 court 级）—— 别加 /api/venues/:id/availability，
  //    那个路径不存在会 404（2026-09-23 清理死方法时确认）。要按时段查就按场地查：
  courtAvailability: (courtId, date, uid) => {
    const u = uid ? `&uid=${uid}` : '';
    return request({ url: `/api/courts/${courtId}/availability?date=${date}${u}`, auth: false });
  },

  listPromos: (venueId) => request({ url: '/api/promos' + (venueId ? `?venue_id=${venueId}` : ''), auth: false }),
  getPromo: (id) => request({ url: `/api/promos/${id}`, auth: false }),
  signupPromo: (id, payload) => request({ url: `/api/promos/${id}/signup`, method: 'POST', data: payload }),

  createOrder: (payload) => request({ url: '/api/orders', method: 'POST', data: payload }),
  myOrders: (includeHidden) =>
    request({ url: '/api/orders/my' + (includeHidden ? '?include_hidden=1' : '') }),
  orderDetail: (id) => request({ url: `/api/orders/${id}` }),
  cancelOrder: (id) => request({ url: `/api/orders/${id}`, method: 'DELETE' }),

  // ===== 微信支付（2026-09-24）=====
  //   payConfig：探测本店是否开通了在线支付（未开通 → 前端不显示"去支付"）
  //   payOrder：拿 wx.requestPayment 参数（服务端下单 + 用商户私钥签名，密钥不下发）
  //   payStatus：查支付状态（sync=1 时服务端会主动向微信查单，用于回调延迟兜底）
  payConfig: () => request({ url: '/api/pay/config', auth: false }),
  payOrder: (id) => request({ url: `/api/orders/${id}/pay`, method: 'POST' }),
  payStatus: (id, sync) => request({ url: `/api/pay/status/${id}` + (sync ? '?sync=1' : '') }),
};
