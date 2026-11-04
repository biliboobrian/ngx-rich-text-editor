/**
 * Every action the toolbars can trigger. Use them in the `toolbar` / `tableToolbar` inputs, in
 * `hide`, in `rteIcon` templates or with `RichTextEditorComponent.execute()`.
 *
 * | Group      | Commands |
 * | ---------- | -------- |
 * | History    | `undo`, `redo` |
 * | Blocks     | `paragraph`, `h1`, `h2`, `h3`, `blockquote`, `code` (`<pre>`), `horizontalRule` |
 * | Text       | `bold` (<kbd>Ctrl/⌘+B</kbd>), `italic` (<kbd>Ctrl/⌘+I</kbd>), `underline` (<kbd>Ctrl/⌘+U</kbd>), `strikeThrough`, `subscript`, `superscript`, `clear` |
 * | Colors     | `textColor`, `backgroundColor` (open a palette) |
 * | Lists      | `unorderedList`, `orderedList`, `indent` (<kbd>Tab</kbd>), `outdent` (<kbd>Shift+Tab</kbd>) |
 * | Alignment  | `alignLeft`, `alignCenter`, `alignRight`, `alignJustify` |
 * | Insert     | `link` (<kbd>Ctrl/⌘+K</kbd>), `unlink`, `image`, `table` |
 * | Tables     | `tableRowAbove`, `tableRowBelow`, `tableRowDelete`, `tableColLeft`, `tableColRight`, `tableColDelete`, `tableTextColor`, `tableBackground`, `tableBorder`, `tableDelete` |
 * | View       | `source` (HTML source view) |
 * | Comments   | `comment` (<kbd>Ctrl/⌘+Alt+M</kbd>, comment the selection), `commentsPanel` (side panel) |
 *
 * @example
 * ```ts
 * const toolbar: RteToolbarItem[] = ['bold', 'italic', '|', 'link'];
 * await editor.execute('h2');
 * ```
 * @since 0.1.0
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
  | 'source'
  /** Comments the selected text (<kbd>Ctrl/⌘+Alt+M</kbd>); needs a `currentUser`. */
  | 'comment'
  /** Shows or hides the side panel listing the comments. */
  | 'commentsPanel';

/**
 * An entry of the `toolbar` / `tableToolbar` inputs: a command, or `'|'` for a visual separator.
 *
 * @example
 * ```ts
 * const toolbar: RteToolbarItem[] = ['undo', 'redo', '|', 'bold', 'italic'];
 * ```
 * @since 0.1.0
 */
export type RteToolbarItem = RteCommand | '|';

/**
 * Behaviours that are not toolbar buttons and can be turned off with the `hide` input.
 *
 * | Feature         | Turns off                                                  |
 * | --------------- | ---------------------------------------------------------- |
 * | `imageResize`   | resize handles on a clicked image                          |
 * | `imageMove`     | moving an image by dragging it elsewhere in the text       |
 * | `imageDrop`     | inserting dropped / pasted image files                     |
 * | `columnResize`  | resizing table columns from their borders                  |
 * | `rowResize`     | resizing table rows from their borders                     |
 * | `cellSelection` | selecting table cells (drag, Shift+click)                  |
 * | `linkOpen`      | "open link" button and <kbd>Ctrl/⌘ + click</kbd> on links  |
 * | `tableToolbar`  | the floating table bar                                     |
 *
 * @example
 * ```html
 * <ngx-rich-text-editor [hide]="['imageResize', 'columnResize']" />
 * ```
 * @since 0.4.0
 */
export type RteFeature =
  /** Resize handles on a clicked image. */
  | 'imageResize'
  /** Moving an image by dragging it elsewhere in the text. */
  | 'imageMove'
  /** Inserting image files dropped from the desktop or pasted from the clipboard. */
  | 'imageDrop'
  /** Resizing table columns by dragging their borders. */
  | 'columnResize'
  /**
   * Resizing table rows by dragging their borders.
   * @since 0.7.0
   */
  | 'rowResize'
  /** Selecting a rectangle of table cells (drag or Shift+click). */
  | 'cellSelection'
  /** "Open link" button and Ctrl/⌘ + click on links. */
  | 'linkOpen'
  /** Floating bar shown above a table while the caret is in it. */
  | 'tableToolbar';

/**
 * What the `hide` input can turn off:
 * - a {@link RteCommand}: taken out of both toolbars, its keyboard shortcut and `execute()` are
 *   ignored (hiding `image` also blocks dropped / pasted images);
 * - a {@link RteFeature}: a behaviour that isn't a button.
 *
 * @example
 * ```ts
 * hidden: RteHideable[] = ['source', 'table', 'imageResize'];
 * ```
 * @since 0.4.0
 */
export type RteHideable = RteCommand | RteFeature;

/**
 * Keys of the texts that can be replaced with the `labels` input:
 * - every {@link RteCommand}: the tooltip (and `aria-label`) of its button;
 * - `imageResize`, `openLink`: tooltips of the image handles and of the "open link" button;
 * - `colorNone`, `colorCustom`, `colorAuto`: buttons of the color palettes;
 * - `scopeSelection`, `scopeCell`, `scopeRow`, `scopeColumn`: scope buttons of the cell palettes;
 * - `borderSides`, `borderWidth`, `borderColor`, `borderAll`, `borderTop`, `borderBottom`,
 *   `borderLeft`, `borderRight`, `borderInner`: texts of the borders popup.
 * - `commentPlaceholder`, `replyPlaceholder`, `commentSubmit`, `commentReply`, `commentCancel`,
 *   `commentResolve`, `commentReopen`, `commentDelete`, `commentResolved`, `commentTextDeleted`,
 *   `commentsTitle`, `commentsEmpty`, `commentsShowResolved`: comment bubble and panel.
 *
 * @example
 * ```ts
 * labels: Partial<Record<RteLabelKey, string>> = { bold: 'Fett', openLink: 'Link öffnen' };
 * ```
 * @see {@link RTE_DEFAULT_LABELS} (English) and {@link RTE_LABELS_FR} (French)
 * @since 0.2.0
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
  | 'colorAuto'
  /** Placeholder of the new comment field. */
  | 'commentPlaceholder'
  /** Placeholder of the reply field. */
  | 'replyPlaceholder'
  /** Button posting a new comment. */
  | 'commentSubmit'
  /** Button posting a reply. */
  | 'commentReply'
  /** Button cancelling a new comment. */
  | 'commentCancel'
  /** Button resolving a thread. */
  | 'commentResolve'
  /** Button reopening a resolved thread. */
  | 'commentReopen'
  /** Button deleting a comment or a reply. */
  | 'commentDelete'
  /** Badge of a resolved thread. */
  | 'commentResolved'
  /** Shown instead of the quote when the commented text was deleted. */
  | 'commentTextDeleted'
  /** Title of the comments panel. */
  | 'commentsTitle'
  /** Shown in the panel when there are no comments. */
  | 'commentsEmpty'
  /** Panel option showing the resolved threads. */
  | 'commentsShowResolved';

/**
 * Default swatches of the text color palettes and of the borders popup: 12 colors, from black to
 * crimson, readable on a white background. Override with the `textColors` input.
 *
 * @example
 * ```ts
 * colors = [...RTE_TEXT_COLORS, '#ff00ff']; // add a color
 * ```
 * @since 0.2.0
 */
export const RTE_TEXT_COLORS: readonly string[] = [
  '#000000', '#495057', '#868e96', '#c92a2a', '#e8590c', '#e67700',
  '#2b8a3e', '#0b7285', '#1864ab', '#3b5bdb', '#6741d9', '#a61e4d',
];

/**
 * Default swatches of the background color palettes: 12 light colors that keep dark text
 * readable. Override with the `backgroundColors` input.
 *
 * @since 0.2.0
 */
export const RTE_BACKGROUND_COLORS: readonly string[] = [
  '#fff3bf', '#ffe8cc', '#ffe3e3', '#ffdeeb', '#e5dbff', '#dbe4ff',
  '#d0ebff', '#c5f6fa', '#d3f9d8', '#e9ecef', '#ffd43b', '#8ce99a',
];

/**
 * Asks the user for a URL (the `promptFn` input), e.g. by opening your own dialog. Called by the
 * `link` button, and by the `image` button when `imageSource` is `'url'`. May return a Promise.
 *
 * Return the URL, `null` / `undefined` to cancel, or `''` to remove the link being edited. Unsafe
 * URLs (`javascript:`…) are ignored.
 *
 * @param kind - what the URL is for: `'link'` or `'image'`
 * @param currentValue - URL of the link being edited, `''` otherwise
 * @returns the URL, or `null` / `undefined` to cancel (or a Promise of it)
 * @example
 * ```ts
 * askUrl: RtePromptFn = (kind, current) =>
 *   firstValueFrom(this.dialog.open(UrlDialog, { data: { kind, current } }).afterClosed());
 * ```
 * @since 0.1.0
 */
export type RtePromptFn = (
  /** What the URL is for. */
  kind: 'link' | 'image',
  /** URL of the link being edited, `''` otherwise. */
  currentValue: string,
) => string | null | undefined | Promise<string | null | undefined>;

/**
 * Turns an image file into the URL used as `src` (the `imageUpload` input): files picked with the
 * `image` button, dropped from the desktop or pasted from the clipboard. Upload the file and return
 * its URL, or return a data URL (the default embeds the file in base64). Several files are handled
 * in parallel and inserted together.
 *
 * @param file - the image file (png, jpeg, gif, webp, bmp…)
 * @returns the URL to use as `src` (or a Promise of it); throw / reject to skip the file. Unsafe
 *   URLs are ignored.
 * @example
 * ```ts
 * upload: RteImageUploadFn = async (file) => {
 *   const body = new FormData();
 *   body.append('file', file);
 *   const res = await fetch('/api/images', { method: 'POST', body });
 *   return (await res.json()).url;
 * };
 * ```
 * @since 0.2.0
 */
export type RteImageUploadFn = (file: File) => string | Promise<string>;

/**
 * Default layout of the main toolbar: every command but the table ones (which are in
 * {@link RTE_TABLE_TOOLBAR}), grouped by separators — history, blocks, text and colors, lists,
 * alignment, insertions, clear and source.
 *
 * Copy it to build your own layout, or keep it and remove buttons with the `hide` input.
 *
 * @example
 * ```ts
 * toolbar = RTE_DEFAULT_TOOLBAR.filter((item) => item !== 'source');
 * ```
 * @since 0.1.0
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

/**
 * Default buttons of the floating bar shown above a table while the caret is in it: rows,
 * columns, cell colors and borders, delete the table. Change them with the `tableToolbar` input.
 *
 * @since 0.2.0
 */
export const RTE_TABLE_TOOLBAR: readonly RteToolbarItem[] = [
  'tableRowAbove', 'tableRowBelow', 'tableRowDelete', '|',
  'tableColLeft', 'tableColRight', 'tableColDelete', '|',
  'tableTextColor', 'tableBackground', 'tableBorder', '|',
  'tableDelete',
];

/**
 * Default (English) texts of the editor: button tooltips and popup texts. Override any of them
 * with the `labels` input; the keys you don't give keep these texts.
 *
 * @see {@link RTE_LABELS_FR} for French
 * @since 0.1.0
 */
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
  comment: 'Comment (Ctrl+Alt+M)',
  commentsPanel: 'Comments',
  commentPlaceholder: 'Add a comment…',
  replyPlaceholder: 'Reply…',
  commentSubmit: 'Comment',
  commentReply: 'Reply',
  commentCancel: 'Cancel',
  commentResolve: 'Resolve',
  commentReopen: 'Reopen',
  commentDelete: 'Delete',
  commentResolved: 'Resolved',
  commentTextDeleted: 'Text deleted',
  commentsTitle: 'Comments',
  commentsEmpty: 'No comments yet. Select some text and click the comment button.',
  commentsShowResolved: 'Show resolved',
};

/**
 * French texts of the editor, ready to pass to the `labels` input.
 *
 * @example
 * ```ts
 * readonly fr = RTE_LABELS_FR;
 * ```
 * ```html
 * <ngx-rich-text-editor [labels]="fr" />
 * ```
 * @since 0.1.0
 */
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
  comment: 'Commenter (Ctrl+Alt+M)',
  commentsPanel: 'Commentaires',
  commentPlaceholder: 'Ajouter un commentaire…',
  replyPlaceholder: 'Répondre…',
  commentSubmit: 'Commenter',
  commentReply: 'Répondre',
  commentCancel: 'Annuler',
  commentResolve: 'Résoudre',
  commentReopen: 'Rouvrir',
  commentDelete: 'Supprimer',
  commentResolved: 'Résolu',
  commentTextDeleted: 'Texte supprimé',
  commentsTitle: 'Commentaires',
  commentsEmpty: 'Aucun commentaire. Sélectionnez du texte puis cliquez sur le bouton commentaire.',
  commentsShowResolved: 'Afficher les résolus',
};

/**
 * Commands whose button shows whether they apply to the selection (pressed look and
 * `aria-pressed`), e.g. `bold` when the caret is in bold text.
 *
 * @since 0.1.0
 */
export const RTE_TOGGLE_COMMANDS: ReadonlySet<RteCommand> = new Set<RteCommand>([
  'paragraph', 'h1', 'h2', 'h3', 'bold', 'italic', 'underline', 'strikeThrough', 'subscript',
  'superscript', 'unorderedList', 'orderedList', 'blockquote', 'code', 'alignLeft', 'alignCenter',
  'alignRight', 'alignJustify', 'link', 'source', 'commentsPanel',
]);
