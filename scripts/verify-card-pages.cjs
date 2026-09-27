// 办卡充值（会员卡）小程序页面验证 —— 阶段 2
//   用户需求：② 我的 → 办卡充值显示已发布会员卡（精美卡面：金额/名称/小标题，可多张）→ 点卡进详情 + 立即充值
//             ④ 我的 → 我的会员卡（名称/小标题/当前余额）→ 查看 → 余额、消费列表、服务说明
//   手法：真页面文件静态断言 + 假 wx 真调 handler（自己 mock wx.request 返回，驱动 load/onRecharge）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0;
let fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
};

const handlers = { request: null, navs: [], toasts: [], modals: [] };
// 需要登录态的接口（rechargeCard / myCards / myCardDetail / usableCards）会先取 session token（键名 wx_token）；
// 不带 token 时 request.js 会直接 reject（我第一版就漏了这一步，表现为「充值失败，请稍后再试」）。
const storage = { wx_token: 'tok_test', wx_uid: 'u_test' };
global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  navigateTo: (o) => handlers.navs.push(o.url),
  navigateBack: (o) => handlers.navs.push('BACK:' + ((o && o.delta) || 1)),
  redirectTo: (o) => handlers.navs.push('REDIRECT:' + o.url),
  switchTab: (o) => handlers.navs.push('SWITCH:' + o.url),
  showToast: (o) => handlers.toasts.push(o.title),
  showModal: (o) => { handlers.modals.push(o); if (o.success) o.success({ confirm: true }); },
  setNavigationBarTitle: () => {},
  requestPayment: () => {},
  request: (o) => { if (handlers.request) handlers.request(o); },
};
let pageObj = null;
global.Page = (o) => { pageObj = o; };
const loadPage = (rel) => {
  pageObj = null;
  delete require.cache[require.resolve(path.join(ROOT, rel))];
  require(path.join(ROOT, rel));
  return pageObj;
};
const inst = (obj, data) => {
  const i = Object.create(obj);
  i.data = Object.assign({}, data || {});
  i.setData = (d) => Object.assign(i.data, d);
  return i;
};
const json = (data) => ({ statusCode: 200, data: { ok: true, data } });

console.log('\n--- 1) 页面文件与注册 ---');
{
  // 2026-09-27：pages/cards（办卡充值列表）已并入 pages/my-cards，页面数 17 → 16
  for (const p of ['card-detail/card-detail', 'my-cards/my-cards', 'my-card-detail/my-card-detail']) {
    ok(`pages/${p} 四个文件齐全`, ['.js', '.wxml', '.wxss', '.json'].every((ext) => exists(`pages/${p}${ext}`)));
  }
  const app = JSON.parse(read('app.json'));
  for (const p of ['pages/card-detail/card-detail', 'pages/my-cards/my-cards', 'pages/my-card-detail/my-card-detail']) {
    ok(`app.json 注册 ${p}`, app.pages.includes(p));
  }
  ok('页面数 16（原 17 − 合并掉的 cards 页）', app.pages.length === 16, app.pages.length);
}

console.log('\n--- 2) 卡面样式（app.wxss 共用，用户选定的方案 A）---');
{
  const css = read('app.wxss');
  ok('有 .mcard 卡面', /\.mcard\s*\{/.test(css));
  ok('深绿渐变 + 金边', /linear-gradient\(135deg,#2d6235/.test(css) && /border:2rpx solid #c9a961/.test(css));
  ok('金额用金色', /\.mcard \.mcard-amount[^}]*#f0d68c/.test(css));
  ok('名称/小标题/标签/角标都有', ['mcard-name', 'mcard-sub', 'mcard-foot', 'mcard-chip'].every((k) => css.includes(k)));
  ok('过期态降饱和', /\.mcard\.mcard-off/.test(css));
}

console.log('\n--- 3) 「我的」入口（合并为一个「我的会员卡」）---');
{
  const wxml = read('pages/my/my.wxml');
  const i1 = wxml.indexOf('我的订单');
  const i2 = wxml.indexOf('我的会员卡');
  const i4 = wxml.indexOf('意见反馈');
  ok('顺序：我的订单 → 我的会员卡 → 意见反馈', i1 > 0 && i2 > i1 && i4 > i2, `${i1}/${i2}/${i4}`);
  ok('★ 「办卡充值」行已消失（防复发：只留一个入口）', !/li-title">办卡充值/.test(wxml) && !/openCardRecharge/.test(wxml), (wxml.match(/办卡充值/) || [''])[0]);
  ok('★ 会员卡入口只有 1 个（不重复）', (wxml.match(/li-title">我的会员卡/g) || []).length === 1, (wxml.match(/li-title">我的会员卡/g) || []).length);
  ok('我的会员卡绑定 goMyCards', /bindtap="goMyCards"/.test(wxml));
  ok('★ 旧的「功能开发中」占位已消失（防复发）', !/功能开发中/.test(wxml) && !/功能开发中/.test(read('pages/my/my.js')));
  ok('副标题已改成真实文案（开通 + 余额/消费）', /开通会员卡/.test(wxml) && /余额与消费记录/.test(wxml));
  ok('★ 旧 openCardRecharge 处理函数已删除', !/openCardRecharge/.test(read('pages/my/my.js')));

  const my = loadPage('pages/my/my.js');
  const mi = inst(my);
  handlers.navs.length = 0;
  mi.goMyCards();
  ok('goMyCards → /pages/my-cards/my-cards（唯一会员卡入口）', handlers.navs.includes('/pages/my-cards/my-cards'), handlers.navs.join(','));
}

console.log('\n--- 4) api/index.js 接口接线 ---');
{
  const apiSrc = read('api/index.js');
  const checks = [
    ['listCards → GET /api/cards', /listCards:\s*\(\)\s*=>\s*request\(\{\s*url:\s*'\/api\/cards'/],
    ['getCard → GET /api/cards/:id', /getCard:[\s\S]{0,80}\/api\/cards\/\$\{id\}/],
    ['rechargeCard → POST /api/cards/:id/recharge', /rechargeCard:[\s\S]{0,120}\/api\/cards\/\$\{id\}\/recharge[\s\S]{0,60}method:\s*'POST'/],
    ['myCards → GET /api/my/cards', /myCards:\s*\(\)\s*=>\s*request\(\{\s*url:\s*'\/api\/my\/cards'/],
    ['myCardDetail → GET /api/my/cards/:id', /myCardDetail:[\s\S]{0,90}\/api\/my\/cards\/\$\{id\}/],
    ['usableCards → GET /api/my/usable-cards', /usableCards:[\s\S]{0,150}\/api\/my\/usable-cards/],
    ['payOrderWithCard → POST /api/orders/:id/pay-with-card', /payOrderWithCard:[\s\S]{0,150}pay-with-card[\s\S]{0,80}method:\s*'POST'/],
  ];
  for (const [label, re] of checks) ok(label, re.test(apiSrc));
}

(async () => {
console.log('\n--- 5) 合并页「我的会员卡」：上段可开通 + 下段我的卡（真调 load）---');
{
  const src = read('pages/my-cards/my-cards.wxml');
  ok('两段结构：可开通的会员卡 / 我的会员卡', src.includes('可开通的会员卡') && src.includes('我的会员卡'));
  ok('★ 可开通的卡右侧是「我要开通」', /buy-cta">我要开通/.test(src), (src.match(/buy-cta[^>]*>[^<]*/) || [''])[0]);
  ok('★ 「我要开通」是金黄字体（#c9a227）', /\.buy-cta\s*\{[\s\S]{0,260}color:\s*#c9a227/.test(read('pages/my-cards/my-cards.wxss')));
  ok('下段仍是共用卡面 .mcard + 查看', src.includes('mcard-name') && /查看 ›/.test(src));
  ok('★ 旧「办卡充值」列表页已删除', !exists('pages/cards/cards.wxml') && !exists('pages/cards/cards.js'));
  ok('★ app.json 不再注册该页', !read('app.json').includes('pages/cards/cards'));
  ok('cardPay 的"没卡"引导指向合并页', /\/pages\/my-cards\/my-cards\?from=order/.test(read('utils/cardPay.js')));

  const TPLS = [
    { id: 1, name: 'A卡', subtitle: '', price: 1000, discount_text: '无折扣', validity_text: '', services_text: '' },
    { id: 2, name: 'B卡', subtitle: '全馆通用', price: 2000, discount_text: '9 折', validity_text: '有效期：开卡后 1 年', services_text: '订场' },
    { id: 3, name: 'C卡', subtitle: '', price: 5000, discount_text: '8.5 折', validity_text: '', services_text: '' },
  ];
  const serveTpls = (myCards) => {
    handlers.request = (o) => {
      if (/\/api\/cards$/.test(o.url)) return o.success(json(TPLS));
      if (/\/api\/my\/cards$/.test(o.url)) return o.success(json(myCards));
      return o.success(json({}));
    };
  };
  const sleep = () => new Promise((r) => setTimeout(r, 20));
  const p = loadPage('pages/my-cards/my-cards.js');

  // 我持有模板 2 的有效卡 → 上段应只剩 1、3
  serveTpls([{ id: 21, template_id: 2, name: 'B卡', status: 'active', expired: false, balance: 1900, card_no: 'VC2' }]);
  handlers.navs.length = 0;
  const i = inst(p);
  i.onLoad({});
  await sleep();
  ok('★ 上段只列"尚未开通"的卡（已开通的模板被排除）', i.data.available.map((x) => x.id).join(',') === '1,3', i.data.available.map((x) => x.id).join(','));
  ok('下段是我的卡', i.data.mine.length === 1 && String(i.data.mine[0].template_id) === '2');
  ok('有效卡状态文案 = 正常', i.data.mine[0].statusText === '正常' && i.data.mine[0].off === false);
  ok('没卡时不显示"还没有开通"提示', i.data.mine.length === 1);

  // 取消充值订单 → 卡作废 → 该模板回到上段（能再开通一次）
  serveTpls([{ id: 21, template_id: 2, name: 'B卡', status: 'voided', expired: false, balance: 0, card_no: 'VC2' }]);
  const i2 = inst(p);
  i2.onLoad({});
  await sleep();
  ok('★ 卡作废后该模板重新出现在上段（可再开通）', i2.data.available.map((x) => x.id).join(',') === '1,2,3', i2.data.available.map((x) => x.id).join(','));
  ok('作废卡在下段标「已作废」', i2.data.mine[0].statusText === '已作废' && i2.data.mine[0].off === true);

  // 已过期的卡也放回上段（续费/重开）
  serveTpls([{ id: 21, template_id: 2, name: 'B卡', status: 'active', expired: true, balance: 100, card_no: 'VC2' }]);
  const i2b = inst(p);
  i2b.onLoad({});
  await sleep();
  ok('★ 过期卡对应的模板也回到上段', i2b.data.available.map((x) => x.id).join(',') === '1,2,3', i2b.data.available.map((x) => x.id).join(','));

  // 跳转：我要开通 → 卡详情（带 from 透传）；下段点卡 → 卡详情页
  i.buyCard({ currentTarget: { dataset: { id: 3 } } });
  ok('「我要开通」→ /pages/card-detail/card-detail?id=3', handlers.navs.includes('/pages/card-detail/card-detail?id=3'), handlers.navs.join(','));
  handlers.navs.length = 0;
  const i3 = inst(p);
  i3.onLoad({ from: 'order' });
  i3.buyCard({ currentTarget: { dataset: { id: 5 } } });
  ok('from=order 透传下去（充值后回原页继续下单）', handlers.navs.includes('/pages/card-detail/card-detail?id=5&from=order'), handlers.navs.join(','));
  i.openCard({ currentTarget: { dataset: { id: 21 } } });
  ok('下段点卡 → /pages/my-card-detail/my-card-detail?id=21', handlers.navs.includes('/pages/my-card-detail/my-card-detail?id=21'), handlers.navs.join(','));

  // 充值成功返回（onShow）→ 重新拉取，卡从上面"挪到"下面
  serveTpls([{ id: 21, template_id: 2, name: 'B卡', status: 'active', expired: false, balance: 2000, card_no: 'VC2' }]);
  const i4 = inst(p, { available: [], mine: [], loading: false });
  i4.onShow();
  await sleep();
  ok('★ onShow 重新拉取（充值返回后卡自动挪到下段）', i4.data.available.map((x) => x.id).join(',') === '1,3' && i4.data.mine.length === 1, i4.data.available.map((x) => x.id).join(','));
}

console.log('\n--- 6) 卡详情 + 立即充值（含模拟支付确认）---');
{
  const src = read('pages/card-detail/card-detail.wxml');
  ok('有卡面 + 立即充值按钮', src.includes('class="mcard detail-card"') && /立即充值/.test(src));
  ok('展示使用条款与其他说明', /使用条款/.test(src) && /其他说明/.test(src));
  // 2026-09-27 用户要求：点立即充值先弹「模拟微信支付」弹窗（标注商户号未开通），确认后才建单
  ok('★ WXML 有模拟支付弹窗（底部面板 + 遮罩）', /class="pay-mask"/.test(src) && /class="pay-sheet"/.test(src));
  ok('★ 弹窗标注「商户号信息未开通」', /商户号信息未开通/.test(src));
  ok('★ 弹窗写明「模拟支付 / 不会真实扣款」', /模拟支付/.test(src) && /不会真实扣款/.test(src));
  ok('弹窗有金额、卡名、确认支付、取消', /pay-amount/.test(src) && /onConfirmMockPay/.test(src) && /onCancelMockPay/.test(src));
  ok('弹窗样式用微信绿确认按钮（贴近收银台观感）', /#07c160/.test(read('pages/card-detail/card-detail.wxss')));

  const js = read('pages/card-detail/card-detail.js');
  ok('调 rechargeCard', /api\.rechargeCard\(/.test(js));
  ok('★ 先探测 payConfig 再决定是否弹模拟窗', /api\.payConfig\(\)/.test(js) && /if \(!payEnabled\) \{[\s\S]{0,120}showMockPay: true/.test(js));
  ok('★ 探测失败按未开通处理（不会误扣）', /payEnabled = false; \/\/ 探测失败/.test(js));
  ok('★ 走统一支付出口 pay.handleAfterCreate(..., \'card\')', /handleAfterCreate\([\s\S]{0,200}'card'/.test(js));
  ok('支付成功/取消/确认中 三种分支都处理', /res\.paid/.test(js) && /res\.cancelled/.test(js) && /res\.pending/.test(js));
  // from=order：退两页回下单页继续付款（栈 = 下单页 → 我的会员卡 → 卡详情）；
  // delta 超出栈时 fail 兜底回「我的会员卡」（2026-09-27 改成自动返回，不再用模态框）
  ok('★ from=order 时自动退两页回下单页', /backToOrder\) wx\.navigateBack\(\{ delta: 2/.test(js) && /充值成功，返回继续支付/.test(js));
  ok('★ 返回失败时兜底 redirect 到我的会员卡', /const fail = \(\) => wx\.redirectTo\(\{ url: '\/pages\/my-cards\/my-cards' \}\)/.test(js));

  // ① 未配置商户号：点立即充值 → 只弹窗，**不建单**
  let calls = [];
  handlers.modals.length = 0;
  handlers.toasts.length = 0;
  handlers.request = (o) => {
    calls.push(o.url);
    if (/\/api\/pay\/config/.test(o.url)) return o.success(json({ enabled: false }));
    if (/recharge/.test(o.url)) return o.success(json({ order_id: 3, order_no: 'V001', need_pay: false, card: { id: 1, card_no: 'VC1', balance: 2000 } }));
    o.success(json({}));
  };
  const p = loadPage('pages/card-detail/card-detail.js');
  const i = inst(p, { card: { id: 7, name: '畅打尊享卡', price: 2000 } });
  try { await i.onRecharge(); } catch (e) { console.log('     [页面抛错] ' + e.message); }
  ok('★ 点立即充值 → 弹出模拟支付弹窗', i.data.showMockPay === true, JSON.stringify(i.data.showMockPay));
  ok('★ 确认前**没有**建单（用户明确要求：确认后再生成订单）', !calls.some((u) => /recharge/.test(u)), calls.join(','));

  // ② 点「确认支付」→ 这时才建单 + 发卡成功
  handlers.modals.length = 0;
  try { await i.onConfirmMockPay(); } catch (e) { console.log('     [页面抛错] ' + e.message); }
  await new Promise((r) => setTimeout(r, 10));
  ok('★ 确认后才建单', calls.some((u) => /recharge/.test(u)), calls.join(','));
  ok('弹窗已收起', i.data.showMockPay === false);
  ok('测试直通：提示「充值成功」', handlers.toasts.some((t) => /充值成功/.test(t)), 'toasts=' + JSON.stringify(handlers.toasts));
  // 用户 2026-09-27：『点击了立即充值并在弹窗中确定后，要返回我的会员卡页面，不要还停留在充值页面』
  ok('★ 不再弹"充值成功"模态框（模态框可能把人留在充值页）', !handlers.modals.some((m) => /充值成功/.test(m.title)), JSON.stringify(handlers.modals.map((m) => m.title)));
  ok('★ 确认后**不点任何按钮**也会自动返回（还没到点就还没返回）', !handlers.navs.some((n) => /BACK/.test(n)), handlers.navs.join(','));
  await new Promise((r) => setTimeout(r, 1000));
  ok('★ 自动返回上一页 = 我的会员卡（delta=1）', handlers.navs.includes('BACK:1'), handlers.navs.join(','));

  // ③ 点「取消」→ 什么都不发生（不建单）
  calls = [];
  handlers.modals.length = 0;
  handlers.toasts.length = 0;
  const i2 = inst(p, { card: { id: 7, name: '畅打尊享卡', price: 2000 } });
  await i2.onRecharge();
  i2.onCancelMockPay();
  ok('★ 取消后不建单', !calls.some((u) => /recharge/.test(u)), calls.join(','));
  ok('取消给出提示', handlers.toasts.some((t) => /已取消/.test(t)), JSON.stringify(handlers.toasts));
  ok('取消后弹窗收起', i2.data.showMockPay === false);

  // ④ 已配置商户号 → 不弹模拟窗，直接走真收银台
  calls = [];
  handlers.modals.length = 0;
  handlers.request = (o) => {
    calls.push(o.url);
    if (/\/api\/pay\/config/.test(o.url)) return o.success(json({ enabled: true }));
    if (/recharge/.test(o.url)) return o.success(json({ order_id: 9, order_no: 'V009', need_pay: true, total_price: 2000 }));
    if (/\/api\/orders\/9\/pay/.test(o.url)) return o.success(json({ pay_params: null }));
    o.success(json({}));
  };
  const i3 = inst(p, { card: { id: 7, name: '畅打尊享卡', price: 2000 } });
  await i3.onRecharge();
  ok('★ 已开通支付 → 不弹模拟窗', !i3.data.showMockPay, String(i3.data.showMockPay));
  ok('已开通支付 → 直接建单走真支付', calls.some((u) => /recharge/.test(u)), calls.join(','));
}

console.log('\n--- 7) 我的会员卡 + 卡详情（余额/消费列表/服务说明）---');
{
  const mySrc = read('pages/my-cards/my-cards.wxml');
  ok('显示当前余额', mySrc.includes('当前余额'));
  ok('显示卡号与场馆', mySrc.includes('item.card_no') && mySrc.includes('item.venue_name'));
  ok('有「查看 ›」', /查看/.test(mySrc));
  // 2026-09-27 合并后：空态不再是「还没有会员卡 + 去办卡充值按钮」，改成两段式提示
  ok('★ 下段空态指向「我要开通」（不再是去办卡充值按钮）', /还没有开通会员卡/.test(mySrc) && /我要开通/.test(mySrc));
  ok('★ 全空时给中性空态（没有可开通的卡）', /暂时没有会员卡/.test(mySrc));

  const detSrc = read('pages/my-card-detail/my-card-detail.wxml');
  ok('详情显示余额/累计充值/已消费', detSrc.includes('当前余额') && detSrc.includes('累计充值') && detSrc.includes('已消费'));
  ok('有消费列表', /消费列表/.test(detSrc) && detSrc.includes('item.amountText'));
  ok('有服务说明（条款/说明）', /服务说明/.test(detSrc) && /其他说明/.test(detSrc));
  const detJs = read('pages/my-card-detail/my-card-detail.js');
  ok('流水类型中文化', /recharge: '充值'/.test(detJs) && /consume: '消费'/.test(detJs));
  ok('★ 时间走 time.toLocalText（避免差 8 小时）', /time\.toLocalText\(t\.created_at\)/.test(detJs));
  ok('★ WXML 里没有 {{a < b}} 写法（会被当标签）', !/\{\{[^}]*<[^}]*\}\}/.test(detSrc), (detSrc.match(/\{\{[^}]*<[^}]*\}\}/) || [])[0]);
  ok('折扣文案在 JS 侧算好', /discountText/.test(detJs) && /card\.discountText/.test(detSrc));

  handlers.request = (o) => o.success(json({
    id: 1, card_no: 'VC1', name: '畅打尊享卡', balance: 1905, total: 2000, consumed: 95, discount: 0.95,
    services_text: '订场', venue_name: '全部场馆', terms: '仅限本人使用', notes: '客服 400',
    activated_at: '2026-09-26 02:00:00', expires_at: '2027-09-26T02:00:00.000Z',
    transactions: [{ id: 1, type: 'consume', amount: -95, balance_after: 1905, original: 100, discount: 0.95, note: '订单 V1 卡余额支付', created_at: '2026-09-26 03:00:00' }],
  }));
  const p = loadPage('pages/my-card-detail/my-card-detail.js');
  const i = inst(p);
  i.onLoad({ id: 1 });
  await new Promise((r) => setTimeout(r, 10));
  ok('load() 拉到卡详情', i.data.card && i.data.card.balance === 1905, JSON.stringify(i.data.card && i.data.card.balance));
  ok('流水派生出中文类型与带符号金额', i.data.txs.length === 1 && i.data.txs[0].typeText === '消费' && i.data.txs[0].amountText === '-¥95.00', JSON.stringify(i.data.txs[0] || {}));
  ok('流水金额方向标记（消费=出账）', i.data.txs[0].inMoney === false);
  ok('折扣派生文案', /9\.5/.test(i.data.card.discountText), i.data.card.discountText);
  ok('时间已本地化（不是原始 UTC 串）', !/^2026-09-26 03:00:00$/.test(i.data.txs[0].timeText), i.data.txs[0].timeText);
}

console.log('\n--- 8) 支付文案（card 分支）---');
{
  const pay = read('utils/pay.js');
  ok('handleAfterCreate 支持 card', /kind === 'card'/.test(pay));
  ok('充值文案正确（不是「预约成功」）', /充值订单已创建，需要支付/.test(pay) && /充值金额/.test(pay));
}

console.log('\n--- 9) 会员卡余额支付（阶段 3：约场 / 报名 / 订单页）---');
{
  // 共用出口
  const cp = read('utils/cardPay.js');
  ok('utils/cardPay.js 存在', /const cards = \(await api\.usableCards/.test(cp) === false && /api\.usableCards\(/.test(cp));
  ok('用服务端算可用卡（venue + service）', /api\.usableCards\(opts\.venueId, opts\.service\)/.test(cp));
  ok('用卡支付调 payOrderWithCard', /api\.payOrderWithCard\(o\.id, card\.id\)/.test(cp));
  ok('余额不足（402 insufficient）有专门分支', /code === 'insufficient'/.test(cp) && /会员卡余额不足/.test(cp));
  ok('没卡时引导去合并页（带 from=order）', /还没有会员卡/.test(cp) && /\/pages\/my-cards\/my-cards\?from=order/.test(cp));
  ok('用户选「直接支付」→ 返回 skipped 交回原流程', /reason: 'declined'/.test(cp));
  ok('多张卡时让用户选（actionSheet）', /showActionSheet/.test(cp));

  // 两处接线
  const book = read('pages/book/book.js');
  ok('约场页引入 cardPay', /require\('\.\.\/\.\.\/utils\/cardPay\.js'\)/.test(book));
  ok('约场页下单后先试卡支付（service=court）', /cardPay\.payAll\(\{ orders: needPay, venueId: this\._venueId, service: 'court' \}\)/.test(book));
  ok('★ 没用卡的单交回微信支付（不重复扣）', /const rest = needPay\.filter\(\(o\) => !cp\.paidIds\.includes\(o\.id\)\)/.test(book));
  ok('卡支付成功直接收尾（不再弹微信确认）', /if \(!rest\.length\) \{/.test(book));

  const pd = read('pages/promo-detail/promo-detail.js');
  ok('报名页引入 cardPay', /require\('\.\.\/\.\.\/utils\/cardPay\.js'\)/.test(pd));
  ok('报名页按活动类型选服务（课程=course / 畅打=promo）', /kind === 'course' \? 'course' : 'promo'/.test(pd));
  ok('报名页卡支付成功后不再走微信', /cp\.paid[\s\S]{0,120}已用会员卡支付/.test(pd));

  // 订单页 card 分支（用户需求 ⑩）
  const olj = read('pages/order-list/order-list.js');
  const odw = read('pages/order-detail/order-detail.wxml');
  ok('订单列表：source=card 显示办卡充值 + 卡名', /source === 'card' \? `💳 办卡充值：\$\{o\.card_title/.test(olj));
  ok('订单列表：卡单时间显示为「日期 · 充值」', /o\.source === 'card' \? `\$\{o\.booking_date\} · 充值`/.test(olj));
  ok('订单列表 wxml：卡单走会员卡充值行', /item\.source === 'card'[\s\S]{0,60}会员卡充值/.test(read('pages/order-list/order-list.wxml')));
  ok('订单列表 wxml：卡单不显示时长', /wx:if="\{\{item\.source !== 'card'\}\}"/.test(read('pages/order-list/order-list.wxml')));
  ok('订单详情：card 分支（类型/会员卡/下单日期，无场馆场地时段）', /order\.source === 'card'[\s\S]{0,200}办卡充值[\s\S]{0,200}会员卡[\s\S]{0,120}下单日期/.test(odw));
  ok('订单详情：来源三分支（card / promo / 散客预约）', /order\.source === 'card'[\s\S]{0,200}wx:elif="\{\{order\.source === 'promo'\}\}"/.test(odw));

  // 真调 cardPay 三条分支
  const cpMod = require(path.join(ROOT, 'utils/cardPay.js'));
  // ① 没卡 → 引导去办卡（选「去办卡充值」）
  handlers.navs.length = 0;
  handlers.modals.length = 0;
  let asked = [];
  handlers.request = (o) => { asked.push(o.url); o.success(json([])); };
  global.wx.showModal = (o) => { handlers.modals.push(o); if (o.success) o.success({ confirm: true }); };
  let r1 = await cpMod.payOne({ order: { id: 11, total_price: 100 }, venueId: 3, service: 'court' });
  ok('没卡 → 弹「还没有会员卡」', handlers.modals.some((m) => /还没有会员卡/.test(m.title)), JSON.stringify(handlers.modals.map((m) => m.title)));
  ok('没卡 → 跳合并页（from=order）', handlers.navs.includes('/pages/my-cards/my-cards?from=order'), handlers.navs.join(','));
  ok('没卡 → 返回 skipped（不阻塞原支付流程）', r1.paid === false && /no-card/.test(r1.reason || ''), JSON.stringify(r1));

  // ② 有卡 → 用户确认 → 扣款成功
  handlers.navs.length = 0; handlers.modals.length = 0;
  handlers.request = (o) => {
    if (/usable-cards/.test(o.url)) return o.success(json([{ id: 5, name: '畅打尊享卡', balance: 1905, discount: 0.95 }]));
    if (/pay-with-card/.test(o.url)) return o.success(json({ paid: 95, balance_after: 1810 }));
    o.success(json({}));
  };
  const r2 = await cpMod.payOne({ order: { id: 12, total_price: 100 }, venueId: 3, service: 'court' });
  ok('有卡 → 弹「用会员卡余额支付？」', handlers.modals.some((m) => /用会员卡余额支付/.test(m.title)), JSON.stringify(handlers.modals.map((m) => m.title)));
  ok('有卡 → 扣款成功并回报余额', r2.paid === true && r2.balanceAfter === 1810, JSON.stringify(r2));

  // ③ 余额不足 → 提示充值或直接支付
  handlers.navs.length = 0; handlers.modals.length = 0;
  handlers.request = (o) => {
    if (/usable-cards/.test(o.url)) return o.success(json([{ id: 5, name: '畅打尊享卡', balance: 50, discount: 0.95 }]));
    if (/pay-with-card/.test(o.url)) {
      // ⚠️ HTTP 402 是「有响应」的错误 → wx.request 走 success（带 statusCode），不是 fail。
      //    我第一版写成 o.fail(...) → 断言拿到的是「用卡支付失败」而不是余额不足。
      return o.success({ statusCode: 402, data: { ok: false, error: '会员卡余额不足，请充值或直接支付', code: 'insufficient', balance: 50, need: 95 } });
    }
    o.success(json({}));
  };
  const r3 = await cpMod.payOne({ order: { id: 13, total_price: 100 }, venueId: 3, service: 'court' });
  ok('余额不足 → 弹「会员卡余额不足」', handlers.modals.some((m) => /会员卡余额不足/.test(m.title)), JSON.stringify(handlers.modals.map((m) => m.title)));
  ok('余额不足文案给两个出口（充值 / 直接支付）', handlers.modals.some((m) => /充值/.test(m.content) && /直接支付/.test(m.content)), handlers.modals.map((m) => m.content).join(' | ').slice(0, 160));
  ok('余额不足 → 未支付（交回微信）', r3.paid === false && r3.reason === 'insufficient', JSON.stringify(r3));
}

console.log('\n--- 10) 取消充值订单 → 卡作废（"选 2"，2026-09-27）---');
{
  const cancel = require('../utils/cancel.js');
  const cardOrder = { source: 'card', status: 'pending', booking_date: '', start_time: '00:00', total_price: 2000 };
  // 充值订单没有时段 → 服务端/兜底都必须放行（此前被"距开场不足 2 小时"永久挡住）
  const ci = cancel.cancelInfoOf(cardOrder);
  ok('★ 充值订单可取消（不受开场规则影响）', ci.allowed === true, JSON.stringify(ci));
  const txt = cancel.confirmContentOf(cardOrder);
  ok('★ 取消确认文案说明"卡将作废"', /作废/.test(txt), txt);
  ok('★ 文案说明未消费额度退回/已消费不退', /未消费额度/.test(txt) && /已消费部分不退/.test(txt), txt);
  // 普通订单不被这段文案污染
  const normalTxt = cancel.confirmContentOf({
    source: 'hourly', status: 'confirmed', booking_date: '2099-01-01', start_time: '10:00', total_price: 100,
  });
  ok('普通订单仍是原取消文案', !/会员卡/.test(normalTxt), normalTxt);

  // 卡状态文案：voided → 已作废（我的会员卡列表 + 详情）
  ok('★ 我的会员卡列表有「已作废」文案', /voided:\s*'已作废'/.test(read('pages/my-cards/my-cards.js')));
  ok('★ 卡详情有「已作废」文案与提示块', /voided:\s*'已作废'/.test(read('pages/my-card-detail/my-card-detail.js')) && /class="void-tip"/.test(read('pages/my-card-detail/my-card-detail.wxml')));
  ok('卡详情 chip 用 statusText（不再是二选一）', /mcard-chip">\{\{card\.statusText\}\}/.test(read('pages/my-card-detail/my-card-detail.wxml')));
}

console.log(`\n办卡充值（阶段 2 小程序页面）：${pass} 过 / ${fail} 失败`);
if (fail) process.exit(1);
})();
