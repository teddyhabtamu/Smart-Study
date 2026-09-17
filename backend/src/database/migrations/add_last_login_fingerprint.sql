-- Migration: last login fingerprint (new-device login emails)
-- Created: 2026-09-17
-- Description: Login-success emails used to fire on EVERY sign-in, burning
-- Brevo quota and spamming users. Now they fire only when the IP or device
-- differs from the previous login. NULL = never recorded (first login after
-- this migration always notifies, which is the safe direction).
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_device TEXT;
