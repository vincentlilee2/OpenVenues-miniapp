const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');

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
            const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];
            const WEEKDAY_CN_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const promos = (data || [])
              // 周期模版不直接显示（会出现 N 条同名同图）；用户点某个实例进去后能"看到原模版"
              .filter((p) => p.is_recurrence_instance !== 0 || p.recurrence_kind !== 'weekly') // 保留单次 + 实例
              .map((p) => {
                // cover: 相对路径 /uploads/... → 拼绝对 URL；空 → 默认海报
                let cover = p.cover || '';
                if (cover && cover.startsWith('/')) cover = apiBase + cover;
                // 周期性标签（2026-09-24）：只在"实例"上显示；UI 友好用 "本周 X 08:00" 这种形式
                let recurrenceTag = '';
                if (p.is_recurrence_instance === 1 && p.parent_promo_id) {
                  try {
                    const wd = JSON.parse(p.recurrence_weekdays || '[]');
                    const ds = (Array.isArray(wd) ? wd : [])
                      .sort((a, b) => a - b)
                      .map((d) => WEEKDAY_CN_FULL[d])
                      .join('/');
                    recurrenceTag = ds ? '🔁 每周' + ds : '🔁 周期活动';
                  } catch (_) {
                    recurrenceTag = '🔁 周期活动';
                  }
                }
                return {
                  ...p,
                  cover: cover || DEFAULT_PROMO_COVER,
                  expired: time.isPast(p.signup_deadline),
                  createdText: time.toLocalText(p.created_at),
                  venueText: p.venue_name ? (p.court_name ? `${p.venue_name} · ${p.court_name}` : p.venue_name) : '全场馆',
                  recurrenceTag,
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
