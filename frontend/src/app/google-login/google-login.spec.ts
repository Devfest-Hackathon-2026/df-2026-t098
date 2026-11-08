import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthApi } from '../auth/auth-api';
import { GoogleLogin } from './google-login';
import { AUTH_FETCH, AuthSession } from '../auth/auth-session';
import type { AuthUser, SessionStatus } from '../auth/auth-session';
import { STATE_KEY } from './oauth-flow';
import { routes } from '../app.routes';
import { guestOnlyGuard } from '../auth/guest.guard';
import { saveQuestionReturn } from '../auth/auth-return';

describe('Google sign-in screen', () => {
  const passwordLogin = vi.fn();
  let session: {
    status: WritableSignal<SessionStatus>;
    user: WritableSignal<AuthUser | null>;
    refresh: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    passwordLogin.mockReset().mockResolvedValue({ ok: false, reason: 'unauthorized' });
    session = {
      status: signal<SessionStatus>('guest'),
      user: signal<AuthUser | null>(null),
      refresh: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [GoogleLogin],
      providers: [
        provideRouter([]),
        { provide: AuthSession, useValue: session },
        { provide: AuthApi, useValue: { passwordLogin } },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows identifier and password fields alongside the Google action', async () => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const identifier = root.querySelector<HTMLInputElement>('#login-identifier');
    const password = root.querySelector<HTMLInputElement>('#login-password');
    expect(identifier?.type).toBe('text');
    expect(identifier?.autocomplete).toBe('username');
    expect(password?.type).toBe('password');
    expect(password?.autocomplete).toBe('current-password');
    expect(root.querySelector('form.password-form')).not.toBeNull();
    expect(root.querySelector('button.password-button')).not.toBeNull();
    expect(root.querySelector('.password-notice')?.textContent).toContain(
      'メールアドレスまたはユーザー名でログインできます。',
    );
    expect(root.querySelector('.google-button')?.textContent).toContain('Googleで続ける');
    expect(root.textContent).not.toContain('クライアント ID');
  });

  it('preserves a public explanation destination through password sign-in and signup', async () => {
    const target = '/questions/894a7456-75cf-43c8-bb51-02f6b84a6cc3?explain=1';
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', 'get').mockReturnValue(
      convertToParamMap({ returnTo: target }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a.auth-link') as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.get('returnTo')).toBe(target);
    session.status.set('authenticated');
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(target, { replaceUrl: true });
  });

  it('translates the password form and availability message', async () => {
    localStorage.setItem('whylint-language', 'en');
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('button[aria-label="Switch to English"]')).toBeNull();
    expect(root.querySelector('label[for="login-identifier"]')?.textContent).toContain(
      'Email or username',
    );
    expect(root.querySelector('label[for="login-password"]')?.textContent).toContain('Password');
    expect(root.querySelector('.password-notice')?.textContent).toContain(
      'Sign in with your email address or username.',
    );
    expect(root.querySelector('.google-button')?.textContent).toContain('Continue with Google');
  });

  it('reports the missing identifier first on an empty submission', async () => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    root
      .querySelector<HTMLFormElement>('form.password-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelector('#identifier-error')?.textContent).toContain(
      'メールアドレスまたはユーザー名を入力してください。',
    );
    expect(
      root.querySelector<HTMLInputElement>('#login-identifier')?.getAttribute('aria-invalid'),
    ).toBe('true');
    expect(
      root.querySelector<HTMLInputElement>('#login-identifier')?.getAttribute('aria-describedby'),
    ).toBe('identifier-error');
    expect(root.querySelector('#password-error')).toBeNull();
    expect(root.querySelector('#password-status')).toBeNull();
  });

  it('rejects a whitespace-only identifier but accepts a nonempty password without trimming it', async () => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const identifier = root.querySelector<HTMLInputElement>('#login-identifier')!;
    const password = root.querySelector<HTMLInputElement>('#login-password')!;
    identifier.value = '   ';
    identifier.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = '   ';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    root
      .querySelector<HTMLFormElement>('form.password-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelector('#identifier-error')?.textContent).toContain(
      'メールアドレスまたはユーザー名を入力してください。',
    );
    expect(root.querySelector('#password-error')).toBeNull();
    expect(root.querySelector('#password-status')).toBeNull();
  });

  it('reports a missing password for a supplied identifier', async () => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const identifier = root.querySelector<HTMLInputElement>('#login-identifier')!;
    identifier.value = 'learner';
    identifier.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    root
      .querySelector<HTMLFormElement>('form.password-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelector('#identifier-error')).toBeNull();
    expect(root.querySelector('#password-error')?.textContent).toContain(
      'パスワードを入力してください。',
    );
    expect(
      root.querySelector<HTMLInputElement>('#login-password')?.getAttribute('aria-invalid'),
    ).toBe('true');
    expect(
      root.querySelector<HTMLInputElement>('#login-password')?.getAttribute('aria-describedby'),
    ).toBe('password-error');
  });

  it('keeps the relevant validation error until that field is valid', async () => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const form = root.querySelector<HTMLFormElement>('form.password-form')!;
    const identifier = root.querySelector<HTMLInputElement>('#login-identifier')!;
    const password = root.querySelector<HTMLInputElement>('#login-password')!;
    const input = (element: HTMLInputElement, value: string) => {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    const submit = () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    submit();
    input(password, 'sample');
    expect(root.querySelector('#identifier-error')).not.toBeNull();
    input(identifier, '  ');
    expect(root.querySelector('#identifier-error')).not.toBeNull();
    input(identifier, 'learner');
    expect(root.querySelector('#identifier-error')).toBeNull();

    input(password, '');
    submit();
    input(identifier, 'learner2');
    expect(root.querySelector('#password-error')).not.toBeNull();
    input(password, ' ');
    expect(root.querySelector('#password-error')).toBeNull();
  });

  it.each(['learner@example.com', 'learner'])(
    'submits %s through AuthApi without persisting credentials',
    async (value) => {
      const fixture = TestBed.createComponent(GoogleLogin);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const request = vi.spyOn(window, 'fetch');
      const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
      const identifier = root.querySelector<HTMLInputElement>('#login-identifier')!;
      const password = root.querySelector<HTMLInputElement>('#login-password')!;
      identifier.value = value;
      identifier.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = '   ';
      password.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      root
        .querySelector<HTMLFormElement>('form.password-form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(root.querySelector('#identifier-error')).toBeNull();
      expect(root.querySelector('#password-error')).toBeNull();
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root.querySelector('#password-status')?.getAttribute('role')).toBe('alert');
      });
      expect(passwordLogin).toHaveBeenCalledWith(value, '   ');
      expect(root.querySelector('#password-status')?.textContent).toContain(
        'パスワードを確認してください',
      );
      expect(root.querySelector('.google-button')).not.toBeNull();
      expect(request).not.toHaveBeenCalled();
      expect(storageWrite).not.toHaveBeenCalled();
      expect(session.refresh).not.toHaveBeenCalled();
      expect(session.status()).toBe('guest');
      expect(session.user()).toBeNull();
    },
  );

  it('waits for an existing session check before offering sign-in', async () => {
    session.status.set('loading');
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('確認しています');
    expect(root.querySelector('.google-button')).toBeNull();

    session.status.set('guest');
    fixture.detectChanges();
    expect(root.querySelector('.google-button')).not.toBeNull();
  });

  it('exposes user-facing login and Google callback routes', async () => {
    const login = routes.find((route) => route.path === 'login');
    const callback = routes.find((route) => route.path === 'auth/google/callback');
    expect(await login?.loadComponent?.()).toBe(GoogleLogin);
    expect(await callback?.loadComponent?.()).toBe(GoogleLogin);
    expect(login?.canActivate).toContain(guestOnlyGuard);
    expect(callback?.canActivate).toBeUndefined();
    expect(login?.canMatch).toBeUndefined();
    expect(callback?.canMatch).toBeUndefined();
  });

  it('redirects when the session becomes authenticated while login is open', async () => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const root = fixture.nativeElement as HTMLElement;

    session.user.set({
      id: 'test-user',
      email: 'test@example.com',
      name: 'Test',
      avatarUrl: null,
      username: null,
    });
    session.status.set('authenticated');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(root.querySelector('.google-button')).toBeNull();
    expect(root.querySelector('.password-form')).toBeNull();
  });

  it.each(['cancelled', 'rejected'])('offers a retry if navigation is %s', async (reason) => {
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    if (reason === 'cancelled') navigate.mockResolvedValueOnce(false);
    else navigate.mockRejectedValueOnce(new Error('navigation failed'));
    navigate.mockResolvedValueOnce(true);
    session.status.set('authenticated');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('移動できませんでした');
    expect(root.querySelector('.google-button')).toBeNull();
    expect(root.querySelector('.password-form')).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('.retry-button')!.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('blocks sign-in while the session is unavailable and allows retry', async () => {
    session.status.set('unavailable');
    session.refresh.mockImplementation(async () => {
      session.status.set('guest');
      return false;
    });
    const fixture = TestBed.createComponent(GoogleLogin);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'アカウントを確認できませんでした',
    );
    expect(root.querySelector('.google-button')).toBeNull();
    expect(root.querySelector('.password-form')).toBeNull();

    root.querySelector<HTMLButtonElement>('.retry-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(session.refresh).toHaveBeenCalledOnce();
    expect(root.querySelector('.google-button')).not.toBeNull();
    expect(root.querySelector('.password-form')).not.toBeNull();
  });
});

describe('Google sign-in callback', () => {
  function setupCallback(
    state: string,
    savedState: string | null,
    error?: string,
    returnTo?: string,
  ) {
    const session = new Map<string, string>();
    if (savedState) session.set(STATE_KEY, savedState);
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    const replaceState = vi.fn();
    const fakeDocument = {
      documentElement: { dataset: {}, lang: '' },
      querySelector: () => null,
      defaultView: {
        location: {
          origin: 'http://localhost:4200',
          pathname: '/auth/google/callback',
          search: error ? `?state=${state}&error=${error}` : `?state=${state}&code=test-code`,
        },
        history: { state: null, replaceState },
        localStorage: { getItem: () => null },
        sessionStorage: {
          getItem: (key: string) => session.get(key) ?? null,
          setItem: (key: string, value: string) => session.set(key, value),
          removeItem: (key: string) => session.delete(key),
        },
        fetch,
      },
    };
    if (returnTo && savedState) {
      saveQuestionReturn(
        fakeDocument.defaultView.sessionStorage as unknown as Storage,
        savedState,
        returnTo,
      );
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: fakeDocument },
        { provide: AUTH_FETCH, useValue: fetch },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { routeConfig: { path: 'auth/google/callback' } } },
        },
        { provide: Router, useValue: router },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new GoogleLogin());
    return { component, fetch, replaceState, session, router };
  }

  it('exchanges a matched callback and requests the profile using cookies', async () => {
    const { component, fetch, replaceState, session, router } = setupCallback(
      'expected',
      'expected',
    );
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'test-user',
        email: 'test@example.com',
        name: null,
        avatarUrl: null,
        username: null,
      }),
    });

    component.ngOnInit();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const state = component as unknown as { phase: () => string };
    await vi.waitFor(() => expect(state.phase()).toBe('signed-in'));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/login');
    expect(session.has(STATE_KEY)).toBe(false);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ code: 'test-code' }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/me',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/v1/auth/me',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
  });

  it('returns a matched Google callback to its original explanation task', async () => {
    const target = '/questions/894a7456-75cf-43c8-bb51-02f6b84a6cc3?explain=1';
    const { component, fetch, router, replaceState } = setupCallback(
      'expected',
      'expected',
      undefined,
      target,
    );
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'test-user',
        email: 'fixture@example.test',
        name: null,
        avatarUrl: null,
      }),
    });
    component.ngOnInit();
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith(target, { replaceUrl: true }),
    );
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/login?' + new URLSearchParams({ returnTo: target }),
    );
  });

  it('times out a stuck code exchange and checks the session without accepting a late response', async () => {
    vi.useFakeTimers();
    try {
      const { component, fetch, router, session } = setupCallback('expected', 'expected');
      let resolveExchange!: (value: unknown) => void;
      fetch.mockResolvedValueOnce({ ok: false, status: 401 });
      fetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveExchange = resolve;
        }),
      );

      component.ngOnInit();
      expect(session.has(STATE_KEY)).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      const signal = (fetch.mock.calls[1][1] as RequestInit).signal;
      await vi.advanceTimersByTimeAsync(10_001);
      const state = component as unknown as { phase: () => string; error: () => string | null };
      expect(signal?.aborted).toBe(true);
      expect(state.phase()).toBe('error');
      expect(state.error()).toBe('api');
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch.mock.calls[2][0]).toBe('/api/v1/auth/me');
      resolveExchange({ ok: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts a pending code exchange when the component is destroyed', async () => {
    const { component, fetch, router } = setupCallback('expected', 'expected');
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockReturnValueOnce(new Promise(() => {}));
    component.ngOnInit();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const signal = (fetch.mock.calls[1][1] as RequestInit).signal;

    TestBed.resetTestingModule();
    await Promise.resolve();
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('finishes a valid exchange before redirecting an already authenticated user', async () => {
    const { component, fetch, router, session } = setupCallback('expected', 'expected');
    let resolveExchange!: (value: unknown) => void;
    const account = {
      id: 'test-user',
      email: 'test@example.com',
      name: null,
      avatarUrl: null,
      username: null,
    };
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExchange = resolve;
      }),
    );
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => account });
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => account });

    component.ngOnInit();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await expect(TestBed.inject(AuthSession).refresh()).resolves.toBe(true);
    TestBed.tick();
    expect(session.has(STATE_KEY)).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    resolveExchange({ ok: true });
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true }),
    );
    expect(fetch.mock.calls.filter(([url]) => url === '/api/v1/auth/login')).toHaveLength(1);
  });

  it('does not exchange the code when a user signed in before the callback', async () => {
    const { component, fetch, replaceState, session, router } = setupCallback(
      'expected',
      'expected',
    );
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'test-user',
        email: 'test@example.com',
        name: null,
        avatarUrl: null,
        username: null,
      }),
    });

    component.ngOnInit();
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true }),
    );
    expect(replaceState).toHaveBeenCalledWith(null, '', '/login');
    expect(session.has(STATE_KEY)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/me');
  });

  it('discards a validated code if the precheck is unavailable and asks a guest to restart', async () => {
    const { component, fetch, router, session } = setupCallback('expected', 'expected');
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    component.ngOnInit();
    const authSession = TestBed.inject(AuthSession);
    const state = component as unknown as {
      phase: () => string;
      error: () => string | null;
      retrySession: () => Promise<void>;
    };
    await vi.waitFor(() => expect(state.error()).toBe('restart'));
    expect(authSession.status()).toBe('unavailable');
    expect(session.has(STATE_KEY)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await state.retrySession();
    expect(authSession.status()).toBe('guest');
    expect(state.error()).toBe('restart');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fetch.mock.calls.every(([url]) => url === '/api/v1/auth/me')).toBe(true);
  });

  it('does not send the code when callback state is invalid', async () => {
    const { component, fetch, replaceState, session } = setupCallback('wrong', 'expected');

    component.ngOnInit();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/me');
    expect(session.has(STATE_KEY)).toBe(false);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/login');
  });

  it.each([400, 500])('shows an error when login returns %s', async (status) => {
    const { component, fetch } = setupCallback('expected', 'expected');
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockResolvedValueOnce({ ok: false, status });
    component.ngOnInit();

    const state = component as unknown as { phase: () => string; error: () => string | null };
    await vi.waitFor(() => expect(state.phase()).toBe('error'));
    expect(state.error()).toBe(status >= 500 ? 'api' : 'invalid');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toBe('/api/v1/auth/me');
  });

  it.each(['invalid', 'cancelled'])(
    'redirects a signed-in user after a %s callback without sending its code',
    async (kind) => {
      const { component, fetch, replaceState, session, router } =
        kind === 'cancelled'
          ? setupCallback('expected', 'expected', 'access_denied')
          : setupCallback('wrong', 'expected');
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-user',
          email: 'test@example.com',
          name: null,
          avatarUrl: null,
          username: null,
        }),
      });

      component.ngOnInit();
      await vi.waitFor(() =>
        expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true }),
      );
      expect(replaceState).toHaveBeenCalledWith(null, '', '/login');
      expect(session.has(STATE_KEY)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/me');
    },
  );

  it('allows a retry after an unavailable callback session and redirects if it succeeds', async () => {
    const { component, fetch, router } = setupCallback('wrong', 'expected');
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    component.ngOnInit();
    const session = TestBed.inject(AuthSession);
    await vi.waitFor(() => expect(session.status()).toBe('unavailable'));
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'test-user',
        email: 'test@example.com',
        name: null,
        avatarUrl: null,
        username: null,
      }),
    });

    await (component as unknown as { retrySession: () => Promise<void> }).retrySession();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(fetch.mock.calls.every(([url]) => url === '/api/v1/auth/me')).toBe(true);
  });

  it('shows an error for a malformed profile', async () => {
    const { component, fetch } = setupCallback('expected', 'expected');
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'test-user' }) });
    component.ngOnInit();

    const state = component as unknown as { phase: () => string; error: () => string | null };
    await vi.waitFor(() => expect(state.phase()).toBe('error'));
    expect(state.error()).toBe('api');
  });

  it('waits for the newest session check when a foreground refresh races login', async () => {
    const { component, fetch } = setupCallback('expected', 'expected');
    let resolveLoginRefresh!: (value: unknown) => void;
    let resolveForegroundRefresh!: (value: unknown) => void;
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    fetch.mockResolvedValueOnce({ ok: true });
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoginRefresh = resolve;
      }),
    );
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveForegroundRefresh = resolve;
      }),
    );

    component.ngOnInit();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const newer = TestBed.inject(AuthSession).refresh();
    resolveLoginRefresh({ ok: false, status: 401 });
    await Promise.resolve();

    const state = component as unknown as { phase: () => string };
    expect(state.phase()).toBe('working');
    resolveForegroundRefresh({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'test-user',
        email: 'test@example.com',
        name: null,
        avatarUrl: null,
        username: null,
      }),
    });
    await expect(newer).resolves.toBe(true);
    await vi.waitFor(() => expect(state.phase()).toBe('signed-in'));
  });
});

describe('Google sign-in initiation', () => {
  function setup(origin: string, native: boolean, status: SessionStatus = 'guest') {
    const assign = vi.fn();
    const stored = new Map<string, string>();
    const fakeDocument = {
      documentElement: { dataset: {}, lang: '' },
      querySelector: () => null,
      defaultView: {
        location: { origin, pathname: '/login', assign },
        localStorage: { getItem: () => null },
        sessionStorage: {
          setItem: (key: string, value: string) => stored.set(key, value),
          removeItem: (key: string) => stored.delete(key),
        },
        crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) },
        Capacitor: { isNativePlatform: () => native },
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: fakeDocument },
        { provide: ActivatedRoute, useValue: { snapshot: { routeConfig: { path: 'login' } } } },
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
        {
          provide: AuthSession,
          useValue: { status: signal<SessionStatus>(status), refresh: vi.fn() },
        },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new GoogleLogin());
    component.ngOnInit();
    return {
      component: component as unknown as {
        startSignIn: () => void;
        submitPassword: (
          event: Event,
          identifier: HTMLInputElement,
          password: HTMLInputElement,
        ) => void;
        error: () => string | null;
        passwordStatus: () => string | null;
      },
      assign,
      stored,
    };
  }

  it('starts Google sign-in from the configured local browser origin', () => {
    const { component, assign, stored } = setup('http://localhost:4200', false);
    component.startSignIn();
    expect(assign).toHaveBeenCalledOnce();
    const destination = new URL(assign.mock.calls[0][0]);
    expect(destination.origin).toBe('https://accounts.google.com');
    expect(destination.searchParams.get('state')).toBe(stored.get(STATE_KEY));
  });

  it('starts Google sign-in with the deployed callback on Cloud Run', () => {
    const origin = 'https://whylint-8715935974.asia-northeast1.run.app';
    const { component, assign, stored } = setup(origin, false);
    component.startSignIn();
    expect(assign).toHaveBeenCalledOnce();
    const destination = new URL(assign.mock.calls[0][0]);
    expect(destination.searchParams.get('redirect_uri')).toBe(`${origin}/auth/google/callback`);
    expect(destination.searchParams.get('state')).toBe(stored.get(STATE_KEY));
  });

  it('does not initiate the incomplete flow on an unconfigured origin', () => {
    const { component, assign, stored } = setup('https://example.com', false);
    component.startSignIn();
    expect(assign).not.toHaveBeenCalled();
    expect(stored.has(STATE_KEY)).toBe(false);
    expect(component.error()).toBe('origin');
  });

  it('does not launch the web flow inside a native app', () => {
    const { component, assign } = setup('http://localhost:4200', true);
    component.startSignIn();
    expect(assign).not.toHaveBeenCalled();
    expect(component.error()).toBe('native');
  });

  it.each(['loading', 'unavailable', 'authenticated'] as const)(
    'ignores stale sign-in actions while session is %s',
    (status) => {
      const { component, assign, stored } = setup('http://localhost:4200', false, status);
      component.startSignIn();
      const event = new Event('submit', { cancelable: true });
      const identifier = document.createElement('input');
      const password = document.createElement('input');
      identifier.value = 'sample-user';
      password.value = 'sample-password';
      component.submitPassword(event, identifier, password);
      expect(event.defaultPrevented).toBe(true);
      expect(component.passwordStatus()).toBeNull();
      expect(assign).not.toHaveBeenCalled();
      expect(stored.has(STATE_KEY)).toBe(false);
    },
  );
});
