const api = require('../../api/index.js');
const config = require('../../config.js');
const venueCovers = require('../../utils/venueCovers.js');

Page({
  data: { venue: null, loading: true },

  onLoad(opt) {
    this._id = opt.id;
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const v = await api.getVenue(this._id);
      // cover：可能是相对路径 /uploads/... → 拼成绝对 URL（避免小程序 pageframe 错位）
      const apiBase = config.apiBase.replace(/\/$/, '');
      if (v && v.cover && v.cover.startsWith('/')) v.cover = apiBase + v.cover;
      // defaultCover：按 venue.id 取本地 utils 拼好的远程 URL（绝对）
      v.defaultCover = venueCovers.byId(this._id);
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