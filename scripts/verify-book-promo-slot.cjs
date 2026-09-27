// 约场/课表页的「课程·活动」方格：
//   用户 2026-09-27：「要让课程活动对应的时段方格 显示 对应的课程或活动名称，培训报名价格、人数上限，
//   点击后进入对应时段的课程或活动报名。但报名人数没有超过上限时其他用户仍可继续在该时段方格中点击报名。」
//
// 覆盖：
//   ① 行为（pages/book/grid.js）：浮层带 name / signed / maxCap / priceLabel / promoId，
//      以及 full（已报 ≥ 上限）与 remaining（剩余席位）
//   ② 静态：wxml 显示「已满」+ 传 data-full；js 满员时 toast 拦截、未满照常进报名；图例不再写「畅打」
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

const grid = require(path.join(ROOT, 'pages', 'book', 'grid.js'));

const mkSlot = (promo) => ({
  court_id: 1,
  start_time: '09:00',
  end_time: '09:30',
  price: null,
  status: 'locked_by_promo',
  promo: {
    id: 7336,
    kind: 'course',
    title: '成人舞蹈培训班',
    start_time: '09:00',
    end_time: '10:00',
    price_per_person: 200,
    min_participants: 1,
    max_capacity: 20,
    signed_up: 1,
    ...promo,
  },
});
const build = (promo) => grid.buildRows([mkSlot(promo)], [{ id: 1, name: '舞蹈教室01' }], new Set()).promos[0];

console.log('--- ① 行为：方格内容与满员判定 ---');
{
  const p1 = build({}); // 1/20
  ok('方格显示活动名称', p1.name === '成人舞蹈培训班', p1.name);
  ok('方格带已报/上限人数', p1.signed === 1 && p1.maxCap === 20, `${p1.signed}/${p1.maxCap}`);
  ok('方格带培训报名单价（¥/人）', /200/.test(String(p1.priceLabel)), p1.priceLabel);
  ok('方格带报名入口（promoId）', p1.promoId === 7336, p1.promoId);
  ok('★ 未满（1/20）→ 可继续点击报名', p1.full === false && p1.remaining === 19, `full=${p1.full} remaining=${p1.remaining}`);

  const p2 = build({ signed_up: 20 }); // 20/20 满
  ok('★★ 满员（20/20）→ full=true', p2.full === true && p2.remaining === 0, `full=${p2.full} remaining=${p2.remaining}`);

  const p3 = build({ signed_up: 25 }); // 超卖也不该崩
  ok('★ 超过上限（25/20）→ full=true 且 remaining 不为负', p3.full === true && p3.remaining === 0, `full=${p3.full} remaining=${p3.remaining}`);
}

console.log('\n--- ② 静态：页面真的这么渲染与拦截 ---');
const wxml = read('pages/book/book.wxml');
const js = read('pages/book/book.js');
ok('浮层点击带上 full（供拦截判断）', /bindtap="onPromoTap"[\s\S]{0,80}data-full="\{\{item\.full\}\}"/.test(wxml), (wxml.match(/<view wx:for="\{\{promos\}\}"[\s\S]{0,160}/) || [''])[0].replace(/\s+/g, ' ').slice(0, 120));
ok('★★ 满员时显示「已满」', /item\.full[\s\S]{0,60}已满/.test(wxml));
ok('★★ 满员点击 → 提示且不进入报名（toast + return）', /if \(full\)[\s\S]{0,120}showToast[\s\S]{0,60}return;/.test(js));
ok('未满仍进报名页', /promo-detail\/promo-detail\?id=/.test(js));
ok('★ 图例不再写「畅打」（改「活动」）', !/>畅打</.test(wxml) && /lg-promo"><\/view><text>活动<\/text>/.test(wxml));

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
