// 课表页改造（2026-09-27 用户要求）：
//   ① 过期的课程/活动方格**要显示**（灰色 + 「已过期」 + 不可点），不能消失
//   ② 课表模式（培训教室：该馆没有任何有价格格子）隐藏「联系人」和「立即预定」按钮，
//      改成提示「点击 课程时段进行报名」
// 服务端已下发 schedule_mode + 每个 promo 的 expired（routes/venues.js）。
// 用法：node ~/WeChatProjects/OpenVenues-miniapp/scripts/_patch-book-schedule.cjs
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
  console.log('  ✓ ' + file + ' ← ' + from.slice(0, 46).replace(/\n/g, '⏎'));
  return true;
};

// ---------- 1) grid.js：把 expired 带进浮层 ----------
sub(
  'pages/book/grid.js',
  `        promoId: s.promo.id,
      });`,
  `        promoId: s.promo.id,
        // ★ 2026-09-27：过期课程也要画（灰色「已过期」），服务端在课表模式下会下发
        expired: !!s.promo.expired,
      });`
);
sub(
  'pages/book/grid.js',
  `      cid: p.cid,
      col,`,
  `      cid: p.cid,
      col,
      // ★ 2026-09-27：已过期的课程/活动 → 灰色、标「已过期」、点击不进报名
      expired: !!p.expired,`
);

// ---------- 2) book.js ----------
sub(
  'pages/book/book.js',
  `      const allSlots = [];
      let hasOverride = false;
      for (const c of courts) {
        const r = await api.courtAvailability(c.id, activeDate, uid);
        if (r.hasOverride) hasOverride = true;`,
  `      const allSlots = [];
      let hasOverride = false;
      // ★ 2026-09-27：课表模式（该馆没有任何有价格格子）→ 隐藏联系人/立即预定，改提示点击课程方格报名
      let scheduleMode = false;
      for (const c of courts) {
        const r = await api.courtAvailability(c.id, activeDate, uid);
        if (r.hasOverride) hasOverride = true;
        if (r.schedule_mode) scheduleMode = true;`
);
sub(
  'pages/book/book.js',
  `        holidayPrice: hasOverride, // 当天命中了节假日价格
        loading: false,`,
  `        holidayPrice: hasOverride, // 当天命中了节假日价格
        scheduleMode,
        loading: false,`
);
sub(
  'pages/book/book.js',
  `  // 点击畅打块 → 活动详情
  onPromoTap(e) {
    const { promoId, full } = e.currentTarget.dataset;`,
  `  // 点击畅打块 → 活动详情
  onPromoTap(e) {
    const { promoId, full, expired } = e.currentTarget.dataset;
    // ★ 2026-09-27 用户要求：过期的课程时段方格**要显示出来**（灰色「已过期」），但不可点击
    if (expired) {
      wx.showToast({ title: '该课程已过期', icon: 'none' });
      return;
    }`
);
sub(
  'pages/book/book.js',
  `  data: {
`,
  `  data: {
    // 课表模式（培训教室类场馆）：隐藏联系人/立即预定，改提示点击课程方格报名（防首屏闪烁）
    scheduleMode: false,
`
);

// ---------- 3) book.wxml ----------
sub(
  'pages/book/book.wxml',
  `        <view wx:for="{{promos}}" wx:key="pid" class="gc-promo"`,
  `        <view wx:for="{{promos}}" wx:key="pid" class="gc-promo {{item.expired ? 'gc-promo-expired' : ''}}"`
);
sub(
  'pages/book/book.wxml',
  `              bindtap="onPromoTap" data-promo-id="{{item.promoId}}" data-full="{{item.full}}">`,
  `              bindtap="onPromoTap" data-promo-id="{{item.promoId}}" data-full="{{item.full}}" data-expired="{{item.expired}}">`
);
sub(
  'pages/book/book.wxml',
  `          <view class="gp-cta" wx:if="{{item.minParticipants > 1}}">≥{{item.minParticipants}}人成团</view>
          <view class="gp-cta" wx:if="{{item.full}}" style="background:#fff1f0;color:#cf1322">已满</view>`,
  `          <!-- ★ 2026-09-27：过期课程标示（灰色不可点）；过期优先于「已满」显示 -->
          <view class="gp-cta gp-expired" wx:if="{{item.expired}}">已过期</view>
          <view class="gp-cta" wx:if="{{!item.expired && item.minParticipants > 1}}">≥{{item.minParticipants}}人成团</view>
          <view class="gp-cta" wx:if="{{!item.expired && item.full}}" style="background:#fff1f0;color:#cf1322">已满</view>`
);
sub(
  'pages/book/book.wxml',
  `  <view wx:if="{{loading}}" class="empty">加载中...</view>`,
  `  <view wx:if="{{loading}}" class="empty">加载中...</view>

  <!-- 课表模式：当天没有课程时给个明确空态（否则整页像坏了） -->
  <view wx:if="{{scheduleMode && !loading && !promos.length}}" class="empty">当天暂无课程</view>`
);
sub(
  'pages/book/book.wxml',
  `    <view class="lg lg-mine"></view><text>我的预定</text>
    <view class="lg lg-promo"></view><text>活动</text>
  </view>

  <view class="hint">最多选 {{maxCourts}} 个场地（{{selectedCount}}/{{maxCourts}}）</view>`,
  `    <view class="lg lg-mine"></view><text>我的预定</text>
    <view class="lg lg-promo"></view><text>活动</text>
    <view class="lg lg-expired"></view><text>已过期</text>
  </view>

  <view class="hint" wx:if="{{!scheduleMode}}">最多选 {{maxCourts}} 个场地（{{selectedCount}}/{{maxCourts}}）</view>

  <!-- ★ 2026-09-27：课表模式（培训教室只排课、不租场）→ 隐藏联系人/立即预定，改这句提示 -->
  <view class="hint hint-schedule" wx:if="{{scheduleMode}}">点击 课程时段进行报名</view>`
);
sub(
  'pages/book/book.wxml',
  `  <view class="card contact-card">`,
  `  <view class="card contact-card" wx:if="{{!scheduleMode}}">`
);
sub(
  'pages/book/book.wxml',
  `  <button class="btn-primary book-btn" bindtap="onBook" disabled="{{selectedCount === 0}}">
    立即预定
  </button>`,
  `  <button class="btn-primary book-btn" wx:if="{{!scheduleMode}}" bindtap="onBook" disabled="{{selectedCount === 0}}">
    立即预定
  </button>`
);

// ---------- 4) book.wxss：过期样式 ----------
{
  const f = 'pages/book/book.wxss';
  let s = rd(f);
  if (!s.includes('.gc-promo-expired')) {
    s += `
/* ★ 2026-09-27：课表模式下已过期的课程/活动方格 —— 要看得见，但灰色不可点 */
.gc-promo-expired {
  background: #f2f3f5;
  border-color: #dcdfe6;
  opacity: 0.75;
}
.gc-promo-expired .gp-name,
.gc-promo-expired .gp-signed,
.gc-promo-expired .gp-price {
  color: #9aa0a6;
}
.gp-expired {
  background: #eceff1;
  color: #8c9096;
}
.lg-expired {
  background: #f2f3f5;
  border: 1rpx solid #dcdfe6;
}
/* 课表模式的提示（隐藏联系人/立即预定后，告诉用户去哪儿报名） */
.hint-schedule {
  margin-top: 24rpx;
  color: #3a7d44;
  font-weight: 600;
}
`;
    wr(f, s);
    n += 1;
    console.log('  ✓ pages/book/book.wxss ← 追加 .gc-promo-expired / .gp-expired / .lg-expired / .hint-schedule');
  }
}

console.log('\n共修改 ' + n + ' 处');
