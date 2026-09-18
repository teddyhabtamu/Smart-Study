-- Migration: hour-precision study events (event_date DATE -> TIMESTAMPTZ)
-- Created: 2026-09-18
-- Description: Manual tasks were calendar days only, so intraday instants
-- (and the 1-hour push reminder, which needs hoursUntil === 1) were
-- unrepresentable. Existing days become midnight Africa/Addis_Ababa so the
-- calendar day every user saw is preserved exactly.
--
-- Safe to re-run (guarded: only fires while the column is still DATE).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'study_events'
      AND column_name = 'event_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE study_events
      ALTER COLUMN event_date TYPE TIMESTAMPTZ
      USING (event_date AT TIME ZONE 'Africa/Addis_Ababa');
  END IF;
END $$;
