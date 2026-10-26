import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vault/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          // P1: Upfront Content-Length check before buffering body
          const MAX_UPLOAD_REQUEST_BYTES = vaultStorage.MAX_VAULT_ATTACHMENT_BYTES + 64 * 1024; // 25 MB + 64 KB multipart overhead
          const contentLengthHeader = request.headers.get("content-length");
          if (contentLengthHeader) {
            const contentLength = parseInt(contentLengthHeader, 10);
            if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
              throw new api.ApiError(413, "Payload Too Large: Upload request exceeds 25 MB limit.");
            }
          }

          // P1: Bounded streaming guard against unbounded chunked bodies
          let reqToParse: Request = request;
          if (request.body && typeof request.body.pipeThrough === "function") {
            let bytesRead = 0;
            const boundedStream = new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                bytesRead += chunk.byteLength;
                if (bytesRead > MAX_UPLOAD_REQUEST_BYTES) {
                  controller.error(
                    new api.ApiError(413, "Payload Too Large: Upload stream exceeds 25 MB limit."),
                  );
                  return;
                }
                controller.enqueue(chunk);
              },
            });

            reqToParse = new Request(request.url, {
              method: request.method,
              headers: request.headers,
              body: request.body.pipeThrough(boundedStream),
              // @ts-expect-error duplex is required in node environment when body is stream
              duplex: "half",
            });
          }

          const formData = await reqToParse.formData().catch((err: unknown) => {
            if (err instanceof api.ApiError) throw err;
            const status = (err as { status?: number; statusCode?: number })?.status;
            const statusCode = (err as { status?: number; statusCode?: number })?.statusCode;
            if (status === 413 || statusCode === 413) {
              throw new api.ApiError(413, "Payload Too Large: Upload exceeds 25 MB limit.");
            }
            throw new api.ApiError(400, "Invalid form data in upload request.");
          });

          const documentId = formData.get("document_id") as string | null;
          const attachmentId = formData.get("attachment_id") as string | null;
          const iv = formData.get("iv") as string | null;
          const fileEntry = formData.get("file");

          if (!documentId || !attachmentId || !iv || !fileEntry || typeof fileEntry === "string") {
            throw new api.ApiError(
              400,
              "Missing required upload parameters (document_id, attachment_id, iv, file).",
            );
          }

          // P0: Strict UUID validation on both documentId and attachmentId
          if (!vaultStorage.isValidUuid(documentId)) {
            throw new api.ApiError(400, "Invalid document_id: must be a valid UUID.");
          }
          if (!vaultStorage.isValidUuid(attachmentId)) {
            throw new api.ApiError(400, "Invalid attachment_id: must be a valid UUID.");
          }
          if (typeof iv !== "string" || iv.length < 12 || iv.length > 64) {
            throw new api.ApiError(400, "Invalid IV: must be between 12 and 64 characters.");
          }

          // Verify document ownership
          const doc = await api.db().vaultDocument.findFirst({
            where: { id: documentId, userId: user.id },
          });

          if (!doc) {
            throw new api.ApiError(404, "Target document not found or access denied.");
          }

          const arrayBuffer = await fileEntry.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (buffer.length === 0) {
            throw new api.ApiError(400, "Uploaded encrypted file is empty.");
          }

          if (buffer.length > vaultStorage.MAX_VAULT_ATTACHMENT_BYTES) {
            throw new api.ApiError(
              413,
              "Payload Too Large: Encrypted attachment exceeds 25 MB limit.",
            );
          }

          const saved = await vaultStorage.saveEncryptedAttachmentFile(
            user.id,
            documentId,
            attachmentId,
            buffer,
            iv,
          );

          return api.json(
            {
              id: saved.id,
              document_id: documentId,
              encrypted_size: saved.encryptedSize,
              iv: saved.iv,
            },
            { status: 201 },
          );
        });
      },
    },
  },
});
