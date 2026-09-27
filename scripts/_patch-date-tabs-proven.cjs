// 日期条：回到「你机器上验证过能横排」的写法，只把格子改小（2026-09-27）
//
// 事实链：
//   ① 旧代码（能横排、只是要滑）= .date-tabs{white-space:nowrap} + .date-tab{display:inline-block;width:130rpx}
//      → 在真机上确实是「一行、可横滑」，说明这条路子在 scroll-view 里是通的；
//   ② 我改成 display:flex 后（A 案，B 案也保留了容器 flex）→ 真机变成**竖着排一列**（用户截图）；
//   ③ 原因：小程序 scroll-view 内部有自己的包裹层，外层 flex 作用不到子元素；
//      让子元素横排的可靠方式是「容器 nowrap + 子元素 inline-block」（即①的方式）。
//
// 结论：用回①的排法（已验证），只把每格从 146rpx 缩到 102rpx →
//      7 格共 714rpx ≤ 750rpx 一屏放下；scroll-x 仍在，格子变多/极窄屏还能滑。
// 用法：node ~/WeChatProjects/OpenVenues-miniapp/scripts/_patch-date-tabs-proven.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wr = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
let n = 0;
const sub = (file, from, to) => {
  const s = rd(file);
  if (!s.includes(from)) {
    console.log('  ✗ 未匹配（' + file + '）: ' + from.slice(0, 60).replace(/\n/g, '⏎'));
    return false;
  }
  wr(file, s.replace(from, to));
  n += 1;
  console.log('  ✓ ' + file);
  return true;
};

// ---------- ① wxml：撤掉中间那层容器，回到单层（旧结构，真机验证过） ----------
sub(
  'pages/book/book.wxml',
  `  <scroll-view class="date-tabs" scroll-x="true" enhanced="true" show-scrollbar="{{false}}">
    <!-- ⚠️ flex 必须写在这层 view 上，不能写在外层 scroll-view 上：
         小程序 scroll-view 内部自带包裹层，外层的 display:flex 作用不到子元素，
         会让日期格竖着排成一列（2026-09-27 实测）。 -->
    <view class="date-tabs-inner">
      <view wx:for="{{dateTabs}}" wx:key="date" class="date-tab {{item.date === activeDate ? 'active' : ''}}"
            bindtap="onDateTap" data-date="{{item.date}}">
        <view class="date-week">{{item.weekdayLabel}}</view>
        <view class="date-day">{{item.day}}</view>
      </view>
    </view>
  </scroll-view>`,
  `  <!-- 日期条：容器 nowrap + 格子 inline-block 横排（真机验证过的排法），
       每格 96rpx+左右各 3rpx → 7 格 714rpx，一屏刚好放下；scroll-x 仍在，格子变多/极窄屏可滑。
       ⚠️ 别在 scroll-view 上写 display:flex（2026-09-27 实测会让格子竖排成一列）。 -->
  <scroll-view class="date-tabs" scroll-x="true" enhanced="true" show-scrollbar="{{false}}">
    <view wx:for="{{dateTabs}}" wx:key="date" class="date-tab {{item.date === activeDate ? 'active' : ''}}"
          bindtap="onDateTap" data-date="{{item.date}}">
      <view class="date-week">{{item.weekdayLabel}}</view>
      <view class="date-day">{{item.day}}</view>
    </view>
  </scroll-view>`)

// ---------- ② wxss：容器去掉 flex/inline-flex，格子回到 inline-block（紧凑） ----------
sub(
  'pages/book/book.wxss',
  `.date-tabs {
  /* ★ 2026-09-27 用户要求：7 天日期必须一屏可见（原来每格写死 130rpx + 左右各 8rpx = 146rpx，
     7 格共 1022rpx，而设计稿屏宽只有 750rpx → 只看得见 5 天，后面的被推到屏外，
     用户不知道能滑就永远看不到）。
     方案 B（用户选定）：**紧凑定宽** —— 每格 96rpx + 左右各 3rpx = 102rpx，
     7 格共 714rpx ≤ 750rpx，正好一屏放下；scroll-x 保留作兜底。
     ⚠️⚠️ 这里**不能**写 display:flex —— 小程序 scroll-view 内部自带包裹层，
     外层的 flex 作用不到子元素，日期格会竖着排成一列（2026-09-27 实测截图踩过）。
     横排交给内层的 .date-tabs-inner。 */
  background: #fff;
  padding: 10rpx 0;
  margin: 0 -24rpx 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.date-tabs-inner {
  display: inline-flex; /* inline-flex：宽度随内容，超出时仍可横向滚动 */
  padding: 0 2rpx;
}
.date-tab {
  flex: none;
  width: 96rpx;`,
  `.date-tabs {
  /* ★ 2026-09-27 用户要求：7 天日期必须一屏可见（原来每格写死 130rpx + 左右各 8rpx = 146rpx，
     7 格共 1022rpx，而设计稿屏宽只有 750rpx → 只看得见 5 天，后面的被推到屏外，
     用户不知道能滑就永远看不到）。
     方案 B（用户选定）：紧凑**定宽** —— 每格 96rpx + 左右各 3rpx = 102rpx，
     7 格共 714rpx ≤ 750rpx，正好一屏放下；scroll-x 保留作兜底。
     横排用「容器 nowrap + 子元素 inline-block」——这是真机上验证过的排法；
     ⚠️ 千万别在这儿写 display:flex：小程序 scroll-view 内部自带包裹层，
     外层 flex 作用不到子元素，日期格会竖着排成一列（2026-09-27 实测截图踩过这个坑）。 */
  white-space: nowrap;
  background: #fff;
  padding: 10rpx 0;
  margin: 0 -24rpx 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.date-tab {
  display: inline-block; /* 与 scroll-view 的 nowrap 配合才横排 */
  width: 96rpx;`)

console.log('\n共修改 ' + n + ' 处');
