const api = require('../../api/index.js');
const config = require('../../config.js');
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

  // 点「⊕ 导航」→ 打开微信内置地图页（wx.openLocation），用户可在那里直接发起导航。
  // 注意：openLocation **必须**有经纬度，光有地址字符串是打不开地图的
  //       （所以坐标由管理员在后台按地址解析后存进 venues.latitude/longitude）。
  openMap(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find((x) => x.id === id);
    if (!v) return;

    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    // (0,0) 是几内亚湾，明显是占位值 → 当没坐标处理，别把用户导航到非洲
    const hasCoord =
      Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

    if (!hasCoord) {
      wx.showModal({
        title: '暂无定位',
        content: v.address
          ? `「${v.name}」还没有设置地图坐标，暂时打不开导航。\n地址：${v.address}\n（请管理员在本地后台的场馆编辑页补上坐标）`
          : `「${v.name}」还没有填写地址，暂时无法导航。`,
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }

    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: v.name,
      address: v.address || '',
      scale: 16,
      fail: (err) => {
        console.error('[openMap] openLocation failed', err);
        wx.showToast({ title: '打开地图失败', icon: 'none' });
      },
    });
  },

  // 点击卡片主体 → 跳场馆详情
  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/venue-detail/venue-detail?id=${id}` });
  },
});