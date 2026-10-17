import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/data/delete")({
  server: {
    handlers: {
      // Deletes all workspace content of the signed-in user (account, sign-in and preferences stay).
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { z } = await import("zod");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") }).parse(await api.readJson(request));
          if (!(await api.verifyPassword(b.password, user.passwordHash))) throw new api.ApiError(400, "Password is incorrect");
          await api.deleteUserData(user.id);
          return api.json({ ok: true });
        });
      },
    },
  },
});
