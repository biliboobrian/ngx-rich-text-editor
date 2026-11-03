import { Directive, TemplateRef, inject, input } from '@angular/core';
import { RteCommand } from './toolbar';

/** Context of an `rteIcon` template. */
export interface RteIconContext {
  /** The command of the button. */
  $implicit: RteCommand | 'openLink';
  /** The command applies to the selection (e.g. bold text): the button is shown as pressed. */
  active: boolean;
  /** Last color picked, for the color commands (`textColor`, `backgroundColor`, `tableTextColor`, `tableBackground`). */
  color: string | null;
}

/**
 * Replaces the icon of a toolbar button (main toolbar and table bar) with your own content: SVG,
 * icon font, image… The button itself (size, hover, tooltip, accessibility) is kept. `openLink`
 * replaces the icon of the "open link" button.
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
 */
@Directive({
  selector: 'ng-template[rteIcon]',
  standalone: true,
})
export class RteIconDirective {
  /** Command whose icon this template replaces. */
  readonly rteIcon = input.required<RteCommand | 'openLink'>();
  /** @internal */
  readonly template = inject<TemplateRef<RteIconContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: RteIconDirective, ctx: unknown): ctx is RteIconContext {
    return true;
  }
}
