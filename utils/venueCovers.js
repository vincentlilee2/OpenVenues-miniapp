// 场馆封面 URL 组装（小程序端）
//
// ⚠️ 曾经这里是**按场馆 id 写死**的三张图（1/2/3），新场馆查不到就兜底到一个不存在的
//    `/static/covers/tennis.svg`（线上 404）→ 首页那张卡片是加载失败的图。
//    现在**数据来源唯一**：服务端 `/api/venues` 与 `/api/venues/:id` 返回的 `default_cover`
//    （服务端会检查文件确实存在，不会给出 404 路径）。
//
// 优先级：venue.cover（后台指定/上传）> venue.default_cover（服务端给的默认图）> 空（前端走占位块）

function absolute(url, apiBase) {
  if (!url) return '';
  if (String(url).startsWith('http')) return url;
  const base = String(apiBase || '').replace(/\/$/, '');
  return base + url;
}

/**
 * 某个场馆最终要显示的背景图 URL（绝对路径；没有则返回空串 → 模板走占位块）
 * @param {object} venue 至少含 { cover, default_cover }
 * @param {string} apiBase 例如 https://host/venue-api
 */
function of(venue, apiBase) {
  if (!venue) return '';
  return absolute(venue.cover, apiBase) || absolute(venue.default_cover, apiBase) || '';
}

module.exports = {
  of: of,
  absolute: absolute,
};
