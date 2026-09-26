// 「我的」页面改版（2026-09-26 用户要求）验证
//   1) 顶部快捷入口的「我的订单」→「培训课程」，点击进课程列表页
//   2) 「我的预约」改名「我的订单」（内容不变：仍进已确认订单列表）
//   3) 「历史订单」删掉
//   4) 「微信头像昵称」从列表挪到顶部用户卡片右侧的「设置」按钮（点开同一个编辑面板）
// 手法：真页面文件断言 + 假 wx 真调 handler（跳转 URL / 编辑面板开关）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (label, cond, extra) => {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : ''));
  }
};

const storage = {};
const calls = { navs: [], storage: storage };
global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  navigateTo: (o) => calls.navs.push(o.url),
  navigateBack: () => calls.navs.push('BACK'),
  switchTab: (o) => calls.navs.push('SWITCH:' + o.url),
  showToast: () => {},
  showModal: () => {},
  setNavigationBarTitle: () => {},
  request: () => {},
  login: () => {},
  getUserProfile: () => {},
  getUserInfo: () => {},
  chooseAvatar: () => {},
};

let page = null;
try {
  global.Page = (o) => {
    page = o;
  };
  require(path.join(ROOT, 'pages/my/my.js'));
} catch (e) {
  console.log('  ! require my.js 失败：' + e.message);
}

const wxml = read('pages/my/my.wxml');
const noComment = wxml.replace(/<!--[\s\S]*?-->/g, '');
const js = read('pages/my/my.js');
const wxss = read('pages/my/my.wxss');

console.log('--- ① 快捷入口：「我的订单」→「培训课程」---');
{
  const shortcuts = (wxml.match(/<view class="shortcuts">([\s\S]*?)<\/view>\s*<\/view>\s*<\/view>/) || [])[0] || '';
  ok('取到快捷入口区块', shortcuts.length > 0);
  ok('★ 有「培训课程」入口', /class="sc-label">培训课程</.test(shortcuts) && /bindtap="goCourses"/.test(shortcuts), shortcuts.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100));
  ok('★ 快捷入口里已无「我的订单」', !/我的订单/.test(shortcuts));
  ok('快捷入口仍是 3 项（畅打活动 / 我的收藏 未动）', /畅打活动/.test(shortcuts) && /我的收藏/.test(shortcuts));
  ok('★ js 有 goCourses 且跳课程列表页', /goCourses\(\)[\s\S]{0,160}wx\.navigateTo\(\{ url: '\/pages\/courses\/courses' \}\)/.test(js), (js.match(/goCourses\(\)[\s\S]{0,90}/) || [''])[0].replace(/\n\s*/g, ' '));
  if (page && typeof page.goCourses === 'function') {
    calls.navs.length = 0;
    page.goCourses.call({ data: {}, setData() {} });
    ok('★ 真调 goCourses() → /pages/courses/courses', calls.navs[0] === '/pages/courses/courses', calls.navs[0]);
  } else {
    console.log('     ⚠ 没拿到 page 对象 → 动态跳转断言跳过（静态断言已覆盖）');
  }
}

console.log('\n--- ②「我的预约」改名「我的订单」；③「历史订单」删掉 ---');
{
  const serviceSection = (wxml.match(/<view class="section">([\s\S]*?)<\/view>\s*<\/view>\s*<\/view>/) || [])[0] || wxml;
  ok('★「我的服务」里出现「我的订单」', /class="li-title">我的订单</.test(serviceSection), '');
  ok('★ 已无「我的预约」', !/我的预约/.test(noComment));
  ok('★ 已无「历史订单」条目', !/历史订单/.test(noComment));
  // 内容不变：仍是同一个 goOrders + data-status="confirmed"
  ok('★ 我的订单仍是原「我的预约」的行为（goOrders + data-status=confirmed）', /bindtap="goOrders" data-status="confirmed"[\s\S]{0,120}我的订单/.test(noComment), (noComment.match(/bindtap="goOrders"[\s\S]{0,60}/) || [''])[0].replace(/\s+/g, ' '));
  ok('js 的 goOrders 仍是跳订单列表页', /wx\.navigateTo\(\{ url: '\/pages\/order-list\/order-list' \}\)/.test(js));
}

console.log('\n--- ④「微信头像昵称」→ 顶部卡片右侧「设置」按钮 ---');
{
  // ⚠️ 顶部未填资料时的提示文案「点此设置微信头像昵称 ›」是**保留**的，
  //    所以这里只断言「我的服务」里那个列表项消失（别用全页 includes 一棍子打死）
  ok('★「我的服务」里已无「微信头像昵称」列表项', !/li-title">微信头像昵称</.test(noComment) && !/<view class="list-item" bindtap="openEditor">/.test(noComment), (noComment.match(/li-title">[^<]*/g) || []).join(' / '));
  ok('★ 顶部用户卡片里有「设置」按钮，点了走 openEditor', /class="user-settings-btn"[^>]*bindtap="openEditor"[^>]*>设置</.test(noComment), (noComment.match(/<view class="user-settings-btn"[^>]*>/) || [''])[0]);
  // 位置：必须在已登录分支（<block wx:else>）里，未登录不该出现设置按钮
  const elseBlock = (wxml.match(/<block wx:else>([\s\S]*?)<\/block>/) || [])[1] || '';
  ok('★ 设置在已登录区块内（未登录不显示）', /user-settings-btn/.test(elseBlock) && !/user-settings-btn/.test((wxml.match(/<block wx:if="\{\{!loggedIn\}\}">([\s\S]*?)<\/block>/) || [])[1] || ''));
  ok('编辑面板与原来一致（更新微信头像昵称 + 头像选择 + 昵称输入 + 保存）', /editing/.test(wxml) && /更新微信头像昵称/.test(wxml) && /chooseavatar/.test(wxml) && /type="nickname"/.test(wxml) && /saveProfile/.test(wxml));
  ok('样式有 .user-settings-btn 且 flex:none（长昵称不会挤走按钮）', /\.user-settings-btn\s*\{[\s\S]*?flex:\s*none/.test(wxss));
  if (page && typeof page.openEditor === 'function') {
    const inst = {
      data: { loggedIn: true, nickname: 'vincent', avatar: '' },
      setData(p) { Object.assign(this.data, p); },
      onLogin() { this._wentToLogin = true; },
    };
    page.openEditor.call(inst);
    ok('★ 真调 openEditor() → 打开编辑面板（editing=true）', inst.data.editing === true, JSON.stringify(inst.data));
  } else {
    console.log('     ⚠ 没拿到 page 对象 → 动态断言跳过（静态断言已覆盖）');
  }
}

console.log('\n--- ⑤ 防复发：旧文案 / 旧入口不得残留在其它页面 ---');
{
  let hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(wxml|js)$/.test(e.name)) {
        const t = read(rel).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '');
        if (/我的预约|历史订单/.test(t)) hits.push(rel);
      }
    }
  };
  walk('pages');
  ok('★ 小程序里没有「我的预约 / 历史订单」旧文案残留', hits.length === 0, hits.join(', '));
}

console.log('\n--- ⑥ 关于：版本号 1.1.0 + 简介文案 ---');
{
  const config = require(path.join(ROOT, 'config.js'));
  ok('★ config.js 版本号 = 1.1.0', config.version === '1.1.0', config.version);
  ok('旧版本号 0.1.0 已不存在', !/0\.1\.0/.test(read('config.js').replace(/\/\/.*$/gm, '')));
  ok('my.js 把 version 透出给页面', /version,/.test(js) && /\{\{\s*version\s*\}\}/.test(wxml));

  const aboutBlock = (wxml.match(/<view class="section">\s*<view class="section-title">关于<\/view>([\s\S]*?)<\/view>\s*<\/view>\s*$/) || wxml.match(/关于<\/view>([\s\S]*)/) || [])[1] || '';
  const text = noComment.replace(/\s+/g, '');
  for (const [label, needle] of [
    ['★ 含「场馆预订小程序（OpenVenues）」', '场馆预订小程序（OpenVenues）'],
    ['★ 含「记忆花园 旗下开发」', '记忆花园旗下开发'],
    ['★ 含「开源免费微信小程序」', '开源免费微信小程序'],
    ['★ 含 GitHub 地址「github.com/vincentlilee2」', 'github.com/vincentlilee2'],
  ]) {
    ok(label, text.includes(needle.replace(/\s+/g, '')));
  }
  ok('★ 简介在「关于」区块内、且在版本号那行下面', aboutBlock.includes('记忆花园') && aboutBlock.indexOf('OpenVenues') < aboutBlock.indexOf('记忆花园'), aboutBlock.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
  ok('样式有 .about-desc', /\.about-desc\s*\{/.test(wxss));
}

console.log(`\n合计：${pass} 过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
