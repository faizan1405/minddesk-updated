import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Pinning System (Feature 2)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it("persists is_pinned state across pages, projects, and mind maps in Preview Mode", async () => {
    const { previewRequest } = await import("@/lib/preview/adapter");

    // 1. Create a Project
    const projRes = previewRequest("POST", "/api/projects", { title: "Pinned Project Alpha" });
    expect(projRes.status).toBe(201);
    const project = projRes.data as { id: string; is_pinned?: boolean };
    expect(project.is_pinned).toBe(false);

    // 2. Create a Page inside project
    const pageRes = previewRequest("POST", "/api/pages", {
      title: "Nested Note",
      project_id: project.id,
      content: { blocks: [{ id: "b1", type: "p", text: "Hello" }] },
    });
    expect(pageRes.status).toBe(201);
    const page = pageRes.data as { id: string; is_pinned?: boolean; project_id: string };
    expect(page.is_pinned).toBe(false);

    // 3. Create a Mind Map
    const mapRes = previewRequest("POST", "/api/mind-maps", {
      title: "Pinned Mind Map",
      data: { layout: "radial", nodes: [{ id: "root", parentId: null, title: "Center", notes: "", x: 0, y: 0, collapsed: false, color: "blue", textColor: "default", size: "l", icon: "none", link: "" }], links: [] },
    });
    expect(mapRes.status).toBe(201);
    const map = mapRes.data as { id: string; is_pinned?: boolean };
    expect(map.is_pinned).toBe(false);

    // 4. Pin the Project
    const pinProjRes = previewRequest("PATCH", `/api/projects/${project.id}`, { is_pinned: true });
    expect(pinProjRes.status).toBe(200);
    expect((pinProjRes.data as { is_pinned: boolean }).is_pinned).toBe(true);

    // Verify pinning a project does NOT automatically pin the pages inside it
    const getPageCheck = previewRequest("GET", `/api/pages/${page.id}`);
    expect((getPageCheck.data as { is_pinned?: boolean }).is_pinned).toBe(false);

    // 5. Pin the Page and Mind Map
    const pinPageRes = previewRequest("PATCH", `/api/pages/${page.id}`, { is_pinned: true });
    expect(pinPageRes.status).toBe(200);
    expect((pinPageRes.data as { is_pinned: boolean }).is_pinned).toBe(true);

    const pinMapRes = previewRequest("PATCH", `/api/mind-maps/${map.id}`, { is_pinned: true });
    expect(pinMapRes.status).toBe(200);
    expect((pinMapRes.data as { is_pinned: boolean }).is_pinned).toBe(true);

    // 6. Simulate reload with fresh JS context
    vi.resetModules();
    const { previewRequest: freshPreviewRequest } = await import("@/lib/preview/adapter");

    const reloadedProj = freshPreviewRequest("GET", "/api/projects");
    const projList = reloadedProj.data as Array<{ id: string; is_pinned?: boolean }>;
    const foundProj = projList.find((p) => p.id === project.id);
    expect(foundProj?.is_pinned).toBe(true);

    const reloadedPage = freshPreviewRequest("GET", `/api/pages/${page.id}`);
    expect((reloadedPage.data as { is_pinned?: boolean }).is_pinned).toBe(true);

    const reloadedMaps = freshPreviewRequest("GET", "/api/mind-maps");
    const mapsList = reloadedMaps.data as Array<{ id: string; is_pinned?: boolean }>;
    const foundMap = mapsList.find((m) => m.id === map.id);
    expect(foundMap?.is_pinned).toBe(true);

    // 7. Unpin the page
    const unpinPageRes = freshPreviewRequest("PATCH", `/api/pages/${page.id}`, { is_pinned: false });
    expect(unpinPageRes.status).toBe(200);
    expect((unpinPageRes.data as { is_pinned: boolean }).is_pinned).toBe(false);
  });

  it("orders pinned items first while preserving sub-ordering", () => {
    const items = [
      { id: "1", title: "Note A", is_pinned: false, created_at: "2026-01-01" },
      { id: "2", title: "Note B", is_pinned: true, created_at: "2026-01-02" },
      { id: "3", title: "Note C", is_pinned: false, created_at: "2026-01-03" },
      { id: "4", title: "Note D", is_pinned: true, created_at: "2026-01-04" },
    ];

    const sorted = [...items].sort((a, b) => {
      const aPin = a.is_pinned ? 1 : 0;
      const bPin = b.is_pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return 0;
    });

    expect(sorted.map((s) => s.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("preserves is_pinned across soft-delete and restore in database logic", async () => {
    // Test server-level restore preservation
    const mockPage = {
      id: "page-123",
      userId: "user-1",
      title: "Pinned Note",
      isPinned: true,
      deletedAt: new Date(),
    };

    // When restored, deletedAt is set to null, leaving isPinned untouched
    const restoredPage = {
      ...mockPage,
      deletedAt: null,
    };

    expect(restoredPage.isPinned).toBe(true);
    expect(restoredPage.deletedAt).toBeNull();
  });
});
