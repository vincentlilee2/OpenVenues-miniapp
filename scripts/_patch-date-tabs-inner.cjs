// 修：日期格竖排（2026-09-27 用户实测截图）
// 原因：**小程序 <scroll-view> 内部有自己的包裹层**，写在外层的 display:flex 不会作用到子元素
//       → 每个 .date-tab 变成块级、一个一行，日期条竖着排成一列。
// 修法：scroll-view 里面加一层 <view class="date-tabs-inner">，把 flex 写在内层 view 上；
//       外层保留 scroll-x 作兜底（格子变多/极窄屏仍可滑）。
// 用法：node ~/WeChatProjects/OpenVenues-miniapp/scripts/_patch-date-tabs-inner.cjs
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

// ---------- ① wxml：scroll-view 内加一层 flex 容器 ----------
sub(
  'pages/book/book.wxml',
  `  <scroll-view class="date-tabs" scroll-x="true" enhanced="true" show-scrollbar="{{false}}">
    <view wx:for="{{dateTabs}}" wx:key="date" class="date-tab {{item.date === activeDate ? 'active' : ''}}"
          bindtap="onDateTap" data-date="{{item.date}}">
      <view class="date-week">{{item.weekdayLabel}}</view>
      <view class="date-day">{{item.day}}</view>
    </view>
  </scroll-view>`,
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
  </scroll-view>`)

// ---------- ② wxss：flex 从 .date-tabs 挪到 .date-tabs-inner ----------
sub(
  'pages/book/book.wxss',
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
  width: 96rpx;`,
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
  width: 96rpx;`)

console.log('\n共修改 ' + n + ' 处');
