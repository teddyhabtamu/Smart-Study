import rateLimit from 'express-rate-limit';

// Shared IP key generator: strips port suffixes some proxies append
// (IP:PORT format). Trust-proxy is enabled in server.ts so req.ip already
// reflects X-Forwarded-For.
export const ipKeyGenerator = (req: any): string => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(ip).replace(/:\d+[^:]*$/, '');
};

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
