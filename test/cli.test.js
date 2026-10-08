'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'stlv.js');
const SAMPLE_THEME = path.join(__dirname, '..', 'sample-theme');

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { stdout, code: 0 };
  } catch (err) {
    return { stdout: err.stdout, stderr: err.stderr, code: err.status };
  }
}

test('exits 1 and prints errors when the sample theme has issues', () => {
  const { stdout, code } = run(['check', SAMPLE_THEME]);
  assert.equal(code, 1);
  assert.match(stdout, /error\(s\)/);
  assert.match(stdout, /ERROR/);
});

test('--json produces parseable JSON with the expected top-level shape', () => {
  const { stdout, code } = run(['check', SAMPLE_THEME, '--json']);
  assert.equal(code, 1);
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.issues));
  assert.ok(parsed.summary.errors > 0);
});

test('exits 0 on a theme with no issues', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlv-cli-clean-'));
  fs.mkdirSync(path.join(dir, 'locales'));
  fs.writeFileSync(path.join(dir, 'locales', 'en.default.json'), '{"a": "hello"}');

  const { stdout, code } = run(['check', dir, '--no-usage-scan']);
  assert.equal(code, 0);
  assert.match(stdout, /0 error/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('exits 2 with --help after an unknown command', () => {
  const { code } = run(['bogus-command']);
  assert.equal(code, 2);
});

test('prints help and exits 0 with no arguments', () => {
  const { stdout, code } = run([]);
  assert.equal(code, 0);
  assert.match(stdout, /Usage:/);
});
