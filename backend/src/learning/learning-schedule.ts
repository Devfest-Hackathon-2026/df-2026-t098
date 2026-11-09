import { LEARNING_UTC_OFFSET, learningDay, nextDay } from './learning-calendar';

export const DAILY_REVIEW_HOUR = 9;

export function nextReviewAt(now = new Date()): Date {
  const hour = String(DAILY_REVIEW_HOUR).padStart(2, '0');
  const at = (day: string) =>
    new Date(`${day}T${hour}:00:00${LEARNING_UTC_OFFSET}`);
  const today = at(learningDay(now));
  return today.getTime() > now.getTime()
    ? today
    : at(nextDay(learningDay(now)));
}

export interface ReviewSchedule {
  box: number;
  dueAt: Date | null;
  needsReview: boolean;
  missed: boolean;
}

export const RESOLVED: ReviewSchedule = {
  box: 0,
  dueAt: null,
  needsReview: false,
  missed: false,
};

export function nextSchedule(
  box: number,
  correct: boolean,
  now = new Date(),
): ReviewSchedule {
  if (!correct)
    return {
      box: 1,
      dueAt: nextReviewAt(now),
      needsReview: true,
      missed: true,
    };
  return RESOLVED;
}

export const SCHEDULE_SQL = `box = $3, needs_review = $4, due_at = $5::timestamptz,
  last_missed_at = CASE WHEN $6 THEN now() ELSE last_missed_at END`;

export function scheduleParameters(schedule: ReviewSchedule): unknown[] {
  return [
    schedule.box,
    schedule.needsReview,
    schedule.dueAt?.toISOString() ?? null,
    schedule.missed,
  ];
}
