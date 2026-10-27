import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      // Verifies the current password, stores a new scrypt hash and signs out every other session.
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { PasswordChange } = await import("@/lib/settings-shared");
        const {
          checkRateLimit,
          recordFailedAttempt,
          resetRateLimit,
          extractClientIp,
          acquireAdmission,
        } = await import("@/lib/server/rate-limiter.server");

        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = PasswordChange.parse(await api.readJson(request));

          const clientIp = extractClientIp(request);
          const ipKey = `password_change:ip:${clientIp}`;
          const userKey = `password_change:user:${user.id}`;

          const releaseAdmission = acquireAdmission([ipKey, userKey]);
          try {
            await checkRateLimit([ipKey, userKey], "password change attempts");

            if (!(await api.verifyPassword(b.current_password, user.passwordHash))) {
              await recordFailedAttempt(ipKey, 10, 15 * 60 * 1000, 15 * 60 * 1000);
              await recordFailedAttempt(userKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
              throw new api.ApiError(400, "Current password is incorrect");
            }

            await resetRateLimit([userKey]);

            const prisma = api.db();
            const keep = await api.currentSessionId(request);
            await prisma.$transaction([
              prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: await api.hashPassword(b.new_password) },
              }),
              prisma.session.deleteMany({
                where: { userId: user.id, ...(keep ? { NOT: { id: keep } } : {}) },
              }),
            ]);
            return api.json({ ok: true });
          } finally {
            releaseAdmission();
          }
        });
      },
    },
  },
});
