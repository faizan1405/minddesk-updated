import { describe, it, expect, vi, beforeEach } from "vitest";
import * as imagesServer from "@/lib/server/images.server";
import {
  validateImageSignature,
  extensionForMime,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  readImageFile,
  saveImageFile,
} from "@/lib/server/images.server";
import * as apiServer from "@/lib/server/api.server";
import { Route as ImagesRoute } from "@/routes/api.images";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      expect(validateImageSignature(pngHeader)).toBe("image/png");
      expect(extensionForMime("image/png")).toBe("png");
    });

    it("accepts valid JPEG signature (FF D8 FF)", () => {
      const jpegHeader = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      expect(validateImageSignature(jpegHeader)).toBe("image/jpeg");
      expect(extensionForMime("image/jpeg")).toBe("jpg");
    });

    it("accepts valid WebP signature (RIFF ... WEBP)", () => {
      const webpHeader = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // "RIFF"
        0x24,
        0x00,
        0x00,
        0x00, // size
        0x57,
        0x45,
        0x42,
        0x50, // "WEBP"
      ]);
      expect(validateImageSignature(webpHeader)).toBe("image/webp");
      expect(extensionForMime("image/webp")).toBe("webp");
    });

    it("rejects malicious HTML/JS payloads disguised as images", () => {
      const htmlPayload = Buffer.from(
        "<script>alert('xss')</script><html><body>hack</body></html>",
      );
      expect(() => validateImageSignature(htmlPayload)).toThrow(
        "Unsupported or invalid image file",
      );
    });

    it("rejects executable binaries (MZ / ELF)", () => {
      const exePayload = Buffer.from([
        0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
      ]);
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
      vi.spyOn(apiServer, "db").mockReturnValue(
        mockPrisma as unknown as ReturnType<typeof apiServer.db>,
      );

      await expect(readImageFile("attacker-user-id", "victim-image-id")).rejects.toThrow(
        "Image not found or access denied",
      );

      expect(mockPrisma.noteImage.findFirst).toHaveBeenCalledWith({
        where: { id: "victim-image-id", userId: "attacker-user-id" },
      });
    });

    it("prevents orphaned image file on disk when metadata database insertion fails", async () => {
      const tmpTestDir = path.join(os.tmpdir(), `minddesk-orphan-test-${Date.now()}`);
      process.env["STORAGE_DIR"] = tmpTestDir;

      const mockPrisma = {
        noteImage: {
          create: vi.fn().mockRejectedValue(new Error("Database connection dropped")),
        },
      };
      vi.spyOn(apiServer, "db").mockReturnValue(
        mockPrisma as unknown as ReturnType<typeof apiServer.db>,
      );

      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);

      await expect(saveImageFile("user-1", "test.png", validPng)).rejects.toThrow(
        "Database connection dropped",
      );

      // Verify that no orphaned files were left in the storage directory
      if (fs.existsSync(tmpTestDir)) {
        const remainingFiles = fs.readdirSync(tmpTestDir);
        expect(remainingFiles.length).toBe(0);
        fs.rmdirSync(tmpTestDir);
      }
    });
  });

  describe("Preview Mode Integration", () => {
    it("handles image uploads and retrieval in Preview Mode", async () => {
      const { previewRequest } = await import("@/lib/preview/adapter");

      const uploadRes = previewRequest("POST", "/api/images", {
        fileName: "screenshot.png",
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
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

  describe("Upload Size Enforcement & Multipart Boundaries (Issue 3)", () => {
    it("accepts normal multipart upload with valid PNG and returns 201", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof apiServer.requireUser>>);
      vi.spyOn(imagesServer, "saveImageFile").mockResolvedValue({
        id: "img-123",
        url: "/api/images/img-123",
        fileName: "test.png",
        fileSize: 12,
        mimeType: "image/png",
      });

      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const boundary = "----TestBoundary123";
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        validPng,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const req = new Request("http://localhost/api/images", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(body.length),
        },
        body,
      });

      const handlers = (
        ImagesRoute.options as unknown as {
          server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers;
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(201);
      const json = (await res.json()) as { id: string };
      expect(json.id).toBe("img-123");
    });

    it("rejects oversized multipart upload via Content-Length header with 413", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof apiServer.requireUser>>);

      const oversizedBytes = 11 * 1024 * 1024; // 11 MB (> 10MB + 64KB envelope)
      const req = new Request("http://localhost/api/images", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----WebKitFormBoundaryXYZ",
          "content-length": String(oversizedBytes),
        },
        body: new Uint8Array(10),
      });

      const handlers = (
        ImagesRoute.options as unknown as {
          server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers;
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(413);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Image exceeds maximum allowed size (10 MB).");
    });

    it("rejects oversized multipart upload WITHOUT Content-Length before full buffering with 413", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof apiServer.requireUser>>);

      // Create a stream that emits 12 MB across multiple chunks without a content-length header
      const chunk = new Uint8Array(2 * 1024 * 1024); // 2 MB chunks
      let chunksSent = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (chunksSent < 6) {
            // 6 * 2MB = 12 MB total
            controller.enqueue(chunk);
            chunksSent++;
          } else {
            controller.close();
          }
        },
      });

      const req = new Request("http://localhost/api/images", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----StreamBoundaryXYZ",
          // Note: NO content-length header!
        },
        body: stream,
        // @ts-expect-error duplex required for streaming request body in Node
        duplex: "half",
      });

      const handlers = (
        ImagesRoute.options as unknown as {
          server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers;
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(413);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Image exceeds maximum allowed size (10 MB).");
    });

    it("rejects multipart request where envelope is under bound but extracted file exceeds 10 MB with 413", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof apiServer.requireUser>>);

      // 10 MB + 100 bytes file (exceeds 10 MB, but within 10MB + 64KB envelope)
      const oversizedFileBytes = 10 * 1024 * 1024 + 100;
      const dummyFileBuffer = new Uint8Array(oversizedFileBytes);
      const boundary = "----TestBoundaryExact";
      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.png"\r\nContent-Type: image/png\r\n\r\n`,
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, Buffer.from(dummyFileBuffer), footer]);

      const req = new Request("http://localhost/api/images", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(body.length),
        },
        body,
      });

      const handlers = (
        ImagesRoute.options as unknown as {
          server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers;
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(413);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Image exceeds maximum allowed size (10 MB).");
    });

    it("accepts normal raw binary upload and returns 201", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof apiServer.requireUser>>);
      vi.spyOn(imagesServer, "saveImageFile").mockResolvedValue({
        id: "img-raw-1",
        url: "/api/images/img-raw-1",
        fileName: "screenshot.png",
        fileSize: 12,
        mimeType: "image/png",
      });

      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const req = new Request("http://localhost/api/images", {
        method: "POST",
        headers: {
          "content-type": "image/png",
          "x-filename": "screenshot.png",
        },
        body: validPng,
      });

      const handlers = (
        ImagesRoute.options as unknown as {
          server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers;
      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(201);
      const json = (await res.json()) as { id: string };
      expect(json.id).toBe("img-raw-1");
    });
  });
});
