'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateTheme } = require('../lib/validate');

const SAMPLE_THEME = path.join(__dirname, '..', 'sample-theme');

function find(issues, type, pathMatch) {
  return issues.filter((i) => i.type === type && (pathMatch === undefined || i.path === pathMatch));
}

test('validates the bundled sample theme and finds every intentionally planted issue', () => {
  const result = validateTheme(SAMPLE_THEME, { scanUsage: true });

  assert.equal(result.namespaces.storefront.defaultFile, 'en.default.json');
  assert.equal(result.namespaces.schema.defaultFile, 'en.default.schema.json');

  // fr.json: a real copy-paste duplicate key
  assert.equal(find(result.issues, 'duplicate-key', 'general.search.placeholder').length, 1);

  // fr.json: entirely missing a key the default locale has
  assert.equal(find(result.issues, 'missing-key', 'customers.orders.order_count').length, 1);

  // fr.json: plural group translated without the mandatory "other" form
  assert.ok(find(result.issues, 'missing-other-form', 'products.stock_notice').some((i) => i.lang === 'fr'));

  // fr.json: translation dropped the {{ product_title }} placeholder
  assert.ok(find(result.issues, 'interpolation-missing', 'cart.added_notice').some((i) => i.lang === 'fr'));

  // fr.json: a key that doesn't exist in the default locale at all
  assert.ok(find(result.issues, 'extra-key', 'cart.old_checkout_button').some((i) => i.lang === 'fr'));

  // de.json: the default's plural group was translated as a flat string
  assert.ok(find(result.issues, 'type-mismatch', 'products.stock_notice').some((i) => i.lang === 'de'));

  // fr.schema.json: missing a schema/editor translation
  assert.ok(find(result.issues, 'missing-key', 'sections.hero.settings.heading.label').some((i) => i.namespace === 'schema'));

  // price.liquid references a key with a typo that doesn't exist
  assert.ok(find(result.issues, 'undefined-key-used', 'products.pric.from_price_html').length >= 1);

  // the correctly-spelled key is consequently never referenced anywhere
  assert.ok(find(result.issues, 'unused-key', 'products.price.from_price_html').length >= 1);

  // a schema key that's defined but genuinely never used by any section
  assert.ok(find(result.issues, 'unused-key', 'sections.announcement_bar.name').length >= 1);

  assert.ok(result.summary.errors > 0);
});

test('--no-usage-scan equivalent (scanUsage: false) skips undefined/unused key checks entirely', () => {
  const result = validateTheme(SAMPLE_THEME, { scanUsage: false });
  assert.equal(result.usage, null);
  assert.equal(find(result.issues, 'undefined-key-used').length, 0);
  assert.equal(find(result.issues, 'unused-key').length, 0);
  // the pure JSON-comparison issues are still found without a usage scan
  assert.ok(find(result.issues, 'missing-key', 'customers.orders.order_count').length === 1);
});

test('a theme with perfectly matching locales produces zero errors', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-clean-'));
  fs.mkdirSync(path.join(dir, 'locales'));
  fs.writeFileSync(path.join(dir, 'locales', 'en.default.json'), JSON.stringify({ a: { b: 'hello {{ name }}' } }));
  fs.writeFileSync(path.join(dir, 'locales', 'fr.json'), JSON.stringify({ a: { b: 'bonjour {{ name }}' } }));

  const result = validateTheme(dir, { scanUsage: false });
  assert.equal(result.summary.errors, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('reports no-default-locale when every file in a namespace is non-default', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-nodefault-'));
  fs.mkdirSync(path.join(dir, 'locales'));
  fs.writeFileSync(path.join(dir, 'locales', 'fr.json'), '{"a": "b"}');

  const result = validateTheme(dir, { scanUsage: false });
  assert.ok(find(result.issues, 'no-default-locale').length === 1);

  fs.rmSync(dir, { recursive: true, force: true });
});
