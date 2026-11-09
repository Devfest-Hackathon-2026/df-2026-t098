import { inject, Injectable, InjectionToken, signal } from '@angular/core';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  username: string | null;
}

export type SessionStatus = 'loading' | 'authenticated' | 'guest' | 'unavailable';
type SessionResult =
  { status: 'authenticated'; user: AuthUser } | { status: 'guest' | 'unavailable'; user: null };
const SESSION_TIMEOUT_MS = 10_000;

export const AUTH_FETCH = new InjectionToken<typeof fetch>('AUTH_FETCH', {
  providedIn: 'root',
  factory: () => globalThis.fetch.bind(globalThis),
});

@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly request = inject(AUTH_FETCH);
  private readonly currentUser = signal<AuthUser | null>(null);
  private readonly currentStatus = signal<SessionStatus>('loading');
  private readonly logoutPending = signal(false);
  private pendingLogout: Promise<boolean> | null = null;
  private requestVersion = 0;
  private latestRefresh: Promise<boolean> | null = null;
  private activeController: AbortController | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly loggingOut = this.logoutPending.asReadonly();

  refresh(): Promise<boolean> {
    if (this.pendingLogout)
      return this.pendingLogout.then(() => this.currentStatus() === 'authenticated');
    const previousController = this.activeController;
    const controller = new AbortController();
    const version = ++this.requestVersion;
    this.currentStatus.set('loading');
    const refresh = this.loadSession(version, controller);
    this.latestRefresh = refresh;
    this.activeController = controller;
    previousController?.abort();
    return refresh;
  }

  logout(): Promise<boolean> {
    if (this.pendingLogout) return this.pendingLogout;
    this.logoutPending.set(true);
    // Invalidate any /me response that was already in flight.
    ++this.requestVersion;
    this.latestRefresh = null;
    this.activeController?.abort();
    this.activeController = null;
    if (this.currentUser()) this.currentStatus.set('authenticated');
    this.pendingLogout = this.endSession().finally(() => {
      this.logoutPending.set(false);
      this.pendingLogout = null;
    });
    return this.pendingLogout;
  }

  private async endSession(): Promise<boolean> {
    const controller = new AbortController();
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<null>((resolve) => {
      onAbort = () => resolve(null);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
    try {
      const response = await Promise.race([
        this.request('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        }),
        cancelled,
      ]);
      if (controller.signal.aborted || response?.status !== 204) return false;
      this.currentUser.set(null);
      this.currentStatus.set('guest');
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    }
  }

  private async loadSession(version: number, controller: AbortController): Promise<boolean> {
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<SessionResult>((resolve) => {
      onAbort = () => resolve({ status: 'unavailable', user: null });
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

    try {
      const result = await Promise.race([this.readSession(controller.signal), cancelled]);
      if (version !== this.requestVersion) return this.latestRefresh ?? false;
      this.currentUser.set(result.user);
      this.currentStatus.set(result.status);
      return result.status === 'authenticated';
    } catch {
      if (version !== this.requestVersion) return this.latestRefresh ?? false;
      this.currentUser.set(null);
      this.currentStatus.set('unavailable');
      return false;
    } finally {
      clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private async readSession(signal: AbortSignal): Promise<SessionResult> {
    const response = await this.request('/api/v1/auth/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (signal.aborted) return { status: 'unavailable', user: null };
    if (response.status === 401) return { status: 'guest', user: null };
    if (!response.ok) return { status: 'unavailable', user: null };

    const user: unknown = await response.json();
    return !signal.aborted && isAuthUser(user)
      ? { status: 'authenticated', user: { ...user, username: user.username ?? null } }
      : { status: 'unavailable', user: null };
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user['id'] === 'string' &&
    user['id'].trim().length > 0 &&
    typeof user['email'] === 'string' &&
    user['email'].trim().length > 0 &&
    (typeof user['name'] === 'string' || user['name'] === null) &&
    (typeof user['avatarUrl'] === 'string' || user['avatarUrl'] === null) &&
    (user['username'] === undefined ||
      user['username'] === null ||
      typeof user['username'] === 'string')
  );
}
