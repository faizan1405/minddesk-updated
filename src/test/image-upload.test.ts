import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateImageSignature,
  extensionForMime,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  readImageFile,
} from "@/lib/server/images.server";
import * as apiServer from "@/lib/server/api.server";

describe("Image Storage & Security System (Feature 4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("File Format & Magic Byte Signatures", () => {
    it("enforces a strict 10 MB maximum file size limit", () => {
      expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
      expect(ALLOWED_MIME_TYPES).toEqual(["image/png", "image/jpeg", "image/webp"]);
    });

    it("accepts valid PNG signature (89 50 4E 47 0D 0A 1A 0A)", () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      expect(validateImageSignature(pngHeader)).toBe("image/png");
      expect(extensionForMime("image/png")).toBe("png");
    });

    it("accepts valid JPEG signature (FF D8 FF)", () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      expect(validateImageSignature(jpegHeader)).toBe("image/jpeg");
      expect(extensionForMime("image/jpeg")).toBe("jpg");
    });

    it("accepts valid WebP signature (RIFF ... WEBP)", () => {
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // "RIFF"
        0x24, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // "WEBP"
      ]);
      expect(validateImageSignature(webpHeader)).toBe("image/webp");
      expect(extensionForMime("image/webp")).toBe("webp");
    });

    it("rejects malicious HTML/JS payloads disguised as images", () => {
      const htmlPayload = Buffer.from("<script>alert('xss')</script><html><body>hack</body></html>");
      expect(() => validateImageSignature(htmlPayload)).toThrow("Unsupported or invalid image file");
    });

    it("rejects executable binaries (MZ / ELF)", () => {
      const exePayload = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
      expect(() => validateImageSignature(exePayload)).toThrow("Unsupported or invalid image file");
    });

    it("rejects truncated or tiny files under 12 bytes", () => {
      const tinyPayload = Buffer.from([0x89, 0x50, 0x4e]);
      expect(() => validateImageSignature(tinyPayload)).toThrow("File too small");
    });
  });

  describe("Authentication & Ownership Isolation", () => {
    it("rejects cross-user access when user tries to access another user's image", async () => {
      const mockPrisma = {
        noteImage: {
          findFirst: vi.fn().mockResolvedValue(null), // simulate not owned by this userId
        },
      };
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);

      await expect(readImageFile("attacker-user-id", "victim-image-id")).rejects.toThrow(
        "Image not found or access denied",
      );

      expect(mockPrisma.noteImage.findFirst).toHaveBeenCalledWith({
        where: { id: "victim-image-id", userId: "attacker-user-id" },
      });
    });
  });

  describe("Preview Mode Integration", () => {
    it("handles image uploads and retrieval in Preview Mode", async () => {
      const { previewRequest } = await import("@/lib/preview/adapter");

      const uploadRes = previewRequest("POST", "/api/images", {
        fileName: "screenshot.png",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      });

      expect(uploadRes.status).toBe(201);
      const data = uploadRes.data as { id: string; url: string; fileName: string };
      expect(data.id).toBeDefined();
      expect(data.url).toContain("data:image/png");

      // Verify retrieval
      const getRes = previewRequest("GET", `/api/images/${data.id}`);
      expect(getRes.status).toBe(200);
      expect((getRes.data as { id: string }).id).toBe(data.id);
    });
  });
});
