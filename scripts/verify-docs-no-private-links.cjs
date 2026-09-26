#!/usr/bin/env node
/**
 * verify-docs-no-private-links.cjs
 *
 * 防复发断言：公开仓（OpenVenues-miniapp）的文档里**不许出现指向私有后端仓的链接/路径**。
 *
 * 背景：2026-09-26 后端仓 vincentlilee2/OpenVenues-server 由 public 改为 private，
 * 而本公开仓 README/CHANGELOG 里原有 6 处指向它的链接 + 1 处 ../OpenVenues-server 相对路径，
 * 外人点进去会 404。已改成中性措辞（不带链接）。此脚本把这些"死链"钉死。
 *
 * 允许：正文里**裸提**后端名字（如「配套后端（OpenVenues-server）是私有仓」）——没有可点目标。
 * 禁止：① github.com 上指向该仓的 URL ② markdown 链接目标里含该仓名 ③ 相对路径 ../OpenVenues-server 或 OpenVenues-server/<文件>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = ['README.md', 'CHANGELOG.md'];
const PRIVATE_REPO = 'OpenVenues-server';

let pass = 0;
const fails = [];
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { fails.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); };

// ③ 相对路径写法（../OpenVenues-server、OpenVenues-server/routes/...）——但不误伤裸提到名字
const RE_REL_PATH = new RegExp(`(\\.\\./)?${PRIVATE_REPO}/`);
// ① ② 任何可点的链接目标里含私有仓名
const RE_MD_LINK = new RegExp(`\\]\\([^)]*${PRIVATE_REPO}[^)]*\\)`);
const RE_URL = new RegExp(`https?://[^\\s)"'\\]]*${PRIVATE_REPO}`, 'i');

for (const rel of DOCS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { bad(`${rel} 存在`, '文件不存在'); continue; }
  const text = fs.readFileSync(abs, 'utf8');
  ok(`${rel} 存在（${text.split('\n').length} 行）`);

  const urlHits = text.match(new RegExp(RE_URL, 'gi')) || [];
  urlHits.length === 0
    ? ok(`${rel} 无指向私有仓的 URL`)
    : bad(`${rel} 无指向私有仓的 URL`, urlHits.join(' , '));

  const mdHits = text.match(new RegExp(RE_MD_LINK, 'g')) || [];
  mdHits.length === 0
    ? ok(`${rel} 无指向私有仓的 markdown 链接`)
    : bad(`${rel} 无指向私有仓的 markdown 链接`, mdHits.join(' , '));

  const pathHits = text.match(new RegExp(RE_REL_PATH, 'g')) || [];
  pathHits.length === 0
    ? ok(`${rel} 无 ${PRIVATE_REPO}/ 相对路径`)
    : bad(`${rel} 无 ${PRIVATE_REPO}/ 相对路径`, pathHits.join(' , '));
}

// 正向断言：README 必须**明说**后端不在本公开仓（避免有人顺手删掉这句免责说明）
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
/不在本公开仓|未随本仓开源/.test(readme)
  ? ok('README 仍写明「后端不在本公开仓」')
  : bad('README 仍写明「后端不在本公开仓」', '免责说明被删或改写');

// 正文裸提后端名字是允许的（这里做一次反向验证，避免上面正则过宽把正常文案也算违规）
const bareOk = !RE_MD_LINK.test(`配套后端（${PRIVATE_REPO}）是私有仓。`);
bareOk ? ok('裸提后端名字不算违规') : bad('裸提后端名字不算违规', '正则过宽');

console.log(`\n文档链接检查：${pass} 过 / ${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：' + fails.join(' | '));
  process.exit(1);
}
