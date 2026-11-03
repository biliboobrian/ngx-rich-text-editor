/**
 * Every action the toolbar can trigger. Use them in the `toolbar` input or with
 * `RichTextEditorComponent.execute()`.
 */
export type RteCommand =
  /** Undoes the last change. */
  | 'undo'
  /** Redoes the last undone change. */
  | 'redo'
  /** Turns the current block into a paragraph (`<p>`). */
  | 'paragraph'
  /** Toggles a level 1 heading (`<h1>`). */
  | 'h1'
  /** Toggles a level 2 heading (`<h2>`). */
  | 'h2'
  /** Toggles a level 3 heading (`<h3>`). */
  | 'h3'
  /** Toggles bold (<kbd>Ctrl/⌘+B</kbd>). */
  | 'bold'
  /** Toggles italic (<kbd>Ctrl/⌘+I</kbd>). */
  | 'italic'
  /** Toggles underline (<kbd>Ctrl/⌘+U</kbd>). */
  | 'underline'
  /** Toggles strikethrough. */
  | 'strikeThrough'
  /** Opens the text color palette. */
  | 'textColor'
  /** Opens the text highlight palette. */
  | 'backgroundColor'
  /** Toggles subscript. */
  | 'subscript'
  /** Toggles superscript. */
  | 'superscript'
  /** Toggles a bulleted list (only the innermost level in nested lists). */
  | 'unorderedList'
  /** Toggles a numbered list (only the innermost level in nested lists). */
  | 'orderedList'
  /** Nests list items one level deeper (<kbd>Tab</kbd>), or indents the block. */
  | 'indent'
  /** Moves list items one level up (<kbd>Shift+Tab</kbd>), or outdents the block. */
  | 'outdent'
  /** Toggles a quote (`<blockquote>`). */
  | 'blockquote'
  /** Toggles a code block (`<pre>`). */
  | 'code'
  /** Aligns the block (or the selected cells) left. */
  | 'alignLeft'
  /** Centers the block (or the selected cells). */
  | 'alignCenter'
  /** Aligns the block (or the selected cells) right. */
  | 'alignRight'
  /** Justifies the block (or the selected cells). */
  | 'alignJustify'
  /** Inserts or edits a link (<kbd>Ctrl/⌘+K</kbd>); the URL comes from `promptFn`. */
  | 'link'
  /** Removes the link under the caret. */
  | 'unlink'
  /** Inserts an image from a URL given by `promptFn`. */
  | 'image'
  /** Inserts a 3×3 table. */
  | 'table'
  /** Inserts a row above the caret. */
  | 'tableRowAbove'
  /** Inserts a row below the caret. */
  | 'tableRowBelow'
  /** Inserts a column left of the caret. */
  | 'tableColLeft'
  /** Inserts a column right of the caret. */
  | 'tableColRight'
  /** Deletes the row holding the caret. */
  | 'tableRowDelete'
  /** Deletes the column holding the caret. */
  | 'tableColDelete'
  /** Deletes the table holding the caret. */
  | 'tableDelete'
  /** Opens the cell text color palette. */
  | 'tableTextColor'
  /** Opens the cell background color palette. */
  | 'tableBackground'
  /** Opens the table borders popup (sides, width, color). */
  | 'tableBorder'
  /** Inserts a horizontal line (`<hr>`). */
  | 'horizontalRule'
  /** Removes the inline formatting and turns the block into a paragraph. */
  | 'clear'
  | 'source';

/** A toolbar entry: a command, or `'|'` for a visual separator. */
export type RteToolbarItem = RteCommand | '|';

/**
 * Texts of the editor that can be translated with the `labels` input: the command tooltips plus
 * the texts of the popups.
 */
export type RteLabelKey =
  | RteCommand
  /** Palette button removing the color (also "no border" in the borders popup). */
  | 'colorNone'
  /** Tooltip of the image resize handles. */
  | 'imageResize'
  /** Tooltip of the button opening the link under the caret in a new window. */
  | 'openLink'
  /** Palette button opening the custom color picker. */
  | 'colorCustom'
  /** Table palettes: apply to the selected cells. */
  | 'scopeSelection'
  /** Table palettes: apply to the current cell. */
  | 'scopeCell'
  /** Table palettes: apply to the current row. */
  | 'scopeRow'
  /** Table palettes: apply to the current column. */
  | 'scopeColumn'
  /** Borders popup: title of the sides group. */
  | 'borderSides'
  /** Borders popup: title of the widths group. */
  | 'borderWidth'
  /** Borders popup: title of the colors group. */
  | 'borderColor'
  /** Borders popup: button selecting every side. */
  | 'borderAll'
  /** Borders popup: top edge. */
  | 'borderTop'
  /** Borders popup: bottom edge. */
  | 'borderBottom'
  /** Borders popup: left edge. */
  | 'borderLeft'
  /** Borders popup: right edge. */
  | 'borderRight'
  /** Borders popup: lines between the cells. */
  | 'borderInner'
  | 'colorAuto';

/** Default swatches of the text color palettes (12 colors). Override with the `textColors` input. */
export const RTE_TEXT_COLORS: readonly string[] = [
  '#000000', '#495057', '#868e96', '#c92a2a', '#e8590c', '#e67700',
  '#2b8a3e', '#0b7285', '#1864ab', '#3b5bdb', '#6741d9', '#a61e4d',
];

/** Default swatches of the background color palettes (12 colors). Override with the `backgroundColors` input. */
export const RTE_BACKGROUND_COLORS: readonly string[] = [
  '#fff3bf', '#ffe8cc', '#ffe3e3', '#ffdeeb', '#e5dbff', '#dbe4ff',
  '#d0ebff', '#c5f6fa', '#d3f9d8', '#e9ecef', '#ffd43b', '#8ce99a',
];

/**
 * Asks the user for a URL, e.g. by opening your own dialog. May return a Promise.
 * Return `null` / `undefined` to cancel; for a link, `''` removes it.
 *
 * @example
 * prompt: RtePromptFn = (kind, current) => this.dialog.open(UrlDialog, { data: { kind, current } }).afterClosed();
 */
export type RtePromptFn = (
  /** What the URL is for. */
  kind: 'link' | 'image',
  /** URL of the link being edited, `''` otherwise. */
  currentValue: string,
) => string | null | undefined | Promise<string | null | undefined>;

/**
 * Turns a dropped or pasted image file into the URL used as `src`: upload it and return its URL,
 * or return a data URL. Throw / reject to skip the file. Unsafe URLs are ignored.
 *
 * @example
 * upload: RteImageUploadFn = async (file) => {
 *   const body = new FormData();
 *   body.append('file', file);
 *   return (await (await fetch('/api/images', { method: 'POST', body })).json()).url;
 * };
 */
export type RteImageUploadFn = (file: File) => string | Promise<string>;

/**
 * Default layout of the main toolbar (every command but the table ones, which are in
 * {@link RTE_TABLE_TOOLBAR}). Copy and edit it to build your own:
 * `[toolbar]="['bold', 'italic', '|', ...]"`.
 */
export const RTE_DEFAULT_TOOLBAR: readonly RteToolbarItem[] = [
  'undo', 'redo', '|',
  'paragraph', 'h1', 'h2', 'h3', '|',
  'bold', 'italic', 'underline', 'strikeThrough', 'textColor', 'backgroundColor', '|',
  'unorderedList', 'orderedList', 'blockquote', 'code', '|',
  'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', '|',
  'link', 'unlink', 'image', 'table', 'horizontalRule', '|',
  'clear', 'source',
];

/** Buttons of the floating bar shown above a table while the caret is in it (not configurable). */
export const RTE_TABLE_TOOLBAR: readonly RteToolbarItem[] = [
  'tableRowAbove', 'tableRowBelow', 'tableRowDelete', '|',
  'tableColLeft', 'tableColRight', 'tableColDelete', '|',
  'tableTextColor', 'tableBackground', 'tableBorder', '|',
  'tableDelete',
];

/** Default (English) texts. Override any of them with the `labels` input. */
export const RTE_DEFAULT_LABELS: Readonly<Record<RteLabelKey, string>> = {
  undo: 'Undo',
  redo: 'Redo',
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikeThrough: 'Strikethrough',
  textColor: 'Text color',
  backgroundColor: 'Background color',
  colorNone: 'None',
  imageResize: 'Resize (double-click: original size)',
  openLink: 'Open link in a new window (Ctrl+click)',
  colorCustom: 'Custom…',
  scopeSelection: 'Selection',
  scopeCell: 'Cell',
  scopeRow: 'Row',
  scopeColumn: 'Column',
  borderSides: 'Sides',
  borderWidth: 'Width',
  borderColor: 'Color',
  borderAll: 'All borders',
  borderTop: 'Top',
  borderBottom: 'Bottom',
  borderLeft: 'Left',
  borderRight: 'Right',
  borderInner: 'Inside',
  colorAuto: 'Auto',
  subscript: 'Subscript',
  superscript: 'Superscript',
  unorderedList: 'Bulleted list',
  orderedList: 'Numbered list',
  indent: 'Increase indent',
  outdent: 'Decrease indent',
  blockquote: 'Quote',
  code: 'Code block',
  alignLeft: 'Align left',
  alignCenter: 'Center',
  alignRight: 'Align right',
  alignJustify: 'Justify',
  link: 'Insert link',
  unlink: 'Remove link',
  image: 'Insert image',
  table: 'Insert table',
  tableRowAbove: 'Insert row above',
  tableRowBelow: 'Insert row below',
  tableColLeft: 'Insert column left',
  tableColRight: 'Insert column right',
  tableRowDelete: 'Delete row',
  tableColDelete: 'Delete column',
  tableDelete: 'Delete table',
  tableTextColor: 'Cell text color',
  tableBackground: 'Cell background color',
  tableBorder: 'Borders',
  horizontalRule: 'Horizontal line',
  clear: 'Clear formatting',
  source: 'HTML source',
};

/** French texts, ready to pass to the `labels` input: `[labels]="frLabels"` with `frLabels = RTE_LABELS_FR`. */
export const RTE_LABELS_FR: Readonly<Record<RteLabelKey, string>> = {
  undo: 'Annuler',
  redo: 'Rétablir',
  paragraph: 'Paragraphe',
  h1: 'Titre 1',
  h2: 'Titre 2',
  h3: 'Titre 3',
  bold: 'Gras',
  italic: 'Italique',
  underline: 'Souligné',
  strikeThrough: 'Barré',
  textColor: 'Couleur du texte',
  backgroundColor: 'Couleur de fond',
  colorNone: 'Aucune',
  imageResize: 'Redimensionner (double-clic : taille d’origine)',
  openLink: 'Ouvrir le lien dans une nouvelle fenêtre (Ctrl+clic)',
  colorCustom: 'Personnalisée…',
  scopeSelection: 'Sélection',
  scopeCell: 'Cellule',
  scopeRow: 'Ligne',
  scopeColumn: 'Colonne',
  borderSides: 'Côtés',
  borderWidth: 'Épaisseur',
  borderColor: 'Couleur',
  borderAll: 'Toutes les bordures',
  borderTop: 'Haut',
  borderBottom: 'Bas',
  borderLeft: 'Gauche',
  borderRight: 'Droite',
  borderInner: 'Intérieures',
  colorAuto: 'Auto',
  subscript: 'Indice',
  superscript: 'Exposant',
  unorderedList: 'Liste à puces',
  orderedList: 'Liste numérotée',
  indent: 'Augmenter le retrait',
  outdent: 'Diminuer le retrait',
  blockquote: 'Citation',
  code: 'Bloc de code',
  alignLeft: 'Aligner à gauche',
  alignCenter: 'Centrer',
  alignRight: 'Aligner à droite',
  alignJustify: 'Justifier',
  link: 'Insérer un lien',
  unlink: 'Supprimer le lien',
  image: 'Insérer une image',
  table: 'Insérer un tableau',
  tableRowAbove: 'Insérer une ligne au-dessus',
  tableRowBelow: 'Insérer une ligne en dessous',
  tableColLeft: 'Insérer une colonne à gauche',
  tableColRight: 'Insérer une colonne à droite',
  tableRowDelete: 'Supprimer la ligne',
  tableColDelete: 'Supprimer la colonne',
  tableDelete: 'Supprimer le tableau',
  tableTextColor: 'Couleur du texte des cellules',
  tableBackground: 'Couleur de fond des cellules',
  tableBorder: 'Bordures',
  horizontalRule: 'Ligne horizontale',
  clear: 'Effacer la mise en forme',
  source: 'Code HTML',
};

/** Commands that reflect a toggled state of the current selection (rendered with `aria-pressed`). */
export const RTE_TOGGLE_COMMANDS: ReadonlySet<RteCommand> = new Set<RteCommand>([
  'paragraph', 'h1', 'h2', 'h3', 'bold', 'italic', 'underline', 'strikeThrough', 'subscript',
  'superscript', 'unorderedList', 'orderedList', 'blockquote', 'code', 'alignLeft', 'alignCenter',
  'alignRight', 'alignJustify', 'link', 'source',
]);
