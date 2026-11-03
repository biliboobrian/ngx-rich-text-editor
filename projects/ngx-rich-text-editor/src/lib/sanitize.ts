/**
 * Small allow-list HTML sanitizer used by the editor for incoming values and pasted content.
 *
 * - Parses the HTML inside an inert `<template>` (no script execution, no image loading).
 * - Elements not in the allow-list are unwrapped (their children are kept).
 * - Dangerous elements (script, style, iframe, ...) are removed together with their content.
 * - Attributes are filtered per tag, URLs are restricted to safe protocols and
 *   inline styles are reduced to a small set of harmless properties.
 */

/**
 * Options of {@link sanitizeHtml} and of the editor's `sanitizeOptions` input: what to keep on top
 * of the default allow-list. Dangerous content is always removed, whatever the options.
 *
 * @example
 * ```ts
 * const options: RteSanitizeOptions = { allowedTags: ['kbd'], allowedStyles: ['font-size'], keepClasses: true };
 * ```
 * @since 0.1.0
 */
export interface RteSanitizeOptions {
  /**
   * Extra tags to keep, besides the default ones (text formatting, headings, lists, links,
   * images, tables…). Case-insensitive. Unknown tags are unwrapped (their content is kept); tags
   * that can run code or load content (`script`, `style`, `iframe`, `svg`, `form`…) are always
   * removed with their content.
   *
   * @default []
   * @example ['abbr', 'kbd', 'dl', 'dt', 'dd']
   */
  allowedTags?: string[];
  /**
   * Extra attributes to keep on every allowed tag (by default only `title`, `dir`, `lang`, `style`
   * and a few per tag: `href`, `src`, `alt`, `width`, `colspan`…). Case-insensitive. Event
   * handlers (`on*`) are always removed.
   *
   * @default []
   * @example ['data-id', 'id']
   */
  allowedAttributes?: string[];
  /**
   * Extra CSS properties to keep in `style` attributes (by default: alignment, font weight and
   * style, text decoration, colors, indentation, table width and borders). Case-insensitive.
   * Values with `url()`, `expression()` or `javascript:` are always removed.
   *
   * @default []
   * @example ['font-size', 'font-family', 'line-height']
   */
  allowedStyles?: string[];
  /**
   * Keeps `class` attributes. Dropped by default: content pasted from Word or web pages is full of
   * classes that mean nothing in your app.
   *
   * @default false
   */
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
  ...['top', 'right', 'bottom', 'left'].flatMap((side) =>
    ['', '-width', '-style', '-color'].map((part) => `border-${side}${part}`),
  ),
]);

const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{1,2}\/|[^:/?#]*(?:[/?#]|$))/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

/**
 * Tells whether a URL is safe for an `href` / `src`. Accepted: `http(s):`, `mailto:`, `tel:`,
 * relative URLs (`/a`, `./a`, `page.html`) and anchors (`#top`). Refused: `javascript:`,
 * `vbscript:`, `data:` (unless `allowDataImage`)…, even disguised with spaces, tabs or mixed case.
 *
 * @param url - the URL to check
 * @param allowDataImage - also accept base64 images: `data:image/(png|gif|jpeg|webp|bmp);base64,…`
 *   (not SVG, which can hold scripts)
 * @returns `true` if the URL can be used
 * @example
 * ```ts
 * isSafeUrl('https://example.com');           // true
 * isSafeUrl('java\tscript:alert(1)');          // false
 * isSafeUrl('data:image/png;base64,…', true);  // true
 * ```
 * @since 0.1.0
 */
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
 * Sanitizes an HTML string with an allow-list and returns safe HTML. The same function the editor
 * uses for its value, pasted HTML and `insertHtml()`; use it on the server-side rendering of the
 * emitted HTML too.
 *
 * - the HTML is parsed in an inert `<template>`: no script runs, no image loads;
 * - unknown tags are unwrapped (their content is kept), dangerous ones (`script`, `style`,
 *   `iframe`, `svg`, `form`…) are removed with their content, comments are removed;
 * - attributes are filtered per tag, event handlers (`on*`) are removed, `href` / `src` must pass
 *   {@link isSafeUrl}, `target="_blank"` links get `rel="noopener noreferrer"`;
 * - inline styles keep only harmless properties, without `url()` or `expression()`.
 *
 * @param html - untrusted HTML
 * @param doc - the Document used for parsing; defaults to the global `document` (pass one from
 *   `DOCUMENT` or a DOM implementation such as domino / jsdom on the server)
 * @param options - extra tags, attributes or styles to keep, see {@link RteSanitizeOptions}
 * @returns the safe HTML (`''` for an empty input)
 * @example
 * ```ts
 * sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script></p>'); // '<p>Hi</p>'
 * sanitizeHtml(html, document, { allowedStyles: ['font-size'] });
 * ```
 * @since 0.1.0
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
