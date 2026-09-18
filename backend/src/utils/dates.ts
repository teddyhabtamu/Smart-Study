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

// An event instant's calendar day in Ethiopia, as a DATE. event_date is
// TIMESTAMPTZ: comparing the raw instant against a calendar date would
// bucket on the session TimeZone (UTC midnight) and misfile the 00:00–03:00
// EAT window into the wrong day. Use for every day-bucket comparison.
export const eatDaySql = (column: string): string =>
  `(${column} AT TIME ZONE '${EAT_TZ}')::date`;

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

// --- Study-event instants (hour-precision planning) -------------------------
// event_date used to be a DATE column, so every task was a calendar day and
// the 1-hour push reminder could never hit an intraday instant. The column
// is now TIMESTAMPTZ; these helpers keep every writer storing the SAME
// instant for the same wall time, so exact-match dedup keeps working.

// Day-precision input stays day-precision: midnight in Ethiopia, with an
// explicit offset so the value never depends on the server's TimeZone
// setting (Supabase pooler = UTC, old rows backfilled as EAT midnight).
export const normalizeEventDate = (raw: string): string => {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+03:00`;
  return s;
};

// Accepts YYYY-MM-DD (all-day) or a full ISO datetime with a time part
// (YYYY-MM-DDTHH:mm, optional seconds/fraction/offset). Anything else —
// bare years, month names, SQL fragments — is rejected before the DB.
export const isValidEventDate = (raw: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return !isNaN(new Date(`${s}T00:00:00Z`).getTime());
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return false;
  return !isNaN(Date.parse(s));
};

// Short human label for emails/toasts from a stored instant or calendar
// date: "Sep 20, 2:30 PM" when a time is set, "Sep 20" for all-day rows.
// Rendered in Ethiopia time (the product's day standard), never UTC.
export const formatEventDateTime = (value: unknown): string => {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  if (isNaN(d.getTime())) return String(value ?? '');
  const datePart = d.toLocaleDateString('en-US', {
    timeZone: EAT_TZ,
    month: 'short',
    day: 'numeric',
  });
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EAT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  if (get('hour') === '00' && get('minute') === '00') return datePart;
  const h12 = Number(get('hour')) % 12 || 12;
  const ampm = Number(get('hour')) < 12 ? 'AM' : 'PM';
  return `${datePart}, ${h12}:${get('minute')} ${ampm}`;
};
