// 我的收藏（2026-09-25）：服务端真收藏的场馆列表
//   - 点整行进场馆详情
//   - 点右侧 ♥ 取消收藏（catchtap 防止冒泡触发进详情），失败回滚
//   - 空态给「去首页看看」的出口（收藏是空的，别让页面变成死胡同）
const api = require('../../api/index.js');
const config = require('../../config.js');
const covers = require('../../utils/venueCovers.js');

const DEFAULT_COVER = `${config.apiBase.replace(/\/$/, '')}/static/promos/default.jpg`;

Page({
  data: { list: [], loading: true },

  onShow() {
    // onShow 而不是 onLoad：从详情页返回时收藏可能在那边被改过，重新拉一次最稳
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.myFavorites();
      const apiBase = config.apiBase.replace(/\/$/, '');
      const list = (data || []).map((v) => ({
        ...v,
        coverUrl:
          covers.absolute(v.cover, apiBase) ||
          covers.absolute(v.default_cover, apiBase) ||
          DEFAULT_COVER,
        venueText: v.court_count ? `${v.court_count} 场地` : '场地待补充',
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.error) || '加载失败', icon: 'none' });
    }
  },

  openVenue(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/venue-detail/venue-detail?id=${id}` });
  },

  // 取消收藏：先本地移除（立刻有反馈），失败再放回来
  async unheart(e) {
    const id = Number(e.currentTarget.dataset.id);
    const idx = this.data.list.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const removed = this.data.list[idx];
    const next = this.data.list.filter((v) => v.id !== id);
    this.setData({ list: next });
    try {
      await api.unfavoriteVenue(id);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } catch (err) {
      // 回滚：放回原位置（用 removed 的副本，别用被改过的引用）
      const back = [...this.data.list];
      back.splice(idx, 0, removed);
      this.setData({ list: back });
      wx.showToast({ title: (err && err.error) || '操作失败，请重试', icon: 'none' });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
