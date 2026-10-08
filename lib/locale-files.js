'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Classifies a filename inside a theme's locales/ directory.
 * Shopify themes ship two independent namespaces per language:
 *   - storefront: <lang>.default.json / <lang>.json — rendered with the
 *     `t` filter in templates, sections and snippets
 *   - schema: <lang>.default.schema.json / <lang>.schema.json — referenced
 *     with a "t:" prefix from inside {% schema %} tags (section/block
 *     names, setting labels, etc.), shown in the theme editor only
 * Exactly one *.default.json and one *.default.schema.json is expected
 * per theme (Shopify requires a single default locale).
 */
// A lenient but real BCP-47-ish language tag: 2-3 lowercase letters, optionally
// followed by a region/script subtag (e.g. "en", "fr", "fil", "pt-BR", "zh-CN").
// This deliberately excludes arbitrary "something.json" files in locales/ (a
// stray backup or notes file) from being misread as a locale for an invented
// language code.
const LANG_TAG = '[a-z]{2,3}(?:-[A-Za-z0-9]{2,4})?';

function classifyLocaleFilename(filename) {
  let m = filename.match(new RegExp(`^(${LANG_TAG})\\.default\\.schema\\.json$`));
  if (m) return { lang: m[1], namespace: 'schema', isDefault: true };
  m = filename.match(new RegExp(`^(${LANG_TAG})\\.schema\\.json$`));
  if (m) return { lang: m[1], namespace: 'schema', isDefault: false };
  m = filename.match(new RegExp(`^(${LANG_TAG})\\.default\\.json$`));
  if (m) return { lang: m[1], namespace: 'storefront', isDefault: true };
  m = filename.match(new RegExp(`^(${LANG_TAG})\\.json$`));
  if (m) return { lang: m[1], namespace: 'storefront', isDefault: false };
  return null;
}

/**
 * Reads every *.json file in <themeDir>/locales and classifies it.
 * Returns { files, unrecognized } where files is an array of
 * { filename, absPath, lang, namespace, isDefault, raw } and unrecognized
 * lists any *.json filename in the directory that didn't match Shopify's
 * naming convention at all (not a locale file issue — a naming mistake).
 */
function loadLocaleFiles(themeDir) {
  const localesDir = path.join(themeDir, 'locales');
  if (!fs.existsSync(localesDir) || !fs.statSync(localesDir).isDirectory()) {
    const err = new Error(`No locales/ directory found under ${themeDir}`);
    err.code = 'NO_LOCALES_DIR';
    throw err;
  }
  const entries = fs.readdirSync(localesDir).filter((f) => f.toLowerCase().endsWith('.json'));
  const files = [];
  const unrecognized = [];
  for (const filename of entries) {
    const classified = classifyLocaleFilename(filename);
    const absPath = path.join(localesDir, filename);
    if (!classified) {
      unrecognized.push(filename);
      continue;
    }
    files.push({
      filename,
      absPath,
      raw: fs.readFileSync(absPath, 'utf8'),
      ...classified,
    });
  }
  return { files, unrecognized, localesDir };
}

module.exports = { classifyLocaleFilename, loadLocaleFiles };
