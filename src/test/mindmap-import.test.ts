import { describe, expect, it } from "vitest";
import { parseMindMapJson, normalizeMindMapImport } from "@/lib/mindmap-import";
import { DocSchema, checkStructure, MAX_NODES, type MapDoc } from "@/lib/mindmap-doc";

describe("Mind Map JSON Import Normalization", () => {
  // 1. Native MindDesk JSON
  describe("Format A: Native MindDesk JSON", () => {
    it("imports native MindDesk export with envelope", () => {
      const nativeExport = {
        format: "minddesk-mindmap",
        version: 1,
        title: "Product Roadmap",
        map: {
          layout: "radial",
          nodes: [
            {
              id: "root-1",
              parentId: null,
              title: "Product Roadmap",
              x: 10,
              y: 20,
              collapsed: false,
              color: "blue",
              textColor: "default",
              size: "l",
              icon: "star",
              notes: "Main roadmap document",
              link: "https://example.com",
            },
            {
              id: "child-1",
              parentId: "root-1",
              title: "Q1 Launch",
              x: 200,
              y: 50,
              collapsed: false,
              color: "green",
              textColor: "default",
              size: "m",
              icon: "flag",
              notes: "Sprint 1 to 6",
              link: "",
            },
          ],
          links: [],
        },
      };

      const result = normalizeMindMapImport(nativeExport);
      expect(result.detectedFormat).toBe("native");
      expect(result.title).toBe("Product Roadmap");
      expect(result.doc.nodes).toHaveLength(2);
      expect(result.doc.nodes[0]!.title).toBe("Product Roadmap");
      expect(result.doc.nodes[1]!.title).toBe("Q1 Launch");
      expect(result.doc.nodes[1]!.parentId).toBe(result.doc.nodes[0]!.id);
      // Preserves existing non-zero coordinates
      expect(result.doc.nodes[0]!.x).toBe(10);
      expect(result.doc.nodes[0]!.y).toBe(20);
      expect(result.doc.nodes[1]!.x).toBe(200);
      expect(result.doc.nodes[1]!.y).toBe(50);
      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("imports raw MapDoc without export envelope", () => {
      const rawDoc: MapDoc = {
        layout: "down",
        nodes: [
          {
            id: "root-doc",
            parentId: null,
            title: "Org Chart",
            x: 0,
            y: 0,
            collapsed: false,
            color: "blue",
            textColor: "default",
            size: "l",
            icon: "none",
            notes: "",
            link: "",
          },
          {
            id: "eng-lead",
            parentId: "root-doc",
            title: "VP Engineering",
            x: 0,
            y: 100,
            collapsed: false,
            color: "teal",
            textColor: "default",
            size: "m",
            icon: "none",
            notes: "",
            link: "",
          },
        ],
        links: [],
      };

      const result = normalizeMindMapImport(rawDoc, "Fallback Org");
      expect(result.detectedFormat).toBe("native");
      expect(result.title).toBe("Org Chart");
      expect(result.doc.nodes).toHaveLength(2);
      expect(checkStructure(result.doc)).toBeNull();
    });
  });

  // 2. Simple AI-generated hierarchical JSON (ChatGPT)
  describe("Format B: AI-generated Hierarchical JSON", () => {
    it("imports the exact ChatGPT example from the specification", () => {
      const chatGptExample = {
        title: "Sales Process",
        root: {
          title: "Sales Process",
          children: [
            {
              title: "Lead Generation",
              children: [{ title: "Meta Ads" }, { title: "Referrals" }],
            },
            {
              title: "Closing",
              children: [{ title: "Negotiation" }, { title: "Payment" }],
            },
          ],
        },
      };

      const result = normalizeMindMapImport(chatGptExample);
      expect(result.detectedFormat).toBe("hierarchical");
      expect(result.title).toBe("Sales Process");
      expect(result.doc.nodes).toHaveLength(7);

      const root = result.doc.nodes.find((n) => n.parentId === null);
      expect(root).toBeDefined();
      expect(root!.title).toBe("Sales Process");

      const rootChildren = result.doc.nodes.filter((n) => n.parentId === root!.id);
      expect(rootChildren).toHaveLength(2);
      const leadGen = rootChildren.find((n) => n.title === "Lead Generation");
      const closing = rootChildren.find((n) => n.title === "Closing");
      expect(leadGen).toBeDefined();
      expect(closing).toBeDefined();

      const leadGenChildren = result.doc.nodes.filter((n) => n.parentId === leadGen!.id);
      expect(leadGenChildren.map((c) => c.title).sort()).toEqual(["Meta Ads", "Referrals"]);

      const closingChildren = result.doc.nodes.filter((n) => n.parentId === closing!.id);
      expect(closingChildren.map((c) => c.title).sort()).toEqual(["Negotiation", "Payment"]);

      // Verify layout generated positions
      expect(root!.x).toBeDefined();
      expect(root!.y).toBeDefined();
      expect(leadGen!.x).not.toBe(closing!.x);

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("imports hierarchical JSON without root wrapper and with aliases (name, subtopics)", () => {
      const aliased = {
        name: "Website Redesign",
        subtopics: [
          {
            name: "Design System",
            color: "purple",
            subtopics: [{ name: "Typography" }, { name: "Color Palette" }],
          },
          {
            name: "Backend API",
            color: "yellow",
            notes: "RESTful endpoints in TanStack Start",
            subtopics: [{ name: "Auth" }, { name: "Database" }],
          },
        ],
      };

      const result = normalizeMindMapImport(aliased);
      expect(result.detectedFormat).toBe("hierarchical");
      expect(result.title).toBe("Website Redesign");
      expect(result.doc.nodes).toHaveLength(7);

      const root = result.doc.nodes.find((n) => n.parentId === null);
      expect(root!.title).toBe("Website Redesign");

      const designNode = result.doc.nodes.find((n) => n.title === "Design System");
      expect(designNode).toBeDefined();
      expect(designNode!.color).toBe("violet"); // "purple" mapped to "violet"

      const backendNode = result.doc.nodes.find((n) => n.title === "Backend API");
      expect(backendNode).toBeDefined();
      expect(backendNode!.color).toBe("amber"); // "yellow" mapped to "amber"
      expect(backendNode!.notes).toBe("RESTful endpoints in TanStack Start");

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("supports leaf nodes as primitive strings", () => {
      const withStringLeaves = {
        topic: "Sprint Backlog",
        children: [
          {
            topic: "To Do",
            children: ["Task 1", "Task 2"],
          },
          {
            topic: "Done",
            children: ["Task 0"],
          },
        ],
      };

      const result = normalizeMindMapImport(withStringLeaves);
      expect(result.doc.nodes).toHaveLength(6);
      const task1 = result.doc.nodes.find((n) => n.title === "Task 1");
      expect(task1).toBeDefined();
      expect(checkStructure(result.doc)).toBeNull();
    });

    it("supports markdown code fences around JSON and strips UTF-8 BOM", () => {
      const fenced =
        '\uFEFF```json\n{\n  "title": "AI Brainstorm",\n  "children": [\n    {"title": "Idea A"}\n  ]\n}\n```';
      const result = parseMindMapJson(fenced);
      expect(result.title).toBe("AI Brainstorm");
      expect(result.doc.nodes).toHaveLength(2);
      expect(checkStructure(result.doc)).toBeNull();
    });

    it("supports nested key-value dictionary formats", () => {
      const dictionary = {
        "Project Architecture": {
          Frontend: ["React 19", "Tailwind CSS"],
          Backend: ["Nitro", "Prisma"],
        },
      };

      const result = normalizeMindMapImport(dictionary);
      expect(result.title).toBe("Project Architecture");
      expect(result.doc.nodes).toHaveLength(7);
      expect(checkStructure(result.doc)).toBeNull();
    });
  });

  // 3. Flat Node JSON
  describe("Format C: Flat Node JSON", () => {
    it("imports flat array with id, title, and parentId", () => {
      const flatArray = [
        { id: "root", title: "Company", parentId: null },
        { id: "dept1", title: "Engineering", parentId: "root" },
        { id: "dept2", title: "Marketing", parentId: "root" },
        { id: "team1", title: "Frontend", parentId: "dept1" },
      ];

      const result = normalizeMindMapImport(flatArray, "Fallback Title");
      expect(result.detectedFormat).toBe("flat");
      expect(result.title).toBe("Company");
      expect(result.doc.nodes).toHaveLength(4);

      const root = result.doc.nodes.find((n) => n.parentId === null);
      expect(root!.title).toBe("Company");

      const eng = result.doc.nodes.find((n) => n.title === "Engineering");
      expect(eng!.parentId).toBe(root!.id);

      const frontend = result.doc.nodes.find((n) => n.title === "Frontend");
      expect(frontend!.parentId).toBe(eng!.id);

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("imports object with nodes and connections/links", () => {
      const flatWithLinks = {
        title: "Microservices Map",
        nodes: [
          { id: "gw", name: "API Gateway", parent: null },
          { id: "auth", name: "Auth Service", parent: "gw" },
          { id: "billing", name: "Billing Service", parent: "gw" },
        ],
        connections: [{ from: "billing", to: "auth" }],
      };

      const result = normalizeMindMapImport(flatWithLinks);
      expect(result.detectedFormat).toBe("flat");
      expect(result.title).toBe("Microservices Map");
      expect(result.doc.nodes).toHaveLength(3);
      expect(result.doc.links).toHaveLength(1);

      const link = result.doc.links[0]!;
      expect(link.source).toBe("billing");
      expect(link.target).toBe("auth");

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("resolves parent references by node title if parentId is not an ID", () => {
      const titleReferenced = [
        { id: "n1", title: "Main Topic", parentId: null },
        { id: "n2", title: "Branch 1", parentId: "Main Topic" },
      ];

      const result = normalizeMindMapImport(titleReferenced);
      expect(result.doc.nodes).toHaveLength(2);
      expect(result.doc.nodes[1]!.parentId).toBe("n1");
      expect(checkStructure(result.doc)).toBeNull();
    });

    it("handles multiple roots by creating a central unifying topic", () => {
      const multiRoot = [
        { id: "1", title: "Goal A", parentId: null },
        { id: "2", title: "Goal B", parentId: null },
        { id: "3", title: "Goal C", parentId: null },
      ];

      const result = normalizeMindMapImport(multiRoot, "Strategic Goals");
      expect(result.detectedFormat).toBe("flat");
      expect(result.doc.nodes).toHaveLength(4); // 3 goals + 1 central topic

      const central = result.doc.nodes.find((n) => n.parentId === null);
      expect(central).toBeDefined();
      expect(central!.title).toBe("Strategic Goals");

      const branches = result.doc.nodes.filter((n) => n.parentId === central!.id);
      expect(branches).toHaveLength(3);

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });
  });

  // 4. Common React Flow Format
  describe("Format D: Common React Flow-style JSON", () => {
    it("imports React Flow nodes and edges into a spanning tree mind map", () => {
      const reactFlow = {
        nodes: [
          { id: "1", data: { label: "Sales Process" }, position: { x: 0, y: 0 } },
          { id: "2", data: { label: "Lead Gen" }, position: { x: 150, y: -50 } },
          { id: "3", data: { label: "Closing" }, position: { x: 150, y: 50 } },
          { id: "4", data: { label: "Referrals" }, position: { x: 300, y: -50 } },
        ],
        edges: [
          { id: "e1-2", source: "1", target: "2" },
          { id: "e1-3", source: "1", target: "3" },
          { id: "e2-4", source: "2", target: "4" },
          // Cross link: Closing connects to Referrals
          { id: "e3-4", source: "3", target: "4" },
        ],
      };

      const result = normalizeMindMapImport(reactFlow);
      expect(result.detectedFormat).toBe("react-flow");
      expect(result.doc.nodes).toHaveLength(4);

      const root = result.doc.nodes.find((n) => n.parentId === null);
      expect(root!.id).toBe("1");
      expect(root!.title).toBe("Sales Process");

      // Verify hierarchy from spanning tree
      const leadGen = result.doc.nodes.find((n) => n.id === "2");
      const closing = result.doc.nodes.find((n) => n.id === "3");
      const referrals = result.doc.nodes.find((n) => n.id === "4");

      expect(leadGen!.parentId).toBe("1");
      expect(closing!.parentId).toBe("1");
      expect(referrals!.parentId).toBe("2");

      // Cross link preserved in links
      expect(result.doc.links).toHaveLength(1);
      expect(result.doc.links[0]!.source).toBe("3");
      expect(result.doc.links[0]!.target).toBe("4");

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("handles React Flow elements array format", () => {
      const elementsFormat = {
        elements: [
          { id: "a", data: { label: "Root Flow" } },
          { id: "b", data: { label: "Step B" } },
          { id: "ea-b", source: "a", target: "b" },
        ],
      };

      const result = normalizeMindMapImport(elementsFormat);
      expect(result.detectedFormat).toBe("react-flow");
      expect(result.doc.nodes).toHaveLength(2);
      expect(checkStructure(result.doc)).toBeNull();
    });
  });

  // 5. Duplicate Node IDs Handling
  describe("Edge Case: Duplicate Node IDs", () => {
    it("handles duplicate node IDs without errors and preserves all nodes", () => {
      const duplicateIds = [
        { id: "1", title: "Central Root", parentId: null },
        { id: "dup", title: "First Duplicate", parentId: "1" },
        { id: "dup", title: "Second Duplicate", parentId: "1" },
        { id: "sub", title: "Child of First", parentId: "dup" },
      ];

      const result = normalizeMindMapImport(duplicateIds);
      expect(result.doc.nodes).toHaveLength(4);

      // Verify all node IDs are unique
      const ids = new Set(result.doc.nodes.map((n) => n.id));
      expect(ids.size).toBe(4);

      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });
  });

  // 6. Invalid JSON and Malformed Node Lists
  describe("Edge Case: Invalid JSON and Malformed Inputs", () => {
    it("throws clear error on syntax errors in JSON", () => {
      expect(() => parseMindMapJson("{ invalid json")).toThrow(
        "The file isn't valid JSON. Please check for syntax errors.",
      );
    });

    it("throws clear error on empty file", () => {
      expect(() => parseMindMapJson("")).toThrow("The file is empty.");
      expect(() => parseMindMapJson("   ")).toThrow("The file is empty.");
    });

    it("throws clear error on empty array or object", () => {
      expect(() => parseMindMapJson("[]")).toThrow("No topics or nodes were found in the file.");
      expect(() => parseMindMapJson("{}")).toThrow("No topics or nodes were found in the file.");
    });

    it("throws clear error on primitive values", () => {
      expect(() => parseMindMapJson("123")).toThrow("The file must contain a JSON object or array");
      expect(() => parseMindMapJson('"just a string"')).toThrow(
        "The file must contain a JSON object or array",
      );
      expect(() => parseMindMapJson("null")).toThrow(
        "The file is empty or does not contain valid data.",
      );
    });

    it("throws helpful error when JSON has no mind map structure", () => {
      const unrelated = { database: "mysql", port: 3306, user: "admin" };
      expect(() => normalizeMindMapImport(unrelated)).toThrow(
        "Could not detect a supported mind map structure.",
      );
    });
  });

  // 7. Large and Deeply Nested Maps
  describe("Edge Case: Large and Deeply Nested Maps", () => {
    it("handles a deeply nested hierarchy (depth 15) successfully", () => {
      type TreeNode = { title: string; children?: TreeNode[] };
      let current: TreeNode = { title: "Leaf Topic" };
      for (let i = 14; i >= 1; i--) {
        current = { title: `Level ${i}`, children: [current] };
      }
      const deepHierarchy = {
        title: "Deep Map",
        root: current,
      };

      const result = normalizeMindMapImport(deepHierarchy);
      expect(result.doc.nodes).toHaveLength(15);
      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("handles a map with hundreds of nodes within limits", () => {
      const nodes: Array<{ id: string; title: string; parentId: string | null }> = [
        { id: "root", title: "Large Scale Central", parentId: null },
      ];
      for (let i = 1; i <= 200; i++) {
        nodes.push({
          id: `node-${i}`,
          title: `Item ${i}`,
          parentId: i <= 10 ? "root" : `node-${Math.floor(i / 10)}`,
        });
      }

      const result = normalizeMindMapImport(nodes, "200 Topics Map");
      expect(result.doc.nodes).toHaveLength(201);
      expect(checkStructure(result.doc)).toBeNull();
      expect(() => DocSchema.parse(result.doc)).not.toThrow();
    });

    it("throws an error when topic count exceeds MAX_NODES limit", () => {
      const oversized: Array<{ id: string; title: string; parentId: string | null }> = [
        { id: "root", title: "Oversized", parentId: null },
      ];
      for (let i = 1; i <= MAX_NODES + 10; i++) {
        oversized.push({ id: `n-${i}`, title: `Topic ${i}`, parentId: "root" });
      }

      expect(() => normalizeMindMapImport(oversized)).toThrow(`exceeds the limit`);
    });
  });
});
