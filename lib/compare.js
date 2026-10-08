'use strict';

const { interpolationTokens } = require('./locale-tree');

function setDiff(a, b) {
  return [...a].filter((x) => !b.has(x));
}

function formatTokenSet(set) {
  return [...set].sort().join(', ') || '(none)';
}

/**
 * Checks a single plural-form leaf (either the default's own, or a
 * translation's) for the one CLDR rule that holds for every language:
 * the 'other' category is mandatory. Returns an issue array (0 or 1 long).
 */
function checkPluralHasOther(path, lang, forms) {
  if (!('other' in forms)) {
    return [{
      severity: 'error',
      type: 'missing-other-form',
      path,
      lang,
      message: `Pluralization group at "${path}" in ${lang} has no "other" form — CLDR requires "other" in every language`,
    }];
  }
  return [];
}

/**
 * Compares two leaves that share a path (one from the default locale, one
 * from a translation) and reports a type mismatch or interpolation-token
 * drift. Assumes both leaves exist; missing/extra keys are handled by the
 * caller before this is reached.
 */
function compareMatchingLeaf(path, lang, defaultLeaf, localeLeaf) {
  const issues = [];
  if (defaultLeaf.type !== localeLeaf.type) {
    issues.push({
      severity: 'error',
      type: 'type-mismatch',
      path,
      lang,
      message: `"${path}" is a ${defaultLeaf.type === 'plural' ? 'pluralization group' : 'plain string'} in the default locale but a ${localeLeaf.type === 'plural' ? 'pluralization group' : 'plain string'} in ${lang}`,
    });
    return issues;
  }

  if (defaultLeaf.type === 'plural') {
    issues.push(...checkPluralHasOther(path, lang, localeLeaf.forms));
    for (const form of Object.keys(defaultLeaf.forms)) {
      if (!(form in localeLeaf.forms)) continue; // languages may legitimately use fewer/more forms
      const defTokens = interpolationTokens(defaultLeaf.forms[form]);
      const locTokens = interpolationTokens(localeLeaf.forms[form]);
      const missing = setDiff(defTokens, locTokens);
      const extra = setDiff(locTokens, defTokens);
      if (missing.length > 0) {
        issues.push({
          severity: 'error',
          type: 'interpolation-missing',
          path: `${path}.${form}`,
          lang,
          message: `"${path}.${form}" in ${lang} is missing placeholder(s) {{ ${missing.join(' }}, {{ ')} }} present in the default locale (default uses: ${formatTokenSet(defTokens)})`,
        });
      }
      if (extra.length > 0) {
        issues.push({
          severity: 'warning',
          type: 'interpolation-extra',
          path: `${path}.${form}`,
          lang,
          message: `"${path}.${form}" in ${lang} uses placeholder(s) {{ ${extra.join(' }}, {{ ')} }} not present in the default locale's "other" (default uses: ${formatTokenSet(defTokens)})`,
        });
      }
    }
  } else {
    const defTokens = interpolationTokens(defaultLeaf.value);
    const locTokens = interpolationTokens(localeLeaf.value);
    const missing = setDiff(defTokens, locTokens);
    const extra = setDiff(locTokens, defTokens);
    if (missing.length > 0) {
      issues.push({
        severity: 'error',
        type: 'interpolation-missing',
        path,
        lang,
        message: `"${path}" in ${lang} is missing placeholder(s) {{ ${missing.join(' }}, {{ ')} }} present in the default locale ("${defaultLeaf.value}")`,
      });
    }
    if (extra.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'interpolation-extra',
        path,
        lang,
        message: `"${path}" in ${lang} uses placeholder(s) {{ ${extra.join(' }}, {{ ')} }} not present in the default locale ("${defaultLeaf.value}")`,
      });
    }
  }
  return issues;
}

/**
 * Full comparison of one translated locale's leaf map against the default
 * locale's leaf map. Pure function — no file access.
 */
function compareLocaleToDefault(defaultLeaves, localeLeaves, lang) {
  const issues = [];

  for (const [path, defLeaf] of defaultLeaves) {
    const locLeaf = localeLeaves.get(path);
    if (!locLeaf) {
      issues.push({
        severity: 'error',
        type: 'missing-key',
        path,
        lang,
        message: `"${path}" exists in the default locale but is missing from ${lang}`,
      });
      continue;
    }
    issues.push(...compareMatchingLeaf(path, lang, defLeaf, locLeaf));
  }

  for (const [path] of localeLeaves) {
    if (!defaultLeaves.has(path)) {
      issues.push({
        severity: 'warning',
        type: 'extra-key',
        path,
        lang,
        message: `"${path}" exists in ${lang} but not in the default locale (stale or renamed key?)`,
      });
    }
  }

  return issues;
}

module.exports = { compareLocaleToDefault, compareMatchingLeaf, checkPluralHasOther, setDiff };
