/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractClientIp,
  isValidIp,
  normalizeIp,
  maskIp,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  cleanupRateLimits,
  acquireAdmission,
  getRateLimiterStatus,
  _resetRateLimiterForTesting,
  _getMemoryCacheSizeForTesting,
  _getInFlightCountForTesting,
} from "@/lib/server/rate-limiter.server";
import { Prisma } from "@prisma/client";

describe("Rate Limiter Engine & IP Extraction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete (globalThis as any).__prisma;
    _resetRateLimiterForTesting();
    vi.restoreAllMocks();
  });

  describe("IP Address Validation, Normalization, and Masking", () => {
    it("validates valid IPv4 addresses", () => {
      expect(isValidIp("192.168.1.1")).toBe(true);
      expect(isValidIp("8.8.8.8")).toBe(true);
      expect(isValidIp("127.0.0.1")).toBe(true);
      expect(isValidIp("255.255.255.255")).toBe(true);
    });

    it("rejects invalid IPv4 addresses and injection attempts", () => {
      expect(isValidIp("")).toBe(false);
      expect(isValidIp("999.999.999.999")).toBe(false);
      expect(isValidIp("192.168.1.1/24")).toBe(false);
      expect(isValidIp("192.168.1.1' OR 1=1--")).toBe(false);
      expect(isValidIp("<script>")).toBe(false);
      expect(isValidIp("localhost")).toBe(false);
    });

    it("validates IPv6 addresses", () => {
      expect(isValidIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
      expect(isValidIp("::1")).toBe(true);
      expect(isValidIp("::ffff:192.0.2.1")).toBe(true);
    });

    it("normalizes IPv4-mapped IPv6 addresses", () => {
      expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
      expect(normalizeIp("192.168.1.1")).toBe("192.168.1.1");
    });

    it("masks IP addresses to protect visitor privacy in application logs", () => {
      expect(maskIp("192.168.1.50")).toBe("192.168.***.***");
      expect(maskIp("203.0.113.195")).toBe("203.0.***.***");
      expect(maskIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:0db8:****");
      expect(maskIp("127.0.0.1")).toBe("127.0.0.1");
      expect(maskIp("untrusted-proxy-client")).toBe("untrusted-proxy-client");
    });
  });

  describe("Trusted Reverse-Proxy Policies", () => {
    it("Hostinger policy: trusts strictly X-Real-IP and ignores spoofed CF-Connecting-IP / X-Forwarded-For", () => {
      process.env["TRUST_PROXY"] = "hostinger";

      // An attacker attempts to spoof CF-Connecting-IP and X-Forwarded-For to evade rate limits
      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "cf-connecting-ip": "1.2.3.4",
          "x-forwarded-for": "5.6.7.8, 9.10.11.12",
          "x-real-ip": "198.51.100.42",
        },
      });

      // Under Hostinger policy, OpenLiteSpeed overwrites X-Real-IP with client remote_addr; CF and XFF are ignored
      expect(extractClientIp(req)).toBe("198.51.100.42");
    });

    it("Hostinger policy: safely falls back to 'untrusted-proxy-client' when X-Real-IP is absent", () => {
      process.env["TRUST_PROXY"] = "hostinger";

      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "cf-connecting-ip": "1.2.3.4",
          "x-forwarded-for": "5.6.7.8",
        },
      });

      // Because X-Real-IP is absent, does NOT trust spoofed headers; groups into untrusted-proxy-client
      expect(extractClientIp(req)).toBe("untrusted-proxy-client");
    });

    it("Cloudflare policy: trusts CF-Connecting-IP when explicitly configured", () => {
      process.env["TRUST_PROXY"] = "cloudflare";

      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "cf-connecting-ip": "203.0.113.195",
          "x-real-ip": "10.0.0.1",
        },
      });
      expect(extractClientIp(req)).toBe("203.0.113.195");
    });

    it("Forwarded policy: extracts strictly the rightmost IP in proxy chain", () => {
      process.env["TRUST_PROXY"] = "forwarded";

      // Attacker sends spoofed "1.1.1.1", but trusted reverse proxy appends real IP "198.51.100.77"
      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "x-forwarded-for": "1.1.1.1, 10.0.0.5, 198.51.100.77",
        },
      });
      expect(extractClientIp(req)).toBe("198.51.100.77");
    });

    it("None policy: does not trust any forwarding headers and returns 127.0.0.1", () => {
      process.env["TRUST_PROXY"] = "none";

      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "cf-connecting-ip": "1.2.3.4",
          "x-real-ip": "5.6.7.8",
          "x-forwarded-for": "9.10.11.12",
        },
      });
      expect(extractClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("Rate-Limit Counting & Concurrency", () => {
    it("allows attempts below threshold and blocks at threshold", async () => {
      const key = "test:user:1";
      await recordFailedAttempt(key, 5, 60000, 60000);
      await recordFailedAttempt(key, 5, 60000, 60000);

      await expect(checkRateLimit([key])).resolves.toBeUndefined();

      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt(key, 5, 60000, 60000);
      }

      await expect(checkRateLimit([key])).rejects.toMatchObject({
        status: 429,
        message: expect.stringContaining("Too many"),
      });
    });

    it("handles concurrent requests without lost updates", async () => {
      const key = "test:concurrent:1";
      const totalAttempts = 20;

      // Dispatch 20 concurrent parallel attempts
      const promises = Array.from({ length: totalAttempts }, () =>
        recordFailedAttempt(key, 50, 60000, 60000),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(totalAttempts);

      // The highest points observed must equal the total attempts (no lost increments)
      const maxPoints = Math.max(...results.map((r) => r.points));
      expect(maxPoints).toBe(totalAttempts);
    });

    it("prevents permanent owner lockout: does not extend lockout expiration on repeated attacks while blocked", async () => {
      const key = "test:lockout:extend";
      const blockDurationMs = 10000;

      // Trigger block with 3 attempts
      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt(key, 3, 60000, blockDurationMs);
      }

      const initialResult = await recordFailedAttempt(key, 3, 60000, blockDurationMs);
      expect(initialResult.blocked).toBe(true);
      const initialRetryAfter = initialResult.retryAfterSeconds!;

      // Attacker sends 5 more attempts while already blocked
      for (let i = 0; i < 5; i++) {
        const spamResult = await recordFailedAttempt(key, 3, 60000, blockDurationMs);
        expect(spamResult.blocked).toBe(true);
        // The retry period must NOT increase beyond the initial remaining window
        expect(spamResult.retryAfterSeconds).toBeLessThanOrEqual(initialRetryAfter);
      }
    });

    it("fixed window expires after windowMs, restarting with a fresh counter", async () => {
      const key = "test:window:expire";
      const shortWindowMs = 50;

      // 2 failed attempts in first window
      await recordFailedAttempt(key, 5, shortWindowMs, 60000);
      const res1 = await recordFailedAttempt(key, 5, shortWindowMs, 60000);
      expect(res1.points).toBe(2);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, 60));

      // Next attempt starts fresh window (points resets to 1)
      const res2 = await recordFailedAttempt(key, 5, shortWindowMs, 60000);
      expect(res2.points).toBe(1);
    });

    it("keeps memory usage bounded under unique key flooding via LRU eviction", async () => {
      // Simulate flood of 6,000 distinct attacker keys
      for (let i = 0; i < 5500; i++) {
        recordFailedAttempt(`flood:key:${i}`, 5, 60000, 60000);
      }

      const size = _getMemoryCacheSizeForTesting();
      // Must not exceed MAX_MEMORY_ENTRIES (5000)
      expect(size).toBeLessThanOrEqual(5000);
    });
  });

  describe("Database Persistence & Missing Table Graceful Fallback", () => {
    it("falls back gracefully to in-memory store when Prisma throws P2021 (table missing)", async () => {
      const p2021Error = new Prisma.PrismaClientKnownRequestError(
        "Table minddesk.auth_rate_limits does not exist",
        { code: "P2021", clientVersion: "6.0.0", meta: { table: "auth_rate_limits" } },
      );

      const mockPrisma = {
        authRateLimit: {
          findMany: vi.fn().mockRejectedValue(p2021Error),
          deleteMany: vi.fn().mockRejectedValue(p2021Error),
        },
        $transaction: vi.fn().mockRejectedValue(p2021Error),
      };
      (globalThis as any).__prisma = mockPrisma;
      process.env["DATABASE_URL"] = "mysql://mock:mock@localhost:3306/mock";

      const key = "test:p2021:fallback";
      // Does not throw 500 server error when table is missing
      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt(key, 3, 60000, 60000);
      }

      // In-memory rate limiting continues functioning correctly
      await expect(checkRateLimit([key])).rejects.toMatchObject({ status: 429 });
    });

    it("prunes stale entries during cleanup", async () => {
      const cleaned = await cleanupRateLimits();
      expect(typeof cleaned).toBe("number");
    });

    it("distinguishes transient connection errors from missing table, keeping persistence enabled for future queries", async () => {
      const connError = new Prisma.PrismaClientKnownRequestError(
        "Can't reach database server at localhost:3306",
        { code: "P1001", clientVersion: "6.0.0" },
      );

      const mockPrisma = {
        authRateLimit: {
          findMany: vi.fn().mockRejectedValue(connError),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        $transaction: vi.fn().mockRejectedValue(connError),
      };
      (globalThis as any).__prisma = mockPrisma;
      process.env["DATABASE_URL"] = "mysql://mock:mock@localhost:3306/mock";

      const key = "test:transient:drop";
      // Transient error should fall back for this attempt without permanently disabling persistent mode
      const result = await recordFailedAttempt(key, 5, 60000, 60000);
      expect(result.points).toBe(1);

      const status = getRateLimiterStatus();
      // Persistence flag must remain true because table is not missing!
      expect(status.persistent).toBe(true);
    });
  });

  describe("Pre-Verification Admission Throttling (In-Flight Concurrency)", () => {
    it("admits concurrent operations up to threshold and throttles parallel bursts exceeding limits", () => {
      const accountKey = "login:account:victim@example.com";
      const ipKey = "login:ip:198.51.100.22";

      // Account limit is 2 concurrent in-flight verifications
      const release1 = acquireAdmission([ipKey, accountKey]);
      const release2 = acquireAdmission([ipKey, accountKey]);

      expect(_getInFlightCountForTesting(accountKey)).toBe(2);

      // 3rd concurrent request for the same account must be immediately rejected with 429
      expect(() => acquireAdmission([ipKey, accountKey])).toThrowError(
        /Too many simultaneous authentication requests/,
      );

      // When an in-flight operation completes and releases its token, admission opens up
      release1();
      expect(_getInFlightCountForTesting(accountKey)).toBe(1);

      // Now another request can be admitted cleanly
      const release3 = acquireAdmission([ipKey, accountKey]);
      expect(_getInFlightCountForTesting(accountKey)).toBe(2);

      release2();
      release3();
      expect(_getInFlightCountForTesting(accountKey)).toBe(0);
    });

    it("enforces independent in-flight limits for distinct accounts from different IPs", () => {
      const releaseA = acquireAdmission(["login:ip:10.0.0.1", "login:account:userA@example.com"]);
      const releaseB = acquireAdmission(["login:ip:10.0.0.2", "login:account:userB@example.com"]);

      expect(_getInFlightCountForTesting("login:account:userA@example.com")).toBe(1);
      expect(_getInFlightCountForTesting("login:account:userB@example.com")).toBe(1);

      releaseA();
      releaseB();
    });
  });
});
