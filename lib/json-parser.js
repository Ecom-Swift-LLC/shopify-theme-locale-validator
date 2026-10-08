'use strict';

/**
 * A small hand-rolled JSON parser used instead of JSON.parse() because
 * JSON.parse() silently keeps the last value when an object has a
 * duplicate key and never tells you it happened. Locale files are hand
 * edited and copy-pasted a lot, so that exact mistake is common and
 * otherwise invisible.
 *
 * Returns { value, duplicates, error } where:
 *   - value is the parsed JS value (same shape JSON.parse would give you
 *     for well-formed input: last-value-wins on duplicate keys)
 *   - duplicates is an array of { path, key, line, column } for every
 *     repeated key found in any object, in source order
 *   - error is null on success, or { message, line, column } on a syntax
 *     error (parsing stops at the first one)
 */
function parseJsonTrackDuplicates(text) {
  const n = text.length;
  let i = 0;
  const duplicates = [];

  function lineColAt(pos) {
    let line = 1;
    let lastNewline = -1;
    for (let p = 0; p < pos; p++) {
      if (text.charCodeAt(p) === 10 /* \n */) {
        line++;
        lastNewline = p;
      }
    }
    return { line, column: pos - lastNewline };
  }

  function fail(message, pos = i) {
    const { line, column } = lineColAt(pos);
    const err = new Error(`${message} (line ${line}, column ${column})`);
    err.line = line;
    err.column = column;
    throw err;
  }

  function skipWs() {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  }

  function parseValue(path) {
    skipWs();
    if (i >= n) fail('Unexpected end of input');
    const c = text[i];
    if (c === '{') return parseObject(path);
    if (c === '[') return parseArray(path);
    if (c === '"') return parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    fail(`Unexpected token '${c}'`);
  }

  function parseObject(path) {
    i++; // consume '{'
    const obj = {};
    const seen = new Set();
    skipWs();
    if (text[i] === '}') { i++; return obj; }
    for (;;) {
      skipWs();
      if (text[i] !== '"') fail("Expected a string key");
      const keyPos = i;
      const key = parseString();
      skipWs();
      if (text[i] !== ':') fail("Expected ':' after key");
      i++;
      const childPath = path ? `${path}.${key}` : key;
      const value = parseValue(childPath);
      if (seen.has(key)) {
        const { line, column } = lineColAt(keyPos);
        duplicates.push({ path: childPath, key, line, column });
      } else {
        seen.add(key);
      }
      obj[key] = value;
      skipWs();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; break; }
      fail("Expected ',' or '}'");
    }
    return obj;
  }

  function parseArray(path) {
    i++; // consume '['
    const arr = [];
    skipWs();
    if (text[i] === ']') { i++; return arr; }
    let idx = 0;
    for (;;) {
      const value = parseValue(`${path}[${idx}]`);
      arr.push(value);
      idx++;
      skipWs();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; break; }
      fail("Expected ',' or ']'");
    }
    return arr;
  }

  function parseString() {
    const startPos = i;
    i++; // opening quote
    let out = '';
    for (;;) {
      if (i >= n) fail('Unterminated string', startPos);
      const c = text[i];
      if (c === '"') { i++; break; }
      if (c === '\\') {
        i++;
        const e = text[i];
        switch (e) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'u': {
            const hex = text.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail(`Invalid escape '\\${e}'`);
        }
        i++;
      } else if (c.charCodeAt(0) < 0x20) {
        fail('Unescaped control character in string');
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }

  function parseNumber() {
    const start = i;
    if (text[i] === '-') i++;
    if (text[i] === '0') {
      i++;
    } else {
      if (!(text[i] >= '0' && text[i] <= '9')) fail('Invalid number');
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    if (text[i] === '.') {
      i++;
      if (!(text[i] >= '0' && text[i] <= '9')) fail('Invalid number');
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      if (!(text[i] >= '0' && text[i] <= '9')) fail('Invalid number');
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    return Number(text.slice(start, i));
  }

  try {
    skipWs();
    if (i >= n) fail('Empty document');
    const value = parseValue('');
    skipWs();
    if (i < n) fail('Unexpected trailing content');
    return { value, duplicates, error: null };
  } catch (err) {
    return {
      value: null,
      duplicates,
      error: { message: err.message, line: err.line, column: err.column },
    };
  }
}

module.exports = { parseJsonTrackDuplicates };
