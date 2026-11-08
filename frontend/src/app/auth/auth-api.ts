import { inject, Injectable } from '@angular/core';
import { AUTH_FETCH, AuthSession } from './auth-session';

export type AuthFailure = 'invalid' | 'conflict' | 'unauthorized' | 'rateLimit' | 'unavailable';
export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly request = inject(AUTH_FETCH);
  private readonly session = inject(AuthSession);

  signup(data: { email: string; username: string; password: string }): Promise<AuthResult> {
    return this.mutate('/api/v1/auth/signup', 'POST', data);
  }

  passwordLogin(identifier: string, password: string): Promise<AuthResult> {
    return this.mutate('/api/v1/auth/password/login', 'POST', { identifier, password });
  }

  setUsername(username: string): Promise<AuthResult> {
    return this.mutate('/api/v1/auth/me/username', 'PATCH', { username });
  }

  private async mutate(path: string, method: string, data: unknown): Promise<AuthResult> {
    const controller = new AbortController();
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<null>((resolve) => {
      onAbort = () => resolve(null);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await Promise.race([
        this.request(path, {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        }),
        cancelled,
      ]);
      if (!response || controller.signal.aborted) return { ok: false, reason: 'unavailable' };
      if (response.status === 200 || response.status === 201) {
        // Finish the response before session restoration can replace the form.
        await Promise.race([response.text(), cancelled]);
        if (controller.signal.aborted) return { ok: false, reason: 'unavailable' };
        return (await this.session.refresh()) ? { ok: true } : { ok: false, reason: 'unavailable' };
      }
      if (response.status === 401) {
        if (method === 'PATCH') await this.session.refresh();
        return { ok: false, reason: 'unauthorized' };
      }
      const reason: AuthFailure =
        response.status === 400
          ? 'invalid'
          : response.status === 409
            ? 'conflict'
            : response.status === 429
              ? 'rateLimit'
              : 'unavailable';
      return { ok: false, reason };
    } catch {
      return { ok: false, reason: 'unavailable' };
    } finally {
      clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    }
  }
}
