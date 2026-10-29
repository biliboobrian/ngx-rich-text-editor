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
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { RteSanitizeOptions, isSafeUrl, sanitizeHtml } from './sanitize';
import {
  RTE_DEFAULT_LABELS,
  RTE_DEFAULT_TOOLBAR,
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

const STATE_COMMANDS: RteCommand[] = [
  'bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript',
  'unorderedList', 'orderedList', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
];

const defaultPrompt: RtePromptFn = (kind, current) =>
  typeof window === 'undefined'
    ? null
    : window.prompt(kind === 'link' ? 'URL du lien / Link URL' : "URL de l'image / Image URL", current || 'https://');

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

  protected readonly editable = viewChild.required<ElementRef<HTMLDivElement>>('editable');
  protected readonly sourceArea = viewChild<ElementRef<HTMLTextAreaElement>>('sourceArea');

  protected readonly focused = signal(false);
  protected readonly sourceMode = signal(false);
  protected readonly active = signal<Partial<Record<RteCommand, boolean>>>({});
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

    if (block) {
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
    state.link = !!this.closestInEditor('a');
    this.active.set(state);
  }

  private closestInEditor<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] | null {
    const sel = this.doc.getSelection();
    const el = this.editable().nativeElement;
    let node: Node | null = sel?.anchorNode ?? null;
    while (node && node !== el) {
      if (node.nodeType === 1 && (node as Element).localName === tag) return node as HTMLElementTagNameMap[K];
      node = node.parentNode;
    }
    return null;
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
