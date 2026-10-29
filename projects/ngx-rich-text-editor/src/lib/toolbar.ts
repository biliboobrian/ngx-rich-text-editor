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
  | 'horizontalRule'
  | 'clear'
  | 'source';

/** A toolbar entry: a command, or `'|'` for a visual separator. */
export type RteToolbarItem = RteCommand | '|';

/** Function used to ask the user for a URL (link or image). Return `null` to cancel. */
export type RtePromptFn = (
  kind: 'link' | 'image',
  currentValue: string,
) => string | null | undefined | Promise<string | null | undefined>;

export const RTE_DEFAULT_TOOLBAR: readonly RteToolbarItem[] = [
  'undo', 'redo', '|',
  'paragraph', 'h1', 'h2', 'h3', '|',
  'bold', 'italic', 'underline', 'strikeThrough', '|',
  'unorderedList', 'orderedList', 'blockquote', 'code', '|',
  'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', '|',
  'link', 'unlink', 'image', 'table', 'horizontalRule', '|',
  'clear', 'source',
];

/** Buttons of the floating bar shown while the caret is in a table. */
export const RTE_TABLE_TOOLBAR: readonly RteToolbarItem[] = [
  'tableRowAbove', 'tableRowBelow', 'tableRowDelete', '|',
  'tableColLeft', 'tableColRight', 'tableColDelete', '|',
  'tableDelete',
];

/** Default (English) tooltips. Override any of them with the `labels` input. */
export const RTE_DEFAULT_LABELS: Readonly<Record<RteCommand, string>> = {
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
  horizontalRule: 'Horizontal line',
  clear: 'Clear formatting',
  source: 'HTML source',
};

/** French labels, ready to pass to `[labels]`. */
export const RTE_LABELS_FR: Readonly<Record<RteCommand, string>> = {
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
