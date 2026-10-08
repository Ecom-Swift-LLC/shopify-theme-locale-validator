'use strict';

const fs = require('fs');
const path = require('path');

const SCAN_EXTENSIONS = new Set(['.liquid', '.json']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'locales']);

function walkFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(path.join(dir, entry.name), out);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// 'key.path' | t   or  "key.path" | t   (storefront translations)
const STOREFRONT_T_FILTER_RE = /(['"])([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\1\s*\|\s*t\b/g;
// "t:key.path"  (schema/editor translations, referenced from inside {% schema %} JSON)
const SCHEMA_T_PREFIX_RE = /"t:([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)"/g;

function recordMatches(text, re, file, into) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[m.length - 1];
    const line = text.slice(0, m.index).split('\n').length;
    if (!into.has(key)) into.set(key, []);
    into.get(key).push({ file, line });
  }
}

/**
 * Scans every .liquid/.json file in the theme (outside locales/) for
 * translation-key references and returns which keys are actually used,
 * and where.
 *
 * This is a best-effort static scan, not a Liquid interpreter: a key built
 * dynamically — e.g. `{{ 'blocks.' | append: block.type | append: '.title' | t }}`
 * — can't be resolved here and won't show up as "used" even though it is.
 * See the README's "What it does NOT do" section; "unused key" findings
 * are reported as informational for exactly this reason.
 */
function scanKeyUsage(themeDir) {
  const files = walkFiles(themeDir, []);
  const storefrontUsed = new Map();
  const schemaUsed = new Map();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    recordMatches(text, STOREFRONT_T_FILTER_RE, file, storefrontUsed);
    recordMatches(text, SCHEMA_T_PREFIX_RE, file, schemaUsed);
  }

  return { storefrontUsed, schemaUsed, filesScanned: files.length };
}

module.exports = { scanKeyUsage, walkFiles };
