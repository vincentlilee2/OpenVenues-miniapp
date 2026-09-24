const api = require('../../api/index.js');
const config = require('../../config.js');
const venueCovers = require('../../utils/venueCovers.js');
const share = require('../../utils/share.js');

Page({
  data: { venue: null, loading: true },

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

  onBookLesson() {
    wx.showToast({ title: '约课功能本期未上线', icon: 'none' });
  },

  // 进入约场：传 venue_id，book 页拉该场馆下所有场地
  onBookVenue() {
    wx.navigateTo({ url: `/pages/book/book?venue_id=${this._id}` });
  },

  // 畅打活动列表（带 venue_id 过滤）
  onPromoList() {
    wx.navigateTo({ url: `/pages/promos/promos?venue_id=${this._id}` });
  },

  callPhone() {
    if (this.data.venue?.contact_phone) {
      wx.makePhoneCall({ phoneNumber: this.data.venue.contact_phone });
    }
  },
});