'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildLeafMap } = require('../lib/locale-tree');
const { compareLocaleToDefault } = require('../lib/compare');

function leavesOf(obj) {
  return buildLeafMap(obj).leaves;
}

function issuesByType(issues) {
  const m = new Map();
  for (const i of issues) {
    if (!m.has(i.type)) m.set(i.type, []);
    m.get(i.type).push(i);
  }
  return m;
}

test('reports a missing key present in the default but absent from the translation', () => {
  const defaultLeaves = leavesOf({ a: 'x', b: 'y' });
  const frLeaves = leavesOf({ a: 'x-fr' });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  const byType = issuesByType(issues);
  assert.equal(byType.get('missing-key').length, 1);
  assert.equal(byType.get('missing-key')[0].path, 'b');
});

test('reports an extra key present in the translation but not the default, as a warning', () => {
  const defaultLeaves = leavesOf({ a: 'x' });
  const frLeaves = leavesOf({ a: 'x-fr', stale: 'old' });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  const extra = issues.filter((i) => i.type === 'extra-key');
  assert.equal(extra.length, 1);
  assert.equal(extra[0].severity, 'warning');
  assert.equal(extra[0].path, 'stale');
});

test('reports a type mismatch when default is a plural group but the translation is a plain string', () => {
  const defaultLeaves = leavesOf({ notice: { one: 'a', other: 'b' } });
  const deLeaves = leavesOf({ notice: 'flat string' });
  const issues = compareLocaleToDefault(defaultLeaves, deLeaves, 'de');
  const mismatch = issues.find((i) => i.type === 'type-mismatch');
  assert.ok(mismatch);
  assert.equal(mismatch.severity, 'error');
});

test('requires every plural group translation to define the "other" form', () => {
  const defaultLeaves = leavesOf({ notice: { one: 'a', other: 'b' } });
  const frLeaves = leavesOf({ notice: { one: 'seulement un' } });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  const missingOther = issues.find((i) => i.type === 'missing-other-form');
  assert.ok(missingOther);
  assert.equal(missingOther.severity, 'error');
});

test('flags a missing interpolation placeholder in a plain string translation', () => {
  const defaultLeaves = leavesOf({ added: 'Added {{ product_title }} to your cart' });
  const frLeaves = leavesOf({ added: 'Ajouté à votre panier' });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  const missing = issues.find((i) => i.type === 'interpolation-missing');
  assert.ok(missing);
  assert.equal(missing.severity, 'error');
  assert.equal(missing.path, 'added');
});

test('flags an extra interpolation placeholder as a warning, not an error', () => {
  const defaultLeaves = leavesOf({ added: 'Added to your cart' });
  const frLeaves = leavesOf({ added: 'Ajouté {{ product_title }} à votre panier' });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  const extra = issues.find((i) => i.type === 'interpolation-extra');
  assert.ok(extra);
  assert.equal(extra.severity, 'warning');
});

test('checks interpolation per plural form, at a sub-path', () => {
  const defaultLeaves = leavesOf({
    count: { one: '{{ count }} item', other: '{{ count }} items' },
  });
  const frLeaves = leavesOf({
    count: { one: 'un article', other: '{{ count }} articles' },
  });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  const missing = issues.find((i) => i.type === 'interpolation-missing');
  assert.ok(missing);
  assert.equal(missing.path, 'count.one');
});

test('a fully matching translation produces no issues', () => {
  const defaultLeaves = leavesOf({
    a: 'hello {{ name }}',
    b: { one: '{{ count }} x', other: '{{ count }} xs' },
  });
  const frLeaves = leavesOf({
    a: 'bonjour {{ name }}',
    b: { one: '{{ count }} x (fr)', other: '{{ count }} xs (fr)' },
  });
  const issues = compareLocaleToDefault(defaultLeaves, frLeaves, 'fr');
  assert.deepEqual(issues, []);
});

test('a translation using fewer plural forms than the default is not itself an error', () => {
  // e.g. default (en) ships one/other, a locale that only needs "other" is valid CLDR
  const defaultLeaves = leavesOf({ b: { one: 'x', other: 'xs' } });
  const jaLeaves = leavesOf({ b: { other: 'xs (ja)' } });
  const issues = compareLocaleToDefault(defaultLeaves, jaLeaves, 'ja');
  assert.deepEqual(issues, []);
});
