/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiServer from "@/lib/server/api.server";
import { Route as LoginRoute } from "@/routes/api.auth.login";
import { _resetRateLimiterForTesting } from "@/lib/server/rate-limiter.server";

describe("Login Brute-Force & Rate Limiting (POST /api/auth/login)", () => {
  const mockPasswordHash =
    "scrypt$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const mockUser = {
    id: "user-1234-uuid",
    email: "owner@example.com",
    passwordHash: mockPasswordHash,
    displayName: "Owner",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    process.env["DATABASE_URL"] = "mysql://mock:mock@localhost:3306/mock";
    _resetRateLimiterForTesting();
    vi.restoreAllMocks();
    (globalThis as any).__prisma = undefined;
  });

  it("permits normal login with valid credentials", async () => {
    const mockPrisma = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      session: {
        create: vi.fn().mockResolvedValue({ id: "session-1" }),
      },
      authRateLimit: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    (globalThis as any).__prisma = mockPrisma;
    vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(true);

    const handlers = (LoginRoute.options as any).server.handlers;
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "CorrectPassword123!" }),
    });

    const res = await handlers.POST({ request: req });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user).toBeDefined();
    expect(json.user.email).toBe("owner@example.com");
    expect(res.headers.get("set-cookie")).toContain("md_session=");
  });

  it("rejects invalid password with 401 Unauthorized", async () => {
    const mockPrisma = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      authRateLimit: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (globalThis as any).__prisma = mockPrisma;
    vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(false);

    const handlers = (LoginRoute.options as any).server.handlers;
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "WrongPassword!" }),
    });

    const res = await handlers.POST({ request: req });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Incorrect email or password.");
  });

  it("rejects non-existent email with identical 401 error without revealing existence", async () => {
    const mockPrisma = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      authRateLimit: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (globalThis as any).__prisma = mockPrisma;
    vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(false);

    const handlers = (LoginRoute.options as any).server.handlers;
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown-account@example.com", password: "AnyPassword123!" }),
    });

    const res = await handlers.POST({ request: req });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Incorrect email or password.");
  });

  it("throttles after repeated failed login attempts with HTTP 429 and Retry-After header", async () => {
    const mockPrisma = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      authRateLimit: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (globalThis as any).__prisma = mockPrisma;
    vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(false);

    const handlers = (LoginRoute.options as any).server.handlers;

    // Send 5 consecutive failed attempts
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": "198.51.100.55" },
        body: JSON.stringify({ email: "owner@example.com", password: `WrongAttempt${i}` }),
      });
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(401);
    }

    // 6th attempt must be rejected with 429 Too Many Requests BEFORE verifyPassword is called
    const verifySpy = vi.spyOn(apiServer, "verifyPassword");
    verifySpy.mockClear();

    const reqThrottled = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "198.51.100.55" },
      body: JSON.stringify({ email: "owner@example.com", password: "WrongAttempt6" }),
    });

    const resThrottled = await handlers.POST({ request: reqThrottled });
    const jsonThrottled = await resThrottled.json();

    expect(resThrottled.status).toBe(429);
    expect(jsonThrottled.error).toContain("Too many login attempts");
    expect(resThrottled.headers.get("retry-after")).toBeDefined();
    // Verify expensive scrypt hashing was NOT executed when throttled
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("throttles requests targeting the same account from multiple IPs", async () => {
    const mockPrisma = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      authRateLimit: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    (globalThis as any).__prisma = mockPrisma;
    vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(false);

    const handlers = (LoginRoute.options as any).server.handlers;

    // Send 5 attempts from different IPs targeting the same email
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": `203.0.113.${i + 1}` },
        body: JSON.stringify({ email: "target@example.com", password: `Guess${i}` }),
      });
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(401);
    }

    // Attempt from a brand new IP for that target account is throttled
    const reqNewIp = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "192.0.2.99" },
      body: JSON.stringify({ email: "target@example.com", password: "AnotherGuess" }),
    });

    const res = await handlers.POST({ request: reqNewIp });
    expect(res.status).toBe(429);
  });
});
