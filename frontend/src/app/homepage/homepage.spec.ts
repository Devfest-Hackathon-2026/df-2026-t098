import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Homepage } from './homepage';
import { vi } from 'vitest';

describe('Homepage feed', () => {
  let fixture: ComponentFixture<Homepage>;

  beforeEach(async () => {
    localStorage.removeItem('whylint-theme');
    localStorage.removeItem('whylint-preview-progress-v1');
    await TestBed.configureTestingModule({ imports: [Homepage] }).compileComponents();
    fixture = TestBed.createComponent(Homepage);
    await fixture.whenStable();
  });

  it('keeps the choice and explanation when switching sections and shows both on reveal', async () => {
    const card = fixture.nativeElement.querySelector('#card-0') as HTMLElement;
    const radio = card.querySelector('input[type="radio"]') as HTMLInputElement;
    radio.click();
    fixture.detectChanges();
    (card.querySelectorAll('.answer-switch button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    const reason = card.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'The function retains its scope.';
    reason.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (card.querySelectorAll('.answer-switch button')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((card.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    (card.querySelector('.solution-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(card.textContent).toContain('選択肢は正解です。');
    expect(card.textContent).toContain('返された関数が、外側のスコープを覚えているから。');
    expect(card.textContent).toContain('The function retains its scope.');
    expect(card.textContent).toContain('説明は採点されません。');
  });

  it('labels a solution opened without an answer as peeked and allows self-rating', () => {
    const card = fixture.nativeElement.querySelector('#card-0') as HTMLElement;
    (card.querySelector('.solution-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(card.querySelector('.solution-heading')?.textContent).toContain('解答を見た');
    const rating = card.querySelector('.rating button') as HTMLButtonElement;
    rating.click();
    fixture.detectChanges();
    expect(rating.getAttribute('aria-pressed')).toBe('true');
  });

  it('starts in Japanese and keeps the answer when switching to English and back', () => {
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector('#card-0') as HTMLElement;
    expect(card.querySelector('h2')?.textContent).toContain('なぜ');
    const radio = card.querySelector('input[type="radio"]') as HTMLInputElement;
    radio.click();
    fixture.detectChanges();
    const language = root.querySelector('.language-toggle') as HTMLButtonElement;
    language.click();
    fixture.detectChanges();
    expect(document.documentElement.lang).toBe('en');
    expect(card.querySelector('h2')?.textContent).toContain('Why does count');
    expect((card.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    language.click();
    fixture.detectChanges();
    expect(document.documentElement.lang).toBe('ja');
    expect(card.querySelector('h2')?.textContent).toContain('なぜ');
    expect((card.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
  });

  it('switches and remembers the theme without losing the current answer', async () => {
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector('#card-0') as HTMLElement;
    (card.querySelector('input[type="radio"]') as HTMLInputElement).click();
    fixture.detectChanges();
    const original = document.documentElement.dataset['theme'];
    const expected = original === 'dark' ? 'light' : 'dark';
    (root.querySelector('.theme-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(document.documentElement.dataset['theme']).toBe(expected);
    expect(localStorage.getItem('whylint-theme')).toBe(expected);
    expect((card.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    fixture.destroy();
    fixture = TestBed.createComponent(Homepage);
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe(expected);
    localStorage.removeItem('whylint-theme');
  });

  it('saves a peek and its sample review card, then can clear local history', async () => {
    let root = fixture.nativeElement as HTMLElement;
    let card = root.querySelector('#card-0') as HTMLElement;
    (card.querySelector('.solution-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('#card-3')).not.toBeNull();
    expect(root.querySelector('#card-3')?.textContent).toContain('復習用のサンプル');
    fixture.destroy();
    fixture = TestBed.createComponent(Homepage);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
    card = root.querySelector('#card-0') as HTMLElement;
    expect(card.querySelector('.solution-heading')?.textContent).toContain('解答を見た');
    expect(root.querySelector('#card-3')).not.toBeNull();
    (root.querySelectorAll('.bottom-nav button')[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.progress-list')?.textContent).toContain('解答を見た');
    const action = Array.from(root.querySelectorAll('.progress-actions button')).find((button) => button.textContent?.includes('学習履歴を消去')) as HTMLButtonElement;
    action.click();
    fixture.detectChanges();
    const confirm = Array.from(root.querySelectorAll('.progress-actions button')).find((button) => button.textContent?.includes('本当に消去する')) as HTMLButtonElement;
    confirm.click();
    fixture.detectChanges();
    expect(localStorage.getItem('whylint-preview-progress-v1')).toBeNull();
    expect(root.querySelectorAll('.progress-list li')).toHaveLength(3);
    expect(root.querySelector('.progress-list')?.textContent).not.toContain('解答を見た');
  });

  it('moves keyboard focus to the next question without animating', async () => {
    const root = fixture.nativeElement as HTMLElement;
    const feed = root.querySelector('.feed-content') as HTMLElement;
    const heading = root.querySelector('.feed-heading h2') as HTMLElement;
    const focus = vi.spyOn(heading, 'focus');
    const scroll = vi.fn();
    feed.scrollTo = scroll;
    const next = root.querySelector('.feed-navigation button') as HTMLButtonElement;
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
    expect(heading.textContent).toContain('second');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('updates the fixed question bar when another card reaches the top', () => {
    const root = fixture.nativeElement as HTMLElement;
    const feed = root.querySelector('.feed-content') as HTMLElement;
    const slides = root.querySelectorAll<HTMLElement>('.feed-slide');
    vi.spyOn(feed, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(slides[0], 'getBoundingClientRect').mockReturnValue({ top: -400 } as DOMRect);
    vi.spyOn(slides[1], 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(slides[2], 'getBoundingClientRect').mockReturnValue({ top: 900 } as DOMRect);
    feed.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(root.querySelector('.feed-heading h2')?.textContent).toContain('second');
    expect(root.querySelector('.card-count')?.textContent).toContain('2 / 3');
  });

  it('restores review cards in the order they were peeked', async () => {
    let root = fixture.nativeElement as HTMLElement;
    (root.querySelector('#card-1 .solution-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    (root.querySelector('#card-0 .solution-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('#card-3')?.textContent).toContain('同期処理の後で');
    expect(root.querySelector('#card-4')?.textContent).toContain('合計を覚える');
    fixture.destroy();
    fixture = TestBed.createComponent(Homepage);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#card-3')?.textContent).toContain('同期処理の後で');
    expect(root.querySelector('#card-4')?.textContent).toContain('合計を覚える');
  });

  it('restores a draft explanation without presenting it as graded', async () => {
    let root = fixture.nativeElement as HTMLElement;
    let card = root.querySelector('#card-0') as HTMLElement;
    (card.querySelectorAll('.answer-switch button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    const reason = card.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = '同じ変数を参照するから';
    reason.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.destroy();
    fixture = TestBed.createComponent(Homepage);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
    card = root.querySelector('#card-0') as HTMLElement;
    expect((card.querySelector('textarea') as HTMLTextAreaElement).value).toBe('同じ変数を参照するから');
    expect(card.textContent).toContain('説明は採点されません');
    (root.querySelectorAll('.bottom-nav button')[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.progress-list')?.textContent).toContain('入力中');
  });

  it('continues in session when device storage is unavailable', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      const root = fixture.nativeElement as HTMLElement;
      const card = root.querySelector('#card-0') as HTMLElement;
      (card.querySelector('input[type="radio"]') as HTMLInputElement).click();
      fixture.detectChanges();
      expect((card.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
      (root.querySelectorAll('.bottom-nav button')[2] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(root.querySelector('.progress-card')?.textContent).toContain('この画面を開いている間のみ');
    } finally {
      blocked.mockRestore();
    }
  });

});
