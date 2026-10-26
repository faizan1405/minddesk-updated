import { describe, it, expect } from "vitest";
import {
  createVaultKeys,
  unlockVault,
  rewrapVaultKeys,
  getPasswordKey,
  getDocumentMetaKey,
  getAttachmentKey,
  encryptPasswordEntry,
  decryptPasswordEntry,
  encryptDocumentMeta,
  decryptDocumentMeta,
  encryptDocumentFile,
  decryptDocumentFile,
  generatePassword,
  evaluatePasswordStrength,
  uint8ToBase64,
  base64ToUint8,
  type PasswordEntryData,
  type DocumentMetadata,
} from "../lib/vault-crypto";

describe("Vault Cryptography Primitives", () => {
  const masterPassword = "TestMasterPassword!2026#Secure";
  const fastParams = { iterations: 1, memoryCost: 2048, parallelism: 1 }; // fast for test suite

  it("creates vault keys and unlocks successfully with correct master password", async () => {
    const keys = await createVaultKeys(masterPassword, fastParams);
    expect(keys.saltHex).toBeDefined();
    expect(keys.wrappedKey).toBeDefined();
    expect(keys.wrappedKeyIv).toBeDefined();
    expect(keys.rootKeyBytes.length).toBe(32);

    const unlocked = await unlockVault(
      masterPassword,
      keys.saltHex,
      keys.wrappedKey,
      keys.wrappedKeyIv,
      fastParams,
    );
    expect(unlocked).toEqual(keys.rootKeyBytes);
  });

  it("fails unlock when master password is incorrect (zero-knowledge proof)", async () => {
    const keys = await createVaultKeys(masterPassword, fastParams);
    await expect(
      unlockVault(
        "WrongMasterPassword!999",
        keys.saltHex,
        keys.wrappedKey,
        keys.wrappedKeyIv,
        fastParams,
      ),
    ).rejects.toThrow();
  });

  it("rewraps root key when master password is changed", async () => {
    const keys = await createVaultKeys(masterPassword, fastParams);
    const newMasterPassword = "NewMasterPassword!2026#Updated";

    const rewrapped = await rewrapVaultKeys(keys.rootKeyBytes, newMasterPassword, fastParams);
    expect(rewrapped.saltHex).not.toEqual(keys.saltHex);

    // Old password no longer works
    await expect(
      unlockVault(
        masterPassword,
        rewrapped.saltHex,
        rewrapped.wrappedKey,
        rewrapped.wrappedKeyIv,
        fastParams,
      ),
    ).rejects.toThrow();

    // New password unlocks the same root key
    const unlocked = await unlockVault(
      newMasterPassword,
      rewrapped.saltHex,
      rewrapped.wrappedKey,
      rewrapped.wrappedKeyIv,
      fastParams,
    );
    expect(unlocked).toEqual(keys.rootKeyBytes);
  });

  describe("Password Entry Encryption & Decryption", () => {
    const entryId = "entry-uuid-1234";
    const userId = "user-uuid-5678";
    const entryData: PasswordEntryData = {
      name: "GitHub",
      url: "https://github.com",
      username: "faizan1405",
      password: "SuperSecretPassword123!@#",
      notes:
        "Line 1: Personal GitHub account\nLine 2: Recovery keys stored offline\nLine 3: 2FA enabled",
    };

    it("encrypts and decrypts password entry preserving multiline notes", async () => {
      const keys = await createVaultKeys(masterPassword, fastParams);
      const passKey = await getPasswordKey(keys.rootKeyBytes);

      const encrypted = await encryptPasswordEntry(entryData, passKey, entryId, userId);
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();

      const decrypted = await decryptPasswordEntry(encrypted, passKey, entryId, userId);
      expect(decrypted).toEqual(entryData);
      expect(decrypted.notes).toContain("\nLine 2:");
    });

    it("rejects decryption if ciphertext is tampered with", async () => {
      const keys = await createVaultKeys(masterPassword, fastParams);
      const passKey = await getPasswordKey(keys.rootKeyBytes);

      const encrypted = await encryptPasswordEntry(entryData, passKey, entryId, userId);
      const tamperedBytes = base64ToUint8(encrypted.ciphertext);
      tamperedBytes[0]! ^= 0xff; // flip bits
      const tamperedPayload = {
        ...encrypted,
        ciphertext: uint8ToBase64(tamperedBytes),
      };

      await expect(
        decryptPasswordEntry(tamperedPayload, passKey, entryId, userId),
      ).rejects.toThrow();
    });

    it("rejects decryption if Authenticated Associated Data (AAD) is substituted", async () => {
      const keys = await createVaultKeys(masterPassword, fastParams);
      const passKey = await getPasswordKey(keys.rootKeyBytes);

      const encrypted = await encryptPasswordEntry(entryData, passKey, entryId, userId);

      // Attempting to decrypt with a different entryId or userId fails
      await expect(
        decryptPasswordEntry(encrypted, passKey, "different-entry-id", userId),
      ).rejects.toThrow();

      await expect(
        decryptPasswordEntry(encrypted, passKey, entryId, "different-user-id"),
      ).rejects.toThrow();
    });
  });

  describe("Document Metadata Encryption & Decryption", () => {
    const docId = "doc-uuid-9999";
    const userId = "user-uuid-5678";
    const docMeta: DocumentMetadata = {
      title: "Driving Licence",
      category: "Vehicle Documents",
      documentNumber: "DL-0420110012345",
      issueDate: "2020-01-15",
      expiryDate: "2030-08-15",
      notes:
        "Need renewal before expiry.\nKept in vehicle glovebox.\nIncludes both two-wheeler and four-wheeler endorsements.",
      tags: ["dl", "vehicle", "id"],
      attachments: [
        {
          id: "att-1",
          label: "Front Side",
          fileName: "dl_front.png",
          fileSize: 102400,
          mimeType: "image/png",
          iv: "some-iv-base64",
        },
        {
          id: "att-2",
          label: "Back Side",
          fileName: "dl_back.png",
          fileSize: 98000,
          mimeType: "image/png",
          iv: "some-iv-base64-2",
        },
      ],
    };

    it("encrypts and decrypts document metadata with multiple attachments and notes", async () => {
      const keys = await createVaultKeys(masterPassword, fastParams);
      const metaKey = await getDocumentMetaKey(keys.rootKeyBytes);

      const encrypted = await encryptDocumentMeta(docMeta, metaKey, docId, userId);
      const decrypted = await decryptDocumentMeta(encrypted, metaKey, docId, userId);

      expect(decrypted).toEqual(docMeta);
      expect(decrypted.attachments.length).toBe(2);
      expect(decrypted.notes).toContain("Kept in vehicle glovebox.");
    });
  });

  describe("Document Binary File Encryption & Decryption", () => {
    const docId = "doc-uuid-9999";
    const attachmentId = "att-1";
    const userId = "user-uuid-5678";

    it("encrypts and decrypts binary document file (e.g. PDF / image)", async () => {
      const keys = await createVaultKeys(masterPassword, fastParams);
      const attKey = await getAttachmentKey(keys.rootKeyBytes, attachmentId);

      // Synthetic binary data simulating a PDF header and content
      const mockPdfContent = new TextEncoder().encode("%PDF-1.4 Mock sensitive document bytes");
      const fileBuffer = mockPdfContent.buffer;

      const { ciphertextBuffer, iv } = await encryptDocumentFile(
        fileBuffer,
        attKey,
        docId,
        attachmentId,
        userId,
      );

      expect(ciphertextBuffer.byteLength).toBeGreaterThan(fileBuffer.byteLength);

      const decryptedBuffer = await decryptDocumentFile(
        ciphertextBuffer,
        attKey,
        docId,
        attachmentId,
        userId,
        iv,
      );

      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      expect(decryptedText).toBe("%PDF-1.4 Mock sensitive document bytes");
    });

    it("fails decryption if file attachment ID or user ID in AAD is tampered", async () => {
      const keys = await createVaultKeys(masterPassword, fastParams);
      const attKey = await getAttachmentKey(keys.rootKeyBytes, attachmentId);
      const fileBuffer = new TextEncoder().encode("Secret test file").buffer;

      const { ciphertextBuffer, iv } = await encryptDocumentFile(
        fileBuffer,
        attKey,
        docId,
        attachmentId,
        userId,
      );

      // Wrong docId or attachmentId in AAD fails
      await expect(
        decryptDocumentFile(ciphertextBuffer, attKey, "wrong-doc-id", attachmentId, userId, iv),
      ).rejects.toThrow();
    });
  });

  describe("Password Generator & Strength Meter", () => {
    it("generates password with configured length and character sets", () => {
      const password = generatePassword({
        length: 24,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });

      expect(password.length).toBe(24);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[^a-zA-Z0-9]/.test(password)).toBe(true);
    });

    it("correctly evaluates password strength levels", () => {
      expect(evaluatePasswordStrength("short").strength).toBe("weak");
      expect(evaluatePasswordStrength("password123").strength).toBe("fair");
      expect(evaluatePasswordStrength("Passw0rd12").strength).toBe("good");
      expect(evaluatePasswordStrength("Passw0rd!Secure").strength).toBe("strong");
      expect(evaluatePasswordStrength("P@ssw0rd!ExtremelySecure2026#").strength).toBe(
        "very-strong",
      );
    });
  });
});
