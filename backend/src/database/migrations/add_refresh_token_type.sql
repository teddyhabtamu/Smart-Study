-- Migration: allow 'refresh' token type
-- Created: 2026-09-08 (Phase 1 auth upgrade)
-- Description: The tokens table CHECK constraint only allowed
-- password-reset / admin-invitation / email-verification. The new
-- refresh-token flow requires a 'refresh' type.
--
-- Applied to production via direct SQL on 2026-09-08. This file documents it
-- for fresh environments. Safe to re-run only after checking constraint state.

-- Drop the old constraint (if it exists)
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_type_check;

-- Add the new constraint including 'refresh'
ALTER TABLE tokens ADD CONSTRAINT tokens_type_check
  CHECK (type::text = ANY (ARRAY[
    'password-reset'::text,
    'admin-invitation'::text,
    'email-verification'::text,
    'refresh'::text
  ]));
