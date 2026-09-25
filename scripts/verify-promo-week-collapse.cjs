// 活动列表「周期活动只显示一期」验证
//   用户 2026-09-25：「小程序端活动列表页面现在是显示了重复活动的 8 周内实例，改成只显示本周实例」
// 逻辑全在纯函数 utils/promos.js 的 collapseRecurring 里 → 这里直接单测它，再静态断言页面接线。
const fs = require('fs');
const path = require('path');
const { collapseRecurring, recurrenceTagOf, mondayOf, sundayOf } = require('../utils/promos.js');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
};

// 真实形状：一条「每周一 09:00-11:00」被展开成 8 个实例（模版 #784 → 实例 #785-792）
const inst = (id, date) => ({
  id, title: '周一上午畅打', promo_date: date, start_time: '09:00', end_time: '11:00',
  price_per_person: 50, is_recurrence_instance: 1, parent_promo_id: 784, recurrence_weekdays: '[1]',
});
const INSTANCES = [
  inst(785, '2026-09-28'), inst(786, '2026-10-05'), inst(787, '2026-10-12'), inst(788, '2026-10-19'),
  inst(789, '2026-10-26'), inst(790, '2026-11-02'), inst(791, '2026-11-09'), inst(792, '2026-11-16'),
];

console.log('--- ① 真实场景：8 个实例 → 只留 1 期 ---');
// 2026-09-25 是周五；「每周一」的最近一期是 09-28（下周一）→ 本周（09-21~09-27）内没有可报的，
// 按规则回退到「最近的未来一期」，活动不会消失
const r1 = collapseRecurring(INSTANCES, '2026-09-25');
ok('8 个实例折叠成 1 期', r1.length === 1, '实际 ' + r1.length);
ok('★ 取的是最近的一期 2026-09-28', r1[0]?.promo_date === '2026-09-28', r1[0]?.promo_date);

console.log('\n--- ② 今天就是活动当天（周一）→ 取本周那一期 ---');
const r2 = collapseRecurring(INSTANCES, '2026-09-28');
ok('仍只留 1 期', r2.length === 1);
ok('取的是 09-28 这天自己', r2[0]?.promo_date === '2026-09-28', r2[0]?.promo_date);

console.log('\n--- ③ 本周内还有未开始的一期 → 必须取本周那期（而不是更远的下周）---');
// 周三活动：今天周一 09-28，本周（09-28~10-04）内有 09-30 那期 → 取它
const wed = [inst(801, '2026-09-30'), inst(802, '2026-10-07'), inst(803, '2026-10-14')]
  .map((p) => ({ ...p, parent_promo_id: 899, recurrence_weekdays: '[3]' }));
const r3 = collapseRecurring(wed, '2026-09-28');
ok('只留 1 期', r3.length === 1);
ok('★ 取的是本周内的 09-30', r3[0]?.promo_date === '2026-09-30', r3[0]?.promo_date);
ok('周日边界正确（09-28 那周 = 09-28~10-04）', mondayOf('2026-10-04') === '2026-09-28' && sundayOf('2026-09-28') === '2026-10-04');

console.log('\n--- ④ 单次活动不受影响；多个周期活动各自留 1 期 ---');
const single = { id: 900, title: '国庆畅打', promo_date: '2026-10-01', start_time: '14:00', end_time: '16:00', is_recurrence_instance: 0, recurrence_kind: 'none' };
const r4 = collapseRecurring([single, ...INSTANCES, ...wed], '2026-09-25');
ok('3 条（单次 + 两个周期各 1 期）', r4.length === 3, '实际 ' + r4.length + ' → ' + r4.map((p) => p.promo_date).join(','));
ok('单次活动原样保留', r4.some((p) => p.id === 900));
ok('按日期升序排列', JSON.stringify(r4.map((p) => p.promo_date)) === JSON.stringify([...r4.map((p) => p.promo_date)].sort()), r4.map((p) => p.promo_date).join(','));

console.log('\n--- ⑤ 边界 ---');
const past = [inst(901, '2026-09-01'), inst(902, '2026-09-08')].map((p) => ({ ...p, parent_promo_id: 899 }));
const r5 = collapseRecurring(past, '2026-09-25');
ok('实例全过期 → 仍保留 1 期（活动不消失）', r5.length === 1 && r5[0].promo_date === '2026-09-01', JSON.stringify(r5.map((p) => p.promo_date)));
ok('空数组安全', collapseRecurring([], '2026-09-25').length === 0);
ok('null 安全', collapseRecurring(null, '2026-09-25').length === 0);
ok('模版行（is_recurrence_instance=0）不会被当成实例吞掉', collapseRecurring([{ id: 784, title: '模版', promo_date: '1900-01-01', start_time: '09:00', is_recurrence_instance: 0, recurrence_kind: 'weekly' }, ...INSTANCES], '2026-09-25').length === 2);

console.log('\n--- ⑥ 周期标签（文本不带 emoji，emoji 由 wxml 前缀提供）---');
ok('实例 → 「每周一」', recurrenceTagOf(INSTANCES[0]) === '每周一', recurrenceTagOf(INSTANCES[0]));
ok('多选周几 → 「每周一/周三」', recurrenceTagOf({ is_recurrence_instance: 1, parent_promo_id: 1, recurrence_weekdays: '[3,1]' }) === '每周一/周三');
ok('★ 标签里不含 emoji（否则列表会渲染成「🔁 🔁 …」）', !/🔁/.test(recurrenceTagOf(INSTANCES[0])));
ok('非实例 → 空串', recurrenceTagOf({ is_recurrence_instance: 0, recurrence_weekdays: '[1]' }) === '');
ok('weekdays 脏数据不崩', recurrenceTagOf({ is_recurrence_instance: 1, recurrence_weekdays: 'not-json' }) === '周期活动');

console.log('\n--- ⑦ 页面接线（静态）---');
const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'pages', 'promos', 'promos.js'), 'utf8');
const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'promos', 'promos.wxml'), 'utf8');
const detailSrc = fs.readFileSync(path.join(__dirname, '..', 'pages', 'promo-detail', 'promo-detail.js'), 'utf8');
ok('列表页调用 foldRecurring（collapseRecurring）', /collapseRecurring\(/.test(pageSrc));
ok('列表页从 utils/promos.js 引入', /require\('\.\.\/\.\.\/utils\/promos\.js'\)/.test(pageSrc));
ok('列表页不再自己拼「每周」标签（映射只有一处）', !/WEEKDAY_CN_FULL\s*=/.test(pageSrc) && !/🔁/.test(pageSrc));
ok('详情页也用同一份实现（不再各写一份）', /promoUtils\.recurrenceTagOf\(/.test(detailSrc) && !/const WD = \[/.test(detailSrc));
ok('列表 wxml 自己带 🔁 前缀（与上面的「标签不带 emoji」配套）', /🔁 \{\{item\.recurrenceTag\}\}/.test(wxml));
ok('详情 wxml 同样带 🔁 前缀', /🔁 \{\{recurrenceTag\}\}/.test(fs.readFileSync(path.join(__dirname, '..', 'pages', 'promo-detail', 'promo-detail.wxml'), 'utf8')));

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
