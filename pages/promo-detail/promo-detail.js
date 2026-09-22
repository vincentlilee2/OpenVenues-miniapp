const api = require('../../api/index.js');
const time = require('../../utils/time.js');

Page({
  data: {
    promo: null,
    loading: true,
    participantCount: 1,
    form: { booker_name: '', booker_phone: '', participant_names_text: '' },
    totalPrice: 0,
    submitting: false,
    isExpired: false,
  },

  onLoad(opt) {
    this._id = opt.id;
    // 预填上次填过的联系人信息
    const cache = wx.getStorageSync('booker') || {};
    this.setData({
      form: {
        booker_name: cache.booker_name || '',
        booker_phone: cache.booker_phone || '',
        participant_names_text: '',
      },
    });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const p = await api.getPromo(this._id);
      const isExpired = time.isPast(p.signup_deadline);
      this.setData({
        promo: p,
        loading: false,
        isExpired,
        // 模板里不能调用方法，格式化好的文本在这里算好
        deadlineText: time.toLocalText(p.signup_deadline),
        courtText: p.venue_name ? (p.court_name ? `${p.venue_name} · ${p.court_name}` : `${p.venue_name}（全场）`) : '全场馆',
        totalPrice: +(p.price_per_person * this.data.participantCount).toFixed(2),
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  inc() {
    const max = this.data.promo?.max_per_signup || 6;
    if (this.data.participantCount >= max) {
      wx.showToast({ title: `最多 ${max} 人`, icon: 'none' });
      return;
    }
    const c = this.data.participantCount + 1;
    this.setData({
      participantCount: c,
      totalPrice: +(this.data.promo.price_per_person * c).toFixed(2),
    });
  },

  dec() {
    if (this.data.participantCount <= 1) return;
    const c = this.data.participantCount - 1;
    this.setData({
      participantCount: c,
      totalPrice: +(this.data.promo.price_per_person * c).toFixed(2),
    });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    const form = { ...this.data.form, [k]: e.detail.value };
    this.setData({ form });
  },

  formatTime(t) {
    if (!t) return '';
    const x = new Date(t);
    if (Number.isNaN(x.getTime())) return t;
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    const hh = String(x.getHours()).padStart(2, '0');
    const mm = String(x.getMinutes()).padStart(2, '0');
    return `${x.getFullYear()}-${m}-${d} ${hh}:${mm}`;
  },

  async onSubmit() {
    const { form, participantCount, promo } = this.data;
    if (!form.booker_name.trim()) return wx.showToast({ title: '请填写姓名', icon: 'none' });
    if (!/^1\d{10}$/.test(form.booker_phone.trim())) return wx.showToast({ title: '电话格式不对', icon: 'none' });

    const remaining = promo.max_capacity - promo.signed_up;
    if (participantCount > remaining) {
      wx.showToast({ title: `剩余名额 ${remaining}`, icon: 'none' });
      return;
    }

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '确认报名',
        content: `${promo.title}\n人数：${participantCount}\n合计：¥${this.data.totalPrice}\n\n截止后未成团将自动退款并通知您。`,
        confirmText: '确认报名',
        cancelText: '再想想',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!confirm) return;

    this.setData({ submitting: true });
    try {
      const participant_names = form.participant_names_text
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.signupPromo(promo.id, {
        participant_count: participantCount,
        booker_name: form.booker_name.trim(),
        booker_phone: form.booker_phone.trim(),
        participant_names,
      });
      // 缓存联系人
      wx.setStorageSync('booker', {
        booker_name: form.booker_name,
        booker_phone: form.booker_phone,
      });
      wx.showToast({ title: '报名成功！', icon: 'success' });
      // order-list 是 tabBar 页且 switchTab 不支持 query，用 storage 传参
      wx.setStorageSync('order_filter', 'all');
      wx.setStorageSync('order_filter_source', 'promo');
      setTimeout(() => {
        wx.switchTab({ url: '/pages/order-list/order-list' });
      }, 800);
    } catch (e) {
      wx.showModal({ title: '报名失败', content: e.error || '请稍后再试', showCancel: false });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
