const api = require('../../api/index.js');
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
      await api.cancelOrder(id);
      wx.showToast({ title: '已取消', icon: 'success' });
      this.load();
    } catch (e2) {
      wx.showModal({ title: '取消失败', content: e2.error || '请稍后再试', showCancel: false });
    }
  },
});

// 取消判定已统一到 utils/cancel.js（后端按场馆规则返回，旧行为兜底）
