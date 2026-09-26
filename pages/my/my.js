const session = require('../../utils/session.js');
const api = require('../../api/index.js');
const avatarUtil = require('../../utils/avatar.js');
const { version } = require('../../config.js');

Page({
  data: {
    version,
    loggedIn: false,
    uidShort: '',
    nickname: '',
    avatar: '',
    statusText: '未登录',
    loggingIn: false,
    editing: false,
    saving: false,
    form: { nickname: '', avatar: '' },
  },

  onShow() {
    this.syncTabBar();
    this.refresh();
    this.syncProfile();
  },

  // 从服务端同步最新资料（昵称/头像可能是在别的设备上设置的，或管理员帮改绑过）
  async syncProfile() {
    if (!session.isLoggedIn()) return;
    try {
      const user = await api.authMe();
      session.setProfile(user);
      this.refresh();
    } catch (e) {
      // 拉取失败就继续用本地缓存，不打扰用户
      console.warn('[my] 同步资料失败:', (e && e.error) || e);
    }
  },

  // 每个 tab 页更新「自己那份」custom-tab-bar 实例（官方 API）
  syncTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  refresh() {
    const loggedIn = session.isLoggedIn();
    const profile = session.getProfile() || {};
    const uid = session.getUid();
    this.setData({
      loggedIn,
      uidShort: uid ? uid.replace(/^u_/, '').slice(0, 8) : '',
      nickname: profile.nickname || '',
      avatar: session.displayAvatar(profile.avatar),
      statusText: loggedIn ? '已通过微信登录' : '未登录',
      // 微信不会自动给昵称头像：没设置过就在卡片里给出可点提示
      needProfile: loggedIn && (!profile.nickname || !profile.avatar),
    });
  },

  // 按钮：微信一键登录
  async onLogin() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true });
    try {
      await session.login(true);
      this.refresh();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (e) {
      wx.showModal({
        title: '登录失败',
        content: (e && e.message) || '请检查网络后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ loggingIn: false });
    }
  },

  async onLogout() {
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '退出登录',
        content: '退出后需要重新用微信登录才能查看订单，确定退出？',
        confirmText: '退出',
        cancelText: '取消',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!ok) return;
    try {
      await api.logout();
    } catch (e) {
      // token 已失效也无所谓，继续清理本地
    }
    session.clear();
    this.refresh();
    wx.showToast({ title: '已退出', icon: 'none' });
  },

  // 打开「更新微信头像昵称」
  openEditor() {
    if (!this.data.loggedIn) {
      this.onLogin();
      return;
    }
    this.setData({
      editing: true,
      form: {
        nickname: this.data.nickname || '',
        avatar: this.data.avatar || '',
        avatarPending: false,
      },
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  // 微信头像选择（button open-type="chooseAvatar"）
  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl;
    if (!url) return;
    // 这是本机临时路径：先本地预览，保存时再上传（否则换个设备/后台都看不到）
    this.setData({ 'form.avatar': url, 'form.avatarPending': true });
  },

  onNicknameInput(e) {
    this.setData({ 'form.nickname': e.detail.value });
  },

  async saveProfile() {
    let { nickname, avatar } = this.data.form;
    if (!nickname && !avatar) {
      wx.showToast({ title: '请先选择头像或填昵称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      // 微信给的头像是本机临时文件 → 必须先上传拿回可长期访问的地址
      if (avatarUtil.isLocalTemp(avatar)) {
        wx.showLoading({ title: '上传头像中…', mask: true });
        try {
          avatar = await avatarUtil.uploadAvatar(avatar);
        } finally {
          wx.hideLoading();
        }
      }
      const user = await api.saveProfile({ nickname, avatar });
      session.setProfile(user);
      this.setData({ editing: false });
      this.refresh();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showModal({ title: '保存失败', content: (e && e.error) || '请稍后再试', showCancel: false });
    } finally {
      this.setData({ saving: false });
    }
  },

  goOrders(e) {
    const status = e.currentTarget.dataset.status || 'all';
    if (status !== 'all') wx.setStorageSync('order_filter', status);
    // 订单页自 2026-09-26 起不是 tabBar 页 → 必须用 navigateTo（switchTab 会静默失败）
    wx.navigateTo({ url: '/pages/order-list/order-list' });
  },

  // 活动页不是 tabBar 页 → 必须用 navigateTo
  goPromos() {
    wx.navigateTo({ url: '/pages/promos/promos' });
  },

  // 我的收藏（2026-09-25）：也不是 tabBar 页 → navigateTo
  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },

  openFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '请通过客服微信或邮件提交反馈，本期暂未对接在线表单。',
      showCancel: false,
    });
  },
});
