/**
 * @module api/rateLimit
 * @description
 * Abuse controls for unauthenticated creation/admission endpoints:
 * - fixed-window rate limits keyed by a SHA-256 hash of the client address
 *   (raw addresses are never stored), persisted through the collaboration
 *   repository's `consumeRateLimit`;
 * - the shared class-creation password that gates **Run a class**.
 *
 * Limits are sized for a classroom where every Student shares one school
 * network address (typically ~22 Students per class).
 *
 * Rate limiting is best-effort: if the limiter itself cannot reach the
 * database the request proceeds, because the endpoint then fails on its own
 * database work anyway. The class password is always enforced.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { rateLimitBucket } from './_db.js';
import { getWorkspaceRepository } from './_workspace.js';

export const DEFAULT_CLASS_CREATION_PASSWORD = 'kepnertregoe';

export const RATE_LIMIT_POLICIES = Object.freeze({
  'class-create': Object.freeze({ windowSeconds: 3600, limit: 20 }),
  'class-admit': Object.freeze({ windowSeconds: 600, limit: 150 }),
  'workspace-create': Object.freeze({ windowSeconds: 3600, limit: 60 })
});

/**
 * Resolves the caller's address from Vercel proxy headers.
 * @param {object} req - Incoming request.
 * @returns {string} Client address or `unknown`.
 */
export function clientAddress(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  if (first) return first;
  const real = req?.headers?.['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return req?.socket?.remoteAddress || 'unknown';
}

/**
 * Default limiter backed by the collaboration repository.
 * @param {{bucket: string, windowSeconds: number, limit: number}} options - Hashed bucket and policy.
 * @returns {Promise<{allowed: boolean}>} Counter result.
 */
async function defaultRateLimiter(options) {
  const repository = await getWorkspaceRepository();
  return repository.consumeRateLimit(options);
}

/**
 * Consumes one slot for a policy and reports whether the request may proceed.
 * @param {object} req - Incoming request.
 * @param {string} policyName - Key of RATE_LIMIT_POLICIES.
 * @param {(options: object) => Promise<{allowed: boolean}>} [limiter] - Injectable limiter (tests).
 * @returns {Promise<{allowed: boolean, retryAfterSeconds: number}>} Decision.
 */
export async function checkRateLimit(req, policyName, limiter = defaultRateLimiter) {
  const policy = RATE_LIMIT_POLICIES[policyName];
  if (!policy) throw new Error(`Unknown rate-limit policy: ${policyName}`);
  try {
    const result = await limiter({
      bucket: rateLimitBucket(policyName, clientAddress(req)),
      windowSeconds: policy.windowSeconds,
      limit: policy.limit
    });
    return { allowed: result?.allowed !== false, retryAfterSeconds: policy.windowSeconds };
  } catch {
    return { allowed: true, retryAfterSeconds: policy.windowSeconds };
  }
}

/**
 * Sends the standard 429 response with privacy headers.
 * @param {object} res - Vercel response.
 * @param {number} retryAfterSeconds - Window length to advertise.
 * @returns {object} Response.
 */
export function sendRateLimited(res, retryAfterSeconds) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    error: 'Too many requests from this network. Please wait a moment and try again.',
    code: 'rate-limited'
  });
}

/**
 * Normalizes a class password for comparison (trimmed, case-insensitive).
 * @param {unknown} value - Raw value.
 * @returns {string} Normalized password.
 */
function normalizeClassPassword(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Returns the configured class-creation password (server environment overrides the default).
 * @returns {string} Normalized expected password.
 */
export function configuredClassCreationPassword() {
  return normalizeClassPassword(process.env.INTAKE_CLASS_CREATION_PASSWORD) || DEFAULT_CLASS_CREATION_PASSWORD;
}

/**
 * Compares a submitted class password in constant time.
 * @param {unknown} submitted - Password from the request body.
 * @returns {boolean} Whether it matches.
 */
export function classCreationPasswordMatches(submitted) {
  const candidate = normalizeClassPassword(submitted);
  if (!candidate) return false;
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(candidate), digest(configuredClassCreationPassword()));
}
