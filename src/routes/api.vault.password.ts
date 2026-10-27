import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RewrapInput = z.object({
  salt: z.string().min(16).max(64),
  wrapped_key: z.string().min(16),
  wrapped_key_iv: z.string().min(12).max(64),
  expected_version: z.number().int().min(1),
  account_password: z.string().min(1, "Account password is required").max(200),
});

export const Route = createFileRoute("/api/vault/password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const {
          checkRateLimit,
          recordFailedAttempt,
          resetRateLimit,
          extractClientIp,
          acquireAdmission,
        } = await import("@/lib/server/rate-limiter.server");

        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = RewrapInput.parse(await api.readJson(request));

          const clientIp = extractClientIp(request);
          const ipKey = `vault_pw:ip:${clientIp}`;
          const userKey = `vault_pw:user:${user.id}`;

          // Pre-verification admission: limit concurrent in-flight scrypt operations
          const releaseAdmission = acquireAdmission([ipKey, userKey]);
          try {
            // Rate-limit re-authentication attempts before verifying password
            await checkRateLimit([ipKey, userKey], "re-authentication attempts");

            // Verify current MindDesk account password
            const isValidAccountPassword = await api.verifyPassword(
              body.account_password,
              user.passwordHash,
            );

            if (!isValidAccountPassword) {
              await recordFailedAttempt(ipKey, 10, 15 * 60 * 1000, 15 * 60 * 1000);
              await recordFailedAttempt(userKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
              throw new api.ApiError(401, "Incorrect account password.");
            }

            // Reset rate limits on successful account authentication for user only (preserves IP throttling)
            await resetRateLimit([userKey]);

            // P1: Atomic version-checked optimistic concurrency update
            const result = await api.db().vaultMeta.updateMany({
              where: {
                userId: user.id,
                version: body.expected_version,
              },
              data: {
                salt: body.salt,
                wrappedKey: body.wrapped_key,
                wrappedKeyIv: body.wrapped_key_iv,
                version: { increment: 1 },
              },
            });

            if (result.count === 0) {
              const existing = await api.db().vaultMeta.findUnique({
                where: { userId: user.id },
              });
              if (!existing) {
                throw new api.ApiError(404, "Vault not found. Please initialize first.");
              }
              throw new api.ApiError(
                409,
                "Conflict: Master password was changed from another session. Please reload.",
              );
            }

            const updated = await api.db().vaultMeta.findUniqueOrThrow({
              where: { userId: user.id },
            });

            return api.json({
              success: true,
              version: updated.version,
              updated_at: updated.updatedAt.toISOString(),
            });
          } finally {
            releaseAdmission();
          }
        });
      },
    },
  },
});
