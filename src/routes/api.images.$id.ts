import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/images/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const images = await import("@/lib/server/images.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const { buffer, mimeType, fileName } = await images.readImageFile(user.id, params.id);
          return new Response(new Uint8Array(buffer), {
            status: 200,
            headers: {
              "Content-Type": mimeType,
              "Content-Length": buffer.length.toString(),
              "Cache-Control": "private, max-age=86400",
              "X-Content-Type-Options": "nosniff",
              "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
            },
          });
        });
      },
    },
  },
});
