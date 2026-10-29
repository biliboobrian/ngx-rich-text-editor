# @biliboobrian/ngx-rich-text-editor

Lightweight **rich text editor for Angular** that takes **HTML as input** and emits HTML.

- Standalone component, signals, `OnPush`, zoneless-friendly
- Two-way binding `[(value)]` **and** `ngModel` / Reactive Forms (`ControlValueAccessor`)
- Incoming and pasted HTML is **sanitized** (allow-list: no `<script>`, no `on*` handlers, no `javascript:` URLs)
- Configurable toolbar, i18n labels (English + French included), HTML source view
- Themeable with CSS variables, no dependencies besides Angular

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
```

`disable()` on the control puts the editor in read-only mode; `touched` is set on blur.

## Inputs

| Input             | Type                                  | Default               | Description |
| ----------------- | ------------------------------------- | --------------------- | ----------- |
| `value`           | `string` (model)                      | `''`                  | HTML content. Supports `[(value)]`. |
| `placeholder`     | `string`                              | `''`                  | Shown when empty. |
| `toolbar`         | `RteToolbarItem[]`                    | `RTE_DEFAULT_TOOLBAR` | Buttons to show, `'|'` = separator. |
| `hideToolbar`     | `boolean`                             | `false`               | Hide the toolbar. |
| `readonly`        | `boolean`                             | `false`               | Read-only mode. |
| `labels`          | `Partial<Record<RteLabelKey, string>>` | English              | Tooltips. `RTE_LABELS_FR` is provided. |
| `textColors`      | `string[]`                            | `RTE_TEXT_COLORS`     | Swatches of the text color palette. |
| `backgroundColors`| `string[]`                            | `RTE_BACKGROUND_COLORS` | Swatches of the background color palette. |
| `sanitize`        | `boolean`                             | `true`                | Sanitize incoming & pasted HTML. |
| `sanitizeOptions` | `RteSanitizeOptions`                  | `{}`                  | Allow extra tags / attributes / styles / classes. |
| `pastePlainText`  | `boolean`                             | `false`               | Always paste as plain text. |
| `linkTargetBlank` | `boolean`                             | `false`               | Inserted links open in a new tab. |
| `promptFn`        | `RtePromptFn`                         | `window.prompt`       | Ask for link / image URLs (plug your own dialog, may return a Promise). |
| `imageUpload`     | `RteImageUploadFn`                    | data URL              | Turns dropped / pasted image files into the `src` to use (e.g. upload and return the URL). |
| `minHeight`       | `string`                              | `'160px'`             | Min height of the editable area. |
| `maxHeight`       | `string \| null`                      | `null`                | Max height before scrolling. |
| `ariaLabel`       | `string`                              | `'Rich text editor'`  | Accessible label. |

## Outputs

| Output        | Payload  | Description |
| ------------- | -------- | ----------- |
| `valueChange` | `string` | New HTML on every change. |
| `editorFocus` | `void`   | Editable area focused. |
| `editorBlur`  | `void`   | Editable area blurred. |

## Toolbar commands

`undo` `redo` `paragraph` `h1` `h2` `h3` `bold` `italic` `underline` `strikeThrough` `textColor`
`backgroundColor` `subscript`
`superscript` `unorderedList` `orderedList` `indent` `outdent` `blockquote` `code` `alignLeft`
`alignCenter` `alignRight` `alignJustify` `link` `unlink` `image` `table` `horizontalRule` `clear`
`source`, and the table commands `tableRowAbove` `tableRowBelow` `tableColLeft` `tableColRight`
`tableRowDelete` `tableColDelete` `tableTextColor` `tableBackground` `tableBorder` `tableDelete`.

```ts
toolbar: RteToolbarItem[] = ['bold', 'italic', '|', 'unorderedList', 'orderedList', '|', 'link', 'source'];
```

Keyboard: <kbd>Ctrl/⌘ + B / I / U</kbd> (native), <kbd>Ctrl/⌘ + K</kbd> insert link,
<kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> in a list nest / un-nest the item, in a table move to the
next / previous cell (<kbd>Tab</kbd> in the last cell adds a row).

Lists can be nested and mixed: indent an item, then switch the nested level to bullets or
numbers — only that level changes (e.g. a bulleted sub-list inside a numbered list).

`table` inserts a 3×3 table. While the caret is in a table, a floating bar offers the
row / column / delete commands (`RTE_TABLE_TOOLBAR`), plus table formatting:

- **column widths**: drag a column border; double-click it to go back to automatic widths
  (stored as `<colgroup>` + `table-layout: fixed`);
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

**Images** can also be dragged from the desktop into the editor (inserted where they are dropped)
or pasted from the clipboard (e.g. a screenshot). By default they are embedded as data URLs; pass
`imageUpload` to store them elsewhere:

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
```

The sanitizer is also exported: `sanitizeHtml(html, document, options?)`.

## Theming

```css
ngx-rich-text-editor {
  --nrte-accent: #e91e63;
  --nrte-accent-bg: rgba(233, 30, 99, 0.12);
  --nrte-border: #ccc;
  --nrte-radius: 4px;
  --nrte-bg: #fff;
  --nrte-toolbar-bg: #fafafa;
  --nrte-text: #222;
  --nrte-muted: #999;
  --nrte-code-bg: #f3f4f6;
  --nrte-font: inherit;
}
```

All internal classes are prefixed with `.nrte` if you need deeper customisation.

## Notes

- Formatting relies on the browser's `contenteditable` / `document.execCommand`, which is deprecated
  on paper but still supported by every major browser and the most robust option without a heavy dependency.
- With SSR the editable area is rendered empty on the server and filled in the browser.

## Development

```bash
npm install
npm start            # demo app on http://localhost:4200
npm run build        # builds the library into dist/ngx-rich-text-editor
npm run publish:lib  # build + npm publish
```

Publishing is also automated: add an `NPM_TOKEN` secret to the repository and push a version tag (`git tag v0.1.0 && git push origin v0.1.0`).

## License

MIT © Pierre Hanauer
