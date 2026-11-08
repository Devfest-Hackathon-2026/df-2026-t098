import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { LearningApi } from './learning-api';
import { QuestionDiscussion } from './question-discussion';
import type { QuestionComment } from './learning.types';

describe('Learning discussion contributions', () => {
  const get = vi.fn();
  const send = vi.fn();
  const user = signal({
    id: 'viewer',
    name: 'Viewer',
    username: 'viewer',
    email: 'viewer@example.test',
    avatarUrl: null,
  });
  const comment: QuestionComment = {
    id: 'root-1',
    text: 'A variable names a reusable value.',
    kind: 'explanation',
    parentId: null,
    helpful: false,
    helpfulCount: 2,
    deleted: false,
    author: { id: 'author', displayName: 'Creator', avatarUrl: null },
    createdAt: '2026-11-08T00:00:00Z',
  };

  beforeAll(() => {
    const show = function (this: HTMLDialogElement) {
      this.open = true;
    };
    Object.defineProperties(HTMLDialogElement.prototype, {
      show: { configurable: true, value: show },
      showModal: { configurable: true, value: show },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = false;
          this.dispatchEvent(new Event('close'));
        },
      },
    });
  });
  afterAll(() => {
    for (const method of ['show', 'showModal', 'close'])
      Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  });
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ comments: [comment] });
    send.mockReset();
    TestBed.configureTestingModule({
      imports: [QuestionDiscussion],
      providers: [
        provideRouter([]),
        { provide: AuthSession, useValue: { user, status: signal('authenticated') } },
        { provide: LearningApi, useValue: { get, send } },
      ],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(QuestionDiscussion);
    fixture.componentRef.setInput('questionId', 'question-1');
    fixture.componentRef.setInput('viewId', 'relearn-1');
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    return fixture;
  }

  it('uses the view instance for IDs and publishes a one-level reply', async () => {
    send.mockResolvedValueOnce({
      ...comment,
      id: 'reply-1',
      parentId: comment.id,
      kind: 'comment',
      text: 'That example helped.',
      author: { id: 'viewer', displayName: 'Viewer', avatarUrl: null },
    });
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('dialog')?.id).toBe('discussion-relearn-1');
    root
      .querySelector<HTMLButtonElement>('[data-comment-id="root-1"] [aria-label="返信"]')!
      .click();
    await fixture.whenStable();
    const field = root.querySelector<HTMLTextAreaElement>('#comment-relearn-1')!;
    field.value = 'That example helped.';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('[aria-label="コメントを投稿"]')!.click();
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith(
      '/questions/question-1/comments',
      'POST',
      expect.objectContaining({
        text: 'That example helped.',
        kind: 'comment',
        parentId: 'root-1',
        requestId: expect.any(String),
      }),
      expect.any(AbortSignal),
    );
    expect(root.querySelector('.discussion-replies')?.textContent).toContain(
      'That example helped.',
    );
  });

  it('updates Helpful only after the server acknowledges the vote', async () => {
    send.mockResolvedValueOnce({ helpful: true, helpfulCount: 3 });
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="参考になった"]')!.click();
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith(
      '/questions/question-1/comments/root-1/helpful',
      'PUT',
      { helpful: true },
      expect.any(AbortSignal),
    );
    expect(root.querySelector('[aria-label="参考になった"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(root.querySelector('.helpful-button')?.textContent).toContain('3');
  });

  it('renders a deleted parent with its reply and removes its actions', async () => {
    get.mockResolvedValueOnce({
      comments: [
        { ...comment, text: '', deleted: true },
        {
          ...comment,
          id: 'reply-1',
          parentId: comment.id,
          kind: 'comment',
          text: 'The reply remains.',
        },
      ],
    });
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const parent = root.querySelector('[data-comment-id="root-1"]')!;
    expect(parent.textContent).toContain('この投稿は削除されました');
    expect(parent.querySelector('button')).toBeNull();
    expect(root.querySelector('.discussion-replies')?.textContent).toContain('The reply remains.');
  });

  it('reloads after a changed refresh key arrives during an earlier request', async () => {
    let resolve!: (value: unknown) => void;
    const waiting = new Promise((done) => (resolve = done));
    get.mockReturnValueOnce(waiting).mockResolvedValue({ comments: [comment] });
    const fixture = await create();
    fixture.componentRef.setInput('refreshKey', 1);
    await fixture.whenStable();
    expect(get).toHaveBeenCalledTimes(1);
    resolve({ comments: [] });
    await waiting;
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    expect(get).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain(comment.text);
  });
});
