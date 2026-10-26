// Client-side zero-knowledge cryptographic primitives for My Private Vault.
// Implements Argon2id KDF, WebCrypto AES-256-GCM AEAD, and HKDF domain subkey separation.
import { argon2id } from "@noble/hashes/argon2.js";

export const DEFAULT_ARGON2_PARAMS = {
  iterations: 3,
  memoryCost: 19456, // 19 MB in KiB
  parallelism: 1,
  dkLen: 32, // 256 bits
} as const;

export interface VaultCryptoParams {
  iterations: number;
  memoryCost: number;
  parallelism: number;
}

export interface PasswordEntryData {
  name: string;
  url?: string | undefined;
  username: string;
  password: string;
  notes: string;
}

export interface DocumentAttachmentMeta {
  id: string;
  label: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  iv: string;
}

export interface DocumentMetadata {
  title: string;
  category: string;
  documentNumber?: string | undefined;
  issueDate?: string | undefined; // YYYY-MM-DD
  expiryDate?: string | undefined; // YYYY-MM-DD
  notes: string;
  tags?: string[] | undefined;
  attachments: DocumentAttachmentMeta[];
}

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string; // Base64 12-byte nonce
}

export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

// ----------------- Base64 / Hex Utilities -----------------

const toBuf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToUint8(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ----------------- Key Derivation & Unlocking -----------------

/**
 * Derives a 256-bit Key Encryption Key (KEK) from the master password using Argon2id.
 */
export function deriveKekBytes(
  masterPassword: string,
  salt: Uint8Array,
  params?: Partial<VaultCryptoParams>,
): Uint8Array {
  const t = params?.iterations ?? DEFAULT_ARGON2_PARAMS.iterations;
  const m = params?.memoryCost ?? DEFAULT_ARGON2_PARAMS.memoryCost;
  const p = params?.parallelism ?? DEFAULT_ARGON2_PARAMS.parallelism;

  return argon2id(masterPassword, salt, {
    t,
    m,
    p,
    dkLen: DEFAULT_ARGON2_PARAMS.dkLen,
  });
}

/**
 * Creates fresh vault keys: derives KEK from master password and wraps a random 256-bit Root DEK.
 */
export async function createVaultKeys(
  masterPassword: string,
  params?: Partial<VaultCryptoParams>,
): Promise<{
  saltHex: string;
  wrappedKey: string;
  wrappedKeyIv: string;
  rootKeyBytes: Uint8Array;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kekBytes = deriveKekBytes(masterPassword, salt, params);

  const kek = await crypto.subtle.importKey(
    "raw",
    toBuf(kekBytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );

  // Generate random 256-bit Root DEK
  const rootKeyBytes = crypto.getRandomValues(new Uint8Array(32));

  // Wrap Root DEK with KEK using AES-256-GCM
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(wrapIv) },
    kek,
    toBuf(rootKeyBytes),
  );

  return {
    saltHex: uint8ToHex(salt),
    wrappedKey: uint8ToBase64(new Uint8Array(wrappedBuffer)),
    wrappedKeyIv: uint8ToBase64(wrapIv),
    rootKeyBytes,
  };
}

/**
 * Unwraps the Root DEK using the master password.
 * Throws OperationError if the master password is incorrect.
 */
export async function unlockVault(
  masterPassword: string,
  saltHex: string,
  wrappedKeyBase64: string,
  wrappedKeyIvBase64: string,
  params?: Partial<VaultCryptoParams>,
): Promise<Uint8Array> {
  const salt = hexToUint8(saltHex);
  const kekBytes = deriveKekBytes(masterPassword, salt, params);

  const kek = await crypto.subtle.importKey(
    "raw",
    toBuf(kekBytes),
    "AES-GCM",
    false,
    ["decrypt"],
  );

  const wrappedBuffer = base64ToUint8(wrappedKeyBase64);
  const wrapIv = base64ToUint8(wrappedKeyIvBase64);

  const unwrappedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(wrapIv) },
    kek,
    toBuf(wrappedBuffer),
  );

  return new Uint8Array(unwrappedBuffer);
}

/**
 * Rewraps the existing Root DEK under a new master password.
 */
export async function rewrapVaultKeys(
  rootKeyBytes: Uint8Array,
  newMasterPassword: string,
  params?: Partial<VaultCryptoParams>,
): Promise<{
  saltHex: string;
  wrappedKey: string;
  wrappedKeyIv: string;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kekBytes = deriveKekBytes(newMasterPassword, salt, params);

  const kek = await crypto.subtle.importKey(
    "raw",
    toBuf(kekBytes),
    "AES-GCM",
    false,
    ["encrypt"],
  );

  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(wrapIv) },
    kek,
    toBuf(rootKeyBytes),
  );

  return {
    saltHex: uint8ToHex(salt),
    wrappedKey: uint8ToBase64(new Uint8Array(wrappedBuffer)),
    wrappedKeyIv: uint8ToBase64(wrapIv),
  };
}

// ----------------- HKDF Subkey Derivation -----------------

async function importHkdfBaseKey(rootKeyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toBuf(rootKeyBytes), "HKDF", false, ["deriveKey"]);
}

/**
 * Derives the domain key for password entries.
 */
export async function getPasswordKey(rootKeyBytes: Uint8Array): Promise<CryptoKey> {
  const hkdfBase = await importHkdfBaseKey(rootKeyBytes);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuf(new Uint8Array()),
      info: toBuf(new TextEncoder().encode("vault-passwords-v1")),
    },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Derives the domain key for document metadata and notes.
 */
export async function getDocumentMetaKey(rootKeyBytes: Uint8Array): Promise<CryptoKey> {
  const hkdfBase = await importHkdfBaseKey(rootKeyBytes);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuf(new Uint8Array()),
      info: toBuf(new TextEncoder().encode("vault-doc-meta-v1")),
    },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Derives a specific AES-256-GCM key for an individual document file attachment.
 */
export async function getAttachmentKey(
  rootKeyBytes: Uint8Array,
  attachmentId: string,
): Promise<CryptoKey> {
  const hkdfBase = await importHkdfBaseKey(rootKeyBytes);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuf(new TextEncoder().encode(attachmentId)),
      info: toBuf(new TextEncoder().encode("vault-attachment-file-v1")),
    },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ----------------- Password Entry Encryption & Decryption -----------------

export async function encryptPasswordEntry(
  data: PasswordEntryData,
  key: CryptoKey,
  entryId: string,
  userId: string,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${entryId}:${userId}`);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: toBuf(aad) },
    key,
    toBuf(plaintext),
  );

  return {
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
    iv: uint8ToBase64(iv),
  };
}

export async function decryptPasswordEntry(
  payload: EncryptedPayload,
  key: CryptoKey,
  entryId: string,
  userId: string,
): Promise<PasswordEntryData> {
  const iv = base64ToUint8(payload.iv);
  const ciphertext = base64ToUint8(payload.ciphertext);
  const aad = new TextEncoder().encode(`${entryId}:${userId}`);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: toBuf(aad) },
    key,
    toBuf(ciphertext),
  );

  const text = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(text) as PasswordEntryData;
}

// ----------------- Document Metadata Encryption & Decryption -----------------

export async function encryptDocumentMeta(
  meta: DocumentMetadata,
  key: CryptoKey,
  docId: string,
  userId: string,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${docId}:${userId}`);
  const plaintext = new TextEncoder().encode(JSON.stringify(meta));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: toBuf(aad) },
    key,
    toBuf(plaintext),
  );

  return {
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
    iv: uint8ToBase64(iv),
  };
}

export async function decryptDocumentMeta(
  payload: EncryptedPayload,
  key: CryptoKey,
  docId: string,
  userId: string,
): Promise<DocumentMetadata> {
  const iv = base64ToUint8(payload.iv);
  const ciphertext = base64ToUint8(payload.ciphertext);
  const aad = new TextEncoder().encode(`${docId}:${userId}`);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: toBuf(aad) },
    key,
    toBuf(ciphertext),
  );

  const text = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(text) as DocumentMetadata;
}

// ----------------- Document Binary File Encryption & Decryption -----------------

export async function encryptDocumentFile(
  fileBytes: ArrayBuffer,
  key: CryptoKey,
  docId: string,
  attachmentId: string,
  userId: string,
): Promise<{ ciphertextBuffer: ArrayBuffer; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${docId}:${attachmentId}:${userId}`);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: toBuf(aad) },
    key,
    fileBytes,
  );

  return {
    ciphertextBuffer,
    iv: uint8ToBase64(iv),
  };
}

export async function decryptDocumentFile(
  ciphertextBuffer: ArrayBuffer,
  key: CryptoKey,
  docId: string,
  attachmentId: string,
  userId: string,
  ivBase64: string,
): Promise<ArrayBuffer> {
  const iv = base64ToUint8(ivBase64);
  const aad = new TextEncoder().encode(`${docId}:${attachmentId}:${userId}`);

  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(iv), additionalData: toBuf(aad) },
    key,
    ciphertextBuffer,
  );
}

// ----------------- Password Generator & Strength Meter -----------------

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";

export function generatePassword(options: PasswordGeneratorOptions): string {
  let pool = "";
  const requiredChars: string[] = [];

  if (options.lowercase) {
    pool += LOWERCASE;
    requiredChars.push(getRandomChar(LOWERCASE));
  }
  if (options.uppercase) {
    pool += UPPERCASE;
    requiredChars.push(getRandomChar(UPPERCASE));
  }
  if (options.numbers) {
    pool += NUMBERS;
    requiredChars.push(getRandomChar(NUMBERS));
  }
  if (options.symbols) {
    pool += SYMBOLS;
    requiredChars.push(getRandomChar(SYMBOLS));
  }

  if (pool.length === 0) {
    pool = LOWERCASE + NUMBERS;
    requiredChars.push(getRandomChar(LOWERCASE), getRandomChar(NUMBERS));
  }

  const length = Math.max(8, Math.min(64, options.length));
  const remainingLength = Math.max(0, length - requiredChars.length);
  const randomChars: string[] = [];

  const randomBytes = crypto.getRandomValues(new Uint8Array(remainingLength));
  for (let i = 0; i < remainingLength; i++) {
    randomChars.push(pool[randomBytes[i]! % pool.length]!);
  }

  // Combine and shuffle using Fisher-Yates with CSPRNG
  const allChars = [...requiredChars, ...randomChars];
  for (let i = allChars.length - 1; i > 0; i--) {
    const rand = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const j = rand % (i + 1);
    const temp = allChars[i]!;
    allChars[i] = allChars[j]!;
    allChars[j] = temp;
  }

  return allChars.join("");
}

function getRandomChar(charset: string): string {
  const rand = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return charset[rand % charset.length]!;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong" | "very-strong";

export function evaluatePasswordStrength(password: string): {
  strength: PasswordStrength;
  score: number; // 0 to 4
  label: string;
} {
  if (!password || password.length === 0) {
    return { strength: "weak", score: 0, label: "Too Short" };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  const diversity = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (diversity >= 2 && password.length >= 8 && score < 2) score = 2;
  if (diversity >= 3 && password.length >= 10 && score < 3) score = 3;
  if (diversity >= 4 && password.length >= 14) score = 4;

  switch (score) {
    case 0:
    case 1:
      return { strength: "weak", score: 1, label: "Weak" };
    case 2:
      return { strength: "fair", score: 2, label: "Fair" };
    case 3:
      return { strength: "good", score: 3, label: "Good" };
    case 4:
    default:
      return {
        strength: password.length >= 20 ? "very-strong" : "strong",
        score: 4,
        label: password.length >= 20 ? "Very Strong" : "Strong",
      };
  }
}
