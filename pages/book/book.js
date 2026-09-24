// 约场页：日期 / 网格 / 5 状态 / 下单
// 排版交给 grid.js（纯绝对定位，不用 CSS Grid），本文件只管取数 + 交互
const api = require('../../api/index.js');
const session = require('../../utils/session.js');
const contact = require('../../utils/contact.js');
const pay = require('../../utils/pay.js');
const grid = require('./grid.js');
const merge = require('./merge.js');

const WD_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

Page({
  data: {
    venueId: null,
    venueName: '',
    activeDate: '',
    dateTabs: [],
    courts: [],          // [{id, name, max_capacity}]
    heads: [],           // 表头（场地名）绝对定位
    rows: [],            // 整小时行 [{hour,label,top,cells}]
    promos: [],          // 畅打浮层（列内纵向跨多小时）
    geo: {},             // 画布尺寸
    selectedKeys: {},    // { "court_id|HH:00": true }
    selectedCount: 0,
    maxCourts: 2,
    totalPrice: 0,
    holidayPrice: false,
    loading: false,
    booking: false,
    uid: '',
    contact_name: '',    // 联系人姓名（自动填入登录用户昵称，可改）
    contact_phone: '',   // 联系人手机号（自动填入登录用户手机号，可改）
  },

  onLoad(opt) {
    this._venueId = Number(opt.venue_id);
    const uid = session.getUid();
    this.setData({ uid });
    this.fillContact();

    // 日期 Tab（今天起 7 天）
    const tabs = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86400e3);
      tabs.push({
        date: d.toISOString().slice(0, 10),
        weekdayLabel: WD_LABEL[d.getDay()] + (i === 0 ? ' 今天' : ''),
        day: String(d.getDate()),
      });
    }
    this.setData({ dateTabs: tabs, activeDate: tabs[0].date });

    this.loadVenue();
  },

  // 自动填入联系人：本机上次填写 > 登录用户资料（昵称 / 手机号）
  // 只填空字段，不覆盖用户已经改过的内容
  async fillContact() {
    try {
      const c = await contact.resolveContact();
      const patch = {};
      if (!String(this.data.contact_name || '').trim() && c.name) patch.contact_name = c.name;
      if (!String(this.data.contact_phone || '').trim() && c.phone) patch.contact_phone = c.phone;
      if (Object.keys(patch).length) this.setData(patch);
    } catch (e) {
      console.log('[book] 自动填入联系人失败：', e && (e.error || e.message));
    }
  },

  onContactInput(e) {
    const k = e.currentTarget.dataset.k;
    if (k) this.setData({ [k]: e.detail.value });
  },

  async loadVenue() {
    this.setData({ loading: true });
    try {
      const v = await api.getVenue(this._venueId);
      this.setData({
        venueId: v.id,
        venueName: v.name,
        courts: v.courts || [],
        loading: false,
      });
      wx.setNavigationBarTitle({ title: v.name });
      this.loadAvailability();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  async loadAvailability() {
    let { activeDate, courts, uid } = this.data;
    if (!activeDate || !courts.length) return;
    // 登录是异步的：首次进入可能还没拿到 uid，等一下就绪（availability 是公开接口，不会自动等）
    if (!uid) {
      try {
        await session.ready();
        uid = session.getUid();
        this.setData({ uid });
      } catch (e) {
        console.warn('[book] 登录未就绪，本次按游客渲染（不显示「我的预定」标记）:', e.message || e);
      }
    }
    this.setData({ loading: true });
    try {
      const allSlots = [];
      let hasOverride = false;
      for (const c of courts) {
        const r = await api.courtAvailability(c.id, activeDate, uid);
        if (r.hasOverride) hasOverride = true;
        for (const s of r.slots || []) allSlots.push({ ...s, court_id: c.id });
      }
      const selectedSet = new Set(Object.keys(this.data.selectedKeys || {}));
      const built = grid.buildRows(allSlots, courts, selectedSet);
      this.setData({
        heads: built.heads,
        rows: built.rows,
        promos: built.promos,
        geo: built.geo,
        holidayPrice: hasOverride, // 当天命中了节假日价格
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载时段失败', icon: 'none' });
    }
  },

  onDateTap(e) {
    const date = e.currentTarget.dataset.date;
    if (date === this.data.activeDate) return;
    this.setData({
      activeDate: date,
      selectedKeys: {}, selectedCount: 0, totalPrice: 0,
      rows: [], promos: [],
    });
    this.loadAvailability();
  },

  onSlotTap(e) {
    const { status, cid, slot } = e.currentTarget.dataset;
    if (status === 'past') {
      wx.showToast({ title: '该时段已过去，不可预约', icon: 'none' });
      return;
    }
    if (status !== 'available' && status !== 'selected') return; // booked / mine / closed 不可选
    const selectedKeys = { ...this.data.selectedKeys };
    const key = `${cid}|${slot}`;
    if (status === 'available') {
      if (this.data.selectedCount >= this.data.maxCourts) {
        wx.showToast({ title: `最多选 ${this.data.maxCourts} 个场地`, icon: 'none' });
        return;
      }
      selectedKeys[key] = true;
    } else {
      delete selectedKeys[key];
    }
    this.setData({ selectedKeys, selectedCount: Object.keys(selectedKeys).length });
    this._recalcTotal();
    this.loadAvailability();
  },

  // 点击畅打块 → 活动详情
  onPromoTap(e) {
    const promoId = e.currentTarget.dataset.promoId;
    if (promoId) wx.navigateTo({ url: `/pages/promo-detail/promo-detail?id=${promoId}` });
  },

  _recalcTotal() {
    let total = 0;
    const { selectedKeys } = this.data;
    for (const r of this.data.rows) {
      for (const c of r.cells) {
        if (selectedKeys[`${c.cid}|${c.slot}`]) total += c.price || 0;
      }
    }
    this.setData({ totalPrice: total });
  },

  async onBook() {
    const { selectedKeys, activeDate, totalPrice, venueName, rows } = this.data;
    // 同一场地 + 连续小时 → 合并成一次预约（一个订单），不再每小时一条
    const groups = merge.groupSelection(selectedKeys, rows);
    if (groups.length === 0) return;
    const totalHours = groups.reduce((s, g) => s + g.hours, 0);

    // 联系人校验（此前这里没有输入框，直接写死假号 —— 场馆根本联系不到顾客）
    const contactName = String(this.data.contact_name || '').trim();
    const contactPhone = String(this.data.contact_phone || '').trim();
    if (!contact.isName(contactName)) {
      return wx.showToast({ title: '请填写联系人姓名', icon: 'none' });
    }
    if (!contact.isPhone(contactPhone)) {
      return wx.showToast({ title: '请填写正确的 11 位手机号', icon: 'none' });
    }

    const detail = groups
      .map((g) => {
        const court = this.data.courts.find((c) => c.id === g.court_id) || {};
        return `${court.name || '场地' + g.court_id} ${g.start_time}-${g.end_time}（${g.hours}h ¥${g.price}）`;
      })
      .join('\n');

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '确认预约',
        content: `${venueName}\n${detail}\n共 ${groups.length} 个场地 / ${totalHours} 小时，合计 ¥${totalPrice}。\n提交后请准时到场。`,
        confirmText: '确认提交',
        cancelText: '再看看',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!confirm) return;

    this.setData({ booking: true });
    let okCount = 0;
    let failMsg = '';
    const needPay = []; // 需要支付的订单（2026-09-24：下单即付）
    for (const g of groups) {
      try {
        const created = await api.createOrder({
          court_id: g.court_id,
          booking_date: activeDate,
          start_time: g.start_time,
          end_time: g.end_time,
          contact_name: contactName,
          contact_phone: contactPhone,
        });
        okCount++;
        const d = (created && created.data) || {};
        if (d.need_pay) needPay.push({ id: d.id, total_price: d.total_price });
      } catch (e) {
        failMsg = e.error || '下单失败';
      }
    }
    this.setData({ booking: false });

    if (okCount === groups.length) {
      // 下单成功 → 记到本机（下次自动填）+ 资料里没手机号时补上（跨设备也能自动填）
      contact.persistContact(api, { name: contactName, phone: contactPhone });

      // ===== 支付（2026-09-24）=====
      //   下单即付：先按总金额确认一次，再逐单调起收银台（一单一付，微信侧一单一交易）
      //   未开通支付的门店 need_pay 为 false → 走原来的"下单成功"提示，行为与历史一致
      if (needPay.length) {
        const sum = needPay.reduce((s, o) => s + Number(o.total_price || 0), 0).toFixed(2);
        const goPay = await new Promise((resolve) =>
          wx.showModal({
            title: '预约成功，请完成支付',
            content: `${needPay.length} 单合计 ¥${sum}。请在 15 分钟内完成支付 —— 超时订单自动关闭并释放场地。`,
            confirmText: '立即支付',
            cancelText: '稍后支付',
            success: (r) => resolve(r.confirm),
          })
        );
        if (goPay) {
          let paidCount = 0;
          let pendingCount = 0;
          for (const o of needPay) {
            const r = await pay.payOrder(o.id, { silent: true });
            if (r.paid) paidCount++;
            else if (r.pending) pendingCount++;
          }
          if (paidCount) wx.showToast({ title: `已支付 ${paidCount} 单`, icon: 'success' });
          else if (pendingCount) {
            await new Promise((resolve) =>
              wx.showModal({
                title: '支付结果确认中',
                content: '微信已受理，入账可能需几秒。请稍后在「我的订单」查看；若未支付成功，15 分钟内可重新支付。',
                showCancel: false,
                success: resolve,
              })
            );
          }
        }
      } else {
        wx.showToast({ title: `已预约 ${okCount} 单`, icon: 'success' });
      }
      this.setData({ selectedKeys: {}, selectedCount: 0, totalPrice: 0 });
      this.loadAvailability();
      wx.setStorageSync('order_filter', 'all');
      wx.setStorageSync('order_filter_source', 'hourly');
      setTimeout(() => wx.switchTab({ url: '/pages/order-list/order-list' }), 800);
    } else {
      wx.showModal({
        title: '部分失败',
        content: `成功 ${okCount}/${groups.length}。${failMsg}`,
        showCancel: false,
      });
    }
  },
});
