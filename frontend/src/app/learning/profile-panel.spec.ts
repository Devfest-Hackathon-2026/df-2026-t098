import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ProfilePanel } from './profile-panel';
import { LearningApi, LearningError } from './learning-api';
import { DisplaySettings } from './display-settings';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import type { AuthUser } from '../auth/auth-session';

describe('Account profile regressions', () => {
  let fixture: ComponentFixture<ProfilePanel>;
  let authStatus = signal<'loading' | 'authenticated' | 'guest' | 'unavailable'>('guest');
  let authUser = signal<AuthUser | null>(null);
  const refreshSession = vi.fn().mockResolvedValue(true);
  const logoutSession = vi.fn().mockResolvedValue(true);
  const loggingOut = signal(false);
  const send = vi.fn();

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
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilePanel);
    await fixture.whenStable();
  });

  it('offers guest sign-in without implying that local progress is synced', () => {
    const root = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();

    expect(root.querySelector('.account-sign-in')?.getAttribute('href')).toBe('/login');
    expect(root.querySelector('.account-section')?.textContent).toContain('Googleでログイン');
    expect(root.querySelector('.progress-card')).toBeNull();
  });

  it('lets guests choose a local reading size', async () => {
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

  it('preserves the reading preference when the account and interface language change', async () => {
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

    expect(root.querySelector('legend')?.textContent).toContain('Text size');
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
    expect(fixture.nativeElement.querySelector('app-language-picker')).toBeNull();
  });
});
