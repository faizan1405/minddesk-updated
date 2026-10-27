import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const UpdateInput = z.object({
  encrypted_data: z.string().min(1),
  iv: z.string().min(12).max(64),
  expected_version: z.number().int().min(1),
  retained_attachment_ids: z.array(z.string()).optional(),
  obsolete_attachment_ids: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/vault/documents/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const doc = await api.db().vaultDocument.findFirst({
            where: { id: params.id, userId: user.id },
            include: {
              attachments: {
                select: {
                  id: true,
                  encryptedSize: true,
                  iv: true,
                  createdAt: true,
                },
              },
            },
          });

          if (!doc) {
            throw new api.ApiError(404, "Document not found");
          }

          return api.json({
            id: doc.id,
            encrypted_data: doc.encryptedData,
            iv: doc.iv,
            version: doc.version,
            created_at: doc.createdAt.toISOString(),
            updated_at: doc.updatedAt.toISOString(),
            attachments: doc.attachments.map((a) => ({
              id: a.id,
              encrypted_size: a.encryptedSize,
              iv: a.iv,
              created_at: a.createdAt.toISOString(),
            })),
          });
        });
      },

      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = UpdateInput.parse(await api.readJson(request));

          // Reject explicit obsolete-attachment removal requests before updating encrypted metadata
          if (body.obsolete_attachment_ids && body.obsolete_attachment_ids.length > 0) {
            const { isDataPreservationMode } = await import("@/lib/server/preservation.server");
            if (isDataPreservationMode()) {
              throw new api.ApiError(
                423,
                "Data Preservation Mode is active: Removing existing attachments from documents is disabled. Your files remain protected.",
                undefined,
                { code: "DATA_PRESERVATION_ACTIVE", operation: "vault_attachment_deletion" },
              );
            }
          }

          // 1. Atomic compare-and-swap update of encrypted document metadata
          // Guarantees obsolete attachments are NEVER deleted if the metadata commit fails
          const result = await api.db().vaultDocument.updateMany({
            where: {
              id: params.id,
              userId: user.id,
              version: body.expected_version,
            },
            data: {
              encryptedData: body.encrypted_data,
              iv: body.iv,
              version: { increment: 1 },
            },
          });

          if (result.count === 0) {
            const existing = await api.db().vaultDocument.findFirst({
              where: { id: params.id, userId: user.id },
            });
            if (!existing) {
              throw new api.ApiError(404, "Document not found");
            }
            throw new api.ApiError(
              409,
              "Conflict: Document was modified by another session. Please reload.",
            );
          }

          // 2. Safe Post-Commit Obsolete Attachment Retirement
          // Executed strictly AFTER the new document version is committed to database
          if (body.obsolete_attachment_ids && body.obsolete_attachment_ids.length > 0) {
            const { isDataPreservationMode } = await import("@/lib/server/preservation.server");
            if (isDataPreservationMode()) {
              console.log(
                `[vault] Data Preservation Mode active: Preserving ${body.obsolete_attachment_ids.length} obsolete attachment(s) without unlinking files.`,
              );
            } else {
              const retainedSet = new Set(body.retained_attachment_ids || []);
              for (const obsoleteId of body.obsolete_attachment_ids) {
                if (retainedSet.has(obsoleteId)) continue;
                try {
                  const att = await api.db().vaultDocumentAttachment.findFirst({
                    where: { id: obsoleteId, documentId: params.id, userId: user.id },
                  });
                  if (att) {
                    await vaultStorage.deleteEncryptedAttachmentFile(user.id, obsoleteId);
                  }
                } catch (cleanupErr) {
                  console.warn(
                    `[vault] Non-fatal cleanup warning for obsolete attachment ${obsoleteId}:`,
                    cleanupErr,
                  );
                }
              }
            }
          }

          const updated = await api.db().vaultDocument.findUniqueOrThrow({
            where: { id: params.id },
            include: {
              attachments: {
                select: {
                  id: true,
                  encryptedSize: true,
                  iv: true,
                  createdAt: true,
                },
              },
            },
          });

          return api.json({
            id: updated.id,
            encrypted_data: updated.encryptedData,
            iv: updated.iv,
            version: updated.version,
            created_at: updated.createdAt.toISOString(),
            updated_at: updated.updatedAt.toISOString(),
            attachments: updated.attachments.map((a) => ({
              id: a.id,
              encrypted_size: a.encryptedSize,
              iv: a.iv,
              created_at: a.createdAt.toISOString(),
            })),
          });
        });
      },

      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        const { assertBulkDeletionAllowed } = await import("@/lib/server/preservation.server");
        return api.handle(async () => {
          assertBulkDeletionAllowed("vault_document_deletion");
          const user = await api.requireUser(request);

          const existing = await api.db().vaultDocument.findFirst({
            where: { id: params.id, userId: user.id },
            include: { attachments: true },
          });

          if (!existing) {
            throw new api.ApiError(404, "Document not found");
          }

          // Delete attachment files from disk
          for (const att of existing.attachments) {
            try {
              await vaultStorage.deleteEncryptedAttachmentFile(user.id, att.id);
            } catch {
              // Best-effort disk cleanup
            }
          }

          await api.db().vaultDocument.delete({
            where: { id: params.id },
          });

          return api.json({ success: true, id: params.id });
        });
      },
    },
  },
});
