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
  contentChildren,
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
import { AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
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
  RteHideable,
  RteToolbarItem,
} from './toolbar';
import { RteIconContext, RteIconDirective } from './icon.directive';
import { RteComment, RteCommentReply, RteUser, commentId, userColor } from './comments';

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

/** Default height of the floating table bar, used to place it before it is rendered. */
const TABLE_BAR_HEIGHT = 38;

/**
 * What a color applies to.
 *
 * | Kind              | Colors                        | Produces                                  |
 * | ----------------- | ----------------------------- | ----------------------------------------- |
 * | `textColor`       | the selected text             | `<span style="color: …">`                 |
 * | `backgroundColor` | the selected text (highlight) | `<span style="background-color: …">`      |
 * | `tableTextColor`  | table cells (text)            | `<td style="color: …">`                   |
 * | `tableBackground` | table cells (background)      | `<td style="background-color: …">`        |
 *
 * While table cells are selected, `textColor` / `backgroundColor` color the selected cells.
 *
 * @see {@link RichTextEditorComponent.setColor}
 * @see {@link RteTableScope} for the cells colored by the table kinds
 * @since 0.2.0
 */
export type RteColorKind = 'textColor' | 'backgroundColor' | 'tableTextColor' | 'tableBackground';

/**
 * Cells affected by a table color (`tableTextColor` / `tableBackground`).
 *
 * - `selection`: the rectangle of selected cells (drag or Shift+click); falls back to `cell` when
 *   no cells are selected;
 * - `cell`: the cell holding the caret;
 * - `row`: every cell of the caret's row;
 * - `column`: every cell of the caret's column.
 *
 * @example
 * ```ts
 * editor.setColor('tableBackground', '#fff3bf', 'row');
 * ```
 * @see {@link RichTextEditorComponent.setColor}
 * @since 0.2.0
 */
export type RteTableScope = 'selection' | 'cell' | 'row' | 'column';

const COLOR_KINDS: ReadonlySet<RteCommand> = new Set<RteCommand>([
  'textColor', 'backgroundColor', 'tableTextColor', 'tableBackground',
]);

/**
 * Table borders to change with {@link RichTextEditorComponent.setTableBorder}: the outer edges of
 * the selected cells (or of the whole table when no cells are selected) and the lines between them.
 * `true` changes the side, `false` leaves it as it is.
 *
 * @example
 * ```ts
 * // outer frame only
 * editor.setTableBorder(2, { sides: { top: true, bottom: true, left: true, right: true, inner: false } });
 * ```
 * @since 0.2.0
 */
export interface RteBorderSides {
  /**
   * Top edge of the selected cells (or of the table). The cells above share this line and get the
   * same border.
   */
  top: boolean;
  /** Bottom edge of the selected cells (or of the table); shared with the cells below. */
  bottom: boolean;
  /** Left edge of the selected cells (or of the table); shared with the cells on the left. */
  left: boolean;
  /** Right edge of the selected cells (or of the table); shared with the cells on the right. */
  right: boolean;
  /** Horizontal and vertical lines between the selected cells (or between all the cells). */
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

/** Width of the comment bubble (px). */
const COMMENT_BUBBLE_WIDTH = 300;

/** Size of the "open link" button (px). */
const LINK_BUBBLE_SIZE = 20;

/** Narrowest width an image can be resized to (px). */
const MIN_IMAGE_WIDTH = 16;

/**
 * Resize handles shown on the corners of a clicked image: `nw` (top left), `ne` (top right), `sw`
 * (bottom left) and `se` (bottom right). Each one resizes the image proportionally; the handle is
 * rendered as `.nrte__image-handle[data-corner="…"]` for styling.
 *
 * @since 0.3.0
 */
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

/** Names of the CSS highlights of the comments (`::highlight(nrte-comment)`). */
const COMMENT_HIGHLIGHT = 'nrte-comment';
const COMMENT_HIGHLIGHT_ACTIVE = 'nrte-comment-active';

/** The parts of the CSS Custom Highlight API used here (not in every TypeScript `lib`). */
interface HighlightLike {
  add(range: Range): unknown;
  delete(range: Range): boolean;
}
interface HighlightApi {
  CSS?: { highlights?: { get(name: string): HighlightLike | undefined; set(name: string, highlight: HighlightLike): unknown } };
  Highlight?: new () => HighlightLike;
}

/** The browser supports the CSS Custom Highlight API. */
function hasHighlightApi(): boolean {
  const api = globalThis as unknown as HighlightApi;
  return !!api.CSS?.highlights && typeof api.Highlight === 'function';
}

/** Shared highlight of the page (the registry is global: every editor adds its own ranges). */
function sharedHighlight(name: string): HighlightLike | null {
  const api = globalThis as unknown as HighlightApi;
  if (!hasHighlightApi()) return null;
  let highlight = api.CSS!.highlights!.get(name);
  if (!highlight) {
    highlight = new api.Highlight!();
    api.CSS!.highlights!.set(name, highlight);
  }
  return highlight;
}

/** Selector of the marks of a comment. */
function commentSelector(id: string): string {
  return `span[data-comment="${CSS.escape(id)}"]`;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

/** Ctrl (Windows / Linux) or Option (macOS) held while dropping: copy instead of move. */
function isCopyDrop(event: DragEvent): boolean {
  return event.ctrlKey || event.altKey;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Lightweight rich text editor (standalone, signals, `OnPush`, zoneless-friendly) that takes HTML
 * as input and emits HTML.
 *
 * **Binding** — pick one:
 * - two-way binding `[(value)]` (or `[value]` + `(valueChange)`);
 * - `ngModel`, `[formControl]` or `formControlName` (the editor is a `ControlValueAccessor`);
 * - {@link control | [control]}: a form control bound directly, without the forms directives.
 *
 * **Safety** — the incoming value, pasted HTML and {@link insertHtml} are sanitized with
 * {@link sanitizeHtml} (allow-list: no `<script>`, no `on*` handlers, no `javascript:` URLs).
 *
 * **Customization** — {@link toolbar} / {@link tableToolbar} choose the buttons, {@link hide} turns
 * off commands and features, {@link RteIconDirective | rteIcon} templates replace icons, CSS
 * variables (`--nrte-accent`, `--nrte-btn-size`, `--nrte-icon-size`…) set the theme, and
 * {@link labels} translates the texts ({@link RTE_LABELS_FR} included).
 *
 * **Comments** — {@link comments | [(comments)]} and {@link currentUser} let users comment parts of
 * the text, answer in threads and resolve them; the comments are stored apart from the HTML.
 *
 * @example
 * ```html
 * <!-- two-way binding -->
 * <ngx-rich-text-editor [(value)]="html" placeholder="Write something…" />
 *
 * <!-- reactive forms, French texts, smaller toolbar -->
 * <ngx-rich-text-editor formControlName="body" [labels]="fr" [hide]="['table', 'source']" />
 * ```
 * @example
 * ```ts
 * // public methods
 * editor = viewChild.required(RichTextEditorComponent);
 * this.editor().insertHtml('<p>Signature</p>');
 * ```
 * @since 0.1.0
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
   * HTML content of the editor (signal `model`).
   *
   * - Supports two-way binding: `[(value)]="html"`, or `[value]` + `(valueChange)`.
   * - The incoming HTML is sanitized before it is shown (unless {@link sanitize} is `false`); the
   *   emitted HTML is the editor's content, so it may differ slightly from what was given (e.g.
   *   dropped `<script>`, normalized attributes).
   * - Emits on every edit; an empty editor (no text, image, line or table) emits `''`.
   *
   * @default ''
   * @example
   * ```html
   * <ngx-rich-text-editor [(value)]="html" />
   * <ngx-rich-text-editor [value]="initialHtml" (valueChange)="save($event)" />
   * ```
   * @see {@link control} and the forms directives for form integration
   * @since 0.1.0
   */
  readonly value = model<string>('');
  /**
   * Text shown in grey while the editor is empty (rendered with CSS, never part of the value).
   *
   * @default ''
   * @example
   * ```html
   * <ngx-rich-text-editor placeholder="Write your message…" />
   * ```
   * @since 0.1.0
   */
  readonly placeholder = input<string>('');
  /**
   * Buttons of the main toolbar, in order. Use `'|'` for a separator.
   *
   * To keep the default layout and only drop a few buttons, use {@link hide} instead: it also
   * removes the separators left alone.
   *
   * @default RTE_DEFAULT_TOOLBAR
   * @example
   * ```html
   * <ngx-rich-text-editor [toolbar]="['bold', 'italic', 'underline', '|', 'unorderedList', 'orderedList', '|', 'link', 'image']" />
   * ```
   * @see {@link RTE_DEFAULT_TOOLBAR} for the default layout
   * @see {@link RteCommand} for every available command
   * @since 0.1.0
   */
  readonly toolbar = input<readonly RteToolbarItem[]>(RTE_DEFAULT_TOOLBAR);
  /**
   * Buttons of the floating bar shown above a table while the caret is in it. Use `'|'` for a
   * separator; `[]` hides the bar (same as `hide: ['tableToolbar']`).
   *
   * @default RTE_TABLE_TOOLBAR
   * @example
   * ```html
   * <!-- rows and columns only, no formatting -->
   * <ngx-rich-text-editor [tableToolbar]="['tableRowAbove', 'tableRowBelow', 'tableRowDelete', '|', 'tableColLeft', 'tableColRight', 'tableColDelete']" />
   * ```
   * @see {@link RTE_TABLE_TOOLBAR}
   * @since 0.4.0
   */
  readonly tableToolbar = input<readonly RteToolbarItem[]>(RTE_TABLE_TOOLBAR);
  /**
   * Commands and features to turn off.
   *
   * **Commands** ({@link RteCommand}): the button disappears from the main toolbar and the table
   * bar (separators left alone are removed), its keyboard shortcut (<kbd>Ctrl/⌘+B</kbd>, `I`, `U`,
   * `K`) and {@link execute} are ignored. Hiding `image` also blocks dropped / pasted image files.
   *
   * **Features** ({@link RteFeature}):
   *
   * | Feature         | Turns off                                                  |
   * | --------------- | ---------------------------------------------------------- |
   * | `imageResize`   | resize handles on a clicked image                          |
   * | `imageMove`     | moving an image by dragging it                             |
   * | `imageDrop`     | inserting dropped / pasted image files                     |
   * | `columnResize`  | resizing table columns from their borders                  |
   * | `cellSelection` | selecting table cells (drag, Shift+click)                  |
   * | `linkOpen`      | "open link" button and <kbd>Ctrl/⌘ + click</kbd> on links  |
   * | `tableToolbar`  | the floating table bar                                     |
   *
   * The list can change at any time (e.g. bound to a signal).
   *
   * @default []
   * @example
   * ```html
   * <ngx-rich-text-editor [(value)]="html" [hide]="['image', 'table', 'source', 'columnResize']" />
   * ```
   * @see {@link RteHideable}
   * @since 0.4.0
   */
  readonly hide = input<readonly RteHideable[]>([]);
  /**
   * Hides the main toolbar entirely. Keyboard shortcuts, the table bar and the public methods
   * still work, so you can drive the editor from your own buttons with {@link execute}.
   *
   * @default false
   * @example
   * ```html
   * <ngx-rich-text-editor hideToolbar #ed />
   * <button (click)="ed.execute('bold')">Bold</button>
   * ```
   * @since 0.1.0
   */
  readonly hideToolbar = input(false, { transform: booleanAttribute });
  /**
   * Read-only mode: the content can't be edited, the toolbar buttons are disabled and links behave
   * as normal links. Also turned on while the bound form control is disabled (forms directives or
   * {@link control}).
   *
   * @default false
   * @example
   * ```html
   * <ngx-rich-text-editor [value]="article.body" readonly />
   * ```
   * @since 0.1.0
   */
  readonly readonly = input(false, { transform: booleanAttribute });
  /**
   * Texts of the editor: button tooltips and popup texts, merged over
   * {@link RTE_DEFAULT_LABELS} (English). Only the keys you give are replaced.
   *
   * @default {}
   * @example
   * ```ts
   * import { RTE_LABELS_FR } from '@biliboobrian/ngx-rich-text-editor';
   * fr = RTE_LABELS_FR;                       // French, included
   * de = { bold: 'Fett', italic: 'Kursiv' };  // or your own texts
   * ```
   * ```html
   * <ngx-rich-text-editor [labels]="fr" />
   * ```
   * @see {@link RteLabelKey} for every key
   * @since 0.1.0
   */
  readonly labels = input<Partial<Record<RteLabelKey, string>>>({});
  /**
   * Swatches of the text color palettes (`textColor`, `tableTextColor`) and of the borders popup.
   * Any CSS color; shown 6 per row, plus "none" and a custom color picker.
   *
   * @default RTE_TEXT_COLORS
   * @example
   * ```html
   * <ngx-rich-text-editor [textColors]="['#000000', '#c92a2a', '#1864ab', '#2b8a3e']" />
   * ```
   * @see {@link RTE_TEXT_COLORS}
   * @since 0.2.0
   */
  readonly textColors = input<readonly string[]>(RTE_TEXT_COLORS);
  /**
   * Swatches of the background color palettes (`backgroundColor`, `tableBackground`). Any CSS
   * color; shown 6 per row, plus "none" and a custom color picker.
   *
   * @default RTE_BACKGROUND_COLORS
   * @example
   * ```html
   * <ngx-rich-text-editor [backgroundColors]="['#fff3bf', '#d3f9d8', '#ffe3e3']" />
   * ```
   * @see {@link RTE_BACKGROUND_COLORS}
   * @since 0.2.0
   */
  readonly backgroundColors = input<readonly string[]>(RTE_BACKGROUND_COLORS);
  /**
   * Sanitizes the incoming value, pasted HTML and {@link insertHtml} with {@link sanitizeHtml}.
   *
   * **Strongly recommended**: turn it off only for fully trusted content, the editor would
   * otherwise run any script or event handler found in the HTML.
   *
   * @default true
   * @see {@link sanitizeOptions} to keep more tags, attributes or styles instead of turning it off
   * @since 0.1.0
   */
  readonly sanitize = input(true, { transform: booleanAttribute });
  /**
   * Options of the sanitizer: extra tags, attributes or CSS properties to keep, keep `class`
   * attributes. Dangerous content (scripts, event handlers, `javascript:` URLs) is always removed.
   *
   * @default {}
   * @example
   * ```html
   * <ngx-rich-text-editor [sanitizeOptions]="{ allowedStyles: ['font-size'], allowedAttributes: ['data-id'], keepClasses: true }" />
   * ```
   * @see {@link RteSanitizeOptions}
   * @since 0.1.0
   */
  readonly sanitizeOptions = input<RteSanitizeOptions>({});
  /**
   * Pastes clipboard content as plain text, dropping its formatting (fonts, colors, tables…).
   * Pasted image files are still inserted (see {@link imageUpload}).
   *
   * @default false
   * @since 0.1.0
   */
  readonly pastePlainText = input(false, { transform: booleanAttribute });
  /**
   * Links inserted with the `link` button open in a new tab: they get
   * `target="_blank" rel="noopener noreferrer"`.
   *
   * @default false
   * @since 0.1.0
   */
  readonly linkTargetBlank = input(false, { transform: booleanAttribute });
  /**
   * Asks the user for a URL: for the `link` button, and for the `image` button with
   * `imageSource="url"`. Plug your own dialog here; it may return a Promise.
   *
   * Return `null` / `undefined` to cancel; for a link, `''` removes it. Unsafe URLs
   * (`javascript:`…) are ignored.
   *
   * @default a `window.prompt` asking "URL du lien / Link URL"
   * @example
   * ```ts
   * askUrl: RtePromptFn = (kind, current) =>
   *   firstValueFrom(this.dialog.open(UrlDialog, { data: { kind, current } }).afterClosed());
   * ```
   * ```html
   * <ngx-rich-text-editor [promptFn]="askUrl" />
   * ```
   * @see {@link RtePromptFn}
   * @since 0.1.0
   */
  readonly promptFn = input<RtePromptFn>(defaultPrompt);
  /**
   * Turns image files into the `src` of the inserted images: files picked with the `image` button,
   * dropped from the desktop or pasted from the clipboard. Return the URL to use (e.g. after an
   * upload to your server); throw or reject to skip a file. Unsafe URLs are ignored.
   *
   * @default embeds the image in base64 (`data:image/…;base64,…` URL)
   * @example
   * ```ts
   * upload: RteImageUploadFn = async (file) => {
   *   const body = new FormData();
   *   body.append('file', file);
   *   const res = await fetch('/api/images', { method: 'POST', body });
   *   return (await res.json()).url;
   * };
   * ```
   * ```html
   * <ngx-rich-text-editor [imageUpload]="upload" />
   * ```
   * @see {@link RteImageUploadFn}
   * @since 0.2.0
   */
  readonly imageUpload = input<RteImageUploadFn>(readAsDataUrl);
  /**
   * What the `image` button asks for:
   * - `'file'`: opens the file picker; the chosen images (png, jpeg, gif, webp, bmp, several at
   *   once) are inserted at the caret, in base64 unless {@link imageUpload} says otherwise;
   * - `'url'`: asks for an image URL through {@link promptFn}.
   *
   * @default 'file'
   * @example
   * ```html
   * <ngx-rich-text-editor imageSource="url" />
   * ```
   * @since 0.4.0
   */
  readonly imageSource = input<'file' | 'url'>('file');
  /**
   * Minimum height of the editable area, any CSS length (`px`, `rem`, `vh`…).
   *
   * @default '160px'
   * @example
   * ```html
   * <ngx-rich-text-editor minHeight="300px" />
   * ```
   * @since 0.1.0
   */
  readonly minHeight = input<string>('160px');
  /**
   * Maximum height of the editable area, any CSS length; beyond it the content scrolls (the
   * toolbar stays visible). `null`: the editor grows with its content.
   *
   * @default null
   * @example
   * ```html
   * <ngx-rich-text-editor maxHeight="60vh" />
   * ```
   * @since 0.1.0
   */
  readonly maxHeight = input<string | null>(null);
  /**
   * Accessible name (`aria-label`) of the editable area, read by screen readers. Set it when the
   * page has several editors or no visible label.
   *
   * @default 'Rich text editor'
   * @example
   * ```html
   * <ngx-rich-text-editor ariaLabel="Message body" />
   * ```
   * @since 0.1.0
   */
  readonly ariaLabel = input<string>('Rich text editor');
  /**
   * Form control bound directly, without importing `ReactiveFormsModule`. Accepts any
   * `AbstractControl` (`FormControl<string>`, `FormControl<string | null>`…).
   *
   * - the editor shows the control's value and follows its later `setValue` / `patchValue`
   *   (`null` shows an empty editor);
   * - edits update the control and mark it **dirty**; leaving the editor marks it **touched**;
   * - a **disabled** control makes the editor read-only;
   * - binding another control (or `null`) unsubscribes from the previous one.
   *
   * Use it **instead of** `[formControl]` / `formControlName` / `ngModel`, not together.
   *
   * @default null
   * @example
   * ```html
   * <ngx-rich-text-editor [control]="form.controls.body" />
   * ```
   * @since 0.4.0
   */
  readonly control = input<AbstractControl<string | null | undefined> | null>(null);
  /**
   * Comments on parts of the text, with their threads of replies (signal `model`). Supports
   * two-way binding: `[(comments)]="comments"`.
   *
   * The commented text is marked in the HTML with `<span data-comment="{id}">`; the comments
   * themselves only live in this array, so store it next to the HTML (and publish the HTML
   * without them). Comments whose text was deleted stay here: the panel shows them as
   * "text deleted".
   *
   * Adding, replying, resolving and deleting update this array; you can also change it from your
   * code (e.g. comments loaded from a server or added by other users).
   *
   * @default []
   * @example
   * ```html
   * <ngx-rich-text-editor [(value)]="html" [(comments)]="comments" [currentUser]="me" />
   * ```
   * @see {@link RteComment}
   * @see {@link currentUser} — needed to comment
   * @since 0.5.0
   */
  readonly comments = model<readonly RteComment[]>([]);
  /**
   * User writing the comments and replies. Comments are read-only without it (no new comment,
   * reply, resolve or delete). When set, the `comment` and `commentsPanel` buttons are added at the
   * end of the main toolbar (unless the `toolbar` already has them or they are hidden).
   *
   * Users may delete their own comments and replies.
   *
   * @default null
   * @example
   * ```html
   * <ngx-rich-text-editor [(comments)]="comments" [currentUser]="{ id: user.id, name: user.name }" />
   * ```
   * @see {@link RteUser}
   * @since 0.5.0
   */
  readonly currentUser = input<RteUser | null>(null);
  /**
   * Shows the side panel listing the comments in document order (signal `model`, also toggled by
   * the `commentsPanel` button). With the panel open, the thread of the comment under the caret
   * opens in its card instead of a bubble.
   *
   * @default false
   * @example
   * ```html
   * <ngx-rich-text-editor [(comments)]="comments" [currentUser]="me" [(commentsPanel)]="showComments" />
   * ```
   * @since 0.5.0
   */
  readonly commentsPanel = model(false);

  /**
   * Emitted when the editable area gains focus.
   *
   * @example
   * ```html
   * <ngx-rich-text-editor (editorFocus)="editing = true" (editorBlur)="editing = false" />
   * ```
   * @since 0.1.0
   */
  readonly editorFocus = output<void>();
  /**
   * Emitted when the editable area (or the HTML source textarea) loses focus. Clicking the toolbar
   * doesn't blur the editor.
   *
   * @since 0.1.0
   */
  readonly editorBlur = output<void>();

  protected readonly root = viewChild.required<ElementRef<HTMLDivElement>>('root');
  protected readonly editable = viewChild.required<ElementRef<HTMLDivElement>>('editable');
  protected readonly sourceArea = viewChild<ElementRef<HTMLTextAreaElement>>('sourceArea');
  private readonly imagePicker = viewChild.required<ElementRef<HTMLInputElement>>('imagePicker');
  /** Image types the file picker offers: the ones the sanitizer keeps as base64. */
  protected readonly imageAccept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp';

  protected readonly focused = signal(false);
  protected readonly sourceMode = signal(false);
  protected readonly active = signal<Partial<Record<RteCommand, boolean>>>({});
  /** Position of the floating table bar, or null when the caret isn't in a table. */
  protected readonly tableBar = signal<{ top: number; left: number } | null>(null);
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
  /** Button opening the link that holds the caret, placed at the end of the link. */
  protected readonly linkBubble = signal<{ href: string; top: number; left: number } | null>(null);
  /** Pointer over a link with Ctrl / ⌘ held. */
  protected readonly linkHover = signal(false);
  /** Comment whose thread is open (bubble or panel card); its text gets the active highlight. */
  protected readonly activeComment = signal<string | null>(null);
  /** The new comment form is open (for `pendingRange`). */
  protected readonly newComment = signal(false);
  /** Position of the comment bubble (new comment form, or thread of `activeComment`). */
  protected readonly commentBubble = signal<{ top: number; left: number; id: string | null } | null>(null);
  /** The panel also lists the resolved threads. */
  protected readonly showResolved = signal(false);
  /** Changes whenever the editable content is rewritten (the comment marks may have moved). */
  private readonly contentVersion = signal(0);
  /** Text the new comment will mark. */
  private pendingRange: Range | null = null;
  /** Ranges this editor added to the shared comment highlights. */
  private highlightRanges: Record<string, Range[]> = { [COMMENT_HIGHLIGHT]: [], [COMMENT_HIGHLIGHT_ACTIVE]: [] };
  /** Without the CSS Custom Highlight API, every comment mark is highlighted with plain CSS. */
  protected readonly highlightApi = hasHighlightApi();
  /** Comments are on (not turned off with `hide: ['comment']`). */
  protected readonly commentsEnabled = computed(() => !this.hidden().has('comment'));
  /** The current user can add, answer, resolve and delete comments. */
  protected readonly canComment = computed(
    () => this.commentsEnabled() && !!this.currentUser() && !this.isDisabled() && !this.sourceMode(),
  );
  /** Threads listed in the panel, in document order (comments without text last). */
  protected readonly panelThreads = computed(() => {
    this.contentVersion();
    const spans = this.isBrowser
      ? Array.from(this.editable().nativeElement.querySelectorAll<HTMLElement>('span[data-comment]'))
      : [];
    const order = new Map<string, number>();
    const quotes = new Map<string, string>();
    spans.forEach((span, index) => {
      const id = span.dataset['comment']!;
      if (!order.has(id)) order.set(id, index);
      quotes.set(id, (quotes.get(id) ?? '') + (span.textContent ?? ''));
    });
    return this.comments()
      .filter((comment) => this.showResolved() || !comment.resolved)
      .map((comment) => ({ comment, quote: quotes.get(comment.id)?.trim() || null, order: order.get(comment.id) ?? Infinity }))
      .sort((a, b) => a.order - b.order);
  });
  protected readonly openComments = computed(() => this.comments().filter((c) => !c.resolved).length);
  /** Vertical guide shown while a column border is dragged. */
  protected readonly colGuide = signal<{ left: number; top: number; height: number } | null>(null);
  /** Image selected by a click, shown with resize handles. */
  private readonly selectedImage = signal<HTMLImageElement | null>(null);
  /** Frame drawn around the selected image; `label` shows the size while resizing. */
  protected readonly imageFrame = signal<{ top: number; left: number; width: number; height: number; label?: string } | null>(null);
  protected readonly imageCorners: readonly RteImageCorner[] = ['nw', 'ne', 'sw', 'se'];
  private readonly formDisabled = signal(false);
  /** Commands and features turned off by the `hide` input. */
  private readonly hidden = computed(() => new Set<RteHideable>(this.hide()));
  /** Main toolbar without the hidden commands. */
  protected readonly mainItems = computed(() => {
    const items = [...this.toolbar()];
    // comment buttons come with a current user (or with comments to read)
    if (this.commentsEnabled() && (this.currentUser() || this.comments().length)) {
      const extra = (this.currentUser() ? (['comment', 'commentsPanel'] as const) : (['commentsPanel'] as const))
        .filter((command) => !items.includes(command));
      if (extra.length) items.push('|', ...extra);
    }
    return this.visibleItems(items);
  });
  /** Table bar without the hidden commands (empty when the bar is hidden). */
  protected readonly tableItems = computed(() =>
    this.hidden().has('tableToolbar') ? [] : this.visibleItems(this.tableToolbar()),
  );
  /** Custom icons given with `<ng-template rteIcon="…">`. */
  private readonly iconDirectives = contentChildren(RteIconDirective);
  protected readonly iconTemplates = computed(
    () => new Map(this.iconDirectives().map((icon) => [icon.rteIcon(), icon.template] as const)),
  );
  /** Disabled state of the `control` input. */
  private readonly controlDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.readonly() || this.formDisabled() || this.controlDisabled());
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
  /** Caret position when the file picker was opened. */
  private pickerRange: Range | null = null;
  /** Image of the editor being dragged (dropping it in the editor moves it). */
  private draggedImage: HTMLImageElement | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // `control` input: follow its value and disabled state (each change of the input resubscribes).
    effect((onCleanup) => {
      const control = this.control();
      if (!control) {
        this.controlDisabled.set(false);
        return;
      }
      const sync = () => {
        this.value.set(control.value ?? '');
        this.controlDisabled.set(control.disabled);
      };
      sync();
      const subscriptions = [control.valueChanges.subscribe(sync), control.statusChanges.subscribe(sync)];
      onCleanup(() => subscriptions.forEach((s) => s.unsubscribe()));
    });

    // Push external value changes into the editable element.
    effect(() => {
      const html = this.value() ?? '';
      const el = this.editable().nativeElement;
      if (!this.isBrowser || html === this.lastHtml) return;
      this.lastHtml = html;
      el.innerHTML = this.clean(html);
      this.selectedImage.set(null);
      this.imageFrame.set(null);
      this.cancelComment();
      this.contentVersion.update((v) => v + 1);
    });

    // Comment highlights follow the content, the comments and the open thread.
    effect(() => {
      this.contentVersion();
      this.comments();
      this.activeComment();
      this.commentsEnabled();
      if (this.isBrowser) this.updateCommentHighlights();
    });
    // The bubble follows the open thread / new comment and the panel.
    effect(() => {
      this.activeComment();
      this.newComment();
      this.commentsPanel();
      this.contentVersion();
      if (this.isBrowser) this.updateCommentBubble();
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
        if (!this.root().nativeElement.contains(target)) {
          this.clearCellSelection();
          this.closeComments();
        }
      };
      this.doc.addEventListener('mousedown', onMouseDown);
      this.destroyRef.onDestroy(() => {
        this.doc.removeEventListener('selectionchange', onSelectionChange);
        this.doc.removeEventListener('mousedown', onMouseDown);
        this.setHighlightRanges(COMMENT_HIGHLIGHT, []);
        this.setHighlightRanges(COMMENT_HIGHLIGHT_ACTIVE, []);
      });
    });
  }

  // ---------------------------------------------------------------- public API

  /**
   * Focuses the editable area so the user can type right away (e.g. when a form opens).
   *
   * @example
   * ```ts
   * editor = viewChild.required(RichTextEditorComponent);
   * ngAfterViewInit() { this.editor().focus(); }
   * ```
   * @since 0.1.0
   */
  focus(): void {
    this.editable().nativeElement.focus();
  }

  /**
   * Returns the current HTML, the same as reading {@link value}.
   *
   * @returns the HTML of the editor, `''` when it is empty
   * @example
   * ```ts
   * const html = this.editor().getHtml();
   * ```
   * @since 0.1.0
   */
  getHtml(): string {
    return this.value() ?? '';
  }

  /**
   * Inserts HTML at the caret position, replacing the selected content; at the end of the content
   * if the editor never had the focus. The HTML is sanitized unless {@link sanitize} is off, and
   * the insertion can be undone (<kbd>Ctrl/⌘+Z</kbd>).
   *
   * @param html - the HTML to insert
   * @example
   * ```ts
   * this.editor().insertHtml('<p>Best regards,<br><b>The team</b></p>');
   * ```
   * @since 0.1.0
   */
  insertHtml(html: string): void {
    this.restoreSelection();
    this.doc.execCommand('insertHTML', false, this.clean(html));
    this.syncFromEditor();
  }

  /**
   * Applies a color, as the palettes do; `null` removes it.
   *
   * - `textColor` / `backgroundColor` color the selected text (`<span style="…">`); while table
   *   cells are selected they color the selected cells instead;
   * - `tableTextColor` / `tableBackground` color cells of the table holding the caret, chosen by
   *   `scope` (does nothing outside a table).
   *
   * The color becomes the one shown under the toolbar button. Ignored in read-only mode and in the
   * HTML source view. The change can be undone.
   *
   * @param kind - what to color, see {@link RteColorKind}
   * @param color - any CSS color (`'#c92a2a'`, `'rgb(…)'`, `'red'`…), or `null` to remove the color
   * @param scope - cells colored by the table kinds, see {@link RteTableScope}; defaults to the
   *   scope last chosen in the palette (`'cell'` at first)
   * @example
   * ```ts
   * this.editor().setColor('textColor', '#c92a2a');          // red text
   * this.editor().setColor('backgroundColor', null);         // remove the highlight
   * this.editor().setColor('tableBackground', '#fff3bf', 'row');
   * ```
   * @since 0.2.0
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
   * Sets table borders, as the borders popup does: on the chosen sides of the selected cells, or
   * of the whole table holding the caret. Written as `border-*` styles on the cells (neighbouring
   * cells sharing a line get the same border), so the HTML renders the same outside the editor.
   * Does nothing outside a table, in read-only mode or in the HTML source view. Can be undone.
   *
   * @param width - line width in px; `0` hides the lines (`border-*: hidden`)
   * @param options - optional color and sides
   * @param options.color - any CSS color; defaults to the theme border color (`--nrte-border`)
   * @param options.sides - sides to change, see {@link RteBorderSides}; omitted sides default to
   *   `true`
   * @example
   * ```ts
   * this.editor().setTableBorder(1);                          // every line, 1px, theme color
   * this.editor().setTableBorder(0, { sides: { inner: false } }); // no outer frame
   * // bottom line only, 2px red
   * this.editor().setTableBorder(2, {
   *   color: '#c92a2a',
   *   sides: { top: false, left: false, right: false, inner: false },
   * });
   * ```
   * @since 0.2.0
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
   * Runs a command, as if its toolbar button was clicked (the button doesn't need to be in the
   * toolbar).
   *
   * - toggles (`bold`, `h2`, `unorderedList`…) switch on or off for the selection;
   * - `textColor`, `backgroundColor`, `tableTextColor`, `tableBackground` and `tableBorder` open or
   *   close their popup;
   * - `link` asks for the URL through {@link promptFn}; `image` opens the file picker (or asks for a
   *   URL with `imageSource="url"`);
   * - table commands act on the table holding the caret;
   * - `source` switches the HTML source view.
   *
   * Ignored in read-only mode, for commands turned off with {@link hide}, and (except `source`) in
   * the HTML source view.
   *
   * @param command - the command to run, see {@link RteCommand}
   * @returns a Promise resolved once the command is applied (after the URL prompt for `link`)
   * @example
   * ```ts
   * await this.editor().execute('bold');
   * await this.editor().execute('tableRowBelow');
   * ```
   * @since 0.1.0
   */
  async execute(command: RteCommand): Promise<void> {
    if (this.isDisabled() || this.isHidden(command)) return;
    if (command === 'source') {
      this.toggleSource();
      return;
    }
    if (this.sourceMode()) return;
    if (command === 'comment') {
      this.startComment();
      return;
    }
    if (command === 'commentsPanel') {
      this.commentsPanel.update((open) => !open);
      return;
    }
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

  /**
   * Comments the selected text, as the `comment` button does once the text is typed: marks the
   * selection and adds the comment to {@link comments}. Needs a {@link currentUser}, an editable
   * editor and a non-empty selection in it. Marking the text can be undone.
   *
   * @param text - plain text of the comment
   * @returns the new comment, or `null` when nothing could be commented
   * @example
   * ```ts
   * const comment = this.editor().addComment('To be checked');
   * ```
   * @since 0.5.0
   */
  addComment(text: string): RteComment | null {
    if (!this.canComment() || !text.trim()) return null;
    this.restoreSelection();
    const sel = this.doc.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return null;
    return this.createComment(sel.getRangeAt(0).cloneRange(), text);
  }

  /**
   * Adds a reply to the thread of a comment, written by {@link currentUser}.
   *
   * @param id - the comment to answer
   * @param text - plain text of the reply
   * @returns the reply, or `null` (no current user, read-only, unknown comment or empty text)
   * @since 0.5.0
   */
  replyToComment(id: string, text: string): RteCommentReply | null {
    const user = this.currentUser();
    if (!this.canComment() || !user || !text.trim() || !this.comments().some((c) => c.id === id)) return null;
    const reply: RteCommentReply = { id: commentId(), author: { ...user }, date: new Date().toISOString(), text: text.trim() };
    this.comments.update((list) => list.map((c) => (c.id === id ? { ...c, replies: [...c.replies, reply] } : c)));
    return reply;
  }

  /**
   * Resolves a thread (its text is no longer highlighted) or reopens it.
   *
   * @param id - the comment
   * @param resolved - `true` to resolve, `false` to reopen
   * @since 0.5.0
   */
  resolveComment(id: string, resolved = true): void {
    if (!this.canComment()) return;
    this.comments.update((list) => list.map((c) => (c.id === id ? { ...c, resolved } : c)));
    if (resolved && this.activeComment() === id && !this.commentsPanel()) this.activeComment.set(null);
  }

  /**
   * Deletes a comment and its replies, and removes its marks from the text (the text itself is
   * kept). Removing the marks can be undone; the comment can't.
   *
   * @param id - the comment
   * @since 0.5.0
   */
  deleteComment(id: string): void {
    if (!this.canComment()) return;
    const spans = Array.from(this.editable().nativeElement.querySelectorAll(commentSelector(id)));
    if (spans.length) {
      this.rewriteBlocks(this.topBlock(spans[0]), this.topBlock(spans[spans.length - 1]), (_, wrapper) => {
        for (const span of Array.from(wrapper.querySelectorAll(commentSelector(id)))) span.replaceWith(...Array.from(span.childNodes));
      });
      this.syncFromEditor();
    }
    if (this.activeComment() === id) this.activeComment.set(null);
    this.comments.update((list) => list.filter((c) => c.id !== id));
  }

  /**
   * Deletes a reply of a thread.
   *
   * @param id - the comment
   * @param replyId - the reply to delete
   * @since 0.5.0
   */
  deleteReply(id: string, replyId: string): void {
    if (!this.canComment()) return;
    this.comments.update((list) =>
      list.map((c) => (c.id === id ? { ...c, replies: c.replies.filter((r) => r.id !== replyId) } : c)),
    );
  }

  /**
   * Opens the thread of a comment (bubble, or its card when the panel is open) and scrolls its
   * text into view.
   *
   * @param id - the comment, `null` to close the open thread
   * @since 0.5.0
   */
  selectComment(id: string | null): void {
    this.newComment.set(false);
    this.activeComment.set(id);
    if (id) this.editable().nativeElement.querySelector(commentSelector(id))?.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------- ControlValueAccessor

  /**
   * Forms API (`ControlValueAccessor`), called by Angular forms: shows the control's HTML.
   * `null` / `undefined` show an empty editor. Not meant to be called directly.
   *
   * @param value - the HTML of the form control
   */
  writeValue(value: string | null | undefined): void {
    this.value.set(value ?? '');
  }

  /**
   * Forms API (`ControlValueAccessor`), called by Angular forms: registers the callback notified
   * with the new HTML on each edit. Not meant to be called directly.
   *
   * @param fn - callback receiving the new HTML
   */
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  /**
   * Forms API (`ControlValueAccessor`), called by Angular forms: registers the callback marking the
   * control touched when the editor loses focus. Not meant to be called directly.
   *
   * @param fn - callback marking the control touched
   */
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /**
   * Forms API (`ControlValueAccessor`), called by Angular forms: a disabled control makes the
   * editor read-only (like {@link readonly}). Not meant to be called directly.
   *
   * @param isDisabled - the control's disabled state
   */
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  // ------------------------------------------------------- template helpers

  /** True when `hide` turns off this command or feature. */
  protected isHidden(item: RteHideable): boolean {
    return this.hidden().has(item);
  }

  /** Items that aren't hidden, without leading, trailing or doubled separators. */
  private visibleItems(items: readonly RteToolbarItem[]): RteToolbarItem[] {
    const visible: RteToolbarItem[] = [];
    for (const item of items) {
      if (item !== '|' ? !this.hidden().has(item) : visible.length && visible[visible.length - 1] !== '|') {
        visible.push(item);
      }
    }
    if (visible[visible.length - 1] === '|') visible.pop();
    return visible;
  }

  protected iconContext(item: RteToolbarItem | 'openLink'): RteIconContext {
    const color = COLOR_KINDS.has(item as RteCommand) ? this.lastColors()[item as RteColorKind] : null;
    return { $implicit: item as RteCommand, active: item !== 'openLink' && this.isActive(item), color };
  }

  protected isActive(item: RteToolbarItem): boolean {
    if (item === '|') return false;
    if (item === 'source') return this.sourceMode();
    if (item === 'commentsPanel') return this.commentsPanel();
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
    this.control()?.markAsTouched();
    this.editorBlur.emit();
  }

  protected onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    const html = data.getData('text/html');
    const images = imageFiles(data.files);
    if (images.length && !html) {
      if (this.canDropImages()) void this.insertImageFiles(images, null);
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
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyM') {
      event.preventDefault();
      void this.execute('comment');
      return;
    }
    if (event.key === 'Escape' && (this.newComment() || (this.activeComment() && !this.commentsPanel()))) {
      this.closeComments();
      return;
    }
    if (this.newComment()) this.cancelComment();
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const command = ({ b: 'bold', i: 'italic', u: 'underline', k: 'link' } as Record<string, RteCommand>)[event.key.toLowerCase()];
      if (command && this.isHidden(command)) {
        event.preventDefault(); // the native shortcut would bypass `hide`
        return;
      }
    }
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
    if (target.localName === 'img' && this.isHidden('imageMove') && !this.isDisabled()) {
      event.preventDefault();
      return;
    }
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
    event.dataTransfer.dropEffect = this.canDropImages() ? 'copy' : 'none';
    this.dropActive.set(this.canDropImages());
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
    if (!images.length || !this.canDropImages()) return;
    void this.insertImageFiles(images, this.rangeFromPoint(event.clientX, event.clientY));
  }

  /** Image files can be dropped / pasted: not read-only, and neither `image` nor `imageDrop` hidden. */
  private canDropImages(): boolean {
    return !this.isDisabled() && !this.isHidden('image') && !this.isHidden('imageDrop');
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

  /**
   * Ctrl/⌘ + click on a link opens it in a new window. A click on an image selects it (so Delete /
   * Ctrl+C act on it) and shows its resize handles.
   */
  protected onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isDisabled() || !this.editable().nativeElement.contains(target)) return;
    const link = this.closestInEditor('a', target);
    if (link && (event.ctrlKey || event.metaKey) && !this.isHidden('linkOpen')) {
      event.preventDefault();
      this.openLink(link.getAttribute('href'));
      return;
    }
    if (target.localName === 'img') this.selectImage(target as HTMLImageElement);
  }

  // ------------------------------------------------------------------ links

  /** Opens a (safe) URL in a new window, without giving it access to this page. */
  protected openLink(href: string | null | undefined): void {
    if (href && isSafeUrl(href)) this.doc.defaultView?.open(href, '_blank', 'noopener,noreferrer');
  }

  /** Places the "open link" button at the end of the link holding the caret. */
  private updateLinkBubble(): void {
    const link = this.isHidden('linkOpen') ? null : this.closestInEditor('a');
    const href = link?.getAttribute('href');
    const rects = link?.getClientRects();
    if (!link || !href || !isSafeUrl(href) || !rects?.length) {
      this.linkBubble.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const content = this.editable().nativeElement.getBoundingClientRect();
    const end = rects[rects.length - 1];
    if (end.bottom < content.top || end.top > content.bottom) {
      this.linkBubble.set(null);
      return;
    }
    // right after the end of the link, vertically centered on its last line
    this.linkBubble.set({
      href,
      top: end.top - box.top + end.height / 2 - LINK_BUBBLE_SIZE / 2,
      left: Math.min(end.right - box.left + 2, box.width - LINK_BUBBLE_SIZE - 2),
    });
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
    // pointer cursor on links while Ctrl / ⌘ is held: they can be followed
    const ctrl = event.ctrlKey || event.metaKey;
    this.linkHover.set(
      ctrl && !this.isDisabled() && !this.isHidden('linkOpen') && !!this.closestInEditor('a', event.target as Node),
    );
  }

  /**
   * Dragging a column border shows a guide; the new widths are applied on release. An inner border
   * moves width between its two columns (the table keeps its width); only the outer left / right
   * borders resize the table, through its first / last column.
   * Dragging across cells (or Shift+click) selects a rectangle of cells.
   */
  protected onContentMouseDown(event: MouseEvent): void {
    if (this.newComment()) this.cancelComment();
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
    if (this.isHidden('cellSelection')) return;
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
    if (this.isDisabled() || this.isHidden('columnResize')) return null;
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
    this.emitChange(text);
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
    this.emitChange(html);
    this.contentVersion.update((v) => v + 1);
  }

  /** Reports an edit to the forms API and to the `control` input. */
  private emitChange(html: string): void {
    this.onChange(html);
    const control = this.control();
    if (control && control.value !== html) {
      control.setValue(html);
      control.markAsDirty();
    }
  }

  private toggleSource(): void {
    if (this.sourceMode()) {
      this.sourceMode.set(false);
      // load the source now (the value effect may not have run yet), then emit its sanitized version
      this.editable().nativeElement.innerHTML = this.clean(this.value() ?? '');
      this.contentVersion.update((v) => v + 1);
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

  // --------------------------------------------------------------- comments

  /** Innermost open (not resolved) comment marking `node`, if any. */
  private commentAt(node: Node | null): string | null {
    if (!this.commentsEnabled()) return null;
    const open = new Set(this.comments().filter((c) => !c.resolved).map((c) => c.id));
    const el = this.editable().nativeElement;
    for (let n = node; n && n !== el; n = n.parentNode) {
      const id = n.nodeType === 1 ? (n as HTMLElement).dataset?.['comment'] : undefined;
      if (id && open.has(id)) return id;
    }
    return null;
  }

  /** `comment` button: opens the new comment form for the selected text. */
  private startComment(): void {
    if (!this.canComment()) return;
    this.restoreSelection();
    const sel = this.doc.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!this.editable().nativeElement.contains(range.commonAncestorContainer)) return;
    this.pendingRange = range.cloneRange();
    this.activeComment.set(null);
    this.newComment.set(true);
    this.updateCommentBubble();
    setTimeout(() => this.root().nativeElement.querySelector<HTMLTextAreaElement>('.nrte__comment-bubble textarea')?.focus());
  }

  protected submitComment(field: HTMLTextAreaElement): void {
    const range = this.pendingRange;
    if (!range || !field.value.trim()) return;
    this.cancelComment();
    const comment = this.createComment(range, field.value);
    if (comment) this.activeComment.set(comment.id);
  }

  /** Marks `range` and adds a comment on it. */
  private createComment(range: Range, text: string): RteComment | null {
    const user = this.currentUser();
    if (!user) return null;
    const id = commentId();
    if (!this.markRange(range, id)) return null;
    const comment: RteComment = {
      id,
      author: { ...user },
      date: new Date().toISOString(),
      text: text.trim(),
      resolved: false,
      replies: [],
    };
    this.comments.update((list) => [...list, comment]);
    // caret at the end of the commented text: its thread opens
    const marks = this.editable().nativeElement.querySelectorAll(commentSelector(id));
    const last = marks[marks.length - 1];
    if (last) {
      const caret = this.doc.createRange();
      caret.selectNodeContents(last);
      caret.collapse(false);
      this.doc.getSelection()?.removeAllRanges();
      this.doc.getSelection()?.addRange(caret);
    }
    this.syncFromEditor();
    return comment;
  }

  /** Wraps the text of `range` in `<span data-comment="id">` (one span per text node), in one undo step. */
  private markRange(range: Range, id: string): boolean {
    const el = this.editable().nativeElement;
    if (!el.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== el) return false;
    const first = range.startContainer === el ? el.childNodes[range.startOffset] : this.topBlock(range.startContainer);
    const last = range.endContainer === el ? el.childNodes[range.endOffset - 1] : this.topBlock(range.endContainer);
    if (!first || !last) return false;
    let marked = false;
    this.rewriteBlocks(first, last, (point, wrapper) => {
      const copy = this.doc.createRange();
      copy.setStart(...point(range.startContainer, range.startOffset));
      copy.setEnd(...point(range.endContainer, range.endOffset));
      const texts: Text[] = [];
      const walker = this.doc.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (copy.intersectsNode(n)) texts.push(n as Text);
      for (let text of texts) {
        const start = text === copy.startContainer ? copy.startOffset : 0;
        const end = text === copy.endContainer ? copy.endOffset : text.length;
        const structural = text.parentNode === wrapper || /^(TABLE|THEAD|TBODY|TFOOT|TR|UL|OL|COLGROUP)$/.test(text.parentNode!.nodeName);
        if (start >= end || (structural && !text.data.slice(start, end).trim())) continue;
        if (end < text.length) text.splitText(end);
        if (start > 0) text = text.splitText(start);
        const mark = this.doc.createElement('span');
        mark.setAttribute('data-comment', id);
        text.before(mark);
        mark.append(text);
        marked = true;
      }
      return marked;
    });
    return marked;
  }

  /** Top-level block of the editor holding `node`. */
  private topBlock(node: Node): ChildNode {
    const el = this.editable().nativeElement;
    let n = node;
    while (n.parentNode && n.parentNode !== el) n = n.parentNode;
    return n as ChildNode;
  }

  /**
   * Rewrites the top-level blocks from `first` to `last` with one `insertHTML` (one undo step):
   * `mutate` changes copies of the blocks, found through `point` (maps a boundary point of the
   * editor to the copies) or in `wrapper`; returning `false` cancels.
   */
  private rewriteBlocks(
    first: ChildNode,
    last: ChildNode,
    mutate: (point: (container: Node, offset: number) => [Node, number], wrapper: HTMLElement) => boolean | void,
  ): void {
    const el = this.editable().nativeElement;
    const children = Array.from(el.childNodes);
    const from = children.indexOf(first);
    const to = children.indexOf(last);
    if (from < 0 || to < from) return;
    const blocks = children.slice(from, to + 1);
    const wrapper = this.doc.createElement('div');
    wrapper.append(...blocks.map((block) => block.cloneNode(true)));
    const at = (node: Node): Node => {
      const top = this.topBlock(node);
      return resolvePath(wrapper, [blocks.indexOf(top), ...pathOf(node, top)]);
    };
    const point = (container: Node, offset: number): [Node, number] =>
      container === el ? [wrapper, offset - from] : [at(container), offset];
    if (mutate(point, wrapper) === false) return;

    el.focus();
    const replaced = this.doc.createRange();
    replaced.setStartBefore(blocks[0]);
    const end = blocks[blocks.length - 1];
    // end inside the last block (see replaceNode)
    if (end.nodeType === Node.TEXT_NODE) replaced.setEnd(end, (end as Text).length);
    else if (!end.childNodes.length) replaced.setEndAfter(end);
    else replaced.setEnd(end, end.childNodes.length);
    const sel = this.doc.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(replaced);
    const html = Array.from(wrapper.childNodes, (n) => (n.nodeType === 1 ? (n as Element).outerHTML : escapeHtml(n.textContent ?? ''))).join('');
    this.doc.execCommand('insertHTML', false, html);
  }

  protected cancelComment(): void {
    this.pendingRange = null;
    this.newComment.set(false);
  }

  /** Closes the new comment form and the open thread. */
  protected closeComments(): void {
    this.cancelComment();
    if (!this.commentsPanel()) this.activeComment.set(null);
  }

  protected submitReply(id: string, field: HTMLTextAreaElement): void {
    if (this.replyToComment(id, field.value)) field.value = '';
  }

  /** Ctrl/⌘ + Enter posts, Escape closes. */
  protected onCommentKeydown(event: KeyboardEvent, field: HTMLTextAreaElement, id: string | null): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (id) this.submitReply(id, field);
      else this.submitComment(field);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeComments();
      this.editable().nativeElement.focus();
    }
  }

  protected commentById(id: string | null): RteComment | undefined {
    return id === null ? undefined : this.comments().find((c) => c.id === id);
  }

  /** The comment followed by its replies. */
  protected threadEntries(comment: RteComment): (RteComment | RteCommentReply)[] {
    return [comment, ...comment.replies];
  }

  protected canDelete(entry: { author: RteUser }): boolean {
    return this.canComment() && this.currentUser()?.id === entry.author.id;
  }

  protected deleteEntry(comment: RteComment, entry: RteComment | RteCommentReply): void {
    if (entry.id === comment.id) this.deleteComment(comment.id);
    else this.deleteReply(comment.id, entry.id);
  }

  protected colorOf(user: RteUser): string {
    return userColor(user);
  }

  protected initials(user: RteUser): string {
    const words = user.name.trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
  }

  /** Highlights the text of the open comments, and more strongly the one of the open thread. */
  private updateCommentHighlights(): void {
    const normal: Range[] = [];
    const active: Range[] = [];
    if (this.commentsEnabled()) {
      const open = new Set(this.comments().filter((c) => !c.resolved).map((c) => c.id));
      const current = this.activeComment();
      for (const span of Array.from(this.editable().nativeElement.querySelectorAll<HTMLElement>('span[data-comment]'))) {
        const id = span.dataset['comment']!;
        if (!open.has(id)) continue;
        const range = this.doc.createRange();
        range.selectNodeContents(span);
        (id === current ? active : normal).push(range);
      }
    }
    this.setHighlightRanges(COMMENT_HIGHLIGHT, normal);
    this.setHighlightRanges(COMMENT_HIGHLIGHT_ACTIVE, active);
  }

  private setHighlightRanges(name: string, ranges: Range[]): void {
    const highlight = sharedHighlight(name);
    if (!highlight) return;
    for (const range of this.highlightRanges[name]) highlight.delete(range);
    for (const range of ranges) highlight.add(range);
    this.highlightRanges[name] = ranges;
  }

  /** Places the comment bubble below the new comment's text or the open thread's text. */
  private updateCommentBubble(): void {
    const el = this.editable().nativeElement;
    let rects: DOMRectList | null = null;
    let id: string | null = null;
    if (this.newComment() && this.pendingRange) {
      rects = this.pendingRange.getClientRects();
    } else if (this.activeComment() && !this.commentsPanel() && this.commentsEnabled()) {
      id = this.activeComment();
      const marks = el.querySelectorAll(commentSelector(id!));
      rects = marks.length ? marks[marks.length - 1].getClientRects() : null;
    }
    if (!rects?.length) {
      this.commentBubble.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const content = el.getBoundingClientRect();
    const end = rects[rects.length - 1];
    if (end.bottom < content.top || end.top > content.bottom) {
      this.commentBubble.set(null);
      return;
    }
    const width = Math.min(COMMENT_BUBBLE_WIDTH, box.width - 8);
    this.commentBubble.set({
      id,
      top: end.bottom - box.top + 6,
      left: Math.max(4, Math.min(end.left - box.left, box.width - width - 4)),
    });
  }

  private handleSelectionChange(): void {
    const sel = this.doc.getSelection();
    const el = this.editable().nativeElement;
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    this.savedRange = sel.getRangeAt(0).cloneRange();
    if (this.selectedImage() && !this.imageStillSelected()) this.selectedImage.set(null);
    this.activeComment.set(this.commentAt(sel.anchorNode));
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
    this.updateLinkBubble();
    this.updateCommentBubble();
    const table = this.closestCell()?.closest('table');
    if (!table) {
      this.tableBar.set(null);
      return;
    }
    const box = this.root().nativeElement.getBoundingClientRect();
    const content = this.editable().nativeElement.getBoundingClientRect();
    const rect = table.getBoundingClientRect();
    // the bar's size depends on the theme (--nrte-btn-size…): measure it once it is shown
    const bar = this.root().nativeElement.querySelector<HTMLElement>('.nrte__tablebar');
    const height = bar?.offsetHeight || TABLE_BAR_HEIGHT;
    const min = content.top - box.top + 4;
    let top = rect.top - box.top - height - 4;
    if (top < min) top = rect.bottom - box.top + 4;
    top = Math.max(min, Math.min(top, box.height - height - 4));
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

  /** Images chosen in the file picker are inserted where the caret was. */
  protected onImagesPicked(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const images = imageFiles(picker.files);
    picker.value = ''; // picking the same file again must fire `change` again
    const range = this.pickerRange;
    this.pickerRange = null;
    if (images.length && !this.isDisabled()) void this.insertImageFiles(images, range);
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

  /** `image` button: opens the file picker, or asks for a URL with `imageSource: 'url'`. */
  private async insertImage(): Promise<void> {
    if (this.imageSource() === 'file') {
      // remember the caret: the file dialog takes the focus away
      this.pickerRange = this.savedRange?.cloneRange() ?? null;
      this.imagePicker().nativeElement.click();
      return;
    }
    const url = await this.askUrl('image', '');
    if (!url || !isSafeUrl(url, true)) return;
    this.exec('insertHTML', `<img src="${escapeHtml(url)}" alt="">`);
  }
}
