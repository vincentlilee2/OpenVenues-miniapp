// 小程序「场馆默认背景图」回归（2026-09-23）
// 用法：node scripts/verify-venue-cover.cjs
//
// 背景：首页默认图以前**按场馆 id 写死** 1/2/3，新场馆兜底到一个不存在的 tennis.svg
//       （线上 404）→ 卡片是"加载失败的图"，看起来就是没有背景图。
// 现在数据来源唯一：服务端 default_cover。本测试盯住这一点 + 兜底行为。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const covers = require(path.join(ROOT, 'utils', 'venueCovers.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + extra : '')); }
};

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// 断言"代码里没有"时先剥掉注释 —— 注释里提到历史 bug 的文件名（tennis.svg）不算违规
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const indexJs = read('pages/index/index.js');
const detailJs = read('pages/venue-detail/venue-detail.js');
const indexWxml = read('pages/index/index.wxml');
const coversJs = read('utils/venueCovers.js');
const coversCode = stripComments(coversJs);

console.log('小程序「场馆默认背景图」回归');

console.log('\n--- 1) 不再按场馆 id 写死、不再有 .svg 兜底 ---');
ok('utils/venueCovers.js 代码里没有 .svg（注释除外）', !/\.svg/.test(coversCode));
ok('utils/venueCovers.js 里没有 id → 图片的写死映射', !/^\s*\d+\s*:\s*[`'"]/m.test(coversCode), (coversCode.match(/^\s*\d+:/m) || [''])[0]);
ok('utils/venueCovers.js 不再导出 byId', !/byId/.test(coversCode));

console.log('\n--- 2) 两个页面都改从服务端 default_cover 取 ---');
ok('index.js 用 default_cover', /default_cover/.test(indexJs));
ok('index.js 不再调用 venueCovers.byId', !/venueCovers\.byId/.test(indexJs));
ok('venue-detail.js 用 default_cover', /default_cover/.test(detailJs));
ok('venue-detail.js 不再调用 venueCovers.byId', !/venueCovers\.byId/.test(detailJs));

console.log('\n--- 3) URL 组装行为 ---');
const B = 'https://h/venue-api';
ok('相对路径 → 拼绝对', covers.absolute('/static/covers/tennis_001.jpg', B) === B + '/static/covers/tennis_001.jpg');
ok('绝对 URL 原样', covers.absolute('https://cdn/x.jpg', B) === 'https://cdn/x.jpg');
ok('apiBase 末尾斜杠不会双斜杠', covers.absolute('/a.jpg', B + '/') === B + '/a.jpg');
ok('空值 → 空串（让模板走占位块）', covers.absolute('', B) === '' && covers.absolute(null, B) === '');
ok('of(): cover 优先于 default_cover', covers.of({ cover: '/u.jpg', default_cover: '/d.jpg' }, B) === B + '/u.jpg');
ok('of(): 没 cover 用 default_cover', covers.of({ default_cover: '/d.jpg' }, B) === B + '/d.jpg');
ok('★ of(): 两者都缺 → 空串（而不是拼出会 404 的路径）', covers.of({ id: 99, type: 'badminton' }, B) === '', covers.of({ id: 99 }, B));
ok('of(null) 不崩', covers.of(null, B) === '');

console.log('\n--- 4) 模板兜底链仍然完整（空 → 占位块，不给破图）---');
ok('cover 分支在（wx:if item.cover）', /wx:if="\{\{item\.cover\}\}"/.test(indexWxml));
ok('defaultCover 分支在（wx:elif）', /wx:elif="\{\{item\.defaultCover\}\}"/.test(indexWxml));
ok('★ 都没有时走占位块（wx:else）', /wx:else/.test(indexWxml) && /venue-cover--placeholder/.test(indexWxml));

console.log(`\n${fail === 0 ? `✓ 全部通过（${pass} 项）` : `✗ ${fail} 项失败`}`);
process.exit(fail ? 1 : 0);
