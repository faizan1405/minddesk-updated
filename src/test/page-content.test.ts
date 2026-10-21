import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  CALLOUT_TYPES,
  BlockSchema,
  ContentSchema,
  emptyContent,
  newBlockId,
  parseContent,
  type Block,
} from "../lib/page-content";

describe("Page Content Architecture & Compatibility", () => {
  it("supports all standard block types including image blocks", () => {
    expect(BLOCK_TYPES).toEqual([
      "p",
      "h1",
      "h2",
      "h3",
      "bullet",
      "number",
      "check",
      "callout",
      "code",
      "divider",
      "image",
    ]);
  });

  it("supports all callout types", () => {
    expect(CALLOUT_TYPES).toEqual(["info", "tip", "warning", "quote"]);
  });

  describe("Validation with BlockSchema & ContentSchema", () => {
    it("validates legacy p, check, number, and bullet blocks seamlessly", () => {
      const legacyBlocks: Block[] = [
        { id: "p-1", type: "p", text: "Legacy paragraph text" },
        { id: "c-1", type: "check", text: "Check item done", checked: true },
        { id: "c-2", type: "check", text: "Check item pending", checked: false },
        { id: "n-1", type: "number", text: "Step 1" },
        { id: "b-1", type: "bullet", text: "Bullet point" },
      ];

      const res = ContentSchema.safeParse({ blocks: legacyBlocks });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.blocks.length).toBe(5);
        expect(res.data.blocks[1]?.checked).toBe(true);
        expect(res.data.blocks[2]?.checked).toBe(false);
      }
    });

    it("validates new rich block types: h1, h2, h3, callout, code, divider", () => {
      const richBlocks: Block[] = [
        { id: "h1-1", type: "h1", text: "Document Title" },
        { id: "h2-1", type: "h2", text: "Section 1" },
        { id: "h3-1", type: "h3", text: "Subsection 1.1" },
        { id: "co-1", type: "callout", text: "Important tip", calloutType: "tip" },
        {
          id: "cd-1",
          type: "code",
          text: "const greeting = 'hello';",
          language: "typescript",
        },
        { id: "dv-1", type: "divider", text: "" },
      ];

      const res = ContentSchema.safeParse({ blocks: richBlocks });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.blocks.length).toBe(6);
        expect(res.data.blocks[3]?.calloutType).toBe("tip");
        expect(res.data.blocks[4]?.language).toBe("typescript");
      }
    });
  });

  describe("parseContent Resilience & Safe Fallback", () => {
    it("returns emptyContent for null or undefined without throwing", () => {
      expect(parseContent(null).blocks.length).toBe(1);
      expect(parseContent(null).blocks[0]?.type).toBe("p");
      expect(parseContent(undefined).blocks.length).toBe(1);
      expect(parseContent("").blocks.length).toBe(1);
    });

    it("parses valid JSON string with both legacy and new blocks", () => {
      const json = JSON.stringify({
        blocks: [
          { id: "p-1", type: "p", text: "Existing content" },
          { id: "h1-1", type: "h1", text: "New heading" },
          { id: "c-1", type: "check", text: "Checklist item", checked: true },
          { id: "cd-1", type: "code", text: "console.log('hi')", language: "javascript" },
        ],
      });

      const parsed = parseContent(json);
      expect(parsed.blocks.length).toBe(4);
      expect(parsed.blocks[0]?.id).toBe("p-1");
      expect(parsed.blocks[1]?.type).toBe("h1");
      expect(parsed.blocks[2]?.checked).toBe(true);
      expect(parsed.blocks[3]?.language).toBe("javascript");
    });

    it("resiliently recovers blocks even if slightly malformed or containing unknown types", () => {
      const malformedJson = JSON.stringify({
        blocks: [
          { id: "ok-1", type: "p", text: "Normal block" },
          { id: "bad-1", type: "unknown-type-xyz", text: "Preserved text content" },
          { text: "Block without id" },
        ],
      });

      const parsed = parseContent(malformedJson);
      expect(parsed.blocks.length).toBe(3);
      expect(parsed.blocks[0]?.id).toBe("ok-1");
      // Unknown type safely fell back to "p" without losing text
      expect(parsed.blocks[1]?.type).toBe("p");
      expect(parsed.blocks[1]?.text).toBe("Preserved text content");
      // Missing id was generated
      expect(parsed.blocks[2]?.id).toBeDefined();
      expect(parsed.blocks[2]?.text).toBe("Block without id");
    });

    it("generates unique block IDs", () => {
      const id1 = newBlockId();
      const id2 = newBlockId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(6);
    });
  });
});
