// Server-side persistent & in-memory rate limiter for brute-force and credential stuffing protection.
// Authoritative MySQL storage with row-level locking, Hostinger trusted-proxy policy, and resilient in-memory fallback.
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { ApiError, db } from "./api.server";

export interface RateLimitEntry {
  points: number;
  firstAt: number;
  lastAt: number;
  blockedUntil: number | null;
}

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15-minute counting window
export const DEFAULT_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000; // 15-minute temporary lockout
export const DEFAULT_MAX_LOGIN_IP_ATTEMPTS = 10;
export const DEFAULT_MAX_LOGIN_ACCOUNT_ATTEMPTS = 5;
export const DEFAULT_MAX_REAUTH_ATTEMPTS = 5;

// In-memory bounded LRU / sliding cache
const memoryCache = new Map<string, RateLimitEntry>();
const MAX_MEMORY_ENTRIES = 5000;
let dbTableAvailable = true;
let warnedMissingTable = false;

export function _resetRateLimiterForTesting() {
  memoryCache.clear();
  dbTableAvailable = true;
  warnedMissingTable = false;
}

export function _getMemoryCacheSizeForTesting(): number {
  return memoryCache.size;
}

export function _getMemoryCacheEntryForTesting(key: string): RateLimitEntry | undefined {
  return memoryCache.get(key);
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
 * Safely masks an IP address for logging to protect visitor privacy.
 * Never logs raw or identifiable IP addresses.
 */
export function maskIp(ip: string): string {
  if (!ip) return "unknown";
  if (ip === "untrusted-proxy-client" || ip === "127.0.0.1") return ip;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 2).join(":")}:****`;
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return "***.***.***.***";
}

export type TrustedProxyStrategy = "hostinger" | "cloudflare" | "forwarded" | "none";

/**
 * Resolves the active trusted-proxy policy.
 * Configured via TRUST_PROXY env var ("hostinger" | "cloudflare" | "forwarded" | "none").
 * Default:
 * - Production: "hostinger" (trusts only X-Real-IP set by OpenLiteSpeed/Nginx reverse proxy).
 * - Development/Test: "none" (does not trust spoofable headers unless explicitly configured).
 */
export function getTrustedProxyStrategy(): TrustedProxyStrategy {
  const configured = process.env["TRUST_PROXY"]?.trim().toLowerCase();
  if (configured === "cloudflare") return "cloudflare";
  if (configured === "forwarded") return "forwarded";
  if (configured === "none" || configured === "false" || configured === "0") return "none";
  if (configured === "hostinger" || configured === "true" || configured === "1") return "hostinger";

  if (process.env["NODE_ENV"] === "production") {
    return "hostinger";
  }
  return "none";
}

/**
 * Safely extracts client IP according to the trusted reverse-proxy policy.
 *
 * Hostinger Policy ("hostinger"):
 * - OpenLiteSpeed/Nginx runs locally on Hostinger and sets X-Real-IP to the connecting client's $remote_addr.
 * - CF-Connecting-IP and X-Forwarded-For are strictly ignored because arbitrary clients can inject them
 *   unless Cloudflare origin pull is authenticated.
 * - If X-Real-IP is absent or invalid, returns "untrusted-proxy-client".
 *
 * Cloudflare Policy ("cloudflare"):
 * - Reads CF-Connecting-IP when explicitly verified behind Cloudflare.
 *
 * None Policy ("none"):
 * - Direct connection / dev; forwarding headers are not trusted. Falls back to "127.0.0.1".
 */
export function extractClientIp(request: Request): string {
  const strategy = getTrustedProxyStrategy();

  if (strategy === "hostinger") {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp && isValidIp(realIp)) {
      return normalizeIp(realIp);
    }
    return "untrusted-proxy-client";
  }

  if (strategy === "cloudflare") {
    const cfIp = request.headers.get("cf-connecting-ip")?.trim();
    if (cfIp && isValidIp(cfIp)) {
      return normalizeIp(cfIp);
    }
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp && isValidIp(realIp)) {
      return normalizeIp(realIp);
    }
    return "untrusted-proxy-client";
  }

  if (strategy === "forwarded") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const parts = forwardedFor
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      // Strictly inspect the single rightmost IP added by the immediate proxy
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = parts[i]!;
        if (isValidIp(candidate)) {
          return normalizeIp(candidate);
        }
      }
    }
    return "untrusted-proxy-client";
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

function isMissingTableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  if (err && typeof err === "object") {
    const e = err as { code?: string; errno?: number; message?: string };
    if (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146) return true;
    if (
      typeof e.message === "string" &&
      (e.message.includes("auth_rate_limits") ||
        (e.message.includes("Table") && e.message.includes("doesn't exist")))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Updates the in-memory cache and enforces LRU capacity bounding.
 */
function updateMemoryCache(key: string, entry: RateLimitEntry): void {
  // Move to end (most recently used)
  memoryCache.delete(key);
  memoryCache.set(key, entry);

  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    pruneMemoryCache(Date.now());
    // If still over capacity after pruning expired items, evict oldest entries
    if (memoryCache.size > MAX_MEMORY_ENTRIES) {
      const targetSize = Math.floor(MAX_MEMORY_ENTRIES * 0.8);
      for (const k of memoryCache.keys()) {
        memoryCache.delete(k);
        if (memoryCache.size <= targetSize) break;
      }
    }
  }
}

/**
 * Checks if any of the given rate-limit keys are currently blocked.
 * Authoritative: checks MySQL database first; syncs memory cache.
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

  // 2. Authoritative MySQL check (if table is available)
  if (!dbTableAvailable || !process.env["DATABASE_URL"]) return;

  try {
    const prisma = db();
    if (!prisma?.authRateLimit) return;

    const records = await prisma.authRateLimit.findMany({
      where: { key: { in: keys } },
    });

    let maxBlockedUntilMs = 0;
    for (const r of records) {
      const blockedUntilMs = r.blockedUntil ? r.blockedUntil.getTime() : null;
      const firstAtMs = r.firstAt.getTime();
      const lastAtMs = r.lastAt.getTime();

      updateMemoryCache(r.key, {
        points: r.points,
        firstAt: firstAtMs,
        lastAt: lastAtMs,
        blockedUntil: blockedUntilMs,
      });

      if (blockedUntilMs && blockedUntilMs > now) {
        if (blockedUntilMs > maxBlockedUntilMs) {
          maxBlockedUntilMs = blockedUntilMs;
        }
      }
    }

    if (maxBlockedUntilMs > now) {
      const retryAfterSeconds = Math.ceil((maxBlockedUntilMs - now) / 1000);
      throw createRateLimitError(retryAfterSeconds, actionName);
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (isMissingTableError(err)) {
      dbTableAvailable = false;
      if (!warnedMissingTable) {
        console.warn(
          "[rate-limiter] auth_rate_limits table not found. Using in-memory rate limiting until migration 0012 is applied.",
        );
        warnedMissingTable = true;
      }
      return;
    }
    // Non-fatal database connectivity error: degrade gracefully to in-memory check
    console.warn(
      "[rate-limiter] Database check failed, falling back to in-memory store:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Records a failed attempt in memory (used directly or as fallback when DB is down).
 */
function recordFailedAttemptInMemory(
  key: string,
  maxPoints: number,
  windowMs: number,
  blockDurationMs: number,
): { blocked: boolean; retryAfterSeconds?: number; points: number } {
  const now = Date.now();
  let mem = memoryCache.get(key);

  // If currently blocked, DO NOT extend lockout (prevents permanent malicious lockouts)
  if (mem && mem.blockedUntil && mem.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((mem.blockedUntil - now) / 1000);
    return {
      blocked: true,
      points: mem.points,
      retryAfterSeconds,
    };
  }

  // Window check: if expired, start a fresh 15-minute window
  if (!mem || now - mem.firstAt > windowMs) {
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

  updateMemoryCache(key, mem);

  return {
    blocked,
    points: mem.points,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

/**
 * Records a failed attempt for a given key.
 *
 * Guarantees:
 * 1. Authoritative MySQL row-level locking (SELECT ... FOR UPDATE) inside transaction.
 * 2. Simultaneous failed attempts are counted accurately with zero lost updates.
 * 3. 15-minute fixed window starts at first failed attempt; resets when window elapses.
 * 4. When maxPoints is reached, sets blockedUntil for blockDurationMs.
 * 5. While locked out, subsequent attempts DO NOT extend the lockout, preventing permanent DoS.
 * 6. Graceful in-memory fallback if table is missing (P2021) or database is unreachable.
 */
export async function recordFailedAttempt(
  key: string,
  maxPoints: number = DEFAULT_MAX_LOGIN_ACCOUNT_ATTEMPTS,
  windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
  blockDurationMs: number = DEFAULT_RATE_LIMIT_BLOCK_MS,
): Promise<{ blocked: boolean; retryAfterSeconds?: number; points: number }> {
  // If database is available, execute authoritative atomic transaction with row lock
  if (dbTableAvailable && process.env["DATABASE_URL"]) {
    try {
      const prisma = db();
      if (prisma?.authRateLimit && typeof prisma.$transaction === "function") {
        const result = await prisma.$transaction(async (tx) => {
          // Row-level lock on key
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              key: string;
              points: number;
              first_at: Date;
              last_at: Date;
              blocked_until: Date | null;
            }>
          >`SELECT id, \`key\`, points, first_at, last_at, blocked_until FROM auth_rate_limits WHERE \`key\` = ${key} FOR UPDATE`;

          const now = Date.now();
          const nowDate = new Date(now);

          if (rows.length === 0) {
            // First failed attempt for this key
            const isBlocked = 1 >= maxPoints;
            const blockedUntil = isBlocked ? new Date(now + blockDurationMs) : null;
            const id = randomUUID();

            await tx.$executeRaw`INSERT INTO auth_rate_limits (id, \`key\`, points, first_at, last_at, blocked_until) VALUES (${id}, ${key}, 1, ${nowDate}, ${nowDate}, ${blockedUntil})`;

            return {
              points: 1,
              firstAt: now,
              lastAt: now,
              blockedUntil: blockedUntil ? blockedUntil.getTime() : null,
              blocked: isBlocked,
              retryAfterSeconds: isBlocked ? Math.ceil(blockDurationMs / 1000) : undefined,
            };
          }

          const row = rows[0]!;
          const currentPoints = row.points;
          const firstAtMs = new Date(row.first_at).getTime();
          const blockedUntilMs = row.blocked_until ? new Date(row.blocked_until).getTime() : null;

          // Case A: Key is currently actively blocked.
          // DO NOT EXTEND LOCKOUT. Keep existing blocked_until so legitimate owners cannot be kept out indefinitely.
          if (blockedUntilMs && blockedUntilMs > now) {
            return {
              points: currentPoints,
              firstAt: firstAtMs,
              lastAt: new Date(row.last_at).getTime(),
              blockedUntil: blockedUntilMs,
              blocked: true,
              retryAfterSeconds: Math.ceil((blockedUntilMs - now) / 1000),
            };
          }

          // Case B: Window has expired (and key is not actively blocked) -> start fresh window
          if (now - firstAtMs > windowMs) {
            const isBlocked = 1 >= maxPoints;
            const blockedUntil = isBlocked ? new Date(now + blockDurationMs) : null;

            await tx.$executeRaw`UPDATE auth_rate_limits SET points = 1, first_at = ${nowDate}, last_at = ${nowDate}, blocked_until = ${blockedUntil} WHERE \`key\` = ${key}`;

            return {
              points: 1,
              firstAt: now,
              lastAt: now,
              blockedUntil: blockedUntil ? blockedUntil.getTime() : null,
              blocked: isBlocked,
              retryAfterSeconds: isBlocked ? Math.ceil(blockDurationMs / 1000) : undefined,
            };
          }

          // Case C: Active window -> atomic increment
          const nextPoints = currentPoints + 1;
          const isBlocked = nextPoints >= maxPoints;
          const blockedUntil = isBlocked ? new Date(now + blockDurationMs) : null;

          await tx.$executeRaw`UPDATE auth_rate_limits SET points = ${nextPoints}, last_at = ${nowDate}, blocked_until = ${blockedUntil} WHERE \`key\` = ${key}`;

          return {
            points: nextPoints,
            firstAt: firstAtMs,
            lastAt: now,
            blockedUntil: blockedUntil ? blockedUntil.getTime() : null,
            blocked: isBlocked,
            retryAfterSeconds: isBlocked ? Math.ceil(blockDurationMs / 1000) : undefined,
          };
        });

        // Update in-memory cache with authoritative state
        updateMemoryCache(key, {
          points: result.points,
          firstAt: result.firstAt,
          lastAt: result.lastAt,
          blockedUntil: result.blockedUntil,
        });

        return {
          blocked: result.blocked,
          points: result.points,
          ...(result.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: result.retryAfterSeconds }
            : {}),
        };
      }
    } catch (err: unknown) {
      if (isMissingTableError(err)) {
        dbTableAvailable = false;
        if (!warnedMissingTable) {
          console.warn(
            "[rate-limiter] auth_rate_limits table not found. Using in-memory rate limiting until migration 0012 is applied.",
          );
          warnedMissingTable = true;
        }
      } else {
        console.warn(
          "[rate-limiter] Database transaction failed, falling back to in-memory store:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // In-memory fallback
  return recordFailedAttemptInMemory(key, maxPoints, windowMs, blockDurationMs);
}

/**
 * Resets rate limit counters for given keys (e.g. upon successful authentication).
 * Note: Only pass account/user keys to reset specific accounts. Never pass IP keys
 * on successful login to prevent attackers from clearing IP rate limits using valid credentials.
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
      if (isMissingTableError(err)) {
        dbTableAvailable = false;
      }
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
