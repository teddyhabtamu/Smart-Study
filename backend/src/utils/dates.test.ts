import { describe, it, expect } from 'vitest';
import {
  EAT_TZ,
  EAT_TODAY_SQL,
  eatTodayStr,
  weekdayOfDateStr,
  shiftDateStr,
} from './dates';

// Every "daily" product rule (quiz allowance, XP caps, streaks, dashboard
// buckets, plan windows) runs on the student's Ethiopian day. Supabase and
// Vercel run UTC, so a UTC day slice flips at 9pm EAT and steals evening
// streaks and quiz attempts. These pin the EAT anchoring.
describe('eatTodayStr (Ethiopian calendar day)', () => {
  it('is Sep 16 EAT just after UTC midnight', () => {
    // 2026-09-16T00:30Z = 03:30 EAT Sep 16.
    expect(eatTodayStr(new Date('2026-09-16T00:30:00Z'))).toBe('2026-09-16');
  });

  it('is still Sep 15 EAT at 20:59 UTC (23:59 EAT)', () => {
    expect(eatTodayStr(new Date('2026-09-15T20:59:59Z'))).toBe('2026-09-15');
  });

  it('flips to Sep 16 EAT exactly at 21:00 UTC (midnight EAT)', () => {
    expect(eatTodayStr(new Date('2026-09-15T21:00:00Z'))).toBe('2026-09-16');
  });

  it('exposes the zone and SQL fragment used by every daily rule', () => {
    expect(EAT_TZ).toBe('Africa/Addis_Ababa');
    expect(EAT_TODAY_SQL).toContain('Africa/Addis_Ababa');
    expect(EAT_TODAY_SQL).toContain('::date');
  });
});

describe('weekdayOfDateStr (runner-timezone-proof weekday)', () => {
  it('names 2026-09-16 Wednesday and neighbors correctly', () => {
    expect(weekdayOfDateStr('2026-09-16')).toBe('Wednesday');
    expect(weekdayOfDateStr('2026-09-18')).toBe('Friday');
    expect(weekdayOfDateStr('2026-09-20')).toBe('Sunday');
    expect(weekdayOfDateStr('2026-09-21')).toBe('Monday');
    expect(weekdayOfDateStr('2026-09-25')).toBe('Friday');
  });
});

describe('shiftDateStr (calendar-day arithmetic)', () => {
  it('adds days across month boundaries', () => {
    expect(shiftDateStr('2026-09-16', 0)).toBe('2026-09-16');
    expect(shiftDateStr('2026-09-16', 13)).toBe('2026-09-29');
    expect(shiftDateStr('2026-09-30', 1)).toBe('2026-10-01');
  });
});
