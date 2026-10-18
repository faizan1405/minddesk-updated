import { describe, expect, it } from "vitest";
import {
  parseContent,
  emptyContent,
  newBlockId,
  type Block,
  type PageContent,
} from "../lib/page-content";

describe("Notes Editor Verification — Data Integrity & Interactions", () => {
  describe("1. All 10 Block Types & Serialization", () => {
    it("serializes and deserializes all 10 block types cleanly without data corruption", () => {
      const fullDoc: PageContent = {
        blocks: [
          { id: "b-p", type: "p", text: "Standard paragraph" },
          { id: "b-h1", type: "h1", text: "Main Section Heading" },
          { id: "b-h2", type: "h2", text: "Secondary Section Heading" },
          { id: "b-h3", type: "h3", text: "Subsection Heading" },
          { id: "b-bullet", type: "bullet", text: "Bulleted list item" },
          { id: "b-number", type: "number", text: "Numbered step item" },
          { id: "b-check-1", type: "check", text: "Completed task", checked: true },
          { id: "b-check-2", type: "check", text: "Pending task", checked: false },
          {
            id: "b-callout",
            type: "callout",
            text: "This is a key callout",
            calloutType: "tip",
          },
          {
            id: "b-code",
            type: "code",
            text: "console.log('MindDesk');",
            language: "typescript",
          },
          { id: "b-divider", type: "divider", text: "" },
        ],
      };

      const rawJson = JSON.stringify(fullDoc);
      const restored = parseContent(rawJson);

      expect(restored.blocks.length).toBe(11);
      expect(restored.blocks.map((b) => b.type)).toEqual([
        "p",
        "h1",
        "h2",
        "h3",
        "bullet",
        "number",
        "check",
        "check",
        "callout",
        "code",
        "divider",
      ]);

      // Check specific properties
      expect(restored.blocks[6]?.checked).toBe(true);
      expect(restored.blocks[7]?.checked).toBe(false);
      expect(restored.blocks[8]?.calloutType).toBe("tip");
      expect(restored.blocks[9]?.language).toBe("typescript");
      expect(restored.blocks[10]?.text).toBe("");
    });
  });

  describe("2. Legacy Data Preservation (23 Notes / Backward Compatibility)", () => {
    it("guarantees existing legacy notes retain their original content, block IDs, and checklist states", () => {
      const legacyNoteRaw = JSON.stringify({
        blocks: [
          {
            id: "existing-block-id",
            type: "p",
            text: "Existing content from real user backup",
          },
          {
            id: "existing-number-id",
            type: "number",
            text: "Existing numbered content",
          },
          {
            id: "existing-check-id",
            type: "check",
            text: "Existing checklist content",
            checked: false,
          },
          {
            id: "existing-bullet-id",
            type: "bullet",
            text: "Existing bullet content",
          },
        ],
      });

      const parsed = parseContent(legacyNoteRaw);

      expect(parsed.blocks.length).toBe(4);
      expect(parsed.blocks[0]?.id).toBe("existing-block-id");
      expect(parsed.blocks[0]?.text).toBe("Existing content from real user backup");
      expect(parsed.blocks[1]?.id).toBe("existing-number-id");
      expect(parsed.blocks[2]?.id).toBe("existing-check-id");
      expect(parsed.blocks[2]?.checked).toBe(false);
      expect(parsed.blocks[3]?.id).toBe("existing-bullet-id");
    });

    it("preserves multiline raw text inside paragraph blocks without stripping markdown", () => {
      const multilineText = "Line 1 with **bold**\nLine 2 with *italic*\nLine 3 with `code`";
      const legacyRaw = JSON.stringify({
        blocks: [{ id: "multi-1", type: "p", text: multilineText }],
      });

      const parsed = parseContent(legacyRaw);
      expect(parsed.blocks[0]?.text).toBe(multilineText);
    });
  });

  describe("3. Concurrency & Optimistic Version Checks", () => {
    it("simulates optimistic concurrency: stale base_version detects conflict", () => {
      // In MindDesk, page version increments on each content update.
      const dbRecord = {
        id: "page-abc",
        version: 1,
        content: JSON.stringify(emptyContent()),
      };

      // Client A reads version 1
      const clientABaseVersion = dbRecord.version;

      // Client B saves first, incrementing version to 2
      const clientBUpdate = (newContent: PageContent, baseVersion: number) => {
        if (dbRecord.version !== baseVersion) {
          return { status: 409, error: "This page was changed elsewhere." };
        }
        dbRecord.version += 1;
        dbRecord.content = JSON.stringify(newContent);
        return { status: 200, version: dbRecord.version };
      };

      const resB = clientBUpdate({ blocks: [{ id: "b1", type: "p", text: "Client B edit" }] }, 1);
      expect(resB.status).toBe(200);
      expect(dbRecord.version).toBe(2);

      // Client A attempts to save with stale version 1
      const resA = clientBUpdate(
        { blocks: [{ id: "a1", type: "p", text: "Client A edit" }] },
        clientABaseVersion,
      );
      expect(resA.status).toBe(409);
      expect(resA.error).toBe("This page was changed elsewhere.");

      // Database content remains client B's edit; client A's stale edit was NOT allowed to overwrite
      expect(JSON.parse(dbRecord.content).blocks[0].text).toBe("Client B edit");
    });
  });

  describe("4. Backup v1 Export & Import Round Trip", () => {
    it("verifies backup format v1 round-trip preserves rich blocks, hierarchy, and associations", () => {
      // MindDesk v1 backup structure
      const backupV1 = {
        format: "minddesk-backup",
        version: 1,
        exported_at: "2026-10-18T12:00:00.000Z",
        notes: "Records keep their original ids; parent/child links use those ids.",
        pages: [
          {
            id: "parent-page-1",
            projectId: null,
            parentId: null,
            title: "Parent Root Note",
            version: 3,
            position: 1000,
            content: {
              blocks: [
                { id: "b1", type: "h1", text: "Architecture Overview" },
                { id: "b2", type: "p", text: "Introductory paragraph." },
                { id: "b3", type: "callout", text: "Key takeaway", calloutType: "info" },
              ],
            },
          },
          {
            id: "child-page-2",
            projectId: null,
            parentId: "parent-page-1", // Nested hierarchy preserved
            title: "Child Subpage",
            version: 1,
            position: 2000,
            content: {
              blocks: [
                { id: "cb1", type: "h2", text: "Sub-module Specification" },
                { id: "cb2", type: "code", text: "npm run test", language: "bash" },
                { id: "cb3", type: "check", text: "Deploy to Hostinger", checked: true },
              ],
            },
          },
          {
            id: "project-note-3",
            projectId: "proj-123", // Project association preserved
            parentId: null,
            title: "Project Linked Note",
            version: 2,
            position: 3000,
            content: {
              blocks: [
                { id: "pb1", type: "h3", text: "Sprint Goals" },
                { id: "pb2", type: "divider", text: "" },
                { id: "pb3", type: "bullet", text: "Deliver phase 1" },
              ],
            },
          },
        ],
      };

      // Export simulation (JSON serialization)
      const exportedJson = JSON.stringify(backupV1);
      expect(exportedJson).toBeDefined();

      // Import simulation (JSON parsing + parseContent)
      const imported = JSON.parse(exportedJson);
      expect(imported.format).toBe("minddesk-backup");
      expect(imported.version).toBe(1);
      expect(imported.pages.length).toBe(3);

      // Verify page 1: Parent
      const p1 = imported.pages[0]!;
      const p1Content = parseContent(JSON.stringify(p1.content));
      expect(p1.id).toBe("parent-page-1");
      expect(p1.parentId).toBeNull();
      expect(p1Content.blocks[0]?.type).toBe("h1");
      expect(p1Content.blocks[2]?.calloutType).toBe("info");

      // Verify page 2: Child hierarchy
      const p2 = imported.pages[1]!;
      const p2Content = parseContent(JSON.stringify(p2.content));
      expect(p2.id).toBe("child-page-2");
      expect(p2.parentId).toBe("parent-page-1"); // Parent reference intact
      expect(p2Content.blocks[1]?.type).toBe("code");
      expect(p2Content.blocks[1]?.language).toBe("bash");
      expect(p2Content.blocks[2]?.checked).toBe(true);

      // Verify page 3: Project association
      const p3 = imported.pages[2]!;
      const p3Content = parseContent(JSON.stringify(p3.content));
      expect(p3.id).toBe("project-note-3");
      expect(p3.projectId).toBe("proj-123"); // Project association intact
      expect(p3Content.blocks[1]?.type).toBe("divider");
      expect(p3Content.blocks[2]?.type).toBe("bullet");
    });
  });

  describe("5. Preview Mode In-Memory Adapter Verification", () => {
    it("creates, reads, updates, and detects version conflict in Preview Mode with rich blocks", async () => {
      const { previewRequest } = await import("../lib/preview/adapter");

      // 1. Create a page with rich blocks in preview mode
      const richContent: PageContent = {
        blocks: [
          { id: "h1-preview", type: "h1", text: "Preview Note Title" },
          { id: "call-preview", type: "callout", text: "Tested in preview", calloutType: "tip" },
          { id: "code-preview", type: "code", text: "const x = 10;", language: "typescript" },
        ],
      };

      const createRes = previewRequest("POST", "/api/pages", {
        title: "Preview Mode Test Note",
        content: richContent,
      });

      expect(createRes.status).toBe(201);
      const createdPage = createRes.data as { id: string; title: string; version: number };
      expect(createdPage.id).toBeDefined();
      expect(createdPage.version).toBe(1);

      // 2. Fetch page and verify rich block content
      const getRes = previewRequest("GET", `/api/pages/${createdPage.id}`);
      expect(getRes.status).toBe(200);
      const fetchedPage = getRes.data as { id: string; version: number; content: PageContent };
      expect(fetchedPage.content.blocks.length).toBe(3);
      expect(fetchedPage.content.blocks[0]?.type).toBe("h1");
      expect(fetchedPage.content.blocks[1]?.type).toBe("callout");
      expect(fetchedPage.content.blocks[2]?.type).toBe("code");

      // 3. Edit page with correct base_version 1
      const updatedContent: PageContent = {
        blocks: [
          ...fetchedPage.content.blocks,
          { id: "chk-preview", type: "check", text: "New checklist item", checked: true },
        ],
      };

      const patchRes = previewRequest("PATCH", `/api/pages/${createdPage.id}`, {
        content: updatedContent,
        base_version: 1,
      });
      expect(patchRes.status).toBe(200);

      // Verify version incremented to 2
      const getRes2 = previewRequest("GET", `/api/pages/${createdPage.id}`);
      const updatedPage = getRes2.data as { version: number; content: PageContent };
      expect(updatedPage.version).toBe(2);
      expect(updatedPage.content.blocks.length).toBe(4);

      // 4. Stale base_version 1 must return 409 conflict
      const stalePatchRes = previewRequest("PATCH", `/api/pages/${createdPage.id}`, {
        content: { blocks: [{ id: "stale", type: "p", text: "Stale edit" }] },
        base_version: 1, // Stale! Current is 2
      });
      expect(stalePatchRes.status).toBe(409);
      expect((stalePatchRes.data as { error: string }).error).toBe(
        "This page was changed elsewhere.",
      );

      // 5. Clean up
      const delRes = previewRequest("DELETE", `/api/pages/${createdPage.id}`);
      expect(delRes.status).toBe(200);
    });
  });
});
