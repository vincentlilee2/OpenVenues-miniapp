// 服务介绍（文章，2026-09-26）小程序侧验证
//   覆盖：
//   ① 接口接线（listArticles / getArticle）与新页注册
//   ② 文章详情页：正文分段渲染、发布时间、封面绝对 URL、**没有报名按钮/表单/价格**（纯展示）
//   ③ 服务介绍列表页：按场馆过滤、摘要、点进文章页、空态
//   ④ 「活动与课程」页：文章**排在活动列表最后**，卡片是文章变体，点它进文章页
//   ⑤ 场馆详情页：名字行右侧换成「介绍…」、导航挪到「地址」行右侧、地址**完整可折行不截断**
// 手法：假 wx + 真页面文件 + 真 api/request.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

const storage = {};
const calls = { requests: [], navs: [], titles: [] };
let responses = {};
global.wx = {
  getStorageSync: (k) => storage[k] || '',
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  showToast: (o) => calls.toasts && calls.toasts.push(o),
  showModal: () => {},
  request: (o) => {
    calls.requests.push({ url: o.url });
    const key = Object.keys(responses).find((k) => o.url.includes(k));
    const data = key ? responses[key] : [];
    setTimeout(() => o.success && o.success({ statusCode: 200, data: { ok: true, data } }), 0);
  },
  navigateTo: (o) => calls.navs.push(o.url),
  navigateBack: () => calls.navs.push('BACK'),
  switchTab: (o) => calls.navs.push('SWITCH:' + o.url),
  setNavigationBarTitle: (o) => calls.titles.push(o.title),
  showShareMenu: () => {},
  makePhoneCall: () => {},
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
const config = require(path.join(ROOT, 'config.js'));
const apiBase = config.apiBase.replace(/\/$/, '');

(async () => {
  console.log('--- ① 接口接线与页面注册 ---');
  {
    const apiSrc = read('api/index.js');
    ok('★ api 有 listArticles', /listArticles:\s*\(venueId\)[\s\S]{0,80}\/api\/articles/.test(apiSrc), apiSrc.match(/listArticles.*/)?.[0]);
    ok('★ api 有 getArticle', /getArticle:\s*\(id\)[\s\S]{0,60}\/api\/articles\/\$\{id\}/.test(apiSrc), apiSrc.match(/getArticle.*/)?.[0]);
    const app = JSON.parse(read('app.json'));
    ok('★ app.json 注册了 pages/article/article', app.pages.includes('pages/article/article'));
    ok('★ app.json 注册了 pages/articles/articles', app.pages.includes('pages/articles/articles'));
    const files = [
      ['pages/article/article.js', 'pages/article/article.wxml', 'pages/article/article.wxss', 'pages/article/article.json'],
      ['pages/articles/articles.js', 'pages/articles/articles.wxml', 'pages/articles/articles.wxss', 'pages/articles/articles.json'],
    ].flat();
    for (const f of files) ok(`存在 ${f}`, fs.existsSync(path.join(ROOT, f)));
  }

  console.log('\n--- ② 文章详情页：纯展示（无报名）---');
  {
    const js = read('pages/article/article.js');
    const wxml = read('pages/article/article.wxml');
    // 关键：这是文章页，不能有报名相关 UI
    // ⚠️ 断言前先剥 HTML 注释：我在 wxml 注释里写了「刻意没有「立即报名」按钮…」说明设计意图，
    //    不剥注释就会**被自己的注释命中**（本仓第三次踩这个坑）
    const wxmlNoComment = wxml.replace(/<!--[\s\S]*?-->/g, '');
    ok('★ wxml 没有「立即报名」', !/立即报名/.test(wxmlNoComment));
    ok('★ wxml 没有报名表单（booker_name / participant）', !/booker_name|participant_count|participantCount/.test(wxmlNoComment));
    ok('★ wxml 没有价格 / 人数 / 成团字样', !/¥|已报|成团|成班/.test(wxmlNoComment));
    ok('★ wxml 没有 signupPromo 之类调用', !/signup/i.test(js + wxmlNoComment));
    ok('★ js 里没有引入报名/支付工具', !/utils\/pay|signupPromo/.test(js));
    ok('wxml 渲染正文段落（paragraphs）', /wx:for="\{\{paragraphs\}\}"/.test(wxml));
    ok('wxml 渲染封面背景图 + 标题/副标题', /article\.cover/.test(wxml) && /article\.title/.test(wxml) && /article\.subtitle/.test(wxml));
    ok('有分享钩子（详情页一致风格）', /onShareAppMessage/.test(js) && /onShareTimeline/.test(js));

    // 动态：真页面 + 真 request
    const page = grabPage('pages/article/article.js');
    const inst = makeInst(page, { article: null, loading: true, paragraphs: [], publishText: '' });
    inst._id = '7';
    responses = {
      '/api/articles/7': {
        id: 7,
        title: '场馆简介',
        subtitle: '专业教练',
        content: '第一段\n\n第二段\n第三段',
        paragraphs: ['第一段', '第二段', '第三段'],
        cover: '/uploads/articles/a1.jpg',
        publish_at: '2026-09-26T02:30:00.000Z',
        venue_name: '室外网球场',
      },
    };
    calls.requests.length = 0;
    await inst.load();
    await wait();
    ok('★ 请求 /api/articles/7', calls.requests.some((r) => /\/api\/articles\/7$/.test(r.url)), JSON.stringify(calls.requests.map((r) => r.url)));
    ok('★ paragraphs 渲染为 3 段', inst.data.paragraphs.length === 3, JSON.stringify(inst.data.paragraphs));
    ok('★ 封面相对路径 → 绝对 URL', inst.data.article.cover === `${apiBase}/uploads/articles/a1.jpg`, inst.data.article.cover);
    ok('★ 发布时间已格式化（非空）', !!inst.data.publishText, inst.data.publishText);
    ok('loading 归位', inst.data.loading === false);

    // 后端没给 paragraphs 时（老数据/直连）也要能按换行兜底拆段
    const inst2 = makeInst(page, { article: null, loading: true, paragraphs: [] });
    inst2._id = '8';
    responses = { '/api/articles/8': { id: 8, title: 'x', content: 'A\nB\n\nC' } };
    await inst2.load();
    await wait();
    ok('★ 后端没给 paragraphs 时按换行兜底拆段（空行忽略）', JSON.stringify(inst2.data.paragraphs) === JSON.stringify(['A', 'B', 'C']), JSON.stringify(inst2.data.paragraphs));
  }

  console.log('\n--- ③ 服务介绍列表页 ---');
  {
    const js = read('pages/articles/articles.js');
    ok('★ 按 venue_id 过滤请求', /listArticles\(this\._venueId\)/.test(js));
    ok('点文章进 /pages/article/article', /\/pages\/article\/article\?id=\$\{id\}/.test(js));
    const page = grabPage('pages/articles/articles.js');
    const inst = makeInst(page, { list: [], loading: true, empty: false, venueName: '' });
    inst._onLoadHack = null;
    inst._venueId = '3';
    inst.setData({ venueName: '室外网球场' });
    responses = {
      '/api/articles': [
        { id: 11, title: '场馆简介', subtitle: '专业教练', content: '我们场馆有 5 片标准场地，空调休息区齐全……', cover: '', publish_at: '2026-09-26T02:30:00.000Z', venue_name: '室外网球场' },
      ],
    };
    await inst.load();
    await wait();
    const a = inst.data.list[0];
    ok('列表拿到 1 条', inst.data.list.length === 1);
    ok('★ 摘要按正文前 60 字生成（去换行）', /我们场馆有 5 片标准场地/.test(a.excerpt) && !/\n/.test(a.excerpt), a.excerpt);
    ok('没封面 → 空（wxml 用渐变底占位，不报错）', a.cover === '');
    ok('发布时间已格式化', !!a.publishText);
    calls.navs.length = 0;
    inst.openArticle({ currentTarget: { dataset: { id: 11 } } });
    ok('★ 点文章 → 文章详情页', calls.navs[0] === '/pages/article/article?id=11', calls.navs[0]);
    // 空态
    responses = { '/api/articles': [] };
    await inst.load();
    await wait();
    ok('★ 没有文章 → empty=true（空态提示）', inst.data.empty === true);
    ok('wxml 空态有文案', /还没有介绍文章/.test(read('pages/articles/articles.wxml')));
  }

  console.log('\n--- ④ 「活动与课程」页：文章排在活动列表最后 ---');
  {
    const wxml = read('pages/activity/activity.wxml');
    ok('★ wxml 有文章卡变体（kind === article 走 else 分支）', /wx:else class="card art-card"/.test(wxml) && /data-kind="article"/.test(wxml));
    ok('★ 文章卡不带价格/已报（纯文章视觉）', !/art-card[\s\S]{0,600}signed_up/.test(wxml));
    ok('wxml 区分活动/课程卡与文章卡', /item\.kind !== 'article'/.test(wxml));
    const js = read('pages/activity/activity.js');
    ok('★ 文章拼在活动列表**最后**（[...list, ...arts]）', /merged = \[\.\.\.list, \.\.\.arts\]/.test(js), js.match(/merged = .*/)?.[0]);
    ok('★ 文章只挂在活动段（课程段不掺文章）', /if \(!isCourse\) \{/.test(js));
    ok('★ 点文章卡 → 文章页（不是报名详情页）', /kind === 'article'\) return wx\.navigateTo\(\{ url: `\/pages\/article\/article\?id=\$\{id\}` \}\)/.test(js));

    // 动态：三类都喂，断言顺序
    const page = grabPage('pages/activity/activity.js');
    const inst = makeInst(page, { seg: 'promo', list: [], loading: true });
    responses = {
      '/api/promos': [{ id: 1, title: '周一畅打', promo_date: '2026-09-28', start_time: '09:00', end_time: '11:00', price_per_person: 50, signed_up: 1, max_capacity: 8, min_participants: 2, signup_deadline: '2099-01-01T00:00:00.000Z', is_recurrence_instance: 0, recurrence_kind: 'none' }],
      '/api/courses': [{ id: 2, kind: 'course', title: '网球课', promo_date: '2026-10-01', start_time: '14:00', end_time: '16:00', price_per_person: 120, signed_up: 0, max_capacity: 8, min_participants: 2, signup_deadline: '2099-01-01T00:00:00.000Z', is_recurrence_instance: 0, recurrence_kind: 'none' }],
      '/api/articles': [{ id: 3, title: '场馆简介', subtitle: '副标题', content: '正文内容很长很长……', publish_at: '2026-09-26T02:30:00.000Z', venue_name: '室外网球场' }],
    };
    calls.requests.length = 0;
    await inst.loadAll();
    await wait();
    ok('★ 三个接口都拉了', calls.requests.length >= 3 && calls.requests.some((r) => /\/api\/articles/.test(r.url)), JSON.stringify(calls.requests.map((r) => r.url)));
    const seq = inst.data.list.map((x) => `${x.kind}:${x.id}`);
    ok('★ 活动段 = 活动在前、文章在最后', JSON.stringify(seq) === JSON.stringify(['promo:1', 'article:3']), JSON.stringify(seq));
    const art = inst.data.list[inst.data.list.length - 1];
    ok('★ 文章条目带 kind=article（供 wxml 选卡片）', art.kind === 'article');
    ok('★ 文章摘要已生成', /正文内容/.test(art.excerpt), art.excerpt);
    ok('文章没有 metaSub/chips 这类活动字段', art.metaSub === undefined && art.chips === undefined);
    // 切到课程段：不含文章
    inst.switchSeg({ currentTarget: { dataset: { seg: 'course' } } });
    await wait();
    ok('★ 课程段只有课程（不掺文章）', inst.data.list.length === 1 && inst.data.list[0].kind === 'course', JSON.stringify(inst.data.list.map((x) => x.kind)));
    // 点文章
    calls.navs.length = 0;
    inst.openDetail({ currentTarget: { dataset: { id: 3, kind: 'article' } } });
    ok('★ 点文章 → 文章页', calls.navs[0] === '/pages/article/article?id=3', calls.navs[0]);
    calls.navs.length = 0;
    inst.openDetail({ currentTarget: { dataset: { id: 1, kind: 'promo' } } });
    ok('点活动 → 报名详情页（未受影响）', calls.navs[0] === '/pages/promo-detail/promo-detail?id=1', calls.navs[0]);
  }

  console.log('\n--- ⑤ 场馆详情：名字行「介绍…」+ 导航挪到地址行 + 地址完整可折行 ---');
  {
    const wxml = read('pages/venue-detail/venue-detail.wxml');
    const wxss = read('pages/venue-detail/venue-detail.wxss');
    const js = read('pages/venue-detail/venue-detail.js');
    // 名字行里：有介绍按钮、没有导航
    const nameRow = (wxml.match(/<view class="name-row">([\s\S]*?)<\/view>\s*<!-- 地址行/) || [])[1] || wxml.match(/<view class="name-row">([\s\S]*?)<\/view>/)?.[1] || '';
    ok('取到名字行区块', nameRow.length > 0);
    ok('★ 名字行右侧是「介绍…」', /bindtap="openIntro"/.test(nameRow) && /介绍…/.test(nameRow));
    ok('★ 名字行里**没有**导航按钮了', !/openMap/.test(nameRow), nameRow.replace(/<[^>]+>/g, ' ').slice(0, 80));
    // 地址行：有导航、地址完整
    const addrRow = (wxml.match(/<view class="row row-addr">([\s\S]*?)<\/view>/) || [])[1] || '';
    ok('取到地址行区块', addrRow.length > 0);
    ok('★ 地址行右侧有「⊕ 导航」', /openMap/.test(addrRow) && /⊕ 导航/.test(addrRow));
    ok('★ 地址用 addr-text 包着（独立样式可折行）', /class="addr-text"/.test(addrRow));
    // 样式：地址绝不能省略号截断
    const addrRule = (wxss.match(/\.addr-text\s*\{[\s\S]*?\}/) || [''])[0];
    ok('★ .addr-text 没有 text-overflow: ellipsis', !/text-overflow/.test(addrRule), addrRule.replace(/\s+/g, ' ').slice(0, 90));
    ok('★ .addr-text 没有 white-space: nowrap', !/white-space/.test(addrRule), addrRule.replace(/\s+/g, ' ').slice(0, 90));
    ok('★ .addr-text 允许换行（word-break + flex:1）', /word-break/.test(addrRule) && /flex:\s*1/.test(addrRule));
    ok('地址行顶部对齐（多行地址不歪）', /\.row-addr\s*\{[\s\S]*?align-items:\s*flex-start/.test(wxss));
    ok('导航按钮 flex:none（永远不会被长地址挤变形）', /\.nav-link\s*\{[\s\S]*?flex:\s*none/.test(wxss));
    ok('有 .intro-link 样式', /\.intro-link\s*\{/.test(wxss));
    ok('★ js 有 openIntro 且跳服务介绍列表（带 venue_id）', /openIntro\(\)[\s\S]{0,220}\/pages\/articles\/articles\?venue_id=\$\{this\._id\}/.test(js));
    ok('★ 名字行仍是 flex + space-between（左名右按钮）', /\.name-row\s*\{[\s\S]*?display:\s*flex[\s\S]*?justify-content:\s*space-between/.test(wxss));
    ok('名称仍会被省略号截断（不挤走按钮）', /\.venue-name\s*\{[\s\S]*?text-overflow:\s*ellipsis/.test(wxss));
  }

  console.log('\n--- ⑥ 文案统一为「服务介绍」（2026-09-26 用户要求改名：场馆介绍 → 服务介绍）---');
  {
    const artsJson = JSON.parse(read('pages/articles/articles.json'));
    const artJson = JSON.parse(read('pages/article/article.json'));
    ok('★ 列表页导航栏标题 = 服务介绍', artsJson.navigationBarTitleText === '服务介绍', artsJson.navigationBarTitleText);
    ok('★ 文章页导航栏标题 = 服务介绍', artJson.navigationBarTitleText === '服务介绍', artJson.navigationBarTitleText);
    ok('★ 列表页 hero 标题 = 服务介绍', /<view class="hero-title">服务介绍<\/view>/.test(read('pages/articles/articles.wxml')));
    ok('★ 活动列表里文章卡的角标 = 服务介绍', /<view class="tag art-tag">服务介绍<\/view>/.test(read('pages/activity/activity.wxml')));
    ok('★ 文章页兜底标题 = 服务介绍', (read('pages/article/article.js').match(/'服务介绍'/g) || []).length >= 2);
    // 防复发：小程序里不该再有「场馆介绍」这套旧文案
    let leftovers = [];
    for (const dir of ['pages', 'api', 'utils', 'custom-tab-bar']) {
      const walk = (p) => {
        for (const e of fs.readdirSync(path.join(ROOT, p), { withFileTypes: true })) {
          const rel = path.join(p, e.name);
          if (e.isDirectory()) walk(rel);
          else if (/\.(wxml|json|js|wxss)$/.test(e.name) && read(rel).includes('场馆介绍')) leftovers.push(rel);
        }
      };
      if (fs.existsSync(path.join(ROOT, dir))) walk(dir);
    }
    ok('★ 防复发：小程序里没有「场馆介绍」旧文案残留', leftovers.length === 0, leftovers.join(', '));
  }

  console.log(`\n合计：${pass} 过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
