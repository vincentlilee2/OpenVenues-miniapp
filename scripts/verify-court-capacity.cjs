// 小程序端「场地容量选填」回归（2026-09-23）
// 用法：node scripts/verify-court-capacity.cjs
//
// 后端把容量留空存成 NULL 并原样返回；小程序端必须**不显示**「容纳 N 人」。
// WXML 的渲染没法在这里跑，所以这里做两件能真查的事：
//   1) 静态查 wxml：那行「容纳」必须带 wx:if，且条件语义 == max_capacity > 0
//   2) 用同一条件表达式对真实取值（null / 0 / undefined / 4 / 6）逐个求值，确认开关正确
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WXML = path.join(ROOT, 'pages', 'venue-detail', 'venue-detail.wxml');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  →  ' + extra : '')); }
};

console.log('小程序「场地容量选填」回归');

const wxml = fs.readFileSync(WXML, 'utf8');

// 1) 那行容量必须存在，且必须有条件
const capLine = wxml.split('\n').find((l) => l.includes('容纳'));
ok(!!capLine, '找到「容纳」那一行', capLine);
ok(/wx:if=/.test(capLine), '「容纳」那一行带 wx:if 条件（不会无条件渲染）', capLine && capLine.trim());
ok(/item\.max_capacity\s*>\s*0/.test(capLine), '条件语义是 item.max_capacity > 0', capLine && capLine.trim());

// 2) 不能有第二处无条件显示容量的地方
const unconditional = wxml.split('\n').filter((l) => l.includes('容纳') && !/wx:if=/.test(l));
ok(unconditional.length === 0, '没有其他地方无条件显示容量', unconditional.join(' | '));

// 3) 把条件抽出来，对真实取值求值
const expr = (capLine.match(/wx:if="\{\{([^}]+)\}\}"/) || [])[1];
ok(!!expr, '能解析出条件表达式', expr);
const evalCond = new Function('item', `return (${expr});`);
const cases = [
  [null, false, '后台留空 → NULL'],
  [undefined, false, '字段缺失'],
  [0, false, '0 视为未设置'],
  ['', false, '空字符串'],
  [4, true, '正常值 4'],
  [6, true, '正常值 6'],
];
for (const [val, want, label] of cases) {
  let got;
  try { got = !!evalCond({ max_capacity: val }); } catch (e) { got = 'ERR:' + e.message; }
  ok(got === want, `「${label}」(${JSON.stringify(val)}) → ${want ? '显示' : '不显示'}`, got);
}

console.log(`\n${fail === 0 ? `✓ 全部通过（${pass} 项）` : `✗ ${fail} 项失败`}`);
process.exit(fail ? 1 : 0);
