import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthApi } from './auth-api';
import { AuthSession } from './auth-session';
import { UsernameSetup } from './username-setup';
import type { AuthUser, SessionStatus } from './auth-session';
import { AUTH_FETCH } from './auth-session';
import { provideRouter } from '@angular/router';

describe('optional username setup', () => {
  const user = signal<AuthUser | null>(null);
  const status = signal<SessionStatus>('authenticated');
  const setUsername = vi.fn();
  beforeEach(() => {
    user.set({
      id: 'user',
      email: 'learner@example.test',
      name: 'Learner',
      avatarUrl: null,
      username: null,
    });
    status.set('authenticated');
    setUsername.mockReset();
    TestBed.configureTestingModule({
      imports: [UsernameSetup],
      providers: [
        { provide: AuthSession, useValue: { user, status, loggingOut: signal(false) } },
        { provide: AuthApi, useValue: { setUsername } },
      ],
    });
  });

  it('permits an empty onboarding field and makes no request', async () => {
    const fixture = TestBed.createComponent(UsernameSetup);
    await fixture.whenStable();
    await expect(fixture.componentInstance.saveIfEntered()).resolves.toBe(true);
    expect(setUsername).not.toHaveBeenCalled();
  });

  it('validates input, keeps a conflict visible, and retries with a trimmed username', async () => {
    const fixture = TestBed.createComponent(UsernameSetup);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input')!;
    input.value = 'ab';
    input.dispatchEvent(new Event('input'));
    await expect(fixture.componentInstance.saveIfEntered()).resolves.toBe(false);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('3〜32文字');
    expect(setUsername).not.toHaveBeenCalled();
    input.value = '  学習者_1  ';
    input.dispatchEvent(new Event('input'));
    setUsername.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    await fixture.componentInstance.saveIfEntered();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('使用できない');
    expect(setUsername).toHaveBeenCalledWith('学習者_1');
    setUsername.mockImplementationOnce(async () => {
      user.set({ ...user()!, username: '学習者_1' });
      return { ok: true };
    });
    await expect(fixture.componentInstance.saveIfEntered()).resolves.toBe(true);
    fixture.detectChanges();
    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('保存しました');
  });

  it('hides the editor from guests and users who already have a username', async () => {
    user.set({ ...user()!, username: 'existing' });
    const fixture = TestBed.createComponent(UsernameSetup);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    user.set(null);
    status.set('guest');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
});

describe('username session recovery with the real AuthSession', () => {
  const account = {
    id: 'user',
    email: 'learner@example.test',
    name: 'Learner',
    avatarUrl: null,
    username: null as string | null,
  };
  let request: ReturnType<typeof vi.fn>;
  let session: AuthSession;
  const response = (status: number, body: unknown = {}) => ({
    status,
    ok: status === 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  beforeEach(async () => {
    request = vi.fn().mockResolvedValueOnce(response(200, account));
    TestBed.configureTestingModule({
      imports: [UsernameSetup],
      providers: [provideRouter([]), { provide: AUTH_FETCH, useValue: request }],
    });
    session = TestBed.inject(AuthSession);
    await session.refresh();
  });

  it('shows expiration and a sign-in link after PATCH 401 and /me 401', async () => {
    const fixture = TestBed.createComponent(UsernameSetup);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input')!;
    input.value = 'chosen_name';
    input.dispatchEvent(new Event('input'));
    request.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401));
    await expect(fixture.componentInstance.saveIfEntered()).resolves.toBe(false);
    fixture.detectChanges();
    expect(session.status()).toBe('guest');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('有効期限が切れました');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/login');
  });

  it('keeps a reload failure visible and retries /me without repeating the successful PATCH', async () => {
    const fixture = TestBed.createComponent(UsernameSetup);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input')!;
    input.value = 'chosen_name';
    input.dispatchEvent(new Event('input'));
    request
      .mockResolvedValueOnce(response(200, { ...account, username: 'chosen_name' }))
      .mockResolvedValueOnce(response(503));
    await expect(fixture.componentInstance.saveIfEntered()).resolves.toBe(false);
    fixture.detectChanges();
    expect(session.status()).toBe('unavailable');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('接続を確認して');
    request.mockResolvedValueOnce(response(200, { ...account, username: 'chosen_name' }));
    (root.querySelector('button.recovery') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(session.user()?.username).toBe('chosen_name');
    });
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(request.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(1);
  });
});
