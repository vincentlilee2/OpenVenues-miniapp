const api = require('../../api/index.js');
const config = require('../../config.js');
const venueCovers = require('../../utils/venueCovers.js');
const share = require('../../utils/share.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    venues: [],
    loading: true,
    promoCount: 0,
    promoSubText: '提前预约场地 · 畅打名额先到先得',
  },

  // 转发 / 分享到朋友圈（2026-09-24）：官方要求朋友圈需 onShareAppMessage + onShareTimeline 同时实现
  onShareAppMessage() {
    return share.forHome();
  },
  onShareTimeline() {
    // 朋友圈不支持自定义 path（官方限制），timelineFor 会剥掉 path
    return share.timelineFor(share.forHome());
  },

  onLoad() {
    share.enableShareMenu(); // 把「转发」「分享到朋友圈」挂到右上角菜单
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
      // 给每个场馆附加默认 cover（如果服务器没传 cover）：按 id 取远程 SVG URL
      // 服务端返回的 cover 可能是相对路径 /uploads/covers/... 或绝对 URL，统一用 apiBase 拼绝对路径
      const apiBase = config.apiBase.replace(/\/$/, '');
      const venues = (data || []).map((v) => {
        return {
          ...v,
          // 背景图：服务端 cover 优先，其次服务端给的默认图（都不给就把 defaultCover 留空 →
          // 模板走占位块；绝不再拼一个可能 404 的路径，那是"卡片空白"的元凶）
          cover: venueCovers.absolute(v.cover, apiBase),
          defaultCover: venueCovers.absolute(v.default_cover, apiBase),
        };
      });
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

  // 点「⊕ 导航」→ 打开微信内置地图页。
  // 具体逻辑收敛在 utils/nav.js（场馆详情页的「导航」用同一份实现，避免两处漂移）。
  // 注意：openLocation **必须**有经纬度，光有地址字符串是打不开地图的。
  openMap(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find((x) => x.id === id);
    if (!v) return;
    nav.openVenueMap(v);
  },

  // 点击卡片主体 → 跳场馆详情
  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/venue-detail/venue-detail?id=${id}` });
  },
});