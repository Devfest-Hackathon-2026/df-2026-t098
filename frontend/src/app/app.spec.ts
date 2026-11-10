import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { AuthSession } from './auth/auth-session';
import type { SessionStatus } from './auth/auth-session';

describe('App', () => {
  const session = {
    status: signal<SessionStatus>('guest'),
    user: signal(null),
    refresh: vi.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    session.refresh.mockClear();
    session.status.set('guest');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AuthSession, useValue: session }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the routed app shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows an accessible skeleton while the first route waits on the session', async () => {
    session.status.set('loading');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent,
    ).toContain('画面を読み込み中');
    expect(fixture.nativeElement.querySelector('app-loading-skeleton')).not.toBeNull();
  });

  it('checks the session at startup and when the app returns to the foreground', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const fixture = TestBed.createComponent(App);
    expect(session.refresh).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(session.refresh).toHaveBeenCalledTimes(2);

    fixture.destroy();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(session.refresh).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });
});
