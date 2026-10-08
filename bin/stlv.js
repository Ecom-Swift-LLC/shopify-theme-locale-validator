#!/usr/bin/env node
'use strict';

const path = require('path');
const { validateTheme } = require('../lib/validate');
const { formatText, formatJson } = require('../lib/report');

const HELP = `stlv — Shopify theme locale validator

Usage:
  stlv check [theme-dir]          Validate locales/ in a theme (default: current directory)
  stlv check [theme-dir] --json   Print the full report as JSON instead of text
  stlv check [theme-dir] --no-usage-scan
                                   Skip scanning .liquid/.json files for key usage (faster,
                                   and avoids the "possibly unused" / "undefined key used"
                                   checks entirely)
  stlv check [theme-dir] --strict Also fail (non-zero exit) on warnings, not just errors
  stlv --help                     Show this message

Exit codes:
  0  no errors (warnings/info may still be printed)
  1  at least one error (or, with --strict, at least one warning) was found
  2  the tool itself failed (bad arguments, no locales/ directory, etc.)

Examples:
  stlv check .
  stlv check ./my-theme --json > report.json
  stlv check . --strict
`;

function parseArgs(argv) {
  const args = { themeDir: '.', json: false, scanUsage: true, strict: false, help: false, command: null };
  const rest = [];
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--no-usage-scan') args.scanUsage = false;
    else if (a === '--strict') args.strict = true;
    else rest.push(a);
  }
  if (rest[0] === 'check') {
    args.command = 'check';
    if (rest[1]) args.themeDir = rest[1];
  } else if (rest.length > 0) {
    args.command = rest[0];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    process.stdout.write(HELP);
    process.exit(args.command ? 2 : 0);
    return;
  }

  if (args.command !== 'check') {
    process.stderr.write(`Unknown command "${args.command}"\n\n${HELP}`);
    process.exit(2);
    return;
  }

  const themeDir = path.resolve(args.themeDir);
  let result;
  try {
    result = validateTheme(themeDir, { scanUsage: args.scanUsage });
  } catch (err) {
    if (err.code === 'NO_LOCALES_DIR') {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
      return;
    }
    process.stderr.write(`stlv failed: ${err.stack || err.message}\n`);
    process.exit(2);
    return;
  }

  process.stdout.write((args.json ? formatJson(result) : formatText(result)) + '\n');

  const fails = result.summary.errors > 0 || (args.strict && result.summary.warnings > 0);
  process.exit(fails ? 1 : 0);
}

main();
