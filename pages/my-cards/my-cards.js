// 我的会员卡（2026-09-26）—— 我充值购买的卡；点「查看」看余额 / 消费列表 / 服务说明
//   入口：我的 → 我的会员卡
const api = require('../../api/index.js');

const STATUS_TEXT = { active: '正常', frozen: '已冻结', expired: '已过期', used_up: '已用完', voided: '已作废' };

Page({
  data: { list: [], loading: true, empty: false },

  onLoad() {
    this.load();
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const list = await api.myCards();
      this.setData({
        list: (list || []).map((c) => ({
          ...c,
          statusText: c.expired ? '已过期' : STATUS_TEXT[c.status] || c.status,
          off: !!c.expired || c.status !== 'active',
        })),
        loading: false,
        empty: !(list || []).length,
      });
    } catch (e) {
      this.setData({ loading: false, empty: true });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  openCard(e) {
    wx.navigateTo({ url: `/pages/my-card-detail/my-card-detail?id=${e.currentTarget.dataset.id}` });
  },

  goBuy() {
    wx.navigateTo({ url: '/pages/cards/cards' });
  },
});
