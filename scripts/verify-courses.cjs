// 培训课程（小程序侧）回归（2026-09-25）
//   用户需求：「后台发布课程 → 显示在小程序 场馆详情 → 约课 的课程列表（新增页面）中」
//   本文件覆盖：① 约课按钮接线（原来是占位 toast）② 新页 pages/courses 的存在与注册
//   ③ 课程列表的派生字段（教练/课时芯片、封面兜底、已截止、周期折叠）④ 点卡片进详情（复用报名链路）
//   ⑤ 详情页按 kind 适配（课程详情标题 + 教练/课时两行）⑥ 分享标题按 kind 变
// 手法：假 wx + **真页面文件** + 真 api/request.js（走伪 wx.request）—— 与 verify-favorite.cjs 同一套骨架。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0,
  fail = 0;
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
const calls = { requests: [], toasts: [], navs: [], titles: [] };
let nextResponse = { statusCode: 200, data: { ok: true, data: [] } };

global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  showToast: (o) => calls.toasts.push(o),
  showModal: (o) => calls.modals && calls.modals.push(o),
  request: (o) => {
    calls.requests.push({ url: o.url, method: o.method });
    setTimeout(() => {
      if (nextResponse.fail) o.fail && o.fail(nextResponse.fail);
      else o.success && o.success({ statusCode: nextResponse.statusCode, data: nextResponse.data });
    }, 0);
  },
  navigateTo: (o) => calls.navs.push(o.url),
  navigateBack: () => calls.navs.push('BACK'),
  switchTab: (o) => calls.navs.push('SWITCH:' + o.url),
  setNavigationBarTitle: (o) => calls.titles.push(o.title),
  showShareMenu: () => {},
};

// ---------- 抓真页面对象 ----------
function grabPage(rel) {
  let obj = null;
  global.Page = (o) => {
    obj = o;
  };
  // 清掉 require 缓存，保证每个页面文件都被重新执行（否则第二次 require 是 no-op）
  const abs = path.join(ROOT, rel);
  delete require.cache[require.resolve(abs)];
  require(abs);
  return obj;
}

function makeInst(pageObj, data) {
  const inst = Object.create(pageObj);
  inst.data = { ...data };
  inst.setData = (patch) => {
    for (const [k, v] of Object.entries(patch)) {
      const m = k.match(/^([A-Za-z0-9_]+)\[(\d+)\]\.([A-Za-z0-9_]+)$/);
      if (m) inst.data[m[1]][Number(m[2])][m[3]] = v;
      else inst.data[k] = v;
    }
  };
  return inst;
}

const wait = () => new Promise((r) => setTimeout(r, 5));

console.log('--- ① 约课入口接线（原为占位 toast）---');
{
  // ⚠️ 断言前先剥掉注释：我在注释里写了「原为占位 toast...」，否则断言会被自己的注释命中（实测踩到）
  const js = read('pages/venue-detail/venue-detail.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const wxml = read('pages/venue-detail/venue-detail.wxml');
  ok('★ 不再调用「约课功能本期未上线」的占位 toast', !/wx\.showToast\(\{[^}]*约课功能本期未上线/.test(js));
  ok('★ 约课跳转课程列表页并带 venue_id', /pages\/courses\/courses\?venue_id=\$\{this\._id\}/.test(js));
  ok('顺带带上馆名（列表页标题显示「XX馆 · 培训课程」）', /venue_name=\$\{encodeURIComponent/.test(js));
  ok('wxml 上「约课」按钮仍绑 onBookLesson', /bindtap="onBookLesson"/.test(wxml));
  ok('★ 底部操作区仍是 3 个按钮（约课/约场/畅打）', (wxml.match(/<button/g) || []).length === 3, (wxml.match(/<button/g) || []).length);
}

console.log('\n--- ② 新页注册与文件齐全 ---');
{
  const app = JSON.parse(read('app.json'));
  ok('★ app.json 注册了 pages/courses/courses', app.pages.includes('pages/courses/courses'));
  for (const f of ['courses.js', 'courses.wxml', 'courses.wxss', 'courses.json']) {
    ok(`存在 ${f}`, fs.existsSync(path.join(ROOT, 'pages', 'courses', f)));
  }
  ok('导航栏标题是「培训课程」', JSON.parse(read('pages/courses/courses.json')).navigationBarTitleText === '培训课程');
  ok('★ api/index.js 有 listCourses → /api/courses', /listCourses:[\s\S]{0,120}\/api\/courses/.test(read('api/index.js')));
  const wxml = read('pages/courses/courses.wxml');
  ok('wxml 渲染教练/课时芯片（coachChips）', /item\.coachChips/.test(wxml));
  ok('wxml 显示已报人数与成班人数', /已报 \{\{item\.signed_up\}\}\/\{\{item\.max_capacity\}\}/.test(wxml) && /人成班/.test(wxml));
  ok('wxml 有周期标签（🔁）', /🔁 \{\{item\.recurrenceTag\}\}/.test(wxml));
  ok('wxml 空态有出口（不留死胡同）', /btn-empty/.test(wxml) && /goBack/.test(wxml));
}

console.log('--- ③ 课程列表 load()：派生字段与请求 URL ---');
(async () => {
{
  const page = grabPage('pages/courses/courses.js');
  const inst = makeInst(page, { courses: [], loading: true, venueName: '', empty: false });
  inst._venueId = '3';
  nextResponse = {
    statusCode: 200,
    data: {
      ok: true,
      data: [
        {
          id: 61,
          kind: 'course',
          title: '网球启蒙班',
          coach: '张教练',
          lesson_count: 8,
          cover: '/uploads/promos/c1.jpg',
          venue_name: '室外网球场',
          court_name: '1 号场',
          promo_date: '2026-11-11',
          start_time: '14:00',
          end_time: '16:00',
          price_per_person: 120,
          signed_up: 3,
          max_capacity: 8,
          min_participants: 4,
          signup_deadline: '2099-01-01T00:00:00.000Z',
          is_recurrence_instance: 0,
          recurrence_kind: 'none',
        },
      ],
    },
  };
  calls.requests.length = 0;
  await inst.load();
  await wait();
  const req = calls.requests.find((r) => /\/api\/courses/.test(r.url));
  ok('★ 请求 /api/courses?venue_id=3', !!req && /\/api\/courses\?venue_id=3/.test(req.url), req && req.url);
  const c = inst.data.courses[0];
  ok('loading 归位', inst.data.loading === false);
  // ⚠️ 别按 emoji 字节比对：🧑🏫 是「🧑 + ZWJ + 🏫」三码组合，手打的另一个变体肉眼一样但字节不同（本次实测踩到）
  ok(
    '★ 教练/课时芯片生成',
    c?.coachChips?.length === 2 && /张教练/.test(c.coachChips[0]) && /共 8 节/.test(c.coachChips[1]),
    JSON.stringify(c?.coachChips)
  );
  // 域名不写死（本仓是公开仓，config.js 仓内是占位值、本机是真值）→ 只断言「apiBase + 相对路径」这个规则
  const { apiBase } = require(path.join(ROOT, 'config.js'));
  ok('★ 相对封面拼成绝对 URL（= config.apiBase + 路径）', c?.cover === apiBase.replace(/\/$/, '') + '/uploads/promos/c1.jpg', c?.cover);
  ok('未截止 → expired=false', c?.expired === false);
  ok('地点文本带场馆·场地', c?.venueText === '室外网球场 · 1 号场', c?.venueText);
  ok('非周期 → 显示具体日期', c?.dateText === '2026-11-11', c?.dateText);
}

console.log('\n--- ④ 边界：封面兜底 / 已截止 / 缺教练课时 / 周期课程折叠成 1 期 ---');
{
  const page = grabPage('pages/courses/courses.js');
  const inst = makeInst(page, { courses: [], loading: true, venueName: '', empty: false });
  inst._venueId = '';
  const weekly = (id, d) => ({
    id,
    kind: 'course',
    title: '每周一班',
    coach: '',
    lesson_count: null,
    cover: '',
    promo_date: d,
    start_time: '09:00',
    end_time: '11:00',
    price_per_person: 80,
    signed_up: 1,
    max_capacity: 6,
    min_participants: 2,
    signup_deadline: '2000-01-01T00:00:00.000Z', // 已过期
    is_recurrence_instance: 1,
    parent_promo_id: 60,
    recurrence_weekdays: '[1]',
  });
  nextResponse = {
    statusCode: 200,
    data: {
      ok: true,
      data: [
        weekly(71, '2026-09-28'),
        weekly(72, '2026-10-05'),
        weekly(73, '2026-10-12'),
        { id: 60, kind: 'course', title: '每周一班（模版）', promo_date: '1900-01-01', start_time: '09:00', end_time: '11:00', is_recurrence_instance: 0, recurrence_kind: 'weekly', recurrence_weekdays: '[1]' },
      ],
    },
  };
  await inst.load();
  await wait();
  ok('★ 8 周实例折叠成 1 期（模版行也不展示）', inst.data.courses.length === 1, inst.data.courses.length);
  const c = inst.data.courses[0];
  ok('取的是最近一期 2026-09-28', c?.promo_date === '2026-09-28', c?.promo_date);
  ok('★ 封面为空 → 兜底**课程**默认图', /\/static\/promos\/course-default\.jpg$/.test(c?.cover || ''), c?.cover);
  ok('★ 已过期 → expired=true（列表显示「已截止」）', c?.expired === true);
  ok('★ 没教练没课时 → 芯片数组为空（不渲染空行）', Array.isArray(c?.coachChips) && c.coachChips.length === 0, JSON.stringify(c?.coachChips));
  ok('周期课程不显示具体日期（改显示「按周期上课」）', c?.dateText === '按周期上课', c?.dateText);

  // 空数据 → 空态
  nextResponse = { statusCode: 200, data: { ok: true, data: [] } };
  await inst.load();
  await wait();
  ok('★ 没有课程 → empty=true（渲染空态 + 返回出口）', inst.data.empty === true && inst.data.courses.length === 0);
}

console.log('\n--- ⑤ 点卡片 → 复用活动详情页（报名/订单/支付同一条链路）---');
{
  const page = grabPage('pages/courses/courses.js');
  const inst = makeInst(page, { courses: [] });
  calls.navs.length = 0;
  inst.openDetail({ currentTarget: { dataset: { id: 61 } } });
  ok('★ 跳到 promo-detail 并带 id', calls.navs[0] === '/pages/promo-detail/promo-detail?id=61', calls.navs[0]);
  calls.navs.length = 0;
  inst.goBack();
  ok('空态「返回」在无页面栈时退回首页（switchTab）', calls.navs[0] === 'SWITCH:/pages/index/index', calls.navs[0]);
}

console.log('\n--- ⑥ 详情页按 kind 适配 ---');
{
  const js = read('pages/promo-detail/promo-detail.js');
  const wxml = read('pages/promo-detail/promo-detail.wxml');
  ok('★ js 从接口的 kind 算出 isCourse', /isCourse\s*=\s*p\.kind === 'course'/.test(js));
  ok('★ 课程时标题改「课程详情」', /setNavigationBarTitle\(\{\s*title: '课程详情'/.test(js));
  ok('★ wxml 有课程专属「教练」行（且受 isCourse 控制）', /\{\{isCourse && promo\.coach\}\}/.test(wxml));
  ok('★ wxml 有课程专属「课时」行', /\{\{isCourse && promo\.lesson_count\}\}/.test(wxml));
  // 两行都必须把 isCourse 判断写在自己的元素上（不是靠外层条件包住）——否则畅打也会显示教练行
  ok(
    '★ 两行各自带 isCourse 守卫（畅打不渲染）',
    /wx:if="\{\{isCourse && promo\.coach\}\}"[^>]*class="meta-row"/.test(wxml) &&
      /wx:if="\{\{isCourse && promo\.lesson_count\}\}"[^>]*class="meta-row"/.test(wxml)
  );
  // 动态：真页面 + 真 request，喂一条课程
  const page = grabPage('pages/promo-detail/promo-detail.js');
  const inst = makeInst(page, { promo: null, loading: true, participantCount: 1, form: {} });
  inst._id = '61';
  calls.titles.length = 0;
  nextResponse = {
    statusCode: 200,
    data: { ok: true, data: { id: 61, kind: 'course', title: '网球启蒙班', coach: '张教练', lesson_count: 8, promo_date: '2026-11-11', start_time: '14:00', end_time: '16:00', price_per_person: 120, signed_up: 3, max_capacity: 8, min_participants: 4, signup_deadline: '2099-01-01T00:00:00.000Z' } },
  };
  await inst.load();
  await wait();
  ok('★ 课程详情 isCourse=true', inst.data.isCourse === true);
  ok('★ 设置了「课程详情」标题', calls.titles.includes('课程详情'), JSON.stringify(calls.titles));
  // 畅打不受影响
  calls.titles.length = 0;
  nextResponse = {
    statusCode: 200,
    data: { ok: true, data: { id: 785, kind: 'promo', title: '周一上午畅打', promo_date: '2026-09-28', start_time: '09:00', end_time: '11:00', price_per_person: 50, signed_up: 1, max_capacity: 8, min_participants: 2, signup_deadline: '2099-01-01T00:00:00.000Z' } },
  };
  await inst.load();
  await wait();
  ok('★ 畅打 isCourse=false（不显示教练/课时行）', inst.data.isCourse === false);
  ok('★ 畅打不改导航标题（保持默认）', !calls.titles.includes('课程详情'), JSON.stringify(calls.titles));
}

console.log('\n--- ⑦ 分享标题按 kind 变 ---');
{
  const share = require(path.join(ROOT, 'utils', 'share.js'));
  const course = share.forPromo({ id: 61, kind: 'course', title: '网球启蒙班', price_per_person: 120, promo_date: '2026-11-11', start_time: '14:00', end_time: '16:00', cover: '' });
  ok('★ 课程分享标题用 📚 课程前缀', /^📚 课程/.test(course.title), course.title);
  ok('课程分享路径直达课程详情', course.path === '/pages/promo-detail/promo-detail?id=61', course.path);
  const promo = share.forPromo({ id: 785, kind: 'promo', title: '周一上午畅打', price_per_person: 50, promo_date: '2026-09-28', start_time: '09:00', end_time: '11:00' });
  ok('★ 畅打分享标题仍是 🎯（未被串味）', /^🎯/.test(promo.title), promo.title);
}

console.log('\n--- ⑧ 默认海报按 kind 分（2026-09-26 用户提供课程默认图）---');
{
  const cjs = read('pages/courses/courses.js');
  const djs = read('pages/promo-detail/promo-detail.js');
  ok('★ 课程列表页默认海报 = course-default.jpg', /DEFAULT_COVER = .*course-default\.jpg/.test(cjs), cjs.match(/DEFAULT_COVER = .*/)?.[0]);
  ok('畅打列表页仍用 default.jpg（未被串味）', /DEFAULT_PROMO_COVER = .*\/static\/promos\/default\.jpg/.test(read('pages/promos/promos.js')));
  ok('★ 详情页两个默认图常量都在', /DEFAULT_PROMO_COVER/.test(djs) && /DEFAULT_COURSE_COVER/.test(djs));
  ok('★ 详情页按 kind 选默认图', /isCourse \? DEFAULT_COURSE_COVER : DEFAULT_PROMO_COVER/.test(djs), djs.match(/p\.cover = .*/)?.[0]);
  // 动态：空封面时，课程用课程图、畅打用畅打图
  const page = grabPage('pages/promo-detail/promo-detail.js');
  const inst = makeInst(page, { promo: null, loading: true, participantCount: 1, form: {} });
  inst._id = '1';
  const base = { promo_date: '2026-11-11', start_time: '14:00', end_time: '16:00', price_per_person: 120, signed_up: 1, max_capacity: 8, min_participants: 2, signup_deadline: '2099-01-01T00:00:00.000Z', cover: '' };
  nextResponse = { statusCode: 200, data: { ok: true, data: { ...base, id: 61, kind: 'course', title: '课程' } } };
  await inst.load();
  await wait();
  ok('★ 课程（无封面）→ 课程默认图', /course-default\.jpg$/.test(inst.data.promo?.cover || ''), inst.data.promo?.cover);
  nextResponse = { statusCode: 200, data: { ok: true, data: { ...base, id: 785, kind: 'promo', title: '畅打' } } };
  await inst.load();
  await wait();
  ok('★ 畅打（无封面）→ 畅打默认图（未被串味）', /\/static\/promos\/default\.jpg$/.test(inst.data.promo?.cover || ''), inst.data.promo?.cover);
}

console.log(`\n合计：${pass} 过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
})();
