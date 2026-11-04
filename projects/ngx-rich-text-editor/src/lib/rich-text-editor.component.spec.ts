import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RichTextEditorComponent } from './rich-text-editor.component';
import { RteIconDirective } from './icon.directive';
import { RTE_LABELS_FR, RtePromptFn } from './toolbar';

/** Waits for the async `selectionchange` events, then for change detection. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

/** Selects `[startOffset, endOffset)` of `node` (the whole content by default). */
function select(node: Node, startOffset = 0, endOffset = node.childNodes.length || (node as Text).length || 0): void {
  const range = document.createRange();
  range.setStart(node, startOffset);
  range.setEnd(node, endOffset);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function caret(node: Node, offset = 0): void {
  select(node, offset, offset);
}

/** A PNG data URL of the given size. */
function pngDataUrl(width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function mouse(target: EventTarget, type: string, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
}

describe('RichTextEditorComponent', () => {
  let fixture: ComponentFixture<RichTextEditorComponent>;
  let editor: RichTextEditorComponent;
  let el: HTMLElement;
  /** The editable area. */
  let content: HTMLElement;

  const button = (command: string) => el.querySelector<HTMLButtonElement>(`[data-command="${command}"]`)!;

  async function setup(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(RichTextEditorComponent);
    editor = fixture.componentInstance;
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    el = fixture.nativeElement;
    await settle(fixture);
    content = el.querySelector('.nrte__content')!;
  }

  /** Sets the HTML, focuses the editor and selects the content of `selector` (or puts the caret at its start). */
  async function edit(html: string, selector?: string, collapse = false): Promise<void> {
    fixture.componentRef.setInput('value', html);
    await settle(fixture);
    content.focus();
    if (selector) {
      const target = content.querySelector(selector)!;
      if (collapse) caret(target.firstChild ?? target, 0);
      else select(target);
    }
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  describe('value', () => {
    beforeEach(() => setup());

    it('renders the HTML value', async () => {
      await edit('<h2>Hello</h2><p>World</p>');
      expect(content.innerHTML).toBe('<h2>Hello</h2><p>World</p>');
    });

    it('sanitizes the incoming value', async () => {
      await edit('<p onclick="x()">Hi<script>alert(1)</script><img src="javascript:x"></p>');
      expect(content.innerHTML).toBe('<p>Hi<img></p>');
    });

    it('emits the HTML on input', async () => {
      await edit('<p>abc</p>', 'p');
      document.execCommand('insertText', false, 'xyz');
      await settle(fixture);
      expect(editor.value()).toBe('<p>xyz</p>');
      expect(editor.getHtml()).toBe('<p>xyz</p>');
    });

    it('emits an empty string when the text is deleted', async () => {
      await edit('<p>abc</p>', 'p');
      document.execCommand('delete');
      await settle(fixture);
      expect(editor.value()).toBe('');
      expect(el.querySelector('.nrte__content--empty')).not.toBeNull();
    });

    it('insertHtml inserts sanitized HTML at the caret', async () => {
      await edit('<p>ab</p>', 'p', true);
      editor.insertHtml('<b onclick="x()">X</b><script>y()</script>');
      await settle(fixture);
      expect(editor.value()).toBe('<p><b>X</b>ab</p>');
    });

    it('keeps raw HTML when sanitize is off', async () => {
      fixture.componentRef.setInput('sanitize', false);
      await edit('<p data-x="1">a</p>');
      expect(content.innerHTML).toBe('<p data-x="1">a</p>');
    });

    it('applies sanitizeOptions', async () => {
      fixture.componentRef.setInput('sanitizeOptions', { allowedAttributes: ['data-x'] });
      await edit('<p data-x="1" data-y="2">a</p>');
      expect(content.innerHTML).toBe('<p data-x="1">a</p>');
    });
  });

  describe('inputs', () => {
    it('shows the placeholder and the accessible label', async () => {
      await setup({ placeholder: 'Write…', ariaLabel: 'Body' });
      expect(content.getAttribute('data-placeholder')).toBe('Write…');
      expect(content.getAttribute('aria-label')).toBe('Body');
    });

    it('renders the configured toolbar with separators', async () => {
      await setup({ toolbar: ['bold', '|', 'italic'] });
      const main = el.querySelector('.nrte__toolbar--main')!;
      expect(Array.from(main.querySelectorAll('[data-command]'), (b) => b.getAttribute('data-command'))).toEqual(['bold', 'italic']);
      expect(main.querySelectorAll('.nrte__sep').length).toBe(1);
    });

    it('hides the toolbar', async () => {
      await setup({ hideToolbar: true });
      expect(el.querySelector('.nrte__toolbar--main')).toBeNull();
    });

    it('translates the tooltips', async () => {
      await setup({ labels: RTE_LABELS_FR });
      expect(button('bold').title).toBe('Gras');
      await setup({ labels: { bold: 'Fett' } });
      expect(button('bold').title).toBe('Fett');
      expect(button('italic').title).toBe('Italic');
    });

    it('sets the heights of the editable area', async () => {
      await setup({ minHeight: '50px', maxHeight: '300px' });
      expect(content.style.minHeight).toBe('50px');
      expect(content.style.maxHeight).toBe('300px');
    });

    it('readonly disables editing and the toolbar', async () => {
      await setup({ readonly: true, value: '<p>a</p>' });
      expect(content.getAttribute('contenteditable')).toBe('false');
      expect(button('bold').disabled).toBeTrue();
      await editor.execute('h1');
      expect(content.innerHTML).toBe('<p>a</p>');
    });
  });

  describe('formatting', () => {
    beforeEach(() => setup());

    it('toolbar buttons toggle inline formatting', async () => {
      await edit('<p>abc</p>', 'p');
      button('bold').click();
      await settle(fixture);
      expect(editor.value()).toBe('<p><b>abc</b></p>');
      expect(button('bold').getAttribute('aria-pressed')).toBe('true');
      button('bold').click();
      await settle(fixture);
      expect(editor.value()).toBe('<p>abc</p>');
    });

    it('applies and toggles block formats', async () => {
      await edit('<p>abc</p>', 'p');
      await editor.execute('h2');
      expect(editor.value()).toBe('<h2>abc</h2>');
      await editor.execute('h2');
      expect(editor.value()).toBe('<p>abc</p>');
      await editor.execute('blockquote');
      expect(editor.value()).toBe('<blockquote>abc</blockquote>');
    });

    it('clears the formatting', async () => {
      await edit('<h1><b>abc</b></h1>', 'h1');
      await editor.execute('clear');
      expect(editor.value()).toBe('<p>abc</p>');
    });

    it('colors the selected text', async () => {
      await edit('<p>abc</p>', 'p');
      editor.setColor('textColor', 'rgb(201, 42, 42)');
      expect(editor.value()).toBe('<p><span style="color: rgb(201, 42, 42);">abc</span></p>');
    });

    it('opens and closes a color palette', async () => {
      await edit('<p>abc</p>', 'p');
      button('textColor').click();
      await settle(fixture);
      expect(el.querySelector('.nrte__palette')).not.toBeNull();
      el.querySelector<HTMLButtonElement>('.nrte__swatch')!.click();
      await settle(fixture);
      expect(el.querySelector('.nrte__palette')).toBeNull();
      expect(editor.value()).toContain('<span style="color:');
    });

    it('toggles the HTML source view', async () => {
      await edit('<p>abc</p>');
      await editor.execute('source');
      await settle(fixture);
      const area = el.querySelector<HTMLTextAreaElement>('.nrte__source')!;
      expect(area.value).toBe('<p>abc</p>');
      expect(button('bold').disabled).toBeTrue();
      area.value = '<p>new<script>x()</script></p>';
      area.dispatchEvent(new Event('input'));
      await editor.execute('source');
      await settle(fixture);
      expect(el.querySelector('.nrte__source')).toBeNull();
      expect(editor.value()).toBe('<p>new</p>');
    });
  });

  describe('lists', () => {
    beforeEach(() => setup());

    it('turns paragraphs into a list (not nested in the paragraph)', async () => {
      await edit('<p>a</p><p>b</p>');
      select(content);
      await editor.execute('unorderedList');
      expect(editor.value()).toBe('<ul><li>a</li><li>b</li></ul>');
    });

    it('nests an item with indent and switches only the nested level', async () => {
      await edit('<ol><li>a</li><li>b</li></ol>', 'li:last-child', true);
      await editor.execute('indent');
      expect(editor.value()).toBe('<ol><li>a<ol><li>b</li></ol></li></ol>');
      await editor.execute('unorderedList');
      expect(editor.value()).toBe('<ol><li>a<ul><li>b</li></ul></li></ol>');
      await editor.execute('outdent');
      expect(editor.value()).toBe('<ol><li>a</li><li>b</li></ol>');
    });

    it('Tab indents a list item', async () => {
      await edit('<ul><li>a</li><li>b</li></ul>', 'li:last-child', true);
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await settle(fixture);
      expect(editor.value()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
    });

    it('list changes can be undone', async () => {
      await edit('<ul><li>a</li><li>b</li></ul>', 'li:last-child', true);
      await editor.execute('indent');
      await editor.execute('undo');
      expect(editor.value()).toBe('<ul><li>a</li><li>b</li></ul>');
    });
  });

  describe('links and images', () => {
    let answer: string | null;
    const promptFn: RtePromptFn = () => answer;

    beforeEach(() => setup({ promptFn }));

    it('inserts a link at the caret', async () => {
      answer = 'https://example.com';
      await edit('<p>a</p>', 'p', true);
      await editor.execute('link');
      expect(editor.value()).toBe('<p><a href="https://example.com">https://example.com</a>a</p>');
    });

    it('links the selected text, in a new tab with linkTargetBlank', async () => {
      fixture.componentRef.setInput('linkTargetBlank', true);
      answer = '/page';
      await edit('<p>abc</p>', 'p');
      await editor.execute('link');
      expect(editor.value()).toBe('<p><a href="/page" target="_blank" rel="noopener noreferrer">abc</a></p>');
    });

    it('ignores unsafe and cancelled URLs', async () => {
      await edit('<p>abc</p>', 'p');
      answer = 'javascript:alert(1)';
      await editor.execute('link');
      answer = null;
      await editor.execute('link');
      expect(editor.value()).toBe('<p>abc</p>');
    });

    it('removes a link when the URL is emptied', async () => {
      answer = '';
      await edit('<p><a href="/a">abc</a></p>', 'a');
      await editor.execute('link');
      expect(editor.value()).toBe('<p>abc</p>');
    });

    it('inserts an image from a URL with imageSource "url"', async () => {
      fixture.componentRef.setInput('imageSource', 'url');
      answer = 'https://example.com/a.png';
      await edit('<p>a</p>', 'p', true);
      await editor.execute('image');
      expect(editor.value()).toBe('<p><img src="https://example.com/a.png" alt="">a</p>');
    });
  });

  describe('image button (file picker)', () => {
    const picker = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;

    /** A real PNG file of the given size. */
    async function pngFile(name: string, width = 4, height = 2): Promise<File> {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      return new File([blob], name, { type: 'image/png' });
    }

    /** Chooses `files` in the picker, as the user would in the file dialog. */
    async function pick(files: File[]): Promise<void> {
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      picker().files = transfer.files;
      picker().dispatchEvent(new Event('change'));
      await settle(fixture);
      await new Promise((resolve) => setTimeout(resolve, 50)); // FileReader
      await settle(fixture);
    }

    it('opens the file picker, limited to the image types kept in base64', async () => {
      await setup();
      await edit('<p>a</p>', 'p', true);
      const click = spyOn(picker(), 'click');
      await editor.execute('image');
      expect(click).toHaveBeenCalled();
      expect(picker().accept).toBe('image/png,image/jpeg,image/gif,image/webp,image/bmp');
      expect(picker().multiple).toBeTrue();
      expect(picker().hidden).toBeTrue();
    });

    it('inserts the picked images in base64 where the caret was', async () => {
      await setup();
      await edit('<p>ab</p>', 'p');
      caret(content.querySelector('p')!.firstChild!, 1);
      await settle(fixture);
      spyOn(picker(), 'click');
      await editor.execute('image');
      // the file dialog takes the focus away
      content.blur();
      document.getSelection()!.removeAllRanges();
      await pick([await pngFile('one.png'), await pngFile('two.png')]);
      const images = Array.from(content.querySelectorAll('img'));
      expect(images.length).toBe(2);
      expect(images.every((img) => img.src.startsWith('data:image/png;base64,'))).toBeTrue();
      expect(content.querySelector('p')!.firstChild!.textContent).toBe('a');
      expect(content.querySelector('p')!.lastChild!.textContent).toBe('b');
    });

    it('goes through imageUpload when it is set', async () => {
      const imageUpload = jasmine.createSpy('imageUpload').and.resolveTo('https://cdn.test/up.png');
      await setup({ imageUpload });
      await edit('<p>a</p>', 'p', true);
      spyOn(picker(), 'click');
      await editor.execute('image');
      const file = await pngFile('photo.png');
      await pick([file]);
      expect(imageUpload).toHaveBeenCalledWith(file);
      expect(editor.value()).toBe('<p><img src="https://cdn.test/up.png" alt="">a</p>');
    });

    it('ignores files that are not images and lets the same file be picked again', async () => {
      await setup();
      await edit('<p>a</p>', 'p', true);
      await pick([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
      expect(editor.value()).toBe('<p>a</p>');
      expect(picker().value).toBe('');
    });
  });

  describe('following links', () => {
    let open: jasmine.Spy;
    const bubble = () => el.querySelector<HTMLButtonElement>('.nrte__link-open');

    beforeEach(async () => {
      await setup();
      open = spyOn(window, 'open');
    });

    it('shows an "open" button at the end of the link holding the caret', async () => {
      await edit('<p>before <a href="https://example.com">link</a> after</p>', 'a', true);
      const button = bubble()!;
      expect(button).not.toBeNull();
      expect(button.title).toContain('https://example.com');
      const link = content.querySelector('a')!.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(link.right);
      expect(rect.left - link.right).toBeLessThan(5);
    });

    it('opens the link in a new window, without access to the page', async () => {
      await edit('<p><a href="https://example.com">link</a></p>', 'a', true);
      bubble()!.click();
      expect(open).toHaveBeenCalledOnceWith('https://example.com', '_blank', 'noopener,noreferrer');
    });

    it('hides the button when the caret leaves the link', async () => {
      await edit('<p>before <a href="https://example.com">link</a></p>', 'a', true);
      caret(content.querySelector('p')!.firstChild!, 1);
      await settle(fixture);
      expect(bubble()).toBeNull();
    });

    it('has no button for unsafe or missing URLs', async () => {
      fixture.componentRef.setInput('sanitize', false);
      await edit('<p><a href="javascript:alert(1)">bad</a> <a>none</a></p>', 'a', true);
      expect(bubble()).toBeNull();
      mouse(content.querySelector('a')!, 'click', { ctrlKey: true });
      expect(open).not.toHaveBeenCalled();
    });

    it('Ctrl+click and ⌘+click open the link', async () => {
      await edit('<p><a href="/page">link</a></p>');
      const link = content.querySelector('a')!;
      mouse(link, 'click', { ctrlKey: true });
      mouse(link.firstChild!.parentElement!, 'click', { metaKey: true });
      expect(open).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledWith('/page', '_blank', 'noopener,noreferrer');
    });

    it('a plain click does not open the link', async () => {
      await edit('<p><a href="/page">link</a></p>');
      mouse(content.querySelector('a')!, 'click');
      expect(open).not.toHaveBeenCalled();
    });

    it('shows a pointer cursor over links while Ctrl is held', async () => {
      await edit('<p><a href="/page">link</a> text</p>');
      mouse(content.querySelector('a')!, 'mousemove', { ctrlKey: true });
      await settle(fixture);
      expect(content.classList).toContain('nrte__content--link-hover');
      mouse(content.querySelector('a')!, 'mousemove');
      await settle(fixture);
      expect(content.classList).not.toContain('nrte__content--link-hover');
    });

    it('leaves links to the browser in read-only mode', async () => {
      fixture.componentRef.setInput('readonly', true);
      await edit('<p><a href="/page">link</a></p>');
      // not editable: the browser follows the link itself; block the real navigation
      let preventedByEditor: boolean | undefined;
      const block = (e: Event) => {
        preventedByEditor = e.defaultPrevented;
        e.preventDefault();
      };
      window.addEventListener('click', block);
      mouse(content.querySelector('a')!, 'click', { ctrlKey: true });
      window.removeEventListener('click', block);
      expect(preventedByEditor).toBeFalse();
      expect(open).not.toHaveBeenCalled();
      expect(bubble()).toBeNull();
    });
  });

  describe('paste', () => {
    function paste(data: Record<string, string>, files: File[] = []): void {
      const transfer = new DataTransfer();
      for (const [type, value] of Object.entries(data)) transfer.setData(type, value);
      for (const file of files) transfer.items.add(file);
      content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }

    it('pastes sanitized HTML', async () => {
      await setup();
      await edit('<p>a</p>', 'p', true);
      paste({ 'text/html': '<b onclick="x()">B</b><script>y()</script>', 'text/plain': 'B' });
      await settle(fixture);
      expect(editor.value()).toBe('<p><b>B</b>a</p>');
    });

    it('pastes plain text with pastePlainText', async () => {
      await setup({ pastePlainText: true });
      await edit('<p>a</p>', 'p', true);
      paste({ 'text/html': '<b>B</b>', 'text/plain': 'B' });
      await settle(fixture);
      expect(editor.value()).toBe('<p>Ba</p>');
    });

    it('pastes image files through imageUpload', async () => {
      const imageUpload = jasmine.createSpy('imageUpload').and.resolveTo('https://cdn.test/up.png');
      await setup({ imageUpload });
      await edit('<p>a</p>', 'p', true);
      const file = new File(['x'], 'shot.png', { type: 'image/png' });
      paste({}, [file]);
      await settle(fixture);
      expect(imageUpload).toHaveBeenCalledWith(file);
      expect(editor.value()).toBe('<p><img src="https://cdn.test/up.png" alt="">a</p>');
    });

    it('skips files whose upload fails or returns an unsafe URL', async () => {
      const imageUpload = jasmine.createSpy('imageUpload').and.callFake(async (file: File) => {
        if (file.name === 'a.png') throw new Error('upload failed');
        return 'javascript:x';
      });
      await setup({ imageUpload });
      await edit('<p>a</p>', 'p', true);
      paste({}, [new File(['x'], 'a.png', { type: 'image/png' }), new File(['y'], 'b.png', { type: 'image/png' })]);
      await settle(fixture);
      expect(editor.value()).toBe('<p>a</p>');
    });
  });

  describe('office clipboard', () => {
    function paste(html: string): void {
      const transfer = new DataTransfer();
      transfer.setData('text/html', html);
      transfer.setData('text/plain', 'x');
      content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }

    function copy(type: 'copy' | 'cut' = 'copy'): DataTransfer {
      const transfer = new DataTransfer();
      content.dispatchEvent(new ClipboardEvent(type, { clipboardData: transfer, bubbles: true, cancelable: true }));
      return transfer;
    }

    beforeEach(() => setup());

    it('pastes Excel cells with their class styles inlined', async () => {
      await edit('<p>a</p>', 'p', true);
      paste(
        '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><style><!--' +
          'td {font-weight:400; mso-number-format:General;} .xl65 {font-weight:700; background:#FFFF00; mso-pattern:black none; text-align:general;}' +
          '--></style></head><body><table><tr><td class=xl65>A</td><td>B</td></tr></table></body></html>',
      );
      await settle(fixture);
      const td = content.querySelector('td')!;
      expect(td.style.fontWeight).toBe('700');
      expect(td.style.backgroundColor).toBe('rgb(255, 255, 0)');
      expect(td.getAttribute('style')).not.toContain('general');
      expect(content.querySelectorAll('td')[1].getAttribute('style')).toBeNull();
    });

    it('pastes Word list paragraphs as nested lists', async () => {
      await edit('<p>a</p>', 'p', true);
      const item = (level: number, marker: string, text: string) =>
        `<p class=MsoListParagraph style='margin-left:36pt;mso-list:l0 level${level} lfo1'><!--[if !supportLists]-->` +
        `<span><span style='mso-list:Ignore'>${marker}<span>&nbsp;&nbsp;</span></span></span><!--[endif]-->${text}<o:p></o:p></p>\n`;
      paste(
        '<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>' +
          item(1, '1.', 'One') + item(2, '·', 'Sub') + item(1, '2.', 'Two') +
          `<p class=MsoNormal><span style='mso-highlight:yellow'>Lit</span></p></body></html>`,
      );
      await settle(fixture);
      const ol = content.querySelector('ol')!;
      expect(ol.children.length).toBe(2);
      expect(ol.querySelector('li > ul > li')!.textContent).toBe('Sub');
      expect(ol.textContent).not.toContain('1.');
      expect(content.querySelector<HTMLElement>('span[style]')!.style.backgroundColor).toBe('yellow');
    });

    it('pastes Google Docs content', async () => {
      await edit('<p>a</p>', 'p', true);
      const span = (style: string, text: string) =>
        `<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;${style}font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">${text}</span>`;
      const li = (level: number, text: string) =>
        `<li dir="ltr" style="list-style-type:disc;font-size:11pt;" aria-level="${level}"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation">${span('font-weight:400;font-style:normal;', text)}</p></li>`;
      paste(
        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234-abcd">' +
          `<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${span('font-weight:700;font-style:normal;', 'Bold')}${span('font-weight:400;font-style:italic;', 'Ital')}${span('font-weight:400;font-style:normal;', 'Plain')}</p>` +
          `<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">${li(1, 'One')}<ul style="margin-top:0;">${li(2, 'Sub')}</ul>${li(1, 'Two')}</ul>` +
          '</b>',
      );
      await settle(fixture);
      expect(editor.value()).toBe(
        '<p><b>Bold</b><i>Ital</i>Plain</p><ul><li>One<ul><li>Sub</li></ul></li><li>Two</li></ul><p>a</p>',
      );
    });

    it('pastes Google Sheets cells with their column widths', async () => {
      await edit('<p>a</p>', 'p', true);
      paste(
        '<google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>' +
          '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1">' +
          '<colgroup><col width="100"/><col width="120"/></colgroup><tbody><tr style="height:21px;">' +
          '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;color:#000000;">A</td>' +
          '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#ffff00;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:1}">1</td>' +
          '</tr></tbody></table></google-sheets-html-origin>',
      );
      await settle(fixture);
      const table = content.querySelector('table')!;
      expect(table.style.width).toBe('220px');
      expect(Array.from(table.querySelectorAll('col'), (c) => c.style.width)).toEqual(['100px', '120px']);
      const cells = table.querySelectorAll('td');
      expect(cells[0].style.fontWeight).toBe('bold');
      expect(cells[0].style.color).toBe('');
      expect(cells[1].style.backgroundColor).toBe('rgb(255, 255, 0)');
      expect(table.getBoundingClientRect().width).toBeGreaterThan(200);
    });

    it('copies selected cells for Excel', async () => {
      await edit('<table><tbody><tr><td>a</td><td><p>b</p><p>c</p></td></tr><tr><td>d</td><td>e</td></tr></tbody></table>');
      const cells = content.querySelectorAll('td');
      const range = document.createRange();
      range.setStart(cells[0].firstChild!, 0);
      range.setEnd(cells[1].lastChild!.firstChild!, 1);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      const data = copy();
      const html = data.getData('text/html');
      expect(html).toContain('Excel.Sheet');
      expect(html).toContain('mso-data-placement');
      expect(html).toContain('b<br>c');
      expect(html).not.toContain('>d<');
      expect(data.getData('text/plain')).toBe('a\t"b\nc"');
    });

    it('copies a whole table selected alone for Excel', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
      select(content);
      const data = copy();
      expect(data.getData('text/html')).toContain('Excel.Sheet');
      expect(data.getData('text/plain')).toBe('a\tb');
    });

    it('copies text for Word, keeping its formatting', async () => {
      await edit('<p><b>bold <span data-comment="c1">text</span></b></p><table><tbody><tr><td>x</td></tr></tbody></table>');
      select(content.querySelector('b')!);
      let html = copy().getData('text/html');
      expect(html).toContain('Word.Document');
      expect(html).toContain('<b>bold text</b>');
      select(content);
      html = copy().getData('text/html');
      expect(html).toContain('Word.Document');
      expect(html).toContain('border: 1px solid');
    });

    it('cut removes the copied cells content', async () => {
      await edit('<p>keep</p><p>gone</p>');
      select(content.querySelectorAll('p')[1]);
      const data = copy('cut');
      await settle(fixture);
      expect(data.getData('text/plain')).toBe('gone');
      expect(editor.value()).not.toContain('gone');
    });
  });

  describe('image resizing', () => {
    let img: HTMLImageElement;
    const frame = () => el.querySelector<HTMLElement>('.nrte__image-frame');
    const handle = (corner: string) => el.querySelector<HTMLElement>(`.nrte__image-handle[data-corner="${corner}"]`)!;

    beforeEach(async () => {
      await setup();
      await edit(`<p>a<img src="${pngDataUrl(200, 100)}" alt="">b</p>`);
      img = content.querySelector('img')!;
      await img.decode();
      mouse(img, 'click');
      await settle(fixture);
    });

    function drag(corner: string, dx: number): void {
      const start = handle(corner).getBoundingClientRect();
      mouse(handle(corner), 'mousedown', { clientX: start.left, clientY: start.top });
      mouse(document, 'mousemove', { clientX: start.left + dx, clientY: start.top });
      mouse(document, 'mouseup', { clientX: start.left + dx, clientY: start.top });
    }

    it('selects a clicked image and shows its handles', () => {
      expect(frame()).not.toBeNull();
      expect(el.querySelectorAll('.nrte__image-handle').length).toBe(4);
      expect(document.getSelection()!.getRangeAt(0).cloneContents().firstChild?.nodeName).toBe('IMG');
    });

    it('resizes the image proportionally with a corner handle', async () => {
      drag('se', -50);
      await settle(fixture);
      const resized = content.querySelector('img')!;
      expect(resized.getAttribute('width')).toBe('150');
      expect(resized.hasAttribute('style')).toBeFalse();
      expect(resized.getBoundingClientRect().height).toBeCloseTo(75, 0);
      expect(editor.value()).toContain('width="150"');
      expect(frame()?.style.width).toBe('150px');
    });

    it('left handles resize the other way', async () => {
      drag('nw', 40);
      await settle(fixture);
      expect(content.querySelector('img')!.getAttribute('width')).toBe('160');
    });

    it('shows the size while dragging', async () => {
      const start = handle('se').getBoundingClientRect();
      mouse(handle('se'), 'mousedown', { clientX: start.left });
      mouse(document, 'mousemove', { clientX: start.left - 100 });
      await settle(fixture);
      expect(el.querySelector('.nrte__image-size')?.textContent).toBe('100 × 50');
      mouse(document, 'mouseup', { clientX: start.left - 100 });
    });

    it('can be undone', async () => {
      drag('se', -50);
      await settle(fixture);
      document.execCommand('undo');
      await settle(fixture);
      expect(content.querySelector('img')!.hasAttribute('width')).toBeFalse();
    });

    it('double-click on a handle restores the original size', async () => {
      drag('se', -50);
      await settle(fixture);
      mouse(handle('se'), 'dblclick');
      await settle(fixture);
      expect(content.querySelector('img')!.hasAttribute('width')).toBeFalse();
    });

    it('hides the handles when the selection leaves the image', async () => {
      caret(content.querySelector('p')!.firstChild!, 0);
      await settle(fixture);
      expect(frame()).toBeNull();
    });
  });

  describe('moving an image by drag and drop', () => {
    const src = pngDataUrl(20, 20);
    let imageUpload: jasmine.Spy;
    const html = () => editor.value().split(src).join('S');

    beforeEach(async () => {
      imageUpload = jasmine.createSpy('imageUpload').and.resolveTo('https://cdn.test/copy.png');
      await setup({ imageUpload });
    });

    /** Viewport point over the left half of character `offset` of `text`: the caret goes before it. */
    function pointAt(text: Node, offset: number): { clientX: number; clientY: number } {
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset + 1);
      const rect = range.getBoundingClientRect();
      return { clientX: rect.left + 1, clientY: rect.top + rect.height / 2 };
    }

    /** Drags the editor's image and drops it at `point`, like Chrome (which also exposes it as a file). */
    async function dragImage(point: { clientX: number; clientY: number }, init: DragEventInit = {}): Promise<void> {
      const img = content.querySelector('img')!;
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'], 'image.png', { type: 'image/png' }));
      const fire = (target: EventTarget, type: string) =>
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, ...point, ...init }));
      fire(img, 'dragstart');
      const over = document.elementFromPoint(point.clientX, point.clientY)!;
      expect(fire(over, 'dragover')).withContext('dragover is accepted').toBeFalse();
      fire(over, 'drop');
      fire(img, 'dragend');
      await settle(fixture);
    }

    it('moves the image inside its paragraph', async () => {
      await edit(`<p>ab<img src="${src}">cd</p>`);
      await dragImage(pointAt(content.querySelector('p')!.firstChild!, 0));
      expect(html()).toBe('<p><img src="S">abcd</p>');
      expect(imageUpload).not.toHaveBeenCalled();
    });

    it('moves the image to another paragraph', async () => {
      await edit(`<p>ab<img src="${src}"></p><p>cd</p>`);
      await dragImage(pointAt(content.querySelectorAll('p')[1].firstChild!, 1));
      expect(html()).toBe('<p>ab</p><p>c<img src="S">d</p>');
    });

    it('keeps an emptied paragraph editable', async () => {
      await edit(`<p><img src="${src}"></p><p>cd</p>`);
      await dragImage(pointAt(content.querySelectorAll('p')[1].firstChild!, 1));
      expect(html()).toBe('<p><br></p><p>c<img src="S">d</p>');
    });

    it('moves the image into a table cell and keeps its attributes', async () => {
      await edit(`<p>ab<img src="${src}" width="10" alt="x"></p><table><tbody><tr><td>cd</td></tr></tbody></table>`);
      await dragImage(pointAt(content.querySelector('td')!.firstChild!, 1));
      expect(html()).toBe('<p>ab</p><table><tbody><tr><td>c<img src="S" width="10" alt="x">d</td></tr></tbody></table>');
    });

    it('copies the image when Ctrl is held', async () => {
      await edit(`<p>ab<img src="${src}">cd</p>`);
      await dragImage(pointAt(content.querySelector('p')!.firstChild!, 0), { ctrlKey: true });
      expect(html()).toBe('<p><img src="S">ab<img src="S">cd</p>');
      expect(imageUpload).not.toHaveBeenCalled();
    });

    it('selects the moved image', async () => {
      await edit(`<p>ab<img src="${src}">cd</p>`);
      await dragImage(pointAt(content.querySelector('p')!.firstChild!, 0));
      expect(el.querySelector('.nrte__image-frame')).not.toBeNull();
      expect(document.getSelection()!.getRangeAt(0).cloneContents().firstChild?.nodeName).toBe('IMG');
    });

    it('is undone in one step', async () => {
      await edit(`<p>ab<img src="${src}"></p><p>cd</p>`);
      await dragImage(pointAt(content.querySelectorAll('p')[1].firstChild!, 1));
      document.execCommand('undo');
      await settle(fixture);
      expect(html()).toBe('<p>ab<img src="S"></p><p>cd</p>');
    });

    it('still uploads image files dropped from outside', async () => {
      await edit('<p>ab</p>');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
      const point = pointAt(content.querySelector('p')!.firstChild!, 1);
      content.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, ...point }));
      await settle(fixture);
      expect(imageUpload).toHaveBeenCalled();
      expect(editor.value()).toBe('<p>a<img src="https://cdn.test/copy.png" alt="">b</p>');
    });
  });

  describe('tables', () => {
    const rows = () => Array.from(content.querySelector('table')?.rows ?? []);

    beforeEach(() => setup());

    it('inserts a 3×3 table and shows the table bar', async () => {
      await edit('<p>a</p>', 'p', true);
      await editor.execute('table');
      await settle(fixture);
      expect(rows().length).toBe(3);
      expect(rows().every((tr) => tr.cells.length === 3)).toBeTrue();
      expect(el.querySelector('.nrte__tablebar')).not.toBeNull();
    });

    it('adds and deletes rows and columns', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>', 'td', true);
      await editor.execute('tableRowBelow');
      expect(rows().length).toBe(2);
      await editor.execute('tableColRight');
      expect(rows()[0].cells.length).toBe(3);
      await editor.execute('tableColDelete');
      await editor.execute('tableRowDelete');
      expect(rows().length).toBe(1);
      expect(rows()[0].cells.length).toBe(2);
      await editor.execute('tableDelete');
      expect(content.querySelector('table')).toBeNull();
    });

    it('Tab moves to the next cell and adds a row in the last one', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>', 'td', true);
      const tab = () => content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      tab();
      const anchor = document.getSelection()!.anchorNode!;
      const cell = (anchor instanceof Element ? anchor : anchor.parentElement)!.closest('td');
      expect(cell?.textContent).toBe('b');
      tab();
      await settle(fixture);
      expect(rows().length).toBe(2);
    });

    it('colors the cells of the current row', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>', 'td', true);
      editor.setColor('tableBackground', 'red', 'row');
      expect(rows()[0].cells[1].style.backgroundColor).toBe('red');
      expect(rows()[1].cells[0].style.backgroundColor).toBe('');
    });

    it('sets the borders of the whole table', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>', 'td', true);
      editor.setTableBorder(2, { color: 'red', sides: { inner: false } });
      const [first, second] = Array.from(rows()[0].cells);
      expect(first.style.borderLeft).toBe('2px solid red');
      expect(first.style.borderRight).toBe('');
      expect(second.style.borderRight).toBe('2px solid red');
      editor.setTableBorder(0);
      expect(rows()[0].cells[0].style.borderTopStyle).toBe('hidden');
    });

    describe('column resizing', () => {
      const fixed = '<table style="table-layout: fixed; width: 300px"><colgroup>'
        + '<col style="width: 100px"><col style="width: 100px"><col style="width: 100px"></colgroup>'
        + '<tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table><p>after</p>';
      const widths = () => Array.from(content.querySelectorAll('col'), (col) => col.style.width);
      const tableWidth = () => content.querySelector('table')!.style.width;

      /** Drags the border at viewport `x` (on the first row) by `dx`. */
      async function dragBorder(x: number, dx: number): Promise<void> {
        const cell = rows()[0].cells[0];
        const y = cell.getBoundingClientRect().top + 5;
        const target = document.elementFromPoint(x, y)!;
        mouse(target, 'mousedown', { clientX: x, clientY: y });
        mouse(document, 'mousemove', { clientX: x + dx, clientY: y });
        mouse(document, 'mouseup', { clientX: x + dx, clientY: y });
        await settle(fixture);
      }

      const cellRect = (c: number) => rows()[0].cells[c].getBoundingClientRect();
      const tableRect = () => content.querySelector('table')!.getBoundingClientRect();

      it('an inner border moves width between its two columns, the table keeps its width', async () => {
        await edit(fixed);
        await dragBorder(cellRect(0).right - 1, 30);
        expect(widths()).toEqual(['130px', '70px', '100px']);
        expect(tableWidth()).toBe('300px');
        await dragBorder(cellRect(1).right - 1, -20);
        expect(widths()).toEqual(['130px', '50px', '120px']);
        expect(tableWidth()).toBe('300px');
      });

      it('the left border of a cell is its previous column border', async () => {
        await edit(fixed);
        await dragBorder(cellRect(1).left + 1, 30);
        expect(widths()).toEqual(['130px', '70px', '100px']);
      });

      it('an inner border stops at the minimum width of its columns', async () => {
        await edit(fixed);
        await dragBorder(cellRect(0).right - 1, 500);
        expect(widths()).toEqual(['170px', '30px', '100px']);
        await dragBorder(cellRect(0).right - 1, -500);
        expect(widths()).toEqual(['30px', '170px', '100px']);
      });

      it('the outer right border resizes the table through its last column', async () => {
        await edit(fixed);
        await dragBorder(tableRect().right - 1, 50);
        expect(widths()).toEqual(['100px', '100px', '150px']);
        expect(tableWidth()).toBe('350px');
        await dragBorder(tableRect().right - 1, -500);
        expect(widths()).toEqual(['100px', '100px', '30px']);
        expect(tableWidth()).toBe('230px');
      });

      it('the outer left border resizes the table through its first column', async () => {
        await edit(fixed);
        await dragBorder(tableRect().left + 1, -20);
        expect(widths()).toEqual(['120px', '100px', '100px']);
        expect(tableWidth()).toBe('320px');
      });

      it('fixes automatic widths without changing the table width', async () => {
        await edit('<table><tbody><tr><td>aaaa</td><td>bbbb</td></tr></tbody></table><p>after</p>');
        const before = Math.round(tableRect().width);
        await dragBorder(cellRect(0).right - 1, 10);
        expect(widths().length).toBe(2);
        expect(Math.abs(Math.round(tableRect().width) - before)).toBeLessThanOrEqual(1);
      });

      it('shows the resize cursor over the outer borders too', async () => {
        await edit(fixed);
        const rect = tableRect();
        mouse(rows()[0].cells[0], 'mousemove', { clientX: rect.left + 1, clientY: rect.top + 5 });
        await settle(fixture);
        expect(content.classList).toContain('nrte__content--col-resize');
      });
    });

    it('Shift+click selects a rectangle of cells that formatting applies to', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>', 'td', true);
      const target = rows()[1].cells[0].getBoundingClientRect();
      mouse(rows()[1].cells[0], 'mousedown', {
        shiftKey: true,
        clientX: target.left + target.width / 2,
        clientY: target.top + target.height / 2,
      });
      await settle(fixture);
      expect(el.querySelector('.nrte__cell-overlay')).not.toBeNull();
      await editor.execute('bold');
      expect(rows()[0].cells[0].style.fontWeight).toBe('bold');
      expect(rows()[1].cells[0].style.fontWeight).toBe('bold');
      expect(rows()[0].cells[1].style.fontWeight).toBe('');
    });
  });

  describe('events', () => {
    it('emits editorFocus and editorBlur', async () => {
      await setup();
      const events: string[] = [];
      editor.editorFocus.subscribe(() => events.push('focus'));
      editor.editorBlur.subscribe(() => events.push('blur'));
      content.dispatchEvent(new FocusEvent('focus'));
      content.dispatchEvent(new FocusEvent('blur'));
      expect(events).toEqual(['focus', 'blur']);
    });
  });
});

describe('RichTextEditorComponent with forms', () => {
  @Component({
    imports: [RichTextEditorComponent, ReactiveFormsModule],
    template: `<ngx-rich-text-editor [formControl]="control" />`,
  })
  class HostComponent {
    readonly control = new FormControl('<p>start</p>');
    readonly editor = viewChild.required(RichTextEditorComponent);
  }

  let fixture: ComponentFixture<HostComponent>;
  let content: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HostComponent);
    await settle(fixture);
    content = fixture.nativeElement.querySelector('.nrte__content');
  });

  it('shows the control value', () => {
    expect(content.innerHTML).toBe('<p>start</p>');
  });

  it('follows setValue', async () => {
    fixture.componentInstance.control.setValue('<p>next</p>');
    await settle(fixture);
    expect(content.innerHTML).toBe('<p>next</p>');
  });

  it('updates the control on input and marks it touched on blur', async () => {
    content.focus();
    select(content.querySelector('p')!);
    document.execCommand('insertText', false, 'typed');
    content.dispatchEvent(new FocusEvent('blur'));
    await settle(fixture);
    expect(fixture.componentInstance.control.value).toBe('<p>typed</p>');
    expect(fixture.componentInstance.control.touched).toBeTrue();
  });

  it('is read-only while the control is disabled', async () => {
    fixture.componentInstance.control.disable();
    await settle(fixture);
    expect(content.getAttribute('contenteditable')).toBe('false');
    fixture.componentInstance.control.enable();
    await settle(fixture);
    expect(content.getAttribute('contenteditable')).toBe('true');
  });
});

describe('RichTextEditorComponent customization', () => {
  describe('custom icons', () => {
    @Component({
      imports: [RichTextEditorComponent, RteIconDirective],
      template: `
        <ngx-rich-text-editor [(value)]="html" [toolbar]="['bold', 'italic', 'textColor']">
          <ng-template rteIcon="bold" let-active="active">
            <i class="my-bold" [class.on]="active">B!</i>
          </ng-template>
          <ng-template rteIcon="textColor" let-color="color" let-command>
            <i class="my-color" [attr.data-cmd]="command" [style.color]="color">A</i>
          </ng-template>
          <ng-template rteIcon="openLink"><i class="my-open">↗</i></ng-template>
        </ngx-rich-text-editor>
      `,
    })
    class HostComponent {
      readonly html = signal('<p>abc <a href="https://example.com">link</a></p>');
    }

    let fixture: ComponentFixture<HostComponent>;
    let el: HTMLElement;
    let content: HTMLElement;

    beforeEach(async () => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      fixture = TestBed.createComponent(HostComponent);
      await settle(fixture);
      el = fixture.nativeElement;
      content = el.querySelector('.nrte__content')!;
    });

    it('replaces the icon of a button and keeps the button', () => {
      const bold = el.querySelector('[data-command="bold"]')!;
      expect(bold.querySelector('.my-bold')?.textContent).toBe('B!');
      expect(bold.querySelector('b')).toBeNull();
      expect(bold.getAttribute('title')).toBe('Bold');
      // other buttons keep the default icon
      expect(el.querySelector('[data-command="italic"] i.nrte__txt')).not.toBeNull();
    });

    it('gives the active state to the template', async () => {
      content.focus();
      select(content.querySelector('p')!.firstChild!, 0, 3);
      el.querySelector<HTMLButtonElement>('[data-command="bold"]')!.click();
      await settle(fixture);
      expect(el.querySelector('.my-bold')!.classList).toContain('on');
    });

    it('gives the command and the last color to the template', () => {
      const icon = el.querySelector<HTMLElement>('[data-command="textColor"] .my-color')!;
      expect(icon.dataset['cmd']).toBe('textColor');
      expect(icon.style.color).toBe('rgb(201, 42, 42)');
    });

    it('replaces the icon of the "open link" button', async () => {
      content.focus();
      caret(content.querySelector('a')!.firstChild!, 1);
      await settle(fixture);
      expect(el.querySelector('.nrte__link-open .my-open')).not.toBeNull();
      expect(el.querySelector('.nrte__link-open svg')).toBeNull();
    });
  });

  describe('hide', () => {
    let fixture: ComponentFixture<RichTextEditorComponent>;
    let editor: RichTextEditorComponent;
    let el: HTMLElement;
    let content: HTMLElement;
    const commands = (selector: string) =>
      Array.from(el.querySelectorAll(`${selector} > *`), (n) => n.getAttribute('data-command') ?? '|');

    async function setup(inputs: Record<string, unknown>, html = ''): Promise<void> {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      fixture = TestBed.createComponent(RichTextEditorComponent);
      editor = fixture.componentInstance;
      for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
      fixture.componentRef.setInput('value', html);
      await settle(fixture);
      el = fixture.nativeElement;
      content = el.querySelector('.nrte__content')!;
    }

    it('removes hidden commands and the separators left alone', async () => {
      await setup({ toolbar: ['bold', '|', 'image', 'table', '|', 'italic', '|', 'source'], hide: ['image', 'table', 'source'] });
      expect(commands('.nrte__toolbar--main')).toEqual(['bold', '|', 'italic']);
    });

    it('removes the toolbar when every command is hidden', async () => {
      await setup({ toolbar: ['bold', '|', 'italic'], hide: ['bold', 'italic'] });
      expect(el.querySelector('.nrte__toolbar--main')).toBeNull();
    });

    it('ignores hidden commands in execute()', async () => {
      await setup({ hide: ['h1'] }, '<p>abc</p>');
      content.focus();
      select(content.querySelector('p')!);
      await editor.execute('h1');
      expect(editor.value()).toBe('<p>abc</p>');
    });

    it('blocks the keyboard shortcut of a hidden command', async () => {
      await setup({ hide: ['bold', 'link'] }, '<p>abc</p>');
      const press = (key: string) =>
        content.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
      expect(press('b')).toBeFalse();
      expect(press('k')).toBeFalse();
      expect(press('i')).toBeTrue();
    });

    it('configures and hides the table bar', async () => {
      const table = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
      await setup({ tableToolbar: ['tableRowBelow', '|', 'tableDelete'], hide: ['tableDelete'] }, table);
      content.focus();
      caret(content.querySelector('td')!.firstChild!, 0);
      await settle(fixture);
      expect(commands('.nrte__tablebar')).toEqual(['tableRowBelow']);

      fixture.componentRef.setInput('hide', ['tableToolbar']);
      await settle(fixture);
      expect(el.querySelector('.nrte__tablebar')).toBeNull();
      fixture.componentRef.setInput('hide', []);
      fixture.componentRef.setInput('tableToolbar', []);
      await settle(fixture);
      expect(el.querySelector('.nrte__tablebar')).toBeNull();
    });

    it('columnResize: no resizing from the column borders', async () => {
      await setup({ hide: ['columnResize'] }, '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
      const cell = content.querySelector('td')!;
      const rect = cell.getBoundingClientRect();
      mouse(cell, 'mousemove', { clientX: rect.right - 1, clientY: rect.top + 5 });
      await settle(fixture);
      expect(content.classList).not.toContain('nrte__content--col-resize');
    });

    it('cellSelection: Shift+click selects no cells', async () => {
      await setup({ hide: ['cellSelection'] }, '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
      content.focus();
      caret(content.querySelector('td')!.firstChild!, 0);
      const target = content.querySelectorAll('td')[1];
      const rect = target.getBoundingClientRect();
      mouse(target, 'mousedown', { shiftKey: true, clientX: rect.left + rect.width / 2, clientY: rect.top + 5 });
      await settle(fixture);
      expect(el.querySelector('.nrte__cell-overlay')).toBeNull();
    });

    it('imageResize: no handles on a clicked image', async () => {
      await setup({ hide: ['imageResize'] }, `<p><img src="${pngDataUrl(40, 20)}"></p>`);
      content.focus();
      mouse(content.querySelector('img')!, 'click');
      await settle(fixture);
      expect(el.querySelector('.nrte__image-frame')).toBeNull();
    });

    it('imageMove: images of the editor cannot be dragged', async () => {
      await setup({ hide: ['imageMove'] }, `<p><img src="${pngDataUrl(40, 20)}"></p>`);
      const started = content.querySelector('img')!.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }),
      );
      expect(started).toBeFalse();
    });

    for (const hidden of ['image', 'imageDrop'] as const) {
      it(`${hidden}: pasted and dropped image files are ignored`, async () => {
        const imageUpload = jasmine.createSpy('imageUpload').and.resolveTo('https://cdn.test/a.png');
        await setup({ hide: [hidden], imageUpload }, '<p>a</p>');
        content.focus();
        caret(content.querySelector('p')!.firstChild!, 0);
        const files = () => {
          const transfer = new DataTransfer();
          transfer.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
          return transfer;
        };
        content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: files(), bubbles: true, cancelable: true }));
        const over = new DragEvent('dragover', { dataTransfer: files(), bubbles: true, cancelable: true });
        content.dispatchEvent(over);
        content.dispatchEvent(new DragEvent('drop', { dataTransfer: files(), bubbles: true, cancelable: true }));
        await settle(fixture);
        expect(over.dataTransfer!.dropEffect).toBe('none');
        expect(imageUpload).not.toHaveBeenCalled();
        expect(editor.value()).toBe('<p>a</p>');
      });
    }

    it('linkOpen: no "open link" button and no Ctrl+click', async () => {
      await setup({ hide: ['linkOpen'] }, '<p><a href="https://example.com">link</a></p>');
      const open = spyOn(window, 'open');
      content.focus();
      caret(content.querySelector('a')!.firstChild!, 1);
      await settle(fixture);
      expect(el.querySelector('.nrte__link-open')).toBeNull();
      mouse(content.querySelector('a')!, 'click', { ctrlKey: true });
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('theme', () => {
    let style: HTMLStyleElement;

    afterEach(() => style.remove());

    it('CSS variables set on the editor element win over the defaults', async () => {
      style = document.createElement('style');
      style.textContent = 'ngx-rich-text-editor { --nrte-accent: rgb(255, 0, 0); --nrte-btn-size: 40px; --nrte-icon-size: 24px; }';
      document.head.append(style);
      @Component({ imports: [RichTextEditorComponent], template: '<ngx-rich-text-editor />' })
      class HostComponent {}
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(HostComponent);
      await settle(fixture);
      const el: HTMLElement = fixture.nativeElement.querySelector('ngx-rich-text-editor');
      expect(getComputedStyle(el).getPropertyValue('--nrte-accent').trim()).toBe('rgb(255, 0, 0)');
      expect(el.querySelector<HTMLElement>('[data-command="undo"]')!.getBoundingClientRect().height).toBe(40);
      expect(el.querySelector('[data-command="undo"] svg')!.getBoundingClientRect().width).toBe(24);
    });
  });
});

describe('RichTextEditorComponent with [control]', () => {
  @Component({
    imports: [RichTextEditorComponent],
    template: `<ngx-rich-text-editor [control]="current()" />`,
  })
  class HostComponent {
    readonly first = new FormControl('<p>start</p>', { nonNullable: true });
    readonly second = new FormControl<string | null>('<p>second</p>');
    readonly current = signal<FormControl<string> | FormControl<string | null> | null>(this.first);
  }

  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let content: HTMLElement;

  async function type(text: string): Promise<void> {
    content.focus();
    select(content.querySelector('p')!);
    document.execCommand('insertText', false, text);
    await settle(fixture);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await settle(fixture);
    content = fixture.nativeElement.querySelector('.nrte__content');
  });

  it('shows the control value', () => {
    expect(content.innerHTML).toBe('<p>start</p>');
  });

  it('follows setValue', async () => {
    host.first.setValue('<p>next</p>');
    await settle(fixture);
    expect(content.innerHTML).toBe('<p>next</p>');
  });

  it('updates the control on input and marks it dirty, then touched on blur', async () => {
    expect(host.first.dirty).toBeFalse();
    await type('typed');
    expect(host.first.value).toBe('<p>typed</p>');
    expect(host.first.dirty).toBeTrue();
    expect(host.first.touched).toBeFalse();
    content.dispatchEvent(new FocusEvent('blur'));
    expect(host.first.touched).toBeTrue();
  });

  it('is read-only while the control is disabled', async () => {
    host.first.disable();
    await settle(fixture);
    expect(content.getAttribute('contenteditable')).toBe('false');
    host.first.enable();
    await settle(fixture);
    expect(content.getAttribute('contenteditable')).toBe('true');
  });

  it('switches to another control and stops updating the previous one', async () => {
    host.current.set(host.second);
    await settle(fixture);
    expect(content.innerHTML).toBe('<p>second</p>');
    await type('edited');
    expect(host.second.value).toBe('<p>edited</p>');
    expect(host.first.value).toBe('<p>start</p>');
    host.first.setValue('<p>ignored</p>');
    await settle(fixture);
    expect(content.innerHTML).toBe('<p>edited</p>');
  });

  it('treats a null value as empty', async () => {
    host.current.set(host.second);
    host.second.setValue(null);
    await settle(fixture);
    expect(content.innerHTML).toBe('');
  });

  it('unbinding the control re-enables the editor', async () => {
    host.first.disable();
    await settle(fixture);
    host.current.set(null);
    await settle(fixture);
    expect(content.getAttribute('contenteditable')).toBe('true');
  });

  it('reports edits made in the HTML source view', async () => {
    const editor = fixture.debugElement.children[0].componentInstance as RichTextEditorComponent;
    await editor.execute('source');
    await settle(fixture);
    const area: HTMLTextAreaElement = fixture.nativeElement.querySelector('.nrte__source');
    area.value = '<p>from source</p>';
    area.dispatchEvent(new Event('input'));
    expect(host.first.value).toBe('<p>from source</p>');
  });
});

describe('RichTextEditorComponent two-way binding', () => {
  @Component({
    imports: [RichTextEditorComponent],
    template: `<ngx-rich-text-editor [(value)]="html" />`,
  })
  class HostComponent {
    readonly html = signal('<p>one</p>');
  }

  it('syncs [(value)] both ways', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(HostComponent);
    await settle(fixture);
    const content: HTMLElement = fixture.nativeElement.querySelector('.nrte__content');
    expect(content.innerHTML).toBe('<p>one</p>');

    content.focus();
    select(content.querySelector('p')!);
    document.execCommand('insertText', false, 'two');
    await settle(fixture);
    expect(fixture.componentInstance.html()).toBe('<p>two</p>');

    fixture.componentInstance.html.set('<p>three</p>');
    await settle(fixture);
    expect(content.innerHTML).toBe('<p>three</p>');
  });
});
