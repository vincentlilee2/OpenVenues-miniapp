const api = require('../../api/index.js');
const { courtTextOf } = require('../../utils/order-display.js');

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
        canCancel: ['pending', 'confirmed'].includes(o.status) &&
          new Date(`${o.booking_date}T${o.start_time}:00`).getTime() - Date.now() > 2 * 3600 * 1000,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  statusLabel(s) { return STATUS_LABEL[s] || s; },

  async onCancel() {
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认取消订单',
        content: '取消后将释放该时段，确定要取消吗？',
        confirmText: '确认取消',
        cancelText: '再想想',
        confirmColor: '#dc2626',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!ok) return;
    try {
      await api.cancelOrder(this._id);
      wx.showToast({ title: '已取消', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.showModal({ title: '取消失败', content: e.error || '请稍后再试', showCancel: false });
    }
  },
});
