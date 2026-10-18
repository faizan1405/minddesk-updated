import { describe, expect, it } from "vitest";
import {
  TEMPLATES,
  getNormalizedMindMapDoc,
  type TemplateCategory,
} from "@/lib/templates/template-definitions";
import { ContentSchema } from "@/lib/page-content";
import { DocSchema, checkStructure } from "@/lib/mindmap-doc";

describe("Template Library Definitions & Normalization", () => {
  it("defines exactly 18 built-in templates across 4 categories", () => {
    expect(TEMPLATES).toHaveLength(18);

    const counts: Record<TemplateCategory, number> = {
      notes: 0,
      tasks: 0,
      projects: 0,
      "mind-maps": 0,
    };

    for (const t of TEMPLATES) {
      counts[t.category]++;
    }

    expect(counts.notes).toBe(5);
    expect(counts.tasks).toBe(4);
    expect(counts.projects).toBe(4);
    expect(counts["mind-maps"]).toBe(5);
  });

  it("contains all required metadata for every template", () => {
    const seenIds = new Set<string>();
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(seenIds.has(t.id)).toBe(false);
      seenIds.add(t.id);

      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
      expect(t.tags.length).toBeGreaterThan(0);
      expect(t.icon.trim().length).toBeGreaterThan(0);
      expect(t.color.trim().length).toBeGreaterThan(0);
      expect(t.previewSummary.trim().length).toBeGreaterThan(0);
    }
  });

  describe("Notes Templates", () => {
    it("has valid, well-formed PageContent blocks for every note template", () => {
      const noteTemplates = TEMPLATES.filter((t) => t.category === "notes");
      expect(noteTemplates).toHaveLength(5);

      const expectedTitles = [
        "Meeting Notes",
        "Daily Journal",
        "Weekly Review",
        "Sales Call Notes",
        "Brainstorming Notes",
      ];
      expect(noteTemplates.map((t) => t.title)).toEqual(expect.arrayContaining(expectedTitles));

      for (const t of noteTemplates) {
        expect(t.noteContent).toBeDefined();
        const parsed = ContentSchema.safeParse(t.noteContent);
        expect(parsed.success).toBe(true);
        expect(t.noteContent!.blocks.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe("Tasks Templates", () => {
    it("has structured task lists and subtasks for every task template", () => {
      const taskTemplates = TEMPLATES.filter((t) => t.category === "tasks");
      expect(taskTemplates).toHaveLength(4);

      const expectedTitles = [
        "Daily Priorities",
        "Weekly Planning",
        "Client Follow-Up Checklist",
        "Project Launch Checklist",
      ];
      expect(taskTemplates.map((t) => t.title)).toEqual(expect.arrayContaining(expectedTitles));

      for (const t of taskTemplates) {
        expect(t.taskData).toBeDefined();
        expect(t.taskData!.defaultListName.trim().length).toBeGreaterThan(0);
        expect(t.taskData!.tasks.length).toBeGreaterThanOrEqual(4);

        let totalSubtasks = 0;
        for (const task of t.taskData!.tasks) {
          expect(task.title.trim().length).toBeGreaterThan(0);
          if (task.subtasks) totalSubtasks += task.subtasks.length;
        }
        expect(totalSubtasks).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe("Projects Templates", () => {
    it("has structured pages and subpages with valid blocks for every project template", () => {
      const projectTemplates = TEMPLATES.filter((t) => t.category === "projects");
      expect(projectTemplates).toHaveLength(4);

      const expectedTitles = [
        "Website Development Project",
        "Client Onboarding",
        "Marketing Campaign",
        "Personal Goal Tracker",
      ];
      expect(projectTemplates.map((t) => t.title)).toEqual(expect.arrayContaining(expectedTitles));

      for (const t of projectTemplates) {
        expect(t.projectData).toBeDefined();
        expect(t.projectData!.defaultProjectTitle.trim().length).toBeGreaterThan(0);
        expect(t.projectData!.pages.length).toBeGreaterThanOrEqual(4);

        for (const page of t.projectData!.pages) {
          expect(page.title.trim().length).toBeGreaterThan(0);
          expect(ContentSchema.safeParse(page.content).success).toBe(true);

          if (page.subpages) {
            for (const sub of page.subpages) {
              expect(sub.title.trim().length).toBeGreaterThan(0);
              expect(ContentSchema.safeParse(sub.content).success).toBe(true);
            }
          }
        }
      }
    });
  });

  describe("Mind Maps Templates", () => {
    it("normalizes into valid MapDocs satisfying DocSchema and structure rules", () => {
      const mapTemplates = TEMPLATES.filter((t) => t.category === "mind-maps");
      expect(mapTemplates).toHaveLength(5);

      const expectedTitles = [
        "Sales Process",
        "Business Strategy",
        "Goal Planning",
        "SWOT Analysis",
        "Learning Roadmap",
      ];
      expect(mapTemplates.map((t) => t.title)).toEqual(expect.arrayContaining(expectedTitles));

      for (const t of mapTemplates) {
        expect(t.mindMapHierarchy).toBeDefined();
        const doc = getNormalizedMindMapDoc(t);

        // Verify with Zod DocSchema
        const parsed = DocSchema.safeParse(doc);
        expect(parsed.success).toBe(true);

        // Check structural integrity: 1 root, no cycles, valid links
        const structError = checkStructure(doc);
        expect(structError).toBeNull();

        // Must have at least 10 nodes and multiple branches
        expect(doc.nodes.length).toBeGreaterThanOrEqual(10);
        const roots = doc.nodes.filter((n) => n.parentId === null);
        expect(roots).toHaveLength(1);
        expect(roots[0]!.title).toBe(t.title);

        // All nodes have valid coordinates and non-empty titles
        for (const n of doc.nodes) {
          expect(Number.isFinite(n.x)).toBe(true);
          expect(Number.isFinite(n.y)).toBe(true);
          expect(n.title.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });
});
