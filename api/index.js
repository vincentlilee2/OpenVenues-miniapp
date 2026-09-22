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
  availability: (id, date, uid) => {
    const u = uid ? `&uid=${uid}` : '';
    return request({ url: `/api/venues/${id}/availability?date=${date}${u}`, auth: false });
  },
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
};
