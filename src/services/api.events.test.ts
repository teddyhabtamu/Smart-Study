import { describe, it, expect } from 'vitest';
import { splitEventDateTime, combineEventDateTime, eventInstantKey } from '../services/api';

// Pure instant helpers: backend ISO <-> local day + wall time. Timezone of
// the runner doesn't matter here — split and combine are inverse operations
// in whatever zone they run, which is exactly the round-trip the UI needs.
describe('event instant helpers', () => {
  it('splits an all-day midnight instant to date-only', () => {
    // Midnight Ethiopia in summer-UTC terms; in the runner zone it lands
    // wherever midnight-local is — still date-only by construction below.
    const localMidnight = new Date(2026, 8, 24, 0, 0, 0);
    expect(splitEventDateTime(localMidnight.toISOString())).toEqual({ date: '2026-09-24' });
  });

  it('splits a timed instant to date + HH:mm', () => {
    const d = new Date(2026, 8, 24, 14, 30, 0);
    expect(splitEventDateTime(d.toISOString())).toEqual({ date: '2026-09-24', time: '14:30' });
  });

  it('passes legacy YYYY-MM-DD rows through as all-day', () => {
    expect(splitEventDateTime('2026-09-24')).toEqual({ date: '2026-09-24' });
  });

  it('combines day + time into an ISO instant and back', () => {
    const iso = combineEventDateTime('2026-09-24', '14:30');
    expect(new Date(iso).getTime()).not.toBeNaN();
    expect(splitEventDateTime(iso)).toEqual({ date: '2026-09-24', time: '14:30' });
  });

  it('combines day-only to the bare date (backend normalizes)', () => {
    expect(combineEventDateTime('2026-09-24')).toBe('2026-09-24');
    expect(combineEventDateTime('2026-09-24', '')).toBe('2026-09-24');
  });

  it('orders timed tasks within their day', () => {
    const morning = eventInstantKey('2026-09-24', '09:00');
    const evening = eventInstantKey('2026-09-24', '18:00');
    const allDay = eventInstantKey('2026-09-24');
    expect(morning).toBeLessThan(evening);
    expect(allDay).toBeLessThanOrEqual(morning);
  });
});
