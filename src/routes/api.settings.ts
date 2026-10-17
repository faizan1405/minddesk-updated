import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { parseSettings } = await import("@/lib/settings-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const row = await api.db().userSettings.findUnique({ where: { userId: user.id } });
          return api.json(parseSettings(row?.data ?? {}));
        });
      },
      // Partial update: only the given keys change; values are validated strictly.
      PUT: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { SettingsPatch, parseSettings } = await import("@/lib/settings-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const patch = SettingsPatch.parse(await api.readJson(request));
          const prisma = api.db();
          const next = await prisma.$transaction(async (tx) => {
            const row = await tx.userSettings.findUnique({ where: { userId: user.id } });
            const merged = { ...parseSettings(row?.data ?? {}), ...patch };
            const data = JSON.stringify(merged);
            await tx.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, data }, update: { data } });
            return merged;
          });
          return api.json(next);
        });
      },
    },
  },
});
