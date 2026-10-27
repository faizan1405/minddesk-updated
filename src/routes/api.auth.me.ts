import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { isDataPreservationMode } = await import("@/lib/server/preservation.server");
        return api.handle(async () => {
          const user = await api.getUser(request);
          return api.json({
            user: user ? api.userDto(user) : null,
            preservation_mode: isDataPreservationMode(),
          });
        });
      },
    },
  },
});
