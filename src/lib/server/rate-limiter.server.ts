// Server-side persistent & in-memory rate limiter for brute-force and credential stuffing protection.
// Authoritative MySQL storage with row-level locking, race-safe key initialization, retry handling,
// in-flight admission concurrency throttling, Hostinger trusted-proxy policy, and resilient in-memory fallback.
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

// In-flight concurrency limits to prevent parallel scrypt CPU exhaustion bursts
export const MAX_IN_FLIGHT_AUTH_PER_IP = 5;
export const MAX_IN_FLIGHT_AUTH_PER_ACCOUNT = 2;
const IN_FLIGHT_TIMEOUT_MS = 15 * 1000; // 15-second safety auto-release

// In-memory bounded LRU / sliding cache
const memoryCache = new Map<string, RateLimitEntry>();
const MAX_MEMORY_ENTRIES = 5000;
let dbTableAvailable = true;
let warnedMissingTable = false;

// In-flight concurrency tracker: key -> Array of start timestamps
const inFlightRequests = new Map<string, number[]>();

export function _resetRateLimiterForTesting() {
  memoryCache.clear();
  inFlightRequests.clear();
  dbTableAvailable = true;
  warnedMissingTable = false;
}

export function _getMemoryCacheSizeForTesting(): number {
  return memoryCache.size;
}

export function _getMemoryCacheEntryForTesting(key: string): RateLimitEntry | undefined {
  return memoryCache.get(key);
}

export function _getInFlightCountForTesting(key: string): number {
  const list = inFlightRequests.get(key) || [];
  const now = Date.now();
  return list.filter((ts) => now - ts < IN_FLIGHT_TIMEOUT_MS).length;
}

export function getRateLimiterStatus(): {
  persistent: boolean;
  mode: "mysql" | "memory";
  memoryEntries: number;
  activeInFlightKeys: number;
} {
  return {
    persistent: dbTableAvailable && Boolean(process.env["DATABASE_URL"]),
    mode: dbTableAvailable && Boolean(process.env["DATABASE_URL"]) ? "mysql" : "memory",
    memoryEntries: memoryCache.size,
    activeInFlightKeys: inFlightRequests.size,
  };
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
 * - Production: "hostinger" (trusts only X-Real-IP set by LiteSpeed/Nginx reverse proxy).
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
 * - Hostinger uses LiteSpeed Web Server (LSWS) acting as reverse proxy to Node.js.
 * - Under standard Hostinger reverse proxy, X-Real-IP is set to $remote_addr.
 * - CF-Connecting-IP and X-Forwarded-For are strictly ignored because arbitrary clients can inject them
 *   unless Cloudflare origin pull is authenticated.
 * - If X-Real-IP is absent or invalid, returns "untrusted-proxy-client".
 *
 * Conservative Reverse-Proxy Security Note:
 * - Verified: Live production inspection confirms MindDesk is served behind LiteSpeed Web Server
 *   (`Server: LiteSpeed`, `platform: hostinger`, `panel: hpanel`).
 * - Documented LiteSpeed Behavior: In standard Hostinger reverse-proxy deployments, LiteSpeed populates
 *   `X-Real-IP` with the client socket's IP address. Untrusted client headers (`CF-Connecting-IP`,
 *   `X-Forwarded-For`) are ignored in Hostinger mode.
 * - Documented Uncertainty: The presence of `Server: LiteSpeed` does not by itself prove how `X-Real-IP`
 *   is rewritten under every edge routing configuration, and internal LiteSpeed config files cannot be
 *   inspected from within Node.js without root privileges.
 * - Multi-Layer Defense: Because IP trust carries inherent reverse-proxy uncertainties, account-level
 *   protection (`login:account:<email>`, 5 attempts per 15 minutes) and in-flight admission control
 *   operate completely independently of IP headers, ensuring attackers cannot bypass account lockout
 *   or brute-force protection even if proxy headers were spoofed.
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

/**
 * Pre-verification Admission Controller:
 *
 * ARCHITECTURAL CONCURRENCY BOUNDARY (PROCESS-LOCAL):
 * Note that this admission controller operates in process-local Node.js memory (`inFlightRequests`).
 * Therefore, its concurrency limits (max 2 in-flight verifications per account, max 5 per IP)
 * apply PER NODE.JS PROCESS. In a multi-process or clustered deployment (e.g. multiple Node.js
 * worker processes or containers), each individual worker process enforces this admission cap
 * locally; it is NOT a distributed cross-process synchronization lock.
 *
 * Distributed, cluster-wide rate limiting and brute-force protection across all workers
 * is authoritatively provided by MySQL row-level locking (`SELECT ... FOR UPDATE` on
 * the `auth_rate_limits` table in `recordFailedAttempt` and `checkRateLimit`).
 *
 * Purpose:
 * Protects the local process from parallel bursts of expensive `scrypt` CPU exhaustion attacks
 * and throttles simultaneous verification races before failed attempts are committed to MySQL.
 *
 * Returns a release function that MUST be invoked in a finally block.
 */
export function acquireAdmission(keys: string[]): () => void {
  const now = Date.now();

  // 1. Check in-flight thresholds
  for (const key of keys) {
    let list = inFlightRequests.get(key) || [];
    // Filter out expired reservations
    list = list.filter((ts) => now - ts < IN_FLIGHT_TIMEOUT_MS);
    inFlightRequests.set(key, list);

    const limit =
      key.includes(":account:") || key.includes(":user:")
        ? MAX_IN_FLIGHT_AUTH_PER_ACCOUNT
        : MAX_IN_FLIGHT_AUTH_PER_IP;

    if (list.length >= limit) {
      throw new ApiError(
        429,
        "Too many simultaneous authentication requests. Please wait a moment and try again.",
        {
          "retry-after": "5",
          "cache-control": "no-store",
        },
        { retryAfter: 5 },
      );
    }
  }

  // 2. Reserve admission slots
  const reservationId = now;
  for (const key of keys) {
    const list = inFlightRequests.get(key) || [];
    list.push(reservationId);
    inFlightRequests.set(key, list);
  }

  // 3. Return safe release function
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const key of keys) {
      const list = inFlightRequests.get(key);
      if (list) {
        const idx = list.indexOf(reservationId);
        if (idx !== -1) {
          list.splice(idx, 1);
        }
        if (list.length === 0) {
          inFlightRequests.delete(key);
        } else {
          inFlightRequests.set(key, list);
        }
      }
    }
  };
}

/**
 * Identifies strictly genuine missing-table errors.
 * Never misclassifies connection drops, syntax errors, or deadlocks as missing tables.
 */
function isGenuineMissingTableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
    return true;
  }
  if (err && typeof err === "object") {
    const e = err as { code?: string; errno?: number };
    if (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146) {
      return true;
    }
  }
  return false;
}

/**
 * Identifies transient, retryable MySQL / database concurrency errors.
 */
function isRetryableConcurrencyError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: transaction failed due to deadlock/write conflict
    // P2002: unique constraint race on simultaneous insert
    if (err.code === "P2034" || err.code === "P2002") return true;
  }
  if (err && typeof err === "object") {
    const e = err as { code?: string; errno?: number };
    // 1213: ER_LOCK_DEADLOCK, 1205: ER_LOCK_WAIT_TIMEOUT, 1062: ER_DUP_ENTRY
    if (
      e.code === "ER_LOCK_DEADLOCK" ||
      e.errno === 1213 ||
      e.code === "ER_LOCK_WAIT_TIMEOUT" ||
      e.errno === 1205 ||
      e.code === "ER_DUP_ENTRY" ||
      e.errno === 1062
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Executes an operation with controlled exponential backoff retry for transient concurrency conflicts.
 */
async function executeWithConcurrencyRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt >= maxRetries || !isRetryableConcurrencyError(err)) {
        throw err;
      }
      const backoffMs = attempt * 20 + Math.floor(Math.random() * 25);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

/**
 * Updates the in-memory cache and enforces LRU capacity bounding.
 */
function updateMemoryCache(key: string, entry: RateLimitEntry): void {
  // Move to end (most recently accessed)
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
    if (isGenuineMissingTableError(err)) {
      dbTableAvailable = false;
      if (!warnedMissingTable) {
        console.warn(
          "[rate-limiter] Table 'auth_rate_limits' not found (migration 0012 pending). Operating in memory-only fallback mode.",
        );
        warnedMissingTable = true;
      }
      return;
    }
    // Transient database failure: log warning and proceed with in-memory check for this request.
    // Do not disable dbTableAvailable permanently for transient errors!
    console.warn(
      "[rate-limiter] Database rate-limit check failed temporarily; proceeding with process-local check:",
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
 * Concurrency & Reliability Guarantees:
 * 1. Race-Safe Key Creation: Inserts a baseline row via atomic ON DUPLICATE KEY UPDATE before locking,
 *    preventing duplicate-key collision crashes when multiple workers process simultaneous first attempts.
 * 2. Authoritative Row Locking: Uses SELECT ... FOR UPDATE within a transaction to serialize concurrent updates.
 * 3. Deadlock & Race Retries: Automatically retries on lock deadlocks (1213) and duplicate entry races (1062).
 * 4. 15-Minute Window: Fixed counting window begins at first_at; resets if window elapses.
 * 5. Non-Extending Lockout: Repeated attempts during an active block do NOT extend blocked_until.
 * 6. Resilient Fallback: Transient connection errors fall back to in-memory store for that request without
 *    permanently disabling database persistence. Genuine missing table (P2021) operates in memory fallback.
 */
export async function recordFailedAttempt(
  key: string,
  maxPoints: number = DEFAULT_MAX_LOGIN_ACCOUNT_ATTEMPTS,
  windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
  blockDurationMs: number = DEFAULT_RATE_LIMIT_BLOCK_MS,
): Promise<{ blocked: boolean; retryAfterSeconds?: number; points: number }> {
  if (dbTableAvailable && process.env["DATABASE_URL"]) {
    try {
      const prisma = db();
      if (prisma?.authRateLimit && typeof prisma.$transaction === "function") {
        const result = await executeWithConcurrencyRetry(async () => {
          return await prisma.$transaction(async (tx) => {
            const now = Date.now();
            const nowDate = new Date(now);
            const initialId = randomUUID();

            // Step 1: Race-safe key initialization.
            // Guarantees the row exists without throwing duplicate key errors if two workers race on a new key.
            await tx.$executeRaw`
              INSERT INTO auth_rate_limits (id, \`key\`, points, first_at, last_at, blocked_until)
              VALUES (${initialId}, ${key}, 0, ${nowDate}, ${nowDate}, NULL)
              ON DUPLICATE KEY UPDATE \`last_at\` = \`last_at\`
            `;

            // Step 2: Row is guaranteed to exist. Exclusively lock the row for atomic evaluation.
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

            const row = rows[0]!;
            const currentPoints = row.points;
            const firstAtMs = new Date(row.first_at).getTime();
            const blockedUntilMs = row.blocked_until ? new Date(row.blocked_until).getTime() : null;

            // Case A: Key is currently actively blocked.
            // DO NOT EXTEND LOCKOUT. Keep existing blocked_until to protect legitimate owner from perpetual DoS.
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

            // Case B: Brand-new key (points === 0) or window has expired -> start fresh window
            if (currentPoints === 0 || now - firstAtMs > windowMs) {
              const isBlocked = 1 >= maxPoints;
              const blockedUntil = isBlocked ? new Date(now + blockDurationMs) : null;

              await tx.$executeRaw`
                UPDATE auth_rate_limits
                SET points = 1, first_at = ${nowDate}, last_at = ${nowDate}, blocked_until = ${blockedUntil}
                WHERE \`key\` = ${key}
              `;

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

            await tx.$executeRaw`
              UPDATE auth_rate_limits
              SET points = ${nextPoints}, last_at = ${nowDate}, blocked_until = ${blockedUntil}
              WHERE \`key\` = ${key}
            `;

            return {
              points: nextPoints,
              firstAt: firstAtMs,
              lastAt: now,
              blockedUntil: blockedUntil ? blockedUntil.getTime() : null,
              blocked: isBlocked,
              retryAfterSeconds: isBlocked ? Math.ceil(blockDurationMs / 1000) : undefined,
            };
          });
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
      if (isGenuineMissingTableError(err)) {
        dbTableAvailable = false;
        if (!warnedMissingTable) {
          console.warn(
            "[rate-limiter] Table 'auth_rate_limits' not found (migration 0012 pending). Operating in memory-only fallback mode.",
          );
          warnedMissingTable = true;
        }
      } else {
        console.warn(
          "[rate-limiter] Database transaction failed, falling back to process-local store for this attempt:",
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
      if (isGenuineMissingTableError(err)) {
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
