export const LEARNING_TIMEZONE = 'Asia/Tokyo';
/** Japan has no daylight saving time, so its UTC offset is constant. */
export const LEARNING_UTC_OFFSET = '+09:00';

export function learningDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LEARNING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function learningWeek(now = new Date()): string {
  const date = new Date(`${learningDay(now)}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function currentStreak(
  days: Set<string>,
  today = learningDay(),
): number {
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}

export function longestStreak(days: Set<string>): number {
  let longest = 0;
  let length = 0;
  let previous: string | undefined;
  for (const day of [...days].sort()) {
    length = previous === previousDay(day) ? length + 1 : 1;
    longest = Math.max(longest, length);
    previous = day;
  }
  return longest;
}
