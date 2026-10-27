import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/data/delete")({
  server: {
    handlers: {
      // Deletes all workspace content of the signed-in user (notes, tasks, projects, plans, mind maps, habits, and uploaded images).
      // Account, sessions, preferences, and My Private Vault (passwords & documents) remain safe and preserved.
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const {
          checkRateLimit,
          recordFailedAttempt,
          resetRateLimit,
          extractClientIp,
          acquireAdmission,
        } = await import("@/lib/server/rate-limiter.server");
        const { z } = await import("zod");

        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = z
            .object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") })
            .parse(await api.readJson(request));

          const clientIp = extractClientIp(request);
          const ipKey = `delete_auth:ip:${clientIp}`;
          const userKey = `delete_auth:user:${user.id}`;

          const releaseAdmission = acquireAdmission([ipKey, userKey]);
          try {
            await checkRateLimit([ipKey, userKey], "re-authentication attempts");

            if (!(await api.verifyPassword(b.password, user.passwordHash))) {
              await recordFailedAttempt(ipKey, 10, 15 * 60 * 1000, 15 * 60 * 1000);
              await recordFailedAttempt(userKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
              throw new api.ApiError(400, "Password is incorrect");
            }

            await resetRateLimit([userKey]);
            await api.deleteUserData(user.id);
            return api.json({ ok: true });
          } finally {
            releaseAdmission();
          }
        });
      },
    },
  },
});
