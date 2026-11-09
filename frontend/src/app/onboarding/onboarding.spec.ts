import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { Onboarding } from './onboarding';
import { OnboardingState } from './onboarding-state';
import { AuthSession, AuthUser, SessionStatus } from '../auth/auth-session';
import { LearningApi } from '../learning/learning-api';
import { LEARNING_CATALOG } from '../learning/learning-catalog';

describe('Learning interests onboarding', () => {
  const user = signal<AuthUser | null>(null);
  const status = signal<SessionStatus>('guest');
  const send = vi.fn();
  const get = vi.fn();

  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    localStorage.clear();
    user.set(null);
    status.set('guest');
    send.mockReset().mockResolvedValue({});
    get.mockReset().mockResolvedValue(LEARNING_CATALOG);
    TestBed.configureTestingModule({
      imports: [Onboarding],
      providers: [
        provideRouter([]),
        {
          provide: AuthSession,
          useValue: {
            user,
            status,
            loggingOut: signal(false),
            refresh: vi.fn().mockResolvedValue(false),
          },
        },
        { provide: LearningApi, useValue: { send, get } },
      ],
    });
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('moves focus and scroll position to the new step heading in both directions', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.domain')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    expect(root.querySelector('h1')?.textContent).toContain('好きな技術');
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    root.querySelector<HTMLButtonElement>('.back')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    expect(root.querySelector('h1')?.textContent).toContain('何を学びたい');
  });

  it('locks preference controls while saving and restores them after a failed request', async () => {
    user.set({
      id: 'learner',
      email: 'learner@example.test',
      name: null,
      username: 'learner',
      avatarUrl: null,
    });
    status.set('authenticated');
    let rejectSave!: (error: Error) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.domain')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    fixture.detectChanges();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const fields = root.querySelector<HTMLFieldSetElement>('.preference-fields')!;
    expect(fields.disabled).toBe(true);
    expect(root.querySelector('#technology-search')?.matches(':disabled')).toBe(true);
    expect(root.querySelector('.stack-list button')?.matches(':disabled')).toBe(true);
    expect(root.querySelector('.difficulty button')?.matches(':disabled')).toBe(true);
    rejectSave(new Error('Fixture save failure'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fields.disabled).toBe(false);
    });
    expect(root.querySelector('#technology-search')?.matches(':disabled')).toBe(false);
  });

  it('migrates the supported old JavaScript preference without losing the choice', () => {
    localStorage.setItem(
      'whylint-onboarding-v1',
      JSON.stringify({ domain: 'frontend', stack: 'javascript', onboardingCompleted: true }),
    );
    expect(TestBed.inject(OnboardingState).read()).toEqual({
      interests: ['frontend'],
      technologies: ['JavaScript'],
      difficulty: 'beginner',
      onboardingCompleted: true,
    });
  });

  it('rejects malformed stored preferences', () => {
    localStorage.setItem(
      'whylint-onboarding-v2',
      JSON.stringify({
        interests: ['unknown'],
        technologies: ['JavaScript'],
        difficulty: 'beginner',
        onboardingCompleted: true,
      }),
    );
    expect(TestBed.inject(OnboardingState).read()).toBeNull();
  });

  it('allows multiple domains and frameworks, including custom technologies', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
    buttons()
      .find((button) => button.textContent?.includes('フロントエンド'))!
      .click();
    buttons()
      .find((button) => button.textContent?.includes('バックエンド'))!
      .click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.domain[aria-pressed="true"]')).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    fixture.detectChanges();
    buttons()
      .find((button) => button.textContent?.trim() === 'React')!
      .click();
    const search = root.querySelector<HTMLInputElement>('#technology-search')!;
    search.value = 'MyFramework';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.custom-add')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.selected-technologies')?.textContent).toContain('React');
    expect(root.querySelector('.selected-technologies')?.textContent).toContain('MyFramework');
  });

  it('saves general-interest preferences even with no selected programming language', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    [...root.querySelectorAll<HTMLButtonElement>('.domain')]
      .find((button) => button.textContent?.includes('ネットワーク'))!
      .click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(OnboardingState).read()?.interests).toEqual(['networking']);
    expect(TestBed.inject(OnboardingState).read()?.technologies).toEqual([]);
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('persists authenticated preferences before entering the feed', async () => {
    user.set({
      id: 'learner',
      email: 'learner@example.test',
      name: 'Learner',
      username: 'learner',
      avatarUrl: null,
    });
    status.set('authenticated');
    const fixture = TestBed.createComponent(Onboarding);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.domain')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith(
      '/preferences',
      'PUT',
      { interests: ['frontend'], technologies: [], difficulty: 'beginner', language: 'ja' },
      expect.any(AbortSignal),
    );
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('restores server preferences on a device without local onboarding', async () => {
    user.set({
      id: 'learner',
      email: 'learner@example.test',
      name: 'Learner',
      username: 'learner',
      avatarUrl: null,
    });
    status.set('authenticated');
    const preferences = {
      interests: ['security'],
      technologies: ['Go'],
      difficulty: 'advanced',
      language: 'en',
    };
    get.mockResolvedValueOnce({ preferences });
    await expect(TestBed.inject(OnboardingState).restore()).resolves.toMatchObject(preferences);
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('whylint-language')).toBe('en');
  });

  it('offers language during onboarding and keeps a guest selection on the device', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.settings [aria-label="Switch to English"]')).toBeNull();
    root.querySelector<HTMLInputElement>('[value="en"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('h1')?.textContent).toContain('What would you like');
    root.querySelector<HTMLButtonElement>('.domain')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.primary')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(OnboardingState).read()?.language).toBe('en');
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not copy another signed-in user’s preferences into a new account', async () => {
    const state = TestBed.inject(OnboardingState);
    state.save(
      { interests: ['frontend'], technologies: ['React'], difficulty: 'beginner' },
      'someone-else',
    );
    user.set({
      id: 'learner',
      email: 'learner@example.test',
      name: 'Learner',
      username: 'learner',
      avatarUrl: null,
    });
    status.set('authenticated');
    get.mockResolvedValueOnce({ preferences: null });
    await expect(state.restore()).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
