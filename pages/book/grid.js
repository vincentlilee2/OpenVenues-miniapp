// 约场网格布局引擎（纯函数，不依赖 wx / Page，可在 Node 里直接跑单测）
//
// 输入：allSlots —— 各 court 的 30 分钟 slot 扁平数组，每项含
//        { court_id, start_time, end_time, price, status, promo? }
//       courts   —— [{ id, name, max_capacity }]
//       selectedSet —— Set("court_id|HH:00")
// 输出：{ heads, rows, promos, geo }
//   heads  —— 表头（场地名）绝对定位
//   rows   —— 整小时行：[{ key, hour, label, top, cells:[...] }]
//   promos —— 畅打浮层：在自己的场地列内纵向跨 rowSpan 小时
//   geo    —— 画布尺寸，wxml 直接吃
//
// 关键设计：所有元素都是 position:absolute + JS 算出的 left/top/width/height，
// 不用 CSS Grid / flex 流式布局——小程序对 grid 跨行跨列支持不稳，
// 混用「显式 grid-row」和「自动流」会把格子甩进隐式列，造成整片错位。

const DEFAULT_GEO = {
  timeW: 108,      // 时间列宽 (rpx)
  rowH: 104,       // 每小时行高 (rpx)
  headH: 56,       // 表头高 (rpx)
  gap: 6,          // 格子间隙 (rpx)
  minCourtW: 158,  // 场地列最小宽 (rpx)
  screenW: 750,    // 设计稿宽 (rpx)
  sidePad: 24,     // 页面左右内边距合计 (rpx)
};

function buildRows(allSlots, courts, selectedSet, geoOpt) {
  const geo = Object.assign({}, DEFAULT_GEO, geoOpt || {});
  const list = courts || [];
  const n = Math.max(1, list.length);

  // 场地列宽：够宽就撑满屏，不够就横向滚动
  const avail = geo.screenW - geo.sidePad - geo.timeW;
  const courtW = Math.max(geo.minCourtW, Math.floor(avail / n));
  const gridW = geo.timeW + courtW * n;
  const halfGap = Math.floor(geo.gap / 2);

  const colOf = {};
  list.forEach((c, i) => { colOf[c.id] = i; });

  // ---- 1) 畅打块：按 (court_id, 起-止) 聚合 ----
  const promoMap = new Map();
  for (const s of allSlots) {
    if (!s.promo) continue;
    // 注意：必须用 promo 自己的起止时间，不能用 30 分钟 slot 的起止
    // （slot 的 end_time 是 19:30，会按小时截成 19，导致一个 2 小时畅打被拆成 4 块）
    const sh = String(s.promo.start_time).slice(0, 2);
    const eh = String(s.promo.end_time).slice(0, 2);
    const key = s.court_id + '|' + sh + '-' + eh;
    if (!promoMap.has(key)) {
      promoMap.set(key, {
        cid: s.court_id, startHour: sh, endHour: eh,
        name: s.promo.title,
        signed: s.promo.signed_up,
        maxCap: s.promo.max_capacity,
        pricePerPerson: s.promo.price_per_person,
        minParticipants: s.promo.min_participants,
        promoId: s.promo.id,
      });
    }
  }
  // 被畅打占用的 (court|HH) —— 这些格子不画，交给浮层
  const promoCell = new Set();
  for (const p of promoMap.values()) {
    for (let h = Number(p.startHour); h < Number(p.endHour); h++) {
      promoCell.add(p.cid + '|' + String(h).padStart(2, '0'));
    }
  }

  // ---- 2) 行 = 数据里出现过的所有整小时（含被畅打占的小时，浮层要按行号定位）----
  const hours = Array.from(new Set(allSlots.map((s) => String(s.start_time).slice(0, 2)))).sort();

  // ---- 3) 表头 ----
  const heads = list.map((c, i) => ({
    id: c.id,
    name: c.name,
    left: geo.timeW + i * courtW,
    width: courtW,
  }));

  // ---- 4) 行 + 格子 ----
  const rows = hours.map((hour, rowIdx) => {
    const rowTop = geo.headH + rowIdx * geo.rowH;
    const cells = [];
    for (const c of list) {
      if (promoCell.has(c.id + '|' + hour)) continue; // 畅打覆盖 → 画浮层
      const col = colOf[c.id];
      const left = geo.timeW + col * courtW + halfGap;
      const width = courtW - geo.gap;
      const top = rowTop + halfGap;
      const height = geo.rowH - geo.gap;
      const slot = hour + ':00';
      const mine = allSlots.filter(
        (s) => s.court_id === c.id && String(s.start_time).slice(0, 2) === hour
      );
      if (!mine.length) {
        // 该场地这个小时没配价格 → 灰格占位，保证列不塌陷
        cells.push({ cid: c.id, col, slot, price: null, status: 'closed', left, width, top, height });
        continue;
      }
      let status = 'available';
      if (mine.some((s) => s.status === 'mine')) status = 'mine';
      else if (mine.some((s) => s.status === 'booked')) status = 'booked';
      else if (mine.some((s) => s.status === 'past')) status = 'past'; // 已过去的时段：置灰不可订
      if (status === 'available' && selectedSet && selectedSet.has(c.id + '|' + slot)) status = 'selected';
      cells.push({
        cid: c.id, col, slot, price: mine[0].price, status,
        left, width, top, height,
      });
    }
    return { key: hour, hour, label: hour + ':00', top: rowTop, cells };
  });

  // ---- 5) 畅打浮层：同一场地列内，纵向跨 rowSpan 小时 ----
  const rowIdxOf = {};
  hours.forEach((h, i) => { rowIdxOf[h] = i; });
  const promos = [];
  for (const p of promoMap.values()) {
    const startIdx = rowIdxOf[p.startHour];
    if (startIdx == null) continue; // 该小时没有任何数据 → 网格里没有这一行
    const col = colOf[p.cid] != null ? colOf[p.cid] : 0;
    const span = Math.max(1, Number(p.endHour) - Number(p.startHour));
    promos.push({
      pid: p.cid + '-' + p.startHour + '-' + p.endHour + '-' + p.promoId,
      promoId: p.promoId,
      cid: p.cid,
      col,
      startHour: p.startHour,
      endHour: p.endHour,
      label: p.startHour + ':00-' + p.endHour + ':00',
      rowSpan: span,
      name: p.name,
      signed: p.signed,
      maxCap: p.maxCap,
      pricePerPerson: p.pricePerPerson,
      minParticipants: p.minParticipants,
      priceLabel: p.pricePerPerson > 0 ? '¥' + p.pricePerPerson + '/人' : '免费',
      left: geo.timeW + col * courtW + halfGap,
      width: courtW - geo.gap,
      top: geo.headH + startIdx * geo.rowH + halfGap,
      height: span * geo.rowH - geo.gap,
    });
  }

  return {
    heads,
    rows,
    promos,
    geo: {
      timeW: geo.timeW,
      rowH: geo.rowH,
      headH: geo.headH,
      gap: geo.gap,
      courtW,
      gridW,
      canvasH: geo.headH + rows.length * geo.rowH + 8,
    },
  };
}

module.exports = { buildRows: buildRows, DEFAULT_GEO: DEFAULT_GEO };
