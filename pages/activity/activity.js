// 「活动」tab 页（2026-09-26）
//   用户：「小程序界面中 订单 改成 活动，点击进入显示当前发布的活动与课程。」
//   → 原来 tabBar 第二格是「订单」（pages/order-list），改成「活动」并指向本页；
//     订单页仍在（从「我的 → 我的订单」进，不再是 tabBar 页）。
//   数据：/api/promos（畅打活动）+ /api/courses（培训课程）—— 两者是同一张表的 kind 分流。
const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');
const promoUtils = require('../../utils/promos.js');

const apiBase = config.apiBase.replace(/\/$/, '');
// 不选海报时的兜底图：活动用 default.jpg、课程用 course-default.jpg（2026-09-26 用户提供的课程图）
const DEFAULT_PROMO_COVER = `${apiBase}/static/promos/default.jpg`;
const DEFAULT_COURSE_COVER = `${apiBase}/static/promos/course-default.jpg`;

Page({
  data: { seg: 'promo', list: [], loading: true },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    // 自定义 tabBar：本页是 tabBar 第 2 格（2026-09-26「订单」改成「活动」）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 从详情页报名/返回后能看到最新「已报 N」
    this.loadAll();
  },

  switchSeg(e) {
    const seg = e.currentTarget.dataset.seg;
    if (seg === this.data.seg) return;
    this.setData({ seg, loading: true });
    this.render();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      // 两类都拉（数量都不大）；失败的那一类不影响另一类
      const [promos, courses] = await Promise.all([
        api.listPromos('').catch(() => []),
        api.listCourses('').catch(() => []),
      ]);
      this._raw = { promo: promos || [], course: courses || [] };
      this.render();
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  // 派生字段在这里算好（WXML 不能调方法），并按当前段位渲染
  render() {
    const kind = this.data.seg === 'course' ? 'course' : 'promo';
    const raw = (this._raw && this._raw[kind]) || [];
    // 周期活动/课程只留最近一期（与活动列表、课程列表同一套规则，别再各写一份）
    const folded = promoUtils.collapseRecurring(
      raw.filter((p) => Number(p.is_recurrence_instance) !== 0 || p.recurrence_kind !== 'weekly')
    );
    const isCourse = kind === 'course';
    const list = folded.map((p) => {
      let cover = p.cover || '';
      if (cover && cover.startsWith('/')) cover = apiBase + cover;
      // ⚠️ 先算 recurrenceTag 再用（对象字面量按书写顺序求值 —— 这里踩过一次）
      const recurrenceTag = promoUtils.recurrenceTagOf(p);
      const chips = [];
      if (isCourse) {
        if (p.coach) chips.push(`🧑‍🏫 ${p.coach}`);
        if (p.lesson_count) chips.push(`📚 共 ${p.lesson_count} 节`);
      }
      return {
        ...p,
        cover: cover || (isCourse ? DEFAULT_COURSE_COVER : DEFAULT_PROMO_COVER),
        chips,
        expired: time.isPast(p.signup_deadline),
        venueText: p.venue_name ? (p.court_name ? `${p.venue_name} · ${p.court_name}` : p.venue_name) : '全场馆',
        timeText: recurrenceTag ? `按周期上课` : `${p.promo_date} ${p.start_time}-${p.end_time}`,
        recurrenceTag,
        // 活动说「成团」、课程说「成班」——语义不同，别混用
        metaSub: `${p.min_participants}人${isCourse ? '成班' : '成团'}`,
      };
    });
    this.setData({ list, loading: false, empty: list.length === 0 });
  },

  // 点卡片 → 活动/课程详情（同一个详情页，按 kind 适配文案）
  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/promo-detail/promo-detail?id=${id}` });
  },
});
