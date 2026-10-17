import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: async () => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          throw new api.ApiError(403, "Public signup is disabled.");
        });
      },
    },
  },
});

