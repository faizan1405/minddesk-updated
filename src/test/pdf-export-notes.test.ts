import { describe, expect, it } from "vitest";
import { parseInlineFormatting, buildNotePdfDocDefinition } from "../lib/pdf-export-notes";
import { getPdfMake } from "../lib/pdfmake-client";
import type { Block } from "../lib/page-content";

describe("Notes PDF Export", () => {
  describe("Inline formatting parser", () => {
    it("handles plain text", () => {
      const res = parseInlineFormatting("Hello world");
      expect(res).toEqual([{ text: "Hello world", color: "#1e293b", decoration: undefined }]);
    });

    it("parses bold, italic, strikethrough, and code", () => {
      const res = parseInlineFormatting(
        "Here is **bold**, *italic*, ~~striked~~, and `inline code`.",
      );
      expect(res.some((f) => f.text === "bold" && f.bold === true)).toBe(true);
      expect(res.some((f) => f.text === "italic" && f.italics === true)).toBe(true);
      expect(res.some((f) => f.text === "striked" && f.decoration === "lineThrough")).toBe(true);
      expect(res.some((f) => f.text === "inline code" && f.background === "#f1f5f9")).toBe(true);
    });

    it("supports checked items with full strikethrough and muted color", () => {
      const res = parseInlineFormatting("Complete task with **bold priority**", {
        strikethrough: true,
      });
      expect(res.every((f) => f.decoration === "lineThrough")).toBe(true);
      expect(res.every((f) => f.color === "#94a3b8")).toBe(true);
    });
  });

  describe("Document definition builder", () => {
    it("creates document definition preserving title, headings, lists, and checklists", () => {
      const blocks: Block[] = [
        { id: "1", type: "p", text: "# Main Heading" },
        { id: "2", type: "p", text: "## Sub Heading" },
        { id: "3", type: "p", text: "A standard paragraph with **important** note." },
        { id: "4", type: "bullet", text: "Bullet point A" },
        { id: "5", type: "bullet", text: "Bullet point B" },
        { id: "6", type: "number", text: "Step 1" },
        { id: "7", type: "number", text: "Step 2" },
        { id: "8", type: "check", text: "Done item", checked: true },
        { id: "9", type: "check", text: "Pending item", checked: false },
      ];

      const docDef = buildNotePdfDocDefinition({
        title: "Test Note Title",
        blocks,
      });

      expect(docDef.pageSize).toBe("A4");
      expect(docDef.pageOrientation).toBe("portrait");
      expect(Array.isArray(docDef.content)).toBe(true);
      expect(docDef.content.length).toBeGreaterThan(5);
    });

    it("compiles through pdfmake without error and produces a valid PDF buffer", async () => {
      const blocks: Block[] = [
        { id: "1", type: "p", text: "# Quarterly Strategy" },
        {
          id: "2",
          type: "p",
          text: "Here is the summary of **Q3 initiatives** and *growth targets*.",
        },
        { id: "3", type: "bullet", text: "Expand enterprise adoption" },
        { id: "4", type: "bullet", text: "Improve PDF export capabilities" },
        { id: "5", type: "number", text: "Phase 1: Architecture" },
        { id: "6", type: "number", text: "Phase 2: Implementation" },
        { id: "7", type: "check", text: "Code review completed", checked: true },
        { id: "8", type: "check", text: "Deploy to staging", checked: false },
      ];

      const docDef = buildNotePdfDocDefinition({
        title: "MindDesk Q3 Strategy",
        blocks,
      });

      const pdfMake = await getPdfMake();
      const generator = (
        pdfMake as unknown as {
          createPdf: (d: unknown) => { getBuffer: (cb: (b: Uint8Array) => void) => void };
        }
      ).createPdf(docDef);

      const buffer = await new Promise<Uint8Array>((resolve, reject) => {
        generator.getBuffer((buf: Uint8Array) => {
          if (buf && buf.length > 0) resolve(buf);
          else reject(new Error("Buffer empty"));
        });
      });

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(1000);
      // PDF header magic number %PDF
      const header = String.fromCharCode(...buffer.slice(0, 4));
      expect(header).toBe("%PDF");
    });
  });
});
