// 自定义 tabBar
// 关键：tabBar 页常驻，每个 tab 页各有一份本组件实例。
// 由各页面在 onShow 中通过 this.getTabBar() 更新自己那份，不在此处做跨页同步。
Component({
  data: {
    selected: 0,
  },

  methods: {
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.idx);
      const path = e.currentTarget.dataset.path;
      // 立即高亮（本页那份），再切页
      this.setData({ selected: idx });
      wx.switchTab({ url: path });
    },
  },
});
