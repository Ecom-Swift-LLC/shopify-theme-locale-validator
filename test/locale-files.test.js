'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyLocaleFilename, loadLocaleFiles } = require('../lib/locale-files');

test('classifies the four Shopify locale filename patterns', () => {
  assert.deepEqual(classifyLocaleFilename('en.default.json'), { lang: 'en', namespace: 'storefront', isDefault: true });
  assert.deepEqual(classifyLocaleFilename('fr.json'), { lang: 'fr', namespace: 'storefront', isDefault: false });
  assert.deepEqual(classifyLocaleFilename('en.default.schema.json'), { lang: 'en', namespace: 'schema', isDefault: true });
  assert.deepEqual(classifyLocaleFilename('fr.schema.json'), { lang: 'fr', namespace: 'schema', isDefault: false });
});

test('classifies a regional locale code like pt-BR', () => {
  assert.deepEqual(classifyLocaleFilename('pt-BR.json'), { lang: 'pt-BR', namespace: 'storefront', isDefault: false });
});

test('returns null for a filename that is not a locale file', () => {
  assert.equal(classifyLocaleFilename('settings_schema.json'), null);
  assert.equal(classifyLocaleFilename('readme.md'), null);
});

test('loadLocaleFiles reads and classifies every json file in locales/', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-test-'));
  fs.mkdirSync(path.join(dir, 'locales'));
  fs.writeFileSync(path.join(dir, 'locales', 'en.default.json'), '{"a": "b"}');
  fs.writeFileSync(path.join(dir, 'locales', 'fr.json'), '{"a": "c"}');
  fs.writeFileSync(path.join(dir, 'locales', 'not-a-locale.txt'), 'ignored, not .json');

  const { files, unrecognized } = loadLocaleFiles(dir);
  assert.equal(files.length, 2);
  assert.deepEqual(unrecognized, []);
  const byName = Object.fromEntries(files.map((f) => [f.filename, f]));
  assert.equal(byName['en.default.json'].isDefault, true);
  assert.equal(byName['fr.json'].isDefault, false);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadLocaleFiles flags a json file that does not match the naming convention', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-test-'));
  fs.mkdirSync(path.join(dir, 'locales'));
  fs.writeFileSync(path.join(dir, 'locales', 'en.default.json'), '{}');
  fs.writeFileSync(path.join(dir, 'locales', 'translations-backup.json'), '{}');

  const { unrecognized } = loadLocaleFiles(dir);
  assert.deepEqual(unrecognized, ['translations-backup.json']);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('throws a recognizable error when locales/ does not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-test-'));
  assert.throws(() => loadLocaleFiles(dir), (err) => err.code === 'NO_LOCALES_DIR');
  fs.rmSync(dir, { recursive: true, force: true });
});
