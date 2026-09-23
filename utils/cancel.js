// 取消规则（小程序端）—— 与后端 lib/cancelRules.js 同一套语义
//
// 权威判定在**后端**：/api/orders/my 与 /api/orders/:id 都会返回每笔订单的
//   cancel: { allowed, reason, fee_percent, fee_amount, deadline_hours }
// 所以这里**优先用后端给的结果**；只有拿不到该字段时（旧后端/缓存）才按旧的
// 「开始前 2 小时内不允许取消」兜底，保证不会因为字段缺失把取消入口误开。

var DEFAULT_FALLBACK_HOURS = 2;

function isActive(status) {
  return ['pending', 'confirmed'].indexOf(status) >= 0;
}

function feeTextOf(cancel) {
  if (!cancel) return '';
  if (cancel.fee_amount !== null && cancel.fee_amount !== undefined && cancel.fee_percent > 0) {
    return '将扣除 ¥' + Number(cancel.fee_amount).toFixed(2) + '（订单金额的 ' + cancel.fee_percent + '%）';
  }
  if (cancel.fee_percent > 0) return '将扣除订单金额的 ' + cancel.fee_percent + '%';
  return '';
}

/**
 * 一笔订单的取消信息。
 * @returns {{allowed:boolean, reason:string, feePercent:number, feeText:string, fromServer:boolean}}
 */
function cancelInfoOf(order, now) {
  now = now || Date.now();
  if (!order) return { allowed: false, reason: '订单不存在', feePercent: 0, feeText: '', fromServer: false };
  if (!isActive(order.status)) {
    return { allowed: false, reason: '当前状态不可取消', feePercent: 0, feeText: '', fromServer: false };
  }
  // 1) 后端判定优先（按场馆配置，权威）
  if (order.cancel && typeof order.cancel.allowed === 'boolean') {
    return {
      allowed: !!order.cancel.allowed,
      reason: order.cancel.reason || '',
      feePercent: order.cancel.fee_percent || 0,
      feeText: feeTextOf(order.cancel),
      fromServer: true,
    };
  }
  // 2) 兜底：旧行为（开始前 2 小时内不允许取消）
  var startAt = new Date(order.booking_date + 'T' + String(order.start_time || '').slice(0, 5) + ':00').getTime();
  var hoursLeft = (startAt - now) / 3600000;
  if (hoursLeft >= DEFAULT_FALLBACK_HOURS) {
    return { allowed: true, reason: '免费取消', feePercent: 0, feeText: '', fromServer: false };
  }
  return {
    allowed: false,
    reason: '距开场不足 ' + DEFAULT_FALLBACK_HOURS + ' 小时，无法取消',
    feePercent: 100,
    feeText: '',
    fromServer: false,
  };
}

/** 取消确认弹窗的正文（把扣费说清楚，别让用户点完才发现） */
function confirmContentOf(order, now) {
  var info = cancelInfoOf(order, now);
  if (!info.allowed) return info.reason || '当前不可取消';
  if (info.feeText) return '取消后将释放该时段。' + info.feeText + '，确定取消吗？';
  return '取消后将释放该时段，确定要取消吗？';
}

module.exports = {
  cancelInfoOf: cancelInfoOf,
  confirmContentOf: confirmContentOf,
  feeTextOf: feeTextOf,
};
