import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RTE_LABELS_FR, RichTextEditorComponent, RteToolbarItem } from '@biliboobrian/ngx-rich-text-editor';

@Component({
  selector: 'app-root',
  imports: [RichTextEditorComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>ngx-rich-text-editor</h1>

      <section>
        <h2>1. Two-way binding <code>[(value)]</code></h2>
        <ngx-rich-text-editor [(value)]="html" [labels]="fr" placeholder="Écris quelque chose…" />
        <h3>HTML émis</h3>
        <pre>{{ html() }}</pre>
        <button type="button" (click)="html.set(sample)">Réinjecter un HTML d'exemple</button>
      </section>

      <section>
        <h2>2. Reactive Forms + toolbar réduite</h2>
        <ngx-rich-text-editor [formControl]="control" [toolbar]="compact" minHeight="100px" />
        <p>
          <label><input type="checkbox" (change)="toggleDisabled($event)" /> désactiver le contrôle</label>
          — dirty: {{ control.dirty }} / touched: {{ control.touched }}
        </p>
        <pre>{{ control.value }}</pre>
      </section>
    </main>
  `,
  styles: `
    main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
    section { margin-top: 32px; }
    pre { white-space: pre-wrap; word-break: break-all; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; font-size: 12px; }
    button { margin-top: 8px; }
  `,
})
export class AppComponent {
  readonly fr = RTE_LABELS_FR;
  readonly sample = `<h2>Bonjour 👋</h2>
<p>Ceci est un <strong>éditeur</strong> de <em>texte riche</em> qui prend du <u>HTML</u> en entrée.</p>
<ul><li>Listes</li><li>Liens : <a href="https://angular.dev">angular.dev</a></li></ul>
<blockquote>Le HTML entrant est nettoyé (pas de &lt;script&gt;, pas de onerror…).</blockquote>
<img src="x" onerror="alert('xss')"><script>alert('xss')</script>`;

  readonly html = signal(this.sample);
  readonly control = new FormControl('<p>Contenu initial du <b>formulaire</b></p>', { nonNullable: true });
  readonly compact: RteToolbarItem[] = ['bold', 'italic', 'underline', '|', 'unorderedList', 'orderedList', '|', 'link'];

  toggleDisabled(event: Event): void {
    (event.target as HTMLInputElement).checked ? this.control.disable() : this.control.enable();
  }
}
