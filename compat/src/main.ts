import { bootstrapApplication } from '@angular/platform-browser';
import { Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RichTextEditorComponent, VERSION_CHECK } from './imports';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RichTextEditorComponent, ReactiveFormsModule],
  template: `
    <p id="ng-version">{{ version }}</p>
    <ngx-rich-text-editor id="ed1" [(value)]="html" placeholder="Type…" />
    <pre id="out">{{ html() }}</pre>
    <ngx-rich-text-editor id="ed2" [formControl]="control" [toolbar]="['bold', 'italic']" />
    <pre id="form-out">{{ control.value }}</pre>
  `,
})
class AppComponent {
  readonly version = VERSION_CHECK;
  readonly html = signal('<p>Hello <img src="x" onerror="window.__xss = true"></p><script>window.__xss = true</script>');
  readonly control = new FormControl('<p>form</p>', { nonNullable: true });
}

bootstrapApplication(AppComponent).catch((err) => {
  console.error(err);
  document.body.setAttribute('data-bootstrap-error', String(err));
});
