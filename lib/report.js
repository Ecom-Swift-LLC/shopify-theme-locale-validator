'use strict';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
const SEVERITY_LABEL = { error: 'ERROR', warning: 'WARN ', info: 'INFO ' };

function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return (a.file || '').localeCompare(b.file || '');
  });
}

function formatText(result) {
  const lines = [];
  lines.push(`Theme locale check — ${result.themeDir}`);
  lines.push('');

  for (const ns of ['storefront', 'schema']) {
    const info = result.namespaces[ns];
    if (!info) continue;
    lines.push(`${ns} namespace: default=${info.defaultFile || '(none)'} locales=[${info.locales.join(', ')}]${info.keyCount != null ? ` keys=${info.keyCount}` : ''}`);
  }
  if (result.usage) {
    lines.push(`Usage scan: ${result.usage.filesScanned} theme file(s) scanned, ${result.usage.undefinedUsed.length} undefined-key use(s), ${result.usage.unusedDefined.length} possibly-unused key(s)`);
  }
  lines.push('');

  const sorted = sortIssues(result.issues);
  if (sorted.length === 0) {
    lines.push('No issues found.');
  } else {
    for (const issue of sorted) {
      lines.push(`[${SEVERITY_LABEL[issue.severity]}] ${issue.message}`);
    }
  }

  lines.push('');
  lines.push(`${result.summary.errors} error(s), ${result.summary.warnings} warning(s), ${result.summary.infos} info`);
  return lines.join('\n');
}

function formatJson(result) {
  return JSON.stringify(
    {
      themeDir: result.themeDir,
      namespaces: result.namespaces,
      usage: result.usage
        ? {
          filesScanned: result.usage.filesScanned,
          undefinedUsed: result.usage.undefinedUsed,
          unusedDefined: result.usage.unusedDefined,
        }
        : null,
      issues: sortIssues(result.issues),
      summary: result.summary,
    },
    null,
    2,
  );
}

module.exports = { formatText, formatJson, sortIssues };
