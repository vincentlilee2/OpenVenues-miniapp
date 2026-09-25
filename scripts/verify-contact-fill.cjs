// 下单联系人自动填入 验证（约场页 + 畅打页）
// 用法：env -u PYTHONPATH node scripts/verify-contact-fill.cjs
//
// 做法：假 wx + **真的页面文件**（require 真实 pages/*/*.js）——比点模拟器快得多，
// 也能一次覆盖「已登录/未登录/接口失败/本机缓存优先」四种分支。
//
// 需求（用户 2026-09-23）：在小程序上提交畅打订单 和 约场订单时，
// 应能自动填入已登录用户的昵称和手机号。
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

// ---------- 假 wx ----------
function makeWx({ storage = {}, meResponse = null, meFails = false } = {}) {
  const calls = { requests: [], toasts: [], modals: [] };
  const store = { ...storage };
  const wx = {
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => {
      store[k] = v;
    },
    removeStorageSync: (k) => {
      delete store[k];
    },
    showToast: (o) => calls.toasts.push(o),
    showModal: (o) => {
      calls.modals.push(o);
      if (o.success) o.success({ confirm: false });
    },
    navigateTo: () => {},
    switchTab: () => {},
    login: ({ success }) => success({ code: 'test_code' }),
    request: ({ url, success, fail }) => {
      calls.requests.push(url);
      if (url.indexOf('/api/auth/me') >= 0) {
        if (meFails) return fail && fail({ errMsg: 'network down' });
        return success && success({ statusCode: 200, data: { ok: true, data: meResponse } });
      }
      return success && success({ statusCode: 200, data: { ok: true, data: {} } });
    },
  };
  return { wx, calls, store };
}

// ---------- 用真页面文件造实例 ----------
function loadPage(relFile, wx) {
  global.wx = wx;
  let pageObj = null;
  global.Page = (o) => {
    pageObj = o;
  };
  const abs = path.join(ROOT, relFile);
  delete require.cache[require.resolve(abs)];
  require(abs);
  if (!pageObj) throw new Error('页面没有调用 Page()：' + relFile);
  const inst = Object.create(pageObj);
  inst.data = JSON.parse(JSON.stringify(pageObj.data || {}));
  inst.setData = (patch) => Object.assign(inst.data, patch);
  return inst;
}

const LOGGED = { wx_token: 'tok', wx_uid: 'u_test', wx_profile: { uid: 'u_test', nickname: '缓存昵称' } };

(async () => {
  // ==================== 纯函数：优先级合并 ====================
  console.log('--- 1) mergeContact 优先级 ---');
  const contact = require(path.join(ROOT, 'utils/contact.js'));
  let m = contact.mergeContact({ name: '我填的', phone: '13800138000' }, { nickname: '昵称', phone: '13900139000' });
  ok('本机填写优先于资料昵称', m.name === '我填的', m.name);
  ok('本机填写优先于资料手机号', m.phone === '13800138000', m.phone);
  m = contact.mergeContact({}, { nickname: '昵称', phone: '13900139000' });
  ok('没填过 → 用资料昵称', m.name === '昵称', m.name);
  ok('没填过 → 用资料手机号', m.phone === '13900139000', m.phone);
  m = contact.mergeContact({ name: '', phone: '' }, { nickname: '', phone: null });
  ok('两边都空 → 空串（不编假数据）', m.name === '' && m.phone === '', JSON.stringify(m));

  console.log('\n--- 2) 只存看起来有效的值 ---');
  {
    const { wx } = makeWx({ storage: {} });
    global.wx = wx;
    contact.saveStored({ name: '张三', phone: '13800138000' });
    ok('有效姓名+手机号已缓存', wx.getStorageSync('contact_name') === '张三' && wx.getStorageSync('contact_phone') === '13800138000');
    contact.saveStored({ name: '李四', phone: '1380013800' }); // 少一位
    ok('非法手机号不覆盖已缓存的好号', wx.getStorageSync('contact_phone') === '13800138000', wx.getStorageSync('contact_phone'));
  }

  // ==================== 约场页 ====================
  console.log('\n--- 3) 约场页：已登录 → 自动填入昵称 + 手机号 ---');
  {
    const { wx, calls, store } = makeWx({
      storage: { ...LOGGED },
      meResponse: { uid: 'u_test', nickname: '微信昵称', phone: '13900139000', avatar: '' },
    });
    const page = loadPage('pages/book/book.js', wx);
    ok('新加的联系人字段有默认值', 'contact_name' in page.data && 'contact_phone' in page.data);
    await page.fillContact();
    ok('姓名自动填入登录用户昵称', page.data.contact_name === '微信昵称', page.data.contact_name);
    ok('手机号自动填入登录用户手机号', page.data.contact_phone === '13900139000', page.data.contact_phone);
    ok('确实请求了 /api/auth/me', calls.requests.some((u) => u.indexOf('/api/auth/me') >= 0), JSON.stringify(calls.requests));
    ok('资料顺带更新进本机缓存', (store.wx_profile || {}).phone === '13900139000', JSON.stringify(store.wx_profile));
  }

  console.log('\n--- 4) 约场页：本机填过 → 不被昵称覆盖 ---');
  {
    const { wx } = makeWx({
      storage: { ...LOGGED, contact_name: '帮朋友订', contact_phone: '13800138000' },
      meResponse: { uid: 'u_test', nickname: '微信昵称', phone: '13900139000' },
    });
    const page = loadPage('pages/book/book.js', wx);
    await page.fillContact();
    ok('保留本机填的姓名', page.data.contact_name === '帮朋友订', page.data.contact_name);
    ok('保留本机填的手机号', page.data.contact_phone === '13800138000', page.data.contact_phone);
  }

  console.log('\n--- 5) 约场页：未登录 → 不填、不崩 ---');
  {
    const { wx, calls } = makeWx({ storage: {}, meResponse: { nickname: 'x' } });
    const page = loadPage('pages/book/book.js', wx);
    await page.fillContact();
    ok('姓名保持空', page.data.contact_name === '', page.data.contact_name);
    ok('手机号保持空', page.data.contact_phone === '', page.data.contact_phone);
    ok('未登录不请求 /api/auth/me', !calls.requests.some((u) => u.indexOf('/api/auth/me') >= 0), JSON.stringify(calls.requests));
  }

  console.log('\n--- 6) 约场页：接口失败 → 退回本机缓存，不抛错 ---');
  {
    const { wx } = makeWx({ storage: { ...LOGGED, contact_name: '老张', contact_phone: '13800138000' }, meFails: true });
    const page = loadPage('pages/book/book.js', wx);
    let threw = null;
    try {
      await page.fillContact();
    } catch (e) {
      threw = e;
    }
    ok('没有抛错', !threw, threw && threw.message);
    ok('用本机缓存填入', page.data.contact_name === '老张' && page.data.contact_phone === '13800138000', JSON.stringify({ n: page.data.contact_name, p: page.data.contact_phone }));
  }

  console.log('\n--- 7) 约场页：下单联系人取的是输入框的值（不再是写死的假号）---');
  {
    const src = fs.readFileSync(path.join(ROOT, 'pages/book/book.js'), 'utf8');
    ok('源码里已无 13800138000 假号', src.indexOf('13800138000') < 0);
    ok('提交时用的是 contactName/contactPhone', /contact_name:\s*contactName/.test(src) && /contact_phone:\s*contactPhone/.test(src));
    ok('提交前有姓名/手机号校验', /isName\(contactName\)/.test(src) && /isPhone\(contactPhone\)/.test(src));
    ok('成功后写回本机缓存', /persistContact/.test(src));
    const wxml = fs.readFileSync(path.join(ROOT, 'pages/book/book.wxml'), 'utf8');
    ok('wxml 里有联系人输入框', /contact_name/.test(wxml) && /contact_phone/.test(wxml));
  }

  // ==================== 畅打页 ====================
  console.log('\n--- 8) 畅打页：已登录 → 自动填入昵称 + 手机号 ---');
  {
    const { wx } = makeWx({
      storage: { ...LOGGED },
      meResponse: { uid: 'u_test', nickname: '微信昵称', phone: '13900139000' },
    });
    const page = loadPage('pages/promo-detail/promo-detail.js', wx);
    // 只测自动填入，不触发 load()（那会请求活动详情）
    global.getApp = () => ({ globalData: {} });
    await page.fillContact();
    ok('报名人姓名自动填入', page.data.form.booker_name === '微信昵称', page.data.form.booker_name);
    ok('报名人手机号自动填入', page.data.form.booker_phone === '13900139000', page.data.form.booker_phone);
  }

  console.log('\n--- 9) 畅打页：兼容旧版 booker 缓存 ---');
  {
    const { wx } = makeWx({
      storage: { ...LOGGED, booker: { booker_name: '旧缓存名', booker_phone: '13800138000' } },
      meResponse: { uid: 'u_test', nickname: '微信昵称', phone: '13900139000' },
    });
    const page = loadPage('pages/promo-detail/promo-detail.js', wx);
    await page.fillContact();
    ok('旧缓存照样被沿用', page.data.form.booker_name === '旧缓存名' && page.data.form.booker_phone === '13800138000', JSON.stringify(page.data.form));
  }

  console.log(`\n${errs.length === 0 ? '✓ 全部通过' : `✗ ${errs.length} 项失败: ${errs.join(' / ')}`}`);
  process.exit(errs.length === 0 ? 0 : 1);
})();
