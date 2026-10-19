import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const images = await import("@/lib/server/images.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const contentType = request.headers.get("content-type") || "";
          let fileName = "upload.png";
          let buffer: Buffer;

          if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");
            if (!file || !(file instanceof Blob)) {
              throw new api.ApiError(400, "No image file provided in form data.");
            }
            fileName = file instanceof File ? file.name : "upload.png";
            const arrayBuffer = await file.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          } else {
            const arrayBuffer = await request.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            const headerName = request.headers.get("x-filename");
            if (headerName) fileName = decodeURIComponent(headerName);
          }

          if (buffer.length === 0) {
            throw new api.ApiError(400, "Uploaded file is empty.");
          }

          const res = await images.saveImageFile(user.id, fileName, buffer);
          return api.json(res, { status: 201 });
        });
      },
    },
  },
});
