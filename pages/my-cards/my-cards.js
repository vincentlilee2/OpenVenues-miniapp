// 我的会员卡（2026-09-26；2026-09-27 按用户要求与「办卡充值」合并且两段式）
//
// 用户 2026-09-27 原话：
//   「将 小程序 我的 中的 我的会员卡 与 办卡充值 栏目合并：我的会员卡 ，进入后显示当前正在发行的卡，
//     但 卡的右侧显示：我要开通（明显的金黄字体），点击后进入购卡充值页面。完成充值（包括模拟充值后），
//     该卡只出现在下面 我的会员卡 列表中。上面只显示用户尚未开通的卡。」
//
// ⇒ 一页两段：
//   上段「可开通的会员卡」= 已上架模板 − 我**当前有效**的卡（有卡了就不再出现）
//   下段「我的会员卡」    = 我持有的卡（点进余额/消费列表/服务说明）
//   充值成功后 onShow 重新拉取 → 该卡自动从上面"挪到"下面（用户明确要求的观感）
const api = require('../../api/index.js');

const STATUS_TEXT = { active: '正常', frozen: '已冻结', expired: '已过期', used_up: '已用完', voided: '已作废' };

Page({
  data: { available: [], mine: [], loading: true, emptyAll: false },

  onLoad(opt) {
    // from=order：从"没卡/余额不足"的引导进来 —— 充值成功后要回原页继续付那笔单
    this._from = (opt && opt.from) || '';
    this.load();
  },

  // 充值成功返回本页 → 重新拉取，让刚开通的卡从上段消失、出现在下段
  onShow() {
    if (!this.data.loading) this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [tpls, cards] = await Promise.all([api.listCards(), api.myCards()]);
      // 「已开通」= 我有一张**当前有效**的卡（active 且未过期）。
      // 作废 / 过期 / 用完的模板会重新回到上段 —— 取消充值订单（卡作废）后还能再开通一次。
      const owned = new Set(
        (cards || [])
          .filter((c) => c.status === 'active' && !c.expired)
          .map((c) => String(c.template_id))
      );
      const mine = (cards || []).map((c) => ({
        ...c,
        statusText: c.expired ? '已过期' : STATUS_TEXT[c.status] || c.status,
        off: !!c.expired || c.status !== 'active',
      }));
      this.setData({
        available: (tpls || []).filter((t) => !owned.has(String(t.id))),
        mine,
        loading: false,
        emptyAll: !(tpls || []).length && !mine.length,
      });
    } catch (e) {
      this.setData({ loading: false, emptyAll: true });
      wx.showToast({ title: (e && e.message) || '加载失败，请稍后再试', icon: 'none' });
    }
  },

  // 我要开通 → 卡详情（立即充值）
  buyCard(e) {
    const id = e.currentTarget.dataset.id;
    const q = this._from ? `?id=${id}&from=${this._from}` : `?id=${id}`;
    wx.navigateTo({ url: `/pages/card-detail/card-detail${q}` });
  },

  openCard(e) {
    wx.navigateTo({ url: `/pages/my-card-detail/my-card-detail?id=${e.currentTarget.dataset.id}` });
  },
});
