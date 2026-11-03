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
  RTE_BACKGROUND_COLORS,
  RTE_DEFAULT_LABELS,
  RTE_DEFAULT_TOOLBAR,
  RTE_TABLE_TOOLBAR,
  RTE_TEXT_COLORS,
  RTE_TOGGLE_COMMANDS,
  RteCommand,
  RteImageUploadFn,
  RteLabelKey,
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

/**
 * What a color applies to (see {@link RichTextEditorComponent.setColor}):
 * - `textColor`: color of the selected text (`<span style="color: …">`);
 * - `backgroundColor`: highlight of the selected text (`<span style="background-color: …">`);
 * - `tableTextColor`: text color of table cells (`<td style="color: …">`);
 * - `tableBackground`: background of table cells (`<td style="background-color: …">`).
 */
export type RteColorKind = 'textColor' | 'backgroundColor' | 'tableTextColor' | 'tableBackground';

/**
 * Cells affected by a table color:
 * - `selection`: the rectangle of selected cells (falls back to `cell` when nothing is selected);
 * - `cell`: the cell holding the caret;
 * - `row`: every cell of the caret's row;
 * - `column`: every cell of the caret's column.
 */
export type RteTableScope = 'selection' | 'cell' | 'row' | 'column';

const COLOR_KINDS: ReadonlySet<RteCommand> = new Set<RteCommand>([
  'textColor', 'backgroundColor', 'tableTextColor', 'tableBackground',
]);

/**
 * Table borders to change: the outer edges of the selected cells (or of the table) and the lines
 * between the selected cells.
 */
export interface RteBorderSides {
  /** Top edge of the selected cells (or of the table). */
  top: boolean;
  /** Bottom edge of the selected cells (or of the table). */
  bottom: boolean;
  /** Left edge of the selected cells (or of the table). */
  left: boolean;
  /** Right edge of the selected cells (or of the table). */
  right: boolean;
  /** Horizontal and vertical lines between the selected cells. */
  inner: boolean;
}

const SIDE_LABELS: Record<keyof RteBorderSides, RteLabelKey> = {
  top: 'borderTop',
  bottom: 'borderBottom',
  left: 'borderLeft',
  right: 'borderRight',
  inner: 'borderInner',
};

const ALL_SIDES: RteBorderSides = { top: true, bottom: true, left: true, right: true, inner: true };

const SCOPE_LABELS: Record<RteTableScope, RteLabelKey> = {
  selection: 'scopeSelection',
  cell: 'scopeCell',
  row: 'scopeRow',
  column: 'scopeColumn',
};

/** Formatting applied to whole cells while several cells are selected: [CSS property, value]. */
const CELL_STYLES: Partial<Record<RteCommand, [string, string]>> = {
  bold: ['font-weight', 'bold'],
  italic: ['font-style', 'italic'],
  underline: ['text-decoration-line', 'underline'],
  strikeThrough: ['text-decoration-line', 'line-through'],
  alignLeft: ['text-align', 'left'],
  alignCenter: ['text-align', 'center'],
  alignRight: ['text-align', 'right'],
  alignJustify: ['text-align', 'justify'],
};

/** Border widths offered for tables (px); 0 hides the borders. */
const BORDER_WIDTHS = [0, 1, 2, 3];

/** Narrowest width a column can be dragged to (px). */
const MIN_COL_WIDTH = 30;

/** Narrowest width an image can be resized to (px). */
const MIN_IMAGE_WIDTH = 16;

/** Resize handles of a selected image: north-west, north-east, south-west and south-east corners. */
export type RteImageCorner = 'nw' | 'ne' | 'sw' | 'se';

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

/** Widths (px) of the `<col>` elements of a table with fixed column widths, or null. */
function columnWidths(table: HTMLTableElement): number[] | null {
  const group = Array.from(table.children).find((n) => n.localName === 'colgroup');
  return group ? Array.from(group.children, (col) => parseFloat((col as HTMLElement).style.width) || 100) : null;
}

/** Rendered widths of the columns, read on the row with the most cells. */
function measureColumns(table: HTMLTableElement): number[] {
  const row = Array.from(table.rows).reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  return Array.from(row.cells, (cell) => cell.getBoundingClientRect().width);
}

/** Fixes the column widths of a table (`<colgroup>` + fixed layout); `null` restores automatic widths. */
function setColumnWidths(table: HTMLTableElement, widths: number[] | null): void {
  for (const group of Array.from(table.children).filter((n) => n.localName === 'colgroup')) group.remove();
  table.style.removeProperty('table-layout');
  table.style.removeProperty('width');
  if (widths) {
    const group = table.ownerDocument.createElement('colgroup');
    for (const width of widths) {
      const col = table.ownerDocument.createElement('col');
      col.style.width = `${Math.round(width)}px`;
      group.append(col);
    }
    table.insertBefore(group, table.caption ? table.caption.nextSibling : table.firstChild);
    table.style.tableLayout = 'fixed';
    table.style.width = `${Math.round(widths.reduce((sum, w) => sum + w, 0))}px`;
  }
  if (!table.getAttribute('style')) table.removeAttribute('style');
}

function cellCoords(cell: HTMLTableCellElement): [number, number] {
  return [(cell.parentElement as HTMLTableRowElement).rowIndex, cell.cellIndex];
}

/** Default image upload: embeds the file as a data URL. */
const readAsDataUrl: RteImageUploadFn = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

/** Ctrl (Windows / Linux) or Option (macOS) held while dropping: copy instead of move. */
function isCopyDrop(event: DragEvent): boolean {
  return event.ctrlKey || event.altKey;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Rich text editor that takes HTML as input and emits HTML.
 *
 * Works with a two-way binding (`[(value)]`), `ngModel` or reactive forms (it is a
 * `ControlValueAccessor`). Incoming and pasted HTML is sanitized (see {@link sanitizeHtml}).
 *
 * Theme it with CSS custom properties on the host (`--nrte-accent`, `--nrte-border`,
 * `--nrte-radius`…).
 *
 * @example
 * ```html
 * <ngx-rich-text-editor [(value)]="html" placeholder="Write something…" />
 * <ngx-rich-text-editor formControlName="body" [labels]="frLabels" />
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
  /**
   * HTML content of the editor. Supports two-way binding: `[(value)]="html"`.
   * An empty editor emits `''`.
   * @default ''
   */
  readonly value = model<string>('');
  /**
   * Text shown while the editor is empty.
   * @default ''
   */
  readonly placeholder = input<string>('');
  /**
   * Buttons of the main toolbar, in order. Use `'|'` for separators.
   * @default RTE_DEFAULT_TOOLBAR
   * @example [toolbar]="['bold', 'italic', '|', 'link', 'image']"
   */
  readonly toolbar = input<readonly RteToolbarItem[]>(RTE_DEFAULT_TOOLBAR);
  /**
   * Hides the main toolbar (keyboard shortcuts and the public methods still work).
   * @default false
   */
  readonly hideToolbar = input(false, { transform: booleanAttribute });
  /**
   * Read-only mode: the content can't be edited and the toolbar is disabled.
   * Also set automatically when the bound form control is disabled.
   * @default false
   */
  readonly readonly = input(false, { transform: booleanAttribute });
  /**
   * Overrides of the tooltips and popup texts, merged over {@link RTE_DEFAULT_LABELS}.
   * Pass {@link RTE_LABELS_FR} for French.
   * @default {}
   * @example [labels]="{ bold: 'Fett', italic: 'Kursiv' }"
   */
  readonly labels = input<Partial<Record<RteLabelKey, string>>>({});
  /**
   * Swatches of the text color palettes (`textColor`, `tableTextColor`) and of the borders popup.
   * Any CSS color.
   * @default RTE_TEXT_COLORS
   */
  readonly textColors = input<readonly string[]>(RTE_TEXT_COLORS);
  /**
   * Swatches of the background color palettes (`backgroundColor`, `tableBackground`). Any CSS color.
   * @default RTE_BACKGROUND_COLORS
   */
  readonly backgroundColors = input<readonly string[]>(RTE_BACKGROUND_COLORS);
  /**
   * Sanitizes the incoming value, pasted HTML and {@link insertHtml} (strongly recommended:
   * disable it only for fully trusted content).
   * @default true
   */
  readonly sanitize = input(true, { transform: booleanAttribute });
  /**
   * Options of the sanitizer: extra tags, attributes or styles to keep, keep classes…
   * @default {}
   * @example [sanitizeOptions]="{ allowedStyles: ['font-size'], keepClasses: true }"
   */
  readonly sanitizeOptions = input<RteSanitizeOptions>({});
  /**
   * Pastes clipboard content as plain text, dropping its formatting.
   * @default false
   */
  readonly pastePlainText = input(false, { transform: booleanAttribute });
  /**
   * Inserted links open in a new tab (`target="_blank" rel="noopener noreferrer"`).
   * @default false
   */
  readonly linkTargetBlank = input(false, { transform: booleanAttribute });
  /**
   * Asks the user for the URL of a link or an image, e.g. by opening your own dialog. May return a
   * Promise; `null` / `undefined` cancels, `''` removes an existing link.
   * @default `window.prompt`
   */
  readonly promptFn = input<RtePromptFn>(defaultPrompt);
  /**
   * Handles image files dropped or pasted in the editor: return the URL to use as `src` (e.g. after
   * an upload). Throw or reject to skip a file.
   * @default embeds the image as a `data:` URL
   */
  readonly imageUpload = input<RteImageUploadFn>(readAsDataUrl);
  /**
   * Minimum height of the editable area (any CSS length).
   * @default '160px'
   */
  readonly minHeight = input<string>('160px');
  /**
   * Maximum height of the editable area before it scrolls (any CSS length); `null`: grows freely.
   * @default null
   */
  readonly maxHeight = input<string | null>(null);
  /**
   * Accessible label (`aria-label`) of the editable area.
   * @default 'Rich text editor'
   */
  readonly ariaLabel = input<string>('Rich text editor');

  /** Emitted when the editable area gains focus. */
  readonly editorFocus = output<void>();
  /** Emitted when the editable area (or the HTML source textarea) loses focus. */
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
  /** Open popup (color palette or table borders) and its position, below its toolbar button. */
  protected readonly palette = signal<{ kind: RteColorKind | 'tableBorder'; top: number; left: number } | null>(null);
  /** Last color picked for each kind, shown under the toolbar buttons. */
  protected readonly lastColors = signal<Record<RteColorKind, string>>({
    textColor: '#c92a2a',
    backgroundColor: '#fff3bf',
    tableTextColor: '#c92a2a',
    tableBackground: '#fff3bf',
  });
  /** Cells a table color applies to, chosen in the palette. */
  protected readonly tableScope = signal<RteTableScope>('cell');
  /** Rectangle of selected cells, as [row, column] of two opposite corners. */
  protected readonly cellSelection = signal<{
    table: HTMLTableElement;
    anchor: [number, number];
    focus: [number, number];
  } | null>(null);
  /** Highlight drawn over the selected cells. */
  protected readonly cellOverlay = signal<{ top: number; left: number; width: number; height: number } | null>(null);
  /** A cell selection is being dragged: hides the browser's text selection. */
  protected readonly cellSelecting = signal(false);
  /** Files are being dragged over the editable area. */
  protected readonly dropActive = signal(false);
  protected readonly tableScopes = computed<RteTableScope[]>(() =>
    this.cellSelection() ? ['selection', 'cell', 'row', 'column'] : ['cell', 'row', 'column'],
  );
  protected readonly borderWidths = BORDER_WIDTHS;
  protected readonly borderSideKeys = Object.keys(SIDE_LABELS) as (keyof RteBorderSides)[];
  /** Border settings of the borders popup, applied on each change of width or color. */
  protected readonly borderSides = signal<RteBorderSides>({ ...ALL_SIDES });
  protected readonly borderWidth = signal(1);
  /** `null`: the theme border color (`--nrte-border`). */
  protected readonly borderColor = signal<string | null>(null);
  /** Pointer over a column border: shows the resize cursor. */
  protected readonly colResizeHover = signal(false);
  /** Vertical guide shown while a column border is dragged. */
  protected readonly colGuide = signal<{ left: number; top: number; height: number } | null>(null);
  /** Image selected by a click, shown with resize handles. */
  private readonly selectedImage = signal<HTMLImageElement | null>(null);
  /** Frame drawn around the selected image; `label` shows the size while resizing. */
  protected readonly imageFrame = signal<{ top: number; left: number; width: number; height: number; label?: string } | null>(null);
  protected readonly imageCorners: readonly RteImageCorner[] = ['nw', 'ne', 'sw', 'se'];
  private readonly formDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.readonly() || this.formDisabled());
  protected readonly isEmpty = computed(() => !this.value());
  protected readonly titles = computed(() => ({ ...RTE_DEFAULT_LABELS, ...this.labels() }));

  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Last HTML known to be in sync with the editable element. */
  private lastHtml: string | null = null;
  /** Set while the editor rewrites a table itself (its input events don't end a cell selection). */
  private internalEdit = false;
  private savedRange: Range | null = null;
  /** Image of the editor being dragged (dropping it in the editor moves it). */
  private draggedImage: HTMLImageElement | null = null;
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
      this.selectedImage.set(null);
      this.imageFrame.set(null);
    });

    afterNextRender(() => {
      try {
        this.doc.execCommand('defaultParagraphSeparator', false, 'p');
        this.doc.execCommand('styleWithCSS', false, 'false');
        // Firefox's own image handles would compete with ours
        this.doc.execCommand('enableObjectResizing', false, 'false');
      } catch {
        /* not supported: ignore */
      }
      const onSelectionChange = () => this.handleSelectionChange();
      this.doc.addEventListener('selectionchange', onSelectionChange);
      // close the color palette when clicking anywhere else
      const onMouseDown = (event: MouseEvent) => {
        const target = event.target as Element;
        const inside = this.root().nativeElement.contains(target) && target.closest('.nrte__palette, .nrte__btn--color');
        if (!inside) this.palette.set(null);
        if (!this.root().nativeElement.contains(target)) this.clearCellSelection();
      };
      this.doc.addEventListener('mousedown', onMouseDown);
      this.destroyRef.onDestroy(() => {
        this.doc.removeEventListener('selectionchange', onSelectionChange);
        this.doc.removeEventListener('mousedown', onMouseDown);
      });
    });
  }

  // ---------------------------------------------------------------- public API

  /** Focuses the editable area. */
  focus(): void {
    this.editable().nativeElement.focus();
  }

  /**
   * Returns the current HTML, the same as {@link value}.
   * @returns the HTML of the editor, `''` when it is empty
   */
  getHtml(): string {
    return this.value() ?? '';
  }

  /**
   * Inserts HTML at the caret position (or at the end if the editor never had the focus),
   * replacing the selected content. The HTML is sanitized unless {@link sanitize} is off.
   * The insertion can be undone.
   * @param html the HTML to insert
   * @example editor.insertHtml('<p>Hello <b>world</b></p>');
   */
  insertHtml(html: string): void {
    this.restoreSelection();
    this.doc.execCommand('insertHTML', false, this.clean(html));
    this.syncFromEditor();
  }

  /**
   * Applies a color; `null` removes it. `textColor` / `backgroundColor` color the selected text,
   * `tableTextColor` / `tableBackground` the cells of the table holding the caret (`scope`).
   * While cells are selected, the text colors apply to the selected cells.
   * @param kind  what to color
   * @param color any CSS color, or `null` to remove the color
   * @param scope cells colored by the table kinds; defaults to the scope chosen in the palette
   * @example
   * editor.setColor('textColor', '#c92a2a');
   * editor.setColor('tableBackground', '#fff3bf', 'row');
   */
  setColor(kind: RteColorKind, color: string | null, scope: RteTableScope = this.tableScope()): void {
    if (this.isDisabled() || this.sourceMode()) return;
    this.palette.set(null);
    this.restoreSelection();
    if (this.cellSelection() && (kind === 'textColor' || kind === 'backgroundColor')) {
      // with selected cells, the text colors apply to the cells themselves
      kind = kind === 'textColor' ? 'tableTextColor' : 'tableBackground';
      scope = 'selection';
    }
    if (kind === 'tableTextColor' || kind === 'tableBackground') {
      const prop = kind === 'tableTextColor' ? 'color' : 'background-color';
      this.styleCells(scope, (cell) => (color ? cell.style.setProperty(prop, color) : cell.style.removeProperty(prop)));
    } else {
      // CSS mode gives `<span style="color: …">` (kept by the sanitizer) instead of `<font>`
      this.doc.execCommand('styleWithCSS', false, 'true');
      if (kind === 'textColor') this.doc.execCommand('foreColor', false, color ?? 'inherit');
      else this.doc.execCommand('hiliteColor', false, color ?? 'transparent');
      this.doc.execCommand('styleWithCSS', false, 'false');
    }
    if (color) this.lastColors.update((colors) => ({ ...colors, [kind]: color }));
    this.syncFromEditor();
    this.updateActiveStates();
  }

  /**
   * Sets table borders on the chosen sides of the selected cells, or of the whole table holding
   * the caret. Does nothing when the caret isn't in a table.
   * @param width         line width in px; `0` hides the lines
   * @param options.color any CSS color; defaults to the theme border color (`--nrte-border`)
   * @param options.sides sides to change; omitted sides default to `true`
   * @example
   * // bottom line only, 2px red
   * editor.setTableBorder(2, { color: '#c92a2a', sides: { top: false, left: false, right: false, inner: false } });
   */
  setTableBorder(width: number, options: { color?: string | null; sides?: Partial<RteBorderSides> } = {}): void {
    if (this.isDisabled() || this.sourceMode()) return;
    const sides = { ...ALL_SIDES, ...options.sides };
    const color =
      options.color ?? (getComputedStyle(this.root().nativeElement).getPropertyValue('--nrte-border').trim() || '#d0d7de');
    // `hidden` beats the neighbour's border in the collapsed border model, `none` would not
    const value = width ? `${width}px solid ${color}` : 'hidden';
    const selected = this.selectionRect();
    this.rewriteTable((copy) => {
      const rows = Array.from(copy.rows);
      const [r1, r2, c1, c2] = selected ?? [0, rows.length - 1, 0, Math.max(...rows.map((tr) => tr.cells.length)) - 1];
      const set = (r: number, c: number, side: string) => rows[r]?.cells[c]?.style.setProperty(`border-${side}`, value);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (r === r1 ? sides.top : sides.inner) set(r, c, 'top');
          if (r === r2 ? sides.bottom : sides.inner) set(r, c, 'bottom');
          if (c === c1 ? sides.left : sides.inner) set(r, c, 'left');
          if (c === c2 ? sides.right : sides.inner) set(r, c, 'right');
        }
      }
      // the neighbouring cells share the outer lines: give them the same border
      for (let c = c1; c <= c2; c++) {
        if (sides.top) set(r1 - 1, c, 'bottom');
        if (sides.bottom) set(r2 + 1, c, 'top');
      }
      for (let r = r1; r <= r2; r++) {
        if (sides.left) set(r, c1 - 1, 'right');
        if (sides.right) set(r, c2 + 1, 'left');
      }
    }, this.cellSelection()?.table);
    this.syncFromEditor();
    this.updateActiveStates();
  }

  /**
   * Runs a toolbar command, as if its button was clicked. Commands opening a popup (colors,
   * borders) toggle it; `link` / `image` ask for the URL through {@link promptFn}.
   * Ignored in read-only mode.
   * @param command the command to run
   * @returns resolves once the command is applied (after the URL prompt for `link` / `image`)
   * @example await editor.execute('bold');
   */
  async execute(command: RteCommand): Promise<void> {
    if (this.isDisabled()) return;
    if (command === 'source') {
      this.toggleSource();
      return;
    }
    if (this.sourceMode()) return;
    if (COLOR_KINDS.has(command) || command === 'tableBorder') {
      this.togglePalette(command as RteColorKind | 'tableBorder');
      return;
    }
    if (this.cellSelection()) {
      if (CELL_STYLES[command]) {
        this.styleSelectedCells(CELL_STYLES[command]!);
        this.syncFromEditor();
        this.updateActiveStates();
        return;
      }
      this.clearCellSelection();
    }

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

  /** Forms API (`ControlValueAccessor`): sets the HTML from the form control. */
  writeValue(value: string | null | undefined): void {
    this.value.set(value ?? '');
  }

  /** Forms API (`ControlValueAccessor`): registers the callback notified of each change. */
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  /** Forms API (`ControlValueAccessor`): registers the callback notified when the editor loses focus. */
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /** Forms API (`ControlValueAccessor`): a disabled control makes the editor read-only. */
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

  /** Commands opening a popup (color palettes, table borders). */
  protected isColor(item: RteToolbarItem): boolean {
    return item !== '|' && (COLOR_KINDS.has(item) || item === 'tableBorder');
  }

  protected swatchesOf(kind: RteColorKind | 'tableBorder'): readonly string[] {
    return kind === 'textColor' || kind === 'tableTextColor' ? this.textColors() : this.backgroundColors();
  }

  protected sideLabel(side: keyof RteBorderSides): string {
    return this.titles()[SIDE_LABELS[side]];
  }

  protected toggleBorderSide(side: keyof RteBorderSides | 'all'): void {
    this.borderSides.update((sides) => (side === 'all' ? { ...ALL_SIDES } : { ...sides, [side]: !sides[side] }));
  }

  /** Borders popup: a new width or color is applied right away to the chosen sides. */
  protected applyBorder(change: { width?: number; color?: string | null }): void {
    if (change.width !== undefined) this.borderWidth.set(change.width);
    if (change.color !== undefined) {
      this.borderColor.set(change.color);
      if (!this.borderWidth()) this.borderWidth.set(1);
    }
    this.setTableBorder(this.borderWidth(), { color: this.borderColor(), sides: this.borderSides() });
  }

  protected scopeLabel(scope: RteTableScope): string {
    return this.titles()[SCOPE_LABELS[scope]];
  }

  protected closePalette(): void {
    this.palette.set(null);
    this.restoreSelection();
  }

  protected titleOf(item: RteToolbarItem): string {
    return item === '|' ? '' : this.titles()[item];
  }

  protected asCommand(item: RteToolbarItem): RteCommand {
    return item as RteCommand;
  }

  // --------------------------------------------------------------- events

  protected onInput(event: Event): void {
    if (!this.internalEdit) this.clearCellSelection();
    this.updateImageFrame();
    if ((event as InputEvent).inputType?.startsWith('history')) this.collapseRestoredBlock();
    this.syncFromEditor();
  }

  /**
   * Undoing a list/table rewrite makes the browser select the whole block, so the next click
   * would drag it and typing would replace it: keep a caret at its start instead.
   */
  private collapseRestoredBlock(): void {
    const sel = this.doc.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const block = range.startContainer.childNodes[range.startOffset];
    if (!block || !/^(TABLE|LI)$/.test(block.nodeName)) return;
    const target = block.nodeName === 'TABLE' ? (block as HTMLTableElement).rows[0]?.cells[0] : block;
    if (target) sel.collapse(target, 0);
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
    const images = imageFiles(data.files);
    if (images.length && !html) {
      void this.insertImageFiles(images, null);
      return;
    }
    if (html && !this.pastePlainText()) {
      this.doc.execCommand('insertHTML', false, this.clean(html));
    } else {
      this.doc.execCommand('insertText', false, data.getData('text/plain'));
    }
    this.syncFromEditor();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.palette()) {
      this.palette.set(null);
      return;
    }
    if (this.cellSelection() && !['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) {
      const key = event.key.toLowerCase();
      const shortcut = ({ b: 'bold', i: 'italic', u: 'underline' } as Record<string, RteCommand>)[key];
      if ((event.ctrlKey || event.metaKey) && shortcut) {
        event.preventDefault();
        void this.execute(shortcut);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        // empties the selected cells
        event.preventDefault();
        this.styleCells('selection', (cell) => (cell.innerHTML = '<br>'));
        this.clearCellSelection();
        this.syncFromEditor();
        return;
      }
      this.clearCellSelection();
      if (key === 'escape') return;
    }
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

  // ------------------------------------------------------------ image drop

  /** An image of the editor starts being dragged: dropping it in the editor moves it. */
  protected onDragStart(event: DragEvent): void {
    const target = event.target as Element;
    this.draggedImage = target.localName === 'img' && !this.isDisabled() ? (target as HTMLImageElement) : null;
    if (this.draggedImage && event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
  }

  protected onDragEnd(): void {
    this.draggedImage = null;
  }

  protected onDragOver(event: DragEvent): void {
    if (this.draggedImage?.isConnected) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = isCopyDrop(event) ? 'copy' : 'move';
      return;
    }
    if (!event.dataTransfer?.types.includes('Files')) return;
    // without this the browser would open the file instead of dropping it in the editor
    event.preventDefault();
    event.dataTransfer.dropEffect = this.isDisabled() ? 'none' : 'copy';
    this.dropActive.set(!this.isDisabled());
  }

  protected onDragLeave(event: DragEvent): void {
    if (!this.editable().nativeElement.contains(event.relatedTarget as Node)) this.dropActive.set(false);
  }

  /** Dropped image files are inserted where they are dropped. */
  protected onDrop(event: DragEvent): void {
    this.dropActive.set(false);
    const dragged = this.draggedImage;
    this.draggedImage = null;
    if (dragged?.isConnected) {
      // Chrome also exposes the dragged image as a file: don't insert it as a new upload
      event.preventDefault();
      const range = this.rangeFromPoint(event.clientX, event.clientY);
      if (range) this.moveImage(dragged, range, isCopyDrop(event));
      return;
    }
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    const images = imageFiles(event.dataTransfer.files);
    if (!images.length || this.isDisabled()) return;
    void this.insertImageFiles(images, this.rangeFromPoint(event.clientX, event.clientY));
  }

  /** Turns the files into URLs (`imageUpload`) and inserts them, in one step, at `range` or the caret. */
  private async insertImageFiles(files: File[], range: Range | null): Promise<void> {
    // remember where to insert: the upload may take a while and the caret may move meanwhile
    const sel = this.doc.getSelection();
    const current = sel?.rangeCount && this.editable().nativeElement.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    const at = (range ?? current ?? this.savedRange)?.cloneRange() ?? null;
    const results = await Promise.allSettled(files.map(async (file) => (await this.imageUpload()(file))?.trim()));
    const urls = results.flatMap((r) => (r.status === 'fulfilled' && r.value && isSafeUrl(r.value, true) ? [r.value] : []));
    if (!urls.length) return;
    const el = this.editable().nativeElement;
    el.focus();
    if (sel && at && el.contains(at.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(at);
    } else {
      this.restoreSelection();
    }
    this.doc.execCommand('insertHTML', false, urls.map((url) => `<img src="${escapeHtml(url)}" alt="">`).join(''));
    this.syncFromEditor();
  }

  // -------------------------------------------------------- image resizing

  /** A click on an image selects it (so Delete / Ctrl+C act on it) and shows its resize handles. */
  protected onContentClick(event: MouseEvent): void {
    const img = event.target as HTMLElement;
    if (img.localName !== 'img' || this.isDisabled() || !this.editable().nativeElement.contains(img)) return;
    this.selectImage(img as HTMLImageElement);
  }

  private selectImage(img: HTMLImageElement): void {
    const range = this.doc.createRange();
    range.selectNode(img);
    const sel = this.doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    this.savedRange = range.cloneRange();
    this.selectedImage.set(img);
    this.updateImageFrame();
  }

  /** True when the selection is exactly the selected image. */
  private imageStillSelected(): boolean {
    const img = this.selectedImage();
    const sel = this.doc.getSelection();
    if (!img?.isConnected || !sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    return (
      range.startContainer === img.parentNode &&
      range.endContainer === img.parentNode &&
      range.startContainer.childNodes[range.startOffset] === img &&
      range.endOffset === range.startOffset + 1
    );
  }

  private updateImageFrame(label?: string): void {
    const img = this.selectedImage();
    if (!img?.isConnected) {
      this.selectedImage.set(null);
      this.imageFrame.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const content = this.editable().nativeElement.getBoundingClientRect();
    const rect = img.getBoundingClientRect();
    // scrolled out of the editable area
    if (rect.bottom < content.top || rect.top > content.bottom) {
      this.imageFrame.set(null);
      return;
    }
    this.imageFrame.set({
      top: rect.top - box.top,
      left: rect.left - box.left,
      width: rect.width,
      height: rect.height,
      label,
    });
  }

  /**
   * Dragging a corner handle resizes the image, keeping its proportions. The size is previewed
   * live and written on release as a `width` attribute, in one undoable step.
   */
  protected onImageHandleDown(event: MouseEvent, corner: RteImageCorner): void {
    const img = this.selectedImage();
    if (event.button !== 0 || !img || this.isDisabled()) return;
    event.preventDefault();
    event.stopPropagation();
    const start = img.getBoundingClientRect();
    const ratio = start.height / start.width || 1;
    const startX = event.clientX;
    const original = { width: img.getAttribute('width'), style: img.getAttribute('style') };
    // the image can't be wider than the block holding it
    let parent = img.parentElement!;
    while (parent !== this.editable().nativeElement && getComputedStyle(parent).display.startsWith('inline')) {
      parent = parent.parentElement!;
    }
    const parentStyle = getComputedStyle(parent);
    const maxWidth = Math.max(
      MIN_IMAGE_WIDTH,
      parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight),
    );
    const sign = corner === 'ne' || corner === 'se' ? 1 : -1;
    const widthAt = (x: number) =>
      Math.round(Math.min(maxWidth, Math.max(MIN_IMAGE_WIDTH, start.width + sign * (x - startX))));

    const move = (e: MouseEvent) => {
      const width = widthAt(e.clientX);
      img.style.width = `${width}px`;
      img.style.height = 'auto';
      this.updateImageFrame(`${width} × ${Math.round(width * ratio)}`);
    };
    const up = (e: MouseEvent) => {
      this.doc.removeEventListener('mousemove', move);
      this.doc.removeEventListener('mouseup', up);
      const width = widthAt(e.clientX);
      // put the image back as it was, so undo restores the original size
      for (const [name, value] of Object.entries(original)) {
        if (value === null) img.removeAttribute(name);
        else img.setAttribute(name, value);
      }
      if (width === Math.round(start.width)) {
        this.updateImageFrame();
        return;
      }
      this.resizeImage(img, width);
    };
    this.doc.addEventListener('mousemove', move);
    this.doc.addEventListener('mouseup', up);
  }

  /** Double-click on a handle: back to the image's natural size. */
  protected resetImageSize(): void {
    const img = this.selectedImage();
    if (img && !this.isDisabled()) this.resizeImage(img, null);
  }

  /**
   * Sets the width of an image (px, the height follows), or `null` for its natural size. The image
   * is replaced through `insertHTML` so the change can be undone.
   */
  private resizeImage(img: HTMLImageElement, width: number | null): void {
    const copy = img.cloneNode() as HTMLImageElement;
    copy.removeAttribute('height');
    copy.style.removeProperty('width');
    copy.style.removeProperty('height');
    if (!copy.getAttribute('style')) copy.removeAttribute('style');
    if (width === null) copy.removeAttribute('width');
    else copy.setAttribute('width', String(width));
    if (copy.outerHTML === img.outerHTML) return;

    const el = this.editable().nativeElement;
    const existing = new Set(Array.from(el.querySelectorAll('img')));
    if (this.doc.activeElement !== el) el.focus();
    const range = this.doc.createRange();
    range.selectNode(img);
    const sel = this.doc.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    this.doc.execCommand('insertHTML', false, copy.outerHTML);
    const next = Array.from(el.querySelectorAll('img')).find((i) => !existing.has(i));
    if (next) this.selectImage(next);
    else this.updateImageFrame();
    this.syncFromEditor();
  }

  /**
   * Moves (or copies) an image of the editor to `range`. The top-level blocks from the image to the
   * drop point are rewritten with one `insertHTML`, so the move is a single undo step.
   */
  private moveImage(img: HTMLImageElement, range: Range, copy: boolean): void {
    const el = this.editable().nativeElement;
    const { startContainer: container, startOffset: offset } = range;
    if (img.contains(container)) return;
    // dropped right before or after itself
    const index = Array.prototype.indexOf.call(img.parentNode!.childNodes, img);
    if (!copy && container === img.parentNode && (offset === index || offset === index + 1)) return;

    const topOf = (node: Node) => {
      let n = node;
      while (n.parentNode !== el) n = n.parentNode!;
      return n;
    };
    const children = Array.from(el.childNodes);
    const ends = [children.indexOf(topOf(img) as ChildNode), container === el ? -1 : children.indexOf(topOf(container) as ChildNode)];
    if (container === el) {
      // between two blocks: the image goes in a new paragraph there
      ends[1] = Math.min(offset, children.length - 1);
    }
    const [from, to] = [Math.min(...ends), Math.max(...ends)];
    const blocks = children.slice(from, to + 1);
    const imagesBefore = children.slice(0, from).reduce(
      (count, n) => count + (n.nodeName === 'IMG' ? 1 : n.nodeType === 1 ? (n as Element).querySelectorAll('img').length : 0),
      0,
    );

    // apply the move on copies of the blocks
    const wrapper = this.doc.createElement('div');
    wrapper.append(...blocks.map((b) => b.cloneNode(true)));
    const at = (node: Node) => resolvePath(wrapper, [blocks.indexOf(topOf(node) as ChildNode), ...pathOf(node, topOf(node))]);
    const source = at(img) as HTMLImageElement;
    const moved = img.cloneNode() as HTMLImageElement;
    if (container === el) {
      const p = this.doc.createElement('p');
      p.append(moved);
      if (offset >= children.length) wrapper.append(p);
      else at(children[offset]).parentNode!.insertBefore(p, at(children[offset]));
    } else {
      const target = at(container);
      if (target.nodeType === Node.TEXT_NODE) {
        const rest = (target as Text).splitText(offset);
        rest.parentNode!.insertBefore(moved, rest);
      } else {
        target.insertBefore(moved, target.childNodes[offset] ?? null);
      }
    }
    if (!copy) {
      const parent = source.parentNode!;
      source.remove();
      // keep a paragraph emptied by the move editable
      if (parent !== wrapper && parent.nodeType === 1 && !parent.childNodes.length) (parent as Element).innerHTML = '<br>';
    }
    const movedIndex = imagesBefore + Array.from(wrapper.querySelectorAll('img')).indexOf(moved);

    el.focus();
    const replaced = this.doc.createRange();
    replaced.setStartBefore(blocks[0]);
    const last = blocks[blocks.length - 1];
    // end inside the last block (see replaceNode)
    if (last.nodeType === Node.TEXT_NODE) replaced.setEnd(last, (last as Text).length);
    else if (last.nodeName === 'IMG' || last.nodeName === 'HR') replaced.setEndAfter(last);
    else replaced.setEnd(last, last.childNodes.length);
    const sel = this.doc.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(replaced);
    const html = Array.from(wrapper.childNodes, (n) => (n.nodeType === 1 ? (n as Element).outerHTML : escapeHtml(n.textContent ?? ''))).join('');
    this.doc.execCommand('insertHTML', false, html);

    const result = el.querySelectorAll('img')[movedIndex];
    if (result) this.selectImage(result);
    this.syncFromEditor();
  }

  /** Caret position under the pointer, if it is in the editor. */
  private rangeFromPoint(x: number, y: number): Range | null {
    const doc = this.doc as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let range: Range | null = null;
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) {
      range = doc.createRange();
      range.setStart(position.offsetNode, position.offset);
    } else {
      range = doc.caretRangeFromPoint?.(x, y) ?? null;
    }
    return range && this.editable().nativeElement.contains(range.startContainer) ? range : null;
  }

  // ------------------------------------------------------- column resizing

  protected onContentMouseMove(event: MouseEvent): void {
    if (!this.colGuide()) this.colResizeHover.set(!!this.resizeTarget(event));
  }

  /**
   * Dragging a column border shows a guide; the new widths are applied on release. An inner border
   * moves width between its two columns (the table keeps its width); only the outer left / right
   * borders resize the table, through its first / last column.
   * Dragging across cells (or Shift+click) selects a rectangle of cells.
   */
  protected onContentMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = this.resizeTarget(event);
    if (!target) {
      this.startCellSelection(event);
      return;
    }
    event.preventDefault();
    const { table } = target;
    const widths = columnWidths(table) ?? measureColumns(table);
    const last = widths.length - 1;
    // an inner border without a column after it (irregular table) behaves like the outer one
    const edge = target.edge === 'inner' && target.col >= last ? 'right' : target.edge;
    const col = edge === 'right' ? last : edge === 'left' ? 0 : target.col;
    const startX = event.clientX;
    const widthsAt = (x: number): number[] => {
      const next = [...widths];
      const dx = x - startX;
      if (edge === 'inner') {
        const shift = Math.min(Math.max(dx, MIN_COL_WIDTH - widths[col]), widths[col + 1] - MIN_COL_WIDTH);
        next[col] += shift;
        next[col + 1] -= shift;
      } else {
        next[col] = Math.max(MIN_COL_WIDTH, widths[col] + (edge === 'left' ? -dx : dx));
      }
      return next;
    };
    const move = (e: MouseEvent) => {
      const box = this.root().nativeElement.getBoundingClientRect();
      const rect = table.getBoundingClientRect();
      const change = widthsAt(e.clientX)[col] - widths[col];
      const x = startX + (edge === 'left' ? -change : change);
      this.colGuide.set({ left: x - box.left, top: rect.top - box.top, height: rect.height });
    };
    const up = (e: MouseEvent) => {
      this.doc.removeEventListener('mousemove', move);
      this.doc.removeEventListener('mouseup', up);
      this.colGuide.set(null);
      const next = widthsAt(e.clientX);
      if (next.every((w, i) => w === widths[i])) return;
      this.rewriteTable(() => ({ widths: next }), table);
      this.syncFromEditor();
      this.updateActiveStates();
    };
    move(event);
    this.doc.addEventListener('mousemove', move);
    this.doc.addEventListener('mouseup', up);
  }

  private startCellSelection(event: MouseEvent): void {
    const cell = this.closestCell(event.target as Node);
    const table = cell?.closest('table');
    const current = this.cellSelection();
    if (cell && table && event.shiftKey) {
      // Shift+click: from the selection anchor (or the caret cell) to the clicked cell
      const caretCell = this.closestCell();
      const anchor = current?.table === table ? current.anchor : caretCell?.closest('table') === table ? cellCoords(caretCell!) : null;
      if (anchor) {
        event.preventDefault();
        this.setCellSelection(table, anchor, cellCoords(cell));
        return;
      }
    }
    this.clearCellSelection();
    if (!cell || !table || this.isDisabled()) return;

    const move = (e: MouseEvent) => {
      const over = this.closestCell(this.doc.elementFromPoint(e.clientX, e.clientY));
      if (!over || over.closest('table') !== table) return;
      if (over !== cell) {
        this.cellSelecting.set(true);
        this.setCellSelection(table, cellCoords(cell), cellCoords(over));
      } else if (this.cellSelection()) {
        this.clearCellSelection();
      }
    };
    const up = () => {
      this.doc.removeEventListener('mousemove', move);
      this.doc.removeEventListener('mouseup', up);
      if (!this.cellSelecting()) return;
      this.cellSelecting.set(false);
      // drop the browser's text selection: the caret goes to the last selected cell
      const sel = this.cellSelection();
      const last = sel?.table.rows[sel.focus[0]]?.cells[sel.focus[1]];
      if (last) {
        const range = this.doc.createRange();
        range.selectNodeContents(last);
        range.collapse(false);
        this.doc.getSelection()?.removeAllRanges();
        this.doc.getSelection()?.addRange(range);
      }
    };
    this.doc.addEventListener('mousemove', move);
    this.doc.addEventListener('mouseup', up);
  }

  private setCellSelection(table: HTMLTableElement, anchor: [number, number], focus: [number, number]): void {
    this.cellSelection.set({ table, anchor, focus });
    this.tableScope.set('selection');
    this.updateCellOverlay();
  }

  private clearCellSelection(): void {
    if (!this.cellSelection()) return;
    this.cellSelection.set(null);
    this.cellOverlay.set(null);
    if (this.tableScope() === 'selection') this.tableScope.set('cell');
  }

  /** Selected rectangle as [first row, last row, first column, last column]. */
  private selectionRect(): [number, number, number, number] | null {
    const sel = this.cellSelection();
    if (!sel) return null;
    const [r1, r2] = [sel.anchor[0], sel.focus[0]].sort((a, b) => a - b);
    const [c1, c2] = [sel.anchor[1], sel.focus[1]].sort((a, b) => a - b);
    return [r1, r2, c1, c2];
  }

  /** Cells of the selected rectangle, in `table` (defaults to the selected table). */
  private selectedCells(table = this.cellSelection()?.table): HTMLTableCellElement[] {
    const rect = this.selectionRect();
    if (!rect || !table) return [];
    const [r1, r2, c1, c2] = rect;
    const cells: HTMLTableCellElement[] = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = table.rows[r]?.cells[c];
        if (cell) cells.push(cell);
      }
    }
    return cells;
  }

  private updateCellOverlay(): void {
    const cells = this.selectedCells();
    if (!cells.length) {
      this.cellOverlay.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const rects = cells.map((cell) => cell.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    this.cellOverlay.set({
      left: left - box.left,
      top: top - box.top,
      width: Math.max(...rects.map((r) => r.right)) - left,
      height: Math.max(...rects.map((r) => r.bottom)) - top,
    });
  }

  /** Toggles a formatting on every selected cell (on for all unless they all have it already). */
  private styleSelectedCells([prop, value]: [string, string]): void {
    const has = (cell: HTMLElement) => cell.style.getPropertyValue(prop).split(' ').includes(value);
    const toggle = prop !== 'text-align' && this.selectedCells().every(has);
    this.styleCells('selection', (cell) => {
      // text-decoration-line can hold both underline and line-through
      const tokens = prop === 'text-decoration-line' ? cell.style.getPropertyValue(prop).split(' ').filter(Boolean) : [];
      const next = toggle ? tokens.filter((t) => t !== value) : [...tokens.filter((t) => t !== value), value];
      if (next.length) cell.style.setProperty(prop, next.join(' '));
      else cell.style.removeProperty(prop);
    });
  }

  /** Double-click on a column border: back to automatic column widths. */
  protected onContentDblClick(event: MouseEvent): void {
    const target = this.resizeTarget(event);
    if (!target || !columnWidths(target.table)) return;
    event.preventDefault();
    this.rewriteTable(() => ({ widths: null }), target.table);
    this.syncFromEditor();
    this.updateActiveStates();
  }

  /**
   * Column border under the pointer: an outer edge of the table, or the inner border on the right
   * of column `col`.
   */
  private resizeTarget(
    event: MouseEvent,
  ): { table: HTMLTableElement; col: number; edge: 'left' | 'right' | 'inner' } | null {
    if (this.isDisabled()) return null;
    const cell = (event.target as Element).closest?.('td, th') as HTMLTableCellElement | null;
    if (!cell || !this.editable().nativeElement.contains(cell)) return null;
    const table = cell.closest('table')!;
    const outer = table.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const x = event.clientX;
    if (x >= outer.right - 5) return { table, col: -1, edge: 'right' };
    if (x <= outer.left + 5) return { table, col: 0, edge: 'left' };
    if (x >= rect.right - 5) return { table, col: cell.cellIndex, edge: 'inner' };
    if (x <= rect.left + 5 && cell.cellIndex > 0) return { table, col: cell.cellIndex - 1, edge: 'inner' };
    return null;
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
      // load the source now (the value effect may not have run yet), then emit its sanitized version
      this.editable().nativeElement.innerHTML = this.clean(this.value() ?? '');
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
    if (this.selectedImage() && !this.imageStillSelected()) this.selectedImage.set(null);
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
    this.updateCellOverlay();
    this.updateImageFrame();
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

  /** Opens a popup below its toolbar button (or closes it if already open). */
  private togglePalette(kind: RteColorKind | 'tableBorder'): void {
    const button = this.root().nativeElement.querySelector(`[data-command="${kind}"]`);
    if (this.palette()?.kind === kind || !button) {
      this.palette.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    this.palette.set({
      kind,
      top: rect.bottom - box.top + 4,
      left: Math.max(0, Math.min(rect.left - box.left, box.width - 212)),
    });
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
   * Edits the table holding the caret (or `table`): `mutate` changes a copy, which is written back
   * with `insertHTML` so the change can be undone. `mutate` may return the cell that gets the caret
   * as [row, column, keep the caret offset], `false` to delete the table, or `{ widths }` to set
   * the column widths (`null` for automatic widths).
   */
  private rewriteTable(
    mutate: (
      copy: HTMLTableElement,
      row: number,
      col: number,
    ) => [number, number, boolean] | false | { widths: number[] | null } | void,
    table?: HTMLTableElement,
  ): void {
    this.restoreSelection();
    let cell = this.closestCell();
    table ??= cell?.closest('table') ?? undefined;
    if (!table) return;
    if (cell?.closest('table') !== table) cell = null;
    const r = cell ? (cell.parentElement as HTMLTableRowElement).rowIndex : 0;
    const c = cell ? cell.cellIndex : 0;
    const sel = this.doc.getSelection()!;
    const range = sel.getRangeAt(0);
    const position = cell ? caretPosition(cell, range.startContainer, range.startOffset) : 0;
    const copy = table.cloneNode(true) as HTMLTableElement;

    const result = mutate(copy, r, c);
    if (result === false) {
      this.clearCellSelection();
      return this.replaceNode(table, '');
    }
    if (result && !Array.isArray(result)) setColumnWidths(copy, result.widths);
    const [targetRow, targetCol, keepCaret] = Array.isArray(result) ? result : [r, c, !!cell];
    for (const section of [copy.tHead, copy.tFoot, ...Array.from(copy.tBodies)]) {
      if (section && !section.rows.length) section.remove();
    }

    const parent = table.parentNode!;
    const index = Array.prototype.indexOf.call(parent.childNodes, table);
    this.internalEdit = true;
    this.replaceNode(table, copy.outerHTML);
    this.internalEdit = false;
    const next = parent.childNodes[index];
    if (next?.nodeName !== 'TABLE') return this.clearCellSelection();
    const cellSel = this.cellSelection();
    if (cellSel?.table === table) {
      this.cellSelection.set({ ...cellSel, table: next as HTMLTableElement });
      this.updateCellOverlay();
    }
    const rowEl = (next as HTMLTableElement).rows[targetRow];
    const cellEl = rowEl?.cells[Math.min(targetCol, rowEl.cells.length - 1)];
    if (cellEl) sel.collapse(...caretPoint(cellEl, keepCaret ? position : 0));
  }

  /** Row/column commands. */
  private editTable(command: RteCommand): void {
    this.clearCellSelection();
    this.rewriteTable((copy, r, c) => {
      const rows = Array.from(copy.rows);
      const widths = columnWidths(copy);
      switch (command) {
        case 'tableRowAbove':
        case 'tableRowBelow': {
          const tr = this.doc.createElement('tr');
          tr.append(...Array.from(rows[r].cells, (ref) => this.emptyCell(ref)));
          rows[r].insertAdjacentElement(command === 'tableRowAbove' ? 'beforebegin' : 'afterend', tr);
          return command === 'tableRowAbove' ? [r + 1, c, true] : undefined;
        }
        case 'tableColLeft':
        case 'tableColRight': {
          const left = command === 'tableColLeft';
          for (const tr of rows) {
            const ref = tr.cells[Math.min(c, tr.cells.length - 1)];
            ref?.insertAdjacentElement(left ? 'beforebegin' : 'afterend', this.emptyCell(ref));
          }
          // a fixed layout gets a new column as wide as the current one
          widths?.splice(left ? c : c + 1, 0, widths[Math.min(c, widths.length - 1)]);
          if (widths) setColumnWidths(copy, widths);
          return left ? [r, c + 1, true] : undefined;
        }
        case 'tableRowDelete':
          if (rows.length === 1) return false;
          rows[r].remove();
          return [Math.min(r, rows.length - 2), c, false];
        case 'tableColDelete':
          if (rows.every((tr) => tr.cells.length <= 1)) return false;
          for (const tr of rows) {
            tr.cells[c]?.remove();
            if (!tr.cells.length) tr.remove();
          }
          widths?.splice(c, 1);
          if (widths) setColumnWidths(copy, widths);
          return [r, c, false];
        default:
          return false; // tableDelete
      }
    });
  }

  /** Applies `apply` to the cell holding the caret, its row, its column or the whole table. */
  private styleCells(scope: RteTableScope | 'table', apply: (cell: HTMLTableCellElement) => void): void {
    if (scope === 'selection' && !this.cellSelection()) scope = 'cell';
    this.rewriteTable((copy, r, c) => {
      const rows = Array.from(copy.rows);
      const cells =
        scope === 'selection' ? this.selectedCells(copy)
        : scope === 'cell' ? [rows[r].cells[c]]
        : scope === 'row' ? Array.from(rows[r].cells)
        : scope === 'column' ? rows.map((tr) => tr.cells[c])
        : rows.flatMap((tr) => Array.from(tr.cells));
      for (const cell of cells) {
        if (!cell) continue;
        apply(cell);
        if (!cell.getAttribute('style')) cell.removeAttribute('style');
      }
    }, scope === 'selection' ? this.cellSelection()!.table : undefined);
  }

  /** New empty cell with the same tag and formatting (borders, colors) as `ref`. */
  private emptyCell(ref: HTMLTableCellElement): HTMLTableCellElement {
    const cell = this.doc.createElement(ref.localName as 'td' | 'th');
    const style = ref.getAttribute('style');
    if (style) cell.setAttribute('style', style);
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
    const blockOf = (node: Node | undefined) => {
      let n = node;
      while (n?.parentNode && n.parentNode !== el) n = n.parentNode;
      return n?.parentNode === el ? n : null;
    };
    // a boundary on the editable element itself points between two blocks
    const first = blockOf(range.startContainer === el ? el.childNodes[range.startOffset] : range.startContainer);
    const last = blockOf(range.endContainer === el ? el.childNodes[range.endOffset - 1] : range.endContainer);
    if (!first || !last) return false;
    const blocks: Node[] = [];
    for (let n: Node | null = first; n; n = n.nextSibling) {
      if (n.nodeType !== Node.TEXT_NODE || n.textContent!.trim()) blocks.push(n);
      if (n === last) break;
    }
    if (!blocks.every((b) => b.nodeName === 'P' || b.nodeName === 'DIV')) return false;

    // caret as a position in the new list: characters before it plus one per list item
    const index = Math.max(0, blocks.findIndex((b) => b.contains(range.startContainer)));
    const inBlock = this.doc.createRange();
    inBlock.setStart(blocks[index], 0);
    if (blocks[index].contains(range.startContainer)) inBlock.setEnd(range.startContainer, range.startOffset);
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
