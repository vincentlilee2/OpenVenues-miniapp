// 场馆详情页「活动」按钮：
//   · 2026-09-27 用户先要求「该馆没有发布畅打活动时不显示这个按钮」，随后改回：
//     **始终显示**，但按钮文案从「畅打」改成「活动」。
//   · 同时保留 utils/promos.js 的 hasJoinable 行为用例 —— 它编码的是「与活动列表页同口径」
//     的规则（滤模板 → 折叠周期 → 未截止 → 只管 promo），将来若再要按条件显示可直接复用。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (label, cond, extra) => {
  if (cond) {
    pass += 1;
    console.log('  ✓ ' + label);
  } else {
    fail += 1;
    console.log('  ✗ ' + label + (extra ? '  ' + extra : ''));
  }
};

const promoUtils = require(path.join(ROOT, 'utils', 'promos.js'));
const FUTURE = '2030-01-01 00:00:00';
const PAST = '2020-01-01 00:00:00';

console.log('--- ① hasJoinable（保留：把"与活动列表页同口径"的规则钉住）---');
ok('空列表 → false', promoUtils.hasJoinable([]) === false);
ok('null / undefined 不炸 → false', promoUtils.hasJoinable(null) === false && promoUtils.hasJoinable(undefined) === false);
ok(
  '只有「每周模版」（占位截止 1900）→ false',
  promoUtils.hasJoinable([
    { id: 1, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 0, signup_deadline: '1900-01-01T00:00:00.000Z' },
  ]) === false
);
ok(
  '有未截止的实例 → true',
  promoUtils.hasJoinable([
    { id: 2, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 1, promo_date: '2030-01-07', signup_deadline: FUTURE },
  ]) === true
);
ok(
  '实例已过报名截止 → false',
  promoUtils.hasJoinable([
    { id: 3, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 1, promo_date: '2020-01-06', signup_deadline: PAST },
  ]) === false
);
ok(
  '★ 只有课程（kind=course）不算"有畅打"',
  promoUtils.hasJoinable([{ id: 4, kind: 'course', promo_date: '2030-01-08', signup_deadline: FUTURE }]) === false
);
ok(
  '★ 单次畅打未截止 → true',
  promoUtils.hasJoinable([{ id: 5, kind: 'promo', recurrence_kind: 'none', is_recurrence_instance: 0, promo_date: '2030-01-09', signup_deadline: FUTURE }]) === true
);
ok(
  '★ 模版 + 实例混合：按实例判定',
  promoUtils.hasJoinable([
    { id: 6, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 0, signup_deadline: '1900-01-01T00:00:00.000Z' },
    { id: 7, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 1, promo_date: '2030-01-07', signup_deadline: FUTURE },
  ]) === true
);

console.log('\n--- ② 静态：按钮始终显示、文案「活动」（2026-09-27 用户最终要求）---');
const wxml = read('pages/venue-detail/venue-detail.wxml');
const js = read('pages/venue-detail/venue-detail.js');

// 取出绑定 onPromoList 的那个 button 标签（用它自己的开闭标签定界，不用正则转义斜杠）
const start = wxml.indexOf('bindtap="onPromoList"');
const btnStart = start >= 0 ? wxml.lastIndexOf('<button', start) : -1;
const btnEnd = start >= 0 ? wxml.indexOf('</button>', start) : -1;
const btn = btnStart >= 0 && btnEnd > btnStart ? wxml.slice(btnStart, btnEnd + '</button>'.length) : '';
// split('>') 会把最后那个 '>' 当分隔符吃掉 → 这里剥的是 '</button'（没有 '>'）
const btnLabel = btn.includes('>') ? (btn.split('>')[1] || '').replace('</button', '').trim() : '';

ok('按钮存在且绑定 onPromoList', !!btn, btn.slice(0, 80));
ok('★★ 按钮没有任何 wx:if 守卫（恢复常显，不再按有无活动隐藏）', !!btn && !btn.includes('wx:if'), btn.slice(0, 80));
ok('★★ 按钮文案是「活动」（不再是「畅打」）', btnLabel === '活动' && !btn.includes('畅打'), 'label=' + JSON.stringify(btnLabel));
ok('js：页面里已无 hasPromo 逻辑', !js.includes('hasPromo'));
ok('js：onPromoList 仍进该场馆的活动列表', js.includes('onPromoList') && js.includes('/pages/promos/promos?venue_id='));
ok('js：不再为按钮额外拉一次活动列表（省一次请求）', !js.includes('hasJoinable'));

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
