// 订单「来源」文案（2026-09-26）
//   用户要求：「我的 订单列表 订单详情 页面中的 来源 一行中 将 畅打活动：去掉（现在都归类来畅打活动了）」
//   ⇒ 来源行直接显示**服务名称**（活动/课程标题），不再有「畅打活动：」前缀；
//     标题缺失时兜底成「畅打活动」，不要只剩一个图标。
// 手法：真页面文件断言 + 假 wx 跑真 js 的 sourceText 派生逻辑
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
global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  navigateTo: () => {},
  navigateBack: () => {},
  switchTab: () => {},
  showToast: () => {},
  request: () => {},
  setNavigationBarTitle: () => {},
};
function grabPage(rel) {
  let obj = null;
  global.Page = (o) => {
    obj = o;
  };
  const abs = path.join(ROOT, rel);
  delete require.cache[require.resolve(abs)];
  require(abs);
  return obj;
}

console.log('--- ① 订单详情页：来源行不再有「畅打活动：」前缀 ---');
{
  const wxml = read('pages/order-detail/order-detail.wxml');
  const noComment = wxml.replace(/<!--[\s\S]*?-->/g, '');
  ok('★ 来源行里没有「畅打活动：」了', !/畅打活动：/.test(noComment), (noComment.match(/<text>[^<]*\{?\{?promoTitle[^<]*/) || [''])[0]);
  ok('来源行仍显示 promoTitle', /\{\{promoTitle\}\}/.test(noComment));
  ok('来源行有图标（🎯）', /🎯\s*\{\{promoTitle\}\}/.test(noComment));
  ok('散客一行仍是「⏰ 散客预约」', /⏰\s*散客预约/.test(noComment));
  const js = read('pages/order-detail/order-detail.js');
  ok('★ promoTitle 为空时兜底「畅打活动」（不会只剩一个 🎯）', /\|\|\s*'畅打活动'/.test(js), (js.match(/promoTitle:.*/) || [''])[0].trim());
}

console.log('\n--- ② 订单列表：sourceText 是「🎯 服务名称」/「⏰ 散客预约」 ---');
{
  const js = read('pages/order-list/order-list.js');
  const noComment = js.replace(/\/\/.*$/gm, '');
  ok('★ 列表里没有「畅打活动：」前缀', !/畅打活动：/.test(noComment));
  ok('散客 → 「⏰ 散客预约」', /'⏰ 散客预约'/.test(noComment));
  // 派生表达式就在 load() 的 map 里（没抽成函数），所以这里直接钉住表达式本身
  ok('★ 活动/课程 → 「🎯 标题」并带兜底', /sourceText:\s*o\.source === 'promo' \? `🎯 \$\{o\.promo_title \|\| '畅打活动'\}` : '⏰ 散客预约'/.test(noComment), (noComment.match(/sourceText:.*/) || [''])[0].trim());
  ok('列表模板会把 sourceText 渲染出来', /\{\{item\.sourceText\}\}/.test(read('pages/order-list/order-list.wxml')));
}

console.log('--- ③ 全小程序再扫一遍：不该有「畅打活动：」这种前缀 ---');
{
  let hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(wxml|js|json)$/.test(e.name)) {
        const t = read(rel).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '');
        if (/畅打活动：/.test(t)) hits.push(rel);
      }
    }
  };
  for (const d of ['pages', 'utils', 'api', 'custom-tab-bar']) if (fs.existsSync(path.join(ROOT, d))) walk(d);
  ok('★ 防复发：小程序里没有「畅打活动：」前缀残留', hits.length === 0, hits.join(', '));
}

console.log(`\n合计：${pass} 过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
