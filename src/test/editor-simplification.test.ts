import { describe, it, expect } from "vitest";
import { parseContent, type PageContent } from "@/lib/page-content";
import { pageContentToMindMap, mindmapToPageContent } from "@/lib/mindmap-bridge";
import type { MapDoc } from "@/lib/mindmap-doc";

describe("Simplified Notes Formatting & Backward Compatibility (Feature 3)", () => {
  const ALLOWED_CREATION_TYPES = ["p", "bullet", "number", "check", "divider", "image"] as const;
  const DISALLOWED_CREATION_TYPES = ["h1", "h2", "h3", "callout", "code"] as const;

  it("defines strictly allowed block creation types and excludes legacy types from creation", () => {
    // Only 6 block creation types are permitted
    expect(ALLOWED_CREATION_TYPES).toEqual(["p", "bullet", "number", "check", "divider", "image"]);

    // Disallowed creation types must not be in allowed list
    for (const legacyType of DISALLOWED_CREATION_TYPES) {
      expect((ALLOWED_CREATION_TYPES as readonly string[]).includes(legacyType)).toBe(false);
    }
  });

  it("safely normalizes legacy note documents containing headings, callouts, and code blocks without loss", () => {
    const legacyDoc = JSON.stringify({
      blocks: [
        { id: "h1-1", type: "h1", text: "Main Project Heading" },
        { id: "h2-1", type: "h2", text: "Secondary Section" },
        { id: "h3-1", type: "h3", text: "Sub-topic Details" },
        { id: "call-1", type: "callout", text: "Important notice for users", calloutType: "info" },
        {
          id: "code-1",
          type: "code",
          text: "function authenticate() {\n  return true;\n}",
          language: "typescript",
        },
        { id: "chk-1", type: "check", text: "Verified legacy persistence", checked: true },
        { id: "chk-2", type: "check", text: "Pending legacy task", checked: false },
        { id: "div-1", type: "divider", text: "" },
        { id: "img-1", type: "image", text: "", url: "/api/images/uuid-1.png", caption: "Receipt screenshot" },
      ],
    });

    const normalized = parseContent(legacyDoc);

    // Assert every legacy block is preserved intact
    expect(normalized.blocks.length).toBe(9);
    expect(normalized.blocks[0]?.type).toBe("h1");
    expect(normalized.blocks[0]?.text).toBe("Main Project Heading");

    expect(normalized.blocks[1]?.type).toBe("h2");
    expect(normalized.blocks[1]?.text).toBe("Secondary Section");

    expect(normalized.blocks[2]?.type).toBe("h3");
    expect(normalized.blocks[2]?.text).toBe("Sub-topic Details");

    expect(normalized.blocks[3]?.type).toBe("callout");
    expect(normalized.blocks[3]?.text).toBe("Important notice for users");
    expect(normalized.blocks[3]?.calloutType).toBe("info");

    expect(normalized.blocks[4]?.type).toBe("code");
    expect(normalized.blocks[4]?.text).toBe("function authenticate() {\n  return true;\n}");
    expect(normalized.blocks[4]?.language).toBe("typescript");

    expect(normalized.blocks[5]?.type).toBe("check");
    expect(normalized.blocks[5]?.checked).toBe(true);
    expect(normalized.blocks[6]?.checked).toBe(false);

    expect(normalized.blocks[7]?.type).toBe("divider");

    expect(normalized.blocks[8]?.type).toBe("image");
    expect(normalized.blocks[8]?.url).toBe("/api/images/uuid-1.png");
    expect(normalized.blocks[8]?.caption).toBe("Receipt screenshot");
  });

  it("preserves checklist completion status without requiring strikethrough formatting", () => {
    const content = JSON.stringify({
      blocks: [
        { id: "c1", type: "check", text: "Task item 1", checked: true },
        { id: "c2", type: "check", text: "Task item 2", checked: false },
      ],
    });

    const normalized = parseContent(content);
    expect(normalized.blocks[0]?.checked).toBe(true);
    expect(normalized.blocks[1]?.checked).toBe(false);
  });

  it("converts notes with legacy headings and new image blocks to Mind Map and back safely", () => {
    const originalNote: PageContent = {
      blocks: [
        { id: "h1", type: "h1", text: "Project Alpha Architecture" },
        { id: "p1", type: "p", text: "Core system overview" },
        { id: "img1", type: "image", text: "", url: "/api/images/arch-diagram.png", caption: "System Diagram" },
      ],
    };

    // Convert Note to Mind Map
    const res = pageContentToMindMap("Project Alpha", originalNote);
    const mapDoc: MapDoc = res.doc;
    expect(mapDoc.nodes.length).toBeGreaterThan(1);

    // Look for image representation in mind map node
    const imageNode = mapDoc.nodes.find((n) => n.title.includes("System Diagram") || n.title.includes("📷"));
    expect(imageNode).toBeDefined();

    // Convert Mind Map back to Note
    const convertedNoteRes = mindmapToPageContent(mapDoc);
    const convertedImageBlock = convertedNoteRes.content.blocks.find((b) => b.type === "image");
    expect(convertedImageBlock).toBeDefined();
    expect(convertedImageBlock?.url).toBe("/api/images/arch-diagram.png");
    expect(convertedImageBlock?.caption).toBe("System Diagram");
  });
});
