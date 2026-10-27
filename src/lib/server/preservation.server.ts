import { ApiError } from "@/lib/server/api.server";

export type PreservationBlockedOperation =
  | "workspace_deletion"
  | "empty_trash"
  | "auto_cleanup"
  | "single_permanent_delete"
  | "vault_entry_deletion"
  | "vault_document_deletion"
  | "plan_activity_deletion"
  | "plan_category_deletion";

/**
 * Checks whether Data Preservation Mode is active.
 *
 * SAFETY INVARIANT: Defaults to TRUE (protected) unless explicitly disabled
 * via DATA_PRESERVATION_MODE="false" | "disabled" | "off".
 *
 * When active:
 * - Automated permanent purging of expired Recycle Bin records is suppressed.
 * - Emptying the Recycle Bin is blocked.
 * - Deleting all workspace data is blocked.
 * - Single-item permanent Recycle Bin deletion is blocked by default.
 * - Deleting Vault password entries and documents is blocked.
 * - Deleting Plan Your Day activities and categories is blocked.
 * - Obsolete Vault document attachment files are preserved on disk without unlinking.
 * - Ordinary note/task editing, soft-deletion, and Recycle Bin restore remain 100% operational.
 */
export function isDataPreservationMode(): boolean {
  const envVal = process.env["DATA_PRESERVATION_MODE"]?.trim().toLowerCase();
  if (envVal === "false" || envVal === "disabled" || envVal === "off") {
    return false;
  }
  return true;
}

/**
 * Strict Preservation Mode locks down deliberate single-item permanent deletion
 * in the Recycle Bin.
 *
 * SAFETY INVARIANT: Whenever Data Preservation Mode is active, strict preservation
 * is TRUE BY DEFAULT. A missing or unset DATA_PRESERVATION_STRICT setting will NOT
 * permit irreversible single-item Recycle Bin deletion.
 *
 * It is only deactivated if explicitly set to "false" | "disabled" | "off", or if
 * overall Data Preservation Mode is disabled.
 */
export function isStrictPreservationMode(): boolean {
  if (!isDataPreservationMode()) {
    return false;
  }
  const envVal = process.env["DATA_PRESERVATION_STRICT"]?.trim().toLowerCase();
  if (envVal === "false" || envVal === "disabled" || envVal === "off") {
    return false;
  }
  return true;
}

/**
 * Asserts that a deletion operation is permitted under the current preservation policy.
 * Throws ApiError(423 Locked) if the operation is blocked.
 */
export function assertBulkDeletionAllowed(operation: PreservationBlockedOperation): void {
  if (!isDataPreservationMode()) {
    return;
  }

  switch (operation) {
    case "workspace_deletion":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Workspace-wide deletion is disabled to prevent data loss. Existing production records remain protected.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );

    case "empty_trash":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Emptying the Recycle Bin is disabled. Items remain safely preserved in the Recycle Bin.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );

    case "auto_cleanup":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Automated retention purging is disabled. Expired Recycle Bin records are preserved.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );

    case "single_permanent_delete":
      if (isStrictPreservationMode()) {
        throw new ApiError(
          423,
          "Data Preservation Mode is active: Permanent single-item deletion is disabled. Items remain safely preserved in the Recycle Bin.",
          undefined,
          { code: "DATA_PRESERVATION_ACTIVE", operation },
        );
      }
      return;

    case "vault_entry_deletion":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Deleting Vault password entries is disabled. Your encrypted credentials remain protected.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );

    case "vault_document_deletion":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Deleting Vault documents and attachments is disabled. Your encrypted files remain protected.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );

    case "plan_activity_deletion":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Deleting planned activities is disabled to prevent schedule loss. Activities remain protected.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );

    case "plan_category_deletion":
      throw new ApiError(
        423,
        "Data Preservation Mode is active: Deleting activity categories is disabled. Categories remain protected.",
        undefined,
        { code: "DATA_PRESERVATION_ACTIVE", operation },
      );
  }
}
