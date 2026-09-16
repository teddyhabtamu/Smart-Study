import rateLimit, { ipKeyGenerator as _ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

// Request-scoped wrapper around the LIBRARY helper. Why not use the helper
// directly or a hand-rolled parser? (1) express-rate-limit v8's keyGenerator
// option wants (req, res) => string while the helper takes (ip: string) —
// direct use fails TypeScript. (2) A hand-rolled req.ip parser trips the
// v8 IPv6 validation (ERR_ERL_KEY_GEN_IPV6 boot noise) and risks mangling
// IPv6. This wrapper satisfies both: the `_ipKeyGenerator` call keeps the
// exact `ipKeyGenerator` token in this function's source (what the runtime
// validator checks — verified: zero warnings) with proper subnet handling.
// Under trust-proxy (server.ts) req.ip already reflects X-Forwarded-For.
export const ipKeyGenerator = (req: Request): string =>
  _ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown');

const rateLimitValidate = {
  xForwardedForHeader: false, // Handled via trust proxy + ipKeyGenerator
  forwardedHeader: false,
} as const;

// Login-specific throttle: 20 FAILED attempts per IP per 15 minutes.
//
// Why separate from the global /api/ limiter (100/15min)? 100 password
// guesses per window is ample for credential stuffing. And why failures
// only (skipSuccessfulRequests)? Shared computer labs behind one public IP
// must never lock out 30 students just for logging in — only failure bursts
// (brute force, stuffing) consume budget.
//
// Always on, including development: the budget counts failures only, so
// normal dev/test traffic cannot trip it by accident.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidate,
  message: {
    success: false,
    code: 'TOO_MANY_LOGIN_ATTEMPTS',
    message: 'Too many failed login attempts. Please try again in 15 minutes.',
  },
});
