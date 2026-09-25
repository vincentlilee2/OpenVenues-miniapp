// 首页场馆卡「♡ 收藏」回归（2026-09-25：占位 toast → 服务端真收藏 + 收藏数）
// 手法：假 wx + **真页面文件**（index.js）+ 真 api/request.js（走伪 wx.request），
//       断言乐观更新、服务端校正、失败回滚、请求方法/URL/鉴权头都对。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
};

// ---------- 假 wx ----------
const storage = { wx_token: 'fake-token-for-test', wx_uid: 'u_test' };
const calls = { requests: [], toasts: [], modals: [] };
let nextResponse = { statusCode: 200, data: { ok: true, data: { favorited: true, fav_count: 1 } } };
let snapshotAtRequest = null;

global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  showToast: (o) => calls.toasts.push(o),
  showModal: (o) => calls.modals.push(o),
  request: (o) => {
    calls.requests.push({ url: o.url, method: o.method, header: o.header });
    if (snapshotAtRequest) snapshotAtRequest();
    setTimeout(() => {
      if (nextResponse.fail) o.fail && o.fail(nextResponse.fail);
      else o.success && o.success({ statusCode: nextResponse.statusCode, data: nextResponse.data });
    }, 0);
  },
  navigateTo: () => {},
  showShareMenu: () => {},
};

// ---------- 抓真页面对象 ----------
let pageObj = null;
global.Page = (o) => { pageObj = o; };
require(path.join(ROOT, 'pages', 'index', 'index.js'));

function makeInst(data) {
  const inst = Object.create(pageObj);
  inst.data = JSON.parse(JSON.stringify(data));
  // 支持 wx 的路径式 setData（'venues[0].favorited'）
  inst.setData = (patch) => {
    for (const [k, v] of Object.entries(patch)) {
      const m = k.match(/^([A-Za-z0-9_]+)\[(\d+)\]\.([A-Za-z0-9_]+)$/);
      if (m) inst.data[m[1]][Number(m[2])][m[3]] = v;
      else inst.data[k] = v;
    }
  };
  return inst;
}
const VENUES = () => [
  { id: 1, name: '室外网球场', favorited: false, fav_count: 0, court_count: 2 },
  { id: 3, name: '室内匹克球馆', favorited: true, fav_count: 5, court_count: 5 },
];
const tap = (inst, id) => pageObj.toggleFav.call(inst, { currentTarget: { dataset: { id } } });
const tick = () => new Promise((r) => setTimeout(r, 5));

(async () => {
  console.log('--- 1) 未收藏 → 点一下 = 收藏 ---');
  {
    calls.requests.length = 0; calls.toasts.length = 0;
    nextResponse = { statusCode: 200, data: { ok: true, data: { favorited: true, fav_count: 1 } } };
    const inst = makeInst({ venues: VENUES() });
    const before = JSON.stringify(inst.data.venues[0]);
    let atRequest = null;
    snapshotAtRequest = () => { atRequest = JSON.parse(JSON.stringify(inst.data.venues[0])); };
    const p = tap(inst, 1);
    await p; await tick();
    // ⚠️ 断言必须放在 await 之后：wx.request 是在微任务里才发出的，
    //    在 await 之前断言 atRequest 永远是 null（本次实测踩到）
    snapshotAtRequest = null;
    ok('★ 乐观更新：请求发出时界面已翻转（♡→♥、计数先 +1）', atRequest && atRequest.favorited === true && atRequest.fav_count === 1, JSON.stringify(atRequest));
    const r = calls.requests[0] || {};
    ok('请求方法 POST', r.method === 'POST', r.method);
    ok('请求 URL 正确', /\/api\/venues\/1\/favorite$/.test(r.url || ''), r.url);
    ok('带了 Authorization（真收藏必须登录）', /^Bearer /.test(r.header?.Authorization || ''), r.header?.Authorization);
    ok('最终 favorited=true', inst.data.venues[0].favorited === true);
    ok('最终 fav_count=1', inst.data.venues[0].fav_count === 1, inst.data.venues[0].fav_count);
    ok('另一个场馆没被改动', JSON.stringify(inst.data.venues[1]) === JSON.stringify(VENUES()[1]));
    ok('弹了「已收藏」', calls.toasts.some((t) => t.title === '已收藏'), JSON.stringify(calls.toasts));
    ok('不再出现旧的占位文案', !calls.toasts.some((t) => /占位/.test(t.title || '')));
  }

  console.log('\n--- 2) 服务端返回的值优先（别人也在收藏，本地猜的不算数）---');
  {
    nextResponse = { statusCode: 200, data: { ok: true, data: { favorited: true, fav_count: 9 } } };
    const inst = makeInst({ venues: VENUES() });
    await tap(inst, 1); await tick();
    ok('★ 以服务端 fav_count=9 校正（不是本地猜的 1）', inst.data.venues[0].fav_count === 9, inst.data.venues[0].fav_count);
  }

  console.log('\n--- 3) 已收藏 → 点一下 = 取消 ---');
  {
    calls.requests.length = 0;
    nextResponse = { statusCode: 200, data: { ok: true, data: { favorited: false, fav_count: 4 } } };
    const inst = makeInst({ venues: VENUES() });
    await tap(inst, 3); await tick();
    const r = calls.requests[0] || {};
    ok('请求方法 DELETE', r.method === 'DELETE', r.method);
    ok('URL 正确', /\/api\/venues\/3\/favorite$/.test(r.url || ''), r.url);
    ok('favorited 变 false', inst.data.venues[3 === 3 ? 1 : 0].favorited === false);
    ok('fav_count=4', inst.data.venues[1].fav_count === 4, inst.data.venues[1].fav_count);
    ok('弹了「已取消收藏」', calls.toasts.some((t) => t.title === '已取消收藏'));
  }

  console.log('\n--- 4) 接口失败 → 回滚 + 提示（不许界面和库里不一致）---');
  {
    calls.toasts.length = 0;
    nextResponse = { statusCode: 500, data: { ok: false, error: '服务器开小差了' } };
    const inst = makeInst({ venues: VENUES() });
    const before = JSON.stringify(inst.data.venues[0]);
    await tap(inst, 1); await tick();
    ok('★ 回滚到点击前（favorited=false, fav_count=0）', JSON.stringify(inst.data.venues[0]) === before, JSON.stringify(inst.data.venues[0]));
    ok('提示了错误信息', calls.toasts.some((t) => /服务器开小差/.test(t.title || '')), JSON.stringify(calls.toasts.map((t) => t.title)));
  }

  console.log('\n--- 5) 失败态：token 过期且重登失败（401 且 ready 抛错）---');
  {
    delete storage.wx_token; // 没有 token → request() 会走 session.ready() → wx.login（未 stub → 抛错）
    nextResponse = { statusCode: 200, data: { ok: true } };
    const inst = makeInst({ venues: VENUES() });
    await tap(inst, 1); await tick();
    ok('★ 不崩、且状态回滚', inst.data.venues[0].favorited === false, JSON.stringify(inst.data.venues[0]));
    storage.wx_token = 'fake-token-for-test';
  }

  console.log('\n--- 6) 静态接线 ---');
  {
    const wxml = read('pages/index/index.wxml');
    const wxss = read('pages/index/index.wxss');
    const js = read('pages/index/index.js');
    const apiSrc = read('api/index.js');
    const reqSrc = read('api/request.js');
    ok('★ 卡片上有 ♡/♥ 双态绑定', /\{\{item\.favorited \? '♥' : '♡'\}\}/.test(wxml));
    ok('★ 已收藏时加 .on 类（视觉区分）', /class="venue-fav \{\{item\.favorited \? 'on' : ''\}\}"/.test(wxml));
    ok('仍是 catchtap（不冒泡到卡片的跳转）', /class="venue-fav[^>]*catchtap="toggleFav"/.test(wxml));
    ok('★ 名称行显示收藏数 ♥ N', /class="venue-fav-count"[\s\S]{0,80}?♥ \{\{item\.fav_count\}\}/.test(wxml));
    ok('收藏数 0 时不显示（避免反向社会证明）', /wx:if="\{\{item\.fav_count > 0\}\}"/.test(wxml.replace(/\n\s*/g, ' ')));
    ok('.venue-fav.on 样式已定义', /\.venue-fav\.on\s*\{/.test(wxss));
    ok('.venue-fav-count 样式已定义', /\.venue-fav-count\s*\{/.test(wxss));
    ok('♡ 仍在封面容器内（不能移出去，否则会飘到页顶）', /<view class="venue-cover-wrap">[\s\S]*?class="venue-fav/.test(wxml));
    ok('toggleFav 是 async（要 await 接口）', /async toggleFav\(e\)/.test(js));
    ok('★ 已无「占位」toast 文案', !/已收藏（占位）/.test(js));
    ok('★ 失败会回滚（catch 里 setData 回原值）', /const curFavorited = !!this\.data\.venues\[i\]\.favorited/.test(js) && /catch \(err\)[\s\S]{0,400}\[`venues\[\$\{i\}\]\.favorited`\]: curFavorited/.test(js));
    ok('api 暴露 favoriteVenue / unfavoriteVenue', /favoriteVenue:/.test(apiSrc) && /unfavoriteVenue:/.test(apiSrc));
    ok('listVenues 用 optional 鉴权（带 token 但不强制登录）', /listVenues:[^\n]*auth: 'optional'/.test(apiSrc));
    ok('request.js 支持 auth:\'optional\'（不强制登录、带 token）', /opts\.auth !== 'optional'/.test(reqSrc));
  }

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
