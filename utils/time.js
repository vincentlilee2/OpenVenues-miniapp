// 时间显示统一走这里（小程序里 {{}} 不能调用方法，派生字段必须在 JS 侧算好）
//
// 两套存储格式，解析方式不同：
//  · SQLite CURRENT_TIMESTAMP（created_at 等）→ 'YYYY-MM-DD HH:MM:SS'，是 **UTC**，没有时区标记
//  · 后端写入的 signup_deadline → 带 Z 的 ISO 字符串
// 直接 new Date() 会把前者当本地时间，显示出来会差 8 小时。

function toLocalText(t) {
  if (!t) return '';
  let s = String(t);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T') + 'Z'; // SQLite 的 UTC 字符串，补上时区
  }
  const x = new Date(s);
  if (Number.isNaN(x.getTime())) return String(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

// 是否已过期（截止时间早于现在）
function isPast(t) {
  if (!t) return false;
  let s = String(t);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const x = new Date(s);
  return !Number.isNaN(x.getTime()) && x.getTime() < Date.now();
}

module.exports = { toLocalText, isPast };
