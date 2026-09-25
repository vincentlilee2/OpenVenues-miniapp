// 订单详情「场地信息」显示验证（要显示具体场地，不能只显示场馆名）
// 用法：env -u PYTHONPATH node scripts/verify-order-display.cjs
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const errs = [];
const ok = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${extra !== undefined ? ' → ' + extra : ''}`);
    errs.push(name);
  }
};

async function runPage(orderPayload) {
  const calls = [];
  global.wx = {
    // request() 会先 session.ready() 确保已登录 → 给个现成 token，跳过登录流程
    getStorageSync: (k) => (k === 'wx_token' ? 'test_token' : k === 'wx_uid' ? 'u_test' : ''),
    setStorageSync: () => {},
    removeStorageSync: () => {},
    showToast: (o) => calls.push(o),
    showModal: (o) => o.success && o.success({ confirm: false }),
    navigateTo: () => {},
    switchTab: () => {},
    request: ({ url, success }) => {
      calls.push(url);
      success({ statusCode: 200, data: { ok: true, data: orderPayload } });
    },
  };
  let pageObj = null;
  global.Page = (o) => {
    pageObj = o;
  };
  const abs = path.join(ROOT, 'pages/order-detail/order-detail.js');
  delete require.cache[require.resolve(abs)];
  require(abs);
  const inst = Object.create(pageObj);
  inst.data = Object.assign({}, pageObj.data);
  inst.setData = (patch) => Object.assign(inst.data, patch);
  inst._id = 1;
  await inst.load();
  return inst;
}

const BASE = {
  id: 1,
  order_no: 'V20260923TEST',
  venue_name: 'A 室内场馆',
  venue_address: '北京市朝阳区示例路 88 号',
  booking_date: '2026-09-30',
  start_time: '14:00',
  end_time: '15:00',
  duration_hours: 1,
  total_price: 60,
  status: 'confirmed',
  source: 'hourly',
  contact_name: '张三',
  contact_phone: '13800138000',
};

(async () => {
  const { courtTextOf, venueCourtLine } = require(path.join(ROOT, 'utils/order-display.js'));

  console.log('--- 1) 纯函数：各种订单形态 ---');
  ok('普通约场 → 具体场地名', courtTextOf({ ...BASE, court_name: '1 号台' }) === '1 号台');
  ok(
    '畅打（活动指定了场地）→ 那个场地',
    courtTextOf({ ...BASE, source: 'promo', court_name: '2 号场地', promo: { id: 2, court_id: 13 } }) === '2 号场地'
  );
  ok(
    '★ 畅打（场馆级/全场馆）→ 「全部场地」而不是占位场地',
    courtTextOf({ ...BASE, source: 'promo', court_name: '1 号台', promo: { id: 1, court_id: null } }) === '全部场地',
    courtTextOf({ ...BASE, source: 'promo', court_name: '1 号台', promo: { id: 1, court_id: null } })
  );
  ok('场地被删/缺失 → 未指定', courtTextOf({ ...BASE, court_name: null }) === '未指定');
  ok('场馆+场地一行写法', venueCourtLine({ ...BASE, court_name: '3 号台' }) === 'A 室内场馆 · 3 号台', venueCourtLine({ ...BASE, court_name: '3 号台' }));

  console.log('\n--- 2) 真页面：load() 后 courtText 有值 ---');
  {
    const p = await runPage({ ...BASE, court_name: '1 号台' });
    ok('请求了订单详情接口', p.data.order && p.data.order.order_no === 'V20260923TEST');
    ok('★ courtText = 具体场地', p.data.courtText === '1 号台', p.data.courtText);
    ok('页面仍带场馆名', p.data.order.venue_name === 'A 室内场馆');
  }
  {
    const p = await runPage({ ...BASE, source: 'promo', court_name: '1 号台', promo: { id: 1, title: '开业免费畅打', court_id: null } });
    ok('★ 场馆级畅打 → 全部场地', p.data.courtText === '全部场地', p.data.courtText);
  }
  {
    const p = await runPage({ ...BASE, source: 'promo', court_name: '2 号场地', promo: { id: 2, title: '周六畅打', court_id: 13 } });
    ok('★ 场次级畅打 → 具体场地', p.data.courtText === '2 号场地', p.data.courtText);
  }

  console.log('\n--- 3) 结构断言：wxml 必须有「场地」行绑定 courtText ---');
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/order-detail/order-detail.wxml'), 'utf8');
  ok('有「场馆」行', /<text class="label">场馆<\/text><text>\{\{order\.venue_name\}\}<\/text>/.test(wxml));
  ok('有「场地」行且绑定 courtText', /<text class="label">场地<\/text><text>\{\{courtText\}\}<\/text>/.test(wxml));
  ok('不再把 venue_name 标成「场地」', !/<text class="label">场地<\/text><text>\{\{order\.venue_name\}\}<\/text>/.test(wxml));

  console.log('\n--- 4) 后端订单详情返回 court_name / promo.court_id ---');
  const ordersSrc = fs.readFileSync(path.join(ROOT, '..', 'OpenVenues-server', 'routes', 'orders.js'), 'utf8');
  ok('SELECT 带 court_name', /c\.name AS court_name/.test(ordersSrc));
  ok('promo 查询带 court_id', /promo_date, start_time, end_time, court_id, venue_id FROM venue_promos/.test(ordersSrc));

  console.log(`\n${errs.length === 0 ? '✓ 全部通过' : `✗ ${errs.length} 项失败: ${errs.join(' / ')}`}`);
  process.exit(errs.length === 0 ? 0 : 1);
})();
