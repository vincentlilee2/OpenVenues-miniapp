// 订单展示派生字段（模板里不能调方法，页面的派生文本统一在这里算，便于单测）

/**
 * 订单的「场地」显示文本
 *   普通约场 → 具体场地名（court_name）
 *   畅打：活动指定了场地 → 那个场地；活动是**场馆级/全场馆**（promo.court_id 为空）→ 「全部场地」
 *     ⚠️ 场馆级畅打报名时，订单的 court_id 只是为满足非空约束取的「该场馆第一个场地」，
 *        直接显示会误导用户以为订的是那个场地。
 *   场地被删/未指定 → 「未指定」
 */
function courtTextOf(order) {
  const o = order || {};
  if (o.source === 'promo' && o.promo && !o.promo.court_id) return '全部场地';
  return o.court_name || '未指定';
}

/** 「场馆 / 场地」一行文本（列表页那种紧凑写法：A 室内场馆 · 1 号台） */
function venueCourtLine(order) {
  const o = order || {};
  const court = courtTextOf(o);
  if (!o.venue_name) return court;
  if (!court || court === '未指定') return o.venue_name;
  return `${o.venue_name} · ${court}`;
}

module.exports = { courtTextOf, venueCourtLine };
