/** All "today / this month" math uses India time, never UTC date. */

export const INDIA_TZ = 'Asia/Kolkata';

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: INDIA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD in India time. */
export function todayStr(now: Date = new Date()): string {
  return dayFmt.format(now);
}

/** YYYY-MM in India time. */
export function monthPrefix(now: Date = new Date()): string {
  return todayStr(now).slice(0, 7);
}

/** Day of month in India time (1-31). */
export function todayDay(now: Date = new Date()): number {
  return Number(todayStr(now).slice(8, 10));
}

/** Epoch millis of the 1st of the current month, 00:00 IST. */
export function monthStartMillis(now: Date = new Date()): number {
  return Date.parse(`${monthPrefix(now)}-01T00:00:00+05:30`);
}

/** Short label like "Oct 1 – Oct 11" for the scan range. */
export function monthRangeLabel(now: Date = new Date()): string {
  const t = todayStr(now);
  const monthName = new Date(`${t}T00:00:00+05:30`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: INDIA_TZ,
  });
  return `${monthName} 1 – ${monthName} ${todayDay(now)}`;
}
