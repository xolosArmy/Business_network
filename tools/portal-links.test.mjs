import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROADMAP = 'https://roadmap.xolosarmy.xyz/';
const MEMO = 'https://app.tonalli.cash/memo';
const portalPages = ['index.html', 'ecosystem/index.html'];
const footerPages = [
  'components/footer.html',
  'index.html',
  'ecosystem/index.html',
  'legal/index.html',
  'tonalli.html',
  'human-layer/index.html',
  'civilizacion-tonalli/index.html',
  'blog/index.html',
  'architecture/index.html',
  'infrastructure/index.html',
  'business-network/index.html',
  'network-constitution/index.html',
];

const read = path => readFileSync(path, 'utf8');
const count = (source, value) => source.split(value).length - 1;

test('portal and ecosystem expose roadmap and Tonalli Memo as matching module cards', () => {
  for (const path of portalPages) {
    const html = read(path);
    assert.equal(count(html, `href="${ROADMAP}"`), 2, `${path} roadmap module + footer`);
    assert.equal(count(html, `href="${MEMO}"`), 2, `${path} memo module + footer`);
    assert.match(html, /07 \/ TRANSPARENCIA[\s\S]*?<h3>Roadmap público<\/h3>/);
    assert.match(html, /08 \/ MEMORIA ON-CHAIN[\s\S]*?<h3>Tonalli Memo<\/h3>/);
    assert.match(html, /Ver roadmap[\s\S]*?↗/);
    assert.match(html, /Abrir Tonalli Memo[\s\S]*?↗/);
  }
});

test('shared footer surfaces stay synchronized across portal pages', () => {
  for (const path of footerPages) {
    const html = read(path);
    const expected = portalPages.includes(path) ? 2 : 1;
    assert.equal(count(html, `href="${ROADMAP}"`), expected, `${path} roadmap occurrences`);
    assert.equal(count(html, `href="${MEMO}"`), expected, `${path} memo occurrences`);
    assert.match(html, new RegExp(`href="${ROADMAP.replaceAll('.', '\\.')}" target="_blank" rel="noopener noreferrer"`));
    assert.match(html, new RegExp(`href="${MEMO.replaceAll('.', '\\.')}" target="_blank" rel="noopener noreferrer"`));
  }
});

test('module proof row reuses portal layout and collapses to one column on mobile', () => {
  const css = read('css/network.css');
  assert.match(css, /\.module-proof-grid \{[^}]*grid-column:1\/-1;[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(css, /@media \(max-width:600px\)[\s\S]*?\.module-grid,\.module-proof-grid,[\s\S]*?grid-template-columns:1fr;/);
});
