// 会员卡余额支付（2026-09-26）—— 约场 / 约课 / 活动报名 三处共用的**唯一出口**
//
// 用户需求 ③ 的原话：
//   「在小程序端实际进行约课、约场、报名畅打活动时当该服务设置可会员卡时，增加一个会员卡余额支付按钮，
//     选择后提交订单则从该用户的充值卡中按折扣比例扣款并生效订单。如果该用户没有购买会员卡时，
//     可先进入会员卡充值页面，完成充值后可继续执行该订单的扣款和生效」
//   「余额不足时提示会员卡余额不足请充值，或直接支付」
//
// 设计要点：
//   · 用服务端的 `/api/my/usable-cards?venue_id=&service=` 判断**能不能用**（场馆 + 服务类型匹配在服务端算，前端不复制规则）
//   · 不能用卡 / 用户选「直接支付」→ 返回 {skipped}，**交回原来的微信支付流程**（零行为变化）
//   · 余额不足（402 insufficient）→ 弹「会员卡余额不足，请充值或直接支付」两个出口
//   · 没卡 → 直接引导「去办卡充值」（带 from=order，充值成功返回后可继续付这笔单）
//   · 一笔下单可能产生多单（多场地）→ payAll 只弹一次确认，然后逐单扣款；失败的单交回微信流程
const api = require('../api/index.js');

const modal = (o) =>
  new Promise((resolve) => {
    wx.showModal({
      title: o.title,
      content: o.content,
      confirmText: o.confirmText,
      cancelText: o.cancelText,
      showCancel: o.showCancel !== false,
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });

/** 让用户挑一张卡（多于一张时）；返回选中的卡或 null */
const pickCard = (cards) =>
  new Promise((resolve) => {
    if (cards.length === 1) return resolve(cards[0]);
    wx.showActionSheet({
      itemList: cards.map((c) => `${c.name}（余额 ¥${c.balance}）`),
      success: (r) => resolve(cards[r.tapIndex] || null),
      fail: () => resolve(null),
    });
  });

/** 去办卡充值（from=order → 充值成功后返回本页继续） */
function gotoBuyCard() {
  wx.navigateTo({ url: '/pages/my-cards/my-cards?from=order' });
}

/**
 * 尝试用会员卡余额支付若干笔订单。
 * @param {{orders: Array<{id:number,total_price:number}>, venueId:number|string, service:'court'|'course'|'promo'}} opts
 * @returns {Promise<{paidIds:number[], skippedIds:number[], paid:boolean, balanceAfter?:number, reason?:string}>}
 */
async function payAll(opts) {
  const orders = (opts.orders || []).filter((o) => o && o.id);
  const out = { paidIds: [], skippedIds: orders.map((o) => o.id), paid: false };
  if (!orders.length) return out;

  let cards = [];
  try {
    cards = (await api.usableCards(opts.venueId, opts.service)) || [];
  } catch (e) {
    cards = []; // 未登录/网络失败 → 不打扰用户，直接走原支付流程
  }
  const total = orders.reduce((s, o) => s + Number(o.total_price || 0), 0).toFixed(2);

  // —— 没卡：引导办卡（或直接支付）——
  if (!cards.length) {
    const go = await modal({
      title: '还没有会员卡',
      content: `办一张会员卡，用卡余额支付可享折扣（本次 ¥${total}）。也可以直接支付。`,
      confirmText: '去办卡充值',
      cancelText: '直接支付',
    });
    if (go) {
      gotoBuyCard();
      return Object.assign(out, { reason: 'no-card' });
    }
    return Object.assign(out, { reason: 'no-card-declined' });
  }

  // —— 有卡：先问是否用卡支付 ——
  const best = cards[0];
  const tip = cards.length === 1 ? `${best.name}　可用余额 ¥${best.balance}` : `你有 ${cards.length} 张可用会员卡（如 ${best.name} 余额 ¥${best.balance}）`;
  const useCard = await modal({
    title: '用会员卡余额支付？',
    content: `${tip}\n本次应付 ¥${total}，用卡支付可享会员折扣。`,
    confirmText: '用卡支付',
    cancelText: '直接支付',
  });
  if (!useCard) return Object.assign(out, { reason: 'declined' });

  const card = await pickCard(cards);
  if (!card) return Object.assign(out, { reason: 'no-pick' });

  // —— 逐单扣款（一单一流水；失败的单交回微信流程）——
  for (const o of orders) {
    try {
      // ⚠️ api/request.js 已经解包成 data 本体 → 直接读 r.balance_after；
      //    再套一层 r.data 会永远拿不到（本仓实测：余额回显丢了一次）
      const r = await api.payOrderWithCard(o.id, card.id);
      const d = r || {};
      out.paidIds.push(o.id);
      if (d.balance_after !== undefined) out.balanceAfter = d.balance_after;
    } catch (e) {
      const code = e && e.code;
      if (code === 'insufficient') {
        const go = await modal({
          title: '会员卡余额不足',
          content: `「${card.name}」余额 ¥${e.balance !== undefined ? e.balance : card.balance}，本次需要 ¥${e.need !== undefined ? e.need : o.total_price}。可以先去充值，或直接支付。`,
          confirmText: '去充值',
          cancelText: '直接支付',
        });
        if (go) gotoBuyCard();
        return Object.assign(out, { reason: 'insufficient' });
      }
      if (code === 'card_expired' || code === 'service_mismatch' || code === 'venue_mismatch' || code === 'card_inactive') {
        await modal({ title: '这张会员卡不能用于本单', content: (e && e.error) || '请换一张卡或直接支付。', showCancel: false });
        return Object.assign(out, { reason: code });
      }
      await modal({ title: '用卡支付失败', content: (e && e.error) || '请直接支付或稍后重试。', showCancel: false });
      return Object.assign(out, { reason: 'error' });
    }
  }
  out.paid = out.paidIds.length === orders.length;
  out.skippedIds = orders.filter((o) => !out.paidIds.includes(o.id)).map((o) => o.id);
  return out;
}

/** 单笔（报名/单场地预约）用卡支付 */
async function payOne(opts) {
  return payAll({ orders: [opts.order], venueId: opts.venueId, service: opts.service });
}

module.exports = { payAll, payOne };
