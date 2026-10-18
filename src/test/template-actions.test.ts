import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applyNoteTemplate,
  applyTaskTemplate,
  applyProjectTemplate,
  applyMindMapTemplate,
} from "@/lib/templates/template-actions";
import { TEMPLATES } from "@/lib/templates/template-definitions";
import * as apiClient from "@/lib/api-client";

describe("Template Application Actions", () => {
  const apiSpy = vi.spyOn(apiClient, "api");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyNoteTemplate", () => {
    it("creates note page with title and content blocks", async () => {
      const template = TEMPLATES.find((t) => t.category === "notes")!;
      apiSpy.mockResolvedValueOnce({ id: "note-123", title: "Custom Meeting Note" });

      const result = await applyNoteTemplate(template, "Custom Meeting Note");

      expect(apiSpy).toHaveBeenCalledWith("/api/pages", {
        method: "POST",
        body: {
          title: "Custom Meeting Note",
          content: template.noteContent,
        },
      });

      expect(result).toEqual({
        type: "notes",
        id: "note-123",
        url: "/notes/note-123",
      });
    });

    it("falls back to template title if custom title is not provided", async () => {
      const template = TEMPLATES.find((t) => t.id === "note-daily-journal")!;
      apiSpy.mockResolvedValueOnce({ id: "note-journal-1" });

      await applyNoteTemplate(template);

      expect(apiSpy).toHaveBeenCalledWith("/api/pages", {
        method: "POST",
        body: {
          title: "Daily Journal",
          content: template.noteContent,
        },
      });
    });
  });

  describe("applyTaskTemplate", () => {
    it("creates a new task list and adds tasks with subtasks", async () => {
      const template = TEMPLATES.find((t) => t.id === "task-daily-priorities")!;

      // 1. mock list creation
      apiSpy.mockResolvedValueOnce({ id: "list-new-1", title: "My Custom List" });

      // Mock task creations
      apiSpy.mockImplementation(async (endpoint: string) => {
        if (endpoint === "/api/task-lists") return { id: "list-new-1" };
        if (endpoint === "/api/tasks") return { id: `task-${Math.random()}` };
        return {};
      });

      const result = await applyTaskTemplate(template, {
        listMode: "new",
        newListName: "My Custom List",
      });

      expect(result).toEqual({
        type: "tasks",
        id: "list-new-1",
        url: "/lists/list-new-1",
      });

      // Verify list was created
      expect(apiSpy).toHaveBeenCalledWith("/api/task-lists", {
        method: "POST",
        body: { title: "My Custom List" },
      });

      // Verify multiple tasks were added
      expect(apiSpy.mock.calls.filter((c) => c[0] === "/api/tasks").length).toBeGreaterThanOrEqual(
        4,
      );
    });

    it("adds tasks to an existing list without creating a new list", async () => {
      const template = TEMPLATES.find((t) => t.category === "tasks")!;

      apiSpy.mockImplementation(async (endpoint: string) => {
        if (endpoint === "/api/tasks") return { id: `task-${Math.random()}` };
        return {};
      });

      const result = await applyTaskTemplate(template, {
        listMode: "existing",
        listId: "existing-list-456",
      });

      expect(result).toEqual({
        type: "tasks",
        id: "existing-list-456",
        url: "/lists/existing-list-456",
      });

      // Should NOT have called /api/task-lists
      expect(apiSpy.mock.calls.some((c) => c[0] === "/api/task-lists")).toBe(false);
      // All tasks should have list_id set to existing-list-456
      const taskCalls = apiSpy.mock.calls.filter((c) => c[0] === "/api/tasks");
      for (const call of taskCalls) {
        expect((call[1] as { body: { list_id: string } }).body.list_id).toBe("existing-list-456");
      }
    });
  });

  describe("applyProjectTemplate", () => {
    it("creates a project and its pages and subpages with structured content", async () => {
      const template = TEMPLATES.find((t) => t.id === "project-website-development")!;

      apiSpy.mockImplementation(async (endpoint: string) => {
        if (endpoint === "/api/projects") return { id: "proj-web-1", title: "Client Website" };
        if (endpoint === "/api/pages") return { id: `page-${Math.random()}` };
        return {};
      });

      const result = await applyProjectTemplate(template, "Client Website");

      expect(result).toEqual({
        type: "projects",
        id: "proj-web-1",
        url: "/projects/proj-web-1",
      });

      expect(apiSpy).toHaveBeenCalledWith("/api/projects", {
        method: "POST",
        body: { title: "Client Website" },
      });

      const pageCalls = apiSpy.mock.calls.filter((c) => c[0] === "/api/pages");
      expect(pageCalls.length).toBeGreaterThanOrEqual(5);
      for (const call of pageCalls) {
        expect((call[1] as { body: { project_id: string } }).body.project_id).toBe("proj-web-1");
      }
    });
  });

  describe("applyMindMapTemplate", () => {
    it("creates a normalized Mind Map with arranged doc data", async () => {
      const template = TEMPLATES.find((t) => t.id === "mindmap-sales-process")!;

      apiSpy.mockResolvedValueOnce({ id: "map-sales-1", title: "Acme Sales Process" });

      const result = await applyMindMapTemplate(template, "Acme Sales Process");

      expect(result).toEqual({
        type: "mind-maps",
        id: "map-sales-1",
        url: "/mind-maps/map-sales-1",
      });

      expect(apiSpy).toHaveBeenCalledWith("/api/mind-maps", {
        method: "POST",
        body: expect.objectContaining({
          title: "Acme Sales Process",
          data: expect.objectContaining({
            layout: "radial",
            nodes: expect.any(Array),
            links: expect.any(Array),
          }),
        }),
      });
    });
  });
});
