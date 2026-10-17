import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const cookie = await api.destroySession(request);
          return api.json({ ok: true }, { headers: { "set-cookie": cookie } });
        });
      },
    },
  },
});
