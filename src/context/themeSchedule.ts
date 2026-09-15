// ---------------------------------------------------------------------------
// themeSchedule: pure, DOM-free scheduling logic for the Auto theme mode.
//
// Kept separate from ThemeContext (React + localStorage + timers) so the
// rules are unit-verifiable in isolation and mirrored 1:1 by the pre-paint
// script in index.html. If you change the slot boundaries here, update the
// pre-paint script to match — it is a deliberate duplicate, commented as such.
//
// Schedule (reading-science backed: light by day, sepia toward evening,
// dark at night):
//   Day      06:00–16:59  -> slots.day      (default Ivory)
//   Evening  17:00–21:59  -> slots.evening  (default Parchment)
//   Night    22:00–05:59  -> slots.night    (default Midnight Iris)
// ---------------------------------------------------------------------------

export type ThemeId =
  | 'ivory'
  | 'parchment'
  | 'matcha'
  | 'midnight-iris'
  | 'abyss'
  | 'ember';

export const ALL_THEMES: ThemeId[] = [
  'ivory',
  'parchment',
  'matcha',
  'midnight-iris',
  'abyss',
  'ember',
];

export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && ALL_THEMES.includes(v as ThemeId);

export type AutoSlot = 'day' | 'evening' | 'night';

export interface AutoSlotMap {
  day: ThemeId;
  evening: ThemeId;
  night: ThemeId;
}

export const DEFAULT_AUTO_SLOTS: AutoSlotMap = {
  day: 'ivory',
  evening: 'parchment',
  night: 'midnight-iris',
};

/** Slot boundaries as whole hours in local time. Night wraps past midnight. */
export const SLOT_BOUNDARIES = {
  /** Inclusive start of Day. */
  dayStart: 6,
  /** Inclusive start of Evening (Day ends the hour before). */
  eveningStart: 17,
  /** Inclusive start of Night (Evening ends the hour before, wraps past midnight). */
  nightStart: 22,
} as const;

/** Which part of the schedule a local hour (0–23) falls in. Out-of-range hours clamp. */
export function slotForHour(hour: number): AutoSlot {
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  if (h >= SLOT_BOUNDARIES.dayStart && h < SLOT_BOUNDARIES.eveningStart) return 'day';
  if (h >= SLOT_BOUNDARIES.eveningStart && h < SLOT_BOUNDARIES.nightStart) return 'evening';
  return 'night';
}

/** Resolve the theme for a local hour. Unknown slot values fall back per-slot, never throw. */
export function themeForHour(hour: number, slots: Partial<AutoSlotMap> | null | undefined): ThemeId {
  const slot = slotForHour(hour);
  const candidate = slots?.[slot];
  return isThemeId(candidate) ? candidate : DEFAULT_AUTO_SLOTS[slot];
}

/** Parse persisted slot overrides. Partially corrupt payloads keep the valid slots. */
export function parseAutoSlots(raw: string | null | undefined): AutoSlotMap {
  const fallback = { ...DEFAULT_AUTO_SLOTS };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<AutoSlotMap>;
    if (parsed && typeof parsed === 'object') {
      (Object.keys(fallback) as AutoSlot[]).forEach((slot) => {
        if (isThemeId(parsed[slot])) fallback[slot] = parsed[slot] as ThemeId;
      });
    }
  } catch {
    // Corrupt JSON — defaults stand.
  }
  return fallback;
}

/** Current slot for "now" (injectable date for tests/clocks). */
export function currentSlot(now: Date = new Date()): AutoSlot {
  return slotForHour(now.getHours());
}

/** Current auto theme for "now" (injectable date for tests/clocks). */
export function currentAutoTheme(slots: AutoSlotMap, now: Date = new Date()): ThemeId {
  return themeForHour(now.getHours(), slots);
}

/** UI metadata for the per-slot pickers. Hours are local-time, end-exclusive. */
export const AUTO_SLOT_META: { slot: AutoSlot; label: string; hours: string }[] = [
  { slot: 'day', label: 'Day', hours: '6:00 – 17:00' },
  { slot: 'evening', label: 'Evening', hours: '17:00 – 22:00' },
  { slot: 'night', label: 'Night', hours: '22:00 – 6:00' },
];

/** Display name lookup for slot themes. */
export function themeName(id: ThemeId, themes: { id: ThemeId; name: string }[]): string {
  return themes.find((t) => t.id === id)?.name ?? id;
}
