// 课表页回归（2026-09-27 用户要求）
//   ① 过期的课程/活动方格**要显示**（灰色「已过期」+ 不可点），不能消失
//   ② 课表模式（培训教室：该馆没有任何有价格格子）隐藏「联系人」「立即预定」，
//      改提示「点击 课程时段进行报名」
// 用法：cd ~/WeChatProjects/OpenVenues-miniapp && node scripts/verify-book-schedule.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0;
const errs = [];
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log('  ✓ ' + name);
  } else {
    errs.push(name + (extra ? '  → ' + extra : ''));
    console.log('  ✗ ' + name + (extra ? '  → ' + extra : ''));
  }
};

const grid = require(path.join(ROOT, 'pages/book/grid.js'));
const wxml = rd('pages/book/book.wxml');
const bookJs = rd('pages/book/book.js');
const wxss = rd('pages/book/book.wxss');

// ---------- 行为：过期的课程浮层必须被画出来 ----------
const courts = [{ id: 191, name: '舞蹈教室01' }];
const promoBase = {
  id: 7336, title: '成人舞蹈培训班', kind: 'course',
  start_time: '09:00', end_time: '11:00', price_per_person: 200,
  min_participants: 4, max_capacity: 20, signed_up: 1, max_per_signup: 4,
  signup_deadline: '2026-09-27 13:00:00',
};
const mk = (expired) => [
  { court_id: 191, start_time: '09:00', end_time: '09:30', price: null, status: 'locked_by_promo', promo: { ...promoBase, expired } },
  { court_id: 191, start_time: '09:30', end_time: '10:00', price: null, status: 'locked_by_promo', promo: { ...promoBase, expired } },
  { court_id: 191, start_time: '10:00', end_time: '10:30', price: null, status: 'locked_by_promo', promo: { ...promoBase, expired } },
  { court_id: 191, start_time: '10:30', end_time: '11:00', price: null, status: 'locked_by_promo', promo: { ...promoBase, expired } },
];

const gExp = grid.buildRows(mk(true), courts, new Set());
ok('★★ 过期课程仍被画成方格（不会消失）', gExp.promos.length === 1, 'promos=' + gExp.promos.length);
ok('★★ 过期课程方格带 expired 标记', gExp.promos[0] && gExp.promos[0].expired === true, JSON.stringify(gExp.promos[0] && gExp.promos[0].expired));
ok('★ 过期方格仍显示课程名/已报人数', !!(gExp.promos[0] && gExp.promos[0].name === '成人舞蹈培训班' && gExp.promos[0].signed === 1));
ok('★ 过期方格跨整段小时（09:00-11:00 → rowSpan 2）', gExp.promos[0] && gExp.promos[0].rowSpan === 2, String(gExp.promos[0] && gExp.promos[0].rowSpan));

const gOk = grid.buildRows(mk(false), courts, new Set());
ok('★ 未过期课程不会被误标过期', gOk.promos[0] && gOk.promos[0].expired === false, String(gOk.promos[0] && gOk.promos[0].expired));

// ---------- 视图：标「已过期」+ 不可点 ----------
ok('★★ wxml 上有「已过期」标签（过期课程可见地标出来）', /gp-expired[^>]*>已过期</.test(wxml));
ok('★★ 点击事件带 data-expired（供不可点判断）', wxml.includes('data-expired="{{item.expired}}"'));
ok('★ 过期格加灰色 class', wxml.includes("{{item.expired ? 'gc-promo-expired' : ''}}"));
ok('★ 过期时不再显示「已满」/成团文案（过期优先）', /!item\.expired && item\.full/.test(wxml) && /!item\.expired && item\.minParticipants/.test(wxml));
ok('★★ 过期课程点击 → toast「该课程已过期」且不跳转', /if \(expired\)[\s\S]{0,120}该课程已过期[\s\S]{0,80}return;/.test(bookJs));
ok('★ 灰色样式已定义', wxss.includes('.gc-promo-expired') && wxss.includes('.gp-expired'));

// ---------- 课表模式：隐藏联系人/立即预定 + 提示 ----------
ok('★★ 联系人卡片在课表模式下隐藏', /class="card contact-card"\s+wx:if="\{\{!scheduleMode\}\}"/.test(wxml));
ok('★★ 「立即预定」按钮在课表模式下隐藏', /book-btn"\s+wx:if="\{\{!scheduleMode\}\}"/.test(wxml));
ok('★★ 课表模式提示「点击 课程时段进行报名」', wxml.includes('点击 课程时段进行报名') && /hint-schedule[^>]*wx:if="\{\{scheduleMode\}\}"/.test(wxml));
ok('★ 「最多选 N 个场地」在课表模式下不显示（那是约场的话术）', /class="hint"\s+wx:if="\{\{!scheduleMode\}\}"/.test(wxml));
ok('★ 课表模式来自接口 schedule_mode 字段', bookJs.includes('r.schedule_mode'));
ok('★ 课表模式初值为 false（防首屏闪出联系人/按钮）', /scheduleMode: false/.test(bookJs));
ok('★ 课表模式当天没课时有空态文案', wxml.includes('当天暂无课程'));
ok('★ 图例加了「已过期」', /lg-expired[\s\S]{0,40}已过期/.test(wxml));

console.log('\n合计：' + pass + ' 过 / ' + errs.length + ' 失败');
if (errs.length) {
  console.log('失败项：\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
