// 验证首页「⊕ 导航」的 openMap 逻辑（不依赖真机/模拟器点击）
//
// 做法：mock 全局 Page / wx，require 真实的 pages/index/index.js，
//       然后按不同场馆数据调用 openMap，断言它到底调了什么。
//
// 用法：cd ~/WeChatProjects/OpenVenues-miniapp && node scripts/verify-openmap.cjs
const path = require('path');

let page = null;
const calls = { openLocation: [], showModal: [], showToast: [] };

global.Page = (o) => { page = o; };
global.App = () => {};
global.getApp = () => ({ globalData: {} });
global.wx = {
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getSystemInfoSync: () => ({ platform: 'devtools' }),
  openLocation: (o) => calls.openLocation.push(o),
  showModal: (o) => calls.showModal.push(o),
  showToast: (o) => calls.showToast.push(o),
  showLoading: () => {}, hideLoading: () => {},
  getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {},
  request: () => {},
  switchTab: () => {}, navigateTo: () => {},
};

require(path.join(__dirname, '..', 'pages', 'index', 'index.js'));
if (!page) { console.error('✗ 没抓到 Page 对象'); process.exit(1); }

const errs = [];
const ok = (name, cond, extra) => {
  if (cond) console.log('  ✓ ' + name);
  else { console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); errs.push(name); }
};

function run(venues, id) {
  calls.openLocation.length = 0;
  calls.showModal.length = 0;
  calls.showToast.length = 0;
  const vm = { data: { venues }, setData(o) { Object.assign(this.data, o); } };
  page.openMap.call(vm, { currentTarget: { dataset: { id } } });
  return calls;
}

console.log('\n1) 有合法坐标 → 应调 wx.openLocation 且带上真实坐标');
{
  const c = run([{ id: 1, name: 'A 室内场馆', address: '北京市朝阳区示例路 88 号', latitude: 39.9219, longitude: 116.4436 }], 1);
  ok('调用了 openLocation', c.openLocation.length === 1, c.openLocation.length);
  const o = c.openLocation[0] || {};
  ok('latitude 用场馆真实值', o.latitude === 39.9219, o.latitude);
  ok('longitude 用场馆真实值', o.longitude === 116.4436, o.longitude);
  ok('name 传场馆名', o.name === 'A 室内场馆', o.name);
  ok('address 传场馆地址', o.address === '北京市朝阳区示例路 88 号', o.address);
  ok('scale 有设', o.scale === 16, o.scale);
  ok('没有弹「暂无定位」', c.showModal.length === 0, c.showModal.length);
}

console.log('\n2) 坐标为 (0,0)（旧的占位值）→ 视为无效，不打开空地图');
{
  const c = run([{ id: 1, name: 'A 室内场馆', address: '北京市朝阳区示例路 88 号', latitude: 0, longitude: 0 }], 1);
  ok('没有调用 openLocation', c.openLocation.length === 0, c.openLocation.length);
  ok('弹了提示', c.showModal.length === 1, c.showModal.length);
  ok('提示里点明暂无坐标', /没有设置地图坐标/.test((c.showModal[0] || {}).content || ''), (c.showModal[0] || {}).content);
  ok('提示里带上了地址', /北京市朝阳区示例路 88 号/.test((c.showModal[0] || {}).content || ''));
}

console.log('\n3) 没有坐标（null）→ 提示且不打开地图');
{
  const c = run([{ id: 2, name: 'B 室外场馆', address: '北京市海淀区示例路 22 号', latitude: null, longitude: null }], 2);
  ok('没有调用 openLocation', c.openLocation.length === 0, c.openLocation.length);
  ok('弹了提示', c.showModal.length === 1, c.showModal.length);
}

console.log('\n4) 坐标字段缺失（老接口没返回）→ 同样安全降级');
{
  const c = run([{ id: 3, name: 'C 场馆', address: '北京市大兴区' }], 3);
  ok('没有调用 openLocation', c.openLocation.length === 0, c.openLocation.length);
  ok('弹了提示', c.showModal.length === 1);
}

console.log('\n5) 地址为空且无坐标 → 提示文案区分');
{
  const c = run([{ id: 4, name: 'D 场馆', address: '', latitude: null, longitude: null }], 4);
  ok('提示说明没有地址', /还没有填写地址/.test((c.showModal[0] || {}).content || ''), (c.showModal[0] || {}).content);
}

console.log('\n6) 找到不存在的 id → 安全返回，什么都不调');
{
  const c = run([{ id: 1, name: 'A', latitude: 1, longitude: 2 }], 999);
  ok('没有调用 openLocation', c.openLocation.length === 0);
  ok('没有弹提示', c.showModal.length === 0);
}

console.log('\n7) 坐标是字符串（JSON 里可能给字符串）→ 应能正常转换');
{
  const c = run([{ id: 5, name: 'E 场馆', address: '某地', latitude: '39.9', longitude: '116.4' }], 5);
  ok('调用了 openLocation', c.openLocation.length === 1);
  ok('latitude 转成数字', (c.openLocation[0] || {}).latitude === 39.9, (c.openLocation[0] || {}).latitude);
  ok('longitude 转成数字', (c.openLocation[0] || {}).longitude === 116.4);
}

console.log('\n====================================================');
console.log(errs.length === 0 ? '全部通过' : `失败 ${errs.length} 项：${errs.join(' / ')}`);
process.exit(errs.length === 0 ? 0 : 1);
