import { createFileRoute } from "@tanstack/react-router";

// Reports whether a database is configured. Exposes no data; used by the dev-only Preview Mode check.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, database: !!process.env["DATABASE_URL"] }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
    },
  },
});
