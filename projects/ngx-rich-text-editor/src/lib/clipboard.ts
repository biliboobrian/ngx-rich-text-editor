/**
 * Clipboard conversions between the editor and office suites (Microsoft Word / Excel,
 * LibreOffice, Google Docs / Sheets…).
 *
 * - Paste: office HTML keeps most of its formatting in a `<style>` sheet (`.xl65 { font-weight:
 *   700 }`, `p.MsoListParagraph`…) and in `mso-*` properties, which the sanitizer would drop.
 *   {@link normalizePastedHtml} turns them into plain HTML: class styles become inline styles,
 *   Word list paragraphs become real `<ul>` / `<ol>` lists.
 * - Copy: {@link wordClipboard} and {@link excelClipboard} build the HTML that Word and Excel
 *   import best (inline styles, visible borders, cell line breaks kept in the cell).
 */

/** What the editor writes to the clipboard on copy / cut. */
export interface RteClipboardPayload {
  /** `text/html` flavor. */
  html: string;
  /** `text/plain` flavor (tab-separated values for a table). */
  text: string;
}

interface ClassRule {
  tag: string;
  cls: string;
  decls: Map<string, string>;
}

/** Blocks flattened to lines when cell content is copied to Excel. */
const CELL_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, li, ul, ol, blockquote, pre';

const DEFAULT_CELL_BORDER = '1px solid #000000';

const SIMPLE_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([^()]*\)|hsla?\([^()]*\))$/i;

function parseDeclarations(text: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const decl of text.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).replace(/!important/i, '').trim();
    if (prop && val) decls.set(prop, val);
  }
  return decls;
}

/** Class rules (`.c`, `tag.c`) of the style sheets; other selectors are ignored. */
function parseClassRules(css: string): ClassRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '');
  const rules: ClassRule[] = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = parseDeclarations(match[2]);
    for (const selector of match[1].split(',')) {
      const m = /^([a-z][a-z0-9]*)?\.([\w-]+)$/i.exec(selector.trim());
      if (m) rules.push({ tag: (m[1] ?? '').toLowerCase(), cls: m[2].toLowerCase(), decls });
    }
  }
  return rules;
}

/** Maps office-only properties to standard CSS and drops the noise. */
function normalizeDeclarations(decls: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const color = (value: string) => {
    const v = value.trim();
    return SIMPLE_COLOR.test(v) && !/^(?:windowtext|auto|none|transparent|initial|inherit)$/i.test(v) ? v : null;
  };
  for (const [prop, value] of decls) {
    if (prop === 'mso-highlight' || prop === 'background') {
      const c = color(value);
      if (c) out.set('background-color', c);
    } else if (prop === 'text-underline-style' || prop === 'text-underline') {
      if (!/none/i.test(value)) out.set('text-decoration', 'underline');
    } else if (prop === 'text-line-through') {
      if (!/none/i.test(value)) out.set('text-decoration', 'line-through');
    } else if (prop.startsWith('mso-')) {
      continue;
    } else if (prop === 'color') {
      // black is the default color of documents: keep the editor's one (readable on dark themes)
      const c = color(value);
      if (c && !/^(?:#000(?:000)?|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(c)) out.set(prop, c);
    } else if (prop === 'background-color') {
      const c = color(value);
      if (c) out.set(prop, c);
    } else if (prop === 'text-align') {
      if (value.toLowerCase() !== 'general') out.set(prop, value);
    } else if (prop.startsWith('border')) {
      out.set(prop, value.replace(/windowtext/gi, '#000000'));
    } else {
      out.set(prop, value);
    }
  }
  return out;
}

function serializeDeclarations(decls: Map<string, string>): string {
  return Array.from(decls, ([prop, value]) => `${prop}: ${value}`).join('; ');
}

function nextElementSibling(el: Element): Element | null {
  for (let node = el.nextSibling; node; node = node.nextSibling) {
    if (node.nodeType === 1) return node as Element;
    if (node.nodeType === 3 && node.textContent!.trim()) return null;
  }
  return null;
}

/** Removes the bullet / number Word writes before a list paragraph and returns its text. */
function takeListMarker(p: Element): string {
  let marker = '';
  const doc = p.ownerDocument;
  const walker = doc.createTreeWalker(p, 128 /* SHOW_COMMENT */);
  const starts: Comment[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/\[if !supportLists\]/i.test((n as Comment).data)) starts.push(n as Comment);
  }
  for (const start of starts) {
    let node = start.nextSibling;
    while (node && !(node.nodeType === 8 && /\[endif\]/i.test((node as Comment).data))) {
      const next = node.nextSibling;
      marker += node.textContent ?? '';
      node.parentNode!.removeChild(node);
      node = next;
    }
  }
  for (const el of Array.from(p.querySelectorAll('[style]'))) {
    if (!el.isConnected || !/mso-list:\s*ignore/i.test(el.getAttribute('style')!)) continue;
    marker ||= el.textContent ?? '';
    el.remove();
  }
  return marker.replace(/ /g, ' ').trim();
}

/** `<ol type>` of a Word marker (`1.`, `a)`, `iv.`…), `null` for a bullet. */
function orderedType(marker: string): string | null {
  const m = /^\(?([0-9]+|[a-z]{1,6})[.)]$/i.exec(marker);
  if (!m) return null;
  const value = m[1];
  if (/^\d+$/.test(value)) return '1';
  if (/^[ivxlcdm]+$/.test(value) && value !== 'c' && value !== 'd' && value !== 'l' && value !== 'm') return 'i';
  if (/^[IVXLCDM]+$/.test(value) && !/^[CDLM]$/.test(value)) return 'I';
  return value === value.toLowerCase() ? 'a' : 'A';
}

/** Turns Word list paragraphs (`<p style="mso-list:l0 level1 lfo1">`) into nested lists. */
function convertWordLists(body: HTMLElement): void {
  const doc = body.ownerDocument;
  const pattern = /mso-list:\s*(l\d+)\s+level(\d+)/i;
  const items = Array.from(body.querySelectorAll('p, h1, h2, h3, h4, h5, h6')).filter((el) =>
    pattern.test(el.getAttribute('style') ?? ''),
  );
  const set = new Set(items);
  const done = new Set<Element>();
  for (const first of items) {
    if (done.has(first)) continue;
    const group = [first];
    for (let next = nextElementSibling(first); next && set.has(next); next = nextElementSibling(next)) group.push(next);
    group.forEach((el) => done.add(el));

    const fragment = doc.createDocumentFragment();
    const stack: HTMLElement[] = [];
    let listId = '';
    for (const p of group) {
      const [, id, rawLevel] = pattern.exec(p.getAttribute('style')!)!;
      const level = Math.min(Math.max(Number(rawLevel), 1), 9);
      const type = orderedType(takeListMarker(p));
      const tag = type ? 'ol' : 'ul';
      if (id !== listId) {
        stack.length = 0;
        listId = id;
      }
      while (stack.length > level) stack.pop();
      if (stack.length === level && stack[level - 1].localName !== tag) stack.pop();
      while (stack.length < level) {
        const list = doc.createElement(tag);
        if (type && type !== '1') list.setAttribute('type', type);
        const parent = stack[stack.length - 1];
        if (parent) {
          const li = (parent.lastElementChild as HTMLElement | null) ?? parent.appendChild(doc.createElement('li'));
          li.appendChild(list);
        } else {
          fragment.appendChild(list);
        }
        stack.push(list);
      }
      const li = doc.createElement('li');
      while (p.firstChild) li.appendChild(p.firstChild);
      stack[stack.length - 1].appendChild(li);
    }
    first.parentNode!.insertBefore(fragment, first);
    group.forEach((el) => el.remove());
  }
}

/** Tells whether the HTML comes from an office suite (style sheet, `mso-*` styles, Office namespaces). */
export function isOfficeHtml(html: string): boolean {
  return /urn:schemas-microsoft-com:office|<style[\s>]|mso-|class="?Mso|google-sheets-html-origin|docs-internal-guid/i.test(html);
}

/**
 * Converts HTML pasted from Word, Excel or another office suite to plain HTML the sanitizer
 * keeps: class styles of the `<style>` sheet are inlined, `mso-*` properties are mapped to
 * standard CSS (highlight, underline…) or dropped, Word list paragraphs become `<ul>` / `<ol>`,
 * images pointing to local temporary files are removed. Other HTML is returned unchanged.
 *
 * @param html - the `text/html` clipboard flavor
 * @param doc - the Document of the editor (its window provides the parser)
 * @returns the converted HTML, still to be sanitized
 */
export function normalizePastedHtml(html: string, doc: Document): string {
  if (!html || !isOfficeHtml(html)) return html;
  const Parser = doc.defaultView?.DOMParser ?? (typeof DOMParser === 'undefined' ? null : DOMParser);
  if (!Parser) return html;
  // inert: no script runs, no image loads
  const parsed = new Parser().parseFromString(html, 'text/html');
  const body = parsed.body;

  const rules = Array.from(parsed.querySelectorAll('style')).flatMap((s) => parseClassRules(s.textContent ?? ''));
  // `.c` rules first, then the more specific `tag.c` ones
  rules.sort((a, b) => Number(!!a.tag) - Number(!!b.tag));

  for (const img of Array.from(body.querySelectorAll('img'))) {
    if (/^\s*file:/i.test(img.getAttribute('src') ?? '')) img.remove(); // Word's temporary files
  }
  convertWordLists(body);

  for (const el of Array.from(body.querySelectorAll('[class], [style]'))) {
    const decls = new Map<string, string>();
    const classes = Array.from(el.classList, (c) => c.toLowerCase());
    if (classes.length) {
      const tag = el.localName.toLowerCase();
      for (const rule of rules) {
        if (classes.includes(rule.cls) && (!rule.tag || rule.tag === tag)) rule.decls.forEach((v, k) => decls.set(k, v));
      }
    }
    parseDeclarations(el.getAttribute('style') ?? '').forEach((v, k) => {
      decls.delete(k); // keep the inline declaration last
      decls.set(k, v);
    });
    const style = serializeDeclarations(normalizeDeclarations(decls));
    if (style) el.setAttribute('style', style);
    else el.removeAttribute('style');
  }
  toSemanticTags(body);
  fixListNesting(body);
  fixTableWidths(body);
  for (const el of Array.from(body.querySelectorAll('[dir="ltr"]'))) el.removeAttribute('dir');
  return body.innerHTML;
}

/** A CSS / attribute length in px (`100`, `100px`, `48pt`), or null. */
function lengthPx(value: string | null | undefined): number | null {
  const m = /^\s*([\d.]+)\s*(px|pt)?\s*$/i.exec(value ?? '');
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2]?.toLowerCase() === 'pt' ? 4 / 3 : 1);
  return n > 0 ? n : null;
}

/**
 * Column widths in the editor's form: `<col style="width: Npx">`, fixed layout and the table
 * width as their sum. Google Sheets writes `<col width="100">` (an attribute the sanitizer drops)
 * on a `width: 0px; table-layout: fixed` table, which would collapse every column.
 */
function fixTableWidths(body: HTMLElement): void {
  for (const table of Array.from(body.querySelectorAll<HTMLTableElement>('table'))) {
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col, :scope > col'));
    const widths = cols.map((col) => lengthPx(col.style.width) ?? lengthPx(col.getAttribute('width')));
    if (cols.length && widths.every((w) => w !== null)) {
      cols.forEach((col, i) => {
        col.removeAttribute('width');
        col.style.width = `${Math.round(widths[i]!)}px`;
      });
      if (!cols[0].parentElement || cols[0].parentElement.localName !== 'colgroup') {
        const group = table.ownerDocument.createElement('colgroup');
        table.insertBefore(group, table.caption ? table.caption.nextSibling : table.firstChild);
        cols.forEach((col) => group.appendChild(col));
      }
      table.style.tableLayout = 'fixed';
      table.style.width = `${Math.round(widths.reduce((sum, w) => sum! + w!, 0)!)}px`;
    } else {
      for (const group of Array.from(table.querySelectorAll(':scope > colgroup'))) group.remove();
      for (const col of Array.from(table.querySelectorAll(':scope > col'))) col.remove();
      table.style.removeProperty('table-layout');
      if (!lengthPx(table.style.width) && !/%$/.test(table.style.width)) table.style.removeProperty('width');
    }
    if (!table.getAttribute('style')) table.removeAttribute('style');
  }
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

/** Formatting written with styles (Google Docs: `<span style="font-weight:700">`) becomes tags (`<b>`). */
function toSemanticTags(body: HTMLElement): void {
  const doc = body.ownerDocument;
  for (const el of Array.from(body.querySelectorAll('b, strong, i, em, span'))) {
    const tag = el.localName;
    const decls = parseDeclarations(el.getAttribute('style') ?? '');
    const weight = decls.get('font-weight');
    const fontStyle = decls.get('font-style');
    const decoration = decls.get('text-decoration') ?? decls.get('text-decoration-line') ?? '';
    const align = decls.get('vertical-align');
    const wrappers: string[] = [];
    let drop = false; // the tag says the opposite of its style: Google Docs' <b style="font-weight:normal">

    if (weight !== undefined) {
      const bold = /^(?:bold|bolder|[6-9]00)$/i.test(weight);
      if (tag === 'span' && bold) wrappers.push('b');
      if ((tag === 'b' || tag === 'strong') && !bold) drop = true;
      decls.delete('font-weight');
    }
    if (fontStyle !== undefined) {
      const italic = /italic|oblique/i.test(fontStyle);
      if (tag === 'span' && italic) wrappers.push('i');
      if ((tag === 'i' || tag === 'em') && !italic) drop = true;
      decls.delete('font-style');
    }
    if (tag === 'span') {
      if (/underline/i.test(decoration)) wrappers.push('u');
      if (/line-through/i.test(decoration)) wrappers.push('s');
      if (align === 'super') wrappers.push('sup');
      else if (align === 'sub') wrappers.push('sub');
      decls.delete('vertical-align');
    }
    if (decoration !== '' && (tag === 'span' || /^none$/i.test(decoration))) {
      decls.delete('text-decoration');
      decls.delete('text-decoration-line');
    }

    const style = serializeDeclarations(decls);
    if (style) el.setAttribute('style', style);
    else el.removeAttribute('style');

    if (wrappers.length) {
      let inner: Element = el;
      for (const name of wrappers) {
        const wrapper = doc.createElement(name);
        while (inner.firstChild) wrapper.appendChild(inner.firstChild);
        inner.appendChild(wrapper);
        inner = wrapper;
      }
    }
    if (drop) {
      if (style && tag !== 'span') {
        const span = doc.createElement('span');
        span.setAttribute('style', style);
        while (el.firstChild) span.appendChild(el.firstChild);
        el.replaceWith(span);
      } else {
        unwrap(el);
      }
    } else if (tag === 'span' && !el.attributes.length) {
      unwrap(el);
    }
  }
}

/**
 * Google Docs writes nested lists as `<ul><li/><ul>…</ul></ul>` and wraps the text of each item in
 * a `<p>`: move the sub-lists into the previous item and unwrap the paragraphs.
 */
function fixListNesting(body: HTMLElement): void {
  const doc = body.ownerDocument;
  for (const list of Array.from(body.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol'))) {
    let prev = list.previousElementSibling;
    if (!prev || prev.localName !== 'li') {
      prev = doc.createElement('li');
      list.before(prev);
    }
    prev.appendChild(list);
  }
  for (const li of Array.from(body.querySelectorAll('li'))) {
    const paragraphs = Array.from(li.children).filter((c) => c.localName === 'p');
    paragraphs.forEach((p, i) => {
      if (i > 0) p.before(doc.createElement('br'));
      unwrap(p);
    });
  }
}

// ------------------------------------------------------------------ copy

/** Removes the comment anchors (`<span data-comment>`), keeping their text. */
function unwrapCommentAnchors(root: ParentNode): void {
  for (const span of Array.from(root.querySelectorAll('span[data-comment]'))) span.replaceWith(...Array.from(span.childNodes));
}

function hasBorderStyle(el: HTMLElement): boolean {
  return /(^|;)\s*border/i.test(el.getAttribute('style') ?? '');
}

/** The editor draws cell borders with its style sheet: write them inline so Word / Excel show them. */
function inlineTableStyles(root: ParentNode): void {
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>('table'))) {
    if (!table.style.borderCollapse) table.style.borderCollapse = 'collapse';
  }
  for (const cell of Array.from(root.querySelectorAll<HTMLTableCellElement>('td, th'))) {
    if (!hasBorderStyle(cell)) cell.style.border = DEFAULT_CELL_BORDER;
    if (!cell.style.padding) cell.style.padding = '4px 8px';
    if (!cell.style.verticalAlign) cell.style.verticalAlign = 'top';
  }
}

/**
 * Clipboard content for Word: the selected HTML with inline table borders, without comment
 * anchors, flagged as a Word document.
 *
 * @param content - a copy of the selected nodes (already wrapped in their ancestors)
 * @param text - the `text/plain` flavor (the selected text)
 */
export function wordClipboard(content: HTMLElement, text: string): RteClipboardPayload {
  unwrapCommentAnchors(content);
  inlineTableStyles(content);
  const html = '<meta name="ProgId" content="Word.Document">' + content.innerHTML;
  return { html, text };
}

/** `text/plain` value of a cell, quoted as Excel does when it holds tabs, line breaks or quotes. */
function tsvCell(cell: HTMLTableCellElement): string {
  const text = (cell.innerText ?? cell.textContent ?? '').replace(/ /g, ' ').replace(/\n{2,}/g, '\n').replace(/\n+$/, '');
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Flattens the blocks of a copied cell into lines: Excel would split them into several rows. */
function flattenCell(cell: HTMLTableCellElement): void {
  const doc = cell.ownerDocument;
  unwrapCommentAnchors(cell);
  for (const block of Array.from(cell.querySelectorAll(CELL_BLOCKS)).reverse()) {
    const next = block.nextSibling;
    if (next && !(next.nodeType === 1 && (next as Element).localName === 'br')) block.after(doc.createElement('br'));
    block.replaceWith(...Array.from(block.childNodes));
  }
  while (cell.lastChild && cell.lastChild.nodeType === 1 && (cell.lastChild as Element).localName === 'br') {
    cell.lastChild.remove();
  }
}

/**
 * Clipboard content for Excel: a table of the given cells (each row of `rows` becomes a row),
 * with inline styles, the column widths of `source`, line breaks kept in their cell, and
 * tab-separated values as plain text.
 *
 * @param source - the table the cells belong to
 * @param rows - the cells to copy, row by row
 * @param doc - the Document used to build the table
 */
export function excelClipboard(source: HTMLTableElement, rows: HTMLTableCellElement[][], doc: Document): RteClipboardPayload {
  const table = doc.createElement('table');
  const tableStyle = source.getAttribute('style');
  if (tableStyle) table.setAttribute('style', tableStyle);
  table.style.removeProperty('width'); // a part of the table has its own width

  const indexes = rows.flatMap((row) => row.map((cell) => cell.cellIndex));
  const cols = Array.from(source.querySelectorAll('col'));
  if (cols.length && indexes.length) {
    const colgroup = doc.createElement('colgroup');
    for (let c = Math.min(...indexes); c <= Math.max(...indexes); c++) {
      if (cols[c]) colgroup.appendChild(cols[c].cloneNode(true));
    }
    table.appendChild(colgroup);
  }

  const tbody = table.appendChild(doc.createElement('tbody'));
  for (const row of rows) {
    const tr = tbody.appendChild(doc.createElement('tr'));
    for (const cell of row) {
      const copy = cell.cloneNode(true) as HTMLTableCellElement;
      flattenCell(copy);
      tr.appendChild(copy);
    }
  }
  inlineTableStyles(table);

  const html =
    '<meta name="ProgId" content="Excel.Sheet">' +
    '<style>br { mso-data-placement: same-cell; } td, th { mso-number-format: General; }</style>' +
    table.outerHTML;
  const text = rows.map((row) => row.map(tsvCell).join('\t')).join('\n');
  return { html, text };
}
