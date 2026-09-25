// 小程序「微信支付」回归（2026-09-24）
// 用法：node scripts/verify-pay-ui.cjs
//
// 查三层：
//   ① utils/pay.js 的判定与状态机（**结果以服务端为准**：不能拿 wx.requestPayment 的 success 当已支付）
//   ② api/index.js 有支付三件套（探测/发起/查状态）
//   ③ 页面确实接上了：下单后触发支付、订单列表/详情有待支付倒计时与「去支付」、取消后显示退款金额
//
// 不连后端：用假 api + 假 wx 跑状态机；页面部分做静态断言。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

// ---- 假 wx ----
const wxCalls = { modal: [], payment: [], toast: [], loading: [] };
let requestPaymentResult = 'ok'; // ok | cancel | fail
global.wx = {
  showModal: (o) => { wxCalls.modal.push(o); if (o.success) o.success({ confirm: true }); },
  showToast: (o) => wxCalls.toast.push(o),
  showLoading: (o) => wxCalls.loading.push(o),
  hideLoading: () => {},
  requestPayment: (o) => {
    wxCalls.payment.push(o);
    if (requestPaymentResult === 'ok') o.success && o.success({ errMsg: 'requestPayment:ok' });
    else if (requestPaymentResult === 'cancel') o.fail && o.fail({ errMsg: 'requestPayment:fail cancel' });
    else o.fail && o.fail({ errMsg: 'requestPayment:fail error' });
  },
};

// ---- 假 api（注入 require 缓存，pay.js 会拿到它）----
let fakeState = { payOrderReply: null, payOrderThrows: null, statusReplies: [] };
const statusQueue = () => (fakeState.statusReplies.length ? fakeState.statusReplies.shift() : { ok: true, data: { paid: false } });
const fakeApi = {
  payOrder: async () => {
    if (fakeState.payOrderThrows) throw fakeState.payOrderThrows;
    return fakeState.payOrderReply;
  },
  payStatus: async () => statusQueue(),
};
const apiPath = require.resolve(path.join(ROOT, 'api', 'index.js'));
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: fakeApi };

const pay = require(path.join(ROOT, 'utils', 'pay.js'));

const PAY_PARAMS = { timeStamp: '1730000000', nonceStr: 'ABC', package: 'prepay_id=wx_test', signType: 'RSA', paySign: 'SIG' };

console.log('小程序「微信支付」回归');

console.log('\n--- 1) 剩余时间文案（用服务端秒数，不解析时间串）---');
ok('900 秒 → 剩余 15:00', pay.remainText(900) === '剩余 15:00', pay.remainText(900));
ok('65 秒 → 剩余 1:05', pay.remainText(65) === '剩余 1:05', pay.remainText(65));
ok('0 / 负数 → 空串（不显示倒计时）', pay.remainText(0) === '' && pay.remainText(-5) === '');
ok('null / 未定义 → 空串', pay.remainText(null) === '' && pay.remainText(undefined) === '');

console.log('\n--- 2) 支付状态文案 ---');
ok('未支付', pay.payBadgeText({ pay_status: 'unpaid' }) === '待支付');
ok('已支付带金额（用元）', pay.payBadgeText({ pay_status: 'paid', paid_amount_yuan: '50.00' }) === '已支付 ¥50.00');
ok('已退款', pay.payBadgeText({ pay_status: 'refunded' }) === '已退款');
ok('无支付维度（未开通门店）→ 空串', pay.payBadgeText({ pay_status: null }) === '' && pay.payBadgeText({}) === '');

console.log('\n--- 3) 支付状态机（结果以服务端为准）---');
(async () => {
  // 3.1 服务端说已支付
  fakeState.payOrderReply = { ok: true, data: { already_paid: true, amount_fen: 5000 } };
  let r = await pay.payOrder(1);
  ok('服务端已支付 → paid=true（不弹收银台）', r.paid === true && wxCalls.payment.length === 0);

  // 3.2 正常流程：拉起收银台成功 + 服务端入账
  wxCalls.payment.length = 0;
  fakeState.payOrderReply = { ok: true, data: { pay_params: PAY_PARAMS, amount_fen: 5000 } };
  fakeState.statusReplies = [{ ok: true, data: { paid: true, pay_status: 'paid' } }];
  r = await pay.payOrder(2);
  ok('拉起收银台用了服务端给的参数', wxCalls.payment.length === 1 && wxCalls.payment[0].package === 'prepay_id=wx_test', JSON.stringify(wxCalls.payment[0] || {}).slice(0, 80));
  ok('timeStamp 传字符串（微信要求）', typeof wxCalls.payment[0].timeStamp === 'string');
  ok('服务端确认入账 → paid=true', r.paid === true);

  // 3.3 用户取消支付 → 不算失败，可重来
  requestPaymentResult = 'cancel';
  fakeState.statusReplies = [];
  r = await pay.payOrder(3);
  ok('用户取消 → cancelled=true（不是 error）', r.cancelled === true, JSON.stringify(r));
  requestPaymentResult = 'ok';

  // 3.4 ★ 微信说成功但服务端还没入账 → pending（绝不能当已支付）
  fakeState.statusReplies = []; // 一直返回 paid:false
  r = await pay.payOrder(4, { silent: true });
  ok('★ 收银台成功但服务端未入账 → pending=true（不谎报已支付）', r.pending === true && r.paid === false, JSON.stringify(r));

  // 3.5 服务端报错（未开通支付）
  fakeState.payOrderThrows = Object.assign(new Error('未开通支付'), { code: 'PAY_DISABLED' });
  r = await pay.payOrder(5);
  ok('未开通支付 → 明确文案', r.paid === false && /未开通/.test(r.error || ''), JSON.stringify(r));
  fakeState.payOrderThrows = null;

  // 3.6 服务端没给 pay_params
  fakeState.payOrderReply = { ok: true, data: {} };
  r = await pay.payOrder(6);
  ok('缺支付参数 → 报错不放行', r.paid === false && !!r.error, JSON.stringify(r));

  console.log('\n--- 4) 下单后的统一入口 handleAfterCreate ---');
  wxCalls.modal.length = 0;
  r = await pay.handleAfterCreate({ id: 7, need_pay: false, total_price: 50 });
  ok('未开通支付的订单 → 直接跳过（行为与历史一致）', r.skipped === true && wxCalls.modal.length === 0);

  // 需要支付 + 用户在确认框点「立即支付」
  fakeState.payOrderReply = { ok: true, data: { pay_params: PAY_PARAMS } };
  fakeState.statusReplies = [{ ok: true, data: { paid: true } }];
  r = await pay.handleAfterCreate({ id: 8, need_pay: true, total_price: 50 }, 'booking');
  ok('需要支付 → 先弹确认（含 15 分钟说明）', wxCalls.modal.some((m) => /15 分钟/.test(m.content || '')), JSON.stringify(wxCalls.modal).slice(0, 120));
  ok('确认后完成支付', r.paid === true);

  console.log('\n--- 5) api 层有支付三件套 ---');
  const apiSrc = read('api/index.js');
  ok('payConfig（探测是否开通）', /payConfig:\s*\(\)\s*=>\s*request\(\{\s*url:\s*'\/api\/pay\/config'/.test(apiSrc));
  ok('payOrder（发起支付）', /payOrder:.*\/api\/orders\/\$\{id\}\/pay/.test(apiSrc));
  ok('payStatus（查状态，支持 sync 主动查单）', /payStatus:.*\/api\/pay\/status\/\$\{id\}/.test(apiSrc) && /sync=1/.test(apiSrc));

  console.log('\n--- 6) 页面接上了支付 ---');
  const bookJs = read('pages/book/book.js');
  ok('约场下单后：收集 need_pay 订单', /needPay\.push/.test(bookJs) && /d\.need_pay/.test(bookJs));
  ok('约场下单后：逐单调起支付', /pay\.payOrder\(/.test(bookJs));
  ok('约场：稍后支付也能走（不阻断下单）', /稍后支付/.test(bookJs));

  const promoJs = read('pages/promo-detail/promo-detail.js');
  ok('畅打报名后：走支付', /pay\.handleAfterCreate\(/.test(promoJs));

  const listJs = read('pages/order-list/order-list.js');
  const listWxml = read('pages/order-list/order-list.wxml');
  ok('订单列表：有去支付处理', /async onPay\(/.test(listJs));
  ok('订单列表：倒计时用服务端秒数递减', /payExpireInSec/.test(listJs) && /remainText/.test(listJs));
  ok('订单列表：离开页面停掉计时器（省电）', /onHide\(\)\s*\{\s*this\.stopPayTimer\(\)/.test(listJs));
  ok('订单列表 wxml：待支付提示 + 去支付按钮', /pay-hint/.test(listWxml) && /去支付/.test(listWxml));
  ok('订单列表：取消后显示退款金额', /退款已发起/.test(listJs) && /amount_yuan/.test(listJs));

  const detailJs = read('pages/order-detail/order-detail.js');
  const detailWxml = read('pages/order-detail/order-detail.wxml');
  ok('订单详情：有去支付处理', /async onPay\(/.test(detailJs));
  ok('订单详情 wxml：去支付按钮带金额', /去支付 ¥/.test(detailWxml));
  ok('订单详情：取消后显示退款金额', /退款已发起/.test(detailJs));
  ok('订单详情 wxss：支付样式齐（pay-todo/pay-ok/pay-note）', /\.pay-todo/.test(read('pages/order-detail/order-detail.wxss')) && /\.pay-ok/.test(read('pages/order-detail/order-detail.wxss')) && /\.pay-note/.test(read('pages/order-detail/order-detail.wxss')));
  ok('订单列表 wxss：支付样式齐（pay-hint/pay-link）', /\.pay-hint/.test(read('pages/order-list/order-list.wxss')) && /\.pay-link/.test(read('pages/order-list/order-list.wxss')));

  console.log('\n--- 7) 不重复实现规则（金额/规则只在服务端）---');
  const payJs = read('utils/pay.js');
  ok('pay.js 不自己算退款/扣费比例（规则只在服务端）', !/feePercent|cancel_fee/.test(payJs));
  ok('pay.js 不硬编码金额单位换算到分（服务端管分）', !/amountToFen|Math\.round\(.*100\)/.test(payJs));
  ok('pay.js 不打印/存密钥', !/privateKey|api_v3|mchid/.test(payJs));

  console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
  if (fail) process.exit(1);
})();
