// Ethiopian calendar-day helpers.
//
// Every "daily" rule in the product (quiz allowance, XP caps, streaks,
// dashboard buckets, plan windows) must run on the STUDENT's day, not the
// server's. Supabase runs UTC and Vercel containers run UTC, so naive
// CURRENT_DATE / toISOString slices flip the day at 9pm EAT and hand
// students lost streaks and eaten quiz attempts. Ethiopia has no DST
// (UTC+3 year-round), so the zone math below has no edge seasons.
export const EAT_TZ = 'Africa/Addis_Ababa';

// SQL fragment for "today in Ethiopia", usable anywhere CURRENT_DATE was.
// Example: `... WHERE created_at >= ${EAT_TODAY_SQL}`.
export const EAT_TODAY_SQL = `(now() AT TIME ZONE '${EAT_TZ}')::date`;

// YYYY-MM-DD in Ethiopia for `now` (default: this instant). en-CA formats
// ISO-style, so no manual padding and no UTC slicing.
export const eatTodayStr = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: EAT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

// English weekday name for a YYYY-MM-DD calendar date. Constructed at local
// noon from parts (never parsed as UTC midnight) so the runner's timezone
// can't shift the answer.
export const weekdayOfDateStr = (dateStr: string): string => {
  const [y = 0, m = 1, d = 1] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { weekday: 'long' });
};

// Shift a YYYY-MM-DD string by whole calendar days (local-noon anchored,
// DST-safe for EAT which observes none).
export const shiftDateStr = (dateStr: string, days: number): string => {
  const [y = 0, m = 1, d = 1] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + days);
  return (
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-` +
    String(dt.getDate()).padStart(2, '0')
  );
};
