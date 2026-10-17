import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/profile")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { z } = await import("zod");
        const { DisplayName } = await import("@/lib/settings-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = z.object({ display_name: DisplayName }).strict().parse(await api.readJson(request));
          const u = await api.db().user.update({ where: { id: user.id }, data: { displayName: b.display_name } });
          return api.json({ user: api.userDto(u) });
        });
      },
    },
  },
});
