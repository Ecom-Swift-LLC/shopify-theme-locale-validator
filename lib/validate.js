'use strict';

const path = require('path');
const { loadLocaleFiles } = require('./locale-files');
const { parseJsonTrackDuplicates } = require('./json-parser');
const { buildLeafMap } = require('./locale-tree');
const { compareLocaleToDefault } = require('./compare');
const { scanKeyUsage } = require('./usage-scan');

function relative(themeDir, absPath) {
  return path.relative(themeDir, absPath).split(path.sep).join('/');
}

/**
 * Runs the full validation of a theme's locales/ directory.
 * Pure-ish: the only I/O is the loadLocaleFiles/scanKeyUsage calls made
 * internally; everything downstream of the raw file contents is pure
 * functions, which is what's covered by the unit tests.
 *
 * @param {string} themeDir
 * @param {{ scanUsage?: boolean }} [options]
 */
function validateTheme(themeDir, options = {}) {
  const scanUsage = options.scanUsage !== false;
  const issues = [];
  const { files, unrecognized } = loadLocaleFiles(themeDir);

  for (const filename of unrecognized) {
    issues.push({
      severity: 'warning',
      type: 'unrecognized-filename',
      file: filename,
      message: `locales/${filename} doesn't match Shopify's naming convention (<lang>.json, <lang>.default.json, <lang>.schema.json or <lang>.default.schema.json) and was ignored`,
    });
  }

  const parsed = [];
  for (const f of files) {
    const { value, duplicates, error } = parseJsonTrackDuplicates(f.raw);
    if (error) {
      issues.push({
        severity: 'error',
        type: 'invalid-json',
        file: f.filename,
        message: `locales/${f.filename} is not valid JSON: ${error.message}`,
      });
      continue;
    }
    for (const dup of duplicates) {
      issues.push({
        severity: 'error',
        type: 'duplicate-key',
        file: f.filename,
        path: dup.path,
        message: `locales/${f.filename}: duplicate key "${dup.key}" at "${dup.path}" (line ${dup.line}) — the earlier value is silently discarded`,
      });
    }
    const { leaves, structuralIssues } = buildLeafMap(value);
    for (const si of structuralIssues) {
      issues.push({
        severity: 'error',
        type: 'mixed-plural-object',
        file: f.filename,
        path: si.path,
        message: `locales/${f.filename}: ${si.message}`,
      });
    }
    parsed.push({ ...f, leaves });
  }

  const namespaces = {};
  for (const ns of ['storefront', 'schema']) {
    const nsFiles = parsed.filter((f) => f.namespace === ns);
    if (nsFiles.length === 0) continue;
    const defaults = nsFiles.filter((f) => f.isDefault);
    if (defaults.length === 0) {
      issues.push({
        severity: 'error',
        type: 'no-default-locale',
        namespace: ns,
        message: `No *.default${ns === 'schema' ? '.schema' : ''}.json file found — Shopify requires exactly one default locale per ${ns === 'schema' ? 'schema/editor' : 'storefront'} namespace`,
      });
      namespaces[ns] = { defaultLang: null, locales: nsFiles.map((f) => f.lang), issueCount: 0 };
      continue;
    }
    if (defaults.length > 1) {
      issues.push({
        severity: 'error',
        type: 'multiple-default-locales',
        namespace: ns,
        message: `Multiple default locale files for the ${ns} namespace: ${defaults.map((f) => f.filename).join(', ')} — only one is allowed`,
      });
    }
    const defaultFile = defaults[0];
    const translations = nsFiles.filter((f) => f !== defaultFile);
    for (const t of translations) {
      const cmp = compareLocaleToDefault(defaultFile.leaves, t.leaves, t.lang);
      for (const issue of cmp) {
        issues.push({ ...issue, namespace: ns, file: t.filename });
      }
    }
    namespaces[ns] = {
      defaultLang: defaultFile.lang,
      defaultFile: defaultFile.filename,
      locales: nsFiles.map((f) => f.lang),
      keyCount: defaultFile.leaves.size,
    };
  }

  let usage = null;
  if (scanUsage) {
    const { storefrontUsed, schemaUsed, filesScanned } = scanKeyUsage(themeDir);
    usage = { filesScanned, undefinedUsed: [], unusedDefined: [] };

    const checkNamespace = (ns, usedMap) => {
      const nsInfo = namespaces[ns];
      if (!nsInfo || !nsInfo.defaultFile) return;
      const defaultLeaves = parsed.find((f) => f.namespace === ns && f.isDefault).leaves;
      for (const [key, locations] of usedMap) {
        if (!defaultLeaves.has(key)) {
          const loc = locations[0];
          issues.push({
            severity: 'error',
            type: 'undefined-key-used',
            namespace: ns,
            path: key,
            message: `"${key}" is used with the ${ns === 'schema' ? '"t:" schema prefix' : '`t` filter'} at ${relative(themeDir, loc.file)}:${loc.line} but is not defined in ${nsInfo.defaultFile}${locations.length > 1 ? ` (and ${locations.length - 1} more place${locations.length - 1 > 1 ? 's' : ''})` : ''}`,
          });
          usage.undefinedUsed.push(key);
        }
      }
      for (const key of defaultLeaves.keys()) {
        if (!usedMap.has(key)) {
          issues.push({
            severity: 'info',
            type: 'unused-key',
            namespace: ns,
            path: key,
            message: `"${key}" is defined in ${nsInfo.defaultFile} but no static reference to it was found (may be built dynamically — see "What it does NOT do")`,
          });
          usage.unusedDefined.push(key);
        }
      }
    };
    checkNamespace('storefront', storefrontUsed);
    checkNamespace('schema', schemaUsed);
  }

  const summary = { errors: 0, warnings: 0, infos: 0 };
  for (const issue of issues) {
    if (issue.severity === 'error') summary.errors++;
    else if (issue.severity === 'warning') summary.warnings++;
    else summary.infos++;
  }

  return { themeDir, namespaces, issues, usage, summary };
}

module.exports = { validateTheme };
