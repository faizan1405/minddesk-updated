import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Preview Mode SessionStorage Persistence (Fresh JS Context Reload)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it("persists notes and mind maps across a fresh JavaScript context reload via sessionStorage", async () => {
    // 1. Initial module load in current JS context
    const { previewRequest } = await import("@/lib/preview/adapter");

    // 2. Create a Note with rich content
    const noteContent = {
      blocks: [
        { id: "b1", type: "h1", text: "Architecture Guidelines" },
        { id: "b2", type: "check", text: "Verify sessionStorage persistence", checked: true },
      ],
    };
    const createNoteRes = previewRequest("POST", "/api/pages", {
      title: "Architecture Guidelines",
      content: noteContent,
    });
    expect(createNoteRes.status).toBe(201);
    const createdNote = createNoteRes.data as { id: string };
    expect(createdNote.id).toBeDefined();

    // 3. Create a Mind Map
    const mapData = {
      layout: "radial",
      nodes: [
        {
          id: "root-1",
          parentId: null,
          title: "System Design",
          notes: "Core topology",
          x: 0,
          y: 0,
          collapsed: false,
          color: "blue",
          textColor: "default",
          size: "l",
          icon: "none",
          link: "",
        },
        {
          id: "child-1",
          parentId: "root-1",
          title: "Database Cluster",
          notes: "",
          x: 200,
          y: 0,
          collapsed: false,
          color: "green",
          textColor: "default",
          size: "m",
          icon: "none",
          link: "",
        },
      ],
      links: [],
    };
    const createMapRes = previewRequest("POST", "/api/mind-maps", {
      title: "System Design",
      data: mapData,
    });
    expect(createMapRes.status).toBe(201);
    const createdMap = createMapRes.data as { id: string };
    expect(createdMap.id).toBeDefined();

    // 4. REGRESSION ASSERTION: Verify sessionStorage write actually occurred
    const rawStorage = window.sessionStorage.getItem("md_preview_db");
    expect(rawStorage).not.toBeNull();
    const parsedStorage = JSON.parse(rawStorage!);
    expect(parsedStorage.pages.some((p: { id: string }) => p.id === createdNote.id)).toBe(true);
    expect(parsedStorage.maps.some((m: { id: string }) => m.id === createdMap.id)).toBe(true);

    // 5. Simulate a genuine browser reload with a fresh JavaScript context
    vi.resetModules();
    const { previewRequest: freshPreviewRequest } = await import("@/lib/preview/adapter");

    // 6. Verify Note survived the fresh JS context reload
    const getNoteRes = freshPreviewRequest("GET", `/api/pages/${createdNote.id}`);
    expect(getNoteRes.status).toBe(200);
    const loadedNote = getNoteRes.data as { title: string; content: typeof noteContent };
    expect(loadedNote.title).toBe("Architecture Guidelines");
    expect(loadedNote.content.blocks.length).toBe(2);
    expect(loadedNote.content.blocks[0]?.text).toBe("Architecture Guidelines");
    expect(loadedNote.content.blocks[1]?.text).toBe("Verify sessionStorage persistence");

    // 7. Verify Mind Map survived the fresh JS context reload
    const getMapRes = freshPreviewRequest("GET", `/api/mind-maps/${createdMap.id}`);
    expect(getMapRes.status).toBe(200);
    const loadedMap = getMapRes.data as { title: string; data: typeof mapData };
    expect(loadedMap.title).toBe("System Design");
    expect(loadedMap.data.nodes.length).toBe(2);
    expect(loadedMap.data.nodes[1]?.title).toBe("Database Cluster");

    // 8. Verify updates in the fresh context also persist to subsequent reloads
    const patchRes = freshPreviewRequest("PATCH", `/api/pages/${createdNote.id}`, {
      title: "Architecture Guidelines (Updated)",
    });
    expect(patchRes.status).toBe(200);

    // Reload JS context again
    vi.resetModules();
    const { previewRequest: reloadedPreviewRequest } = await import("@/lib/preview/adapter");
    const getUpdatedNoteRes = reloadedPreviewRequest("GET", `/api/pages/${createdNote.id}`);
    expect(getUpdatedNoteRes.status).toBe(200);
    expect((getUpdatedNoteRes.data as { title: string }).title).toBe(
      "Architecture Guidelines (Updated)",
    );
  });

  it("fails to find documents after reload if sessionStorage was cleared or write failed", async () => {
    const { previewRequest } = await import("@/lib/preview/adapter");
    const res = previewRequest("POST", "/api/pages", {
      title: "Transient Note",
      content: { blocks: [] },
    });
    const noteId = (res.data as { id: string }).id;

    // Simulate clearing storage (or simulating missing setItem)
    window.sessionStorage.clear();

    vi.resetModules();
    const { previewRequest: freshPreviewRequest } = await import("@/lib/preview/adapter");
    const getRes = freshPreviewRequest("GET", `/api/pages/${noteId}`);
    expect(getRes.status).toBe(404);
  });
});
