// 约场提交流程验证（2026-09-27 手机端实测踩坑后补的行为测试）
//
// 为什么要有这个套件：
//   之前的测试只驱动了 utils/pay.js（收银台本身），**没驱动页面收集"待支付订单"这一步** ——
//   而 book.js 当时写的是 `const d = (created && created.data)`，而 api/request.js 已经解包过，
//   于是 need_pay 永远为空 → 支付那一段整段不执行 → 下单后直接跳到「我的订单」，
//   用户看到的就是"还得再点一次去支付"。这类"页面把已解包响应又读一层"的坑本仓已出现 5 次。
//
// 本套件：真加载 pages/book/book.js，真调 onBook()，断言「提交 → 直接进收银台 → 入账 → 跳我的订单」的顺序。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
};

// ===== 事件时间线（顺序断言靠它）=====
const events = [];
const requests = [];

global.wx = {
  getStorageSync: (k) => (k === 'wx_token' ? 'tok_test' : ''),
  setStorageSync: () => {},
  removeStorageSync: () => {},
  navigateTo: (o) => { events.push({ t: 'nav', url: o.url }); },
  navigateBack: () => { events.push({ t: 'nav', url: 'BACK' }); },
  redirectTo: (o) => { events.push({ t: 'nav', url: 'REDIRECT:' + o.url }); },
  switchTab: (o) => { events.push({ t: 'nav', url: 'SWITCH:' + o.url }); },
  showToast: (o) => { events.push({ t: 'toast', title: o.title }); },
  showModal: (o) => {
    events.push({ t: 'modal', title: o.title || '' });
    if (o.success) o.success({ confirm: true }); // 一律点确认
  },
  setNavigationBarTitle: () => {},
  request: (o) => { requests.push(o.url); },
};

// ===== 假 api：模拟"未配商户号但开了模拟支付模式"的服务端 =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeApi = new Proxy(
  {
    createOrder: async () => ({ id: 900, order_no: 'V_TEST', need_pay: true, total_price: 180 }), // 已解包形态
    usableCards: async () => [],
    payOrder: async () => ({ mock: true, order_id: 900, amount_yuan: '180.00' }),
    mockConfirmOrder: async () => ({ paid: true, mock: true, amount_yuan: '180.00' }),
    payStatus: async () => ({ paid: false }),
    payConfig: async () => ({ enabled: false, mock_active: true }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => ({}); // 其余接口（资料保存之类）不关心，返回空对象
    },
  }
);
const apiPath = require.resolve(path.join(ROOT, 'api', 'index.js'));
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: fakeApi };

let pageObj = null;
global.Page = (o) => { pageObj = o; };
require(path.join(ROOT, 'pages/book/book.js'));

(async () => {
console.log('\n--- 1) 静态：页面不能再对已解包的响应读 .data（防复发）---');
{
  const book = read('pages/book/book.js');
  const promo = read('pages/promo-detail/promo-detail.js');
  ok('★ book.js：need_pay 取自解包后的对象', /const d = created \|\| \{\};\s*\n\s*if \(d\.need_pay\)/.test(book));
  ok('★★ book.js 不再有 (created && created.data)', !/created && created\.data/.test(book));
  ok('★★ promo-detail.js 不再有 (created && created.data)', !/created && created\.data/.test(promo));
  // 全仓扫一遍这个坏写法（pages/ 与 utils/）
  const bad = [];
  for (const dir of ['pages', 'utils']) {
    const walk = (p) => {
      for (const f of fs.readdirSync(p)) {
        const fp = path.join(p, f);
        if (fs.statSync(fp).isDirectory()) walk(fp);
        else if (f.endsWith('.js') && /\((\w+) && \1\.data\)|\.data\) \|\| \{\}/.test(fs.readFileSync(fp, 'utf8'))) bad.push(path.relative(ROOT, fp));
      }
    };
    walk(path.join(ROOT, dir));
  }
  ok('★★ 全仓 pages/utils 已无"再读一层 .data"写法', bad.length === 0, bad.join(', '));
}

console.log('\n--- 2) 真调 onBook()：提交 → 直接收银台 → 入账 → 跳我的订单 ---');
{
  const p = pageObj;
  const i = Object.create(p);
  i.data = Object.assign({}, p.data, {
    venueId: 1,
    venueName: '室外网球场',
    activeDate: '2026-09-27',
    rows: [{ hour: 14, cells: [{ cid: 3, slot: '14:00', price: 180 }] }],
    selectedKeys: { '3|14:00': true },
    selectedCount: 1,
    totalPrice: 180,
    contact_name: '测试用户',
    contact_phone: '13800138000',
    courts: [{ id: 3, name: '1 号场' }],
  });
  i.setData = (d) => Object.assign(i.data, d);

  await i.onBook();
  // 收银台之后是 setTimeout(…, 800) 才跳「我的订单」—— 等够，否则会误判成"没跳"
  await sleep(1100);

  const titles = events.filter((e) => e.t === 'modal').map((e) => e.title);
  const cashierIdx = events.findIndex((e) => e.t === 'modal' && /微信支付/.test(e.title));
  const confirmIdx = events.findIndex((e) => e.t === 'toast' || e.t === 'nav');
  const navOrdersIdx = events.findIndex((e) => e.t === 'nav' && /order-list/.test(e.url || ''));

  ok('提交后发生了支付（有"微信支付"弹窗）', cashierIdx >= 0, JSON.stringify(titles));
  ok('★ 直接弹出的是模拟收银台（不是二次确认框）', events.some((e) => e.t === 'modal' && /微信支付（模拟）/.test(e.title)), JSON.stringify(titles));
  ok('★ 没有「预约成功，请完成支付」这类二次确认', !titles.some((t) => /需要支付|请完成支付/.test(t || '')), JSON.stringify(titles));
  ok('★ 收银台排在"跳我的订单"之前（先付款后跳转）', cashierIdx >= 0 && navOrdersIdx > cashierIdx, `cashier@${cashierIdx} nav@${navOrdersIdx}`);
  ok('★ 最终跳到「我的订单」', navOrdersIdx >= 0, JSON.stringify(events.filter((e) => e.t === 'nav')));
  ok('★ 支付成功提示（说明走完了入账）', events.some((e) => e.t === 'toast' && /已支付/.test(e.title || '')), JSON.stringify(events.filter((e) => e.t === 'toast')));
  ok('★ 收银台只弹一次（不是每单/每步都弹）', events.filter((e) => e.t === 'modal' && /微信支付/.test(e.title)).length === 1);
  ok('没有走到"下单选时段"的报错分支（groups 解析正常）', !events.some((e) => e.t === 'toast' && /请填写|请选择/.test(e.title || '')), JSON.stringify(events.filter((e) => e.t === 'toast')));
}

console.log(`\n约场提交流程：${pass} 过 / ${fail} 失败`);
if (fail) process.exit(1);
})();
