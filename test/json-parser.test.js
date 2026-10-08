'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonTrackDuplicates } = require('../lib/json-parser');

test('parses well-formed JSON with no duplicates', () => {
  const { value, duplicates, error } = parseJsonTrackDuplicates('{"a": {"b": "c"}, "d": [1, 2, 3]}');
  assert.equal(error, null);
  assert.deepEqual(duplicates, []);
  assert.deepEqual(value, { a: { b: 'c' }, d: [1, 2, 3] });
});

test('detects a duplicate top-level key and reports its path', () => {
  const text = '{\n  "a": "first",\n  "a": "second"\n}';
  const { value, duplicates, error } = parseJsonTrackDuplicates(text);
  assert.equal(error, null);
  assert.equal(value.a, 'second'); // last-value-wins, same as JSON.parse
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].key, 'a');
  assert.equal(duplicates[0].path, 'a');
  assert.equal(duplicates[0].line, 3);
});

test('detects a duplicate nested key and reports the dotted path', () => {
  const text = '{"general": {"search": {"placeholder": "one", "placeholder": "two"}}}';
  const { duplicates } = parseJsonTrackDuplicates(text);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].path, 'general.search.placeholder');
});

test('reports multiple duplicates in source order', () => {
  const text = '{"a": 1, "a": 2, "b": 3, "b": 4, "b": 5}';
  const { duplicates } = parseJsonTrackDuplicates(text);
  // "b" appears 3 times -> 2 duplicate occurrences reported for it
  assert.equal(duplicates.length, 3);
  assert.deepEqual(duplicates.map((d) => d.key), ['a', 'b', 'b']);
});

test('reports a syntax error with line and column instead of throwing', () => {
  const { value, error } = parseJsonTrackDuplicates('{"a": "unterminated}');
  assert.equal(value, null);
  assert.ok(error);
  assert.match(error.message, /Unterminated string/);
});

test('reports a trailing comma as a syntax error', () => {
  const { error } = parseJsonTrackDuplicates('{"a": 1,}');
  assert.ok(error);
});

test('handles escaped characters and unicode escapes in strings', () => {
  const { value, error } = parseJsonTrackDuplicates('{"a": "line1\\nline2\\t\\u00e9"}');
  assert.equal(error, null);
  assert.equal(value.a, 'line1\nline2\té');
});

test('handles numbers including negatives, decimals and exponents', () => {
  const { value, error } = parseJsonTrackDuplicates('{"a": -3.14, "b": 2e10, "c": 0}');
  assert.equal(error, null);
  assert.deepEqual(value, { a: -3.14, b: 2e10, c: 0 });
});

test('handles empty objects and arrays', () => {
  const { value, error } = parseJsonTrackDuplicates('{"a": {}, "b": []}');
  assert.equal(error, null);
  assert.deepEqual(value, { a: {}, b: [] });
});
