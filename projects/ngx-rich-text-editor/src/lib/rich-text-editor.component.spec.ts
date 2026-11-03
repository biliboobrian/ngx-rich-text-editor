import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RichTextEditorComponent } from './rich-text-editor.component';
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

    it('inserts an image from a URL', async () => {
      answer = 'https://example.com/a.png';
      await edit('<p>a</p>', 'p', true);
      await editor.execute('image');
      expect(editor.value()).toBe('<p><img src="https://example.com/a.png" alt="">a</p>');
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

    it('Shift+click selects a rectangle of cells that formatting applies to', async () => {
      await edit('<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>', 'td', true);
      mouse(rows()[1].cells[0], 'mousedown', { shiftKey: true });
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
