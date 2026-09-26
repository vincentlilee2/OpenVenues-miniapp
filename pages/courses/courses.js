// 培训课程列表（2026-09-25）
//   入口：场馆详情 →「约课」→ 本页（带 venue_id）；也支持不带 venue_id 看全部课程
//   数据：GET /api/courses（后端 = venue_promos 里 kind='course' 的行，与畅打同一张表）
//   报名：点卡片进 pages/promo-detail（与畅打**同一条报名/订单/支付链路**，只是文案按 kind 变）
const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');
const promoUtils = require('../../utils/promos.js');

// 默认海报：**课程默认图**（2026-09-26 用户提供）—— 与后端 static/promos/course-default.jpg 对应
//   （畅打列表仍用 static/promos/default.jpg，两者互不影响）
const DEFAULT_COVER = `${config.apiBase.replace(/\/$/, '')}/static/promos/course-default.jpg`;

Page({
  data: { courses: [], loading: true, venueName: '', empty: false },

  onLoad(opt) {
    this._venueId = opt.venue_id || '';
    // 从场馆详情进来时把馆名带到标题上（用户一眼知道看的是哪个馆的课）
    if (opt.venue_name) {
      const name = decodeURIComponent(opt.venue_name);
      this.setData({ venueName: name });
      wx.setNavigationBarTitle({ title: `${name} · 培训课程` });
    }
    this.load();
  },

  onShow() {
    // 从详情页报名完返回要能看到最新「已报 N」（与畅打列表一致）
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.listCourses(this._venueId);
      const apiBase = config.apiBase.replace(/\/$/, '');
      // 周期课程与周期畅打同样折叠成「最近一期」，否则一条「每周一」会刷 8 张一样的卡
      // （模版行本身不展示，只展示实例 —— 与畅打列表同一规则）
      const folded = promoUtils.collapseRecurring(
        (data || []).filter((p) => Number(p.is_recurrence_instance) !== 0 || p.recurrence_kind !== 'weekly')
      );
      const courses = folded.map((p) => {
        let cover = p.cover || '';
        if (cover && cover.startsWith('/')) cover = apiBase + cover;
        // 派生字段在 JS 里算好（WXML 不能调方法）
        // ⚠️ 必须先算 recurrenceTag 再用：写成对象字面量里的 dateText 引用「后面的 recurrenceTag」会拿到 undefined
        //    （字面量按书写顺序求值 —— 本次实测踩到：周期课程的日期显示成了具体日期）
        const recurrenceTag = promoUtils.recurrenceTagOf(p);
        const chips = [];
        if (p.coach) chips.push(`🧑‍🏫 ${p.coach}`);
        if (p.lesson_count) chips.push(`📚 共 ${p.lesson_count} 节`);
        return {
          ...p,
          cover: cover || DEFAULT_COVER,
          coachChips: chips,
          expired: time.isPast(p.signup_deadline),
          venueText: p.venue_name ? (p.court_name ? `${p.venue_name} · ${p.court_name}` : p.venue_name) : '全场馆',
          dateText: recurrenceTag ? '按周期上课' : p.promo_date || '',
          recurrenceTag,
          deadlineText: time.toLocalText(p.signup_deadline),
        };
      });
      this.setData({ courses, loading: false, empty: courses.length === 0 });
    } catch (e) {
      this.setData({ loading: false, empty: true });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/promo-detail/promo-detail?id=${id}` });
  },

  // 空态出口：去场馆详情重新找（不要留死胡同）
  goBack() {
    // getCurrentPages 是小程序运行时的全局函数；单测环境没有 → 兜底成「没有页面栈」
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages && pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },
});
