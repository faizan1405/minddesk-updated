import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      // Verifies the current password, stores a new scrypt hash and signs out every other session.
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { PasswordChange } = await import("@/lib/settings-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = PasswordChange.parse(await api.readJson(request));
          if (!(await api.verifyPassword(b.current_password, user.passwordHash)))
            throw new api.ApiError(400, "Current password is incorrect");
          const prisma = api.db();
          const keep = await api.currentSessionId(request);
          await prisma.$transaction([
            prisma.user.update({ where: { id: user.id }, data: { passwordHash: await api.hashPassword(b.new_password) } }),
            prisma.session.deleteMany({ where: { userId: user.id, ...(keep ? { NOT: { id: keep } } : {}) } }),
          ]);
          return api.json({ ok: true });
        });
      },
    },
  },
});
