const api = require('../../api/index.js');
const config = require('../../config.js');
const venueCovers = require('../../utils/venueCovers.js');
const share = require('../../utils/share.js');
const nav = require('../../utils/nav.js');
const promoUtils = require('../../utils/promos.js');

Page({
  // hasPromo：该馆有没有可报名的畅打 → 决定要不要显示「畅打」按钮（2026-09-27 用户要求）
  //   null = 还没问到（先不显示，避免按钮闪一下又消失）
  data: { venue: null, loading: true, hasPromo: null },

  // 转发 / 分享到朋友圈（2026-09-24）：官方要求朋友圈需 onShareAppMessage + onShareTimeline 同时实现
  onShareAppMessage() {
    return share.forVenue(this.data.venue, config.apiBase);
  },
  onShareTimeline() {
    // 朋友圈不支持自定义 path（官方限制），timelineFor 会剥掉 path
    return share.timelineFor(share.forVenue(this.data.venue, config.apiBase));
  },

  onLoad(opt) {
    share.enableShareMenu(); // 把「转发」「分享到朋友圈」挂到右上角菜单
    this._id = opt.id;
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const v = await api.getVenue(this._id);
      // 该馆有没有可报名的畅打？没有就不显示「畅打」按钮（口径见 utils/promos.js 的 hasJoinable）
      try {
        const list = await api.listPromos(this._id);
        this.setData({ hasPromo: promoUtils.hasJoinable(list) });
      } catch (e) {
        // 活动列表拉不到时按「有」处理：宁可多给一个入口，也别让有活动的馆没入口
        this.setData({ hasPromo: true });
      }
      const apiBase = config.apiBase.replace(/\/$/, '');
      // 背景图统一走 utils/venueCovers.js：服务端给什么用什么（cover 优先，其次 default_cover）
      v.cover = venueCovers.absolute(v.cover, apiBase);
      v.defaultCover = venueCovers.absolute(v.default_cover, apiBase);
      this.setData({ venue: v, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  // 约课（2026-09-25 上线）：进该场馆的「培训课程」列表页（课程由后台「培训课程」栏目发布）
  //   之前是占位 toast「约课功能本期未上线」；现在点进真页面，报名走与畅打同一条链路。
  //   带上馆名 → 列表页标题显示「XX馆 · 培训课程」，用户一眼知道看的是哪个馆的课。
  onBookLesson() {
    const name = this.data.venue?.name ? `&venue_name=${encodeURIComponent(this.data.venue.name)}` : '';
    wx.navigateTo({ url: `/pages/courses/courses?venue_id=${this._id}${name}` });
  },

  // 进入约场：传 venue_id，book 页拉该场馆下所有场地
  onBookVenue() {
    wx.navigateTo({ url: `/pages/book/book?venue_id=${this._id}` });
  },

  // 畅打活动列表（带 venue_id 过滤）
  onPromoList() {
    wx.navigateTo({ url: `/pages/promos/promos?venue_id=${this._id}` });
  },

  // 「介绍…」（2026-09-26）：进该场馆的**服务介绍**文章列表（纯文章，点进去无报名）
  //   带馆名 → 列表页标题显示「XX馆 · 介绍」
  openIntro() {
    const name = this.data.venue?.name ? `&venue_name=${encodeURIComponent(this.data.venue.name)}` : '';
    wx.navigateTo({ url: `/pages/articles/articles?venue_id=${this._id}${name}` });
  },

  callPhone() {
    if (this.data.venue?.contact_phone) {
      wx.makePhoneCall({ phoneNumber: this.data.venue.contact_phone });
    }
  },

  // 点「⊕ 导航」→ 打开微信内置地图页（逻辑与首页卡片的导航完全一致，共用 utils/nav.js）
  openMap() {
    nav.openVenueMap(this.data.venue);
  },
});