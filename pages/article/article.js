// 文章详情（场馆介绍，2026-09-26）—— **纯展示页：没有报名按钮、没有价格、没有名额**
//   入口：① 「活动与课程」页的活动列表末尾的文章卡 ② 场馆详情「介绍…」→ 场馆介绍列表
//   正文是纯文本（换行分段），后端已经把 paragraphs 拆好（模板里不能调方法）。
const api = require('../../api/index.js');
const config = require('../../config.js');
const time = require('../../utils/time.js');
const share = require('../../utils/share.js');

Page({
  data: { article: null, loading: true, paragraphs: [], publishText: '' },

  onLoad(opt) {
    this._id = opt.id;
    this.load();
  },

  onShareAppMessage() {
    const a = this.data.article;
    return {
      title: a ? `${a.title}${a.subtitle ? ' · ' + a.subtitle : ''}` : '场馆介绍',
      path: `/pages/article/article?id=${this._id}`,
    };
  },
  onShareTimeline() {
    const a = this.data.article;
    // 朋友圈不支持自定义 path（官方限制）→ 只给标题
    return { title: a ? a.title : '场馆介绍' };
  },

  async load() {
    this.setData({ loading: true });
    try {
      const a = await api.getArticle(this._id);
      // 封面：相对路径 → 绝对 URL；没有封面 → 空（wxml 走渐变底 + 标题占位）
      const apiBase = config.apiBase.replace(/\/$/, '');
      let cover = a.cover || '';
      if (cover && cover.startsWith('/')) cover = apiBase + cover;
      this.setData({
        article: { ...a, cover },
        // 后端已按换行拆段；这里兜底再拆一次（老数据/直连时也能显示）
        paragraphs: Array.isArray(a.paragraphs) && a.paragraphs.length
          ? a.paragraphs
          : String(a.content || '').split('\n').map((s) => s.trim()).filter(Boolean),
        publishText: a.publish_at ? time.toLocalText(a.publish_at) : '',
        loading: false,
      });
      share.enableShareMenu();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.error || '加载失败', icon: 'none' });
    }
  },
});
