import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ProfilePanel } from './profile-panel';
import { LearningApi, LearningError } from './learning-api';
import { DisplaySettings } from './display-settings';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { PublicConfig } from '../config/public-config';
import { BlockStore } from './block-store';
import type { AuthUser } from '../auth/auth-session';

describe('Account profile regressions', () => {
  let fixture: ComponentFixture<ProfilePanel>;
  let authStatus = signal<'loading' | 'authenticated' | 'guest' | 'unavailable'>('guest');
  let authUser = signal<AuthUser | null>(null);
  const refreshSession = vi.fn().mockResolvedValue(true);
  const logoutSession = vi.fn().mockResolvedValue(true);
  const loggingOut = signal(false);
  const send = vi.fn();
  const deleteAccount = vi.fn();
  const unblock = vi.fn();
  const blocked = signal<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);

  beforeEach(async () => {
    localStorage.removeItem('whylint-theme');
    localStorage.removeItem('whylint-language');
    localStorage.removeItem('whylint-reading-size');
    localStorage.removeItem('whylint-onboarding-v2');
    localStorage.removeItem('whylint-preview-progress-v1');
    localStorage.removeItem('whylint-saved-cards-v1');
    authStatus = signal('guest');
    authUser = signal<AuthUser | null>(null);
    refreshSession.mockClear();
    logoutSession.mockReset().mockResolvedValue(true);
    loggingOut.set(false);
    send.mockReset();
    deleteAccount.mockReset();
    unblock.mockReset().mockResolvedValue(undefined);
    blocked.set([]);
    await TestBed.configureTestingModule({
      imports: [ProfilePanel],
      providers: [
        provideRouter([]),
        {
          provide: LearningApi,
          useValue: {
            send,
            get: vi.fn(async (path: string) =>
              path === '/saved'
                ? { questions: [] }
                : {
                    totalXp: 0,
                    level: 1,
                    streak: 0,
                    passedQuestions: 0,
                    dailyGoal: 5,
                    dailyCompleted: 0,
                    timezone: 'Asia/Tokyo',
                    achievements: [],
                  },
            ),
          },
        },
        {
          provide: AuthSession,
          useValue: {
            status: authStatus.asReadonly(),
            user: authUser.asReadonly(),
            refresh: refreshSession,
            logout: logoutSession,
            loggingOut: loggingOut.asReadonly(),
            deleteAccount,
          },
        },
        {
          provide: BlockStore,
          useValue: {
            blocked,
            loading: signal(false),
            load: vi.fn().mockResolvedValue(undefined),
            unblock,
          },
        },
        {
          provide: PublicConfig,
          useValue: {
            privacyUrl: signal('https://legal.example/privacy'),
            termsUrl: signal('https://legal.example/terms'),
            supportContact: signal('help@example.test'),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilePanel);
    await fixture.whenStable();
  });

  function showSettings() {
    fixture.componentRef.setInput('view', 'settings');
    fixture.detectChanges();
  }

  it('offers guest sign-in without implying that local progress is synced', () => {
    const root = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();

    expect(root.querySelector('.account-sign-in')?.getAttribute('href')).toBe('/login');
    expect(root.querySelector('.account-sign-in')?.textContent?.trim()).toBe('ログイン');
    expect(root.querySelector('.progress-card')).toBeNull();
  });

  it('lets guests choose and persist appearance from Settings', async () => {
    showSettings();
    const root = fixture.nativeElement as HTMLElement;
    const option = root.querySelector<HTMLInputElement>('input[name="theme"][value="light"]')!;
    option.click();
    await fixture.whenStable();
    expect(option.checked).toBe(true);
    expect(TestBed.inject(DisplaySettings).theme()).toBe('light');
    expect(localStorage.getItem('whylint-theme')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(send).not.toHaveBeenCalled();
  });

  it('lets guests choose a local reading size', async () => {
    showSettings();
    const root = fixture.nativeElement as HTMLElement;
    const option = root.querySelector<HTMLInputElement>(
      'input[name="reading-size"][value="large"]',
    )!;
    option.click();
    await fixture.whenStable();

    expect(option.checked).toBe(true);
    expect(TestBed.inject(DisplaySettings).readingSize()).toBe('large');
    expect(localStorage.getItem('whylint-reading-size')).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.15');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows saved-question failures beside a retry instead of the empty-collection hint', async () => {
    const api = TestBed.inject(LearningApi);
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/saved') throw new LearningError(503, 'UNAVAILABLE');
      return {
        totalXp: 0,
        level: 1,
        streak: 0,
        passedQuestions: 0,
        dailyGoal: 5,
        dailyCompleted: 0,
        timezone: 'Asia/Tokyo',
        achievements: [],
      } as never;
    });
    authUser.set({
      id: 'saved-reader',
      email: 'saved@example.test',
      name: 'Reader',
      avatarUrl: null,
      username: 'reader',
    });
    authStatus.set('authenticated');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.profile-settings')).toBeNull();
    const learning = root.querySelector('.account-learning')!;
    const saved = learning.querySelector<HTMLElement>('.saved-section')!;
    expect(saved.querySelector('[role="alert"]')).not.toBeNull();
    expect(saved.textContent).not.toContain('また読みたい問題をブックマーク');
    vi.mocked(api.get).mockResolvedValue({ questions: [] } as never);
    saved.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(saved.querySelector('[role="alert"]')).toBeNull();
    expect(saved.textContent).toContain('また読みたい問題をブックマーク');
  });

  it('preserves the reading preference when the account and interface language change', async () => {
    showSettings();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLInputElement>('input[name="reading-size"][value="larger"]')!.click();
    authUser.set({
      id: 'user-reading',
      email: 'reading@example.test',
      name: 'Reader',
      avatarUrl: null,
      username: null,
    });
    authStatus.set('authenticated');
    fixture.componentRef.setInput('language', 'en');
    await fixture.whenStable();

    expect(root.querySelector('[aria-describedby="reading-size-description"] legend')?.textContent).toContain('Text size');
    expect(root.querySelector<HTMLInputElement>('input[value="larger"]')?.checked).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.3');
  });

  it('displays the authenticated user in the profile', () => {
    authUser.set({
      id: 'user-1',
      email: 'learner@example.com',
      name: 'Learner',
      avatarUrl: null,
      username: null,
    });
    authStatus.set('authenticated');
    const root = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();

    expect(root.querySelector('.account-identity')?.textContent).toContain('Learner');
    expect(root.querySelector('.account-identity')?.textContent).toContain('learner@example.com');
    expect(root.querySelector('.account-sign-in')).toBeNull();
  });

  it('separates a loading session and a connection error from a signed-out session', () => {
    const root = fixture.nativeElement as HTMLElement;
    authStatus.set('loading');

    fixture.detectChanges();
    expect(root.querySelector('.account-section [role="status"]')?.textContent).toContain(
      '確認しています',
    );
    expect(root.querySelector('.account-sign-in')).toBeNull();

    authStatus.set('unavailable');
    fixture.detectChanges();
    expect(root.querySelector('.account-section [role="alert"]')?.textContent).toContain(
      '取得できませんでした',
    );
    (root.querySelector('.account-retry') as HTMLButtonElement).click();
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it('renders a profile picture and falls back to the icon if the image fails', () => {
    authUser.set({
      id: 'user-1',
      email: 'learner@example.test',
      name: 'Learner',
      avatarUrl: 'https://example.test/avatar.png',
      username: null,
    });
    authStatus.set('authenticated');
    const root = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();
    const image = root.querySelector('.account-avatar img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('https://example.test/avatar.png');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(root.querySelector('.account-avatar img')).toBeNull();
    expect(root.querySelector('.account-avatar svg')).not.toBeNull();
  });

  it('keeps an unfinished username through a foreground session check', () => {
    showSettings();
    authUser.set({
      id: 'user-1',
      email: 'learner@example.test',
      name: 'Learner',
      avatarUrl: null,
      username: null,
    });
    authStatus.set('authenticated');
    const root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.account-card')!.click();
    fixture.detectChanges();
    const input = root.querySelector<HTMLInputElement>('#account-username')!;
    input.value = 'unfinished_name';
    input.dispatchEvent(new Event('input'));
    authStatus.set('loading');
    fixture.detectChanges();
    authStatus.set('authenticated');
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#account-username')?.value).toBe(
      'unfinished_name',
    );
  });

  it('shows logout progress, prevents repeat activation and offers retry on failure', async () => {
    showSettings();
    authUser.set({
      id: 'user-1',
      email: 'learner@example.test',
      name: 'Learner',
      avatarUrl: null,
      username: null,
    });
    authStatus.set('authenticated');
    const root = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.account-card')!.click();
    fixture.detectChanges();
    const button = root.querySelector('.account-sign-out') as HTMLButtonElement;
    loggingOut.set(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('ログアウト中');
    button.click();
    expect(logoutSession).not.toHaveBeenCalled();
    loggingOut.set(false);
    logoutSession.mockResolvedValueOnce(false);
    fixture.detectChanges();
    button.click();
    await fixture.whenStable();
    expect(logoutSession).toHaveBeenCalledOnce();
    expect(root.querySelector('.account-error')?.textContent).toContain(
      'ログアウトできませんでした',
    );
    expect(root.querySelector('.account-identity')?.textContent).toContain('Learner');
  });

  function authenticate() {
    authUser.set({
      id: 'user-1',
      email: 'learner@example.test',
      name: 'Learner',
      avatarUrl: null,
      username: 'learner',
    });
    authStatus.set('authenticated');
    fixture.detectChanges();
  }

  it('applies a language only after the account setting is saved', async () => {
    showSettings();
    authenticate();
    const preferences = {
      interests: ['backend'],
      technologies: ['Go'],
      difficulty: 'beginner',
      language: 'en',
    };
    let complete!: (value: unknown) => void;
    send.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLInputElement>('[value="en"]')!.click();
    fixture.detectChanges();
    expect(TestBed.inject(DisplaySettings).language()).toBe('ja');
    expect(root.querySelector<HTMLFieldSetElement>('app-language-picker fieldset')!.disabled).toBe(
      true,
    );
    complete({ preferences });
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith(
      '/preferences/language',
      'PATCH',
      { language: 'en' },
      expect.any(AbortSignal),
    );
    expect(TestBed.inject(DisplaySettings).language()).toBe('en');
    expect(JSON.parse(localStorage.getItem('whylint-onboarding-v2')!).language).toBe('en');
  });

  it('restores the previous language choice when saving fails', async () => {
    showSettings();
    authenticate();
    send.mockRejectedValueOnce(new LearningError(503, 'UNAVAILABLE'));
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLInputElement>('[value="en"]')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(DisplaySettings).language()).toBe('ja');
    expect(root.querySelector<HTMLInputElement>('[value="ja"]')!.checked).toBe(true);
    expect(root.querySelector('.profile-settings [role="alert"]')).not.toBeNull();
  });

  it('ignores a language response after logout', async () => {
    showSettings();
    authenticate();
    let complete!: (value: unknown) => void;
    send.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    fixture.nativeElement.querySelector('[value="en"]').click();
    authUser.set(null);
    authStatus.set('guest');
    fixture.detectChanges();
    complete({
      preferences: {
        interests: ['backend'],
        technologies: [],
        difficulty: 'beginner',
        language: 'en',
      },
    });
    await fixture.whenStable();
    expect(TestBed.inject(DisplaySettings).language()).toBe('ja');
    // A guest can still switch language on this device; the stale account response must not move it.
    const picker = fixture.nativeElement.querySelector('app-language-picker');
    expect(picker?.querySelector('input[value="ja"]')?.checked).toBe(true);
  });
  describe('store policy requirements', () => {
    beforeEach(async () => {
      authUser.set({
        id: 'user-store',
        email: 'store@example.test',
        name: 'Store Learner',
        avatarUrl: null,
        username: 'store',
      });
      authStatus.set('authenticated');
      fixture.componentRef.setInput('language', 'en');
      showSettings();
      await fixture.whenStable();
    });

    it('links the privacy policy, terms and support contact from configuration', () => {
      const root = fixture.nativeElement as HTMLElement;
      const links = [...root.querySelectorAll<HTMLAnchorElement>('.legal-links a')];
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        'https://legal.example/privacy',
        'https://legal.example/terms',
      ]);
      expect(links.every((link) => link.rel.includes('noopener'))).toBe(true);
      const support = root.querySelector<HTMLAnchorElement>('.support-contact a');
      expect(support?.getAttribute('href')).toBe('mailto:help@example.test');
    });

    it('asks for confirmation, then deletes the account and tells the learner', async () => {
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.account-card')!.click();
      await fixture.whenStable();
      deleteAccount.mockImplementation(async () => {
        authUser.set(null);
        authStatus.set('guest');
        return 'deleted';
      });
      root.querySelector<HTMLButtonElement>('.account-delete')!.click();
      await fixture.whenStable();
      expect(deleteAccount).not.toHaveBeenCalled();
      expect(root.querySelector('.delete-confirmation')?.textContent).toContain(
        'permanently deletes your account',
      );

      root.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-account"]')!.click();
      await fixture.whenStable();

      expect(deleteAccount).toHaveBeenCalledTimes(1);
      expect(root.querySelector('[data-testid="account-deleted"]')?.textContent).toContain(
        'Your account was deleted.',
      );
      expect(root.querySelector('.account-delete')).toBeNull();
    });

    it('can be cancelled and keeps the account when deletion fails', async () => {
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.account-card')!.click();
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('.account-delete')!.click();
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('[data-testid="cancel-delete-account"]')!.click();
      await fixture.whenStable();
      expect(root.querySelector('.delete-confirmation')).toBeNull();
      expect(deleteAccount).not.toHaveBeenCalled();

      deleteAccount.mockResolvedValue('failed');
      root.querySelector<HTMLButtonElement>('.account-delete')!.click();
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-account"]')!.click();
      await fixture.whenStable();
      expect(root.querySelector('.delete-account [role="alert"]')?.textContent).toContain(
        'Could not delete your account',
      );
      expect(root.querySelector('[data-testid="account-deleted"]')).toBeNull();
      expect(root.querySelector('.delete-confirmation')).not.toBeNull();
    });

    it('lists blocked learners and unblocks one', async () => {
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.account-card')!.click();
      await fixture.whenStable();
      expect(root.querySelector('[data-testid="blocked-list"]')?.textContent).toContain(
        'haven’t blocked anyone',
      );
      blocked.set([{ id: 'blocked-1', displayName: 'Noisy Learner', avatarUrl: null }]);
      await fixture.whenStable();
      const row = root.querySelector('[data-testid="blocked-list"] li')!;
      expect(row.textContent).toContain('Noisy Learner');

      row.querySelector<HTMLButtonElement>('button')!.click();
      await fixture.whenStable();
      expect(unblock).toHaveBeenCalledWith('blocked-1');
    });
  });
});
