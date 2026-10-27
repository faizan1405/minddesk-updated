/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractClientIp,
  isValidIp,
  normalizeIp,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  cleanupRateLimits,
  _resetRateLimiterForTesting,
} from "@/lib/server/rate-limiter.server";
import { Prisma } from "@prisma/client";

describe("Rate Limiter Engine & IP Extraction", () => {
  beforeEach(() => {
    _resetRateLimiterForTesting();
    vi.restoreAllMocks();
  });

  describe("IP Address Validation and Extraction", () => {
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

    it("prioritizes cf-connecting-ip from Cloudflare edge", () => {
      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "cf-connecting-ip": "203.0.113.195",
          "x-real-ip": "10.0.0.1",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        },
      });
      expect(extractClientIp(req)).toBe("203.0.113.195");
    });

    it("uses x-real-ip from Hostinger reverse proxy if cf-connecting-ip is absent", () => {
      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "x-real-ip": "198.51.100.42",
          "x-forwarded-for": "10.0.0.2",
        },
      });
      expect(extractClientIp(req)).toBe("198.51.100.42");
    });

    it("extracts rightmost valid IP from x-forwarded-for without trusting client-spoofed prefix", () => {
      // Attacker sends spoofed "1.1.1.1" in X-Forwarded-For, but trusted proxy appends real IP "198.51.100.77"
      const req = new Request("http://localhost/api/auth/login", {
        headers: {
          "x-forwarded-for": "1.1.1.1, 198.51.100.77",
        },
      });
      expect(extractClientIp(req)).toBe("198.51.100.77");
    });

    it("falls back to 127.0.0.1 when no valid IP headers are present", () => {
      const req = new Request("http://localhost/api/auth/login");
      expect(extractClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("In-Memory Sliding-Window Limiter", () => {
    it("allows attempts below threshold", async () => {
      const key = "test:user:1";
      await recordFailedAttempt(key, 5, 60000, 60000);
      await recordFailedAttempt(key, 5, 60000, 60000);

      await expect(checkRateLimit([key])).resolves.toBeUndefined();
    });

    it("blocks when attempts reach threshold within window", async () => {
      const key = "test:user:2";
      for (let i = 0; i < 4; i++) {
        await recordFailedAttempt(key, 5, 60000, 60000);
      }
      await expect(checkRateLimit([key])).resolves.toBeUndefined();

      // 5th attempt triggers block
      const result = await recordFailedAttempt(key, 5, 60000, 60000);
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);

      // Subsequent check throws 429
      await expect(checkRateLimit([key])).rejects.toMatchObject({
        status: 429,
        message: expect.stringContaining("Too many"),
      });
    });

    it("resets counters when resetRateLimit is called", async () => {
      const key = "test:user:3";
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(key, 5, 60000, 60000);
      }

      await expect(checkRateLimit([key])).rejects.toMatchObject({ status: 429 });

      await resetRateLimit([key]);
      await expect(checkRateLimit([key])).resolves.toBeUndefined();
    });

    it("expires block after blockDuration has elapsed", async () => {
      const key = "test:user:4";
      // Block duration: 50ms
      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt(key, 3, 60000, 50);
      }

      await expect(checkRateLimit([key])).rejects.toMatchObject({ status: 429 });

      // Wait for block to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      await expect(checkRateLimit([key])).resolves.toBeUndefined();
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
          upsert: vi.fn().mockRejectedValue(p2021Error),
          deleteMany: vi.fn().mockRejectedValue(p2021Error),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      process.env["DATABASE_URL"] = "mysql://mock:mock@localhost:3306/mock";

      const key = "test:p2021:1";
      // Does not throw 500 error when table is missing
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
  });
});
