// 场馆详情页「畅打」按钮：**该馆没有可报名的畅打时不要显示**
//   用户 2026-09-27：「场馆详情页面中，如果该馆没有对应发布的畅打活动时，则下面不要显示 畅打 按钮」
//
// 覆盖：
//   ① 行为：utils/promos.js 的 hasJoinable（与畅打列表页同口径：滤掉每周模版 → 折叠周期 → 未截止）
//   ② 静态：wxml 用 wx:if="{{hasPromo}}" 守卫；js 拉活动后计算；拉失败时**失败开放**（有按钮）
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

const promptUtils = require(path.join(ROOT, 'utils', 'promos.js'));
const FUTURE = '2030-01-01 00:00:00'; // 未截止
const PAST = '2020-01-01 00:00:00'; // 已截止

console.log('--- ① 行为：hasJoinable（口径必须与畅打列表页一致）---');
ok('空列表 → 不显示按钮', promptUtils.hasJoinable([]) === false);
ok('null / undefined 也不炸 → 不显示按钮', promptUtils.hasJoinable(null) === false && promptUtils.hasJoinable(undefined) === false);
ok(
  '只有「每周模版」（signup_deadline=占位 1900）→ 不显示按钮',
  promptUtils.hasJoinable([
    { id: 1, kind: 'promo', title: '周一上午畅打', recurrence_kind: 'weekly', is_recurrence_instance: 0, signup_deadline: '1900-01-01T00:00:00.000Z' },
  ]) === false
);
ok(
  '有未截止的实例 → 显示按钮',
  promptUtils.hasJoinable([
    { id: 2, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 1, promo_date: '2030-01-07', signup_deadline: FUTURE },
  ]) === true
);
ok(
  '实例已过报名截止 → 不显示按钮',
  promptUtils.hasJoinable([
    { id: 3, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 1, promo_date: '2020-01-06', signup_deadline: PAST },
  ]) === false
);
ok(
  '★ 只有课程（kind=course）不该点亮「畅打」按钮',
  promptUtils.hasJoinable([{ id: 4, kind: 'course', promo_date: '2030-01-08', signup_deadline: FUTURE }]) === false
);
ok(
  '★ 单次畅打（非周期）未截止 → 显示按钮',
  promptUtils.hasJoinable([{ id: 5, kind: 'promo', recurrence_kind: 'none', is_recurrence_instance: 0, promo_date: '2030-01-09', signup_deadline: FUTURE }]) === true
);
ok(
  '★ 模版 + 实例混在一起：按实例判定（折叠后仍算"有"）',
  promptUtils.hasJoinable([
    { id: 6, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 0, signup_deadline: '1900-01-01T00:00:00.000Z' },
    { id: 7, kind: 'promo', recurrence_kind: 'weekly', is_recurrence_instance: 1, promo_date: '2030-01-07', signup_deadline: FUTURE },
  ]) === true
);

console.log('\n--- ② 静态：页面真的用了它 ---');
const wxml = read('pages/venue-detail/venue-detail.wxml');
const js = read('pages/venue-detail/venue-detail.js');
ok('wxml：畅打按钮被 wx:if="{{hasPromo}}" 守卫', /<button[^>]*wx:if="\{\{hasPromo\}\}"[^>]*bindtap="onPromoList"/.test(wxml), (wxml.match(/<button[^>]*onPromoList[^>]*>/) || [''])[0]);
ok('js：data 里有 hasPromo（默认 null = 先不显示）', /hasPromo:\s*null/.test(js));
ok('js：拉到活动后调 hasJoinable 计算', /promoUtils\.hasJoinable\(/.test(js));
ok('js：活动列表拉失败时**失败开放**（显示按钮，别让有活动的馆没入口）', /catch[\s\S]{0,120}hasPromo:\s*true/.test(js));
ok('js：按场馆过滤拉活动（listPromos(this._id)）', /listPromos\(this\._id\)/.test(js));

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
