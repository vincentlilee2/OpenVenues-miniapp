// 场馆详情页「⊕ 导航」：位置正确 + 行为与首页卡片完全一致（共用 utils/nav.js）
//   用户 2026-09-25：「首页中场馆卡已经有了导航按钮，在场馆详情页面中的分享按钮右侧也添加上对应的导航按钮」
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  ' + extra : '')); }
};

const wxml = read('pages/venue-detail/venue-detail.wxml');
const wxss = read('pages/venue-detail/venue-detail.wxss');
const js = read('pages/venue-detail/venue-detail.js');
const indexWxml = read('pages/index/index.wxml');
const navUtil = read('utils/nav.js');

console.log('--- ① 位置（2026-09-26 用户要求挪位）：导航在「地址」行右侧；名字行右侧是「介绍…」---');
// ⚠️ 别再用「从名字行吃到下一个 class="row" 为止」的老正则：地址行现在是 `class="row row-addr"`，
//    老正则匹配不到它会**一路吃到后面真正的 `class="row"` 行**，把地址行里的导航当成名字行里的
//    → 断言恒真 = **假绿**（2026-09-26 挪位后实测：老断言仍全过，实际位置已经错了）。改成按行切。
const vdLines = wxml.split('\n');
const iNameRow = vdLines.findIndex((l) => l.includes('class="name-row"'));
const iAddrRow = vdLines.findIndex((l) => l.includes('class="row row-addr"'));
const iAddrEnd = vdLines.findIndex((l, i) => i > iAddrRow && l.trim() === '</view>');
const nameRow = vdLines.slice(iNameRow, iAddrRow).join('\n');
const addrRow = vdLines.slice(iAddrRow, iAddrEnd + 1).join('\n');
ok('取到名字行区块', iNameRow >= 0 && iAddrRow > iNameRow && nameRow.length > 0, `name=${iNameRow} addr=${iAddrRow}`);
ok('取到地址行区块', iAddrRow >= 0 && iAddrEnd > iAddrRow && addrRow.length > 0, `addr=${iAddrRow} end=${iAddrEnd}`);
// 名字行：名称 + 「介绍…」；**没有**导航、没有分享
ok('★ 名字行右侧是「介绍…」（进该馆的介绍文章）', /class="intro-link"[^>]*bindtap="openIntro"/.test(nameRow) && /介绍…/.test(nameRow), nameRow.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));
ok('★ 名字行里**没有**导航按钮了（已挪到地址行）', !/class="nav-link"|openMap/.test(nameRow), nameRow.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));
// ★ 2026-09-25 用户要求「场馆详情页面的分享按钮 去掉」→ 名字行里必须**没有**分享按钮。
//   （与 2026-09-24「放在分享右侧」的历史相反，以最新要求为准；转发仍在右上角「…」菜单）
ok('★ 名字行里已无「分享」按钮（用户要求去掉）', !/share-link|open-type="share"/.test(nameRow), nameRow.trim().slice(0, 120));
// 地址行：导航落在这里，且地址必须**完整显示**
ok('★ 地址行右侧有「⊕ 导航」（2026-09-26 挪过来）', /class="nav-link"[^>]*bindtap="openMap"/.test(addrRow), addrRow.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));
ok('导航文案是「⊕ 导航」（与首页卡片一致）', /class="nav-link"[^>]*>\s*⊕\s*导航\s*</.test(addrRow));
ok('导航用 bindtap="openMap"', /class="nav-link"[^>]*bindtap="openMap"/.test(addrRow));
ok('地址有独立 class（addr-text，好给它单独的折行样式）', /class="addr-text"/.test(addrRow));
const addrRule = (wxss.match(/\.addr-text\s*\{[\s\S]*?\}/) || [''])[0];
ok('★ 地址不截断：.addr-text 没有 text-overflow / white-space: nowrap', !/text-overflow/.test(addrRule) && !/white-space/.test(addrRule), addrRule.replace(/\s+/g, ' ').slice(0, 90));
ok('★ 地址可折行：word-break + flex:1（长地址换行显示全）', /word-break/.test(addrRule) && /flex:\s*1/.test(addrRule), addrRule.replace(/\s+/g, ' ').slice(0, 90));

console.log('\n--- ② 不破坏既有约束：底部操作区仍恰好 3 个按钮，导航不进去 ---');
// 底部操作区是 <view class="actions">（参考 verify-share.cjs 的取法，别用猜的 class 名）
const actionsBlock = (wxml.match(/<view class="actions">([\s\S]*?)<\/view>/) || [null, ''])[1];
const footerBtns = (actionsBlock.match(/<button/g) || []).length;
ok('取到底部操作区', actionsBlock.length > 0);
ok('底部操作区恰好 3 个 button', footerBtns === 3, '实际 ' + footerBtns);
ok('底部操作区里没有「导航」', !/导航/.test(actionsBlock));
ok('导航不在底部按钮行里（在地址行里）', addrRow.includes('nav-link') && !actionsBlock.includes('nav-link'));
ok('底部操作区仍是 约课/约场/畅打', ['约课', '约场', '畅打'].every((t) => actionsBlock.includes(t)), actionsBlock.replace(/\s+/g, ' ').trim().slice(0, 100));

console.log('\n--- ③ 样式：与首页卡片的导航按钮同一套视觉 ---');
const indexNav = (read('pages/index/index.wxss').match(/\.venue-nav\s*\{[\s\S]*?\}/) || [''])[0];
const detailNav = (wxss.match(/\.nav-link\s*\{[\s\S]*?\}/) || [''])[0];
ok('详情页有 .nav-link 样式', detailNav.length > 0);
for (const prop of ['background: var(--primary)', 'color: #fff', 'border-radius: 999rpx', 'font-size: 24rpx']) {
  ok('样式与首页导航一致：' + prop, detailNav.includes(prop) && indexNav.includes(prop), 'detail=' + detailNav.includes(prop) + ' index=' + indexNav.includes(prop));
}
ok('flex: none（名字再长也不被挤走）', /flex:\s*none/.test(detailNav));
ok('.name-row 用 flex + justify-content 让右侧按钮固定', /\.name-row\s*\{[\s\S]*?display:\s*flex/.test(wxss));

console.log('\n--- ④ 唯一实现：地图逻辑只在 utils/nav.js 里 ---');
ok('utils/nav.js 导出 openVenueMap', /module\.exports\s*=\s*\{[^}]*openVenueMap/.test(navUtil));
ok('utils/nav.js 处理 (0,0) 占位值', /lat === 0 && lng === 0/.test(navUtil));
ok('utils/nav.js 做的是 openLocation + showModal 降级', /wx\.openLocation\(/.test(navUtil) && /wx\.showModal\(/.test(navUtil));
ok('首页 js 不再自己算坐标（改用 nav.openVenueMap）', /nav\.openVenueMap\(/.test(read('pages/index/index.js')) && !/Number\.isFinite\(lat\)/.test(read('pages/index/index.js')));
ok('详情页 js 调用同一实现', /nav\.openVenueMap\(this\.data\.venue\)/.test(js));

console.log('\n--- ⑤ 行为：真页面 handler + 假 wx ---');
let page;
global.Page = (o) => { page = o; };
const calls = { openLocation: [], showModal: [], showToast: [], makePhoneCall: [] };
global.wx = {
  openLocation: (o) => calls.openLocation.push(o),
  showModal: (o) => calls.showModal.push(o),
  showToast: (o) => calls.showToast.push(o),
  makePhoneCall: (o) => calls.makePhoneCall.push(o),
  getStorageSync: () => '',
  setStorageSync: () => {},
  request: () => {},
  showShareMenu: () => {},
};
require(path.join(ROOT, 'pages', 'venue-detail', 'venue-detail.js'));

const inst = (venue) => ({ data: { venue }, setData() {} });
const reset = () => { calls.openLocation.length = 0; calls.showModal.length = 0; calls.showToast.length = 0; };

reset();
page.openMap.call(inst({ id: 1, name: '室外网球场', address: '北京市朝阳区朝阳体育中心', latitude: 39.94427, longitude: 116.528051 }));
ok('有坐标 → 调用 openLocation', calls.openLocation.length === 1, calls.openLocation.length);
const o = calls.openLocation[0] || {};
ok('latitude 用场馆真实值', o.latitude === 39.94427, o.latitude);
ok('longitude 用场馆真实值', o.longitude === 116.528051, o.longitude);
ok('name 传场馆名', o.name === '室外网球场', o.name);
ok('address 传场馆地址', o.address === '北京市朝阳区朝阳体育中心', o.address);
ok('scale = 16', o.scale === 16, o.scale);
ok('没弹提示', calls.showModal.length === 0, calls.showModal.length);

reset();
page.openMap.call(inst({ id: 1, name: 'A', address: '某地址', latitude: 0, longitude: 0 }));
ok('(0,0) → 不打开地图（不把用户导到几内亚湾）', calls.openLocation.length === 0);
ok('(0,0) → 弹「暂无定位」', calls.showModal.length === 1 && /没有设置地图坐标/.test(calls.showModal[0].content || ''), JSON.stringify(calls.showModal[0] || {}).slice(0, 80));
ok('提示里带地址（方便用户手动搜）', /某地址/.test((calls.showModal[0] || {}).content || ''));

reset();
page.openMap.call(inst({ id: 1, name: 'A', address: '', latitude: null, longitude: null }));
ok('无坐标无地址 → 弹「还没有填写地址」', calls.showModal.length === 1 && /还没有填写地址/.test(calls.showModal[0].content || ''));

reset();
page.openMap.call(inst(null));
ok('venue 为空 → 什么都不做（不崩）', calls.openLocation.length === 0 && calls.showModal.length === 0);

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
