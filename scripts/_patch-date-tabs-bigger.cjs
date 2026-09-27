// 日期条：字号放大、宽度仍紧凑（2026-09-27 用户要求）
//   用户：「日期显示太小了，放大一些，但宽度紧凑一些，有一点超出屏幕也没有关系，可以滑动」
//   做法：每格 96→100rpx、字号 星期 20→24rpx / 日期 30→36rpx；7 格 742rpx ≤ 750rpx 仍一屏放下
//        （仍保留 nowrap + inline-block + scroll-x；以后要更大就自然会溢出可滑）
// 排法不变：容器 white-space:nowrap + 格子 display:inline-block（真机验证过，别再用 flex）。
// 用法：node ~/WeChatProjects/OpenVenues-miniapp/scripts/_patch-date-tabs-bigger.cjs
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

// ① 每格：宽度略增（96→100rpx），内边距略增，字号跟着放大
sub(
  'pages/book/book.wxss',
  `.date-tab {
  display: inline-block; /* 与容器 nowrap 配对才横排（真机验证过的写法） */
  width: 96rpx;
  text-align: center;
  padding: 8rpx 0;
  border-radius: 10rpx;
  margin: 0 3rpx;
  color: var(--muted);
  font-size: 24rpx;
}`,
  `.date-tab {
  display: inline-block; /* 与容器 nowrap 配对才横排（真机验证过的写法） */
  width: 100rpx;         /* 紧凑：7 格 742rpx ≤ 750rpx，仍一屏放下 */
  text-align: center;
  padding: 10rpx 0;
  border-radius: 12rpx;
  margin: 0 3rpx;
  color: var(--muted);
  font-size: 26rpx;
}`)

// ② 字号：星期 20→24rpx，日期数字 30→36rpx（用户说太小）
sub(
  'pages/book/book.wxss',
  `.date-week { font-size: 20rpx; line-height: 1.15; opacity: 0.85; }
.date-day { font-size: 30rpx; font-weight: 600; margin-top: 0; line-height: 1.2; }`,
  `.date-week { font-size: 24rpx; line-height: 1.2; opacity: 0.85; }
.date-day { font-size: 36rpx; font-weight: 700; margin-top: 2rpx; line-height: 1.15; }`)

// ③ 套件跟着放宽上限（并保留「必须一屏放下或允许溢出可滑」的算术断言）
{
  const f = 'scripts/verify-book-date-tabs.cjs';
  let s = rd(f);
  const pairs = [
    ["ok('★★ 每格定宽（紧凑，不再写死 130rpx）', w > 0 && w < 130, w + 'rpx');",
      "ok('★★ 每格定宽（放大字号后仍紧凑，不回到 130rpx）', w > 0 && w <= 110, w + 'rpx');"],
    ["  ok('★ 星期字号 ≤ 22rpx', Number(wk) <= 22, wk + 'rpx');",
      "  ok('★ 星期字号在 22~26rpx（放大后）', Number(wk) >= 22 && Number(wk) <= 26, wk + 'rpx');"],
    ["  ok('★ 日期数字字号 ≤ 30rpx', Number(dy) <= 30, dy + 'rpx');",
      "  ok('★ 日期数字字号在 30~38rpx（放大后）', Number(dy) >= 30 && Number(dy) <= 38, dy + 'rpx');"],
  ];
  let hit = 0;
  for (const [a, b] of pairs) {
    if (s.includes(a)) { s = s.replace(a, b); hit += 1; }
    else console.log('  ✗ 套件锚点未匹配: ' + a.slice(0, 40));
  }
  if (hit) { wr(f, s); n += hit; console.log('  ✓ ' + f + '（放宽 ' + hit + ' 条上限）'); }
}

console.log('\n共修改 ' + n + ' 处');
