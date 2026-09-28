// 管理员入口 → 今日经营数据（2026-09-28）
//   用户要求：「点击进入页面可以将 当前后台 仪表盘 中 的今日新下单 等前7个 卡显示在小程序中」
//
// 数据来自 GET /api/my/admin-overview（须登录 + 须是管理员；服务端校验，前端藏只是体验）。
// 卡片（含数字与文案）由服务端组装 —— 与后台仪表盘同一份实现，不允许两边各写一套口径。
const api = require('../../api/index.js');

Page({
  data: {
    loading: true,
    error: '',
    today: '',
    cards: [],
    updatedAt: '',
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const d = await api.adminOverview();
      this.setData({
        loading: false,
        today: d.today || '',
        cards: d.cards || [],
        updatedAt: this.nowText(),
      });
    } catch (e) {
      // 403 = 已经不是管理员了（后台取消 / 换了别人）；401 由请求层自动重登
      const msg = e && e.status === 403 ? '你已不是管理员，无法查看' : (e && e.error) || '加载失败，请下拉刷新';
      this.setData({ loading: false, error: msg });
    }
  },

  nowText() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  },
});
