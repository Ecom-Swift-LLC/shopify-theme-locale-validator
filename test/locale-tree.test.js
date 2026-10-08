'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildLeafMap, interpolationTokens } = require('../lib/locale-tree');

test('collects plain string leaves with their dotted path', () => {
  const { leaves, structuralIssues } = buildLeafMap({
    general: { search: { placeholder: 'Search' } },
  });
  assert.deepEqual(structuralIssues, []);
  assert.deepEqual(leaves.get('general.search.placeholder'), { type: 'string', value: 'Search' });
});

test('recognizes a CLDR pluralization group as a single leaf', () => {
  const { leaves } = buildLeafMap({
    cart: { item_count: { one: '{{ count }} item', other: '{{ count }} items' } },
  });
  const leaf = leaves.get('cart.item_count');
  assert.equal(leaf.type, 'plural');
  assert.deepEqual(leaf.forms, { one: '{{ count }} item', other: '{{ count }} items' });
  // the plural group's own sub-keys must not also appear as separate leaves
  assert.equal(leaves.has('cart.item_count.one'), false);
});

test('flags an object that mixes plural keys with regular keys', () => {
  const { structuralIssues } = buildLeafMap({
    weird: { one: 'a', label: 'b' },
  });
  assert.equal(structuralIssues.length, 1);
  assert.equal(structuralIssues[0].path, 'weird');
});

test('does not treat a plural-shaped object with a non-string value as a plural leaf', () => {
  const { leaves } = buildLeafMap({
    odd: { one: 'a', other: 2 },
  });
  // falls through to being walked as a nesting level instead
  assert.equal(leaves.has('odd'), false);
  assert.deepEqual(leaves.get('odd.one'), { type: 'string', value: 'a' });
  assert.equal(leaves.has('odd.other'), false); // 2 is a number, not a leaf
});

test('walks arrays by index', () => {
  const { leaves } = buildLeafMap({ items: ['first', 'second'] });
  assert.deepEqual(leaves.get('items[0]'), { type: 'string', value: 'first' });
  assert.deepEqual(leaves.get('items[1]'), { type: 'string', value: 'second' });
});

test('ignores non-string, non-plural-group values', () => {
  const { leaves } = buildLeafMap({ a: 1, b: true, c: null });
  assert.equal(leaves.size, 0);
});

test('interpolationTokens extracts bare {{ variable }} placeholders', () => {
  const tokens = interpolationTokens('Added {{ product_title }} to your cart, {{ count }} total');
  assert.deepEqual([...tokens].sort(), ['count', 'product_title']);
});

test('interpolationTokens returns an empty set when there are none', () => {
  assert.equal(interpolationTokens('Plain text').size, 0);
});

test('interpolationTokens de-duplicates repeated tokens', () => {
  const tokens = interpolationTokens('{{ count }} of {{ count }}');
  assert.deepEqual([...tokens], ['count']);
});
