// 会员卡详情 + 立即充值（2026-09-26；2026-09-27 按用户要求加「模拟支付」确认）
//
// 用户 2026-09-27 要求：
//   「当前点击立即充值后没有交互直接生成会员卡订单了。改成点击立即充值按钮后弹出一个模拟微信支付的弹窗，
//     但标注为开通商户号信息，当前模拟支付。之后确认后再生成订单。」
//
// ⇒ 两条路径：
//   · **未配置商户号**（payConfig.enabled=false）→ 先弹**模拟微信支付**弹窗（标注"商户号未开通，当前为模拟支付，
//     不会真实扣款"）→ 用户点「确认支付」**才**建单发卡；点「取消」什么都不发生（不建单）。
//   · **已配置商户号** → 直接建单 → 走 utils/pay.js 的真收银台（wx.requestPayment）→ 回调入账才发卡。
const api = require('../../api/index.js');
const pay = require('../../utils/pay.js');

Page({
  data: { card: null, loading: true, submitting: false, showMockPay: false },

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

  /**
   * 点「立即充值」：
   *   未开通在线支付 → **先弹模拟支付弹窗**，确认后才建单（这一版就是用户要的交互）
   *   已开通 → 直接建单走真收银台
   */
  async onRecharge() {
    if (this.data.submitting) return;
    const card = this.data.card || {};
    if (!card.id) return;
    let payEnabled = false;
    let mockActive = false;
    try {
      const pc = await api.payConfig();
      payEnabled = !!(pc && pc.enabled);
      // 模拟支付模式（2026-09-27）：没商户号但后台开了模拟模式 → 下单会返回 need_pay，
      // 这里的模拟弹窗**本身就是那一次确认**，确认后直接调模拟入账（不再弹第二个收银台）。
      mockActive = !!(pc && pc.mock_active);
    } catch (e) {
      payEnabled = false; // 探测失败按未开通处理（更保守：多一次确认，不会误扣）
      mockActive = false;
    }
    this._mockActive = mockActive;
    if (!payEnabled) {
      this.setData({ showMockPay: true });
      return; // 注意：此时**还没有建单**（用户要求「确认后再生成订单」）
    }
    this.doRecharge();
  },

  onCancelMockPay() {
    this.setData({ showMockPay: false });
    wx.showToast({ title: '已取消，未生成订单', icon: 'none' });
  },

  /** 模拟支付里点「确认支付」→ 现在才真正建单 */
  onConfirmMockPay() {
    this.setData({ showMockPay: false });
    this.doRecharge();
  },

  /** 真正建单 + 发卡（未配置支付时服务端测试直通：订单已支付 + 立刻发卡） */
  async doRecharge() {
    if (this.data.submitting) return;
    const card = this.data.card || {};
    this.setData({ submitting: true });
    try {
      const r = await api.rechargeCard(this._id);
      if (r && r.need_pay) {
        // 模拟支付模式：上面那个模拟弹窗已经确认过了 → 直接入账，别再弹第二个窗
        if (this._mockActive) {
          const m = await pay.mockSettle(r.order_id, { amount_yuan: card.price });
          if (m && m.paid) return this.afterSuccess(card, '充值成功，卡额度已到账（模拟支付）');
          wx.showToast({ title: (m && m.error) || '已取消支付', icon: 'none' });
          return;
        }
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
      this.afterSuccess(card, `充值成功，卡额度 ¥${(r && r.card && r.card.balance) || card.price} 已到账`);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '充值失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 充值成功后**不要停在充值页**（用户 2026-09-27 明确要求）：
   *   · 普通入口（我的会员卡 → 我要开通 → 卡详情）：返回上一页 = 「我的会员卡」，
   *     该页 onShow 会重新拉取 → 刚开通的卡自动出现在下段列表里（上面那份"可开通"里消失）。
   *   · from=order（下单时没卡被引导过来充值）：上一步是「我的会员卡」、再上一步才是下单页，
   *     所以退两页回下单页继续付款（delta 超出栈时 fail 兜底回「我的会员卡」）。
   *   用 toast 而不是模态框：模态框要用户点一下、点「知道了」还可能留在原地。
   */
  afterSuccess(card, msg) {
    const backToOrder = this._from === 'order';
    // 「支付结果确认中」是异步回调还没到的情形，提示要如实（别报"成功"）
    const pending = /确认中/.test(msg || '');
    wx.showToast({
      title: pending ? '支付确认中，稍后在会员卡查看' : backToOrder ? '充值成功，返回继续支付' : '充值成功',
      icon: pending ? 'none' : 'success',
      duration: 1200,
    });
    setTimeout(() => {
      const fail = () => wx.redirectTo({ url: '/pages/my-cards/my-cards' });
      if (backToOrder) wx.navigateBack({ delta: 2, fail });
      else wx.navigateBack({ delta: 1, fail });
    }, 900);
  },

  goMyCards() {
    wx.navigateTo({ url: '/pages/my-cards/my-cards' });
  },

  noop() {},
});
