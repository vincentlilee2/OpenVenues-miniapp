// 日期条改成方案 B（2026-09-27 用户选定）：紧凑**定宽**（保留横滑能力，但 7 天正好一屏放得下）。
// 用法：node ~/WeChatProjects/OpenVenues-miniapp/scripts/_patch-date-tabs-b.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wr = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
let n = 0;
const sub = (file, from, to) => {
  const s = rd(file);
  if (!s.includes(from)) {
    console.log('  ✗ 未匹配（' + file + '）: ' + from.slice(0, 50).replace(/\n/g, '⏎'));
    return false;
  }
  wr(file, s.replace(from, to));
  n += 1;
  console.log('  ✓ ' + file);
  return true;
};

// ---------- ① CSS：flex 等分 → 紧凑定宽 ----------
sub(
  'pages/book/book.wxss',
  `.date-tabs {
  /* ★ 2026-09-27 用户要求：7 天日期必须一屏可见（原来每格 146rpx × 7 = 1022rpx，
     750rpx 的屏只看得见 5 天，后面的被推到屏外，用户不知道能滑就看不到）→
     改成 flex 等分：每格 flex:1，7 格正好铺满，不给滑也不会有半截。 */
  display: flex;
  background: #fff;
  padding: 10rpx 4rpx;
  margin: 0 -24rpx 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.date-tab {
  flex: 1;
  min-width: 0;
  text-align: center;
  padding: 8rpx 0;
  border-radius: 10rpx;
  margin: 0 2rpx;
  color: var(--muted);
  font-size: 24rpx;
}`,
  `.date-tabs {
  /* ★ 2026-09-27 用户要求：7 天日期必须一屏可见（原来每格写死 130rpx + 左右各 8rpx = 146rpx，
     7 格共 1022rpx，而设计稿屏宽只有 750rpx → 只看得见 5 天，后面的被推到屏外，
     用户不知道能滑就永远看不到）。
     方案 B（用户选定）：**紧凑定宽** —— 每格 96rpx + 左右各 3rpx = 102rpx，
     7 格共 714rpx ≤ 750rpx，正好一屏放下；同时保留 scroll-x，
     万一将来格子变多或遇到极窄屏，仍然能滑，不会硬挤。 */
  display: flex;
  background: #fff;
  padding: 10rpx 4rpx;
  margin: 0 -24rpx 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.date-tab {
  flex: none;
  width: 96rpx;
  text-align: center;
  padding: 8rpx 0;
  border-radius: 10rpx;
  margin: 0 3rpx;
  color: var(--muted);
  font-size: 24rpx;
}`)

// ---------- ② wxml 注释 ----------
sub(
  'pages/book/book.wxml',
  `  <!-- 7 格 flex 等分，一屏刚好放下（scroll-x 保留只为极端窄屏兜底，正常不会滑） -->`,
  `  <!-- 紧凑定宽：每格 96rpx+3rpx 外边距 → 7 格 714rpx，一屏刚好放下；
       scroll-x 保留作兜底（格子变多或极窄屏时仍可滑），正常不需要滑 -->`)

// ---------- ③ 回归套件按方案 B 重写 ----------
wr(
  'scripts/verify-book-date-tabs.cjs',
  `// 日期条回归（2026-09-27 用户要求）：约场/课表页顶部**7 天必须在手机屏内可见**，
// 不能出现「后几天被推出屏外、用户不知道能滑」的情况。
// 方案 B（用户选定）：紧凑**定宽** 96rpx + 左右各 3rpx 外边距 = 102rpx/格 →
//   7 格共 714rpx ≤ 750rpx（设计稿屏宽）→ 一屏放下；同时保留 scroll-x 兜底。
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

// ---------- 核心：7 格必须塞得进 750rpx ----------
const SCREEN = 750;
const w = Number((tabCss.match(/width:\\s*(\\d+)rpx/) || [])[1]);
const hm = Number((tabCss.match(/margin:\\s*0\\s+(\\d+)rpx/) || [])[1]);
const pad = Number((tabsCss.match(/padding:\\s*\\d+rpx\\s+(\\d+)rpx/) || [])[1]);
const need = w > 0 ? 7 * (w + hm * 2) + pad * 2 : NaN;

ok('★★ 每格是定宽（方案 B：紧凑定宽，不再写死 130rpx）', w > 0 && w < 130, w + 'rpx');
ok('★★ 7 格总宽（含外边距与容器内边距）必须 ≤ 750rpx 一屏放下',
  Number.isFinite(need) && need <= SCREEN, need + 'rpx / 屏宽 ' + SCREEN + 'rpx');
ok('★★ 每格不再 flex:1 拉伸（B 是定宽紧凑，不是等分）', /flex:\\s*none/.test(tabCss), tabCss.match(/flex:[^;]+/) || '');
ok('★ 不再是 inline-block（定宽 + flex 容器下会错位）', !/inline-block/.test(tabCss));
ok('★ 容器不再用 white-space:nowrap 定宽横排', !/white-space:\\s*nowrap/.test(tabsCss));
ok('★★ scroll-x 兜底仍在（格子变多/极窄屏仍能滑）', wxml.includes('scroll-x="true"') && /class="date-tabs"/.test(wxml));
ok('★ 容器是 flex（定宽子项横排、不换行）', /display:\\s*flex/.test(tabsCss));

// ---------- 字号要收紧，否则定宽也挤 ----------
{
  const wk = (wxss.match(/\\.date-week \\{[^}]*font-size:\\s*(\\d+)rpx/) || [])[1];
  const dy = (wxss.match(/\\.date-day \\{[^}]*font-size:\\s*(\\d+)rpx/) || [])[1];
  const pd = Number((tabCss.match(/padding:\\s*(\\d+)rpx/) || [])[1]);
  ok('★ 星期字号 ≤ 22rpx', Number(wk) <= 22, wk + 'rpx');
  ok('★ 日期数字字号 ≤ 30rpx', Number(dy) <= 30, dy + 'rpx');
  ok('★ 格子上下内边距 ≤ 10rpx', pd <= 10, pd + 'rpx');
}

// ---------- 文案：今天那格要短（96rpx 宽的格子放不下「周日 今天」） ----------
ok('★★ 今天那格文案是「今天」（不再拼接「周X 今天」）', /weekdayLabel:\\s*i === 0 \\? '今天'/.test(js));
ok('★★ 不再出现「\\u0020今天」这种带空格的拼接', !/' 今天'/.test(js));
ok('★ 仍是 7 天（含今天）', /i < 7/.test(js));
ok('★ wxml 用 dateTabs 渲染且带选中态', wxml.includes('wx:for="{{dateTabs}}"') && wxml.includes("item.date === activeDate ? 'active'"));

console.log('\\n合计：' + pass + ' 过 / ' + errs.length + ' 失败');
if (errs.length) {
  console.log('失败项：\\n  - ' + errs.join('\\n  - '));
  process.exit(1);
}
`
);

console.log('\n共修改 ' + n + ' 处 + 重写回归套件');
