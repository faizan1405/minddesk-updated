// Client API helper for My Private Vault.
// Interacts with /api/vault/* endpoints and handles Preview Mode compatibility.
import { api, isPreviewMode } from "@/lib/api-client";
import { uint8ToBase64, base64ToUint8 } from "@/lib/vault-crypto";

export interface VaultMetaResponse {
  initialized: boolean;
  salt: string | null;
  wrapped_key: string | null;
  wrapped_key_iv: string | null;
  iterations: number;
  memory_cost: number;
  parallelism: number;
  version: number;
  created_at?: string;
  updated_at?: string;
}

export interface EncryptedEntryDto {
  id: string;
  encrypted_data: string;
  iv: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EncryptedAttachmentDto {
  id: string;
  encrypted_size: number;
  iv: string;
  created_at: string;
}

export interface EncryptedDocumentDto {
  id: string;
  encrypted_data: string;
  iv: string;
  version: number;
  created_at: string;
  updated_at: string;
  attachments: EncryptedAttachmentDto[];
}

export async function fetchVaultMeta(): Promise<VaultMetaResponse> {
  return api<VaultMetaResponse>("/api/vault/meta");
}

export async function initializeVaultApi(data: {
  salt: string;
  wrapped_key: string;
  wrapped_key_iv: string;
  iterations?: number;
  memory_cost?: number;
  parallelism?: number;
}): Promise<VaultMetaResponse> {
  return api<VaultMetaResponse>("/api/vault/meta", {
    method: "POST",
    body: data,
  });
}

export async function changeVaultPasswordApi(data: {
  salt: string;
  wrapped_key: string;
  wrapped_key_iv: string;
  expected_version: number;
}): Promise<{ success: boolean; version: number }> {
  return api<{ success: boolean; version: number }>("/api/vault/password", {
    method: "POST",
    body: data,
  });
}

export async function fetchVaultEntries(): Promise<EncryptedEntryDto[]> {
  return api<EncryptedEntryDto[]>("/api/vault/entries");
}

export async function createVaultEntryApi(data: {
  id?: string;
  encrypted_data: string;
  iv: string;
}): Promise<EncryptedEntryDto> {
  return api<EncryptedEntryDto>("/api/vault/entries", {
    method: "POST",
    body: data,
  });
}

export async function updateVaultEntryApi(
  id: string,
  data: { encrypted_data: string; iv: string; expected_version: number },
): Promise<EncryptedEntryDto> {
  return api<EncryptedEntryDto>(`/api/vault/entries/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteVaultEntryApi(id: string): Promise<{ success: boolean; id: string }> {
  return api<{ success: boolean; id: string }>(`/api/vault/entries/${id}`, {
    method: "DELETE",
  });
}

export async function fetchVaultDocuments(): Promise<EncryptedDocumentDto[]> {
  return api<EncryptedDocumentDto[]>("/api/vault/documents");
}

export async function getVaultDocumentApi(id: string): Promise<EncryptedDocumentDto> {
  return api<EncryptedDocumentDto>(`/api/vault/documents/${id}`);
}

export async function createVaultDocumentApi(data: {
  id?: string;
  encrypted_data: string;
  iv: string;
}): Promise<EncryptedDocumentDto> {
  return api<EncryptedDocumentDto>("/api/vault/documents", {
    method: "POST",
    body: data,
  });
}

export async function updateVaultDocumentApi(
  id: string,
  data: {
    encrypted_data: string;
    iv: string;
    expected_version: number;
    retained_attachment_ids?: string[];
    obsolete_attachment_ids?: string[];
  },
): Promise<EncryptedDocumentDto> {
  return api<EncryptedDocumentDto>(`/api/vault/documents/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteVaultDocumentApi(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return api<{ success: boolean; id: string }>(`/api/vault/documents/${id}`, {
    method: "DELETE",
  });
}

export async function deleteVaultAttachmentApi(
  attachmentId: string,
): Promise<{ success: boolean; id: string }> {
  return api<{ success: boolean; id: string }>(`/api/vault/documents/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

export async function uploadVaultAttachmentApi(
  documentId: string,
  attachmentId: string,
  iv: string,
  encryptedBuffer: ArrayBuffer,
): Promise<{ id: string; encrypted_size: number; iv: string }> {
  const isPreview = await isPreviewMode();

  if (isPreview) {
    const base64Data = uint8ToBase64(new Uint8Array(encryptedBuffer));
    return api<{ id: string; encrypted_size: number; iv: string }>("/api/vault/documents/upload", {
      method: "POST",
      body: {
        document_id: documentId,
        attachment_id: attachmentId,
        iv,
        base64: base64Data,
      },
    });
  }

  const formData = new FormData();
  formData.append("document_id", documentId);
  formData.append("attachment_id", attachmentId);
  formData.append("iv", iv);
  formData.append(
    "file",
    new Blob([encryptedBuffer], { type: "application/octet-stream" }),
    `${attachmentId}.enc`,
  );

  const res = await fetch("/api/vault/documents/upload", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errorJson = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorJson?.error ?? `Upload failed (${res.status})`);
  }

  return (await res.json()) as { id: string; encrypted_size: number; iv: string };
}

export async function downloadVaultAttachmentApi(
  attachmentId: string,
): Promise<{ buffer: ArrayBuffer; iv: string }> {
  const isPreview = await isPreviewMode();

  if (isPreview) {
    const res = await api<{ base64: string; iv: string }>(
      `/api/vault/documents/files/${attachmentId}`,
    );
    return {
      buffer: base64ToUint8(res.base64).buffer as ArrayBuffer,
      iv: res.iv,
    };
  }

  const res = await fetch(`/api/vault/documents/files/${attachmentId}`, {
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errorJson = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorJson?.error ?? `Failed to download file (${res.status})`);
  }

  const iv = res.headers.get("X-Attachment-IV") || "";
  const buffer = await res.arrayBuffer();

  return { buffer, iv };
}
