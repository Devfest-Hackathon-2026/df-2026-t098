import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Signup } from './signup';
import { AuthApi } from '../auth/auth-api';
import { AuthSession } from '../auth/auth-session';
import type { SessionStatus } from '../auth/auth-session';

describe('email signup', () => {
  const signup = vi.fn();
  const status = signal<SessionStatus>('guest');
  beforeEach(() => {
    localStorage.clear();
    status.set('guest');
    signup.mockReset();
    TestBed.configureTestingModule({
      imports: [Signup],
      providers: [
        provideRouter([]),
        { provide: AuthApi, useValue: { signup } },
        { provide: AuthSession, useValue: { status, refresh: vi.fn() } },
      ],
    });
  });

  it('shows Japanese labels, password-manager autocomplete and field validation', async () => {
    const fixture = TestBed.createComponent(Signup);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#signup-password')?.getAttribute('autocomplete')).toBe(
      'new-password',
    );
    const form = root.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('メールアドレス');
    expect(signup).not.toHaveBeenCalled();
    expect(root.querySelector('[aria-label="Switch to English"]')).toBeNull();
  });

  it('preserves the public question through signup and the sign-in link', async () => {
    const target = '/questions/894a7456-75cf-43c8-bb51-02f6b84a6cc3?explain=1';
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', 'get').mockReturnValue(
      convertToParamMap({ returnTo: target }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Signup);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a.auth-link') as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.get('returnTo')).toBe(target);
    status.set('authenticated');
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(target, { replaceUrl: true });
  });

  it('uses the language previously selected during onboarding', async () => {
    localStorage.setItem('whylint-language', 'en');
    const fixture = TestBed.createComponent(Signup);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toBe('Create your account');
    expect(root.querySelector('label[for="signup-username"]')?.textContent).toBe('Username');
  });

  it('retains input on conflict and signs up with exact password bytes before navigation', async () => {
    const fixture = TestBed.createComponent(Signup);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const email = root.querySelector<HTMLInputElement>('#signup-email')!;
    const username = root.querySelector<HTMLInputElement>('#signup-username')!;
    const password = root.querySelector<HTMLInputElement>('#signup-password')!;
    email.value = ' learner@example.test ';
    username.value = ' 学習者_1 ';
    password.value = '  unchanged passphrase  ';
    const submit = () =>
      root
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    signup.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    submit();
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('使用できません');
    expect(password.value).toBe('  unchanged passphrase  ');
    signup.mockImplementationOnce(async () => {
      status.set('authenticated');
      return { ok: true };
    });
    submit();
    await fixture.whenStable();
    expect(signup).toHaveBeenLastCalledWith({
      email: 'learner@example.test',
      username: '学習者_1',
      password: '  unchanged passphrase  ',
    });
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(password.value).toBe('');
  });

  it('keeps credential controls hidden when the session cannot be checked', async () => {
    status.set('unavailable');
    const fixture = TestBed.createComponent(Signup);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      '接続を確認',
    );
  });

  it('retains an in-memory draft while a foreground session check replaces the form', async () => {
    const fixture = TestBed.createComponent(Signup);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [
      ['email', 'draft@example.test'],
      ['username', 'draft_learner'],
      ['password', '  draft passphrase  '],
    ]) {
      const input = root.querySelector<HTMLInputElement>(`#signup-${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    status.set('loading');
    fixture.detectChanges();
    expect(root.querySelector('form')).toBeNull();
    status.set('guest');
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#signup-email')?.value).toBe('draft@example.test');
    expect(root.querySelector<HTMLInputElement>('#signup-username')?.value).toBe('draft_learner');
    expect(root.querySelector<HTMLInputElement>('#signup-password')?.value).toBe(
      '  draft passphrase  ',
    );
  });
});
