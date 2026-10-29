/** Every action the toolbar can trigger. */
export type RteCommand =
  | 'undo'
  | 'redo'
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'textColor'
  | 'backgroundColor'
  | 'subscript'
  | 'superscript'
  | 'unorderedList'
  | 'orderedList'
  | 'indent'
  | 'outdent'
  | 'blockquote'
  | 'code'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignJustify'
  | 'link'
  | 'unlink'
  | 'image'
  | 'table'
  | 'tableRowAbove'
  | 'tableRowBelow'
  | 'tableColLeft'
  | 'tableColRight'
  | 'tableRowDelete'
  | 'tableColDelete'
  | 'tableDelete'
  | 'tableTextColor'
  | 'tableBackground'
  | 'tableBorder'
  | 'horizontalRule'
  | 'clear'
  | 'source';

/** A toolbar entry: a command, or `'|'` for a visual separator. */
export type RteToolbarItem = RteCommand | '|';

/** Texts of the editor: command tooltips plus the color palette buttons. */
export type RteLabelKey =
  | RteCommand
  | 'colorNone'
  | 'colorCustom'
  | 'scopeSelection'
  | 'scopeCell'
  | 'scopeRow'
  | 'scopeColumn';

/** Swatches of the text color palette. Override with the `textColors` input. */
export const RTE_TEXT_COLORS: readonly string[] = [
  '#000000', '#495057', '#868e96', '#c92a2a', '#e8590c', '#e67700',
  '#2b8a3e', '#0b7285', '#1864ab', '#3b5bdb', '#6741d9', '#a61e4d',
];

/** Swatches of the background color palette. Override with the `backgroundColors` input. */
export const RTE_BACKGROUND_COLORS: readonly string[] = [
  '#fff3bf', '#ffe8cc', '#ffe3e3', '#ffdeeb', '#e5dbff', '#dbe4ff',
  '#d0ebff', '#c5f6fa', '#d3f9d8', '#e9ecef', '#ffd43b', '#8ce99a',
];

/** Function used to ask the user for a URL (link or image). Return `null` to cancel. */
export type RtePromptFn = (
  kind: 'link' | 'image',
  currentValue: string,
) => string | null | undefined | Promise<string | null | undefined>;

/**
 * Turns a dropped or pasted image file into the URL used as `src`: upload it and return its URL,
 * or return a data URL. Throw / reject to skip the file.
 */
export type RteImageUploadFn = (file: File) => string | Promise<string>;

export const RTE_DEFAULT_TOOLBAR: readonly RteToolbarItem[] = [
  'undo', 'redo', '|',
  'paragraph', 'h1', 'h2', 'h3', '|',
  'bold', 'italic', 'underline', 'strikeThrough', 'textColor', 'backgroundColor', '|',
  'unorderedList', 'orderedList', 'blockquote', 'code', '|',
  'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', '|',
  'link', 'unlink', 'image', 'table', 'horizontalRule', '|',
  'clear', 'source',
];

/** Buttons of the floating bar shown while the caret is in a table. */
export const RTE_TABLE_TOOLBAR: readonly RteToolbarItem[] = [
  'tableRowAbove', 'tableRowBelow', 'tableRowDelete', '|',
  'tableColLeft', 'tableColRight', 'tableColDelete', '|',
  'tableTextColor', 'tableBackground', 'tableBorder', '|',
  'tableDelete',
];

/** Default (English) tooltips. Override any of them with the `labels` input. */
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
  colorCustom: 'Custom…',
  scopeSelection: 'Selection',
  scopeCell: 'Cell',
  scopeRow: 'Row',
  scopeColumn: 'Column',
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

/** French labels, ready to pass to `[labels]`. */
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
  colorCustom: 'Personnalisée…',
  scopeSelection: 'Sélection',
  scopeCell: 'Cellule',
  scopeRow: 'Ligne',
  scopeColumn: 'Colonne',
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

/** Commands that reflect a toggled state of the current selection. */
export const RTE_TOGGLE_COMMANDS: ReadonlySet<RteCommand> = new Set<RteCommand>([
  'paragraph', 'h1', 'h2', 'h3', 'bold', 'italic', 'underline', 'strikeThrough', 'subscript',
  'superscript', 'unorderedList', 'orderedList', 'blockquote', 'code', 'alignLeft', 'alignCenter',
  'alignRight', 'alignJustify', 'link', 'source',
]);
