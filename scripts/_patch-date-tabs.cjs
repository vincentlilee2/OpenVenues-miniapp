// 日期条紧凑化（2026-09-27 用户要求）：约场/课表页顶部日期选择要在手机屏内显示 7 天，
// 别让用户因为不知道能滑而看不到后面的日期。
// 方案 A（已确认落地）：改成 flex 等分 7 格 —— 不靠滑动、也不会只露半截。
// 用法：node ~/WeChatProjects/OpenVenues-miniapp/scripts/_patch-date-tabs.cjs
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
  console.log('  ✓ ' + file + ' ← ' + from.slice(0, 42).replace(/\n/g, '⏎'));
  return true;
};

// ---------- CSS：等分 + 紧凑 ----------
sub(
  'pages/book/book.wxss',
  `.date-tabs {
  white-space: nowrap;
  background: #fff;
  padding: 14rpx 0;
  margin: 0 -24rpx 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.date-tab {
  display: inline-block;
  width: 130rpx;
  text-align: center;
  padding: 12rpx 0;
  border-radius: 12rpx;
  margin: 0 8rpx;
  color: var(--muted);
  font-size: 26rpx;
}`, `.date-tabs {
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
}`)
sub(
  'pages/book/book.wxss',
  `.date-week { font-size: 24rpx; opacity: 0.8; }
.date-day { font-size: 32rpx; font-weight: 600; margin-top: 4rpx; }`,
  `.date-week { font-size: 20rpx; line-height: 1.15; opacity: 0.85; }
.date-day { font-size: 30rpx; font-weight: 600; margin-top: 0; line-height: 1.2; }`)
sub(
  'pages/book/book.wxml',
  `  <scroll-view class="date-tabs" scroll-x="true" enhanced="true" show-scrollbar="{{false}}">`,
  `  <!-- 7 格 flex 等分，一屏刚好放下（scroll-x 保留只为极端窄屏兜底，正常不会滑） -->
  <scroll-view class="date-tabs" scroll-x="true" enhanced="true" show-scrollbar="{{false}}">`)

// ---------- JS：今天那格的文案从「周日 今天」压成「今天」（否则一格放不下） ----------
sub(
  'pages/book/book.js',
  `        weekdayLabel: WD_LABEL[d.getDay()] + (i === 0 ? ' 今天' : ''),`,
  `        // ★ 2026-09-27：日期格改成等分后每格只有约 100rpx，「周日 今天」放不下 → 今天那格直接写「今天」
        weekdayLabel: i === 0 ? '今天' : WD_LABEL[d.getDay()],`)

console.log('\n共修改 ' + n + ' 处');
