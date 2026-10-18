// Bidirectional conversion engine between MindDesk Mind Maps and Notes (PageContent).
// Pure, browser- and server-safe logic that strictly preserves all existing data.
import { newBlockId, type Block, type PageContent } from "@/lib/page-content";
import {
  arrange,
  childrenMap,
  estimateSize,
  makeNode,
  newId,
  rootOf,
  type MapColor,
  type MapDoc,
  type MapLink,
  type MapNode,
} from "@/lib/mindmap-doc";

const BRANCH_PALETTE: MapColor[] = ["blue", "green", "violet", "amber", "teal", "red"];

export type MindMapToNoteResult = {
  title: string;
  content: PageContent;
  nodeCount: number;
  conversionLog: string[];
};

export type NoteToMindMapResult = {
  doc: MapDoc;
  sourceNodeCount: number;
  conversionLog: string[];
};

/**
 * Extracts label and URL from markdown links like `[Label](https://url)` or raw URLs.
 */
function parseLinkAndTitle(text: string): { title: string; link: string } {
  const linkRegex = /^\s*\[(.*?)\]\((https?:\/\/[^\s)]+)\)\s*$/;
  const match = text.match(linkRegex);
  if (match) {
    return { title: match[1]?.trim() || "Link", link: match[2]?.trim() || "" };
  }
  return { title: text.trim(), link: "" };
}

/**
 * Converts a Mind Map document (MapDoc) into a structured, editable PageContent Note.
 *
 * Mapping rules:
 * - Root node -> Note title
 * - Level 1 branches -> H1 headings
 * - Level 2 branches -> H2 headings
 * - Level 3 branches -> H3 headings
 * - Level 4+ branches -> Preserved depth bulleted list items (or checklists if icon is 'check')
 * - Task-like nodes (icon === 'check') -> Checklists at any depth
 * - Node notes -> Supporting paragraph blocks (split on double newline)
 * - Node links -> Embedded markdown links
 * - Cross links -> Summary callout at the end
 */
export function mindmapToPageContent(
  mapDoc: MapDoc,
  fallbackTitle = "Untitled Note",
): MindMapToNoteResult {
  const log: string[] = [];
  const nodes = mapDoc.nodes;

  if (!nodes || nodes.length === 0) {
    return {
      title: fallbackTitle,
      content: { blocks: [{ id: newBlockId(), type: "p", text: "" }] },
      nodeCount: 0,
      conversionLog: ["Empty mind map converted to empty note."],
    };
  }

  // 1. Locate root node
  const root = rootOf(mapDoc) ?? nodes[0]!;
  const noteTitle = root.title.trim() || fallbackTitle.trim() || "Untitled Note";
  const blocks: Block[] = [];
  const kidsMap = childrenMap(nodes);

  // 2. Root node notes or link become introductory content
  if (root.notes && root.notes.trim()) {
    const paragraphs = root.notes.trim().split(/\n\s*\n/);
    for (const p of paragraphs) {
      if (p.trim()) {
        blocks.push({
          id: newBlockId(),
          type: "p",
          text: p.trim(),
        });
      }
    }
  }
  if (root.link && root.link.trim()) {
    blocks.push({
      id: newBlockId(),
      type: "p",
      text: `[${noteTitle}](${root.link.trim()})`,
    });
  }

  // Helper: sort sibling nodes top-to-bottom by y-coordinate for natural reading order
  const sortSiblings = (items: MapNode[]) => [...items].sort((a, b) => a.y - b.y);

  let processedCount = 1; // root counted

  // 3. Recursive tree traversal
  function traverse(node: MapNode, depth: number) {
    const rawTitle = node.title.trim() || "Untitled";
    const titleWithLink =
      node.link && node.link.trim() ? `[${rawTitle}](${node.link.trim()})` : rawTitle;

    const isTask = node.icon === "check";
    const codeMatch = node.title.match(/^Code Snippet(?:\s*\(([^)]+)\))?$/);

    if (codeMatch && node.notes) {
      blocks.push({
        id: newBlockId(),
        type: "code",
        text: node.notes,
        language: codeMatch[1],
      });
    } else if (node.icon === "lightbulb") {
      blocks.push({
        id: newBlockId(),
        type: "callout",
        text: titleWithLink,
        calloutType: "tip",
      });
      if (node.notes && node.notes.trim()) {
        const paragraphs = node.notes.trim().split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({ id: newBlockId(), type: "p", text: p.trim() });
          }
        }
      }
    } else if (isTask) {
      const indent = depth > 3 ? "  ".repeat(depth - 3) : "";
      blocks.push({
        id: newBlockId(),
        type: "check",
        text: (indent ? indent : "") + titleWithLink,
        checked: node.textColor === "muted",
      });
      if (node.notes && node.notes.trim()) {
        const paragraphs = node.notes.trim().split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({ id: newBlockId(), type: "p", text: p.trim() });
          }
        }
      }
    } else if (depth === 1) {
      blocks.push({
        id: newBlockId(),
        type: "h1",
        text: titleWithLink,
      });
      if (node.notes && node.notes.trim()) {
        const paragraphs = node.notes.trim().split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({ id: newBlockId(), type: "p", text: p.trim() });
          }
        }
      }
    } else if (depth === 2) {
      blocks.push({
        id: newBlockId(),
        type: "h2",
        text: titleWithLink,
      });
      if (node.notes && node.notes.trim()) {
        const paragraphs = node.notes.trim().split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({ id: newBlockId(), type: "p", text: p.trim() });
          }
        }
      }
    } else if (depth === 3) {
      blocks.push({
        id: newBlockId(),
        type: "h3",
        text: titleWithLink,
      });
      if (node.notes && node.notes.trim()) {
        const paragraphs = node.notes.trim().split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({ id: newBlockId(), type: "p", text: p.trim() });
          }
        }
      }
    } else {
      // Depth 4+
      const indent = "  ".repeat(Math.max(0, depth - 4));
      const text = (indent ? indent : "") + titleWithLink;
      blocks.push({
        id: newBlockId(),
        type: "bullet",
        text,
      });
      if (node.notes && node.notes.trim()) {
        const paragraphs = node.notes.trim().split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({ id: newBlockId(), type: "p", text: p.trim() });
          }
        }
      }
    }

    // Recursively process children
    const children = sortSiblings(kidsMap.get(node.id) ?? []);
    for (const child of children) {
      processedCount++;
      traverse(child, depth + 1);
    }
  }

  // Process all main branches connected to root
  const rootChildren = sortSiblings(kidsMap.get(root.id) ?? []);
  for (const branch of rootChildren) {
    processedCount++;
    traverse(branch, 1);
  }

  // 4. Capture any cross-links / relationships
  if (mapDoc.links && mapDoc.links.length > 0) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const linkLines: string[] = [];
    for (const l of mapDoc.links) {
      const src = byId.get(l.source);
      const tgt = byId.get(l.target);
      if (src && tgt) {
        linkLines.push(`• **${src.title}** ➔ **${tgt.title}**`);
      }
    }
    if (linkLines.length > 0) {
      blocks.push({ id: newBlockId(), type: "divider", text: "" });
      blocks.push({
        id: newBlockId(),
        type: "callout",
        text: "Related Connections:\n" + linkLines.join("\n"),
        calloutType: "info",
      });
      log.push(`Included ${linkLines.length} cross-connections in callout block.`);
    }
  }

  log.push(`Converted ${processedCount} nodes into ${blocks.length} structured note blocks.`);

  return {
    title: noteTitle,
    content: { blocks },
    nodeCount: processedCount,
    conversionLog: log,
  };
}

function bridgeNode(p: Partial<MapNode> & { parentId: string | null }): MapNode {
  return makeNode({
    x: 0,
    y: 0,
    ...p,
  });
}

/**
 * Converts a structured Note (PageContent) into an interactive, beautifully arranged Mind Map (MapDoc).
 *
 * Mapping rules:
 * - Note title -> Central Root node
 * - H1 headings -> Main Level 1 branches
 * - H2 headings -> Level 2 child branches under preceding H1
 * - H3 headings -> Level 3 nested branches under preceding H2 (or preceding highest heading)
 * - Bullets / Numbers / Checklists -> Leaf or child nodes with appropriate icons and indentation
 * - Callouts -> Highlighted child nodes (amber / lightbulb)
 * - Code blocks -> Nodes with full code saved in node notes
 * - Paragraphs -> Attached as node notes on preceding headings/nodes, or introductory branches
 * - Automatic Radial Layout -> Balanced, non-overlapping node coordinates computed by MindDesk arrange()
 */
export function pageContentToMindMap(title: string, content: PageContent): NoteToMindMapResult {
  const log: string[] = [];
  const rootTitle = (title.trim() || "Untitled Note").slice(0, 200);
  const rootId = newId();

  const nodes: MapNode[] = [];
  const links: MapLink[] = [];

  // Create Root Node
  const rootNode = bridgeNode({
    id: rootId,
    parentId: null,
    title: rootTitle,
    size: "l",
    color: "blue",
  });
  nodes.push(rootNode);

  const blocks = content.blocks || [];
  if (blocks.length === 0) {
    return {
      doc: { layout: "radial", nodes, links },
      sourceNodeCount: 1,
      conversionLog: ["Created mind map with single root node from empty note."],
    };
  }

  // Detect which headings are present in the document
  const hasH1 = blocks.some((b) => b.type === "h1" && b.text.trim());
  const hasH2 = blocks.some((b) => b.type === "h2" && b.text.trim());
  const hasH3 = blocks.some((b) => b.type === "h3" && b.text.trim());

  let currentL1Id: string | null = null;
  let currentL2Id: string | null = null;
  let currentL3Id: string | null = null;
  let lastNodeId: string = rootId;

  // Track nested list hierarchy
  let listStack: string[] = [];

  // Process blocks
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const rawText = b.text ? b.text.trim() : "";

    // Ignore empty paragraphs or empty dividers
    if (!rawText && b.type !== "divider" && b.type !== "code") continue;

    // Reset list stack on non-list blocks
    if (b.type !== "bullet" && b.type !== "number" && b.type !== "check") {
      listStack = [];
    }

    // A. Headings
    const isL1Heading =
      b.type === "h1" || (b.type === "h2" && !hasH1) || (b.type === "h3" && !hasH1 && !hasH2);

    const isL2Heading = (b.type === "h2" && hasH1) || (b.type === "h3" && !hasH1 && hasH2);

    const isL3Heading = b.type === "h3" && (hasH1 || hasH2) && !isL1Heading && !isL2Heading;

    if (isL1Heading) {
      const { title: headingTitle, link: headingLink } = parseLinkAndTitle(rawText);
      const node = bridgeNode({
        parentId: rootId,
        title: headingTitle.slice(0, 200),
        link: headingLink || "",
        size: "m",
      });
      nodes.push(node);
      currentL1Id = node.id;
      currentL2Id = null;
      currentL3Id = null;
      lastNodeId = node.id;
      continue;
    }

    if (isL2Heading) {
      const { title: headingTitle, link: headingLink } = parseLinkAndTitle(rawText);
      const parent = currentL1Id ?? rootId;
      const node = bridgeNode({
        parentId: parent,
        title: headingTitle.slice(0, 200),
        link: headingLink || "",
        size: "m",
      });
      nodes.push(node);
      currentL2Id = node.id;
      currentL3Id = null;
      lastNodeId = node.id;
      continue;
    }

    if (isL3Heading) {
      const { title: headingTitle, link: headingLink } = parseLinkAndTitle(rawText);
      const parent = currentL2Id ?? currentL1Id ?? rootId;
      const node = bridgeNode({
        parentId: parent,
        title: headingTitle.slice(0, 200),
        link: headingLink || "",
        size: "s",
      });
      nodes.push(node);
      currentL3Id = node.id;
      lastNodeId = node.id;
      continue;
    }

    // B. Lists (Bullet, Number, Check)
    if (b.type === "bullet" || b.type === "number" || b.type === "check") {
      const leadingSpaces = (b.text || "").match(/^(\s*)/)?.[1]?.length ?? 0;
      const indentLevel = Math.floor(leadingSpaces / 2);
      const defaultParent = currentL3Id ?? currentL2Id ?? currentL1Id ?? rootId;

      let parent = defaultParent;
      if (indentLevel > 0 && listStack[indentLevel - 1]) {
        parent = listStack[indentLevel - 1]!;
      }

      const { title: itemTitle, link: itemLink } = parseLinkAndTitle(rawText);

      let icon: MapNode["icon"] = "none";
      if (b.type === "check") icon = "check";
      else if (b.type === "number") icon = "star";

      const node = bridgeNode({
        parentId: parent,
        title: itemTitle.slice(0, 200),
        link: itemLink || "",
        size: "s",
        icon,
        textColor: b.type === "check" && b.checked ? "muted" : "default",
      });
      nodes.push(node);
      listStack[indentLevel] = node.id;
      listStack.length = indentLevel + 1;
      lastNodeId = node.id;
      continue;
    }

    // C. Callout
    if (b.type === "callout") {
      const parent = currentL3Id ?? currentL2Id ?? currentL1Id ?? rootId;
      const { title: calloutTitle, link: calloutLink } = parseLinkAndTitle(rawText);
      const node = bridgeNode({
        parentId: parent,
        title: calloutTitle.slice(0, 200),
        link: calloutLink || "",
        size: "m",
        color: "amber",
        icon: "lightbulb",
      });
      nodes.push(node);
      lastNodeId = node.id;
      continue;
    }

    // D. Code Block
    if (b.type === "code") {
      const parent = currentL3Id ?? currentL2Id ?? currentL1Id ?? rootId;
      const langLabel = b.language ? ` (${b.language})` : "";
      const node = bridgeNode({
        parentId: parent,
        title: `Code Snippet${langLabel}`.slice(0, 200),
        notes: rawText,
        size: "s",
        icon: "target",
      });
      nodes.push(node);
      lastNodeId = node.id;
      continue;
    }

    // E. Paragraphs
    if (b.type === "p") {
      // If flat document without any headings
      if (currentL1Id === null && !hasH1 && !hasH2 && !hasH3) {
        const { title: pTitle, link: pLink } = parseLinkAndTitle(rawText);
        const pNode = bridgeNode({
          parentId: rootId,
          title: pTitle.slice(0, 200),
          notes: rawText.length > 200 ? rawText : "",
          link: pLink || "",
          size: "s",
        });
        nodes.push(pNode);
        lastNodeId = pNode.id;
        continue;
      }

      // If before the first heading in a document with headings
      if (currentL1Id === null) {
        if (!rootNode.notes) {
          rootNode.notes = rawText;
        } else {
          rootNode.notes += `\n\n${rawText}`;
        }
        continue;
      }

      // Inside a section: attach as supporting notes to preceding topic
      const prev = nodes.find((n) => n.id === lastNodeId);
      if (prev && prev.id !== rootId) {
        prev.notes = prev.notes ? `${prev.notes}\n\n${rawText}` : rawText;
        continue;
      }

      // Fallback child node under current section
      const parent = currentL3Id ?? currentL2Id ?? currentL1Id ?? rootId;
      const { title: pTitle, link: pLink } = parseLinkAndTitle(rawText);
      const pNode = bridgeNode({
        parentId: parent,
        title: pTitle.slice(0, 200),
        notes: rawText.length > 200 ? rawText : "",
        link: pLink || "",
        size: "s",
      });
      nodes.push(pNode);
      lastNodeId = pNode.id;
    }
  }

  // 3. Color assignment: assign distinct vibrant colors to top-level branches
  const kids = childrenMap(nodes);
  const mainBranches = kids.get(rootId) ?? [];
  mainBranches.forEach((branch, idx) => {
    const paletteColor = BRANCH_PALETTE[idx % BRANCH_PALETTE.length]!;
    branch.color = paletteColor;

    // Propagate color down this branch
    const queue = [...(kids.get(branch.id) ?? [])];
    while (queue.length > 0) {
      const child = queue.shift()!;
      if (child.color === "default") {
        child.color = paletteColor;
      }
      const subKids = kids.get(child.id);
      if (subKids) queue.push(...subKids);
    }
  });

  // 4. Calculate clean, non-overlapping Radial Tree coordinates
  const initialDoc: MapDoc = { layout: "radial", nodes, links };
  const arrangedDoc = arrange(initialDoc, estimateSize);

  log.push(
    `Converted note into ${arrangedDoc.nodes.length} mind map nodes with balanced radial layout.`,
  );

  return {
    doc: arrangedDoc,
    sourceNodeCount: arrangedDoc.nodes.length,
    conversionLog: log,
  };
}
