import { Directive, TemplateRef, inject, input } from '@angular/core';
import { RteCommand } from './toolbar';

/**
 * Variables available in an `rteIcon` template.
 *
 * @example
 * ```html
 * <ng-template rteIcon="textColor" let-command let-active="active" let-color="color">
 *   <my-icon [name]="command" [class.on]="active" [style.color]="color" />
 * </ng-template>
 * ```
 * @since 0.4.0
 */
export interface RteIconContext {
  /** The command of the button (`let-command`), or `'openLink'` for the "open link" button. */
  $implicit: RteCommand | 'openLink';
  /**
   * `true` when the command applies to the selection, e.g. `bold` in bold text (`let-active="active"`).
   * The button already gets the pressed look; use it to change the icon itself.
   */
  active: boolean;
  /**
   * Last color picked (`let-color="color"`) for the color commands (`textColor`,
   * `backgroundColor`, `tableTextColor`, `tableBackground`), `null` for the other commands. The
   * default icons show it as a bar under the letter.
   */
  color: string | null;
}

/**
 * Replaces the icon of a toolbar button (main toolbar and table bar) with your own content: SVG,
 * icon font (Material Icons, Font Awesome…), image, text… Put the templates inside the editor
 * element and import `RteIconDirective` in your component.
 *
 * The button itself is kept: size and colors (CSS variables), hover and pressed looks, tooltip,
 * `aria-label`, disabled state. Commands without a template keep their default icon. `openLink`
 * replaces the icon of the "open link" button shown at the end of a link.
 *
 * Icons inherit the button color (`currentColor`), so `--nrte-btn-color` / `--nrte-btn-active-color`
 * apply to icon fonts and SVGs using `currentColor`.
 *
 * @example
 * ```html
 * <ngx-rich-text-editor [(value)]="html">
 *   <ng-template rteIcon="bold"><span class="material-icons">format_bold</span></ng-template>
 *   <ng-template rteIcon="textColor" let-color="color">
 *     <span class="material-icons" [style.color]="color">format_color_text</span>
 *   </ng-template>
 * </ngx-rich-text-editor>
 * ```
 * @see {@link RteIconContext} for the template variables
 * @since 0.4.0
 */
@Directive({
  selector: 'ng-template[rteIcon]',
  standalone: true,
})
export class RteIconDirective {
  /**
   * Command whose icon this template replaces, or `'openLink'` for the "open link" button. When
   * two templates target the same command, the last one wins.
   */
  readonly rteIcon = input.required<RteCommand | 'openLink'>();
  /** @internal */
  readonly template = inject<TemplateRef<RteIconContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: RteIconDirective, ctx: unknown): ctx is RteIconContext {
    return true;
  }
}
