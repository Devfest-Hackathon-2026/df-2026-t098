import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { LeaderboardPanel } from './leaderboard-panel';
import { LearningApi } from './learning-api';
import { FeedStore } from './feed-store';
import { AuthSession } from '../auth/auth-session';

describe('Weekly ranking', () => {
  async function render(
    entries: { rank: number; user: { id: string; displayName: string }; xp: number }[],
  ) {
    await TestBed.configureTestingModule({
      imports: [LeaderboardPanel],
      providers: [
        {
          provide: LearningApi,
          useValue: {
            get: vi
              .fn()
              .mockResolvedValue({ weekStart: '2026-11-09', timezone: 'Asia/Tokyo', entries }),
          },
        },
        { provide: FeedStore, useValue: { daily: signal(null) } },
        { provide: AuthSession, useValue: { user: signal(null), status: signal('guest') } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(LeaderboardPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('turns an empty week into a way back to the feed, not a dead end', async () => {
    const fixture = await render([]);
    const start = vi.fn();
    fixture.componentInstance.startLearning.subscribe(start);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'li.empty button.signin-cta',
    );
    expect(button?.textContent?.trim()).toBe('問題に挑戦する');
    button!.click();
    expect(start).toHaveBeenCalledOnce();
  });

  it('shows ranked learners without the empty-state action', async () => {
    const fixture = await render([{ rank: 1, user: { id: 'u1', displayName: 'Aki' }, xp: 40 }]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Aki');
    expect(root.querySelector('li.empty')).toBeNull();
  });
});
