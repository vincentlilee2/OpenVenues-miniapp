// 转发 / 分享到朋友圈 的统一出口（2026-09-24）
//
// 官方规则（当日实抓 developers.weixin.qq.com 文档核实，别凭印象改）：
//   · 给 <button> 设 `open-type="share"` → 用户点击后触发 `Page.onShareAppMessage`
//   · 右上角「…」菜单里的「转发」入口，**只有页面实现了 onShareAppMessage 才可用**（否则是灰的）
//   · 分享到朋友圈需要页面**同时**实现 onShareAppMessage + onShareTimeline，缺一不可
//   · **分享到朋友圈不支持自定义页面路径** → onShareTimeline 里给 path 也无效（所以本文件直接剥掉）
//   · 体验版/开发版**也能被转发**，但接收方必须是小程序「体验成员」，否则打开提示无权限
//     ⇒ 想对外推广必须发布正式版
//   · 配图建议 5:4；不传 imageUrl 时微信会截取屏幕图像当配图
//   · 官方明确禁止「转发才能解锁功能」这类诱导/强制分享 —— 别加
//
// 用法（页面里）：
//   const share = require('../../utils/share.js');
//   onLoad() { share.enableShareMenu(); }                       // 挂上「转发」+「分享到朋友圈」
//   onShareAppMessage() { return share.forVenue(this.data.venue, config.apiBase); }
//   onShareTimeline()   { return share.timelineFor(share.forVenue(...)); }

const APP_NAME = 'OpenVenues';

/** 把服务端给的相对路径拼成绝对 URL（分享卡片配图必须是可访问地址） */
function abs(url, apiBase) {
  const u = String(url || '');
  if (!u) return '';
  if (/^https?:\/\//.test(u)) return u;
  if (u.startsWith('/')) return String(apiBase || '').replace(/\/+$/, '') + u;
  return u;
}

/** 标题太长会被卡片截断，压到 40 字以内 */
function clip(s, n = 40) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** 畅打活动 → 转发内容（path 带活动 id，点开直达详情） */
function forPromo(promo, apiBase) {
  if (!promo) return forHome();
  // 标题顺序有讲究：卡片会截断，所以顺序是「名称 → 价格 → 日期 → 时段」，
  // 且**时段只有在放得下时才加**，避免把最关键的价格/日期挤掉（2026-09-24 实测踩到）
  const shortDate = String(promo.promo_date || '').slice(5); // 2026-09-28 → 09-28
  const time = promo.start_time && promo.end_time ? `${promo.start_time}-${promo.end_time}` : '';
  const price = promo.price_per_person ? `¥${promo.price_per_person}/人` : '';
  const head = /畅打/.test(String(promo.title || '')) ? '🎯' : '🎯 畅打';
  let title = [head, promo.title, price, shortDate].filter(Boolean).join(' · ');
  if (time && title.length + time.length + 3 <= 38) title += ' · ' + time;
  return {
    title: clip(title),
    path: `/pages/promo-detail/promo-detail?id=${promo.id}`,
    imageUrl: abs(promo.cover, apiBase) || undefined,
  };
}

/** 场馆 → 转发内容 */
function forVenue(venue, apiBase) {
  if (!venue) return forHome();
  const cover = venue.cover || venue.defaultCover || venue.default_cover;
  return {
    title: clip(['🏟️', venue.name, '场地预约', venue.address || ''].filter(Boolean).join(' · ')),
    path: `/pages/venue-detail/venue-detail?id=${venue.id}`,
    imageUrl: abs(cover, apiBase) || undefined,
  };
}

/** 首页 → 转发内容 */
function forHome() {
  return {
    title: `${APP_NAME} · 在线选场、畅打活动一键报名`,
    path: '/pages/index/index',
  };
}

/**
 * 朋友圈专用：官方限制「不支持自定义页面路径」，所以把 path 剥掉（留着也无效，还容易误以为生效）
 * 注意朋友圈打开的是「单页模式」（顶部导航栏 + 底部「前往小程序」不可自定义），
 * 页面要能容忍这种只读浏览（不要依赖登录态才能渲染内容）。
 */
function timelineFor(payload) {
  const { path: _drop, ...rest } = payload || {};
  return rest;
}

/**
 * 把「转发」和「分享到朋友圈」挂到右上角菜单。
 * 老基础库没有 wx.showShareMenu / 不支持朋友圈 → 静默跳过（不影响页面）。
 * @param {string[]} menus
 */
function enableShareMenu(menus = ['shareAppMessage', 'shareTimeline']) {
  try {
    if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: false, menus });
  } catch (e) {
    // 低版本基础库不支持 menus 参数时会抛错 —— 退回只开转发
    try {
      if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: false });
    } catch (_) {}
  }
}

module.exports = { APP_NAME, abs, clip, forPromo, forVenue, forHome, timelineFor, enableShareMenu };
