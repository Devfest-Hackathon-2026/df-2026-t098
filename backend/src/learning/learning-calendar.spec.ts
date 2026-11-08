import {
  currentStreak,
  learningDay,
  learningWeek,
  longestStreak,
} from './learning-calendar';

describe('Learning calendar', () => {
  it('rolls daily progress over at midnight in Japan', () => {
    expect(learningDay(new Date('2026-11-06T14:59:59Z'))).toBe('2026-11-06');
    expect(learningDay(new Date('2026-11-06T15:00:00Z'))).toBe('2026-11-07');
  });

  it('starts the ranking week on Monday in Japan', () => {
    expect(learningWeek(new Date('2026-11-08T14:59:59Z'))).toBe('2026-11-02');
    expect(learningWeek(new Date('2026-11-08T15:00:00Z'))).toBe('2026-11-09');
  });

  it('preserves a streak until the learner has missed a full day', () => {
    const days = new Set(['2026-11-04', '2026-11-05', '2026-11-06']);
    expect(currentStreak(days, '2026-11-06')).toBe(3);
    expect(currentStreak(days, '2026-11-07')).toBe(3);
    expect(currentStreak(days, '2026-11-08')).toBe(0);
  });

  it('keeps a previously earned streak badge through a later gap and year boundary', () => {
    const days = new Set([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-11-06',
    ]);
    expect(longestStreak(days)).toBe(3);
    expect(currentStreak(days, '2026-11-07')).toBe(1);
  });
});
