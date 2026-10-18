import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skipInTests?: boolean;
}

/**
 * Creates an in-memory sliding window rate limiter middleware
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    skipInTests = true
  } = options;

  const hits = new Map<string, RateLimitRecord>();

  // Cleanup expired entries periodically to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  // Allow Node process to exit cleanly without waiting for this timer
  if (interval.unref) {
    interval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Optionally skip in unit tests unless explicitly requested via test header
    if (skipInTests && process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    // Determine client IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = hits.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds
      });
    }

    next();
  };
}

// 1. Strict rate limiter for Authentication endpoints (prevents brute-force)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min per IP
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  skipInTests: true
});

// 2. Sensitive Action rate limiter (e.g. notification retries, exports)
export const sensitiveActionRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 requests per 5 minutes
  message: 'Too many operations in a short time. Please slow down.',
  skipInTests: true
});
