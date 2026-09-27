// 日期条回归（2026-09-27 用户要求）：约场/课表页顶部**7 天必须在手机屏内可见**，
// 不能出现「后几天被推出屏外、用户不知道能滑」的情况。
// 方案：flex 等分（每格 flex:1）→ 不论屏幕多宽，7 格永远平分、不会有半截隐藏。
// 用法：cd ~/WeChatProjects/OpenVenues-miniapp && node scripts/verify-book-date-tabs.cjs
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

const wxss = rd('pages/book/book.wxss');
const wxml = rd('pages/book/book.wxml');
const js = rd('pages/book/book.js');

const grab = (sel) => {
  const i = wxss.indexOf(sel + ' {');
  if (i < 0) return '';
  return wxss.slice(i, wxss.indexOf('}', i));
};
const tabsCss = grab('.date-tabs');
const tabCss = grab('.date-tab');

// ---------- 核心：等分布局（不靠滑动就不会有"看不见的日期"） ----------
ok('★★ .date-tabs 是 flex 容器', /display:\s*flex/.test(tabsCss), tabsCss.trim().split('\n')[0]);
ok('★★ .date-tab 每格 flex:1（7 格永远平分一屏）', /flex:\s*1\b/.test(tabCss));
ok('★★ .date-tab 不再写死宽度（写死 130rpx 就是老 bug 的根源）', !/width:\s*\d+rpx/.test(tabCss), tabCss.match(/width:[^;]+/) || '');
ok('★★ .date-tab 不再是 inline-block（与 flex 冲突会让等分失效）', !/inline-block/.test(tabCss));
ok('★ .date-tabs 不再用 white-space:nowrap 定宽横排', !/white-space:\s*nowrap/.test(tabsCss));
ok('★ 每格有 min-width:0（文字长时不会把格子撑出去）', /min-width:\s*0/.test(tabCss));

// ---------- 算术：7 格 + 间距必须 ≤ 750rpx（设计稿屏宽） ----------
{
  const hm = tabCss.match(/margin:\s*0\s+(\d+)rpx/);
  const tm = tabsCss.match(/padding:\s*\d+rpx\s+(\d+)rpx/);
  const perGap = hm ? Number(hm[1]) * 2 : 0;
  const pad = tm ? Number(tm[1]) * 2 : 0;
  const need = 7 * perGap + pad; // flex:1 下每格宽度自动摊分，这里只校验"固定开销"够小
  ok('★ 7 格固定开销（外边距+内边距）≤ 80rpx（留足给 7 天文字）', need <= 80, need + 'rpx');
}

// ---------- 字号要收紧，否则等分也挤 ----------
{
  const wk = (wxss.match(/\.date-week \{[^}]*font-size:\s*(\d+)rpx/) || [])[1];
  const dy = (wxss.match(/\.date-day \{[^}]*font-size:\s*(\d+)rpx/) || [])[1];
  ok('★ 星期字号 ≤ 22rpx', Number(wk) <= 22, wk + 'rpx');
  ok('★ 日期数字字号 ≤ 30rpx', Number(dy) <= 30, dy + 'rpx');
}

// ---------- 文案：今天那格要短（原来「周日 今天」放不下 100rpx 宽的格子） ----------
ok('★★ 今天那格文案是「今天」（不再拼接「周X 今天」）', /weekdayLabel:\s*i === 0 \? '今天'/.test(js));
ok('★★ 不再出现「\u0020今天」这种带空格的拼接', !/' 今天'/.test(js));
ok('★ 仍是 7 天（含今天）', /for \(let i = 0; i < 7/.test(js) || /i < 7/.test(js), '');
ok('★ wxml 用 dateTabs 渲染且带选中态', wxml.includes('wx:for="{{dateTabs}}"') && wxml.includes("item.date === activeDate ? 'active'"));

console.log('\n合计：' + pass + ' 过 / ' + errs.length + ' 失败');
if (errs.length) {
  console.log('失败项：\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
