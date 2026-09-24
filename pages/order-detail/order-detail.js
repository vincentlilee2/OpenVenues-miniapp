const api = require('../../api/index.js');
const pay = require('../../utils/pay.js');
const { courtTextOf } = require('../../utils/order-display.js');
const { cancelInfoOf, confirmContentOf } = require('../../utils/cancel.js');

const STATUS_LABEL = {
  pending: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  no_show: '未到场',
};

Page({
  data: { order: null, loading: true },

  onLoad(opt) {
    this._id = opt.id;
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const o = await api.orderDetail(this._id);
      const ci = cancelInfoOf(o); // 后端按场馆规则判定（拿不到字段则旧行为兜底）
      this.setData({
        order: o,
        loading: false,
        // 模板里不能调用 Page 方法，派生字段在这里算好
        statusText: STATUS_LABEL[o.status] || o.status,
        sourceText: o.source === 'promo' ? `🎯 ${(o.promo && o.promo.title) || '畅打活动'}` : '⏰ 散客预约',
        durationText: o.duration_hours > 1 ? `${o.duration_hours} 小时` : '1 小时',
        promoTitle: (o.promo && o.promo.title) || '',
        // 具体场地（不是只显示场馆名）；场馆级畅打显示「全部场地」
        courtText: courtTextOf(o),
        canCancel: ci.allowed,
        cancelHint: !ci.allowed && ['pending', 'confirmed'].includes(o.status) ? ci.reason : '',
        // 支付（2026-09-24）
        needPay: !!o.need_pay,
        payText: pay.payBadgeText(o),
        paidYuan: o.paid_amount_yuan || (o.paid_amount_fen != null ? (o.paid_amount_fen / 100).toFixed(2) : ''),
        remainText: pay.remainText(o.pay_expire_in_sec),
      });
      this._payExpireInSec = o.pay_expire_in_sec || 0;
      this.startPayTimer();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  onHide() {
    this.stopPayTimer();
  },

  onUnload() {
    this.stopPayTimer();
  },

  // 待支付倒计时（用服务端给的剩余秒数递减，避免客户端解析 UTC 时间串出错）
  startPayTimer() {
    this.stopPayTimer();
    if (!this.data.needPay) return;
    this._payTimer = setInterval(() => {
      this._payExpireInSec = Math.max(0, (this._payExpireInSec || 0) - 30);
      this.setData({ remainText: pay.remainText(this._payExpireInSec) });
      if (this._payExpireInSec <= 0) {
        this.stopPayTimer();
        this.load(); // 过期了 → 服务端已关单，刷新看最新状态
      }
    }, 30000);
  },

  stopPayTimer() {
    if (this._payTimer) {
      clearInterval(this._payTimer);
      this._payTimer = null;
    }
  },

  // 去支付（2026-09-24）
  async onPay() {
    const id = this._id;
    wx.showLoading({ title: '正在发起支付', mask: true });
    const r = await pay.payOrder(id);
    wx.hideLoading();
    if (r.paid) {
      wx.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(() => this.load(), 600);
    } else if (r.cancelled) {
      wx.showToast({ title: '已取消支付，仍可重新支付', icon: 'none' });
    } else if (r.pending) {
      wx.showModal({
        title: '支付结果确认中',
        content: '微信已受理，入账可能需几秒。稍后回到本页会自动刷新。',
        showCancel: false,
        success: () => this.load(),
      });
    } else {
      wx.showModal({ title: '支付未完成', content: r.error || '请稍后重试', showCancel: false });
      this.load();
    }
  },

  statusLabel(s) { return STATUS_LABEL[s] || s; },

  async onCancel() {
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认取消订单',
        content: confirmContentOf(this.data.order), // 含扣费说明（按场馆的取消规则）
        confirmText: '确认取消',
        cancelText: '再想想',
        confirmColor: '#dc2626',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!ok) return;
    try {
      const res = await api.cancelOrder(this._id);
      // 已支付的订单 → 服务端已按取消规则发起退款，把金额说清楚再返回
      const rf = res && res.refund;
      if (rf && rf.amount_fen > 0) {
        wx.showModal({
          title: '已取消，退款已发起',
          content: `将退回 ¥${rf.amount_yuan}（1-3 个工作日原路退回）。`,
          showCancel: false,
          success: () => wx.navigateBack(),
        });
      } else if (rf && rf.error) {
        wx.showModal({
          title: '已取消，但退款需人工处理',
          content: '订单已取消，退款发起失败，我们会在后台补退。如未到账请联系场馆。',
          showCancel: false,
          success: () => wx.navigateBack(),
        });
      } else if (rf && rf.note) {
        wx.showModal({ title: '已取消', content: rf.note, showCancel: false, success: () => wx.navigateBack() });
      } else {
        wx.showToast({ title: '已取消', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    } catch (e) {
      wx.showModal({ title: '取消失败', content: e.error || '请稍后再试', showCancel: false });
    }
  },
});
