// 「活动」tab + 首页 banner 去掉（2026-09-26）
//   用户：「小程序界面中 订单 改成 活动，点击进入显示当前发布的活动与课程。
//          并去掉 首页 上面的 在线预约 畅打活动的banner。」
// 手法：静态接线断言 + 假 wx 驱动**真页面文件**（activity.js）跑 loadAll/render/switchSeg。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0;
let fail = 0;
const ok = (label, cond, extra) => {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : ''));
  }
};

// ---------- 假 wx ----------
const storage = {};
const calls = { requests: [], navs: [], toasts: [] };
let responses = {}; // url 片段 → data
global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  showToast: (o) => calls.toasts.push(o),
  showModal: () => {},
  request: (o) => {
    calls.requests.push({ url: o.url });
    const key = Object.keys(responses).find((k) => o.url.includes(k));
    const data = key ? responses[key] : [];
    setTimeout(() => o.success && o.success({ statusCode: 200, data: { ok: true, data } }), 0);
  },
  navigateTo: (o) => calls.navs.push(o.url),
  switchTab: (o) => calls.navs.push('SWITCH:' + o.url),
  setNavigationBarTitle: () => {},
  showShareMenu: () => {},
};

function grabPage(rel) {
  let obj = null;
  global.Page = (o) => {
    obj = o;
  };
  const abs = path.join(ROOT, rel);
  delete require.cache[require.resolve(abs)];
  require(abs);
  return obj;
}
function makeInst(pageObj, data) {
  const inst = Object.create(pageObj);
  inst.data = { ...data };
  inst.setData = (patch) => Object.assign(inst.data, patch);
  return inst;
}
const wait = () => new Promise((r) => setTimeout(r, 5));

(async () => {
  console.log('--- ① tabBar：第二格「订单」→「活动」---');
  {
    const app = JSON.parse(read('app.json'));
    const bar = app.tabBar.list;
    ok('★ tabBar 仍是 3 格', bar.length === 3, bar.length);
    ok('★ 第二格文案是「活动」', bar[1].text === '活动', bar[1].text);
    ok('★ 第二格指向 pages/activity/activity', bar[1].pagePath === 'pages/activity/activity', bar[1].pagePath);
    ok('第二格图标用的是活动图标（不是订单图标）', /tab-promo/.test(bar[1].iconPath), bar[1].iconPath);
    ok('订单页仍在 pages 里（从「我的」进，不能消失）', app.pages.includes('pages/order-list/order-list'));
    ok('新页已注册 app.json', app.pages.includes('pages/activity/activity'));
    for (const f of ['activity.js', 'activity.wxml', 'activity.wxss', 'activity.json']) {
      ok(`存在 pages/activity/${f}`, exists(`pages/activity/${f}`));
    }
    ok('导航栏标题是「活动」', JSON.parse(read('pages/activity/activity.json')).navigationBarTitleText === '活动');
    // 自定义 tabBar（app.json 里 custom:true → 真正渲染的是组件）
    const tb = read('custom-tab-bar/index.wxml');
    ok('★ 自定义 tabBar 第二格也改成了活动', /data-path="\/pages\/activity\/activity"/.test(tb) && /<text>活动<\/text>/.test(tb));
    ok('★ 自定义 tabBar 里已无「订单」格子', !/<text>订单<\/text>/.test(tb));
    ok('自定义 tabBar 用的是活动图标', /tab-promo/.test(tb) && !/tab-order/.test(tb));
  }

  console.log('\n--- ② 首页 banner 已去掉 ---');
  {
    const wxml = read('pages/index/index.wxml');
    const js = read('pages/index/index.js');
    const wxss = read('pages/index/index.wxss');
    ok('★ wxml 里没有 banner 节点', !/class="banner"/.test(wxml));
    ok('★ 没有「在线预约 · 畅打活动」文案', !/在线预约/.test(wxml));
    ok('★ 没有 banner 的 bindtap="openPromos"', !/openPromos/.test(wxml));
    ok('★ js 里 openPromos / loadPromoCount / promoSubText 死代码已清', !/openPromos|loadPromoCount|promoSubText|promoCount/.test(js));
    ok('★ wxss 里 .banner 死样式已清', !/\.banner/.test(wxss));
    ok('首页品牌区仍在（别把上方整块删了）', /class="brand-name"/.test(wxml) && /OpenVenues/.test(wxml));
    ok('场馆卡片仍在', /class="venue-card"/.test(wxml));
  }

  console.log('\n--- ③ 订单页不再是 tabBar 页 → 跳转方式必须改 ---');
  {
    ok('★ 「我的」用 navigateTo 进订单页', /wx\.navigateTo\(\{ url: '\/pages\/order-list\/order-list' \}\)/.test(read('pages/my/my.js')));
    ok('★ 约场下单成功后用 navigateTo', /setTimeout\(\(\) => wx\.navigateTo\(\{ url: '\/pages\/order-list\/order-list' \}\), 800\)/.test(read('pages/book/book.js')));
    ok('★ 报名成功后用 navigateTo', /wx\.navigateTo\(\{ url: '\/pages\/order-list\/order-list' \}\)/.test(read('pages/promo-detail/promo-detail.js')));
    const all = ['pages/my/my.js', 'pages/book/book.js', 'pages/promo-detail/promo-detail.js', 'pages/order-list/order-list.js', 'pages/activity/activity.js'];
    const bad = all.filter((f) => /switchTab\(\{ url: '\/pages\/order-list/.test(read(f)));
    ok('★ 全仓已无 switchTab 到订单页（非 tab 页会静默失败）', bad.length === 0, bad.join(','));
    // ⚠️ 注释里提到了 syncTabBar（说明为什么删掉），所以只匹配**调用/定义**形式，别被注释命中
  ok('订单页已删掉 syncTabBar（非 tab 页 getTabBar 为 undefined）', !/syncTabBar\s*\(/.test(read('pages/order-list/order-list.js')));
    ok('★ 活动页 onShow 里把 tabBar 高亮第 2 格', /setData\(\{ selected: 1 \}\)/.test(read('pages/activity/activity.js')));
  }

  console.log('\n--- ④ 活动页 loadAll()：两类都拉、周期折叠、字段派生 ---');
  {
    const page = grabPage('pages/activity/activity.js');
    const inst = makeInst(page, { seg: 'promo', list: [], loading: true });
    responses = {
      '/api/promos': [
        { id: 785, title: '周一上午畅打', promo_date: '2026-09-28', start_time: '09:00', end_time: '11:00', price_per_person: 50, signed_up: 3, max_capacity: 8, min_participants: 4, signup_deadline: '2099-01-01T00:00:00.000Z', venue_name: '室外网球场', court_name: '1 号场', cover: '/uploads/promos/a.jpg', is_recurrence_instance: 0, recurrence_kind: 'none' },
      ],
      '/api/courses': [
        { id: 61, kind: 'course', title: '网球启蒙班', coach: '张教练', lesson_count: 8, promo_date: '2026-11-05', start_time: '14:00', end_time: '16:00', price_per_person: 120, signed_up: 2, max_capacity: 8, min_participants: 4, signup_deadline: '2099-01-01T00:00:00.000Z', venue_name: '室外网球场', cover: '', is_recurrence_instance: 0, recurrence_kind: 'none' },
      ],
    };
    calls.requests.length = 0;
    await inst.loadAll();
    await wait();
    ok('★ 两类接口都请求了', calls.requests.some((r) => /\/api\/promos/.test(r.url)) && calls.requests.some((r) => /\/api\/courses/.test(r.url)), JSON.stringify(calls.requests.map((r) => r.url)));
    ok('默认段位是「活动」', inst.data.seg === 'promo');
    ok('★ 活动段：1 条，且是活动', inst.data.list.length === 1 && inst.data.list[0].id === 785, JSON.stringify(inst.data.list.map((x) => x.id)));
    ok('活动卡片没有教练芯片（chips 为空）', inst.data.list[0].chips.length === 0);
    ok('活动文案是「N人成团」', inst.data.list[0].metaSub === '4人成团', inst.data.list[0].metaSub);
    ok('相对封面拼成绝对 URL', /\/uploads\/promos\/a\.jpg$/.test(inst.data.list[0].cover), inst.data.list[0].cover);
    ok('地点显示「场馆 · 场地」', inst.data.list[0].venueText === '室外网球场 · 1 号场', inst.data.list[0].venueText);

    inst.switchSeg({ currentTarget: { dataset: { seg: 'course' } } });
    await wait();
    const c = inst.data.list[0];
    ok('★ 切到「课程」段：1 条，且是课程', inst.data.list.length === 1 && c.id === 61, JSON.stringify(inst.data.list.map((x) => x.id)));
    ok('★ 课程卡片有教练/课时芯片', c.chips.length === 2 && /张教练/.test(c.chips[0]) && /共 8 节/.test(c.chips[1]), JSON.stringify(c.chips));
    ok('★ 课程文案是「N人成班」（不是成团）', c.metaSub === '4人成班', c.metaSub);
    ok('★ 课程空封面 → 课程默认图', /course-default\.jpg$/.test(c.cover), c.cover);
    ok('切段不重复请求接口（用已拉到的数据渲染）', calls.requests.length === 2, calls.requests.length);
  }

  console.log('\n--- ⑤ 边界与跳转 ---');
  {
    const page = grabPage('pages/activity/activity.js');
    const inst = makeInst(page, { seg: 'course', list: [], loading: true });
    // 8 周周期实例（同一模版）→ 折叠成 1 期
    const wk = (id, d) => ({ id, kind: 'course', title: '每周一班', promo_date: d, start_time: '09:00', end_time: '11:00', price_per_person: 80, signed_up: 1, max_capacity: 6, min_participants: 2, signup_deadline: '2000-01-01T00:00:00.000Z', is_recurrence_instance: 1, parent_promo_id: 60, recurrence_weekdays: '[1]' });
    responses = {
      '/api/promos': [],
      '/api/courses': [wk(71, '2026-09-28'), wk(72, '2026-10-05'), wk(73, '2026-10-12')],
    };
    await inst.loadAll();
    await wait();
    ok('★ 周期课程 3 期折叠成 1 期', inst.data.list.length === 1, inst.data.list.length);
    ok('时间文案显示「按周期上课」', inst.data.list[0].timeText === '按周期上课', inst.data.list[0].timeText);
    ok('已截止标记正确', inst.data.list[0].expired === true);

    // 空数据 → 空态
    responses = { '/api/promos': [], '/api/courses': [] };
    inst.switchSeg({ currentTarget: { dataset: { seg: 'promo' } } });
    await wait();
    ok('★ 没有数据 → empty=true（渲染空态）', inst.data.empty === true && inst.data.list.length === 0);

    // 点卡片 → 详情页
    calls.navs.length = 0;
    inst.openDetail({ currentTarget: { dataset: { id: 61 } } });
    ok('★ 点卡片进 promo-detail（活动/课程共用详情页）', calls.navs[0] === '/pages/promo-detail/promo-detail?id=61', calls.navs[0]);

    // 某一类接口失败 → 另一类照常显示（不能让整页白）
    const page2 = grabPage('pages/activity/activity.js');
    const inst2 = makeInst(page2, { seg: 'promo', list: [], loading: true });
    global.wx.request = (o) => {
      const isPromos = /\/api\/promos/.test(o.url);
      setTimeout(() => {
        if (isPromos) o.fail && o.fail({ errMsg: 'boom' });
        else o.success && o.success({ statusCode: 200, data: { ok: true, data: [{ id: 61, kind: 'course', title: '课程', promo_date: '2026-11-05', start_time: '14:00', end_time: '16:00', price_per_person: 1, signed_up: 0, max_capacity: 8, min_participants: 2, signup_deadline: '2099-01-01T00:00:00.000Z', is_recurrence_instance: 0, recurrence_kind: 'none' }] } });
      }, 0);
    };
    await inst2.loadAll();
    await wait();
    ok('★ 活动接口挂了也不影响课程段', inst2.data.list.length === 0);
    inst2.switchSeg({ currentTarget: { dataset: { seg: 'course' } } });
    await wait();
    ok('★ 课程段照常显示', inst2.data.list.length === 1 && inst2.data.list[0].id === 61);
  }

  console.log(`\n合计：${pass} 过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
