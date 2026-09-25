// 「打开场馆地图导航」的**唯一实现** —— 首页场馆卡（⊕ 导航）与场馆详情页共用。
//
// 为什么不写在页面里各一份：同一段权限/降级逻辑写两遍必然漂移（今天刚在
// 「场馆类型 → 中文」的三份映射上吃过这个亏）。要改规则只改这里。
//
// 行为约定（两个入口完全一致）：
//   ① 有合法坐标 → wx.openLocation({ latitude, longitude, name, address, scale: 16 })
//   ② (0,0) —— 几内亚湾，明显是占位值 → 当"没坐标"处理，**绝不把用户导航到非洲**
//   ③ 没坐标但有地址 → 弹「暂无定位」并把地址显示出来（方便用户手动搜）
//   ④ 没坐标也没地址 → 弹「还没有填写地址，暂时无法导航」
//   ⑤ openLocation 失败 → 打日志 + toast（不静默失败）
//
// app.json 不需要声明 requiredPrivateInfos / permission：openLocation 只是"展示"，
// 不在需要声明的定位 API 名单里（getLocation / chooseLocation / onLocationChange 才需要）。

function hasUsableCoord(venue) {
  const lat = Number(venue && venue.latitude);
  const lng = Number(venue && venue.longitude);
  // (0,0) 是几内亚湾，明显是占位值 → 当没坐标处理，别把用户导航到非洲
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function openVenueMap(venue) {
  if (!venue) return;

  if (!hasUsableCoord(venue)) {
    wx.showModal({
      title: '暂无定位',
      content: venue.address
        ? `「${venue.name}」还没有设置地图坐标，暂时打不开导航。\n地址：${venue.address}\n（请管理员在本地后台的场馆编辑页补上坐标）`
        : `「${venue.name}」还没有填写地址，暂时无法导航。`,
      showCancel: false,
      confirmText: '知道了',
    });
    return;
  }

  wx.openLocation({
    latitude: Number(venue.latitude),
    longitude: Number(venue.longitude),
    name: venue.name,
    address: venue.address || '',
    scale: 16,
    fail: (err) => {
      console.error('[openMap] openLocation failed', err);
      wx.showToast({ title: '打开地图失败', icon: 'none' });
    },
  });
}

module.exports = { hasUsableCoord, openVenueMap };
