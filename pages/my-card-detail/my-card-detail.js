// 我的会员卡 · 详情（2026-09-26）—— 余额 / 消费列表 / 服务说明
//   用户需求 ④：「点击 查看 后可查看该会员卡余额、消费列表、服务说明等」
const api = require('../../api/index.js');
const time = require('../../utils/time.js');

const TX_TEXT = { recharge: '充值', consume: '消费', refund: '退款', adjust: '人工调整' };
// 卡状态文案（voided = 充值订单被取消 → 卡作废，2026-09-27 用户拍板"选 2"）
const STATUS_TEXT = { active: '会员卡', frozen: '已冻结', expired: '已过期', used_up: '已用完', voided: '已作废' };

Page({
  data: { card: null, loading: true, txs: [], empty: false },

  onLoad(opt) {
    this._id = opt.id;
    this.load();
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const c = await api.myCardDetail(this._id);
      // WXML 里别写 `{{a < 1}}`（`<` 会被当标签起始），派生文案一律在 JS 侧算好；
      // 时间也要过 time.toLocalText（库里是 SQLite UTC 串，直接显示会差 8 小时）
      c.discountText = Number(c.discount) < 1 ? `${c.discount}（${Math.round(Number(c.discount) * 100) / 10} 折）` : '无折扣';
      c.activatedText = time.toLocalText(c.activated_at);
      c.expiresText = c.expires_at ? time.toLocalText(c.expires_at) : '永久有效';
      c.voided = c.status === 'voided';
      c.statusText = c.expired ? '已过期' : STATUS_TEXT[c.status] || '会员卡';
      const txs = (c.transactions || []).map((t) => ({
        ...t,
        typeText: TX_TEXT[t.type] || t.type,
        inMoney: Number(t.amount) >= 0,
        amountText: `${Number(t.amount) >= 0 ? '+' : '-'}¥${Math.abs(Number(t.amount || 0)).toFixed(2)}`,
        timeText: time.toLocalText(t.created_at),
        detailText: t.original
          ? `原价 ¥${Number(t.original).toFixed(2)}${t.discount != null && Number(t.discount) < 1 ? ` · ${Math.round(Number(t.discount) * 100) / 10} 折` : ''}`
          : '',
      }));
      this.setData({ card: c, txs, loading: false, empty: txs.length === 0 });
      if (c && c.name) wx.setNavigationBarTitle({ title: c.name });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },
});
