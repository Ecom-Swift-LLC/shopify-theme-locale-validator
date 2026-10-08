'use strict';

const CLDR_PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/**
 * A leaf is anywhere in a locale JSON tree that actually holds translatable
 * text:
 *   - a plain string value -> { type: 'string', value }
 *   - an object whose keys are a non-empty subset of the six CLDR plural
 *     categories, with string values -> { type: 'plural', forms: {...} }
 *     (this is Shopify's documented pattern for the `t` filter's `count:`
 *     pluralization)
 *
 * Anything else (numbers, booleans, null, arrays, or an object that mixes
 * plural keys with non-plural keys) is walked into but is not itself a
 * leaf — except a mixed object is reported as a structural problem by the
 * caller, since it's neither a clean nesting level nor a valid plural group.
 */
function collectLeaves(value, path, out, structuralIssues) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      out.set(path, { type: 'string', value });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectLeaves(item, `${path}[${idx}]`, out, structuralIssues));
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return;
  const pluralKeyCount = keys.filter((k) => CLDR_PLURAL_KEYS.has(k)).length;
  if (pluralKeyCount === keys.length) {
    // Every key is a CLDR plural category: treat the whole object as one
    // pluralization leaf, as long as every value is actually a string.
    const allStrings = keys.every((k) => typeof value[k] === 'string');
    if (allStrings) {
      out.set(path, { type: 'plural', forms: { ...value } });
      return;
    }
  }
  if (pluralKeyCount > 0 && pluralKeyCount < keys.length) {
    structuralIssues.push({
      path,
      message: `Object mixes plural-form keys (${keys.filter((k) => CLDR_PLURAL_KEYS.has(k)).join(', ')}) with regular keys (${keys.filter((k) => !CLDR_PLURAL_KEYS.has(k)).join(', ')}) — this is neither a valid pluralization group nor a clean nesting level`,
    });
  }
  for (const key of keys) {
    collectLeaves(value[key], path ? `${path}.${key}` : key, out, structuralIssues);
  }
}

/**
 * Builds a flat map of dotted-path -> leaf descriptor for an entire parsed
 * locale document, plus any structural issues spotted while walking it.
 */
function buildLeafMap(value) {
  const out = new Map();
  const structuralIssues = [];
  collectLeaves(value, '', out, structuralIssues);
  out.delete(''); // a bare top-level string/plural-group isn't a real theme locale file
  return { leaves: out, structuralIssues };
}

/**
 * Extracts the set of `{{ token }}` interpolation variable names used
 * inside a locale string value (the syntax the `t` filter substitutes,
 * e.g. "Added {{ quantity }} to your cart"). Only bare identifiers are
 * recognized, matching what Shopify's own locale files use — a Liquid
 * filter chain inside a translation string isn't part of the documented
 * pattern and would indicate something else is going on.
 */
function interpolationTokens(str) {
  const tokens = new Set();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    tokens.add(m[1]);
  }
  return tokens;
}

module.exports = { CLDR_PLURAL_KEYS, buildLeafMap, interpolationTokens };
