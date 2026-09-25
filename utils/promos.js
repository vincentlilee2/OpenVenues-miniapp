// 周期活动的「实例折叠」——同一个周活动只显示一期，避免刷屏。
//
// 背景（2026-09-25 用户要求）：「小程序端活动列表页面现在是显示了重复活动的 8 周内实例，
// 改成只显示本周实例」。一条「每周一 09:00-11:00」的活动在库里是 1 个模版 + 8 个实例行，
// 列表页全渲染就是 8 张一模一样的卡。
//
// 规则（每个周期模版只留 1 期）：
//   ① 本周内还有未开始的一期 → 取「本周那一期」（周一为一周起点，与国内习惯一致）
//   ② 本周没有（例如今天是周五、活动是每周一，最近一期在下周一）→ 取**最近的未来一期**
//   ③ 都没有（极端：实例全都过期）→ 取最早那一期（宁可见到过期卡，也不要整个活动消失）
// 单次活动（固定日期）不受影响，各自照常显示。
//
// 纯函数、无 wx 依赖 → 可在 Node 里直接单测（见 scripts/verify-promo-week-collapse.cjs）。

const WEEKDAY_CN_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 本地日期 → 'YYYY-MM-DD'（绝不用 toISOString，会因 UTC 偏移错一天） */
function toDateStr(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 该日期所在周的周一（国内习惯：周一为一周起点） */
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = d.getDay();            // 0=周日
  d.setDate(d.getDate() - (wd === 0 ? 6 : wd - 1));
  return toDateStr(d);
}

/** 该日期所在周的周日 */
function sundayOf(dateStr) {
  const d = new Date(`${mondayOf(dateStr)}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return toDateStr(d);
}

/** 周期标签文本：'每周一/周三'（⚠️ 不带 emoji —— 两个页面的 wxml 里都写了 `🔁` 前缀） */
function recurrenceTagOf(p) {
  if (Number(p.is_recurrence_instance) !== 1) return '';
  let wd = [];
  try {
    wd = JSON.parse(p.recurrence_weekdays || '[]');
  } catch (_) {
    wd = [];
  }
  const ds = (Array.isArray(wd) ? [...wd] : [])
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_CN_FULL[d]);
  if (!ds.length) return '周期活动';
  // ⚠️ 用 '每' + join，不要 '每周' + '周一' —— 那会得到「每周周一」（旧代码就是，2026-09-25 修）
  return '每' + ds.join('/');
}

/**
 * 把「模版 + N 个实例」折叠成每模版 1 期；单次活动原样保留。
 * @param {Array} list 接口返回的活动数组（已含 promo_date/start_time/is_recurrence_instance/parent_promo_id）
 * @param {string} [todayStr] 今天（测试可注入）；默认取本机今天
 * @returns {Array} 折叠并按日期+时间排序后的数组
 */
function collapseRecurring(list, todayStr) {
  const arr = Array.isArray(list) ? list : [];
  const today = todayStr || toDateStr(new Date());
  const weekEnd = sundayOf(today);

  const singles = [];
  const groups = new Map(); // parent_promo_id → [实例...]
  for (const p of arr) {
    const isInst = Number(p.is_recurrence_instance) === 1 && p.parent_promo_id != null;
    if (!isInst) {
      singles.push(p);
      continue;
    }
    const key = String(p.parent_promo_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const picked = [];
  for (const instances of groups.values()) {
    const sorted = [...instances].sort((a, b) =>
      String(a.promo_date).localeCompare(String(b.promo_date)) ||
      String(a.start_time).localeCompare(String(b.start_time))
    );
    // ① 本周内、且还没开始的那一期
    const thisWeek = sorted.find((p) => p.promo_date >= today && p.promo_date <= weekEnd);
    // ② 最近的未来一期
    const upcoming = sorted.find((p) => p.promo_date >= today);
    picked.push(thisWeek || upcoming || sorted[0]);
  }

  return [...singles, ...picked].sort(
    (a, b) =>
      String(a.promo_date).localeCompare(String(b.promo_date)) ||
      String(a.start_time).localeCompare(String(b.start_time))
  );
}

module.exports = { collapseRecurring, recurrenceTagOf, mondayOf, sundayOf, toDateStr, WEEKDAY_CN_FULL };
