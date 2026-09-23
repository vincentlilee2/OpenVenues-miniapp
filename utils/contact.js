// 下单联系人自动填充（约场 + 畅打报名共用）
//
// 优先级：本机上次填写 > 登录用户资料（微信昵称 / 手机号）
//   理由：用户改过的联系人是他有意选的（帮朋友订、留本名），不该被昵称盖掉；
//        从没填过时才用登录用户的昵称/手机号，省得再敲一遍。
//
// 关于手机号：`venue_users.phone` 只有用户做过「手机号快速验证」(/api/auth/phone) 才有值，
//   目前该能力需企业主体开通，所以多数用户是 null —— 这时靠「上次填过的」本机缓存，
//   并且下单成功后会把号码 best-effort 补进用户资料（服务端只在为空时写），换设备也能自动填。
const NAME_KEY = 'contact_name';
const PHONE_KEY = 'contact_phone';

function isPhone(v) {
  return /^1\d{10}$/.test(String(v == null ? '' : v).trim());
}
function isName(v) {
  return !!String(v == null ? '' : v).trim();
}

/** 纯函数：按优先级合并（便于单测，不依赖 wx） */
function mergeContact(stored, profile) {
  const s = stored || {};
  const p = profile || {};
  return {
    name: String(s.name || p.nickname || '').trim(),
    phone: String(s.phone || p.phone || '').trim(),
  };
}

/** 读本机缓存（兼容旧版畅打页存的 booker 结构，一次性迁移） */
function loadStored() {
  const legacy = (wx.getStorageSync('booker') || {}) || {};
  return {
    name: wx.getStorageSync(NAME_KEY) || legacy.booker_name || '',
    phone: wx.getStorageSync(PHONE_KEY) || legacy.booker_phone || '',
  };
}

/** 写本机缓存（只存看起来有效的值，别把半截输入记下来） */
function saveStored(payload) {
  const { name, phone } = payload || {};
  try {
    if (isName(name)) wx.setStorageSync(NAME_KEY, String(name).trim());
    if (isPhone(phone)) wx.setStorageSync(PHONE_KEY, String(phone).trim());
  } catch (e) {
    console.log('[contact] 缓存写入失败：', e && e.message);
  }
}

/**
 * 解析出要填入表单的联系人
 * @param {object} [inj] 仅测试用：{ api, session } 注入假实现
 * @returns {Promise<{name:string, phone:string}>}
 */
async function resolveContact(inj) {
  const api = (inj && inj.api) || require('../api/index.js');
  const session = (inj && inj.session) || require('./session.js');
  const stored = loadStored();
  let profile = {};
  try {
    if (session.isLoggedIn && session.isLoggedIn()) {
      // 先用登录时缓存过的资料兜底（不卡 UI），再拉一次最新的
      profile = (session.getProfile && session.getProfile()) || {};
      const me = await api.authMe();
      if (me) {
        profile = me;
        if (session.setProfile) session.setProfile(me);
      }
    }
  } catch (e) {
    // 未登录 / 网络失败 / 后端没配微信凭据 —— 都退化成「只用本机缓存」，不要卡住下单页
    console.log('[contact] 取用户资料失败，仅用本机缓存：', (e && (e.error || e.message)) || e);
  }
  return mergeContact(stored, profile);
}

/** 下单成功后的收尾：记到本机 + 资料里没手机号时补上（失败静默，别影响下单结果） */
function persistContact(api, payload) {
  saveStored(payload);
  try {
    const phone = (payload || {}).phone;
    if (isPhone(phone) && api && api.saveProfile) {
      Promise.resolve(api.saveProfile({ phone: String(phone).trim() })).catch(() => {});
    }
  } catch (e) {
    console.log('[contact] 手机号补写资料失败：', e && e.message);
  }
}

module.exports = {
  NAME_KEY,
  PHONE_KEY,
  isPhone,
  isName,
  mergeContact,
  loadStored,
  saveStored,
  resolveContact,
  persistContact,
};
