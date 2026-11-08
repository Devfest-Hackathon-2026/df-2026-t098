import { LEARNING_UTC_OFFSET, learningDay, nextDay } from './learning-calendar';

/**
 * Practice scheduling. A missed question goes into the learner's Practice collection and
 * returns to their feed every day at 09:00 (learning time zone) until they answer it
 * correctly. Each day it is served once; if they scroll past it, it comes back the next
 * morning. Solving it right away (the in-session retry card or the Practice tab) clears it.
 */
export const DAILY_REVIEW_HOUR = 9;

/** The next 09:00 in the learning time zone strictly after `now`. */
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

/** A correct answer clears the question from Practice; a miss schedules it for 09:00. */
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
