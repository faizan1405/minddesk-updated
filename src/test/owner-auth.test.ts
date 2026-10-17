import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetBootstrapForTesting,
  bootstrapOwnerAccount,
  hashPassword,
  verifyPassword,
} from "@/lib/server/api.server";
import { previewRequest } from "@/lib/preview/adapter";
import { Route as SignupRoute } from "@/routes/api.auth.signup";

describe("Owner Authentication System", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete (globalThis as any).__prisma;
    _resetBootstrapForTesting();
    vi.restoreAllMocks();
  });

  describe("Password Hashing & Verification", () => {
    it("hashes password with scrypt format and verifies correctly", async () => {
      const password = "SuperSecretPassword123!";
      const hash = await hashPassword(password);

      expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword("WrongPassword", hash)).toBe(false);
      expect(await verifyPassword("", hash)).toBe(false);
    });
  });

  describe("Owner Account Bootstrap", () => {
    it("does nothing when DATABASE_URL is missing", async () => {
      delete process.env["DATABASE_URL"];
      process.env["ADMIN_EMAIL"] = "owner@example.com";
      process.env["ADMIN_PASSWORD"] = "SecretPassword123!";

      const countMock = vi.fn();
      (globalThis as any).__prisma = { user: { count: countMock } };

      await bootstrapOwnerAccount();
      expect(countMock).not.toHaveBeenCalled();
    });

    it("does nothing when ADMIN_EMAIL or ADMIN_PASSWORD is missing", async () => {
      process.env["DATABASE_URL"] = "mysql://mock";
      delete process.env["ADMIN_EMAIL"];
      process.env["ADMIN_PASSWORD"] = "SecretPassword123!";

      const countMock = vi.fn();
      (globalThis as any).__prisma = { user: { count: countMock } };

      await bootstrapOwnerAccount();
      expect(countMock).not.toHaveBeenCalled();

      // Test with missing ADMIN_PASSWORD
      _resetBootstrapForTesting();
      process.env["ADMIN_EMAIL"] = "owner@example.com";
      delete process.env["ADMIN_PASSWORD"];

      await bootstrapOwnerAccount();
      expect(countMock).not.toHaveBeenCalled();
    });

    it("does not overwrite or create an account when users table is not empty", async () => {
      process.env["DATABASE_URL"] = "mysql://mock";
      process.env["ADMIN_EMAIL"] = "owner@example.com";
      process.env["ADMIN_PASSWORD"] = "SecretPassword123!";

      const countMock = vi.fn().mockResolvedValue(1);
      const createMock = vi.fn();

      (globalThis as any).__prisma = {
        user: {
          count: countMock,
          create: createMock,
        },
      };

      await bootstrapOwnerAccount();

      expect(countMock).toHaveBeenCalledTimes(1);
      expect(createMock).not.toHaveBeenCalled();
    });

    it("creates owner account when users table is empty", async () => {
      process.env["DATABASE_URL"] = "mysql://mock";
      process.env["ADMIN_EMAIL"] = "  Owner@Example.COM  ";
      process.env["ADMIN_PASSWORD"] = "SecretPassword123!";

      let createdUserData: any = null;
      const countMock = vi.fn().mockResolvedValue(0);
      const createMock = vi.fn().mockImplementation(async ({ data }) => {
        createdUserData = data;
        return { id: "mock-owner-id", ...data };
      });

      (globalThis as any).__prisma = {
        user: {
          count: countMock,
          create: createMock,
        },
      };

      await bootstrapOwnerAccount();

      expect(countMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createdUserData).toBeDefined();
      expect(createdUserData.email).toBe("owner@example.com");
      expect(await verifyPassword("SecretPassword123!", createdUserData.passwordHash)).toBe(true);
    });

    it("account continues working after ADMIN_PASSWORD is removed from environment variables", async () => {
      const storedPassword = "SecretPassword123!";
      const passwordHash = await hashPassword(storedPassword);

      // Simulate ADMIN_PASSWORD removed
      process.env["DATABASE_URL"] = "mysql://mock";
      process.env["ADMIN_EMAIL"] = "owner@example.com";
      delete process.env["ADMIN_PASSWORD"];

      const countMock = vi.fn().mockResolvedValue(1);
      const createMock = vi.fn();

      (globalThis as any).__prisma = {
        user: {
          count: countMock,
          create: createMock,
        },
      };

      await bootstrapOwnerAccount();

      // No bootstrap action
      expect(createMock).not.toHaveBeenCalled();

      // Verify that user can still verify password against the stored passwordHash
      expect(await verifyPassword(storedPassword, passwordHash)).toBe(true);
      expect(await verifyPassword("WrongPassword", passwordHash)).toBe(false);
    });
  });

  describe("Public Signup Disabled", () => {
    it("returns 403 Forbidden on server-side /api/auth/signup", async () => {
      const handler = (SignupRoute.options.server as any).handlers.POST;
      const res = await handler({ request: new Request("http://localhost/api/auth/signup", { method: "POST" }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "Public signup is disabled." });
    });

    it("returns 403 Forbidden in dev preview adapter for signup", () => {
      const res = previewRequest("POST", "/api/auth/signup", { email: "test@example.com", password: "password123" });
      expect(res.status).toBe(403);
      expect(res.data).toEqual({ error: "Public signup is disabled." });
    });

    it("allows login in dev preview adapter", () => {
      const res = previewRequest("POST", "/api/auth/login", { email: "owner@example.com", password: "password123" });
      expect(res.status).toBe(200);
      expect((res.data as any).user).toBeDefined();
    });
  });
});
