const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../src/sql-highlighter.css'), 'utf8');

function rule(name) {
  const pattern = '\\.sqhl-' + name + '\\s*\\{([^}]*)\\}';
  const match = css.match(new RegExp(pattern, 'm'));
  if (!match) throw new Error('missing .sqhl-' + name + ' rule');
  return match[1];
}

function value(body, property) {
  const match = body.match(new RegExp(property + '\\s*:\\s*([^;]+);'));
  return match ? match[1].trim() : '';
}

const expected = {
  keyword: { color: '#7B30D0', fontStyle: 'italic' },
  operator: { color: '#7B30D0', fontStyle: 'italic' },
  function: { color: '#d33e82', fontStyle: 'italic' },
  table: { color: '#3e8ff1', fontStyle: 'italic', background: '#f4f8fc' },
  column: { color: '#252525', fontStyle: 'normal' },
  alias: { color: '#000000', fontStyle: 'normal' },
  string: { color: '#d33e82', fontStyle: 'normal', background: '#fcf5f8' },
  parameter: { color: '#d33e82', fontStyle: 'normal', background: '#fcf5f8' },
  number: { color: '#d33e82', fontStyle: 'normal', background: '#fcf5f8' },
  literal: { color: '#7B30D0', fontStyle: 'italic' },
  comment: { color: '#7B30D0', fontStyle: 'italic', background: '#eddeff' },
  punctuation: { color: '#7d7d7d', fontStyle: 'normal' }
};

for (const [name, spec] of Object.entries(expected)) {
  const body = rule(name);
  if (value(body, 'color') !== spec.color) throw new Error(`${name} color mismatch`);
  if (value(body, 'font-style') !== spec.fontStyle) throw new Error(`${name} font-style mismatch`);
  if (spec.background && value(body, 'background-color') !== spec.background) {
    throw new Error(`${name} background mismatch`);
  }
}

if (value(rule('table'), 'text-decoration') !== 'underline') {
  throw new Error('table must be underlined');
}

if (!css.includes('--sqhl-selection: rgb(255 254 0 / 29%);')) {
  throw new Error('selection color mismatch');
}

const commentRule = rule('comment');
if (value(commentRule, 'padding-top') !== '0.25em') {
  throw new Error('comment padding-top must align background to the 1.5 line height');
}
if (value(commentRule, 'padding-bottom') !== '0.25em') {
  throw new Error('comment padding-bottom must align background to the 1.5 line height');
}

console.log('STYLE RULES PASSED');
