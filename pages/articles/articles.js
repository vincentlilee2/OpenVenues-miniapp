// 服务介绍列表（2026-09-26）
//   入口：场馆详情页「介绍…」→ 本页（带 venue_id，只看该馆的 + 通用的文章）
//         不带 venue_id 时显示全部（留给以后的「全部介绍」入口）
const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');

Page({
  data: { list: [], loading: true, empty: false, venueName: '' },

  onLoad(opt) {
    this._venueId = opt.venue_id || '';
    if (opt.venue_name) {
      const name = decodeURIComponent(opt.venue_name);
      this.setData({ venueName: name });
      wx.setNavigationBarTitle({ title: `${name} · 介绍` });
    }
    this.load();
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.listArticles(this._venueId);
      const apiBase = config.apiBase.replace(/\/$/, '');
      const list = (data || []).map((a) => {
        let cover = a.cover || '';
        if (cover && cover.startsWith('/')) cover = apiBase + cover;
        return {
          ...a,
          cover,
          // 摘要：正文前 60 字（纯文本，去掉换行）—— 模板里不能调方法
          excerpt: String(a.content || '').replace(/\s+/g, ' ').slice(0, 60),
          publishText: a.publish_at ? time.toLocalText(a.publish_at) : '',
        };
      });
      this.setData({ list, loading: false, empty: list.length === 0 });
    } catch (e) {
      this.setData({ loading: false, empty: true });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },

  openArticle(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/article/article?id=${id}` });
  },
});
