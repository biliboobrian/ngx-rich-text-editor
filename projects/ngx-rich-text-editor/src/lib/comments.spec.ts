import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichTextEditorComponent } from './rich-text-editor.component';
import { RteComment, RteUser } from './comments';
import { RteHideable } from './toolbar';
import { sanitizeHtml } from './sanitize';

const ME: RteUser = { id: 'u1', name: 'Pierre Hanauer', color: 'rgb(59, 108, 246)' };
const OTHER: RteUser = { id: 'u2', name: 'Léa' };

@Component({
  imports: [RichTextEditorComponent],
  template: `
    <ngx-rich-text-editor
      [(value)]="html"
      [(comments)]="comments"
      [(commentsPanel)]="panel"
      [currentUser]="user()"
      [readonly]="readonly()"
      [hide]="hide()"
    />
  `,
})
class HostComponent {
  readonly html = signal('<p>hello world</p><p>second line</p>');
  readonly comments = signal<readonly RteComment[]>([]);
  readonly panel = signal(false);
  readonly user = signal<RteUser | null>(ME);
  readonly readonly = signal(false);
  readonly hide = signal<RteHideable[]>([]);
  readonly editor = viewChild.required(RichTextEditorComponent);
}

describe('Comments', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;
  let content: HTMLElement;

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  function select(start: Node, startOffset: number, end = start, endOffset = startOffset): void {
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const text = (selector: string) => content.querySelector(selector)!.firstChild!;
  const bubble = () => el.querySelector<HTMLElement>('.nrte__comment-bubble');
  const button = (command: string) => el.querySelector<HTMLButtonElement>(`[data-command="${command}"]`);
  /** HTML with the comment ids replaced by their position in `comments`. */
  const html = () =>
    host.comments().reduce((out, c, i) => out.split(c.id).join(`#${i}`), host.editor().value());

  /** Selects `[start, end)` of the text of `selector`, opens the new comment form and posts `body`. */
  async function comment(selector: string, start: number, end: number, body: string): Promise<void> {
    content.focus();
    select(text(selector), start, text(selector), end);
    await settle();
    button('comment')!.click();
    await settle();
    const draft = bubble()!.querySelector('textarea')!;
    draft.value = body;
    bubble()!.querySelector<HTMLButtonElement>('.nrte__comment-btn--primary')!.click();
    await settle();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await settle();
    el = fixture.nativeElement;
    content = el.querySelector('.nrte__content')!;
  });

  afterEach(() => document.getSelection()?.removeAllRanges());

  describe('toolbar', () => {
    it('adds the comment buttons when there is a current user', () => {
      const items = Array.from(el.querySelectorAll('.nrte__toolbar--main > *'), (n) => n.getAttribute('data-command') ?? '|');
      expect(items.slice(-3)).toEqual(['|', 'comment', 'commentsPanel']);
    });

    it('only adds the panel button for reading comments without a current user', async () => {
      host.user.set(null);
      await settle();
      expect(button('comment')).toBeNull();
      expect(button('commentsPanel')).toBeNull();
      host.comments.set([{ id: 'c1', author: OTHER, date: '2026-01-01T10:00:00Z', text: 'x', resolved: false, replies: [] }]);
      await settle();
      expect(button('comment')).toBeNull();
      expect(button('commentsPanel')).not.toBeNull();
    });

    it("hide: ['comment'] turns comments off", async () => {
      host.hide.set(['comment']);
      await settle();
      expect(button('comment')).toBeNull();
      expect(button('commentsPanel')).toBeNull();
    });
  });

  describe('adding', () => {
    it('marks the selected text and adds the comment', async () => {
      await comment('p', 6, 11, '  Source ?  ');
      expect(html()).toBe('<p>hello <span data-comment="#0">world</span></p><p>second line</p>');
      const [added] = host.comments();
      expect(added.author).toEqual(ME);
      expect(added.text).toBe('Source ?');
      expect(added.resolved).toBeFalse();
      expect(added.replies).toEqual([]);
      expect(Date.now() - new Date(added.date).getTime()).toBeLessThan(10_000);
    });

    it('opens the thread of the new comment', async () => {
      await comment('p', 6, 11, 'Source ?');
      expect(bubble()!.querySelector('.nrte__msg-text')!.textContent).toBe('Source ?');
      expect(bubble()!.querySelector('.nrte__msg-author')!.textContent).toBe('Pierre Hanauer');
      expect(bubble()!.querySelector('.nrte__avatar')!.textContent).toBe('PH');
    });

    it('marks a selection spanning several blocks', async () => {
      content.focus();
      select(text('p'), 6, content.querySelectorAll('p')[1].firstChild!, 6);
      await settle();
      expect(host.editor().addComment('Whole passage')).not.toBeNull();
      await settle();
      expect(html()).toBe('<p>hello <span data-comment="#0">world</span></p><p><span data-comment="#0">second</span> line</p>');
    });

    it('nests overlapping comments', async () => {
      await comment('p', 0, 11, 'Outer');
      await comment('span', 6, 11, 'Inner');
      expect(html()).toBe('<p><span data-comment="#0">hello <span data-comment="#1">world</span></span></p><p>second line</p>');
    });

    it('posts with Ctrl+Enter and cancels with Escape', async () => {
      content.focus();
      select(text('p'), 0, text('p'), 5);
      await settle();
      button('comment')!.click();
      await settle();
      let draft = bubble()!.querySelector('textarea')!;
      draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(bubble()).toBeNull();
      expect(host.comments().length).toBe(0);

      select(text('p'), 0, text('p'), 5);
      button('comment')!.click();
      await settle();
      draft = bubble()!.querySelector('textarea')!;
      draft.value = 'Quick';
      draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      await settle();
      expect(host.comments().map((c) => c.text)).toEqual(['Quick']);
    });

    it('Ctrl+Alt+M opens the new comment form', async () => {
      content.focus();
      select(text('p'), 0, text('p'), 5);
      await settle();
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
      await settle();
      expect(bubble()?.querySelector('textarea')).not.toBeNull();
    });

    it('does nothing without a selection, a user, or in read-only mode', async () => {
      content.focus();
      select(text('p'), 2);
      expect(host.editor().addComment('x')).toBeNull();
      select(text('p'), 0, text('p'), 5);
      host.user.set(null);
      await settle();
      expect(host.editor().addComment('x')).toBeNull();
      host.user.set(ME);
      host.readonly.set(true);
      await settle();
      expect(host.editor().addComment('x')).toBeNull();
      expect(host.comments().length).toBe(0);
    });

    it('marking the text is undone in one step; the comment stays, shown as deleted text', async () => {
      await comment('p', 6, 11, 'Source ?');
      content.focus();
      document.execCommand('undo');
      await settle();
      expect(host.editor().value()).toBe('<p>hello world</p><p>second line</p>');
      expect(host.comments().length).toBe(1);
      host.panel.set(true);
      await settle();
      expect(el.querySelector('.nrte__quote--deleted')).not.toBeNull();
    });
  });

  describe('threads', () => {
    beforeEach(async () => {
      host.comments.set([
        { id: 'c1', author: OTHER, date: '2026-01-01T10:00:00Z', text: 'Typo?', resolved: false, replies: [] },
      ]);
      host.html.set('<p>hello <span data-comment="c1">world</span></p>');
      await settle();
    });

    async function openThread(): Promise<void> {
      content.focus();
      select(content.querySelector('span')!.firstChild!, 2);
      await settle();
    }

    it('opens the thread when the caret is in the commented text, closes it when it leaves', async () => {
      await openThread();
      expect(bubble()!.querySelector('.nrte__msg-text')!.textContent).toBe('Typo?');
      select(text('p'), 1);
      await settle();
      expect(bubble()).toBeNull();
    });

    it('replies to a thread', async () => {
      await openThread();
      const field = bubble()!.querySelector('textarea')!;
      field.value = 'Fixed.';
      bubble()!.querySelector<HTMLButtonElement>('.nrte__comment-btn--primary')!.click();
      await settle();
      const [thread] = host.comments();
      expect(thread.replies.length).toBe(1);
      expect(thread.replies[0].text).toBe('Fixed.');
      expect(thread.replies[0].author).toEqual(ME);
      expect(Array.from(bubble()!.querySelectorAll('.nrte__msg-text'), (n) => n.textContent)).toEqual(['Typo?', 'Fixed.']);
      expect(field.value).toBe('');
    });

    it('resolves and reopens a thread', async () => {
      await openThread();
      bubble()!.querySelector<HTMLButtonElement>('.nrte__comment-btn')!.click();
      await settle();
      expect(host.comments()[0].resolved).toBeTrue();
      expect(bubble()).toBeNull();
      host.editor().resolveComment('c1', false);
      await settle();
      expect(host.comments()[0].resolved).toBeFalse();
    });

    it('lets users delete only their own comments and replies', async () => {
      await openThread();
      expect(bubble()!.querySelector('.nrte__msg-delete')).toBeNull(); // written by OTHER
      host.editor().replyToComment('c1', 'Mine');
      await settle();
      const deletes = bubble()!.querySelectorAll<HTMLButtonElement>('.nrte__msg-delete');
      expect(deletes.length).toBe(1);
      deletes[0].click();
      await settle();
      expect(host.comments()[0].replies).toEqual([]);
    });

    it('deleting a comment removes its marks but keeps the text', async () => {
      host.user.set(OTHER);
      await openThread();
      bubble()!.querySelector<HTMLButtonElement>('.nrte__msg-delete')!.click();
      await settle();
      expect(host.comments()).toEqual([]);
      expect(host.editor().value()).toBe('<p>hello world</p>');
    });

    it('is read-only without a current user', async () => {
      host.user.set(null);
      await openThread();
      expect(bubble()!.querySelector('.nrte__msg-text')).not.toBeNull();
      expect(bubble()!.querySelector('textarea')).toBeNull();
      expect(bubble()!.querySelector('.nrte__msg-delete')).toBeNull();
    });

    it('highlights the open comments, the active one more strongly', async () => {
      const highlights = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights;
      const count = (name: string) =>
        Array.from(highlights.get(name) ?? []).filter((r) => content.contains(r.startContainer)).length;
      expect(count('nrte-comment')).toBe(1);
      expect(count('nrte-comment-active')).toBe(0);
      await openThread();
      expect(count('nrte-comment')).toBe(0);
      expect(count('nrte-comment-active')).toBe(1);
      host.editor().resolveComment('c1');
      await settle();
      expect(count('nrte-comment') + count('nrte-comment-active')).toBe(0);
    });
  });

  describe('panel', () => {
    const cards = () => Array.from(el.querySelectorAll<HTMLElement>('.nrte__card'));

    beforeEach(async () => {
      host.comments.set([
        { id: 'b', author: OTHER, date: '2026-01-02T10:00:00Z', text: 'Second', resolved: false, replies: [] },
        { id: 'a', author: ME, date: '2026-01-01T10:00:00Z', text: 'First', resolved: false, replies: [] },
        { id: 'r', author: ME, date: '2026-01-03T10:00:00Z', text: 'Done', resolved: true, replies: [] },
        { id: 'gone', author: ME, date: '2026-01-04T10:00:00Z', text: 'Orphan', resolved: false, replies: [] },
      ]);
      host.html.set('<p><span data-comment="a">alpha</span> <span data-comment="b">beta</span> <span data-comment="r">gamma</span></p>');
      await settle();
    });

    it('is toggled by its toolbar button', async () => {
      expect(el.querySelector('.nrte__panel')).toBeNull();
      button('commentsPanel')!.click();
      await settle();
      expect(el.querySelector('.nrte__panel')).not.toBeNull();
      expect(host.panel()).toBeTrue();
      expect(button('commentsPanel')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('lists the open threads in document order, with their quote', async () => {
      host.panel.set(true);
      await settle();
      expect(cards().map((c) => c.dataset['commentCard'])).toEqual(['a', 'b', 'gone']);
      expect(cards()[0].querySelector('.nrte__quote')!.textContent!.trim()).toBe('alpha');
      expect(cards()[2].querySelector('.nrte__quote--deleted')).not.toBeNull();
      expect(el.querySelector('.nrte__panel-count')!.textContent).toBe('3');
    });

    it('shows the resolved threads on demand', async () => {
      host.panel.set(true);
      await settle();
      const option = el.querySelector<HTMLInputElement>('.nrte__panel-option input')!;
      option.click();
      await settle();
      expect(cards().map((c) => c.dataset['commentCard'])).toEqual(['a', 'b', 'r', 'gone']);
    });

    it('opens the thread in the card (not in a bubble)', async () => {
      host.panel.set(true);
      await settle();
      cards()[1].click();
      await settle();
      expect(cards()[1].classList).toContain('nrte__card--active');
      expect(cards()[1].querySelector('textarea')).not.toBeNull();
      expect(bubble()).toBeNull();
      // the caret in another comment's text opens that card
      content.focus();
      select(content.querySelector('span')!.firstChild!, 1);
      await settle();
      expect(cards()[0].classList).toContain('nrte__card--active');
    });

    it('manages comments whose text was deleted', async () => {
      host.panel.set(true);
      await settle();
      cards()[2].click();
      await settle();
      cards()[2].querySelector<HTMLButtonElement>('.nrte__msg-delete')!.click();
      await settle();
      expect(host.comments().map((c) => c.id)).toEqual(['b', 'a', 'r']);
    });

    it('shows an empty state', async () => {
      host.comments.set([]);
      host.panel.set(true);
      await settle();
      expect(el.querySelector('.nrte__panel-empty')).not.toBeNull();
    });
  });

  it('the sanitizer keeps the comment marks', () => {
    expect(sanitizeHtml('<p><span data-comment="c1" data-x="1">t</span></p>')).toBe('<p><span data-comment="c1">t</span></p>');
  });
});
