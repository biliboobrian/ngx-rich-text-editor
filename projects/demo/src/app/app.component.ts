import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  RTE_BACKGROUND_COLORS,
  RTE_LABELS_FR,
  RTE_TEXT_COLORS,
  RichTextEditorComponent,
  RteComment,
  RteHideable,
  RteIconDirective,
  RteToolbarItem,
  RteUser,
} from '@biliboobrian/ngx-rich-text-editor';

/** PNG data URL of a test image showing its own size (no network needed). */
function testImage(width: number, height: number, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, '#1f2328');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(10, Math.round(height / 6))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${width} × ${height}`, width / 2, height / 2);
  return canvas.toDataURL('image/png');
}

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore ' +
  'magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.';

/** Test document using every format the editor produces: styles, positions and sizes. */
function showcaseDocument(): string {
  const photo = testImage(400, 200, '#3b6cf6');
  const square = testImage(120, 120, '#c92a2a');
  const swatches = (colors: readonly string[], prop: string) =>
    colors.map((c) => `<span style="${prop}: ${c}">${c}</span>`).join(' ');
  const border = (w: number) => (w ? `${w}px solid #1f2328` : 'hidden');

  return [
    // ---------------------------------------------------------------- headings
    '<h1>Titre 1 — h1</h1>',
    '<h2>Titre 2 — h2</h2>',
    '<h3>Titre 3 — h3</h3>',
    '<p>Paragraphe normal — p.</p>',

    // ---------------------------------------------------------------- text styles
    '<h2>Styles de texte</h2>',
    '<p><b>Gras</b> · <i>Italique</i> · <u>Souligné</u> · <s>Barré</s> · H<sub>2</sub>O (indice) · ' +
      'E = mc<sup>2</sup> (exposant) · <code>code en ligne</code></p>',
    '<p>Combinés : <b><i>gras italique</i></b> · <b><u>gras souligné</u></b> · <i><s>italique barré</s></i> · ' +
      '<b><i><u>gras italique souligné</u></i></b></p>',
    '<p>Liens : <a href="https://angular.dev">angular.dev</a> · ' +
      '<a href="https://github.com" target="_blank" rel="noopener noreferrer">nouvel onglet</a> · ' +
      '<a href="mailto:test@example.com">e-mail</a> · <a href="#ancre">ancre</a></p>',

    // ---------------------------------------------------------------- colors
    '<h2>Couleurs</h2>',
    `<p>Texte : ${swatches(RTE_TEXT_COLORS, 'color')}</p>`,
    `<p>Surlignage : ${swatches(RTE_BACKGROUND_COLORS, 'background-color')}</p>`,
    '<p><span style="color: #ffffff; background-color: #1864ab">Texte clair sur fond foncé</span> · ' +
      '<b><span style="color: #c92a2a; background-color: #fff3bf">gras rouge surligné</span></b></p>',

    // ---------------------------------------------------------------- positions
    '<h2>Alignements</h2>',
    `<p style="text-align: left"><b>Gauche.</b> ${LOREM}</p>`,
    `<p style="text-align: center"><b>Centré.</b> ${LOREM}</p>`,
    `<p style="text-align: right"><b>Droite.</b> ${LOREM}</p>`,
    `<p style="text-align: justify"><b>Justifié.</b> ${LOREM} ${LOREM}</p>`,
    '<h3 style="text-align: center">Titre centré</h3>',

    '<h2>Retraits</h2>',
    '<p>Sans retrait</p>',
    '<p style="margin-left: 40px">Retrait de 40 px</p>',
    '<p style="margin-left: 80px">Retrait de 80 px</p>',
    '<p style="margin-left: 120px">Retrait de 120 px</p>',

    // ---------------------------------------------------------------- lists
    '<h2>Listes</h2>',
    '<ul><li>Puce niveau 1<ul><li>Puce niveau 2<ul><li>Puce niveau 3</li></ul></li></ul></li><li>Deuxième puce</li></ul>',
    '<ol><li>Numéro niveau 1<ol><li>Numéro niveau 2<ol><li>Numéro niveau 3</li></ol></li></ol></li><li>Deuxième numéro</li></ol>',
    '<ol><li>Liste mixte : numéros<ul><li>puis puces<ol><li>puis numéros</li></ol></li></ul></li></ol>',
    '<ul><li><b>Puce en gras</b> avec <a href="https://angular.dev">un lien</a></li>' +
      '<li style="text-align: center">Puce centrée</li><li><span style="color: #2b8a3e">Puce colorée</span></li></ul>',

    // ---------------------------------------------------------------- blocks
    '<h2>Blocs</h2>',
    '<blockquote>Citation — blockquote. <i>« La simplicité est la sophistication suprême. »</i></blockquote>',
    '<pre>Bloc de code — pre\nfunction hello(name: string) {\n  return `Bonjour ${name}`;\n}</pre>',
    '<p>Ligne horizontale :</p>',
    '<hr>',

    // ---------------------------------------------------------------- images
    '<h2>Images — tailles</h2>',
    `<p><img src="${photo}" alt="400 px"></p>`,
    `<p><img src="${photo}" width="300" alt="300 px"> <img src="${photo}" width="200" alt="200 px"></p>`,
    `<p><img src="${photo}" width="100" alt="100 px"> <img src="${photo}" width="50" alt="50 px"> ` +
      `<img src="${square}" width="50" alt="carré 50 px"></p>`,

    '<h2>Images — positions</h2>',
    `<p style="text-align: left"><img src="${square}" alt="gauche"></p>`,
    `<p style="text-align: center"><img src="${square}" alt="centre"></p>`,
    `<p style="text-align: right"><img src="${square}" alt="droite"></p>`,
    `<p>Image dans le texte <img src="${square}" width="24" alt="en ligne"> au milieu d'une phrase.</p>`,
    `<p><a href="https://angular.dev"><img src="${square}" width="60" alt="lien"></a> Image dans un lien</p>`,

    // ---------------------------------------------------------------- tables
    '<h2>Tableaux</h2>',
    '<p>Largeurs automatiques, en-tête et alignements :</p>',
    '<table><tbody>' +
      '<tr><th>Gauche</th><th style="text-align: center">Centre</th><th style="text-align: right">Droite</th></tr>' +
      '<tr><td>a</td><td style="text-align: center">b</td><td style="text-align: right">c</td></tr>' +
      '<tr><td><b>gras</b></td><td style="text-align: center"><i>italique</i></td><td style="text-align: right">1 234,56</td></tr>' +
      '</tbody></table>',
    '<p>Colonnes de 80, 160 et 240 px :</p>',
    '<table style="table-layout: fixed; width: 480px"><colgroup><col style="width: 80px"><col style="width: 160px"><col style="width: 240px"></colgroup><tbody>' +
      '<tr><td>80 px</td><td>160 px</td><td>240 px</td></tr>' +
      `<tr><td>${LOREM.slice(0, 40)}</td><td>${LOREM.slice(0, 80)}</td><td>${LOREM.slice(0, 120)}</td></tr>` +
      '</tbody></table>',
    '<p>Couleurs de cellules (ligne, colonne, cellule) :</p>',
    '<table><tbody>' +
      '<tr><td style="background-color: #1864ab; color: #ffffff">ligne</td><td style="background-color: #1864ab; color: #ffffff">colorée</td><td style="background-color: #1864ab; color: #ffffff">en bleu</td></tr>' +
      '<tr><td style="background-color: #d3f9d8">colonne</td><td>—</td><td style="color: #c92a2a"><b>texte rouge</b></td></tr>' +
      '<tr><td style="background-color: #d3f9d8">verte</td><td style="background-color: #ffe3e3">cellule rose</td><td>—</td></tr>' +
      '</tbody></table>',
    '<p>Épaisseurs de bordure 0, 1, 2 et 3 px :</p>',
    '<table><tbody><tr>' +
      [0, 1, 2, 3]
        .map((w) => `<td style="border-top: ${border(w)}; border-bottom: ${border(w)}; border-left: ${border(w)}; border-right: ${border(w)}">${w} px</td>`)
        .join('') +
      '</tr></tbody></table>',
    '<p>Bordures par côté (haut rouge, bas bleu, gauche verte, droite orange) :</p>',
    '<table><tbody><tr><td style="border-top: 3px solid #c92a2a; border-bottom: 3px solid #1864ab; ' +
      'border-left: 3px solid #2b8a3e; border-right: 3px solid #e8590c">cellule</td></tr></tbody></table>',
    '<p>Image dans un tableau :</p>',
    `<table><tbody><tr><td><img src="${square}" width="60" alt="cellule"></td><td>Texte à côté de l'image</td></tr></tbody></table>`,
    '<p>Fin du document de test.</p>',
  ].join('');
}

/** Review threads of the comments example (several authors, replies, a resolved thread). */
function demoComments([pierre, lea, karim]: RteUser[]): RteComment[] {
  let n = 0;
  const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 10, day, hour, minute)).toISOString();
  const reply = (author: RteUser, date: string, text: string) => ({ id: `r${++n}`, author, date, text });
  return [
    {
      id: 'c1', author: lea, date: at(2, 9, 15), text: 'Source du chiffre ?', resolved: false,
      replies: [
        reply(pierre, at(2, 10, 2), 'Tableau de bord finance, onglet T3.'),
        reply(lea, at(2, 10, 30), 'Merci ! Peux-tu ajouter le lien en note de bas de page ?'),
        reply(pierre, at(2, 11, 5), 'C’est fait.'),
      ],
    },
    {
      id: 'c2', author: karim, date: at(2, 14, 0), text: 'On avait 37 % au T2 : préciser la progression ?', resolved: false,
      replies: [reply(lea, at(2, 15, 20), 'Oui, « contre 37 % au T2 » serait plus parlant.')],
    },
    { id: 'c3', author: lea, date: at(2, 16, 45), text: '« Légère » : +0,4 point, on peut le chiffrer.', resolved: true, replies: [] },
    {
      id: 'c4', author: karim, date: at(3, 8, 10),
      text: 'Paragraphe à reformuler : le lien entre énergie et transport n’est pas clair pour le comité.',
      resolved: false, replies: [],
    },
    {
      id: 'c5', author: pierre, date: at(3, 8, 40), text: 'À confirmer avec la logistique : contrats signés ou en cours ?', resolved: false,
      replies: [reply(karim, at(3, 9, 5), 'Deux signés sur trois, le dernier fin novembre.')],
    },
    { id: 'c6', author: lea, date: at(3, 11, 0), text: 'Doublée par rapport à quoi ? L’ancien site de Villeurbanne ?', resolved: false, replies: [] },
    { id: 'c7', author: karim, date: at(3, 13, 30), text: 'Dont 4 en alternance.', resolved: true, replies: [reply(pierre, at(3, 13, 45), 'Ajouté.')] },
    { id: 'c8', author: pierre, date: at(3, 15, 0), text: 'Valeur arrondie, la vraie est 134,20 €.', resolved: false, replies: [] },
    {
      id: 'c9', author: lea, date: at(3, 17, 20), text: 'Objectif validé par la direction ?', resolved: false,
      replies: [
        reply(pierre, at(3, 17, 50), 'Pas encore, réunion jeudi.'),
        reply(karim, at(3, 18, 5), 'Je propose d’écrire « entre 12 et 15 % » en attendant.'),
      ],
    },
  ];
}

@Component({
  selector: 'app-root',
  imports: [RichTextEditorComponent, RteIconDirective, ReactiveFormsModule],
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

      <section>
        <h2>3. Tous les styles, positions et tailles</h2>
        <p>Document de test : chaque mise en forme que l'éditeur sait produire, pour vérifier le rendu et l'édition.</p>
        <ngx-rich-text-editor [(value)]="showcase" [labels]="fr" />
        <button type="button" (click)="showcase.set(showcaseHtml)">Réinitialiser le document de test</button>
        <details>
          <summary>HTML émis</summary>
          <pre>{{ showcase() }}</pre>
        </details>
      </section>

      <section>
        <h2>4. Barre personnalisée</h2>
        <p>
          Icônes remplacées par des templates <code>rteIcon</code>, thème sombre par variables CSS, et
          fonctionnalités masquées avec <code>[hide]</code> :
        </p>
        <p class="hide-options">
          @for (option of hideOptions; track option) {
            <label>
              <input type="checkbox" [checked]="hidden().includes(option)" (change)="toggleHidden(option)" />
              {{ option }}
            </label>
          }
        </p>
        <ngx-rich-text-editor class="custom" [(value)]="custom" [labels]="fr" [hide]="hidden()" minHeight="120px">
          <ng-template rteIcon="bold"><span class="ico">𝐁</span></ng-template>
          <ng-template rteIcon="italic"><span class="ico">𝑰</span></ng-template>
          <ng-template rteIcon="underline"><span class="ico">U̲</span></ng-template>
          <ng-template rteIcon="undo"><span class="ico">↶</span></ng-template>
          <ng-template rteIcon="redo"><span class="ico">↷</span></ng-template>
          <ng-template rteIcon="link"><span class="ico">🔗</span></ng-template>
          <ng-template rteIcon="image"><span class="ico">🖼️</span></ng-template>
          <ng-template rteIcon="table"><span class="ico">▦</span></ng-template>
          <ng-template rteIcon="textColor" let-color="color">
            <span class="ico" [style.border-bottom]="'3px solid ' + color">A</span>
          </ng-template>
          <ng-template rteIcon="openLink"><span>↗</span></ng-template>
        </ngx-rich-text-editor>
      </section>

      <section>
        <h2>5. Commentaires</h2>
        <p>
          Sélectionnez du texte puis cliquez sur le bouton commentaire (ou <kbd>Ctrl+Alt+M</kbd>). Changez
          d'utilisateur pour répondre comme un relecteur.
        </p>
        <p class="hide-options">
          Utilisateur :
          @for (user of users; track user.id) {
            <label><input type="radio" name="user" [checked]="me() === user" (change)="me.set(user)" /> {{ user.name }}</label>
          }
          <label><input type="radio" name="user" [checked]="me() === null" (change)="me.set(null)" /> aucun (lecture seule)</label>
        </p>
        <ngx-rich-text-editor
          [(value)]="reviewed"
          [(comments)]="comments"
          [(commentsPanel)]="commentsPanel"
          [currentUser]="me()"
          [labels]="fr"
          minHeight="560px"
        />
        <details>
          <summary>Commentaires (JSON, stockés à part du HTML)</summary>
          <pre>{{ commentsJson() }}</pre>
        </details>
        <details>
          <summary>HTML émis</summary>
          <pre>{{ reviewed() }}</pre>
        </details>
      </section>
    </main>
  `,
  styles: `
    main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
    section { margin-top: 32px; }
    pre { white-space: pre-wrap; word-break: break-all; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; font-size: 12px; }
    button { margin-top: 8px; }
    details { margin-top: 8px; }
    .hide-options { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; }
    .hide-options label { white-space: nowrap; }
    ngx-rich-text-editor.custom {
      --nrte-bg: #0d1117;
      --nrte-text: #e6edf3;
      --nrte-muted: #7d8590;
      --nrte-border: #30363d;
      --nrte-code-bg: #161b22;
      --nrte-accent: #f78166;
      --nrte-accent-bg: rgba(247, 129, 102, 0.15);
      --nrte-radius: 12px;
      --nrte-toolbar-bg: #161b22;
      --nrte-toolbar-padding: 8px 10px;
      --nrte-toolbar-gap: 6px;
      --nrte-btn-size: 36px;
      --nrte-btn-radius: 50%;
      --nrte-btn-color: #c9d1d9;
      --nrte-btn-hover-bg: #30363d;
      --nrte-btn-active-bg: #f78166;
      --nrte-btn-active-color: #0d1117;
      --nrte-icon-size: 20px;
      --nrte-icon-stroke: 1.5;
      --nrte-sep-color: transparent;
    }
    .ico { font-size: 18px; line-height: 1; }
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

  readonly showcaseHtml = showcaseDocument();
  readonly showcase = signal(this.showcaseHtml);

  readonly custom = signal(
    '<h2>Barre personnalisée</h2><p>Du <b>gras</b>, un <a href="https://angular.dev">lien</a> et un tableau :</p>'
      + '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p></p>',
  );
  readonly hideOptions: RteHideable[] = [
    'image', 'table', 'source', 'code', 'blockquote', 'imageResize', 'imageMove', 'imageDrop',
    'columnResize', 'cellSelection', 'linkOpen', 'tableToolbar',
  ];
  readonly hidden = signal<RteHideable[]>(['source', 'code']);

  readonly users: RteUser[] = [
    { id: 'u1', name: 'Pierre Hanauer' },
    { id: 'u2', name: 'Léa Martin', color: '#c92a2a' },
    { id: 'u3', name: 'Karim Benali', color: '#2b8a3e' },
  ];
  readonly me = signal<RteUser | null>(this.users[0]);
  readonly reviewed = signal(
    [
      '<h1>Rapport trimestriel — T3 2026</h1>',
      '<h2>1. Synthèse</h2>',
      '<p>Le chiffre d’affaires a <span data-comment="c1">progressé de 12 %</span> sur le trimestre, porté par '
        + 'les ventes en ligne qui représentent désormais <span data-comment="c2">41 % du total</span>. La marge '
        + 'brute s’établit à 38,5 %, en <span data-comment="c3">légère amélioration</span> par rapport au T2.</p>',
      '<p><span data-comment="c4">Les coûts logistiques restent stables malgré la hausse des prix de l’énergie, '
        + 'grâce à la <span data-comment="c5">renégociation des contrats</span> de transport.</span></p>',
      '<h2>2. Faits marquants</h2>',
      '<ul>',
      '<li>Ouverture de l’entrepôt de Lyon (<span data-comment="c6">capacité doublée</span>).</li>',
      '<li>Lancement de l’application mobile : 85 000 téléchargements en six semaines.</li>',
      '<li>Recrutement de <span data-comment="c7">14 personnes</span> au service client.</li>',
      '</ul>',
      '<h2>3. Chiffres clés</h2>',
      '<table><tbody>',
      '<tr><th>Indicateur</th><th>T2</th><th>T3</th><th>Évolution</th></tr>',
      '<tr><td>Chiffre d’affaires</td><td>8,2 M€</td><td>9,2 M€</td><td>+12 %</td></tr>',
      '<tr><td>Commandes</td><td>61 400</td><td>68 900</td><td>+12,2 %</td></tr>',
      '<tr><td>Panier moyen</td><td>133 €</td><td><span data-comment="c8">134 €</span></td><td>+0,8 %</td></tr>',
      '</tbody></table>',
      '<h2>4. Perspectives</h2>',
      '<p>Le quatrième trimestre devrait bénéficier des fêtes de fin d’année. Nous visons '
        + '<span data-comment="c9">une croissance de 15 %</span>, avec un effort particulier sur la '
        + 'fidélisation des clients existants.</p>',
      '<blockquote>Prochaine revue : 15 janvier 2027.</blockquote>',
    ].join(''),
  );
  readonly comments = signal<readonly RteComment[]>(demoComments(this.users));
  readonly commentsPanel = signal(true);
  readonly commentsJson = computed(() => JSON.stringify(this.comments(), null, 2));

  toggleHidden(option: RteHideable): void {
    this.hidden.update((list) => (list.includes(option) ? list.filter((o) => o !== option) : [...list, option]));
  }

  toggleDisabled(event: Event): void {
    (event.target as HTMLInputElement).checked ? this.control.disable() : this.control.enable();
  }
}
