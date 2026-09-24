const api = require('../../api/index.js');
const pay = require('../../utils/pay.js');
const { cancelInfoOf, confirmContentOf } = require('../../utils/cancel.js');

const STATUS_TABS = [
  { k: 'all', label: '全部' },
  { k: 'confirmed', label: '已确认' },
  { k: 'completed', label: '已完成' },
  { k: 'cancelled', label: '已取消' },
];
const STATUS_LABEL = {
  pending: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  no_show: '未到场',
};

Page({
  data: {
    statusTabs: STATUS_TABS,
    activeStatus: 'all',
    orders: [],
    loading: true,
  },

  onLoad(opt) {
    if (opt && opt.source === 'promo') this.setData({ activeStatus: 'all' });
  },

  onShow() {
    // 本页是 tabBar 页、常驻不销毁，onLoad 不会重跑；
    // 「预约/报名成功后跳到订单列表」是通过 storage 传参的，必须在这里读取，
    // 否则停留在上一次的状态筛选 tab 上，新订单看起来「没出现」。
    const filter = wx.getStorageSync('order_filter');
    if (filter) {
      wx.removeStorageSync('order_filter');
      if (filter !== this.data.activeStatus) {
        this.setData({ activeStatus: filter });
      }
    }
    this.syncTabBar();
    this.load();
    this.startPayTimer(); // 待支付倒计时（2026-09-24）
  },

  onHide() {
    this.stopPayTimer();
  },

  onUnload() {
    this.stopPayTimer();
  },

  // 待支付倒计时：只在本页可见时跑，30 秒一跳（够用且省电）。
  // 注意用**服务端给的剩余秒数**递减，不解析时间串（库里是 UTC，客户端解析会差 8 小时）。
  startPayTimer() {
    this.stopPayTimer();
    this._payTimer = setInterval(() => {
      const orders = (this.data.orders || []).map((o) => {
        if (!o.needPay) return o;
        const left = Math.max(0, (o.payExpireInSec || 0) - 30);
        return { ...o, payExpireInSec: left, remainText: pay.remainText(left) };
      });
      this.setData({ orders });
      // 有订单刚过期 → 拉一次最新状态（服务端会把它关掉）
      const expired = (this.data.orders || []).some((o) => o.needPay && (o.payExpireInSec || 0) <= 0);
      if (expired) this.load();
    }, 30000);
  },

  stopPayTimer() {
    if (this._payTimer) {
      clearInterval(this._payTimer);
      this._payTimer = null;
    }
  },

  // 去支付（订单列表里的待支付订单；2026-09-24）
  async onPay(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '正在发起支付', mask: true });
    const r = await pay.payOrder(id);
    wx.hideLoading();
    if (r.paid) {
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.load();
    } else if (r.cancelled) {
      wx.showToast({ title: '已取消支付，订单仍可支付', icon: 'none' });
    } else if (r.pending) {
      wx.showModal({
        title: '支付结果确认中',
        content: '微信已受理，入账可能需几秒。稍后下拉刷新本页即可看到「已支付」。',
        showCancel: false,
      });
      this.load();
    } else {
      wx.showModal({ title: '支付未完成', content: r.error || '请稍后重试', showCancel: false });
      this.load();
    }
  },

  // 每个 tab 页更新「自己那份」custom-tab-bar 实例（官方 API）
  syncTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      // 已取消 tab 看全量（不受 30 分钟隐藏规则限制）
      const includeHidden = this.data.activeStatus === 'cancelled' ? '1' : '';
      let data = await api.myOrders(includeHidden);
      if (this.data.activeStatus !== 'all') {
        data = data.filter((o) => o.status === this.data.activeStatus);
      }
      // 模板里不能调用 Page 方法（{{statusLabel(x)}} 会渲染成空白），派生字段一律在这里算好
      const orders = (data || []).map((o) => {
        const ci = cancelInfoOf(o); // 后端按场馆规则判定；拿不到字段时按旧行为兜底
        return {
          ...o,
          statusText: STATUS_LABEL[o.status] || o.status,
          sourceText: o.source === 'promo' ? `🎯 ${o.promo_title || '畅打活动'}` : '⏰ 散客预约',
          timeText: `${o.booking_date} · ${o.start_time}-${o.end_time}`,
          durationText: o.duration_hours > 1 ? `${o.duration_hours} 小时` : '1 小时',
          cancelable: ci.allowed,
          // 只在「进行中的订单被规则挡住」时给原因，已完成/已取消的不啰嗦
          cancelHint: !ci.allowed && ['pending', 'confirmed'].indexOf(o.status) >= 0 ? ci.reason : '',
          // 支付（2026-09-24）：待支付 → 显示倒计时 + 「去支付」；已支付/已退款 → 显示状态
          needPay: !!o.need_pay,
          payText: pay.payBadgeText(o),
          payExpireInSec: o.pay_expire_in_sec || 0,
          remainText: pay.remainText(o.pay_expire_in_sec),
        };
      });
      this.setData({ orders, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  onStatusTap(e) {
    const k = e.currentTarget.dataset.k;
    if (k === this.data.activeStatus) return;
    this.setData({ activeStatus: k });
    this.load();
  },

  openDetail(e) {
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${e.currentTarget.dataset.id}` });
  },

  async onCancel(e) {
    const id = e.currentTarget.dataset.id;
    const order = (this.data.orders || []).filter((o) => String(o.id) === String(id))[0];
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认取消订单',
        content: confirmContentOf(order), // 含扣费说明（按场馆的取消规则）
        confirmText: '确认取消',
        cancelText: '再想想',
        confirmColor: '#dc2626',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!ok) return;
    try {
      const res = await api.cancelOrder(id);
      // 支付（2026-09-24）：已支付的订单取消 → 服务端已按取消规则退款，这里把金额说清楚
      const rf = res && res.refund;
      if (rf && rf.amount_fen > 0) {
        wx.showModal({
          title: '已取消，退款已发起',
          content: `将退回 ¥${rf.amount_yuan}（1-3 个工作日原路退回）。`,
          showCancel: false,
        });
      } else if (rf && rf.error) {
        wx.showModal({
          title: '已取消，但退款需人工处理',
          content: '订单已取消，退款发起失败，我们会在后台补退。如未到账请联系场馆。',
          showCancel: false,
        });
      } else if (rf && rf.note) {
        wx.showModal({ title: '已取消', content: rf.note, showCancel: false });
      } else {
        wx.showToast({ title: '已取消', icon: 'success' });
      }
      this.load();
    } catch (e2) {
      wx.showModal({ title: '取消失败', content: e2.error || '请稍后再试', showCancel: false });
    }
  },
});

// 取消判定已统一到 utils/cancel.js（后端按场馆规则返回，旧行为兜底）
