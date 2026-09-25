// 小程序「转发 / 分享到朋友圈」回归（2026-09-24）
// 用法：node scripts/verify-share.cjs
//
// 官方规则（实抓 developers.weixin.qq.com 核实）→ 逐条变断言：
//   ① 页面实现 onShareAppMessage → 右上角「转发」才可用；<button open-type="share"> 点按也触发它
//   ② 分享到朋友圈需**同时**实现 onShareAppMessage + onShareTimeline
//   ③ **朋友圈不支持自定义页面路径** → onShareTimeline 的返回值里不应有 path
//   ④ 体验版/开发版也能被转发，但接收方必须是体验成员（这一点无法在代码里测，只能写进文档）
//   ⑤ 官方禁止「转发才能解锁」这类诱导 —— 不做这类代码
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

// 假 wx：第一次带 menus 调用抛错（模拟低版本基础库），第二次应成功
const calls = [];
global.wx = {
  showShareMenu: (o) => {
    calls.push(o);
    if (o.menus && calls.length === 1) throw new Error('showShareMenu:fail parameter error');
  },
};

const share = require(path.join(ROOT, 'utils', 'share.js'));
// ⚠️ 不要写死真实域名（本仓是公开仓）：从 config.js 读。
//    仓内 config.js 是占位值（https://your-domain/venue-api），本机真值走 skip-worktree。
//    本脚本是纯静态/假 wx 测试，不发真请求，所以占位值也能跑通。
const config = require(path.join(ROOT, 'config.js'));
const API = String(config.apiBase || '').replace(/\/$/, '');

console.log('小程序「转发 / 分享到朋友圈」回归');

console.log('\n--- 1) 畅打活动分享 ---');
const promo = {
  id: 6,
  title: '周一上午畅打',
  promo_date: '2026-09-28',
  start_time: '09:00',
  end_time: '11:00',
  price_per_person: 35,
  cover: '/uploads/promos/p6.jpg',
};
const p = share.forPromo(promo, API);
ok('标题含活动名', p.title.includes('周一上午畅打'), p.title);
ok('★ 标题含价格且**没被截断**（价格排在日期前）', p.title.includes('¥35/人'), p.title);
ok('★ 标题含日期（缩短到 09-28）', p.title.includes('09-28'), p.title);
ok('长名字时时段自动让位（不硬塞导致截断）', !p.title.includes('09:00-11:00'), p.title);
ok('★ path 带活动 id（点开直达详情）', p.path === '/pages/promo-detail/promo-detail?id=6', p.path);
ok('配图转成绝对 URL', p.imageUrl === API + '/uploads/promos/p6.jpg', p.imageUrl);
ok('标题不超长（卡片会截断）', p.title.length <= 42, String(p.title.length));
ok('活动名已含「畅打」时不重复加前缀', p.title.startsWith('🎯 ·'), p.title);
ok('空 promo 不炸（退回首页）', share.forPromo(null, API).path === '/pages/index/index');
// 名字短的时候，时段要放得进去
const pShort = share.forPromo({ id: 6, title: '畅打A', promo_date: '2026-09-28', start_time: '09:00', end_time: '11:00', price_per_person: 35 }, API);
ok('短名字时时段能放下（09:00-11:00）', pShort.title.includes('09:00-11:00'), pShort.title);
ok('无价格时不显示 ¥', !share.forPromo({ id: 1, title: '免费畅打', promo_date: '2026-10-01' }, API).title.includes('¥'));

console.log('\n--- 2) 场馆分享 ---');
const venue = { id: 3, name: '室内匹克球馆', address: '北京市朝阳区某路 1 号', cover: '/static/covers/pickleball_001.jpg', default_cover: '/static/covers/x.jpg' };
const v = share.forVenue(venue, API);
ok('标题含场馆名', v.title.includes('室内匹克球馆'), v.title);
ok('标题含地址', v.title.includes('朝阳区'), v.title);
ok('★ path 带场馆 id', v.path === '/pages/venue-detail/venue-detail?id=3', v.path);
ok('cover 优先于默认封面', v.imageUrl === API + '/static/covers/pickleball_001.jpg', v.imageUrl);
const v2 = share.forVenue({ id: 9, name: '无封面馆', default_cover: '/static/covers/x.jpg' }, API);
ok('没有 cover 时用 default_cover', v2.imageUrl === API + '/static/covers/x.jpg', v2.imageUrl);
const v3 = share.forVenue({ id: 9, name: '全无图馆' }, API);
ok('完全没图 → 不传 imageUrl（微信自动截图）', v3.imageUrl === undefined, String(v3.imageUrl));

console.log('\n--- 3) 首页分享 ---');
const h = share.forHome();
ok('首页 path 正确', h.path === '/pages/index/index', h.path);
ok('首页标题含品牌名', h.title.includes('OpenVenues'), h.title);

console.log('\n--- 4) ★ 朋友圈：官方不支持自定义 path ---');
const t = share.timelineFor(p);
ok('★ 朋友圈返回值里没有 path 字段', !('path' in t), JSON.stringify(Object.keys(t)));
ok('朋友圈保留标题', t.title === p.title);
ok('朋友圈保留配图', t.imageUrl === p.imageUrl);
ok('即使传了 path 也被剥掉', !('path' in share.timelineFor({ title: 'x', path: '/a/b' })));
ok('空入参不炸', JSON.stringify(share.timelineFor(null)) === '{}', JSON.stringify(share.timelineFor(null)));

console.log('\n--- 5) 工具函数 ---');
ok('abs：相对路径拼成绝对', share.abs('/static/a.jpg', API) === API + '/static/a.jpg');
ok('abs：已是 http 不重复拼', share.abs('https://x.com/a.jpg', API) === 'https://x.com/a.jpg');
ok('abs：空值返回空串', share.abs('', API) === '' && share.abs(null, API) === '');
ok('clip：超长截断并加省略号', share.clip('啊'.repeat(60), 40).length === 40 && share.clip('啊'.repeat(60), 40).endsWith('…'));
ok('clip：短文本不动', share.clip('短标题', 40) === '短标题');

console.log('\n--- 6) 菜单挂载 + 老基础库降级 ---');
calls.length = 0;
share.enableShareMenu();
ok('调用 showShareMenu 并带上两个菜单', calls.length >= 1 && Array.isArray(calls[0].menus) && calls[0].menus.includes('shareAppMessage') && calls[0].menus.includes('shareTimeline'), JSON.stringify(calls[0]));
ok('★ 低版本基础库抛错后自动降级重试（不带 menus）', calls.length === 2 && !calls[1].menus, JSON.stringify(calls));
ok('不需要群标识就不开 withShareTicket', calls.every((c) => c.withShareTicket === false), JSON.stringify(calls));

console.log('\n--- 7) 三个页面接线 ---');
for (const [page, expr] of [
  ['pages/promo-detail/promo-detail.js', 'forPromo'],
  ['pages/venue-detail/venue-detail.js', 'forVenue'],
  ['pages/index/index.js', 'forHome'],
]) {
  const s = read(page);
  const name = page.split('/')[1];
  ok(`${name}：引入 utils/share.js`, /require\(.*utils\/share\.js'\)/.test(s));
  ok(`${name}：onLoad 里挂分享菜单`, /share\.enableShareMenu\(\)/.test(s));
  ok(`${name}：实现 onShareAppMessage`, /onShareAppMessage\s*\(\s*\)\s*\{/.test(s) && s.includes(`share.${expr}`));
  ok(`${name}：实现 onShareTimeline`, /onShareTimeline\s*\(\s*\)\s*\{/.test(s));
  ok(`${name}：朋友圈走 timelineFor（保证不带 path）`, /share\.timelineFor\(/.test(s));
}

console.log('\n--- 8) 页面内的转发入口 ---');
// 畅打详情：报名按钮下方的次级按钮
const promoWxml = read('pages/promo-detail/promo-detail.wxml');
ok('畅打详情：有 open-type="share" 按钮', /open-type="share"/.test(promoWxml));
ok('畅打详情：按钮有文案（含义清晰，官方指引）', /转发/.test(promoWxml));

// 场馆详情：转发入口在**场馆名称一行右侧**（2026-09-24 用户要求；试过海报右上角两版都被否）
const venueWxml = read('pages/venue-detail/venue-detail.wxml');
const venueWxss = read('pages/venue-detail/venue-detail.wxss');
const actionsBlock = (venueWxml.match(/<view class="actions">([\s\S]*?)<\/view>/) || [null, ''])[1];
// 注意：name-row 里嵌套了 .venue-name 的 </view>，不能用"到第一个 </view> 为止"提取
const nameRowBlock = (venueWxml.match(/<view class="name-row">([\s\S]*?)<view class="row"/) || [null, ''])[1];
const coverBlock = (venueWxml.match(/<view class="cover">([\s\S]*?)<!-- 场馆信息 -->/) || [null, ''])[1];
ok('★ 场馆详情：分享入口在场馆名称那一行里', /open-type="share"/.test(nameRowBlock), nameRowBlock.trim().slice(0, 120));
ok('★ 分享入口在名字右侧（名字在前、分享在后）', /venue-name[\s\S]*?open-type="share"/.test(nameRowBlock));
ok('★ 不再压在海报照片上', !/open-type="share"/.test(coverBlock), '海报块里还有分享按钮');
ok('名字行是「左名右分享」布局（flex + space-between）', /\.name-row\s*\{[\s\S]*?display:\s*flex[\s\S]*?justify-content:\s*space-between/.test(venueWxss));
ok('★ 名字过长会被省略号截断，不会把分享挤走', /\.venue-name\s*\{[\s\S]*?flex:\s*1[\s\S]*?min-width:\s*0[\s\S]*?text-overflow:\s*ellipsis/.test(venueWxss));
ok('分享按钮不参与伸缩（flex: none）→ 位置固定', /\.share-link\s*\{[\s\S]*?flex:\s*none/.test(venueWxss));
ok('分享按钮去掉了默认边框（::after）', /\.share-link::after\s*\{\s*border:\s*none/.test(venueWxss));
ok('没有残留的海报浮层样式（.share-pill / .share-icon）', !/\.share-pill\b|\.share-icon\b/.test(venueWxss) && !/share-pill|share-icon/.test(venueWxml));
ok('★ 底部操作区只剩 3 个按钮（约课/约场/畅打）', (actionsBlock.match(/<button/g) || []).length === 3, `实际 ${(actionsBlock.match(/<button/g) || []).length} 个`);
ok('★ 底部操作区不许再出现「转发」', !/转发/.test(actionsBlock), actionsBlock.trim().slice(0, 80));

// ★ 首页刻意**不放**按钮（2026-09-24 用户反馈：按钮破坏了品牌行的排版）
//   首页的分享入口是右上角「…」菜单 —— 由 index.js 的 onShareAppMessage/onShareTimeline 支撑
const homeWxml = read('pages/index/index.wxml');
const homeWxss = read('pages/index/index.wxss');
ok('★ 首页不放内联转发按钮（走右上角菜单）', !/open-type="share"/.test(homeWxml), '又加回按钮了？');
ok('★ 首页品牌行排版未被破坏（无 brand-share / brand-left 残留）', !/brand-share|brand-left/.test(homeWxml) && !/\.brand-share|\.brand-left/.test(homeWxss));
ok('首页品牌行仍是「品牌名 + 全部场馆」两项', /<view class="brand">[\s\S]{0,200}?brand-name[\s\S]{0,200}?city[\s\S]{0,40}?<\/view>/.test(homeWxml));
ok('畅打详情页转发按钮样式已定义', /\.share-btn/.test(read('pages/promo-detail/promo-detail.wxss')));

console.log('\n--- 9) 不做诱导分享（官方明确禁止）---');
const allJs = ['pages/promo-detail/promo-detail.js', 'pages/venue-detail/venue-detail.js', 'pages/index/index.js']
  .map(read)
  .join('\n');
ok('★ 没有「转发才能解锁/才能报名」这类条件判断', !/转发(才能|后).{0,6}(报名|解锁|领取)/.test(allJs));
ok('★ 没有把 onShareAppMessage 的结果用于 gate 业务逻辑', !/onShareAppMessage[\s\S]{0,120}?(disabled|isExpired)\s*=/.test(allJs));

console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
