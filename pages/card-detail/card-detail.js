// 会员卡详情 + 立即充值（2026-09-26）
//   入口：办卡充值列表点卡片（可带 from=order：充值成功后返回原页继续下单）
//   充值两条路径（服务端决定）：
//     · 未配置商户号 → need_pay=false，服务端已直接发卡（用户明确要求的"测试通过"）
//     · 已配置 → need_pay=true，走 utils/pay.js 的收银台 + 服务端入账确认
const api = require('../../api/index.js');
const pay = require('../../utils/pay.js');

Page({
  data: { card: null, loading: true, submitting: false },

  onLoad(opt) {
    this._id = opt.id;
    this._from = opt.from || '';
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const card = await api.getCard(this._id);
      this.setData({ card, loading: false });
      if (card && card.name) wx.setNavigationBarTitle({ title: card.name });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  async onRecharge() {
    if (this.data.submitting) return;
    const card = this.data.card || {};
    this.setData({ submitting: true });
    try {
      const r = await api.rechargeCard(this._id);
      if (r && r.need_pay) {
        const res = await pay.handleAfterCreate(
          { id: r.order_id, need_pay: true, total_price: card.price },
          'card'
        );
        if (res && res.paid) return this.afterSuccess(card, '充值成功，卡额度已到账');
        if (res && res.cancelled) {
          wx.showToast({ title: '已取消支付，订单 15 分钟内可再支付', icon: 'none', duration: 2600 });
          return;
        }
        if (res && res.pending) return this.afterSuccess(card, '支付结果确认中，稍后可在我的会员卡查看');
        wx.showToast({ title: (res && res.error) || '支付未完成', icon: 'none' });
        return;
      }
      // 未配置支付：服务端已发卡
      this.afterSuccess(card, `充值成功，卡额度 ¥${(r && r.card && r.card.balance) || card.price} 已到账`);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '充值失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  afterSuccess(card, msg) {
    const backToOrder = this._from === 'order';
    wx.showModal({
      title: '充值成功',
      content: backToOrder ? `${msg}。返回上一步继续用会员卡支付。` : `${msg}。可在「我的会员卡」查看余额与消费记录。`,
      confirmText: backToOrder ? '返回继续' : '查看我的卡',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          if (backToOrder) wx.navigateBack({ delta: 1 });
          else wx.redirectTo({ url: '/pages/my-cards/my-cards' });
        } else {
          wx.navigateBack({ delta: 1 });
        }
      },
    });
  },

  goMyCards() {
    wx.navigateTo({ url: '/pages/my-cards/my-cards' });
  },
});
