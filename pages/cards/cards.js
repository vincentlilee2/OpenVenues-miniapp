// 办卡充值（2026-09-26）—— 显示已上架的会员卡；点卡进详情 → 立即充值
//   入口：我的 → 办卡充值；
//   也用于「没卡 / 余额不足」时的引导：带 from=order 进来时，充值成功后返回原页继续下单
const api = require('../../api/index.js');

Page({
  data: { list: [], loading: true, empty: false },

  onLoad(opt) {
    this._from = (opt && opt.from) || '';
    this.load();
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const list = await api.listCards();
      this.setData({ list: list || [], loading: false, empty: !(list || []).length });
    } catch (e) {
      this.setData({ loading: false, empty: true });
      wx.showToast({ title: (e && e.message) || '加载失败，请稍后再试', icon: 'none' });
    }
  },

  openCard(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._from ? `?id=${id}&from=${this._from}` : `?id=${id}`;
    wx.navigateTo({ url: `/pages/card-detail/card-detail${q}` });
  },

  goMyCards() {
    wx.navigateTo({ url: '/pages/my-cards/my-cards' });
  },
});
