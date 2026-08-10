const fs = require('fs');
const vm = require('vm');
const path = require('path');

class FakeStyle {
  constructor() { this.values = Object.create(null); }
  setProperty(name, value) { this.values[name] = String(value); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.className = '';
    this.attributes = Object.create(null);
    this.style = new FakeStyle();
    this.textContent = '';
    this.innerHTML = '';
    this.nextSibling = null;
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const previous = this.children[this.children.length - 1];
    if (previous) previous.nextSibling = child;
    child.parentNode = this;
    child.nextSibling = null;
    this.children.push(child);
    return child;
  }
  insertBefore(child, reference) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    this.children.splice(index, 0, child);
    this._syncSiblings();
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    child.nextSibling = null;
    this._syncSiblings();
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  _syncSiblings() {
    this.children.forEach((child, index) => {
      child.nextSibling = this.children[index + 1] || null;
    });
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  removeEventListener() {}
}

class FakeTextAreaElement extends FakeElement {
  constructor() {
    super('textarea');
    this.value = '';
    this.scrollLeft = 0;
    this.scrollTop = 0;
  }
}

const document = {
  createElement(tag) {
    return tag.toLowerCase() === 'textarea' ? new FakeTextAreaElement() : new FakeElement(tag);
  }
};

const window = {
  document,
  HTMLTextAreaElement: FakeTextAreaElement,
  getComputedStyle() {
    return {
      width: '400px', height: '200px', fontFamily: 'monospace', fontSize: '14px',
      fontWeight: '400', lineHeight: '21px', letterSpacing: 'normal',
      paddingTop: '12px', paddingRight: '12px', paddingBottom: '12px', paddingLeft: '12px'
    };
  }
};
window.window = window;

const sourcePath = path.join(__dirname, '..', 'src', 'sql-highlighter.js');
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), { window, console });
const SqlHighlighter = window.SqlHighlighter;
const bigquery = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'dictionaries', 'bigquery.json'), 'utf8'));
SqlHighlighter.registerDialect(bigquery);

const host = new FakeElement('div');
const textarea = new FakeTextAreaElement();
textarea.value = 'SELECT customer_id, customer_id FROM orders';
host.appendChild(textarea);

const editor = SqlHighlighter.attach(textarea, { dialect: 'bigquery' });

if (typeof editor.setDecorations !== 'function') throw new Error('setDecorations is missing');
if (typeof editor.clearDecorations !== 'function') throw new Error('clearDecorations is missing');

editor.setDecorations([
  { start: 7, end: 18, className: 'test-match' },
  { start: 7, end: 18, className: 'test-current' },
  { start: 20, end: 31, className: 'test-match' }
]);

const code = editor.element.children[1];
if (!code.innerHTML.includes('class="sqhl-column test-match test-current">customer_id</span>')) {
  throw new Error('overlapping decoration did not preserve syntax class');
}
if (!code.innerHTML.includes('class="sqhl-column test-match">customer_id</span>')) {
  throw new Error('second match decoration missing');
}

editor.clearDecorations();
if (code.innerHTML.includes('test-match') || code.innerHTML.includes('test-current')) {
  throw new Error('clearDecorations did not remove decorations');
}

let invalidRangeRejected = false;
try {
  editor.setDecorations([{ start: 3, end: 3, className: 'test-match' }]);
} catch (error) {
  invalidRangeRejected = error instanceof TypeError || error.name === 'TypeError';
}
if (!invalidRangeRejected) throw new Error('empty range was accepted');

let invalidClassRejected = false;
try {
  editor.setDecorations([{ start: 0, end: 1, className: '" onmouseover="bad' }]);
} catch (error) {
  invalidClassRejected = error instanceof TypeError || error.name === 'TypeError';
}
if (!invalidClassRejected) throw new Error('unsafe className was accepted');

console.log('decoration-api.test.js: PASS');
