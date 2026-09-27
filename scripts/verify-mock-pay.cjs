// 模拟支付模式（2026-09-27 用户拍板「B」）小程序端验证
//   · utils/pay.js：服务端回 mock 标记 → 弹「模拟收银台」（必须写明未开通商户号/不真扣钱）→ 确认后调 mock-confirm
//   · 卡详情：模拟模式下沿用已确认过的那个弹窗，**不再弹第二个**
//   手法：假 wx + mock wx.request，真调 pay.payOrder()/pay.mockSettle()
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

const handlers = { request: null, modals: [], toasts: [], navs: [] };
global.wx = {
  getStorageSync: (k) => (k === 'wx_token' ? 'tok_test' : ''),
  setStorageSync: () => {},
  removeStorageSync: () => {},
  navigateTo: (o) => handlers.navs.push(o.url),
  navigateBack: (o) => handlers.navs.push('BACK:' + ((o && o.delta) || 1)),
  redirectTo: (o) => handlers.navs.push('REDIRECT:' + o.url),
  showToast: (o) => handlers.toasts.push(o.title),
  // 默认"用户点了确认"；需要测取消时临时替换
  showModal: (o) => { handlers.modals.push(o); if (o.success) o.success({ confirm: true }); },
  request: (o) => { if (handlers.request) handlers.request(o); },
  requestPayment: () => { throw new Error('模拟模式不该调起微信收银台'); },
};

const json = (data) => ({ ok: true, data });
const pay = require(path.join(ROOT, 'utils/pay.js'));
const apiMod = require(path.join(ROOT, 'api/index.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
console.log('\n--- 1) 接线：api + pay.js ---');
{
  ok('api/index.js 有 mockConfirmOrder', /mockConfirmOrder:\s*\(id\)\s*=>\s*request\(\{\s*url:\s*`\/api\/orders\/\$\{id\}\/pay\/mock-confirm`/.test(read('api/index.js')));
  const src = read('utils/pay.js');
  ok('★ pay.js 识别服务端 mock 标记', /if \(d\.mock\) return mockSettle\(orderId, d\)/.test(src));
  ok('★ 有 mockSettle（模拟收银台）', /async function mockSettle/.test(src));
  ok('★ 已导出 mockSettle（卡详情复用，避免二次弹窗）', /module\.exports = \{[^}]*mockSettle/.test(src));
  ok('★ 文案写明「模拟支付」', /微信支付（模拟）/.test(src));
  ok('★ 文案写明「商户号未开通」', /商户号未开通/.test(src));
  ok('★ 文案写明「不会真实扣款」', /不会真实扣款/.test(src));
  ok('确认按钮是微信绿', /confirmColor:\s*'#07c160'/.test(src));
  ok('★ 只有点确认才调 mock-confirm', /if \(!okGo\) return \{ paid: false, cancelled: true, mock: true \}/.test(src) && /api\.mockConfirmOrder\(orderId\)/.test(src));
  ok('★ 模拟模式绝不调 wx.requestPayment', !/mockSettle[\s\S]{0,600}requestPayment\(/.test(src.slice(src.indexOf('async function mockSettle'), src.indexOf('async function mockSettle') + 700)));
  // ★★ 防复发（2026-09-27 实测抓到的真 bug）：api/request.js 已解包 {ok,data} → data 本体，
  //    这里再读 .data 会永远 undefined，**真支付会整条走不通**（表现为「服务端未返回支付参数」）
  ok('★★ 不再重复解包（payOrder）', !/\(r && r\.data\)/.test(src) && /const d = r \|\| \{\}/.test(src));
  ok('★★ 不再重复解包（payStatus 轮询）', /if \(s && s\.paid\) return/.test(src) && !/s\.data && s\.data\.paid/.test(src));
  ok('★★ 不再重复解包（mockSettle）', /const dd = r \|\| \{\}/.test(src));
}

console.log('\n--- 2) 真调：payOrder 收到 mock 标记 → 弹模拟收银台 → 确认入账 ---');
{
  let confirmCalls = 0;
  handlers.request = (o) => {
    if (/\/pay\/mock-confirm/.test(o.url)) {
      confirmCalls++;
      return o.success({ statusCode: 200, data: json({ paid: true, mock: true, amount_fen: 10000, amount_yuan: '100.00' }) });
    }
    if (/\/pay$/.test(o.url)) {
      return o.success({ statusCode: 200, data: json({ mock: true, order_id: 77, amount_fen: 10000, amount_yuan: '100.00' }) });
    }
    return o.success({ statusCode: 200, data: json({}) });
  };
  handlers.modals.length = 0;
  const r = await pay.payOrder(77);
  ok('★ 弹了模拟收银台', handlers.modals.length === 1 && /微信支付（模拟）/.test(handlers.modals[0].title), JSON.stringify(handlers.modals.map((m) => m.title)));
  ok('弹窗正文带金额与"模拟支付"说明', /100\.00/.test(handlers.modals[0].content) && /模拟支付/.test(handlers.modals[0].content), handlers.modals[0].content.replace(/\n/g, ' | '));
  ok('★ 确认后调了 mock-confirm', confirmCalls === 1, confirmCalls);
  ok('★ 返回已支付（不用轮询等回调）', r.paid === true && r.mock === true, JSON.stringify(r));
}

console.log('\n--- 3) 真调：模拟收银台点「取消」→ 不建账 ---');
{
  let confirmCalls = 0;
  const origModal = global.wx.showModal;
  global.wx.showModal = (o) => { handlers.modals.push(o); if (o.success) o.success({ confirm: false }); };
  handlers.request = (o) => {
    if (/mock-confirm/.test(o.url)) { confirmCalls++; return o.success({ statusCode: 200, data: json({ paid: true }) }); }
    if (/\/pay$/.test(o.url)) return o.success({ statusCode: 200, data: json({ mock: true, order_id: 78, amount_yuan: '60.00' }) });
    return o.success({ statusCode: 200, data: json({}) });
  };
  const r = await pay.payOrder(78);
  global.wx.showModal = origModal;
  ok('★ 取消 → 不调 mock-confirm', confirmCalls === 0, confirmCalls);
  ok('★ 返回 cancelled（订单仍在 15 分钟锁内，可再付）', r.paid === false && r.cancelled === true, JSON.stringify(r));
}

console.log('\n--- 4) 真调：mock-confirm 失败（例如开关被关掉）要有错误提示 ---');
{
  handlers.request = (o) => {
    if (/mock-confirm/.test(o.url)) return o.success({ statusCode: 409, data: { ok: false, code: 'MOCK_PAY_DISABLED', error: '当前不是模拟支付模式' } });
    if (/\/pay$/.test(o.url)) return o.success({ statusCode: 200, data: json({ mock: true, order_id: 79, amount_yuan: '60.00' }) });
    return o.success({ statusCode: 200, data: json({}) });
  };
  const r = await pay.payOrder(79);
  ok('★ 明确失败（不是假装成功）', r.paid === false && !!r.error, JSON.stringify(r));
  ok('错误文案取自服务端', /模拟支付模式/.test(r.error), r.error);
}

console.log('\n--- 5) 卡详情：模拟模式下只用那一个弹窗（不弹第二个收银台）---');
{
  const src = read('pages/card-detail/card-detail.js');
  ok('★ 探测 payConfig 时记录 mock_active', /mockActive = !!\(pc && pc\.mock_active\)/.test(src));
  ok('★ 模拟模式：建单后直接入账（复用已确认的弹窗）', /if \(this\._mockActive\) \{[\s\S]{0,160}pay\.mockSettle\(r\.order_id/.test(src));
  ok('★ 真支付路径保持不变（handleAfterCreate 仍在）', /pay\.handleAfterCreate\(/.test(src));
}

console.log('\n--- 6) 支付入口三处都会自动获得模拟能力（走同一个 payOrder）---');
{
  const book = read('pages/book/book.js');
  const promo = read('pages/promo-detail/promo-detail.js');
  // 约场是"一次可选多个时段" → 逐单调 payOrder（报名/充值走 handleAfterCreate），两者都经同一个 payOrder
  ok('约场走 cardPay + pay.payOrder（逐单）', /cardPay\.payAll\(/.test(book) && /pay\.payOrder\(/.test(book));
  ok('报名走 cardPay + pay.handleAfterCreate', /cardPay\.payOne\(/.test(promo) && /pay\.handleAfterCreate\(/.test(promo));
  ok('约课复用报名页（kind=course 走同一分支）', /course/.test(read('pages/promo-detail/promo-detail.js')) || /promo-detail/.test(read('pages/course-detail/course-detail.js') || ''));
}

console.log('\n--- 7) 用户要求：提交后**直接**弹收银台（不再先弹二次确认，也不用到我的订单再点一次）---');
{
  let confirmCalls = 0;
  handlers.request = (o) => {
    if (/mock-confirm/.test(o.url)) { confirmCalls++; return o.success({ statusCode: 200, data: json({ paid: true, mock: true, amount_yuan: '60.00' }) }); }
    if (/\/pay$/.test(o.url)) return o.success({ statusCode: 200, data: json({ mock: true, order_id: 88, amount_yuan: '60.00' }) });
    return o.success({ statusCode: 200, data: json({}) });
  };
  handlers.modals.length = 0;
  const r = await pay.handleAfterCreate({ id: 88, need_pay: true, total_price: 60 }, 'booking');
  const titles = handlers.modals.map((m) => m.title);
  ok('★ 没有「预约成功，请完成支付」这类二次确认', !handlers.modals.some((m) => /需要支付|请完成支付|立即支付/.test((m.title || '') + (m.content || ''))), JSON.stringify(titles));
  ok('★ 提交后直接弹出的就是模拟收银台', handlers.modals.length === 1 && /微信支付（模拟）/.test(handlers.modals[0].title), JSON.stringify(titles));
  ok('★ 一单即一付（确认后已入账）', confirmCalls === 1 && r.paid === true, `confirm=${confirmCalls} paid=${r.paid}`);
}

console.log('\n--- 8) 约场页面：单笔直付、多笔才先给合计说明 ---');
{
  const book = read('pages/book/book.js');
  ok('★ 单笔不弹合计确认（goPay 默认 true）', /let goPay = true;/.test(book) && /if \(rest\.length > 1\)/.test(book));
  ok('多笔合计说明写了"逐单支付"', /将逐单支付/.test(book));
  ok('★ 提交后仍走 pay.payOrder（收银台入口不变）', /await pay\.payOrder\(o\.id/.test(book));
  ok('订单仍是"待支付 + 15 分钟锁"（不想现在付可退出，之后在我的订单里付）', /15 分钟/.test(book) && /我的订单/.test(book));
  const promo = read('pages/promo-detail/promo-detail.js');
  ok('★ 报名/约课同样直达收银台（走 handleAfterCreate）', /pay\.handleAfterCreate\(/.test(promo));
}

console.log(`\n模拟支付模式（小程序端）：${pass} 过 / ${fail} 失败`);
if (fail) process.exit(1);
})();
