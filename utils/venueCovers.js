// 三个场馆的默认实景背景图（mmx 图像生成）
//   - 文件在 server/static/covers/tennis_001.jpg / basketball_001.jpg / pickleball_001.jpg
//   - 用 mmx image generate 生成（prompt 见 scripts/gen-covers.sh）
//   - 小程序端按 API_BASE 拼成 http://host/static/covers/tennis_001.jpg
//   - 每张 250-500 KB，鸟瞰视角 / 无人物 / 球场细节清晰
//
//   添加新赛事：在 admin 后台给 venue.cover 设 URL 即可（item.cover 优先）

const config = require('../config.js');

function coversMap() {
  const base = config.apiBase.replace(/\/$/, '');
  return {
    1: `${base}/static/covers/tennis_001.jpg`,
    2: `${base}/static/covers/basketball_001.jpg`,
    3: `${base}/static/covers/pickleball_001.jpg`,
  };
}

module.exports = {
  // 按 venue.id 拿 cover URL
  byId(id) {
    return coversMap()[id] || `${config.apiBase.replace(/\/$/, '')}/static/covers/tennis.svg`;
  },
  // 直接给三个固定键
  A: () => coversMap()[1],
  B: () => coversMap()[2],
  C: () => coversMap()[3],
  // 给 config 同步调试用
  coversMap,
};