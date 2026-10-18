import { describe, it, expect } from "vitest";
import { mindmapToPageContent, pageContentToMindMap } from "@/lib/mindmap-bridge";
import {
  checkStructure,
  makeNode,
  newId,
  type MapDoc,
  type MapLink,
  type MapNode,
} from "@/lib/mindmap-doc";
import { newBlockId, type PageContent } from "@/lib/page-content";
import { previewRequest } from "@/lib/preview/adapter";

describe("Phase 2: Mind Map <-> Notes Two-Way Bridge", () => {
  // =========================================================================
  // Test A: 90-Node Website Sales Process Map -> Note Conversion
  // =========================================================================
  describe("Test A: 90-Node Hierarchical Sales Process Map -> Note", () => {
    it("converts a 90-node hierarchical tree with branches up to depth 5+, node notes, URLs, and checklists", () => {
      const rootId = newId();
      const nodes: MapNode[] = [
        makeNode({
          id: rootId,
          parentId: null,
          title: "Website Sales Process",
          notes: "High-ticket B2B agency sales pipeline\n\nTarget deal size: $10k - $50k",
          link: "https://minddesk.app/sales-playbook",
          x: 0,
          y: 0,
          size: "l",
          color: "blue",
        }),
      ];
      const links: MapLink[] = [];

      // 5 Major Level 1 Branches (Total: 1 + 5 = 6)
      const l1Titles = [
        "1. Lead Generation & Acquisition",
        "2. Discovery & Qualification",
        "3. Solution Architecture & Pitch",
        "4. Commercial Negotiation & Closing",
        "5. Client Onboarding & Handoff",
      ];
      const l1Ids: string[] = [];
      l1Titles.forEach((t, i) => {
        const id = newId();
        l1Ids.push(id);
        nodes.push(
          makeNode({
            id,
            parentId: rootId,
            title: t,
            notes: `Process documentation for ${t}`,
            x: 200,
            y: (i - 2) * 150,
            size: "m",
            color: "green",
          }),
        );
      });

      // Under each L1 branch, add 3 Level 2 sub-branches (Total: 6 + 15 = 21)
      const l2Ids: string[] = [];
      l1Ids.forEach((pId, pIdx) => {
        for (let j = 1; j <= 3; j++) {
          const id = newId();
          l2Ids.push(id);
          nodes.push(
            makeNode({
              id,
              parentId: pId,
              title: `Stage ${pIdx + 1}.${j} Sub-process`,
              notes: j === 1 ? `Critical gate review for stage ${pIdx + 1}` : "",
              link: j === 2 ? "https://minddesk.app/sop/checklist" : "",
              x: 400,
              y: j * 50,
              size: "m",
            }),
          );
        }
      });

      // Under each L2 branch, add 2 Level 3 branches (Total: 21 + 30 = 51)
      const l3Ids: string[] = [];
      l2Ids.forEach((pId, idx) => {
        for (let k = 1; k <= 2; k++) {
          const id = newId();
          l3Ids.push(id);
          nodes.push(
            makeNode({
              id,
              parentId: pId,
              title: `Task Group ${idx + 1}-${k}`,
              x: 600,
              y: k * 40,
              size: "s",
            }),
          );
        }
      });

      // Under first 20 L3 branches, add Level 4 items (some checklists, some bullets) (Total: 51 + 20 = 71)
      const l4Ids: string[] = [];
      l3Ids.slice(0, 20).forEach((pId, idx) => {
        const id = newId();
        l4Ids.push(id);
        const isTask = idx % 2 === 0;
        nodes.push(
          makeNode({
            id,
            parentId: pId,
            title: isTask ? `Action Item ${idx + 1}` : `Reference Material ${idx + 1}`,
            icon: isTask ? "check" : "none",
            textColor: isTask && idx % 4 === 0 ? "muted" : "default",
            x: 800,
            y: idx * 30,
            size: "s",
          }),
        );
      });

      // Under first 19 L4 items, add Level 5 leaf nodes (Total: 71 + 19 = 90)
      l4Ids.slice(0, 19).forEach((pId, idx) => {
        const id = newId();
        nodes.push(
          makeNode({
            id,
            parentId: pId,
            title: `Sub-deliverable ${idx + 1}`,
            icon: idx % 3 === 0 ? "check" : "none",
            x: 1000,
            y: idx * 25,
            size: "s",
          }),
        );
      });

      // Add 2 Cross-connections
      links.push({
        id: newId(),
        source: l1Ids[0]!,
        target: l1Ids[3]!,
      });
      links.push({
        id: newId(),
        source: l2Ids[1]!,
        target: l3Ids[2]!,
      });

      expect(nodes.length).toBe(90);
      const originalJson = JSON.stringify({ layout: "radial", nodes, links });

      // Run conversion
      const result = mindmapToPageContent({ layout: "radial", nodes, links });

      // Assertions
      expect(result.nodeCount).toBe(90);
      expect(result.title).toBe("Website Sales Process");

      // Verify original map was not mutated
      expect(JSON.stringify({ layout: "radial", nodes, links })).toBe(originalJson);

      // Verify Root notes became intro paragraphs
      const pBlocks = result.content.blocks.filter((b) => b.type === "p");
      expect(pBlocks.some((p) => p.text.includes("High-ticket B2B agency sales pipeline"))).toBe(
        true,
      );
      expect(pBlocks.some((p) => p.text.includes("Target deal size: $10k - $50k"))).toBe(true);

      // Verify Level 1 branches are H1
      const h1Blocks = result.content.blocks.filter((b) => b.type === "h1");
      expect(h1Blocks.length).toBe(5);
      expect(h1Blocks[0]?.text).toBe("1. Lead Generation & Acquisition");
      expect(h1Blocks[4]?.text).toBe("5. Client Onboarding & Handoff");

      // Verify Level 2 branches are H2
      const h2Blocks = result.content.blocks.filter((b) => b.type === "h2");
      expect(h2Blocks.length).toBe(15);
      expect(h2Blocks[0]?.text).toBe("Stage 1.1 Sub-process");

      // Verify Level 3 branches are H3
      const h3Blocks = result.content.blocks.filter((b) => b.type === "h3");
      expect(h3Blocks.length).toBe(30);

      // Verify Level 4+ checklists and bullets
      const checkBlocks = result.content.blocks.filter((b) => b.type === "check");
      expect(checkBlocks.length).toBeGreaterThanOrEqual(10);
      // Muted task preserved as checked: true
      expect(checkBlocks.some((c) => c.checked === true)).toBe(true);

      const bulletBlocks = result.content.blocks.filter((b) => b.type === "bullet");
      expect(bulletBlocks.length).toBeGreaterThanOrEqual(10);

      // Verify URL link preservation
      const linkNote = result.content.blocks.find((b) =>
        b.text.includes("[Stage 1.2 Sub-process](https://minddesk.app/sop/checklist)"),
      );
      expect(linkNote).toBeDefined();

      // Verify cross-links captured in a callout block
      const calloutBlocks = result.content.blocks.filter((b) => b.type === "callout");
      expect(calloutBlocks.length).toBeGreaterThanOrEqual(1);
      const crossCallout = calloutBlocks.find((c) => c.text.includes("Related Connections"));
      expect(crossCallout).toBeDefined();
      expect(crossCallout?.text).toContain("1. Lead Generation & Acquisition");
    });
  });

  // =========================================================================
  // Test B: Note -> Mind Map Conversion
  // =========================================================================
  describe("Test B: Structured Note -> Interactive Radial Mind Map", () => {
    it("converts a note with headings, checklists, callouts, and code blocks into an arranged radial mind map", () => {
      const noteTitle = "Engineering Team Roadmap";
      const noteContent: PageContent = {
        blocks: [
          { id: newBlockId(), type: "p", text: "Q3 - Q4 Objectives and deliverables" },
          { id: newBlockId(), type: "h1", text: "Backend Architecture" },
          { id: newBlockId(), type: "p", text: "Migration to clean modular services" },
          { id: newBlockId(), type: "h2", text: "Database Optimization" },
          { id: newBlockId(), type: "bullet", text: "Add MySQL connection pooling" },
          {
            id: newBlockId(),
            type: "check",
            text: "Verify index usage on foreign keys",
            checked: true,
          },
          {
            id: newBlockId(),
            type: "check",
            text: "Audit LongText columns for notes",
            checked: false,
          },
          { id: newBlockId(), type: "h1", text: "Frontend Modernization" },
          {
            id: newBlockId(),
            type: "callout",
            text: "Dark mode contrast must satisfy WCAG AAA",
            calloutType: "tip",
          },
          {
            id: newBlockId(),
            type: "code",
            text: "export const theme = { dark: true };",
            language: "typescript",
          },
          { id: newBlockId(), type: "divider", text: "" },
          { id: newBlockId(), type: "h2", text: "Performance Audits" },
          { id: newBlockId(), type: "number", text: "LCP under 1.2 seconds" },
          { id: newBlockId(), type: "number", text: "Zero layout shifts (CLS = 0)" },
        ],
      };

      const originalNoteJson = JSON.stringify(noteContent);

      const { doc, sourceNodeCount } = pageContentToMindMap(noteTitle, noteContent);

      // Verify original note was not mutated
      expect(JSON.stringify(noteContent)).toBe(originalNoteJson);

      // Validate tree structure
      const structError = checkStructure(doc);
      expect(structError).toBeNull();

      // Check root node
      const root = doc.nodes.find((n) => n.parentId === null);
      expect(root).toBeDefined();
      expect(root?.title).toBe("Engineering Team Roadmap");
      expect(root?.notes).toBe("Q3 - Q4 Objectives and deliverables");
      expect(root?.color).toBe("blue");

      // Verify Level 1 Branches attached to root
      const l1Branches = doc.nodes.filter((n) => n.parentId === root?.id);
      expect(l1Branches.length).toBe(2);
      expect(l1Branches[0]?.title).toBe("Backend Architecture");
      expect(l1Branches[1]?.title).toBe("Frontend Modernization");

      // Verify vibrant branch colors assigned
      expect(l1Branches[0]?.color).not.toBe("default");
      expect(l1Branches[1]?.color).not.toBe("default");
      expect(l1Branches[0]?.color).not.toBe(l1Branches[1]?.color);

      // Check Backend Architecture node has supporting note attached
      expect(l1Branches[0]?.notes).toBe("Migration to clean modular services");

      // Check Database Optimization is nested under Backend Architecture
      const dbOptNode = doc.nodes.find((n) => n.title === "Database Optimization");
      expect(dbOptNode).toBeDefined();
      expect(dbOptNode?.parentId).toBe(l1Branches[0]?.id);

      // Check checklist items under Database Optimization
      const completedTask = doc.nodes.find((n) => n.title === "Verify index usage on foreign keys");
      expect(completedTask).toBeDefined();
      expect(completedTask?.icon).toBe("check");
      expect(completedTask?.textColor).toBe("muted"); // checked state preserved!

      const pendingTask = doc.nodes.find((n) => n.title === "Audit LongText columns for notes");
      expect(pendingTask).toBeDefined();
      expect(pendingTask?.icon).toBe("check");
      expect(pendingTask?.textColor).toBe("default");

      // Check Callout under Frontend Modernization
      const calloutNode = doc.nodes.find((n) => n.title.includes("Dark mode contrast"));
      expect(calloutNode).toBeDefined();
      expect(calloutNode?.color).toBe("amber");
      expect(calloutNode?.icon).toBe("lightbulb");

      // Check Code Block under Frontend Modernization
      const codeNode = doc.nodes.find((n) => n.title.startsWith("Code Snippet"));
      expect(codeNode).toBeDefined();
      expect(codeNode?.notes).toBe("export const theme = { dark: true };");

      // Check non-overlapping coordinates (radial arrangement produced distinct positions)
      const positions = new Set(doc.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`));
      expect(positions.size).toBe(doc.nodes.length);
      expect(sourceNodeCount).toBe(doc.nodes.length);
    });
  });

  // =========================================================================
  // Test C: Round Trip Fidelity
  // =========================================================================
  describe("Test C: Round Trip Fidelity", () => {
    it("Round Trip C1: Mind Map -> Note -> Mind Map preserves structure and titles", () => {
      const rootId = newId();
      const b1Id = newId();
      const b2Id = newId();
      const subId = newId();

      const originalDoc: MapDoc = {
        layout: "radial",
        nodes: [
          makeNode({ id: rootId, parentId: null, title: "Product Launch Strategy", x: 0, y: 0 }),
          makeNode({ id: b1Id, parentId: rootId, title: "Marketing Campaign", x: 200, y: -100 }),
          makeNode({ id: b2Id, parentId: rootId, title: "Tech Readiness", x: 200, y: 100 }),
          makeNode({
            id: subId,
            parentId: b1Id,
            title: "Launch Checklist",
            icon: "check",
            textColor: "muted",
            x: 400,
            y: -100,
          }),
        ],
        links: [],
      };

      // 1. Mind Map -> Note
      const note = mindmapToPageContent(originalDoc);
      expect(note.title).toBe("Product Launch Strategy");
      expect(note.content.blocks.length).toBeGreaterThanOrEqual(3);

      // 2. Note -> Mind Map
      const roundTripDoc = pageContentToMindMap(note.title, note.content).doc;

      // Assertions
      const structErr = checkStructure(roundTripDoc);
      expect(structErr).toBeNull();

      const rtTitles = roundTripDoc.nodes.map((n) => n.title);
      expect(rtTitles).toContain("Product Launch Strategy");
      expect(rtTitles).toContain("Marketing Campaign");
      expect(rtTitles).toContain("Tech Readiness");
      expect(rtTitles).toContain("Launch Checklist");

      const rtTask = roundTripDoc.nodes.find((n) => n.title === "Launch Checklist");
      expect(rtTask?.icon).toBe("check");
      expect(rtTask?.textColor).toBe("muted");
    });

    it("Round Trip C2: Note -> Mind Map -> Note preserves content blocks and code", () => {
      const noteTitle = "Infrastructure Blueprint";
      const initialContent: PageContent = {
        blocks: [
          { id: newBlockId(), type: "h1", text: "Production Cluster" },
          { id: newBlockId(), type: "p", text: "High availability setup across 3 regions" },
          { id: newBlockId(), type: "h2", text: "Monitoring & Alerts" },
          { id: newBlockId(), type: "check", text: "Prometheus alerts configured", checked: true },
          {
            id: newBlockId(),
            type: "code",
            text: "docker run -d --restart=always -p 9090:9090 prom/prometheus",
            language: "bash",
          },
        ],
      };

      // 1. Note -> Mind Map
      const mapRes = pageContentToMindMap(noteTitle, initialContent);
      expect(checkStructure(mapRes.doc)).toBeNull();

      // 2. Mind Map -> Note
      const noteRes = mindmapToPageContent(mapRes.doc);
      expect(noteRes.title).toBe("Infrastructure Blueprint");

      const types = noteRes.content.blocks.map((b) => b.type);
      expect(types).toContain("h1");
      expect(types).toContain("p");
      expect(types).toContain("h2");
      expect(types).toContain("check");
      expect(types).toContain("code");

      const codeBlock = noteRes.content.blocks.find((b) => b.type === "code");
      expect(codeBlock?.text).toBe("docker run -d --restart=always -p 9090:9090 prom/prometheus");
      expect(codeBlock?.language).toBe("bash");

      const checkBlock = noteRes.content.blocks.find((b) => b.type === "check");
      expect(checkBlock?.checked).toBe(true);
    });
  });

  // =========================================================================
  // Test D: Edge Cases & Robustness
  // =========================================================================
  describe("Test D: Edge Cases & Extreme Inputs", () => {
    it("handles an empty note with 0 blocks gracefully", () => {
      const { doc } = pageContentToMindMap("Empty Note", { blocks: [] });
      expect(doc.nodes.length).toBe(1);
      expect(doc.nodes[0]?.title).toBe("Empty Note");
      expect(doc.nodes[0]?.parentId).toBeNull();
      expect(checkStructure(doc)).toBeNull();
    });

    it("handles an empty mind map with 0 nodes gracefully", () => {
      const emptyDoc: MapDoc = { layout: "radial", nodes: [], links: [] };
      const note = mindmapToPageContent(emptyDoc, "My Fallback");
      expect(note.title).toBe("My Fallback");
      expect(note.content.blocks.length).toBe(1);
      expect(note.content.blocks[0]?.type).toBe("p");
    });

    it("handles long titles exceeding 200 characters without crashing or throwing", () => {
      const longTitle = "A".repeat(250);
      const noteContent: PageContent = {
        blocks: [{ id: newBlockId(), type: "h1", text: longTitle }],
      };
      const { doc } = pageContentToMindMap("Long Note", noteContent);
      const h1Node = doc.nodes.find((n) => n.parentId !== null);
      expect(h1Node?.title.length).toBe(200);
      expect(checkStructure(doc)).toBeNull();
    });

    it("handles deeply nested list items (depth 6+) with preserved indentation", () => {
      const noteContent: PageContent = {
        blocks: [
          { id: newBlockId(), type: "h1", text: "Deep Tree" },
          { id: newBlockId(), type: "bullet", text: "Level 1 List" },
          { id: newBlockId(), type: "bullet", text: "  Level 2 List" },
          { id: newBlockId(), type: "bullet", text: "    Level 3 List" },
          { id: newBlockId(), type: "bullet", text: "      Level 4 List" },
        ],
      };

      const { doc } = pageContentToMindMap("Nested List Note", noteContent);
      expect(checkStructure(doc)).toBeNull();

      // Check hierarchy chain: each indented level has parent set to preceding item
      const n1 = doc.nodes.find((n) => n.title === "Level 1 List");
      const n2 = doc.nodes.find((n) => n.title === "Level 2 List");
      const n3 = doc.nodes.find((n) => n.title === "Level 3 List");
      const n4 = doc.nodes.find((n) => n.title === "Level 4 List");

      expect(n1).toBeDefined();
      expect(n2?.parentId).toBe(n1?.id);
      expect(n3?.parentId).toBe(n2?.id);
      expect(n4?.parentId).toBe(n3?.id);
    });

    it("handles skipped heading levels (H1 directly to H3 without H2)", () => {
      const noteContent: PageContent = {
        blocks: [
          { id: newBlockId(), type: "h1", text: "Main Section" },
          { id: newBlockId(), type: "h3", text: "Skipped H2 Subtopic" },
        ],
      };
      const { doc } = pageContentToMindMap("Skipped Headings", noteContent);
      expect(checkStructure(doc)).toBeNull();

      const mainNode = doc.nodes.find((n) => n.title === "Main Section");
      const subNode = doc.nodes.find((n) => n.title === "Skipped H2 Subtopic");
      expect(subNode?.parentId).toBe(mainNode?.id);
    });

    it("handles document with NO headings (only paragraphs and checklists)", () => {
      const noteContent: PageContent = {
        blocks: [
          { id: newBlockId(), type: "p", text: "Brainstorm Idea 1" },
          { id: newBlockId(), type: "p", text: "Brainstorm Idea 2" },
          { id: newBlockId(), type: "check", text: "Call accountant", checked: false },
        ],
      };
      const { doc } = pageContentToMindMap("Scratchpad", noteContent);
      expect(checkStructure(doc)).toBeNull();
      // All 3 items should attach directly to root
      const root = doc.nodes.find((n) => n.parentId === null);
      const children = doc.nodes.filter((n) => n.parentId === root?.id);
      expect(children.length).toBe(3);
    });

    it("preserves Unicode, emojis, and special characters", () => {
      const unicodeTitle = "🚀 MindDesk v2.0 & «Notes» — 100% Works!";
      const noteContent: PageContent = {
        blocks: [
          { id: newBlockId(), type: "h1", text: "Features: 🌟 Visuals & 💡 Insights" },
          { id: newBlockId(), type: "check", text: "Support café & résumé syntax", checked: true },
        ],
      };

      const { doc } = pageContentToMindMap(unicodeTitle, noteContent);
      expect(doc.nodes[0]?.title).toBe(unicodeTitle);

      const note = mindmapToPageContent(doc);
      expect(note.title).toBe(unicodeTitle);
      expect(note.content.blocks.some((b) => b.text.includes("🌟 Visuals & 💡 Insights"))).toBe(
        true,
      );
      expect(note.content.blocks.some((b) => b.text.includes("Support café & résumé syntax"))).toBe(
        true,
      );
    });
  });

  // =========================================================================
  // Test E: Preview Mode & API Persistence Round Trip
  // =========================================================================
  describe("Test E: Preview Mode API Persistence Verification", () => {
    it("simulates Mind Map -> Note export and Note -> Mind Map visualization via Preview API", async () => {
      // 1. Create a Mind Map in Preview Mode
      const initialMapDoc: MapDoc = {
        layout: "radial",
        nodes: [
          makeNode({
            id: "root-sim",
            parentId: null,
            title: "Simulated Mind Map",
            notes: "Introductory notes from canvas",
            x: 0,
            y: 0,
          }),
          makeNode({
            id: "branch-sim-1",
            parentId: "root-sim",
            title: "Feature One",
            x: 200,
            y: 0,
          }),
        ],
        links: [],
      };

      const mapPostRes = previewRequest("POST", "/api/mind-maps", {
        title: "Simulated Mind Map",
        data: initialMapDoc,
      });
      expect(mapPostRes.status).toBe(201);
      const createdMap = mapPostRes.data as { id: string; version: number };
      expect(createdMap.id).toBeDefined();

      // 2. Perform Mind Map -> Note conversion and persist via POST /api/pages
      const { title: noteTitle, content: noteContent } = mindmapToPageContent(initialMapDoc);
      const pagePostRes = previewRequest("POST", "/api/pages", {
        title: noteTitle,
        content: noteContent,
      });
      expect(pagePostRes.status).toBe(201);
      const createdPage = pagePostRes.data as { id: string; version: number };
      expect(createdPage.id).toBeDefined();

      // 3. Fetch created page and verify persistence
      const pageGetRes = previewRequest("GET", `/api/pages/${createdPage.id}`);
      expect(pageGetRes.status).toBe(200);
      const fetchedPage = pageGetRes.data as { title: string; content: PageContent };
      expect(fetchedPage.title).toBe("Simulated Mind Map");
      expect(fetchedPage.content.blocks.length).toBeGreaterThanOrEqual(2);

      // 4. Perform Note -> Mind Map conversion and persist via POST /api/mind-maps
      const { doc: visualMapDoc } = pageContentToMindMap(fetchedPage.title, fetchedPage.content);
      const mapPostRes2 = previewRequest("POST", "/api/mind-maps", {
        title: fetchedPage.title,
        data: visualMapDoc,
      });
      expect(mapPostRes2.status).toBe(201);
      const createdMap2 = mapPostRes2.data as { id: string };

      // 5. Fetch visual mind map and verify
      const mapGetRes2 = previewRequest("GET", `/api/mind-maps/${createdMap2.id}`);
      expect(mapGetRes2.status).toBe(200);
      const fetchedMap2 = mapGetRes2.data as { data: MapDoc };
      expect(checkStructure(fetchedMap2.data)).toBeNull();

      // 6. Verify original mind map was completely untouched
      const origMapGetRes = previewRequest("GET", `/api/mind-maps/${createdMap.id}`);
      expect(origMapGetRes.status).toBe(200);
      const origMapData = (origMapGetRes.data as { data: MapDoc }).data;
      expect(origMapData.nodes.length).toBe(2);
      expect(origMapData.nodes[0]?.title).toBe("Simulated Mind Map");
    });
  });
});
