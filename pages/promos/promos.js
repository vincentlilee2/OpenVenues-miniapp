const api = require('../../api/index.js');
const time = require('../../utils/time.js');

Page({
  data: { promos: [], loading: true },

  onLoad(opt) {
    this._venueId = opt.venue_id || '';
    this.load();
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.listPromos(this._venueId);
      // 模板里不能调用 Page 方法（{{isExpired(item)}} 会渲染成空），派生字段在这里算好
      const promos = (data || []).map((p) => ({
        ...p,
        expired: time.isPast(p.signup_deadline),
        createdText: time.toLocalText(p.created_at),
        venueText: p.venue_name ? (p.court_name ? `${p.venue_name} · ${p.court_name}` : p.venue_name) : '全场馆',
      }));
      this.setData({ promos, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/promo-detail/promo-detail?id=${id}` });
  },
});
