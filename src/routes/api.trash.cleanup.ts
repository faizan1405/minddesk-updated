import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/trash/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return handleCleanup(request);
      },
    },
  },
});

async function handleCleanup(request: Request) {
  const api = await import("@/lib/server/api.server");
  const { cleanupExpiredTrash } = await import("@/lib/server/trash.server");

  return api.handle(async () => {
    // Authenticate: ONLY valid CRON_SECRET allowed via Authorization Bearer or x-cron-secret header
    const authHeader = request.headers.get("authorization") || "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const headerSecret = request.headers.get("x-cron-secret")?.trim();
    const providedSecret = bearerToken || headerSecret;

    const configuredSecret = process.env["CRON_SECRET"]?.trim();

    if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
      throw new api.ApiError(401, "Unauthorized: Valid CRON_SECRET required");
    }

    // Run permanent cleanup with strict 30-day retention
    // Production simulated_days overrides and session-based authorization are strictly removed
    const result = await cleanupExpiredTrash();
    return api.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  });
}
