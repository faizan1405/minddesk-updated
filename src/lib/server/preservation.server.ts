import { ApiError } from "@/lib/server/api.server";

export type PreservationBlockedOperation =
  "workspace_deletion" | "empty_trash" | "auto_cleanup" | "single_permanent_delete";

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
 * Strict Preservation Mode optionally locks down deliberate single-item permanent deletion
 * in the Recycle Bin. Disabled by default so users can still manually discard single trashed items,
 * but can be enabled via DATA_PRESERVATION_STRICT="true" | "1" | "enabled".
 */
export function isStrictPreservationMode(): boolean {
  const envVal = process.env["DATA_PRESERVATION_STRICT"]?.trim().toLowerCase();
  return envVal === "true" || envVal === "1" || envVal === "enabled";
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
          "Strict Data Preservation Mode is active: Permanent single-item deletion is disabled. Items remain safely preserved in the Recycle Bin.",
          undefined,
          { code: "DATA_PRESERVATION_ACTIVE", operation },
        );
      }
      return;
  }
}
