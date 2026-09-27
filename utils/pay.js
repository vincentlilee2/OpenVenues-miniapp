// 小程序支付收口（2026-09-24）
//
// 铁律（踩过就会掉钱的坑）：
//   1) **结果以服务端为准**：wx.requestPayment 的 success 只代表"用户在收银台走完了"，
//      真正入账要等微信回调到服务端 —— 所以支付后一定要回服务端查一次，别拿 success 直接当已支付。
//   2) **参数只能来自服务端**：prepay_id 与 paySign 都由服务端签好（商户私钥不下发小程序）。
//   3) **失败要能重来**：用户取消支付不算失败，订单还在 15 分钟锁内，可以再点"去支付"。
//   4) **倒计时用服务端给的秒数**（pay_expire_in_sec），不要自己解析时间串（时区会差 8 小时）。
const api = require('../api/index.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 调起微信收银台（Promise 化） */
function requestPayment(payParams) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(payParams.timeStamp),
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success: resolve,
      fail: reject,
    });
  });
}

/**
 * 完整支付一笔订单
 * @param {number} orderId
 * @param {object} [opts]
 * @param {boolean} [opts.silent] 不弹"支付确认中"提示（调用方自己处理）
 * @returns {Promise<{paid:boolean, cancelled?:boolean, pending?:boolean, error?:string}>}
 */
async function payOrder(orderId, opts = {}) {
  let r;
  try {
    r = await api.payOrder(orderId);
  } catch (e) {
    // 未开通支付 / 订单已关闭 / 已支付等，服务端会带 code
    if (e && e.code === 'PAY_DISABLED') return { paid: false, error: '本店尚未开通在线支付' };
    return { paid: false, error: (e && (e.error || e.errMsg)) || '发起支付失败' };
  }
  // ⚠️ api/request.js **已经把 {ok,data} 解包成了 data 本体** —— 这里再套一层 .data 会永远拿到
  //    undefined（2026-09-27 实测：配了商户号后真支付也走成「服务端未返回支付参数」——整条真支付链路
  //    因为这段一直没被真跑过而带病上线）。同类坑在本仓出现过三次，见 skill。
  const d = r || {};
  if (d.already_paid) return { paid: true };
  // 模拟支付模式（2026-09-27）：服务端没配商户号但开了模拟模式 → 弹"模拟收银台"，
  // 确认后调 mock-confirm 入账（服务端复用真实回调的入账逻辑，只是不真扣钱）。
  if (d.mock) return mockSettle(orderId, d);
  if (!d.pay_params) return { paid: false, error: '服务端未返回支付参数' };

  try {
    await requestPayment(d.pay_params);
  } catch (e) {
    const msg = (e && e.errMsg) || '';
    if (/cancel/i.test(msg)) return { paid: false, cancelled: true };
    return { paid: false, error: '支付未完成：' + (msg || '未知原因') };
  }

  // 以服务端为准：回调可能延迟 1-3 秒到，最多轮询 6 次（后 3 次让服务端主动查单兜底）
  for (let i = 0; i < 6; i++) {
    try {
      const s = await api.payStatus(orderId, i >= 3);
      if (s && s.paid) return { paid: true, data: s }; // 同样是已解包的响应（见上面 payOrder 的注释）
    } catch (e) {
      // 忽略：继续重试
    }
    await sleep(i < 3 ? 800 : 1500);
  }
  if (!opts.silent) {
    wx.showToast({ title: '支付结果确认中，请稍后在订单里查看', icon: 'none', duration: 2600 });
  }
  return { paid: false, pending: true };
}

/**
 * 模拟收银台（2026-09-27 起启用；仅在服务端「模拟支付模式」开启且未配置商户号时才会走到）
 * 形态照微信收银台做，但**必须写明这是模拟支付**，避免误以为真扣了钱。
 * @param {number} orderId
 * @param {object} [info] 服务端返回的金额信息（amount_yuan）
 * @returns {Promise<{paid:boolean, cancelled?:boolean, mock?:boolean, error?:string}>}
 */
async function mockSettle(orderId, info = {}) {
  const amount = info.amount_yuan != null ? `¥${info.amount_yuan}` : '';
  const okGo = await new Promise((resolve) => {
    wx.showModal({
      title: '微信支付（模拟）',
      content: `${amount ? `支付金额 ${amount}\n\n` : ''}⚠️ 商户号未开通 —— 当前为「模拟支付」，不会真实扣款。\n确认后订单立即生效（相当于已付款）。`,
      confirmText: '确认支付',
      cancelText: '取消',
      confirmColor: '#07c160',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!okGo) return { paid: false, cancelled: true, mock: true };
  try {
    const r = await api.mockConfirmOrder(orderId);
    const dd = r || {}; // 已解包
    return { paid: true, mock: true, data: dd };
  } catch (e) {
    return { paid: false, mock: true, error: (e && (e.error || e.message)) || '模拟支付失败' };
  }
}

/**
 * 下单/报名/充值后统一走这里：需要支付就确认 + 调起，不需要就返回 { skipped: true }
 * @param {object} created 下单接口返回的 data（含 id / need_pay / total_price）
 * @param {'booking'|'promo'|'card'} kind
 */
async function handleAfterCreate(created, kind = 'booking') {
  if (!created || !created.need_pay) return { skipped: true };
  const title = kind === 'promo' ? '报名成功，需要支付' : kind === 'card' ? '充值订单已创建，需要支付' : '预约成功，需要支付';
  const content =
    kind === 'promo'
      ? `报名费 ¥${created.total_price}。请在 15 分钟内完成支付，超时名额自动释放。`
      : kind === 'card'
        ? `充值金额 ¥${created.total_price}。请在 15 分钟内完成支付，支付成功后卡额度立即到账；超时订单自动关闭。`
        : `场地费 ¥${created.total_price}。请在 15 分钟内完成支付，超时自动关闭并释放场地。`;
  const go = await new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: '立即支付',
      cancelText: '稍后支付',
      success: (res) => resolve(res.confirm),
    });
  });
  if (!go) return { skipped: true, defered: true };
  return payOrder(created.id);
}

/** 服务端给的剩余秒数 → 「剩余 14:59」文案；<=0 返回空串 */
function remainText(sec) {
  const s = Number(sec);
  if (!isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `剩余 ${m}:${String(ss).padStart(2, '0')}`;
}

/** 支付状态徽标文案（订单列表/详情共用） */
function payBadgeText(order) {
  const st = order && order.pay_status;
  if (!st) return '';
  if (st === 'unpaid') return '待支付';
  if (st === 'paid') return '已支付 ¥' + (order.paid_amount_yuan || ((order.paid_amount_fen || 0) / 100).toFixed(2));
  if (st === 'refunded') return '已退款';
  if (st === 'closed') return '已关闭';
  return '';
}

module.exports = { payOrder, handleAfterCreate, remainText, payBadgeText, requestPayment, mockSettle };
