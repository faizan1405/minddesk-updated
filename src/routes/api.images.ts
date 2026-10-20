import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const images = await import("@/lib/server/images.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          // Fast rejection: check Content-Length header before reading or buffering payload
          const contentLength = request.headers.get("content-length");
          if (contentLength) {
            const declaredBytes = parseInt(contentLength, 10);
            if (Number.isFinite(declaredBytes) && declaredBytes > images.MAX_IMAGE_SIZE_BYTES) {
              throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
            }
          }

          const contentType = request.headers.get("content-type") || "";
          let fileName = "upload.png";
          let buffer: Buffer;

          if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");
            if (!file || !(file instanceof Blob)) {
              throw new api.ApiError(400, "No image file provided in form data.");
            }
            if (file.size > images.MAX_IMAGE_SIZE_BYTES) {
              throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
            }
            fileName = file instanceof File ? file.name : "upload.png";
            const arrayBuffer = await file.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          } else if (request.body) {
            // Stream chunks with strict byte limit to abort early without buffering huge payloads
            const reader = request.body.getReader();
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              totalBytes += value.byteLength;
              if (totalBytes > images.MAX_IMAGE_SIZE_BYTES) {
                await reader.cancel();
                throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
              }
              chunks.push(value);
            }
            buffer = Buffer.concat(chunks);
            const headerName = request.headers.get("x-filename");
            if (headerName) fileName = decodeURIComponent(headerName);
          } else {
            const arrayBuffer = await request.arrayBuffer();
            if (arrayBuffer.byteLength > images.MAX_IMAGE_SIZE_BYTES) {
              throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
            }
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
