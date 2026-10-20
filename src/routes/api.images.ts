import { createFileRoute } from "@tanstack/react-router";

function parseMultipartBuffer(
  bodyBuffer: Buffer,
  contentType: string,
): { fileName: string; data: Buffer } | null {
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1]!.trim().replace(/^["']|["']$/g, "");
  const boundaryDelimiter = Buffer.from(`--${boundary}`);
  const headerEndDelimiter = Buffer.from("\r\n\r\n");

  const startIdx = bodyBuffer.indexOf(boundaryDelimiter);
  if (startIdx === -1) return null;

  const headerStart = startIdx + boundaryDelimiter.length + 2;
  const headerEnd = bodyBuffer.indexOf(headerEndDelimiter, headerStart);
  if (headerEnd === -1) return null;

  const headerText = bodyBuffer.subarray(headerStart, headerEnd).toString("utf8");
  const filenameMatch = headerText.match(/filename="([^"]+)"/);

  const contentStart = headerEnd + headerEndDelimiter.length;
  const nextBoundary = bodyBuffer.indexOf(boundaryDelimiter, contentStart);
  if (nextBoundary === -1) return null;

  let contentEnd = nextBoundary;
  if (bodyBuffer[contentEnd - 2] === 0x0d && bodyBuffer[contentEnd - 1] === 0x0a) {
    contentEnd -= 2;
  }

  return {
    fileName: filenameMatch && filenameMatch[1] ? filenameMatch[1] : "upload.png",
    data: bodyBuffer.subarray(contentStart, contentEnd),
  };
}

export const Route = createFileRoute("/api/images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const images = await import("@/lib/server/images.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          const contentType = request.headers.get("content-type") || "";
          const isMultipart = contentType.includes("multipart/form-data");
          const maxEnvelopeBytes = isMultipart
            ? images.MAX_IMAGE_SIZE_BYTES + images.MAX_MULTIPART_OVERHEAD_BYTES
            : images.MAX_IMAGE_SIZE_BYTES;

          // 1. Fast rejection: check Content-Length header before reading payload
          const contentLength = request.headers.get("content-length");
          if (contentLength) {
            const declaredBytes = parseInt(contentLength, 10);
            if (Number.isFinite(declaredBytes) && declaredBytes > maxEnvelopeBytes) {
              throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
            }
          }

          // 2. Read request body into a bounded buffer before multipart parsing
          // This safely limits unbuffered memory usage even when Content-Length is absent.
          let bodyBuffer: Buffer;
          if (request.body) {
            const reader = request.body.getReader();
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              totalBytes += value.byteLength;
              if (totalBytes > maxEnvelopeBytes) {
                await reader.cancel();
                throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
              }
              chunks.push(value);
            }
            bodyBuffer = Buffer.concat(chunks);
          } else {
            const arrayBuffer = await request.arrayBuffer();
            if (arrayBuffer.byteLength > maxEnvelopeBytes) {
              throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
            }
            bodyBuffer = Buffer.from(arrayBuffer);
          }

          if (bodyBuffer.length === 0) {
            throw new api.ApiError(400, "Uploaded file is empty.");
          }

          let fileName = "upload.png";
          let imageBuffer: Buffer;

          if (isMultipart) {
            const parsed = parseMultipartBuffer(bodyBuffer, contentType);
            if (parsed) {
              if (parsed.data.length > images.MAX_IMAGE_SIZE_BYTES) {
                throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
              }
              fileName = parsed.fileName;
              imageBuffer = parsed.data;
            } else {
              // Fallback to Request.formData() if boundary format differs
              const boundedRequest = new Request("http://localhost/api/images", {
                method: "POST",
                headers: { "content-type": contentType },
                body: new Uint8Array(bodyBuffer),
              });
              const formData = await boundedRequest.formData();
              const file = formData.get("file");
              if (!file || !(file instanceof Blob)) {
                throw new api.ApiError(400, "No image file provided in form data.");
              }
              if (file.size > images.MAX_IMAGE_SIZE_BYTES) {
                throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
              }
              fileName = file instanceof File ? file.name : "upload.png";
              const arrayBuffer = await file.arrayBuffer();
              imageBuffer = Buffer.from(arrayBuffer);
            }
          } else {
            if (bodyBuffer.length > images.MAX_IMAGE_SIZE_BYTES) {
              throw new api.ApiError(413, "Image exceeds maximum allowed size (10 MB).");
            }
            imageBuffer = bodyBuffer;
            const headerName = request.headers.get("x-filename");
            if (headerName) fileName = decodeURIComponent(headerName);
          }

          if (imageBuffer.length === 0) {
            throw new api.ApiError(400, "Uploaded file is empty.");
          }

          const res = await images.saveImageFile(user.id, fileName, imageBuffer);
          return api.json(res, { status: 201 });
        });
      },
    },
  },
});
