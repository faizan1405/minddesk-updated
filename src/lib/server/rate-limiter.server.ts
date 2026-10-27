// Server-side persistent & in-memory sliding-window rate limiter for brute-force protection.
// Resilient to missing database table (P2021) and multi-process Hostinger environments.
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { db, ApiError } from "./api.server";

export interface RateLimitEntry {
  points: number;
  firstAt: number;
  lastAt: number;
  blockedUntil: number | null;
}

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_MAX_LOGIN_IP_ATTEMPTS = 10;
export const DEFAULT_MAX_LOGIN_ACCOUNT_ATTEMPTS = 5;
export const DEFAULT_MAX_REAUTH_ATTEMPTS = 5;

// In-memory LRU / sliding cache
const memoryCache = new Map<string, RateLimitEntry>();
const MAX_MEMORY_ENTRIES = 5000;
let dbTableAvailable = true;
let warnedMissingTable = false;

export function _resetRateLimiterForTesting() {
  memoryCache.clear();
  dbTableAvailable = true;
  warnedMissingTable = false;
}

/**
 * Validates and normalizes client IP address.
 * Safely handles IPv4, IPv6, and IPv4-mapped IPv6.
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase();
  // Strip IPv4-mapped IPv6 prefix if present (e.g. "::ffff:192.0.2.1" -> "192.0.2.1")
  if (trimmed.startsWith("::ffff:") && isIP(trimmed.slice(7)) === 4) {
    return trimmed.slice(7);
  }
  return trimmed;
}

/**
 * Validates whether string is a syntactically valid IPv4 or IPv6 address.
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  const version = isIP(trimmed);
  if (version === 4 || version === 6) return true;
  if (trimmed.startsWith("::ffff:") && isIP(trimmed.slice(7)) === 4) return true;
  return false;
}

/**
 * Safely extracts client IP without blindly trusting client-supplied headers.
 * Priority:
 * 1. cf-connecting-ip (Cloudflare edge)
 * 2. x-real-ip (OpenLiteSpeed / Nginx immediate reverse proxy)
 * 3. x-forwarded-for (last/rightmost valid IP added by the trusted reverse proxy)
 * 4. Fallback: "127.0.0.1"
 */
export function extractClientIp(request: Request): string {
  // 1. Cloudflare header
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && isValidIp(cfIp)) {
    return normalizeIp(cfIp);
  }

  // 2. Hostinger OpenLiteSpeed / Nginx sets X-Real-IP to the connecting client's IP
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return normalizeIp(realIp);
  }

  // 3. X-Forwarded-For: In reverse proxy chains, take the rightmost valid IP appended by the trusted proxy
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i]!;
      if (isValidIp(candidate)) {
        return normalizeIp(candidate);
      }
    }
  }

  return "127.0.0.1";
}

/**
 * Creates a standardized 429 RateLimit ApiError with Retry-After header.
 */
export function createRateLimitError(
  retryAfterSeconds: number,
  actionName: string = "login attempts",
): ApiError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const message = `Too many ${actionName}. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  return new ApiError(
    429,
    message,
    {
      "retry-after": retryAfterSeconds.toString(),
      "cache-control": "no-store",
    },
    {
      retryAfter: retryAfterSeconds,
      retryAfterMinutes: minutes,
    },
  );
}

/**
 * Checks if any of the given rate-limit keys are currently blocked.
 * Throws ApiError(429) if a block is active.
 */
export async function checkRateLimit(
  keys: string[],
  actionName: string = "login attempts",
): Promise<void> {
  const now = Date.now();

  // 1. Fast in-memory check
  for (const key of keys) {
    const mem = memoryCache.get(key);
    if (mem && mem.blockedUntil && mem.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((mem.blockedUntil - now) / 1000);
      throw createRateLimitError(retryAfterSeconds, actionName);
    }
  }

  // 2. Persistent MySQL check (if table is available)
  if (!dbTableAvailable || !process.env["DATABASE_URL"]) return;

  try {
    const prisma = db();
    if (!prisma?.authRateLimit) return;
    const records = await prisma.authRateLimit.findMany({
      where: {
        key: { in: keys },
        blockedUntil: { gt: new Date(now) },
      },
    });

    if (records.length > 0) {
      // Find the record with the latest blockedUntil
      let maxBlockedUntilMs = now;
      for (const r of records) {
        if (r.blockedUntil) {
          const bMs = r.blockedUntil.getTime();
          if (bMs > maxBlockedUntilMs) maxBlockedUntilMs = bMs;

          // Update memory cache
          memoryCache.set(r.key, {
            points: r.points,
            firstAt: r.firstAt.getTime(),
            lastAt: r.lastAt.getTime(),
            blockedUntil: bMs,
          });
        }
      }

      if (maxBlockedUntilMs > now) {
        const retryAfterSeconds = Math.ceil((maxBlockedUntilMs - now) / 1000);
        throw createRateLimitError(retryAfterSeconds, actionName);
      }
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      dbTableAvailable = false;
      if (!warnedMissingTable) {
        console.warn(
          "[rate-limiter] auth_rate_limits table not found. Using in-memory rate limiting until migration 0012 is applied.",
        );
        warnedMissingTable = true;
      }
      return;
    }
    // Non-fatal database error: degrade gracefully to in-memory check
    console.warn(
      "[rate-limiter] Database check failed, falling back to in-memory store:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Records a failed attempt for a given key.
 * If points reach or exceed maxPoints within windowMs, sets blockedUntil for blockDurationMs.
 */
export async function recordFailedAttempt(
  key: string,
  maxPoints: number = DEFAULT_MAX_LOGIN_ACCOUNT_ATTEMPTS,
  windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
  blockDurationMs: number = DEFAULT_RATE_LIMIT_BLOCK_MS,
): Promise<{ blocked: boolean; retryAfterSeconds?: number; points: number }> {
  const now = Date.now();

  // 1. Update in-memory entry
  let mem = memoryCache.get(key);
  if (!mem || (now - mem.firstAt > windowMs && (!mem.blockedUntil || mem.blockedUntil <= now))) {
    mem = {
      points: 1,
      firstAt: now,
      lastAt: now,
      blockedUntil: null,
    };
  } else {
    mem.points += 1;
    mem.lastAt = now;
  }

  let blocked = false;
  let retryAfterSeconds: number | undefined;

  if (mem.points >= maxPoints) {
    blocked = true;
    mem.blockedUntil = now + blockDurationMs;
    retryAfterSeconds = Math.ceil(blockDurationMs / 1000);
  }

  // Manage in-memory capacity
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    pruneMemoryCache(now);
  }
  memoryCache.set(key, mem);

  // 2. Persist to MySQL if available
  if (dbTableAvailable && process.env["DATABASE_URL"]) {
    try {
      const prisma = db();
      if (!prisma?.authRateLimit)
        return {
          blocked,
          points: mem.points,
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        };
      const blockedUntilDate = mem.blockedUntil ? new Date(mem.blockedUntil) : null;

      await prisma.authRateLimit.upsert({
        where: { key },
        create: {
          key,
          points: mem.points,
          firstAt: new Date(mem.firstAt),
          lastAt: new Date(mem.lastAt),
          blockedUntil: blockedUntilDate,
        },
        update: {
          points: mem.points,
          lastAt: new Date(mem.lastAt),
          blockedUntil: blockedUntilDate,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
        dbTableAvailable = false;
        if (!warnedMissingTable) {
          console.warn(
            "[rate-limiter] auth_rate_limits table not found. Using in-memory rate limiting until migration 0012 is applied.",
          );
          warnedMissingTable = true;
        }
      } else {
        console.warn(
          "[rate-limiter] Database persist failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return {
    blocked,
    points: mem.points,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

/**
 * Resets rate limit counters for given keys (e.g. upon successful authentication).
 */
export async function resetRateLimit(keys: string[]): Promise<void> {
  // Clear memory cache
  for (const key of keys) {
    memoryCache.delete(key);
  }

  // Clear MySQL records if available
  if (dbTableAvailable && process.env["DATABASE_URL"]) {
    try {
      const prisma = db();
      if (!prisma?.authRateLimit) return;
      await prisma.authRateLimit.deleteMany({
        where: { key: { in: keys } },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
        dbTableAvailable = false;
      }
      // Non-fatal
    }
  }
}

/**
 * Safely prunes stale entries from in-memory cache.
 */
function pruneMemoryCache(now: number): void {
  for (const [k, v] of memoryCache.entries()) {
    if (v.blockedUntil && v.blockedUntil > now) continue;
    if (now - v.lastAt > DEFAULT_RATE_LIMIT_WINDOW_MS) {
      memoryCache.delete(k);
    }
  }
}

/**
 * Cleans up expired rate-limit records from database and memory.
 */
export async function cleanupRateLimits(): Promise<number> {
  const now = Date.now();
  pruneMemoryCache(now);

  if (!dbTableAvailable || !process.env["DATABASE_URL"]) return 0;

  try {
    const prisma = db();
    if (!prisma?.authRateLimit) return 0;
    const cutoff = new Date(now - DEFAULT_RATE_LIMIT_WINDOW_MS * 2);
    const res = await prisma.authRateLimit.deleteMany({
      where: {
        lastAt: { lt: cutoff },
        OR: [{ blockedUntil: null }, { blockedUntil: { lt: new Date(now) } }],
      },
    });
    return res.count;
  } catch {
    return 0;
  }
}
