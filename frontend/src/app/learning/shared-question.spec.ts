import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthSession, type SessionStatus } from '../auth/auth-session';
import { LearningApi, LearningError } from './learning-api';
import { SharedQuestion } from './shared-question';

describe('Shared-question account recovery', () => {
  it('offers a retry after session restoration fails and then loads the public question', async () => {
    localStorage.removeItem('whylint-language');
    const status = signal<SessionStatus>('unavailable');
    const user = signal(null);
    const refresh = vi.fn(async () => {
      status.set('guest');
      return false;
    });
    const get = vi.fn().mockRejectedValue(new LearningError(404, 'NOT_FOUND'));
    const id = '894a7456-75cf-43c8-bb51-02f6b84a6cc3';
    const paramMap = convertToParamMap({ id });
    TestBed.configureTestingModule({
      imports: [SharedQuestion],
      providers: [
        provideRouter([]),
        { provide: AuthSession, useValue: { status, user, refresh } },
        { provide: LearningApi, useValue: { get } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(paramMap),
            queryParamMap: new BehaviorSubject(convertToParamMap({})),
            snapshot: { paramMap },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SharedQuestion);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'アカウントを確認できませんでした',
    );
    expect(get).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(refresh).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('/questions/' + id, expect.any(AbortSignal));
    expect(root.querySelector('h1')?.textContent).toContain('問題が見つかりません');
    expect(root.querySelector('app-loading-skeleton')).toBeNull();
  });
});
