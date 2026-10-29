/**
 * Small allow-list HTML sanitizer used by the editor for incoming values and pasted content.
 *
 * - Parses the HTML inside an inert `<template>` (no script execution, no image loading).
 * - Elements not in the allow-list are unwrapped (their children are kept).
 * - Dangerous elements (script, style, iframe, ...) are removed together with their content.
 * - Attributes are filtered per tag, URLs are restricted to safe protocols and
 *   inline styles are reduced to a small set of harmless properties.
 */

export interface RteSanitizeOptions {
  /** Extra tags to allow (lower case). */
  allowedTags?: string[];
  /** Extra attributes to allow on every allowed tag (lower case). */
  allowedAttributes?: string[];
  /** Extra CSS properties to keep in `style` attributes. */
  allowedStyles?: string[];
  /** Keep `class` attributes (dropped by default, pasted content is usually full of them). */
  keepClasses?: boolean;
}

const ALLOWED_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'small',
  'code', 'pre', 'blockquote', 'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
]);

/** Removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript',
  'template', 'title', 'head', 'meta', 'link', 'base', 'svg', 'math', 'form', 'input',
  'button', 'textarea', 'select', 'option', 'audio', 'video', 'canvas', 'xml',
]);

const GLOBAL_ATTRS = new Set(['title', 'dir', 'lang', 'style']);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  ol: new Set(['start', 'type', 'reversed']),
  li: new Set(['value']),
};

const ALLOWED_STYLES = new Set([
  'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'color', 'background-color', 'margin-left', 'padding-left',
  // table layout and borders
  'width', 'table-layout', 'border', 'border-width', 'border-style', 'border-color',
]);

const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{1,2}\/|[^:/?#]*(?:[/?#]|$))/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

/** Returns true if the URL uses a safe protocol (http(s), mailto, tel, relative or anchor). */
export function isSafeUrl(url: string, allowDataImage = false): boolean {
  // strip whitespace and control characters browsers ignore (e.g. "java\tscript:")
  const clean = url.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!clean) return false;
  if (allowDataImage && SAFE_DATA_IMAGE.test(url.trim())) return true;
  return SAFE_URL.test(clean);
}

function cleanStyle(value: string, allowed: Set<string>): string {
  const out: string[] = [];
  for (const decl of value.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!allowed.has(prop) || !val) continue;
    if (/url\s*\(|expression\s*\(|javascript:|[\\<>]/i.test(val)) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

/**
 * Sanitizes an HTML string and returns safe HTML.
 * @param html  untrusted HTML
 * @param doc   the Document to use for parsing (defaults to the global `document`)
 */
export function sanitizeHtml(html: string, doc: Document = document, options: RteSanitizeOptions = {}): string {
  if (!html) return '';
  const tags = new Set([...ALLOWED_TAGS, ...(options.allowedTags ?? []).map((t) => t.toLowerCase())]);
  const extraAttrs = new Set((options.allowedAttributes ?? []).map((a) => a.toLowerCase()));
  const styles = new Set([...ALLOWED_STYLES, ...(options.allowedStyles ?? []).map((s) => s.toLowerCase())]);

  const template = doc.createElement('template');
  template.innerHTML = html;

  const cleanAttributes = (el: Element, tag: string): void => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const allowed =
        GLOBAL_ATTRS.has(name) ||
        TAG_ATTRS[tag]?.has(name) ||
        extraAttrs.has(name) ||
        (name === 'class' && options.keepClasses);
      if (!allowed || name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'href' && !isSafeUrl(attr.value)) el.removeAttribute(attr.name);
      else if (name === 'src' && !isSafeUrl(attr.value, true)) el.removeAttribute(attr.name);
      else if (name === 'target' && !['_blank', '_self'].includes(attr.value)) el.removeAttribute(attr.name);
      else if (name === 'style') {
        const style = cleanStyle(attr.value, styles);
        if (style) el.setAttribute('style', style);
        else el.removeAttribute('style');
      }
    }
    if (tag === 'a' && el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  };

  const cleanChildren = (parent: Node): void => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3 /* TEXT_NODE */) continue;
      if (node.nodeType !== 1 /* ELEMENT_NODE */) {
        parent.removeChild(node); // comments, processing instructions...
        continue;
      }
      const el = node as Element;
      const tag = el.localName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
        parent.removeChild(el);
      } else if (!tags.has(tag)) {
        cleanChildren(el);
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      } else {
        cleanAttributes(el, tag);
        cleanChildren(el);
      }
    }
  };

  cleanChildren(template.content);
  return template.innerHTML;
}
