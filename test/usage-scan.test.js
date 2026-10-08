'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanKeyUsage } = require('../lib/usage-scan');

function makeTheme(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-usage-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test('finds a storefront key used with the t filter, single or double quoted', () => {
  const dir = makeTheme({
    'snippets/a.liquid': `{{ 'cart.item_count' | t: count: 1 }}\n{{ "cart.added_notice" | t }}`,
  });
  const { storefrontUsed } = scanKeyUsage(dir);
  assert.ok(storefrontUsed.has('cart.item_count'));
  assert.ok(storefrontUsed.has('cart.added_notice'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('finds a schema key referenced with the t: prefix inside a schema tag', () => {
  const dir = makeTheme({
    'sections/hero.liquid': `{% schema %}\n{"name": "t:sections.hero.name"}\n{% endschema %}`,
  });
  const { schemaUsed } = scanKeyUsage(dir);
  assert.ok(schemaUsed.has('sections.hero.name'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('records the file and line number of each usage', () => {
  const dir = makeTheme({
    'snippets/a.liquid': `line one\nline two\n{{ 'foo.bar' | t }}`,
  });
  const { storefrontUsed } = scanKeyUsage(dir);
  const hits = storefrontUsed.get('foo.bar');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('does not scan inside the locales/ directory itself', () => {
  const dir = makeTheme({
    'locales/en.default.json': '{"a": "b | t trick"}',
    'snippets/a.liquid': `{{ 'real.key' | t }}`,
  });
  const { storefrontUsed } = scanKeyUsage(dir);
  assert.equal(storefrontUsed.has('a'), false);
  assert.ok(storefrontUsed.has('real.key'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('counts multiple usages of the same key', () => {
  const dir = makeTheme({
    'snippets/a.liquid': `{{ 'dup.key' | t }}`,
    'snippets/b.liquid': `{{ 'dup.key' | t }}`,
  });
  const { storefrontUsed } = scanKeyUsage(dir);
  assert.equal(storefrontUsed.get('dup.key').length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
