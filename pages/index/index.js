const api = require('../../api/index.js');
const config = require('../../config.js');
const venueCovers = require('../../utils/venueCovers.js');
const share = require('../../utils/share.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    venues: [],
    loading: true,
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
  },

  // 加载失败时点一下重试
  retryLoad() {
    this.load();
  },

  // 点封面上的 ♡/♥ → 服务端真收藏/取消（2026-09-25；此前只是弹个 toast 的占位）
  // 乐观更新 + 失败回滚：点下去立刻有反馈，但界面最终以**服务端返回值**为准
  // （别人同时在收藏/取消时，本地猜的数会和库里不一致 —— 所以成功后再 setData 一次校正）
  async toggleFav(e) {
    const id = Number(e.currentTarget.dataset.id);
    const i = this.data.venues.findIndex((v) => v.id === id);
    if (i < 0) return;
    // ⚠️ 必须在 setData **之前**把原值存成标量：
    //    setData({'venues[i].favorited': x}) 改的就是 this.data.venues[i] 这个对象本身，
    //    所以 cur.favorited 会跟着变 → 失败时拿它"回滚"等于把翻转后的值又写回去（实测踩到）。
    const curFavorited = !!this.data.venues[i].favorited;
    const curCount = Number(this.data.venues[i].fav_count || 0);
    const next = !curFavorited;
    this.setData({
      [`venues[${i}].favorited`]: next,
      [`venues[${i}].fav_count`]: Math.max(0, curCount + (next ? 1 : -1)),
    });
    try {
      const r = next ? await api.favoriteVenue(id) : await api.unfavoriteVenue(id);
      this.setData({
        [`venues[${i}].favorited`]: !!r.favorited,
        [`venues[${i}].fav_count`]: Number(r.fav_count || 0),
      });
      wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' });
    } catch (err) {
      // 回滚到点击前的状态（含被服务端拒绝的情况，如 token 过期且重登失败）
      this.setData({
        [`venues[${i}].favorited`]: curFavorited,
        [`venues[${i}].fav_count`]: curCount,
      });
      wx.showToast({ title: (err && err.error) || '操作失败，请重试', icon: 'none' });
    }
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