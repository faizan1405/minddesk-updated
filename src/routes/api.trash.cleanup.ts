import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/trash/cleanup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return handleCleanup(request);
      },
      POST: async ({ request }) => {
        return handleCleanup(request);
      },
    },
  },
});

async function handleCleanup(request: Request) {
  const api = await import("@/lib/server/api.server");
  const { cleanupExpiredTrash, getExpirationCutoff } = await import("@/lib/server/trash.server");

  return api.handle(async () => {
    // Authenticate: either valid CRON_SECRET or authenticated user
    const url = new URL(request.url);
    const authHeader = request.headers.get("authorization") || "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
    const headerSecret = request.headers.get("x-cron-secret")?.trim();
    const querySecret = url.searchParams.get("secret")?.trim();
    const providedSecret = bearerToken || headerSecret || querySecret;

    const configuredSecret = process.env["CRON_SECRET"]?.trim();

    let authorized = false;
    if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
      authorized = true;
    } else {
      // Allow authenticated user (e.g. testing or trigger from settings/console)
      const user = await api.getUser(request);
      if (user) {
        authorized = true;
      }
    }

    if (!authorized) {
      throw new api.ApiError(401, "Unauthorized: Valid CRON_SECRET or active session required");
    }

    // Optional simulated_days for testing expiration
    let simulatedCutoff: Date | undefined;
    const simDaysParam = url.searchParams.get("simulated_days");
    if (simDaysParam) {
      const days = parseInt(simDaysParam, 10);
      if (!isNaN(days) && days >= 0) {
        simulatedCutoff = getExpirationCutoff(days);
      }
    }

    const result = await cleanupExpiredTrash(simulatedCutoff ? { simulatedCutoff } : undefined);
    return api.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  });
}
