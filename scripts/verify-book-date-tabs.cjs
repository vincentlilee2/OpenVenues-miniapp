// 日期条回归（2026-09-27 用户要求 + 两次实测教训）
//
// 需求：约场/课表页顶部**7 天必须在手机屏内可见**，别让用户因为不知道能滑而看不到后面的日期。
// 排法：容器 white-space:nowrap + 格子 display:inline-block（**真机验证过的写法**），
//       每格 96rpx + 左右各 3rpx = 102rpx → 7 格 714rpx ≤ 750rpx（设计稿屏宽）。
//
// ⚠️ 两个实测教训（都已固化成断言）：
//   ① 在 scroll-view 上写 display:flex → 真机上日期格**竖着排成一列**
//      （小程序 scroll-view 内部自带包裹层，外层 flex 作用不到子元素）；
//   ② 断言匹配 CSS 前必须先**剥掉注释**，否则「说明文字里提到的 display:flex」会被自己的断言当成真写了。
//
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

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');        // 先剥注释，再断言
const wxss = strip(rd('pages/book/book.wxss'));
const wxml = rd('pages/book/book.wxml');
const js = rd('pages/book/book.js');
const rawWxss = rd('pages/book/book.wxss');

// 取某个选择器的规则体（按正则，容忍内部嵌套/换行）
const block = (sel) => {
  const m = wxss.match(new RegExp('\\' + sel + '\\s*\\{([\\s\\S]*?)\\n\\}'));
  return m ? m[1] : '';
};
const tabsCss = block('.date-tabs');
const tabCss = block('.date-tab');

const SCREEN = 750; // 设计稿屏宽（rpx）
const w = Number((tabCss.match(/width:\s*(\d+)rpx/) || [])[1]);
const hm = Number((tabCss.match(/margin:\s*0\s+(\d+)rpx/) || [])[1]);
const pv = ((tabsCss.match(/padding:\s*([^;]+)/) || [])[1] || '0').trim().split(/\s+/).map((x) => parseFloat(x) || 0);
const pad = pv.length > 1 ? pv[1] : pv[0]; // 水平方向内边距（padding: 10rpx 0 → 0）
const need = 7 * (w + hm * 2) + pad * 2;

// ---------- 核心算术：7 格必须塞得进一屏 ----------
ok('★★ 每格定宽（放大字号后仍紧凑，不回到 130rpx）', w > 0 && w <= 110, w + 'rpx');
ok('★★ 每格左右外边距 ≤ 4rpx', hm >= 0 && hm <= 4, hm + 'rpx');
ok('★★ 7 格总宽（含外边距与容器内边距）≤ 750rpx → 一屏放下',
  Number.isFinite(need) && need <= SCREEN, need + 'rpx / 屏宽 ' + SCREEN + 'rpx');

// ---------- 排行方式：真机验证过的那一对 ----------
ok('★★ .date-tabs 必须是 white-space:nowrap（横排的前提）', /white-space:\s*nowrap/.test(tabsCss));
ok('★★ .date-tab 必须是 display:inline-block（横排的另一半）', /display:\s*inline-block/.test(tabCss), tabCss.match(/display:[^;]+/) || '没有 display');
ok('★★ .date-tabs（scroll-view）不得写 display:flex（实测会让格子竖排成一列）',
  !/display:\s*(inline-)?flex/.test(tabsCss), tabsCss.match(/display:[^;]+/) || '没有 display');
ok('★★ wxml 里不能再有 .date-tabs-inner 中间层（那条弯路已回退）',
  !/date-tabs-inner/.test(wxml) && !/\.date-tabs-inner/.test(rawWxss));
ok('★★ scroll-x 兜底仍在（格子变多/极窄屏仍能滑）',
  wxml.includes('scroll-x="true"') && /class="date-tabs"/.test(wxml));

// ---------- 字号收紧 ----------
{
  const wk = (wxss.match(/\.date-week \{[^}]*font-size:\s*(\d+)rpx/) || [])[1];
  const dy = (wxss.match(/\.date-day \{[^}]*font-size:\s*(\d+)rpx/) || [])[1];
  const pd = Number((tabCss.match(/padding:\s*(\d+)rpx/) || [])[1]);
  ok('★ 星期字号在 22~26rpx（放大后）', Number(wk) >= 22 && Number(wk) <= 26, wk + 'rpx');
  ok('★ 日期数字字号在 30~38rpx（放大后）', Number(dy) >= 30 && Number(dy) <= 38, dy + 'rpx');
  ok('★ 格子上下内边距 ≤ 10rpx', pd <= 10, pd + 'rpx');
}

// ---------- 文案：今天那格要短 ----------
ok('★★ 今天那格文案是「今天」（96rpx 宽的格子放不下「周日 今天」）', /weekdayLabel:\s*i === 0 \? '今天'/.test(js));
ok('★★ 不再出现「\u0020今天」这种带空格的拼接', !/' 今天'/.test(js));
ok('★ 仍是 7 天（含今天）', /i < 7/.test(js));
ok('★ wxml 用 dateTabs 渲染且带选中态',
  wxml.includes('wx:for="{{dateTabs}}"') && wxml.includes("item.date === activeDate ? 'active'"));

console.log('\n合计：' + pass + ' 过 / ' + errs.length + ' 失败');
if (errs.length) {
  console.log('失败项：\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
