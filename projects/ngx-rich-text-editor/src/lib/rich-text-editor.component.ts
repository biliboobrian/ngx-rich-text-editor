import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  ViewEncapsulation,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { RteSanitizeOptions, isSafeUrl, sanitizeHtml } from './sanitize';
import {
  RTE_DEFAULT_LABELS,
  RTE_DEFAULT_TOOLBAR,
  RTE_TABLE_TOOLBAR,
  RTE_TOGGLE_COMMANDS,
  RteCommand,
  RtePromptFn,
  RteToolbarItem,
} from './toolbar';

const BLOCK_COMMANDS: Partial<Record<RteCommand, string>> = {
  paragraph: 'p',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  blockquote: 'blockquote',
  code: 'pre',
};

const NATIVE_COMMANDS: Partial<Record<RteCommand, string>> = {
  undo: 'undo',
  redo: 'redo',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikeThrough: 'strikeThrough',
  subscript: 'subscript',
  superscript: 'superscript',
  unorderedList: 'insertUnorderedList',
  orderedList: 'insertOrderedList',
  indent: 'indent',
  outdent: 'outdent',
  alignLeft: 'justifyLeft',
  alignCenter: 'justifyCenter',
  alignRight: 'justifyRight',
  alignJustify: 'justifyFull',
  unlink: 'unlink',
  horizontalRule: 'insertHorizontalRule',
};

const LIST_COMMANDS: Partial<Record<RteCommand, 'ul' | 'ol'>> = {
  unorderedList: 'ul',
  orderedList: 'ol',
};

const TABLE_COMMANDS: ReadonlySet<RteCommand> = new Set<RteCommand>([
  'tableRowAbove', 'tableRowBelow', 'tableColLeft', 'tableColRight',
  'tableRowDelete', 'tableColDelete', 'tableDelete',
]);

/** Height of the floating table bar, used to place it above the table. */
const TABLE_BAR_HEIGHT = 38;

const STATE_COMMANDS: RteCommand[] = [
  'bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript',
  'unorderedList', 'orderedList', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
];

const defaultPrompt: RtePromptFn = (kind, current) =>
  typeof window === 'undefined'
    ? null
    : window.prompt(kind === 'link' ? 'URL du lien / Link URL' : "URL de l'image / Image URL", current || 'https://');

/** Child indexes leading from `root` down to `node`. */
function pathOf(node: Node, root: Node): number[] {
  const path: number[] = [];
  for (let n = node; n !== root; n = n.parentNode!) {
    path.unshift(Array.prototype.indexOf.call(n.parentNode!.childNodes, n));
  }
  return path;
}

function resolvePath(root: Node, path: number[]): Node {
  return path.reduce((node, i) => node.childNodes[i], root);
}

/** Text nodes and list items of a list, in document order (whitespace between items is ignored). */
function caretUnits(root: Node): Node[] {
  const units: Node[] = [];
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE ? !/^(ul|ol)$/.test(n.parentNode!.nodeName.toLowerCase()) : n.nodeName === 'LI') {
      units.push(n);
    }
  }
  return units;
}

/** Number of characters and list items before a boundary point of `root`. */
function caretPosition(root: Node, container: Node, offset: number): number {
  const before = root.ownerDocument!.createRange();
  before.setStart(root, 0);
  before.setEnd(container, offset);
  let position = 0;
  for (const unit of caretUnits(root)) {
    if (unit === container && unit.nodeType === Node.TEXT_NODE) return position + offset;
    if (!before.intersectsNode(unit)) break;
    position += unit.nodeType === Node.TEXT_NODE ? (unit as Text).length : 1;
  }
  return position;
}

/** Boundary point matching a position computed by `caretPosition`. */
function caretPoint(root: Node, position: number): [Node, number] {
  if (position === 0) return [root, 0];
  let rest = position;
  for (const unit of caretUnits(root)) {
    if (unit.nodeType === Node.TEXT_NODE) {
      if (rest <= (unit as Text).length) return [unit, rest];
      rest -= (unit as Text).length;
    } else if (--rest === 0) {
      return [unit, 0];
    }
  }
  return [root, root.childNodes.length];
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Rich text editor that takes HTML as input and emits HTML.
 *
 * ```html
 * <ngx-rich-text-editor [(value)]="html" placeholder="Write something…" />
 * <ngx-rich-text-editor formControlName="body" />
 * ```
 */
@Component({
  selector: 'ngx-rich-text-editor',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Not emulated: styles must reach the HTML injected in the contenteditable.
  // Every selector is prefixed with `.nrte`.
  encapsulation: ViewEncapsulation.None,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichTextEditorComponent), multi: true },
  ],
  host: { class: 'nrte-host' },
})
export class RichTextEditorComponent implements ControlValueAccessor {
  /** HTML content. Supports two-way binding: `[(value)]="html"`. */
  readonly value = model<string>('');
  /** Text shown when the editor is empty. */
  readonly placeholder = input<string>('');
  /** Toolbar layout. Use `'|'` for separators. */
  readonly toolbar = input<readonly RteToolbarItem[]>(RTE_DEFAULT_TOOLBAR);
  /** Hide the toolbar entirely. */
  readonly hideToolbar = input(false, { transform: booleanAttribute });
  /** Read-only mode (also set automatically by a disabled form control). */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** Tooltip overrides, e.g. `RTE_LABELS_FR`. */
  readonly labels = input<Partial<Record<RteCommand, string>>>({});
  /** Sanitize incoming / pasted HTML (strongly recommended). */
  readonly sanitize = input(true, { transform: booleanAttribute });
  /** Options passed to the sanitizer (extra tags, attributes, styles…). */
  readonly sanitizeOptions = input<RteSanitizeOptions>({});
  /** Paste clipboard content as plain text instead of HTML. */
  readonly pastePlainText = input(false, { transform: booleanAttribute });
  /** Open inserted links in a new tab. */
  readonly linkTargetBlank = input(false, { transform: booleanAttribute });
  /** Custom URL prompt for links/images (e.g. open your own dialog). Defaults to `window.prompt`. */
  readonly promptFn = input<RtePromptFn>(defaultPrompt);
  /** Minimum height of the editable area (any CSS length). */
  readonly minHeight = input<string>('160px');
  /** Maximum height of the editable area before it scrolls. */
  readonly maxHeight = input<string | null>(null);
  /** Accessible label of the editable area. */
  readonly ariaLabel = input<string>('Rich text editor');

  /** Emitted when the editable area gains focus. */
  readonly editorFocus = output<void>();
  /** Emitted when the editable area loses focus. */
  readonly editorBlur = output<void>();

  protected readonly root = viewChild.required<ElementRef<HTMLDivElement>>('root');
  protected readonly editable = viewChild.required<ElementRef<HTMLDivElement>>('editable');
  protected readonly sourceArea = viewChild<ElementRef<HTMLTextAreaElement>>('sourceArea');

  protected readonly focused = signal(false);
  protected readonly sourceMode = signal(false);
  protected readonly active = signal<Partial<Record<RteCommand, boolean>>>({});
  /** Position of the floating table bar, or null when the caret isn't in a table. */
  protected readonly tableBar = signal<{ top: number; left: number } | null>(null);
  protected readonly tableToolbar = RTE_TABLE_TOOLBAR;
  private readonly formDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.readonly() || this.formDisabled());
  protected readonly isEmpty = computed(() => !this.value());
  protected readonly titles = computed(() => ({ ...RTE_DEFAULT_LABELS, ...this.labels() }));

  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Last HTML known to be in sync with the editable element. */
  private lastHtml: string | null = null;
  private savedRange: Range | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Push external value changes into the editable element.
    effect(() => {
      const html = this.value() ?? '';
      const el = this.editable().nativeElement;
      if (!this.isBrowser || html === this.lastHtml) return;
      this.lastHtml = html;
      el.innerHTML = this.clean(html);
    });

    afterNextRender(() => {
      try {
        this.doc.execCommand('defaultParagraphSeparator', false, 'p');
        this.doc.execCommand('styleWithCSS', false, 'false');
      } catch {
        /* not supported: ignore */
      }
      const onSelectionChange = () => this.handleSelectionChange();
      this.doc.addEventListener('selectionchange', onSelectionChange);
      this.destroyRef.onDestroy(() => this.doc.removeEventListener('selectionchange', onSelectionChange));
    });
  }

  // ---------------------------------------------------------------- public API

  /** Focuses the editable area. */
  focus(): void {
    this.editable().nativeElement.focus();
  }

  /** Returns the current HTML. */
  getHtml(): string {
    return this.value() ?? '';
  }

  /** Inserts (sanitized) HTML at the caret position. */
  insertHtml(html: string): void {
    this.restoreSelection();
    this.doc.execCommand('insertHTML', false, this.clean(html));
    this.syncFromEditor();
  }

  /** Runs a toolbar command programmatically. */
  async execute(command: RteCommand): Promise<void> {
    if (this.isDisabled()) return;
    if (command === 'source') {
      this.toggleSource();
      return;
    }
    if (this.sourceMode()) return;

    const block = BLOCK_COMMANDS[command];
    const native = NATIVE_COMMANDS[command];

    if (this.handleListCommand(command)) {
      // handled with nested-list support
    } else if (command === 'table') {
      this.insertTable();
    } else if (TABLE_COMMANDS.has(command)) {
      this.editTable(command);
    } else if (block) {
      const tag = this.active()[command] && command !== 'paragraph' ? 'p' : block;
      this.exec('formatBlock', `<${tag}>`);
    } else if (native) {
      this.exec(native);
    } else if (command === 'clear') {
      this.exec('removeFormat');
      this.exec('formatBlock', '<p>');
    } else if (command === 'link') {
      await this.insertLink();
    } else if (command === 'image') {
      await this.insertImage();
    }
    this.syncFromEditor();
    this.updateActiveStates();
  }

  // ------------------------------------------------- ControlValueAccessor

  writeValue(value: string | null | undefined): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  // ------------------------------------------------------- template helpers

  protected isActive(item: RteToolbarItem): boolean {
    if (item === '|') return false;
    if (item === 'source') return this.sourceMode();
    return !!this.active()[item];
  }

  protected isToggle(item: RteToolbarItem): boolean {
    return item !== '|' && RTE_TOGGLE_COMMANDS.has(item);
  }

  protected titleOf(item: RteToolbarItem): string {
    return item === '|' ? '' : this.titles()[item];
  }

  protected asCommand(item: RteToolbarItem): RteCommand {
    return item as RteCommand;
  }

  // --------------------------------------------------------------- events

  protected onInput(): void {
    this.syncFromEditor();
  }

  protected onFocus(): void {
    this.focused.set(true);
    this.editorFocus.emit();
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
    this.editorBlur.emit();
  }

  protected onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    const html = data.getData('text/html');
    if (html && !this.pastePlainText()) {
      this.doc.execCommand('insertHTML', false, this.clean(html));
    } else {
      this.doc.execCommand('insertText', false, data.getData('text/plain'));
    }
    this.syncFromEditor();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const cell = this.closestCell();
      const li = this.closestInEditor('li');
      if (cell && !(li && cell.contains(li))) {
        event.preventDefault();
        this.moveToCell(cell, event.shiftKey ? -1 : 1);
        return;
      }
      if (li) {
        event.preventDefault();
        void this.execute(event.shiftKey ? 'outdent' : 'indent');
        return;
      }
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      void this.execute('link');
    }
  }

  protected onSourceInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    // lastHtml is intentionally left untouched so the effect refreshes the (hidden) editor.
    this.value.set(text);
    this.onChange(text);
  }

  // ------------------------------------------------------------ internals

  private clean(html: string): string {
    return this.sanitize() ? sanitizeHtml(html, this.doc, this.sanitizeOptions()) : html;
  }

  private readEditorHtml(): string {
    const el = this.editable().nativeElement;
    const hasText = !!el.textContent?.replace(/​/g, '').trim();
    const hasMedia = !!el.querySelector('img, hr, table');
    return hasText || hasMedia ? el.innerHTML : '';
  }

  private syncFromEditor(): void {
    if (!this.isBrowser || this.sourceMode()) return;
    const html = this.readEditorHtml();
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.value.set(html);
    this.onChange(html);
  }

  private toggleSource(): void {
    if (this.sourceMode()) {
      this.sourceMode.set(false);
      // the editor already holds the sanitized version of the source; emit it
      this.lastHtml = null;
      this.syncFromEditor();
      setTimeout(() => this.focus());
    } else {
      this.syncFromEditor();
      this.sourceMode.set(true);
      setTimeout(() => {
        const area = this.sourceArea()?.nativeElement;
        if (area) {
          area.value = this.value() ?? '';
          area.focus();
        }
      });
    }
  }

  private exec(command: string, arg?: string): void {
    this.restoreSelection();
    this.doc.execCommand(command, false, arg);
  }

  private handleSelectionChange(): void {
    const sel = this.doc.getSelection();
    const el = this.editable().nativeElement;
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    this.savedRange = sel.getRangeAt(0).cloneRange();
    this.updateActiveStates();
  }

  private restoreSelection(): void {
    const el = this.editable().nativeElement;
    const sel = this.doc.getSelection();
    if (this.doc.activeElement !== el) el.focus();
    if (!sel) return;
    const current = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (current && el.contains(current.commonAncestorContainer)) return;
    const range = this.savedRange && el.contains(this.savedRange.commonAncestorContainer)
      ? this.savedRange
      : this.endRange(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  private endRange(el: HTMLElement): Range {
    const range = this.doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    return range;
  }

  private updateActiveStates(): void {
    const state: Partial<Record<RteCommand, boolean>> = {};
    for (const cmd of STATE_COMMANDS) {
      try {
        state[cmd] = this.doc.queryCommandState(NATIVE_COMMANDS[cmd]!);
      } catch {
        state[cmd] = false;
      }
    }
    let block = '';
    try {
      block = String(this.doc.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    } catch {
      /* ignore */
    }
    for (const [cmd, tag] of Object.entries(BLOCK_COMMANDS)) {
      state[cmd as RteCommand] = block === tag;
    }
    // the innermost list decides, so a bulleted list nested in a numbered one shows as bulleted
    const list = this.closestInEditor('li')?.parentElement?.localName;
    state.unorderedList = list === 'ul';
    state.orderedList = list === 'ol';
    state.link = !!this.closestInEditor('a');
    this.active.set(state);
    this.updateTableBar();
  }

  /** Places the floating table bar above the table holding the caret (below it if there's no room). */
  protected updateTableBar(): void {
    const table = this.closestCell()?.closest('table');
    if (!table) {
      this.tableBar.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const content = this.editable().nativeElement.getBoundingClientRect();
    const rect = table.getBoundingClientRect();
    const min = content.top - box.top + 4;
    let top = rect.top - box.top - TABLE_BAR_HEIGHT - 4;
    if (top < min) top = rect.bottom - box.top + 4;
    top = Math.max(min, Math.min(top, box.height - TABLE_BAR_HEIGHT - 4));
    this.tableBar.set({ top, left: Math.max(4, rect.left - box.left) });
  }

  private closestInEditor<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    from: Node | null = this.doc.getSelection()?.anchorNode ?? null,
  ): HTMLElementTagNameMap[K] | null {
    const el = this.editable().nativeElement;
    let node = from;
    while (node && node !== el) {
      if (node.nodeType === 1 && (node as Element).localName === tag) return node as HTMLElementTagNameMap[K];
      node = node.parentNode;
    }
    return null;
  }

  private closestCell(from?: Node | null): HTMLTableCellElement | null {
    const td = this.closestInEditor('td', from);
    const th = this.closestInEditor('th', from);
    return td && th ? (td.contains(th) ? th : td) : (td ?? th);
  }

  /** Inserts a 3x3 table at the caret and moves the caret into its first cell. */
  private insertTable(): void {
    const el = this.editable().nativeElement;
    this.restoreSelection();
    let block = this.doc.getSelection()?.anchorNode ?? null;
    while (block && block !== el && block.parentNode !== el) block = block.parentNode;
    // keep a paragraph after a trailing table so the caret can leave it
    const after = !block || block === el || !block.nextSibling ? '<p><br></p>' : '';
    const row = `<tr>${'<td><br></td>'.repeat(3)}</tr>`;
    const existing = new Set(Array.from(el.querySelectorAll('table')));
    this.doc.execCommand('insertHTML', false, `<table><tbody>${row.repeat(3)}</tbody></table>${after}`);
    const table = Array.from(el.querySelectorAll('table')).find((t) => !existing.has(t));
    const cell = table?.rows[0]?.cells[0];
    if (cell) this.doc.getSelection()?.collapse(cell, 0);
  }

  /**
   * Row/column commands. Like lists, the table is edited on a copy and written back with
   * `insertHTML` so the change can be undone.
   */
  private editTable(command: RteCommand): void {
    this.restoreSelection();
    const cell = this.closestCell();
    if (!cell) return;
    const table = cell.closest('table')!;
    const r = (cell.parentElement as HTMLTableRowElement).rowIndex;
    const c = cell.cellIndex;
    const sel = this.doc.getSelection()!;
    const range = sel.getRangeAt(0);
    const position = caretPosition(cell, range.startContainer, range.startOffset);
    const copy = table.cloneNode(true) as HTMLTableElement;
    const rows = Array.from(copy.rows);
    // cell that gets the caret afterwards, and whether the caret keeps its place in it
    let target: [number, number] = [r, c];
    let keepCaret = true;

    switch (command) {
      case 'tableRowAbove':
      case 'tableRowBelow': {
        const tr = this.doc.createElement('tr');
        tr.append(...Array.from(rows[r].cells, (ref) => this.emptyCell(ref)));
        rows[r].insertAdjacentElement(command === 'tableRowAbove' ? 'beforebegin' : 'afterend', tr);
        if (command === 'tableRowAbove') target = [r + 1, c];
        break;
      }
      case 'tableColLeft':
      case 'tableColRight':
        for (const tr of rows) {
          const ref = tr.cells[Math.min(c, tr.cells.length - 1)];
          ref?.insertAdjacentElement(command === 'tableColLeft' ? 'beforebegin' : 'afterend', this.emptyCell(ref));
        }
        if (command === 'tableColLeft') target = [r, c + 1];
        break;
      case 'tableRowDelete':
        if (rows.length === 1) return this.replaceNode(table, '');
        rows[r].remove();
        target = [Math.min(r, rows.length - 2), c];
        keepCaret = false;
        break;
      case 'tableColDelete':
        if (rows.every((tr) => tr.cells.length <= 1)) return this.replaceNode(table, '');
        for (const tr of rows) {
          tr.cells[c]?.remove();
          if (!tr.cells.length) tr.remove();
        }
        keepCaret = false;
        break;
      case 'tableDelete':
        return this.replaceNode(table, '');
    }
    for (const section of [copy.tHead, copy.tFoot, ...Array.from(copy.tBodies)]) {
      if (section && !section.rows.length) section.remove();
    }

    const parent = table.parentNode!;
    const index = Array.prototype.indexOf.call(parent.childNodes, table);
    this.replaceNode(table, copy.outerHTML);
    const next = parent.childNodes[index];
    if (next?.nodeName !== 'TABLE') return;
    const rowEl = (next as HTMLTableElement).rows[target[0]];
    const cellEl = rowEl?.cells[Math.min(target[1], rowEl.cells.length - 1)];
    if (cellEl) sel.collapse(...caretPoint(cellEl, keepCaret ? position : 0));
  }

  private emptyCell(ref: HTMLTableCellElement): HTMLTableCellElement {
    const cell = this.doc.createElement(ref.localName as 'td' | 'th');
    cell.innerHTML = '<br>';
    return cell;
  }

  /**
   * Replaces a node through the browser's undo history (an empty `html` leaves an empty paragraph).
   * The range ends inside the node: when it ends after it, Chrome merges the result with a
   * following list or swallows a following empty paragraph.
   */
  private replaceNode(node: Node, html: string): void {
    const sel = this.doc.getSelection()!;
    const range = this.doc.createRange();
    range.setStartBefore(node);
    range.setEnd(node, node.childNodes.length);
    sel.removeAllRanges();
    sel.addRange(range);
    this.doc.execCommand('insertHTML', false, html || '<p><br></p>');
  }

  /** Tab / Shift+Tab: moves the caret to the next / previous cell; Tab in the last cell adds a row. */
  private moveToCell(cell: HTMLTableCellElement, step: 1 | -1): void {
    const table = cell.closest('table')!;
    const cells = Array.from(table.rows).flatMap((tr) => Array.from(tr.cells));
    const next = cells[cells.indexOf(cell) + step];
    if (next) {
      const range = this.doc.createRange();
      range.selectNodeContents(next);
      range.collapse(false);
      const sel = this.doc.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (step === 1) {
      void this.execute('tableRowBelow').then(() => {
        const current = this.closestCell();
        if (current) this.moveToCell(current, 1);
      });
    }
  }

  /**
   * List commands with nested-list support: switching the list type only affects the innermost
   * list, and indent/outdent nest list items inside the previous item (valid `li > ul` markup).
   * The change is computed on a copy of the top-level list and written back with `insertHTML`
   * so it stays in the browser's undo history. Returns false to let the native command run.
   */
  private handleListCommand(command: RteCommand): boolean {
    const tag = LIST_COMMANDS[command];
    if (!tag && command !== 'indent' && command !== 'outdent') return false;
    this.restoreSelection();
    const items = this.selectedListItems();
    if (!items.length) return !!tag && this.createList(tag);
    const list = items[0].parentElement!;
    let top = list;
    for (let li = this.closestInEditor('li', top.parentNode); li; li = this.closestInEditor('li', top.parentNode)) {
      top = li.parentElement!;
    }
    // top-level type switch, removing a list, or lifting items out of it: native behaviour is fine
    if (tag && (list.localName === tag || list === top)) return false;
    if (command === 'outdent' && list === top) return false;
    if (command === 'indent' && items[0].previousElementSibling?.localName !== 'li') return true;

    const sel = this.doc.getSelection()!;
    const range = sel.getRangeAt(0);
    // text and list items keep their order, so the caret is saved as a position within the list
    const start = caretPosition(top, range.startContainer, range.startOffset);
    const end = top.contains(range.endContainer) ? caretPosition(top, range.endContainer, range.endOffset) : start;
    const copy = top.cloneNode(true) as HTMLElement;
    const copyItems = items.map((li) => resolvePath(copy, pathOf(li, top))) as HTMLLIElement[];

    if (tag) {
      this.changeListType(copyItems[0].parentElement!, tag);
    } else if (command === 'indent') {
      this.indentItems(copyItems);
    } else {
      this.outdentItems(copyItems);
    }

    const replaced = this.doc.createRange();
    replaced.selectNodeContents(top);
    sel.removeAllRanges();
    sel.addRange(replaced);
    this.doc.execCommand('insertHTML', false, copy.innerHTML);

    if (top.isConnected) {
      const caret = this.doc.createRange();
      caret.setStart(...caretPoint(top, start));
      caret.setEnd(...caretPoint(top, end));
      sel.removeAllRanges();
      sel.addRange(caret);
    }
    return true;
  }

  /**
   * Turns the selected paragraphs into a list. Chrome's native command would nest the list
   * inside the `<p>`, which breaks later editing and isn't valid HTML.
   */
  private createList(tag: 'ul' | 'ol'): boolean {
    const el = this.editable().nativeElement;
    const sel = this.doc.getSelection()!;
    const range = sel.getRangeAt(0);
    const blockOf = (node: Node) => {
      let n = node;
      while (n.parentNode && n.parentNode !== el) n = n.parentNode;
      return n.parentNode === el ? n : null;
    };
    const first = blockOf(range.startContainer);
    const last = blockOf(range.endContainer);
    if (!first || !last) return false;
    const blocks: Node[] = [];
    for (let n: Node | null = first; n; n = n.nextSibling) {
      if (n.nodeType !== Node.TEXT_NODE || n.textContent!.trim()) blocks.push(n);
      if (n === last) break;
    }
    if (!blocks.every((b) => b.nodeName === 'P' || b.nodeName === 'DIV')) return false;

    // caret as a position in the new list: characters before it plus one per list item
    const index = blocks.findIndex((b) => b.contains(range.startContainer));
    const inBlock = this.doc.createRange();
    inBlock.setStart(blocks[index], 0);
    inBlock.setEnd(range.startContainer, range.startOffset);
    let position = inBlock.toString().length + index + 1;
    for (const b of blocks.slice(0, index)) position += b.textContent!.length;

    const replaced = this.doc.createRange();
    replaced.setStart(first, 0);
    replaced.setEnd(last, last.childNodes.length);
    sel.removeAllRanges();
    sel.addRange(replaced);
    const html = blocks.map((b) => `<li>${(b as Element).innerHTML || '<br>'}</li>`).join('');
    this.doc.execCommand('insertHTML', false, `<${tag}>${html}</${tag}>`);

    const list = this.closestInEditor('li')?.parentElement;
    if (list) sel.collapse(...caretPoint(list, position));
    return true;
  }

  /** Selected list items that are siblings of the item holding the start of the selection. */
  private selectedListItems(): HTMLLIElement[] {
    const sel = this.doc.getSelection();
    if (!sel?.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const first = this.closestInEditor('li', range.startContainer);
    if (!first) return [];
    // the selection may end deeper (in a sub-list): climb back to the level of the first item
    let last = this.closestInEditor('li', range.endContainer);
    while (last && last.parentNode !== first.parentNode) last = this.closestInEditor('li', last.parentNode);
    const items = [first];
    for (let li: Element | null = first; last && li !== last; ) {
      li = li.nextElementSibling;
      if (!li) break;
      if (li.localName === 'li') items.push(li as HTMLLIElement);
    }
    return items;
  }

  private changeListType(list: HTMLElement, tag: 'ul' | 'ol'): void {
    const next = this.doc.createElement(tag);
    for (const attr of Array.from(list.attributes)) {
      if (!['start', 'type', 'reversed'].includes(attr.name)) next.setAttribute(attr.name, attr.value);
    }
    next.append(...Array.from(list.childNodes));
    list.replaceWith(next);
  }

  /** Moves the items into a sub-list of the previous item. */
  private indentItems(items: HTMLLIElement[]): void {
    const prev = items[0].previousElementSibling!;
    const tag = items[0].parentElement!.localName;
    let sub = prev.lastElementChild;
    if (sub?.localName !== tag) {
      sub = this.doc.createElement(tag);
      prev.append(sub);
    }
    sub.append(...items);
  }

  /** Moves nested items one level up, right after their parent item. */
  private outdentItems(items: HTMLLIElement[]): void {
    const list = items[0].parentElement!;
    const parentItem = list.parentElement!;
    // the following siblings become children of the last moved item, so the order is kept
    const last = items[items.length - 1];
    const rest: Node[] = [];
    for (let n = last.nextSibling; n; n = n.nextSibling) rest.push(n);
    if (rest.some((n) => n.nodeType === 1)) {
      let sub = last.lastElementChild;
      if (sub?.localName !== list.localName) {
        sub = this.doc.createElement(list.localName);
        last.append(sub);
      }
      sub.append(...rest);
    }
    parentItem.after(...items);
    if (!list.children.length) list.remove();
  }

  private async askUrl(kind: 'link' | 'image', current: string): Promise<string | null> {
    const range = this.savedRange?.cloneRange() ?? null;
    const result = await this.promptFn()(kind, current);
    // the prompt may have stolen focus/selection: put it back
    if (range) this.savedRange = range;
    const sel = this.doc.getSelection();
    sel?.removeAllRanges();
    this.restoreSelection();
    if (result == null) return null;
    return result.trim();
  }

  private async insertLink(): Promise<void> {
    const existing = this.closestInEditor('a');
    const url = await this.askUrl('link', existing?.getAttribute('href') ?? '');
    if (url === null) return;
    if (url === '') {
      this.exec('unlink');
      return;
    }
    if (!isSafeUrl(url)) return;
    const target = this.linkTargetBlank() ? ' target="_blank" rel="noopener noreferrer"' : '';
    const sel = this.doc.getSelection();
    if (existing) {
      existing.setAttribute('href', url);
      if (target) {
        existing.setAttribute('target', '_blank');
        existing.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (!sel || sel.isCollapsed) {
      this.exec('insertHTML', `<a href="${escapeHtml(url)}"${target}>${escapeHtml(url)}</a>`);
    } else {
      this.exec('createLink', url);
      if (target) {
        const a = this.closestInEditor('a');
        a?.setAttribute('target', '_blank');
        a?.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }

  private async insertImage(): Promise<void> {
    const url = await this.askUrl('image', '');
    if (!url || !isSafeUrl(url, true)) return;
    this.exec('insertHTML', `<img src="${escapeHtml(url)}" alt="">`);
  }
}
