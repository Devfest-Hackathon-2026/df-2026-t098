import { nextReviewAt, nextSchedule, RESOLVED } from './learning-schedule';

describe('practice schedule', () => {
  it('returns missed questions at the next 09:00 Japan time', () => {
    expect(
      nextReviewAt(new Date('2026-11-08T08:30:00+09:00')).toISOString(),
    ).toBe('2026-11-08T00:00:00.000Z');
    expect(
      nextReviewAt(new Date('2026-11-08T09:00:00+09:00')).toISOString(),
    ).toBe('2026-11-09T00:00:00.000Z');
    expect(
      nextReviewAt(new Date('2026-11-08T23:59:00+09:00')).toISOString(),
    ).toBe('2026-11-09T00:00:00.000Z');
    expect(
      nextReviewAt(new Date('2026-12-31T22:00:00+09:00')).toISOString(),
    ).toBe('2027-01-01T00:00:00.000Z');
  });

  it('schedules a miss for the next morning and keeps it in Practice', () => {
    const now = new Date('2026-11-08T13:00:00+09:00');
    expect(nextSchedule(0, false, now)).toEqual({
      box: 1,
      dueAt: new Date('2026-11-09T09:00:00+09:00'),
      needsReview: true,
      missed: true,
    });
  });

  it('clears the question on any correct answer', () => {
    expect(nextSchedule(1, true)).toEqual(RESOLVED);
    expect(nextSchedule(0, true)).toEqual(RESOLVED);
    expect(RESOLVED).toEqual({
      box: 0,
      dueAt: null,
      needsReview: false,
      missed: false,
    });
  });
});
