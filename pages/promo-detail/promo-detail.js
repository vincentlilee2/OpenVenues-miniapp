const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');
const contact = require('../../utils/contact.js');
const pay = require('../../utils/pay.js');
const share = require('../../utils/share.js');

// 默认畅打海报（与后端 static/promos/default.jpg 对应）
const DEFAULT_PROMO_COVER = `${config.apiBase.replace(/\/$/, '')}/static/promos/default.jpg`;

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

  // 转发 / 分享到朋友圈（2026-09-24）：官方要求朋友圈需 onShareAppMessage + onShareTimeline 同时实现
  onShareAppMessage() {
    return share.forPromo(this.data.promo, config.apiBase);
  },
  onShareTimeline() {
    // 朋友圈不支持自定义 path（官方限制），timelineFor 会剥掉 path
    return share.timelineFor(share.forPromo(this.data.promo, config.apiBase));
  },

  onLoad(opt) {
    share.enableShareMenu(); // 把「转发」「分享到朋友圈」挂到右上角菜单
    this._id = opt.id;
    this.setData({ form: { booker_name: '', booker_phone: '', participant_names_text: '' } });
    this.fillContact();
    this.load();
  },

  // 自动填入联系人：本机上次填写 > 登录用户资料（昵称 / 手机号）
  // 只填空字段，不覆盖用户已经改过的内容
  async fillContact() {
    try {
      const c = await contact.resolveContact();
      const form = { ...this.data.form };
      let changed = false;
      if (!String(form.booker_name || '').trim() && c.name) {
        form.booker_name = c.name;
        changed = true;
      }
      if (!String(form.booker_phone || '').trim() && c.phone) {
        form.booker_phone = c.phone;
        changed = true;
      }
      if (changed) this.setData({ form });
    } catch (e) {
      console.log('[promo-detail] 自动填入联系人失败：', e && (e.error || e.message));
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      const p = await api.getPromo(this._id);
      const isExpired = time.isPast(p.signup_deadline);
      // cover: 相对路径 → 绝对 URL；空 → 默认海报
      const apiBase = config.apiBase.replace(/\/$/, '');
      let cover = p.cover || '';
      if (cover && cover.startsWith('/')) cover = apiBase + cover;
      p.cover = cover || DEFAULT_PROMO_COVER;
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
      const created = await api.signupPromo(promo.id, {
        participant_count: participantCount,
        booker_name: form.booker_name.trim(),
        booker_phone: form.booker_phone.trim(),
        participant_names,
      });
      // 记到本机（下次自动填）+ 资料里没手机号时补上（跨设备也能自动填）
      contact.persistContact(api, { name: form.booker_name, phone: form.booker_phone });

      // 支付（2026-09-24）：报名费下单即付（未开通支付 → need_pay 为 false，行为与历史一致）
      const data = (created && created.data) || {};
      if (data.need_pay) {
        const r = await pay.handleAfterCreate({ id: data.order_id, need_pay: true, total_price: data.total_price }, 'promo');
        if (r && r.paid) wx.showToast({ title: '报名成功，已支付', icon: 'success' });
        else if (r && r.pending) {
          await new Promise((resolve) =>
            wx.showModal({
              title: '支付结果确认中',
              content: '微信已受理，入账可能需几秒。请稍后在「我的订单」查看；若未支付成功，15 分钟内可重新支付。',
              showCancel: false,
              success: resolve,
            })
          );
        } else if (!r || !r.defered) {
          wx.showToast({ title: '报名成功，待支付', icon: 'none' });
        } else {
          wx.showToast({ title: '报名成功，可稍后支付', icon: 'none' });
        }
      } else {
        wx.showToast({ title: '报名成功！', icon: 'success' });
      }
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
