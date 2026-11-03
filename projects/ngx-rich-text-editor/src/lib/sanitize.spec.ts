import { isSafeUrl, sanitizeHtml } from './sanitize';

describe('isSafeUrl', () => {
  it('accepts web, mail, phone, relative and anchor URLs', () => {
    for (const url of ['https://example.com', 'http://a.b/c?d#e', 'mailto:a@b.c', 'tel:+33123', '/path', './a', '../a', '#top', 'page.html']) {
      expect(isSafeUrl(url)).withContext(url).toBeTrue();
    }
  });

  it('rejects script URLs, even obfuscated', () => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:x', 'vbscript:x', 'data:text/html,<b>']) {
      expect(isSafeUrl(url)).withContext(url).toBeFalse();
    }
  });

  it('rejects empty URLs', () => {
    expect(isSafeUrl('')).toBeFalse();
    expect(isSafeUrl('  ')).toBeFalse();
  });

  it('accepts base64 images only when allowed', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(isSafeUrl(png)).toBeFalse();
    expect(isSafeUrl(png, true)).toBeTrue();
    expect(isSafeUrl('data:image/svg+xml;base64,PHN2Zz4=', true)).toBeFalse();
  });
});

describe('sanitizeHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('keeps allowed formatting', () => {
    const html = '<h2>T</h2><p><b>b</b> <i>i</i> <a href="https://x.y">l</a></p><ul><li>a</li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('removes dangerous elements with their content', () => {
    expect(sanitizeHtml('<p>Hi<script>alert(1)</script></p>')).toBe('<p>Hi</p>');
    expect(sanitizeHtml('<p>a<iframe src="x"></iframe><style>p{}</style><svg><g></g></svg></p>')).toBe('<p>a</p>');
  });

  it('unwraps unknown elements and keeps their children', () => {
    expect(sanitizeHtml('<section><p>a<font color="red">b</font></p></section>')).toBe('<p>ab</p>');
  });

  it('removes comments', () => {
    expect(sanitizeHtml('<p>a<!-- secret -->b</p>')).toBe('<p>ab</p>');
  });

  it('removes event handlers and unknown attributes', () => {
    expect(sanitizeHtml('<p onclick="x()" id="a" class="c" data-x="1">t</p>')).toBe('<p>t</p>');
    expect(sanitizeHtml('<img src="a.png" onerror="x()">')).toBe('<img src="a.png">');
  });

  it('removes unsafe URLs', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<img src="javascript:x">')).toBe('<img>');
  });

  it('keeps base64 images', () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=" width="20">';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('only keeps safe targets and adds rel to _blank links', () => {
    expect(sanitizeHtml('<a href="/a" target="_blank">x</a>')).toBe('<a href="/a" target="_blank" rel="noopener noreferrer">x</a>');
    expect(sanitizeHtml('<a href="/a" target="evil">x</a>')).toBe('<a href="/a">x</a>');
  });

  it('filters inline styles', () => {
    expect(sanitizeHtml('<p style="color: red; position: fixed; font-size: 40px">t</p>')).toBe('<p style="color: red">t</p>');
    expect(sanitizeHtml('<p style="background-color: url(x)">t</p>')).toBe('<p>t</p>');
    const cell = '<table><tbody><tr><td style="border-top: 1px solid red">t</td></tr></tbody></table>';
    expect(sanitizeHtml(cell)).toBe(cell);
  });

  it('keeps table structure and attributes', () => {
    const html = '<table style="table-layout: fixed; width: 200px"><colgroup><col style="width: 100px"></colgroup>'
      + '<tbody><tr><td colspan="2">a</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  describe('options', () => {
    it('allowedTags keeps extra tags', () => {
      expect(sanitizeHtml('<p><kbd>K</kbd></p>', document, { allowedTags: ['KBD'] })).toBe('<p><kbd>K</kbd></p>');
    });

    it('allowedAttributes keeps extra attributes but never event handlers', () => {
      const out = sanitizeHtml('<p data-id="1" onclick="x()">t</p>', document, { allowedAttributes: ['data-id', 'onclick'] });
      expect(out).toBe('<p data-id="1">t</p>');
    });

    it('allowedStyles keeps extra CSS properties', () => {
      expect(sanitizeHtml('<p style="font-size: 20px">t</p>', document, { allowedStyles: ['font-size'] }))
        .toBe('<p style="font-size: 20px">t</p>');
    });

    it('keepClasses keeps class attributes', () => {
      expect(sanitizeHtml('<p class="lead">t</p>', document, { keepClasses: true })).toBe('<p class="lead">t</p>');
    });
  });
});
