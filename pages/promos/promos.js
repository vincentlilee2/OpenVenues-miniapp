const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');
const promoUtils = require('../../utils/promos.js');

// 默认畅打海报（与后端 static/promos/default.jpg 对应）
const DEFAULT_PROMO_COVER = `${config.apiBase.replace(/\/$/, '')}/static/promos/default.jpg`;

Page({
  data: { promos: [], loading: true },

  onLoad(opt) {
    this._venueId = opt.venue_id || '';
    this.load();
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
            const data = await api.listPromos(this._venueId);
            // 模板里不能调用 Page 方法（{{isExpired(item)}} 会渲染成空），派生字段在这里算好
            const apiBase = config.apiBase.replace(/\/$/, '');
            // 周期活动折叠：同一个周活动只留「最近一期」（本周内还有未开始的就取本周那期，
            // 否则取最近的未来一期）——否则一条「每周一」会刷 8 张一样的卡（用户 2026-09-25 要求）
            const folded = promoUtils.collapseRecurring(
              (data || []).filter((p) => Number(p.is_recurrence_instance) !== 0 || p.recurrence_kind !== 'weekly')
            );
            const promos = folded
              .map((p) => {
                // cover: 相对路径 /uploads/... → 拼绝对 URL；空 → 默认海报
                let cover = p.cover || '';
                if (cover && cover.startsWith('/')) cover = apiBase + cover;
                return {
                  ...p,
                  cover: cover || DEFAULT_PROMO_COVER,
                  expired: time.isPast(p.signup_deadline),
                  createdText: time.toLocalText(p.created_at),
                  venueText: p.venue_name ? (p.court_name ? `${p.venue_name} · ${p.court_name}` : p.venue_name) : '全场馆',
                  recurrenceTag: promoUtils.recurrenceTagOf(p),
                };
              });
            this.setData({ promos, loading: false });
          } catch (e) {
            this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/promo-detail/promo-detail?id=${id}` });
  },
});
