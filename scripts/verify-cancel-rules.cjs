// 小程序「取消规则」回归（2026-09-23）
// 用法：node scripts/verify-cancel-rules.cjs
//
// 查两层：
//   ① utils/cancel.js 的判定：后端给了 cancel 就用后端的（权威），没给就按旧行为兜底
//   ② 订单列表/详情页确实走了这套判定，且不再硬编码「2 小时」
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { cancelInfoOf, confirmContentOf, feeTextOf } = require(path.join(ROOT, 'utils', 'cancel.js'));

let pass = 0, fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

const pad = (n) => String(n).padStart(2, '0');
function slotInHours(h) {
  const d = new Date(Date.now() + h * 3600000);
  d.setMinutes(0, 0, 0);
  return { booking_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, start_time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const baseOrder = (h, extra) => Object.assign({ id: 1, status: 'confirmed', total_price: 100, source: 'booking' }, slotInHours(h), extra || {});

console.log('小程序「取消规则」回归');

console.log('\n--- 1) 以后端判定为准 ---');
let o = baseOrder(48, { cancel: { allowed: false, reason: '本场馆不支持取消约场订单', fee_percent: 0, fee_amount: null, deadline_hours: 2 } });
let ci = cancelInfoOf(o);
ok('后端说不行 → 不可取消', ci.allowed === false);
ok('原因原样透传', ci.reason === '本场馆不支持取消约场订单', ci.reason);
ok('用的是后端判定（fromServer）', ci.fromServer === true);

o = baseOrder(48, { cancel: { allowed: true, reason: '免费取消', fee_percent: 0, fee_amount: null, deadline_hours: 2 } });
ci = cancelInfoOf(o);
ok('后端说行 → 可取消', ci.allowed === true);
ok('免费取消时不提扣费', ci.feeText === '' && confirmContentOf(o) === '取消后将释放该时段，确定要取消吗？', confirmContentOf(o));

o = baseOrder(1, { cancel: { allowed: true, reason: '已超过免费取消时间', fee_percent: 30, fee_amount: 30, deadline_hours: 2 } });
ci = cancelInfoOf(o);
ok('逾期可取消（按规则放行）', ci.allowed === true);
ok('文案说明扣 30% 与金额', /¥30\.00/.test(ci.feeText) && /30%/.test(ci.feeText), ci.feeText);
ok('确认弹窗带上扣费说明', /¥30\.00/.test(confirmContentOf(o)) && /确定取消吗/.test(confirmContentOf(o)), confirmContentOf(o));

o = baseOrder(1, { cancel: { allowed: true, reason: '逾期但本馆不扣费', fee_percent: 0, fee_amount: null, deadline_hours: 2 } });
ok('逾期但比例 0 → 不提扣费', cancelInfoOf(o).feeText === '');

o = baseOrder(1, { cancel: { allowed: true, reason: 'x', fee_percent: 20, fee_amount: null, deadline_hours: 2 } });
ok('只给比例没给金额 → 说明「订单金额的 20%」', /订单金额的 20%/.test(cancelInfoOf(o).feeText), cancelInfoOf(o).feeText);

console.log('\n--- 2) 拿不到后端判定时按旧行为兜底（开始前 2 小时）---');
ci = cancelInfoOf(baseOrder(5));
ok('5 小时后 → 可取消', ci.allowed === true);
ok('标记为兜底（非后端）', ci.fromServer === false);
ci = cancelInfoOf(baseOrder(1));
ok('1 小时后 → 不可取消', ci.allowed === false);
ok('兜底原因里写明 2 小时', /2 小时/.test(ci.reason), ci.reason);

console.log('\n--- 3) 边界与异常输入 ---');
ok('订单为 null 不崩', cancelInfoOf(null).allowed === false);
ok('已取消状态 → 不可取消', cancelInfoOf(baseOrder(48, { status: 'cancelled' })).allowed === false);
ok('已完成状态 → 不可取消', cancelInfoOf(baseOrder(48, { status: 'completed' })).allowed === false);
ok('时间格式脏数据不崩', (() => { try { return cancelInfoOf({ id: 9, status: 'confirmed', booking_date: 'x', start_time: 'y' }).allowed === false; } catch (e) { return false; } })());
ok('feeTextOf(null) 返回空串', feeTextOf(null) === '');

console.log('\n--- 4) 页面确实用了这套判定，且不再硬编码 2 小时 ---');
const listJs = fs.readFileSync(path.join(ROOT, 'pages', 'order-list', 'order-list.js'), 'utf8');
const detailJs = fs.readFileSync(path.join(ROOT, 'pages', 'order-detail', 'order-detail.js'), 'utf8');
const listWxml = fs.readFileSync(path.join(ROOT, 'pages', 'order-list', 'order-list.wxml'), 'utf8');
const detailWxml = fs.readFileSync(path.join(ROOT, 'pages', 'order-detail', 'order-detail.wxml'), 'utf8');
ok('订单列表引入 utils/cancel.js', /require\(['"][^'"]*utils\/cancel\.js['"]\)/.test(listJs));
ok('订单详情引入 utils/cancel.js', /require\(['"][^'"]*utils\/cancel\.js['"]\)/.test(detailJs));
ok('列表页用 cancelInfoOf 判定可取消', /cancelInfoOf\(/.test(listJs) && /cancelable:\s*ci\.allowed/.test(listJs));
ok('详情页用 cancelInfoOf 判定可取消', /cancelInfoOf\(/.test(detailJs) && /canCancel:\s*ci\.allowed/.test(detailJs));
ok('列表页不再硬编码 2 小时窗口', !/2 \* 3600 \* 1000/.test(listJs));
ok('详情页不再硬编码 2 小时窗口', !/2 \* 3600 \* 1000/.test(detailJs));
ok('两页的确认弹窗都带扣费说明', /confirmContentOf\(/.test(listJs) && /confirmContentOf\(/.test(detailJs));
ok('列表页展示不可取消的原因', /cancelHint/.test(listWxml));
ok('详情页展示不可取消的原因', /cancelHint/.test(detailWxml));

console.log(`\n${fail === 0 ? `✓ 全部通过（${pass} 项）` : `✗ ${fail} 项失败`}`);
process.exit(fail ? 1 : 0);
