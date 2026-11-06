import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthSession } from './auth-session';
import type { SessionStatus } from './auth-session';
import { guestOnlyGuard } from './guest.guard';

describe('guestOnlyGuard', () => {
  let status: ReturnType<typeof signal<SessionStatus>>;
  let refresh: ReturnType<typeof vi.fn>;
  let redirect: UrlTree;
  let createUrlTree: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    status = signal<SessionStatus>('loading');
    refresh = vi.fn();
    redirect = {} as UrlTree;
    createUrlTree = vi.fn().mockReturnValue(redirect);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthSession, useValue: { status: status.asReadonly(), refresh } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  function runGuard(): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() => guestOnlyGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
    )) as Promise<boolean | UrlTree>;
  }

  it('redirects an authenticated user after checking the server', async () => {
    refresh.mockImplementation(async () => { status.set('authenticated'); return true; });
    await expect(runGuard()).resolves.toBe(redirect);
    expect(refresh).toHaveBeenCalledOnce();
    expect(createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('allows a confirmed guest', async () => {
    refresh.mockImplementation(async () => { status.set('guest'); return false; });
    await expect(runGuard()).resolves.toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('allows the page to present a retryable unavailable state', async () => {
    refresh.mockImplementation(async () => { status.set('unavailable'); return false; });
    await expect(runGuard()).resolves.toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('waits for the initial check instead of redirecting while loading', async () => {
    let resolve!: (value: boolean) => void;
    refresh.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
    const navigation = runGuard();
    expect(status()).toBe('loading');
    expect(createUrlTree).not.toHaveBeenCalled();

    status.set('authenticated');
    resolve(true);
    await expect(navigation).resolves.toBe(redirect);
  });

  it('revalidates rather than trusting an expired in-memory session', async () => {
    status.set('authenticated');
    refresh.mockImplementation(async () => { status.set('guest'); return false; });
    await expect(runGuard()).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('uses the newest status when an in-flight check is superseded', async () => {
    let resolve!: (value: boolean) => void;
    refresh.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
    const navigation = runGuard();

    status.set('authenticated');
    resolve(false);
    await expect(navigation).resolves.toBe(redirect);
  });
});
