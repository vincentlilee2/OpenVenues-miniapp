// 把约场页网格里选中的时段，合并成「一次预约 = 一个订单」
//
// 输入：selectedKeys —— { "court_id|HH:00": true }
//       rows         —— grid.js 输出的整小时行（用来取每格价格）
// 输出：[{ court_id, start_time, end_time, hours, price }]
//       同一场地 + 连续小时 → 一段；中间断开则拆成多段
//
// 纯函数，不依赖 wx / Page，可在 Node 里直接单测

function nextHour(slot) {
  return String(Number(slot.slice(0, 2)) + 1).padStart(2, '0') + ':00';
}

function groupSelection(selectedKeys, rows) {
  const byCourt = new Map();
  for (const key of Object.keys(selectedKeys || {})) {
    if (!selectedKeys[key]) continue;
    const parts = String(key).split('|');
    const cid = Number(parts[0]);
    const slot = parts[1];
    if (!cid || !/^\d{2}:\d{2}$/.test(slot || '')) continue;
    if (!byCourt.has(cid)) byCourt.set(cid, new Set());
    byCourt.get(cid).add(slot);
  }

  const priceOf = (cid, slot) => {
    for (const r of rows || []) {
      for (const c of r.cells) {
        if (c.cid === cid && c.slot === slot) return c.price || 0;
      }
    }
    return 0;
  };

  const groups = [];
  // 场地按 id 升序，保证下单顺序稳定
  [...byCourt.keys()].sort((a, b) => a - b).forEach((cid) => {
    const slots = [...byCourt.get(cid)].sort();
    let cur = null;
    for (const slot of slots) {
      const price = priceOf(cid, slot);
      if (cur && cur.end_time === slot) {
        // 与上一段首尾相接 → 延长
        cur.end_time = nextHour(slot);
        cur.hours += 1;
        cur.price += price;
      } else {
        if (cur) groups.push(cur);
        cur = { court_id: cid, start_time: slot, end_time: nextHour(slot), hours: 1, price };
      }
    }
    if (cur) groups.push(cur);
  });
  return groups;
}

module.exports = { groupSelection, nextHour };
