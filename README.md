# @biliboobrian/ngx-rich-text-editor

Lightweight **rich text editor for Angular** that takes **HTML as input** and emits HTML.

- Standalone component, signals, `OnPush`, zoneless-friendly
- Two-way binding `[(value)]` **and** `ngModel` / Reactive Forms (`ControlValueAccessor`), or a
  control bound directly with `[control]`
- Incoming and pasted HTML is **sanitized** (allow-list: no `<script>`, no `on*` handlers, no `javascript:` URLs)
- Configurable toolbar, i18n labels (English + French included), HTML source view
- Themeable with CSS variables, no dependencies besides Angular

## Features

**Text**
- Bold, italic, underline, strikethrough, subscript, superscript
- Text color and highlight palettes (configurable swatches, custom color picker, "none")
- Paragraph, headings H1–H3, quote, code block, horizontal line
- Alignment: left, center, right, justify
- Clear formatting
- Undo / redo (every edit below can be undone)

**Lists**
- Bulleted and numbered lists, nested with <kbd>Tab</kbd> / <kbd>Shift + Tab</kbd>
- Mixed nesting: switching the type only changes the current level

**Links**
- Insert / edit (<kbd>Ctrl/⌘ + K</kbd>) and remove links, optional `target="_blank"`
- Follow a link in a new window: small button at the end of the link holding the caret, or
  <kbd>Ctrl/⌘ + click</kbd>
- Pluggable URL prompt (`promptFn`) to use your own dialog

**Images**
- Insert from your computer with the image button (file picker, embedded in base64), or from a
  URL (`imageSource: 'url'`)
- Drag and drop from the desktop, paste from the clipboard (e.g. screenshots)
- Pluggable upload (`imageUpload`), base64 by default
- Resize with corner handles (proportional, live size, double-click for the original size)
- Move an image by dragging it elsewhere in the text (<kbd>Ctrl</kbd> / <kbd>⌥</kbd> while dropping: copy)

**Tables**
- Insert a 3×3 table, floating bar to add / delete rows and columns or the table
- <kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> move between cells, <kbd>Tab</kbd> in the last cell adds a row
- Column widths by dragging the inner borders (the table keeps its width), table width by dragging
  its outer left / right borders (double-click: automatic widths)
- Row heights the same way: drag the inner borders (the table keeps its height), table height by
  dragging its outer top / bottom borders (double-click: automatic heights)
- Cell selection by dragging or <kbd>Shift</kbd> + click: formatting, colors, borders and
  <kbd>Delete</kbd> apply to the selected cells
- Cell text and background colors on the cell, row, column or selection
- Borders: sides (top, bottom, left, right, inside), width and color

**Comments**
- Comment any part of the text (<kbd>Ctrl/⌘ + Alt + M</kbd>), with the author and the date
- Threads of replies, resolve / reopen, delete your own comments and replies
- Bubble on the commented text, optional side panel listing every thread
- Comments stored apart from the HTML (`[(comments)]`), only `<span data-comment>` anchors in the HTML

**Editor**
- HTML source view
- Sanitizer with configurable allow-list (`sanitizeOptions`), optional plain-text paste
- Paste from Word, Excel, Google Docs / Sheets and other office suites: their style sheets are
  converted to inline styles (bold, colors, highlight, cell borders and backgrounds…), column
  widths are kept, Word and Google Docs lists become real nested lists
- Copy / cut for Office: selected cells or a table selected alone go to the clipboard as an Excel
  table (+ tab-separated text, line breaks kept in their cell), anything else as Word HTML with
  visible table borders
- Forms: `[(value)]`, `ngModel`, `[formControl]` / `formControlName`, or `[control]` (no forms
  directive needed)
- Read-only mode, placeholder, min / max height, accessible labels
- Customizable toolbars: buttons, custom icons (`rteIcon` templates), CSS variables for every size
  and color, `hide` to turn off any command or feature
- English and French labels, every text overridable
- Public methods: `focus`, `getHtml`, `insertHtml`, `execute`, `setColor`, `setTableBorder`
- JSDoc on the whole public API
- Unit tests run in a real browser (headless Chrome), on every push in CI

## Installation

```bash
npm install @biliboobrian/ngx-rich-text-editor
```

Requires Angular **19+** (`@angular/core`, `@angular/common`, `@angular/forms`).
Every push is tested in CI against Angular 19, 20 and the latest release (build + browser smoke test).

## Usage

```ts
import { Component, signal } from '@angular/core';
import { RichTextEditorComponent } from '@biliboobrian/ngx-rich-text-editor';

@Component({
  selector: 'app-root',
  imports: [RichTextEditorComponent],
  template: `
    <ngx-rich-text-editor [(value)]="html" placeholder="Write something…" />
    <pre>{{ html() }}</pre>
  `,
})
export class AppComponent {
  html = signal('<h2>Hello</h2><p>This is <strong>rich</strong> text.</p>');
}
```

Just one-way input + output:

```html
<ngx-rich-text-editor [value]="initialHtml" (valueChange)="save($event)" />
```

### Forms

```html
<!-- Reactive forms -->
<ngx-rich-text-editor [formControl]="body" />
<ngx-rich-text-editor formControlName="body" />

<!-- Template-driven -->
<ngx-rich-text-editor [(ngModel)]="article.body" name="body" />

<!-- Control bound directly, no forms directive needed -->
<ngx-rich-text-editor [control]="form.controls.body" />
```

`disable()` on the control puts the editor in read-only mode; `touched` is set on blur.

`[control]` takes any `AbstractControl` (e.g. `FormControl<string>` or `FormControl<string | null>`)
without importing `ReactiveFormsModule`: the editor follows its value and disabled state, edits
update it and mark it dirty, blur marks it touched. Use it instead of `[formControl]` /
`formControlName` / `ngModel`, not together.

## Inputs

| Input             | Type                                  | Default               | Description |
| ----------------- | ------------------------------------- | --------------------- | ----------- |
| `value`           | `string` (model)                      | `''`                  | HTML content. Supports `[(value)]`. |
| `placeholder`     | `string`                              | `''`                  | Shown when empty. |
| `toolbar`         | `RteToolbarItem[]`                    | `RTE_DEFAULT_TOOLBAR` | Buttons to show, `'|'` = separator. |
| `hideToolbar`     | `boolean`                             | `false`               | Hide the toolbar. |
| `tableToolbar`    | `RteToolbarItem[]`                    | `RTE_TABLE_TOOLBAR`   | Buttons of the floating table bar, `[]` hides it. |
| `hide`            | `RteHideable[]`                       | `[]`                  | Commands and features to turn off (see [Customizing the toolbar](#customizing-the-toolbar)). |
| `readonly`        | `boolean`                             | `false`               | Read-only mode. |
| `labels`          | `Partial<Record<RteLabelKey, string>>` | English              | Tooltips. `RTE_LABELS_FR` is provided. |
| `textColors`      | `string[]`                            | `RTE_TEXT_COLORS`     | Swatches of the text color palette. |
| `backgroundColors`| `string[]`                            | `RTE_BACKGROUND_COLORS` | Swatches of the background color palette. |
| `sanitize`        | `boolean`                             | `true`                | Sanitize incoming & pasted HTML. |
| `sanitizeOptions` | `RteSanitizeOptions`                  | `{}`                  | Allow extra tags / attributes / styles / classes. |
| `pastePlainText`  | `boolean`                             | `false`               | Always paste as plain text. |
| `linkTargetBlank` | `boolean`                             | `false`               | Inserted links open in a new tab. |
| `promptFn`        | `RtePromptFn`                         | `window.prompt`       | Ask for link / image URLs (plug your own dialog, may return a Promise). |
| `imageUpload`     | `RteImageUploadFn`                    | base64                | Turns picked / dropped / pasted image files into the `src` to use (e.g. upload and return the URL). |
| `imageSource`     | `'file' \| 'url'`                     | `'file'`              | Image button: file picker (base64) or URL prompt (`promptFn`). |
| `minHeight`       | `string`                              | `'160px'`             | Min height of the editable area. |
| `maxHeight`       | `string \| null`                      | `null`                | Max height before scrolling. |
| `ariaLabel`       | `string`                              | `'Rich text editor'`  | Accessible label. |
| `control`         | `AbstractControl \| null`             | `null`                | Form control bound directly (value, disabled, dirty, touched). |
| `comments`        | `RteComment[]` (model)                | `[]`                  | Comments and their threads. Supports `[(comments)]`. |
| `currentUser`     | `RteUser \| null`                     | `null`                | Author of new comments and replies (comments are read-only without it). |
| `commentsPanel`   | `boolean` (model)                     | `false`               | Side panel listing the comments. Supports `[(commentsPanel)]`. |

## Outputs

| Output        | Payload  | Description |
| ------------- | -------- | ----------- |
| `valueChange` | `string` | New HTML on every change. |
| `editorFocus` | `void`   | Editable area focused. |
| `editorBlur`  | `void`   | Editable area blurred. |
| `commentsChange` | `RteComment[]` | Comments added, answered, resolved or deleted. |
| `commentsPanelChange` | `boolean` | Panel opened / closed with its button. |

## Toolbar commands

`undo` `redo` `paragraph` `h1` `h2` `h3` `bold` `italic` `underline` `strikeThrough` `textColor`
`backgroundColor` `subscript`
`superscript` `unorderedList` `orderedList` `indent` `outdent` `blockquote` `code` `alignLeft`
`alignCenter` `alignRight` `alignJustify` `link` `unlink` `image` `table` `horizontalRule` `clear`
`source`, and the table commands `tableRowAbove` `tableRowBelow` `tableColLeft` `tableColRight`
`tableRowDelete` `tableColDelete` `tableTextColor` `tableBackground` `tableBorder` `tableDelete`, and
the comment commands `comment` `commentsPanel`.

```ts
toolbar: RteToolbarItem[] = ['bold', 'italic', '|', 'unorderedList', 'orderedList', '|', 'link', 'source'];
```

Keyboard: <kbd>Ctrl/⌘ + B / I / U</kbd> (native), <kbd>Ctrl/⌘ + K</kbd> insert link,
<kbd>Ctrl/⌘ + click</kbd> on a link opens it in a new window,
<kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> in a list nest / un-nest the item, in a table move to the
next / previous cell (<kbd>Tab</kbd> in the last cell adds a row).

Lists can be nested and mixed: indent an item, then switch the nested level to bullets or
numbers — only that level changes (e.g. a bulleted sub-list inside a numbered list).

`table` inserts a 3×3 table. While the caret is in a table, a floating bar offers the
row / column / delete commands (`RTE_TABLE_TOOLBAR`), plus table formatting:

- **column widths**: drag an inner column border to share the width between its two columns (the
  table keeps its width); drag the outer left / right border to resize the table (through its first /
  last column). Double-click a border to go back to automatic widths (stored as `<colgroup>` +
  `table-layout: fixed`);
- **row heights**: the same with the row borders. An inner border shares the height between its two
  rows (once the row below is down to its content, the table gets higher); the outer top / bottom
  borders resize the table through its first / last row. A row stops at the height of its content.
  Double-click a border to go back to automatic heights (stored as `<tr style="height">`);
- **text / background color** of the current cell, row or column (`tableTextColor`, `tableBackground`);
- **borders** (`tableBorder`) of the selected cells, or of the whole table: pick the sides — top,
  bottom, left, right edges and/or the inside lines, independently — then a width (none, 1, 2,
  3 px) and a color (`auto` = theme color). By code:
  `setTableBorder(2, { color: '#c92a2a', sides: { top: false, left: false, right: false, inner: false } })`;
- **cell selection**: drag across cells or Shift+click to select a rectangle of cells. Bold, italic,
  underline, strikethrough, alignment, text / background colors and borders then apply to the
  selected cells (as cell styles), <kbd>Delete</kbd> empties them, <kbd>Esc</kbd> cancels.

Formatting is written as inline styles on the cells, so the HTML renders the same outside the
editor. All list and table edits can be undone.

The **image** button opens a file picker: the chosen images (png, jpeg, gif, webp, bmp, several at
once) are inserted at the caret, embedded in base64. Set `imageSource="url"` to ask for an image URL
instead (through `promptFn`).

**Images** can also be dragged from the desktop into the editor (inserted where they are dropped)
or pasted from the clipboard (e.g. a screenshot). By default they are embedded in base64 (data URLs); pass
`imageUpload` to store them elsewhere (it is used for the image button too):

```ts
upload: RteImageUploadFn = async (file) => {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/images', { method: 'POST', body });
  return (await res.json()).url;
};
```

```html
<ngx-rich-text-editor [(value)]="html" [imageUpload]="upload" />
```

Click an image to select it: drag one of its corner handles to **resize** it (proportions are
kept, the size is shown while dragging, and the image can't get wider than its block). The size is
stored as a `width` attribute; double-click a handle to go back to the original size. Resizing can
be undone.

Drag an image to another place in the editor to **move** it (hold <kbd>Ctrl</kbd>, or <kbd>⌥</kbd> on
macOS, while dropping to copy it instead). The move can be undone in one step.

`textColor` / `backgroundColor` open a palette (plus "none" and a custom color picker) and
produce `<span style="color: …">` / `<span style="background-color: …">`. Change the swatches with
the `textColors` / `backgroundColors` inputs (defaults: `RTE_TEXT_COLORS`, `RTE_BACKGROUND_COLORS`),
or call `setColor('textColor', '#c92a2a')` (`null` removes the color;
`setColor('tableBackground', '#fff3bf', 'row')` colors table cells).

## Public methods

```ts
editor = viewChild.required(RichTextEditorComponent);

this.editor().focus();
this.editor().insertHtml('<p>Inserted at caret</p>');
this.editor().execute('bold');
this.editor().getHtml();

// comments
this.editor().addComment('To be checked');         // on the selected text
this.editor().replyToComment(id, 'Done');
this.editor().resolveComment(id);                  // resolveComment(id, false) reopens
this.editor().deleteComment(id);
this.editor().deleteReply(id, replyId);
this.editor().selectComment(id);                   // opens its thread
```

The sanitizer is also exported: `sanitizeHtml(html, document, options?)`.

## Comments

Select some text and click the comment button (or <kbd>Ctrl/⌘ + Alt + M</kbd>): the comment is
attached to that text, with its author and date. Clicking (or moving the caret into) a commented
passage opens its thread in a bubble: replies, resolve / reopen, delete. The side panel
(`commentsPanel` button or input) lists every thread in document order; with the panel open,
threads open in their card.

```ts
comments = signal<RteComment[]>([]);
me: RteUser = { id: 'u42', name: 'Pierre Hanauer', color: '#3b6cf6' };
```

```html
<ngx-rich-text-editor [(value)]="html" [(comments)]="comments" [currentUser]="me" />
```

- **Storage**: the HTML only gets anchors, `<span data-comment="{id}">commented text</span>`; the
  comments live in the `comments` array (`RteComment`: `id`, `author`, `date`, `text`,
  `resolved`, `replies`). Store both; publish the HTML without the comments (the anchors render
  as plain text).
- **Users**: `currentUser` writes the comments and replies; without it comments are read-only.
  Users may delete their own comments and replies. Setting `currentUser` adds the `comment` and
  `commentsPanel` buttons to the toolbar.
- **Undo**: marking text is one undo step. If the commented text is undone or deleted, the comment
  stays in the data and the panel shows it as "text deleted".
- **Highlighting** uses the CSS Custom Highlight API, so the open / resolved / active states never
  touch the HTML (older browsers highlight every anchor with plain CSS). Colors:
  `--nrte-comment-bg`, `--nrte-comment-active-bg`; panel: `--nrte-panel-width`, `--nrte-panel-bg`.
- `hide: ['comment']` turns comments off entirely; `hide: ['commentsPanel']` removes the panel button.

## Customizing the toolbar

### Buttons and features

`toolbar` and `tableToolbar` set the buttons of the main toolbar and of the floating table bar.
To keep the default layout but drop a few things, use `hide`: hidden commands disappear from both
bars (with the separators left alone) and their keyboard shortcut and `execute()` are ignored.

```html
<ngx-rich-text-editor [(value)]="html" [hide]="['image', 'table', 'source', 'columnResize']" />
```

`hide` also turns off features that aren't buttons:

| Feature         | Turns off |
| --------------- | --------- |
| `imageResize`   | resize handles on a clicked image |
| `imageMove`     | moving an image by dragging it |
| `imageDrop`     | inserting dropped / pasted image files (hiding `image` does it too) |
| `columnResize`  | resizing table columns from their borders |
| `rowResize`     | resizing table rows from their borders |
| `cellSelection` | selecting table cells (drag, Shift+click) |
| `linkOpen`      | "open link" button and <kbd>Ctrl/⌘ + click</kbd> |
| `tableToolbar`  | the floating table bar |

### Icons

Replace the icon of any button with an `rteIcon` template (SVG, icon font, image…). The button
itself — size, hover, tooltip, accessibility — is kept. The template gets the command, its `active`
state and, for the color commands, the last `color` picked. `openLink` replaces the icon of the
"open link" button.

```ts
import { RichTextEditorComponent, RteIconDirective } from '@biliboobrian/ngx-rich-text-editor';

@Component({
  imports: [RichTextEditorComponent, RteIconDirective],
  template: `
    <ngx-rich-text-editor [(value)]="html">
      <ng-template rteIcon="bold"><span class="material-icons">format_bold</span></ng-template>
      <ng-template rteIcon="textColor" let-color="color">
        <span class="material-icons" [style.color]="color">format_color_text</span>
      </ng-template>
      <ng-template rteIcon="undo" let-active="active"><img src="/icons/undo.svg" alt="" /></ng-template>
    </ngx-rich-text-editor>
  `,
})
```

### Theming

Set CSS variables on the editor element (or a class on it); every default can be overridden:

```css
ngx-rich-text-editor {
  /* editor */
  --nrte-accent: #e91e63;
  --nrte-accent-bg: rgba(233, 30, 99, 0.12);
  --nrte-border: #ccc;
  --nrte-radius: 4px;
  --nrte-bg: #fff;
  --nrte-text: #222;
  --nrte-muted: #999;
  --nrte-code-bg: #f3f4f6;
  --nrte-font: inherit;

  /* toolbars */
  --nrte-toolbar-bg: #fafafa;
  --nrte-toolbar-border: #ccc;        /* line under the toolbar, table bar border */
  --nrte-toolbar-padding: 6px;
  --nrte-toolbar-gap: 2px;
  --nrte-btn-size: 30px;              /* height and min width of the buttons */
  --nrte-btn-radius: 6px;
  --nrte-btn-color: inherit;
  --nrte-btn-hover-bg: rgba(233, 30, 99, 0.12);
  --nrte-btn-hover-color: inherit;
  --nrte-btn-active-bg: rgba(233, 30, 99, 0.12);
  --nrte-btn-active-color: #e91e63;
  --nrte-btn-disabled-opacity: 0.4;
  --nrte-icon-size: 18px;
  --nrte-icon-stroke: 2;              /* line width of the built-in icons */
  --nrte-sep-color: #ccc;

  /* comments */
  --nrte-comment-bg: rgba(255, 196, 0, 0.3);
  --nrte-comment-active-bg: rgba(255, 196, 0, 0.65);
  --nrte-panel-width: 280px;
  --nrte-panel-bg: #fafafa;
}
```

For anything else, the markup has stable hooks (all classes are prefixed with `.nrte`):
`.nrte__toolbar--main`, `.nrte__tablebar`, `.nrte__btn`, `.nrte__btn--active`, `.nrte__sep`,
`.nrte__icon`, and each button has a `data-command` attribute:

```css
ngx-rich-text-editor .nrte__btn[data-command='bold'] { color: #c92a2a; }
ngx-rich-text-editor .nrte__toolbar--main { position: sticky; top: 0; z-index: 4; }
```

## Notes

- Formatting relies on the browser's `contenteditable` / `document.execCommand`, which is deprecated
  on paper but still supported by every major browser and the most robust option without a heavy dependency.
- With SSR the editable area is rendered empty on the server and filled in the browser.

## Development

```bash
npm install
npm start            # demo app on http://localhost:4200
npm run build        # builds the library into dist/ngx-rich-text-editor
npm test             # unit tests (Karma + Jasmine, headless Chrome)
npm run test:watch   # tests in watch mode
npm run test:coverage  # tests + coverage report in coverage/
npm run publish:lib  # build + npm publish
```

Publishing is also automated: add an `NPM_TOKEN` secret to the repository and push a version tag (`git tag v0.1.0 && git push origin v0.1.0`).

## License

MIT © Pierre Hanauer
