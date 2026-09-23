const api = require('../../api/index.js');
const venueCovers = require('../../utils/venueCovers.js');

Page({
  data: {
    venues: [],
    loading: true,
    promoCount: 0,
    promoSubText: '提前预约场地 · 畅打名额先到先得',
  },

  onLoad() {
    this.load();
  },

  onShow() {
    this.syncTabBar();
    this.load();
  },

  syncTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.listVenues();
      // 给每个场馆附加默认 cover（如果服务器没传 cover）：按 id 取本地 SVG 数据 URI
      const venues = (data || []).map((v) => ({
        ...v,
        defaultCover: venueCovers.byId(v.id),
      }));
      console.log('[index.load] venues.length=', venues.length,
        'A.defaultCover.length=', venues[0] && venues[0].defaultCover ? venues[0].defaultCover.length : 0,
        'A.defaultCover head=', venues[0] && venues[0].defaultCover ? venues[0].defaultCover.slice(0, 80) : '(empty)');
      this.setData({ venues, loading: false, loadError: '' });
    } catch (e) {
      const msg = e.error || ('网络错误 ' + e.status);
      this.setData({ loading: false, venues: [], loadError: msg });
      console.error('[listVenues fail]', e);
      wx.showToast({ title: msg, icon: 'none', duration: 3000 });
    }
    this.loadPromoCount();
  },

  // 加载失败时点一下重试
  retryLoad() {
    this.load();
  },

  // banner 上显示进行中的畅打活动数（失败不影响首页）
  async loadPromoCount() {
    try {
      const list = await api.listPromos('');
      const n = (list || []).length;
      this.setData({
        promoCount: n,
        promoSubText: n > 0 ? `提前预约场地 · 有 ${n} 个畅打活动进行中` : '提前预约场地 · 畅打名额先到先得',
      });
    } catch (e) {
      this.setData({ promoCount: 0, promoSubText: '提前预约场地 · 畅打名额先到先得' });
    }
  },

  // 点击 banner → 畅打活动列表
  openPromos() {
    wx.navigateTo({ url: '/pages/promos/promos' });
  },

  toggleFav() {
    wx.showToast({ title: '已收藏（占位）', icon: 'none' });
  },

  openMap(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find((x) => x.id === id);
    if (!v?.address) {
      wx.showToast({ title: '该场馆暂无地址', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: 0,
      longitude: 0,
      name: v.name,
      address: v.address,
    });
  },

  // 点击卡片主体 → 跳场馆详情
  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/venue-detail/venue-detail?id=${id}` });
  },
});