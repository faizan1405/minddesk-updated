/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type Layout,
  type MapColor,
  type MapDoc,
  type MapLink,
  type MapNode,
  type NodeIcon,
  type NodeSize,
  DocSchema,
  LAYOUTS,
  MAP_COLORS,
  NODE_ICONS,
  NODE_SIZES,
  MAX_NODES,
  arrange,
  estimateSize,
  newId,
} from "./mindmap-doc";

export type DetectedFormat = "native" | "hierarchical" | "flat" | "react-flow";

export type NormalizedMindMap = {
  title: string;
  doc: MapDoc;
  detectedFormat: DetectedFormat;
};

const BRANCH_COLORS: MapColor[] = ["blue", "green", "amber", "red", "violet", "teal"];

const COLOR_ALIASES: Record<string, MapColor> = {
  blue: "blue",
  green: "green",
  amber: "amber",
  yellow: "amber",
  orange: "amber",
  gold: "amber",
  red: "red",
  rose: "red",
  pink: "red",
  violet: "violet",
  purple: "violet",
  indigo: "violet",
  magenta: "violet",
  teal: "teal",
  cyan: "teal",
  sky: "teal",
  aqua: "teal",
  turquoise: "teal",
  gray: "gray",
  grey: "gray",
  slate: "gray",
  zinc: "gray",
  neutral: "gray",
  stone: "gray",
  default: "default",
};

// ---------- string / property extractors with aliases ----------

function extractString(val: unknown, maxLen = 300): string | null {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length > 0) return trimmed.slice(0, maxLen);
  } else if (typeof val === "number" && !Number.isNaN(val)) {
    return String(val).slice(0, maxLen);
  }
  return null;
}

function extractDocTitle(raw: unknown, rootTitle?: string, fallback = "Imported Mind Map"): string {
  if (typeof raw === "object" && raw !== null) {
    const r = raw as any;
    const candidates = [r.title, r.name, r.topic, r.label, r.heading, r.subject];
    for (const c of candidates) {
      const s = extractString(c, 200);
      if (s) return s;
    }
  }
  if (rootTitle && rootTitle.trim().length > 0) {
    return rootTitle.trim().slice(0, 200);
  }
  return fallback.slice(0, 200);
}

function extractNodeTitle(obj: unknown, fallback = "Untitled topic"): string {
  if (typeof obj === "string" || typeof obj === "number") {
    return extractString(obj, 300) || fallback;
  }
  if (typeof obj !== "object" || obj === null) return fallback;
  const o = obj as any;

  // Direct properties
  const direct = [
    o.title,
    o.name,
    o.label,
    o.text,
    o.topic,
    o.heading,
    o.value,
    o.content,
    o.caption,
  ];
  for (const c of direct) {
    const s = extractString(c, 300);
    if (s) return s;
  }

  // React Flow data property
  if (typeof o.data === "object" && o.data !== null) {
    const d = o.data as any;
    const dataCandidates = [
      d.label,
      d.title,
      d.name,
      d.text,
      d.topic,
      d.heading,
      d.value,
      d.content,
    ];
    for (const c of dataCandidates) {
      const s = extractString(c, 300);
      if (s) return s;
    }
  } else if (typeof o.data === "string" || typeof o.data === "number") {
    const s = extractString(o.data, 300);
    if (s) return s;
  }

  // Fallback to id if meaningful string (not a raw uuid)
  if (
    typeof o.id === "string" &&
    o.id.trim().length > 0 &&
    o.id.length < 40 &&
    !/^[0-9a-f-]{36}$/i.test(o.id)
  ) {
    return o.id.trim();
  }

  return fallback;
}

function extractNotes(obj: unknown): string {
  if (typeof obj !== "object" || obj === null) return "";
  const o = obj as any;
  const d = typeof o.data === "object" && o.data !== null ? (o.data as any) : undefined;
  const candidates = [
    o.notes,
    o.note,
    o.description,
    o.desc,
    o.details,
    o.summary,
    o.comment,
    o.body,
    d?.notes,
    d?.note,
    d?.description,
    d?.desc,
    d?.details,
    d?.summary,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim().slice(0, 10000);
  }
  return "";
}

function extractColor(obj: unknown, fallback: MapColor = "default"): MapColor {
  if (typeof obj !== "object" || obj === null) return fallback;
  const o = obj as any;
  const d = typeof o.data === "object" && o.data !== null ? (o.data as any) : undefined;
  const s = typeof o.style === "object" && o.style !== null ? (o.style as any) : undefined;
  const rawColor = o.color || o.colour || d?.color || d?.colour || s?.backgroundColor || s?.color;
  if (typeof rawColor === "string") {
    const lower = rawColor.toLowerCase().trim();
    if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];
  }
  return fallback;
}

function extractIcon(obj: unknown): NodeIcon {
  if (typeof obj !== "object" || obj === null) return "none";
  const o = obj as any;
  const d = typeof o.data === "object" && o.data !== null ? (o.data as any) : undefined;
  const rawIcon = o.icon || d?.icon;
  if (typeof rawIcon === "string") {
    const lower = rawIcon.toLowerCase().trim();
    if (NODE_ICONS.includes(lower as NodeIcon)) return lower as NodeIcon;
  }
  return "none";
}

function extractSize(obj: unknown, defaultSize: NodeSize = "m"): NodeSize {
  if (typeof obj !== "object" || obj === null) return defaultSize;
  const o = obj as any;
  const d = typeof o.data === "object" && o.data !== null ? (o.data as any) : undefined;
  const rawSize = o.size || d?.size;
  if (typeof rawSize === "string") {
    const lower = rawSize.toLowerCase().trim();
    if (NODE_SIZES.includes(lower as NodeSize)) return lower as NodeSize;
  }
  return defaultSize;
}

function extractLink(obj: unknown): string {
  if (typeof obj !== "object" || obj === null) return "";
  const o = obj as any;
  const d = typeof o.data === "object" && o.data !== null ? (o.data as any) : undefined;
  const rawUrl = o.link || o.url || o.href || o.website || d?.link || d?.url || d?.href;
  if (typeof rawUrl === "string") {
    const trimmed = rawUrl.trim();
    if (/^https?:\/\/\S+$/i.test(trimmed) && trimmed.length <= 2000) return trimmed;
  }
  return "";
}

function extractPosition(obj: unknown): { x: number; y: number } | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as any;
  const p = typeof o.position === "object" && o.position !== null ? (o.position as any) : undefined;
  const x = o.x ?? p?.x;
  const y = o.y ?? p?.y;
  if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
    return {
      x: Math.max(-1e6, Math.min(1e6, x)),
      y: Math.max(-1e6, Math.min(1e6, y)),
    };
  }
  return null;
}

function extractChildrenArray(obj: unknown): unknown[] | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as any;
  const candidates = [
    o.children,
    o.subtopics,
    o.sub_topics,
    o.branches,
    o.child_nodes,
    o.subNodes,
    o.sub_items,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return null;
}

function sanitizeId(raw: unknown, seenIds: Set<string>): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && trimmed.length <= 64 && !seenIds.has(trimmed)) {
      seenIds.add(trimmed);
      return trimmed;
    }
  } else if (typeof raw === "number" && !Number.isNaN(raw)) {
    const s = String(raw);
    if (!seenIds.has(s)) {
      seenIds.add(s);
      return s;
    }
  }
  let id = newId();
  while (seenIds.has(id)) {
    id = newId();
  }
  seenIds.add(id);
  return id;
}

function sanitizeLinkId(raw: unknown, seenLinkIds: Set<string>): string {
  return sanitizeId(raw, seenLinkIds);
}

// Check whether all nodes have distinct non-zero coordinates
function hasDistinctCoordinates(nodes: MapNode[]): boolean {
  if (nodes.length <= 1) return true;
  let nonZeroCount = 0;
  const posSet = new Set<string>();
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return false;
    if (n.x !== 0 || n.y !== 0) nonZeroCount++;
    posSet.add(`${Math.round(n.x)},${Math.round(n.y)}`);
  }
  return nonZeroCount > 0 && posSet.size >= Math.min(nodes.length, 3);
}

// ---------- format parsers ----------

/** 1. Native MindDesk Document or Envelope */
function tryParseNative(raw: unknown, defaultTitle?: string): NormalizedMindMap | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as any;

  const isEnvelope = r.format === "minddesk-mindmap" && r.version === 1;
  const mapData = isEnvelope ? r.map : raw;

  if (typeof mapData !== "object" || mapData === null) return null;
  const m = mapData as any;

  if (!Array.isArray(m.nodes) || m.nodes.length === 0) return null;

  // Verify node structure looks like MindDesk (has parentId property on items)
  const sample = m.nodes[0];
  if (typeof sample !== "object" || sample === null || !("parentId" in sample)) {
    return null;
  }

  const rootInDoc = (m.nodes as Array<any>).find((n) => n.parentId === null);
  const title = extractDocTitle(
    raw,
    rootInDoc ? extractNodeTitle(rootInDoc) : undefined,
    defaultTitle || "Imported Mind Map",
  );
  const layout = (
    typeof m.layout === "string" && LAYOUTS.includes(m.layout as Layout) ? m.layout : "radial"
  ) as Layout;

  // Normalize each node
  const seenIds = new Set<string>();
  const idMap = new Map<string, string>();

  // Pass 1: map IDs
  for (let i = 0; i < m.nodes.length; i++) {
    const rawNode = m.nodes[i] as any;
    const origId = typeof rawNode.id === "string" ? rawNode.id : `node-${i}`;
    const safeId = sanitizeId(origId, seenIds);
    idMap.set(origId, safeId);
  }

  // Pass 2: build nodes
  const nodes: MapNode[] = [];
  for (let i = 0; i < m.nodes.length; i++) {
    const rawNode = m.nodes[i] as any;
    const origId = typeof rawNode.id === "string" ? rawNode.id : `node-${i}`;
    const id = idMap.get(origId)!;
    const rawParent = rawNode.parentId;
    let parentId: string | null = null;
    if (
      rawParent !== null &&
      rawParent !== undefined &&
      typeof rawParent === "string" &&
      rawParent.trim()
    ) {
      parentId = idMap.get(rawParent) ?? null;
    }

    const pos = extractPosition(rawNode) ?? { x: 0, y: 0 };
    const node: MapNode = {
      id,
      parentId,
      title: extractNodeTitle(rawNode, i === 0 ? title : "Topic"),
      x: pos.x,
      y: pos.y,
      collapsed: Boolean(rawNode.collapsed),
      color: extractColor(rawNode, i === 0 ? "blue" : "default"),
      textColor: "default",
      size: extractSize(rawNode, i === 0 && parentId === null ? "l" : "m"),
      icon: extractIcon(rawNode),
      notes: extractNotes(rawNode),
      link: extractLink(rawNode),
    };
    nodes.push(node);
  }

  // Ensure exactly one root
  const roots = nodes.filter((n) => n.parentId === null);
  if (roots.length === 0) {
    nodes[0]!.parentId = null;
  } else if (roots.length > 1) {
    const rootId = sanitizeId(undefined, seenIds);
    const rootNode: MapNode = {
      id: rootId,
      parentId: null,
      title,
      x: 0,
      y: 0,
      collapsed: false,
      color: "blue",
      textColor: "default",
      size: "l",
      icon: "none",
      notes: "",
      link: "",
    };
    for (const r of roots) {
      r.parentId = rootId;
    }
    nodes.unshift(rootNode);
  }

  // Normalize links
  const links: MapLink[] = [];
  const seenLinkIds = new Set<string>();
  if (Array.isArray(m.links)) {
    for (const rawLink of m.links) {
      if (typeof rawLink === "object" && rawLink !== null) {
        const l = rawLink as any;
        const rawSource = typeof l.source === "string" ? l.source : undefined;
        const rawTarget = typeof l.target === "string" ? l.target : undefined;
        if (rawSource && rawTarget) {
          const source = idMap.get(rawSource) ?? (seenIds.has(rawSource) ? rawSource : undefined);
          const target = idMap.get(rawTarget) ?? (seenIds.has(rawTarget) ? rawTarget : undefined);
          if (source && target && source !== target) {
            links.push({
              id: sanitizeLinkId(l.id, seenLinkIds),
              source,
              target,
            });
          }
        }
      }
    }
  }

  let doc: MapDoc = { layout, nodes, links };
  if (!hasDistinctCoordinates(doc.nodes)) {
    doc = arrange(doc, estimateSize);
  }

  const validated = DocSchema.parse(doc);
  return { title, doc: validated as MapDoc, detectedFormat: "native" };
}

/** 2. Common React Flow Format */
function tryParseReactFlow(raw: unknown, defaultTitle?: string): NormalizedMindMap | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as any;

  let rawNodes: unknown[] | null = null;
  let rawEdges: unknown[] = [];

  if (Array.isArray(r.nodes)) {
    rawNodes = r.nodes;
    if (Array.isArray(r.edges)) rawEdges = r.edges;
    else if (Array.isArray(r.links)) rawEdges = r.links;
    else if (Array.isArray(r.connections)) rawEdges = r.connections;
  } else if (Array.isArray(r.elements)) {
    // Older React Flow format where elements contains both nodes and edges
    rawNodes = r.elements.filter(
      (el: unknown) => typeof el === "object" && el !== null && !("source" in (el as any)),
    );
    rawEdges = r.elements.filter(
      (el: unknown) =>
        typeof el === "object" && el !== null && "source" in (el as any) && "target" in (el as any),
    );
  }

  if (!rawNodes || rawNodes.length === 0) return null;

  // React Flow characteristics:
  // Must have edges or elements array, or data property on nodes.
  // If nodes have parent/parentId and no React Flow data, let tryParseFlat handle it.
  const hasEdges = rawEdges.length > 0;
  const sample = rawNodes[0] as any;
  const hasData = typeof sample === "object" && sample !== null && "data" in sample;
  const hasParent = rawNodes.some(
    (n) =>
      typeof n === "object" &&
      n !== null &&
      ("parentId" in n || "parent_id" in n || "parent" in n || "parentNodeId" in n),
  );

  if (hasParent && !hasData) {
    return null;
  }

  if (!hasEdges && !hasData) {
    return null;
  }

  const title = extractDocTitle(raw, undefined, defaultTitle || "Imported Mind Map");
  const seenIds = new Set<string>();
  const idMap = new Map<string, string>();
  const itemSafeIds: string[] = [];

  // Pass 1: Assign unique safe IDs
  for (let i = 0; i < rawNodes.length; i++) {
    const item = rawNodes[i] as any;
    const origId = typeof item.id === "string" ? item.id : `rf-node-${i}`;
    const safeId = sanitizeId(origId, seenIds);
    itemSafeIds[i] = safeId;
    if (!idMap.has(String(origId))) {
      idMap.set(String(origId), safeId);
    }
  }

  // Pass 2: Map nodes
  const nodes: MapNode[] = [];
  for (let i = 0; i < rawNodes.length; i++) {
    if (nodes.length >= MAX_NODES) {
      throw new Error(
        `This mind map contains more than ${MAX_NODES} topics, which exceeds the limit.`,
      );
    }
    const item = rawNodes[i] as any;
    const id = itemSafeIds[i]!;

    const pos = extractPosition(item) ?? { x: 0, y: 0 };
    const node: MapNode = {
      id,
      parentId: null,
      title: extractNodeTitle(item, `Topic ${i + 1}`),
      x: pos.x,
      y: pos.y,
      collapsed: false,
      color: extractColor(item, i === 0 ? "blue" : "default"),
      textColor: "default",
      size: extractSize(item, i === 0 ? "l" : "m"),
      icon: extractIcon(item),
      notes: extractNotes(item),
      link: extractLink(item),
    };
    nodes.push(node);
  }

  // Parse valid edges
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  type CleanEdge = { id: string; source: string; target: string };
  const validEdges: CleanEdge[] = [];
  const seenLinkIds = new Set<string>();

  for (const e of rawEdges) {
    if (typeof e === "object" && e !== null) {
      const edge = e as any;
      const rawSrc = typeof edge.source === "string" ? edge.source : edge.from;
      const rawTgt = typeof edge.target === "string" ? edge.target : edge.to;
      if (typeof rawSrc === "string" && typeof rawTgt === "string") {
        const src = idMap.get(rawSrc) ?? (seenIds.has(rawSrc) ? rawSrc : undefined);
        const tgt = idMap.get(rawTgt) ?? (seenIds.has(rawTgt) ? rawTgt : undefined);
        if (src && tgt && src !== tgt) {
          validEdges.push({
            id: sanitizeLinkId(edge.id, seenLinkIds),
            source: src,
            target: tgt,
          });
          adj.get(src)!.push(tgt);
          inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1);
        }
      }
    }
  }

  // Find candidate roots (in-degree 0)
  const zeroIn = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
  let rootId: string;

  if (zeroIn.length === 1) {
    rootId = zeroIn[0]!.id;
  } else if (zeroIn.length > 1) {
    // Multiple roots: create a central topic
    rootId = sanitizeId(undefined, seenIds);
    const rootNode: MapNode = {
      id: rootId,
      parentId: null,
      title: extractDocTitle(raw, undefined, defaultTitle || "Mind Map"),
      x: 0,
      y: 0,
      collapsed: false,
      color: "blue",
      textColor: "default",
      size: "l",
      icon: "none",
      notes: "",
      link: "",
    };
    nodes.unshift(rootNode);
    for (const z of zeroIn) {
      z.parentId = rootId;
    }
  } else {
    // Cycle with no in-degree 0: pick the first node
    rootId = nodes[0]!.id;
  }

  // Build spanning tree via BFS
  const visited = new Set<string>();
  const parentMap = new Map<string, string | null>();
  const links: MapLink[] = [];

  visited.add(rootId);
  parentMap.set(rootId, null);

  const queue: string[] = [rootId];
  if (zeroIn.length > 1) {
    for (const z of zeroIn) {
      visited.add(z.id);
      parentMap.set(z.id, rootId);
      queue.push(z.id);
    }
  }

  const edgeSet = new Set(validEdges);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const neighbors = adj.get(cur) ?? [];
    for (const nxt of neighbors) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        parentMap.set(nxt, cur);
        queue.push(nxt);
      }
    }
  }

  // For any remaining disconnected nodes, attach them to the root
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      parentMap.set(n.id, rootId);
      queue.push(n.id);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const neighbors = adj.get(cur) ?? [];
        for (const nxt of neighbors) {
          if (!visited.has(nxt)) {
            visited.add(nxt);
            parentMap.set(nxt, cur);
            queue.push(nxt);
          }
        }
      }
    }
  }

  // Apply parent IDs to nodes
  for (const n of nodes) {
    n.parentId = parentMap.get(n.id) ?? (n.id === rootId ? null : rootId);
  }

  // Any edge that is NOT part of the tree hierarchy becomes a link
  for (const edge of edgeSet) {
    if (parentMap.get(edge.target) !== edge.source) {
      links.push(edge);
    }
  }

  let doc: MapDoc = { layout: "radial", nodes, links };
  if (!hasDistinctCoordinates(doc.nodes)) {
    doc = arrange(doc, estimateSize);
  }

  const validated = DocSchema.parse(doc);
  return { title, doc: validated as MapDoc, detectedFormat: "react-flow" };
}

/** 3. Flat Node List (arrays of nodes with id, parentId, etc.) */
function tryParseFlat(raw: unknown, defaultTitle?: string): NormalizedMindMap | null {
  let rawList: unknown[] | null = null;
  let rawLinks: unknown[] = [];
  let docTitle: string | undefined = undefined;

  if (Array.isArray(raw)) {
    rawList = raw;
  } else if (typeof raw === "object" && raw !== null) {
    const r = raw as any;
    if (Array.isArray(r.nodes)) rawList = r.nodes;
    else if (Array.isArray(r.topics)) rawList = r.topics;
    else if (Array.isArray(r.items)) rawList = r.items;

    if (Array.isArray(r.links)) rawLinks = r.links;
    else if (Array.isArray(r.connections)) rawLinks = r.connections;
    else if (Array.isArray(r.edges)) rawLinks = r.edges;

    docTitle = extractDocTitle(raw);
  }

  if (!rawList || rawList.length === 0) return null;

  const seenIds = new Set<string>();
  const itemSafeIds: string[] = [];
  const rawParentToSafeId = new Map<string, string>();
  const titleToSafeId = new Map<string, string>();

  // Pass 1: Assign safe unique IDs to all items
  for (let i = 0; i < rawList.length; i++) {
    if (i >= MAX_NODES) break;
    const item = rawList[i];
    if (typeof item !== "object" || item === null) continue;
    const o = item as any;
    const rawId = o.id ?? o.nodeId ?? o.node_id ?? o.key ?? o._id ?? `node-${i}`;
    const safeId = sanitizeId(rawId, seenIds);
    itemSafeIds[i] = safeId;

    const rawIdStr = String(rawId);
    if (!rawParentToSafeId.has(rawIdStr)) {
      rawParentToSafeId.set(rawIdStr, safeId);
    }

    const title = extractNodeTitle(o);
    if (title && !titleToSafeId.has(title.toLowerCase())) {
      titleToSafeId.set(title.toLowerCase(), safeId);
    }
  }

  // Pass 2: Build node structures
  const nodes: MapNode[] = [];
  for (let i = 0; i < rawList.length; i++) {
    if (nodes.length >= MAX_NODES) {
      throw new Error(
        `This mind map contains more than ${MAX_NODES} topics, which exceeds the limit.`,
      );
    }
    const item = rawList[i];
    if (typeof item !== "object" || item === null) continue;
    const o = item as any;

    const id = itemSafeIds[i]!;
    const title = extractNodeTitle(o, `Topic ${nodes.length + 1}`);
    const notes = extractNotes(o);
    const color = extractColor(o);
    const icon = extractIcon(o);
    const size = extractSize(o);
    const link = extractLink(o);
    const pos = extractPosition(o) ?? { x: 0, y: 0 };

    // Determine parent
    const rawParent =
      o.parentId ??
      o.parent_id ??
      o.parent ??
      o.sourceId ??
      o.source_id ??
      o.parentNodeId ??
      o.parent_node_id ??
      o.pid;
    let parentId: string | null = null;
    if (rawParent !== null && rawParent !== undefined && rawParent !== "") {
      const pStr = String(rawParent);
      if (rawParentToSafeId.has(pStr)) {
        parentId = rawParentToSafeId.get(pStr)!;
      } else if (titleToSafeId.has(pStr.toLowerCase())) {
        parentId = titleToSafeId.get(pStr.toLowerCase())!;
      }
    }

    // A node cannot be its own parent
    if (parentId === id) parentId = null;

    nodes.push({
      id,
      parentId,
      title,
      x: pos.x,
      y: pos.y,
      collapsed: false,
      color,
      textColor: "default",
      size,
      icon,
      notes,
      link,
    });
  }

  if (nodes.length === 0) return null;

  // Pass 3: Resolve hierarchy (single root, no cycles)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  // If parentId does not exist in nodes, it is a root
  for (const n of nodes) {
    if (n.parentId !== null && !nodeMap.has(n.parentId)) {
      n.parentId = null;
    }
  }

  // Detect and break cycles
  for (const n of nodes) {
    let cur = n.parentId;
    const path = new Set<string>([n.id]);
    while (cur !== null) {
      if (path.has(cur)) {
        n.parentId = null;
        break;
      }
      path.add(cur);
      cur = nodeMap.get(cur)?.parentId ?? null;
    }
  }

  // Ensure exactly one root
  const roots = nodes.filter((n) => n.parentId === null);
  let title: string;

  if (roots.length === 0) {
    nodes[0]!.parentId = null;
    nodes[0]!.size = "l";
    if (nodes[0]!.color === "default") nodes[0]!.color = "blue";
    title = docTitle || defaultTitle || nodes[0]!.title || "Imported Mind Map";
  } else if (roots.length > 1) {
    title = docTitle || defaultTitle || "Imported Mind Map";
    const rootId = sanitizeId(undefined, seenIds);
    const centralRoot: MapNode = {
      id: rootId,
      parentId: null,
      title,
      x: 0,
      y: 0,
      collapsed: false,
      color: "blue",
      textColor: "default",
      size: "l",
      icon: "none",
      notes: "",
      link: "",
    };
    for (const r of roots) {
      r.parentId = rootId;
    }
    nodes.unshift(centralRoot);
  } else {
    roots[0]!.size = "l";
    if (roots[0]!.color === "default") roots[0]!.color = "blue";
    title = docTitle || roots[0]!.title || defaultTitle || "Imported Mind Map";
  }

  // Parse links
  const links: MapLink[] = [];
  const seenLinkIds = new Set<string>();
  for (const rawLink of rawLinks) {
    if (typeof rawLink === "object" && rawLink !== null) {
      const l = rawLink as any;
      const rawSrc = l.source ?? l.from ?? l.start ?? l.sourceId ?? l.source_id;
      const rawTgt = l.target ?? l.to ?? l.end ?? l.targetId ?? l.target_id;
      if (rawSrc && rawTgt) {
        const src =
          rawParentToSafeId.get(String(rawSrc)) ??
          (seenIds.has(String(rawSrc)) ? String(rawSrc) : undefined);
        const tgt =
          rawParentToSafeId.get(String(rawTgt)) ??
          (seenIds.has(String(rawTgt)) ? String(rawTgt) : undefined);
        if (src && tgt && src !== tgt) {
          links.push({
            id: sanitizeLinkId(l.id, seenLinkIds),
            source: src,
            target: tgt,
          });
        }
      }
    }
  }

  let doc: MapDoc = { layout: "radial", nodes, links };
  if (!hasDistinctCoordinates(doc.nodes)) {
    doc = arrange(doc, estimateSize);
  }

  const validated = DocSchema.parse(doc);
  return { title, doc: validated as MapDoc, detectedFormat: "flat" };
}

/** 4. Hierarchical AI-generated JSON (ChatGPT, etc.) */
function tryParseHierarchical(raw: unknown, defaultTitle?: string): NormalizedMindMap | null {
  if (typeof raw !== "object" || raw === null) return null;

  let rootObj: unknown = null;
  let rootDocTitle: string | undefined = undefined;

  const r = raw as any;

  // Check wrapper properties like root, rootNode, mindmap, map, tree
  if (r.root && typeof r.root === "object") {
    rootObj = r.root;
    rootDocTitle = extractDocTitle(raw);
  } else if (r.rootNode && typeof r.rootNode === "object") {
    rootObj = r.rootNode;
    rootDocTitle = extractDocTitle(raw);
  } else if (r.root_node && typeof r.root_node === "object") {
    rootObj = r.root_node;
    rootDocTitle = extractDocTitle(raw);
  } else if (r.tree && typeof r.tree === "object") {
    rootObj = r.tree;
    rootDocTitle = extractDocTitle(raw);
  } else if (r.mindmap && typeof r.mindmap === "object") {
    const mm = r.mindmap as any;
    rootObj = mm.root || mm.rootNode || mm;
    rootDocTitle = extractDocTitle(raw) || extractDocTitle(mm);
  } else if (
    r.map &&
    typeof r.map === "object" &&
    !Array.isArray(r.map) &&
    ("children" in r.map || "root" in r.map)
  ) {
    const mp = r.map as any;
    rootObj = mp.root || mp;
    rootDocTitle = extractDocTitle(raw) || extractDocTitle(mp);
  } else if (extractChildrenArray(raw) !== null) {
    // The raw object itself is the root node
    rootObj = raw;
    rootDocTitle = extractDocTitle(raw);
  } else if (Array.isArray(raw)) {
    // Top-level array: if 1 item with children or multiple outline items
    if (raw.length === 1 && typeof raw[0] === "object" && raw[0] !== null) {
      rootObj = raw[0];
      rootDocTitle = extractDocTitle(raw[0]);
    } else if (raw.length > 1 && raw.some((item) => extractChildrenArray(item) !== null)) {
      rootObj = {
        title: defaultTitle || "Central Topic",
        children: raw,
      };
      rootDocTitle = defaultTitle || "Central Topic";
    }
  } else {
    // Check if it's a nested dictionary: { "Main Topic": { "Sub 1": {}, "Sub 2": {} } }
    const keys = Object.keys(r);
    if (keys.length === 1 && typeof r[keys[0]!] === "object" && r[keys[0]!] !== null) {
      const topKey = keys[0]!;
      const inner = r[topKey];
      rootObj = {
        title: topKey,
        children: Array.isArray(inner)
          ? inner
          : Object.entries(inner as any).map(([k, v]) => ({
              title: k,
              children:
                typeof v === "object" && v !== null
                  ? Array.isArray(v)
                    ? v
                    : Object.entries(v).map(([sk, sv]) => ({ title: sk, children: sv }))
                  : [],
            })),
      };
      rootDocTitle = topKey;
    }
  }

  if (!rootObj || typeof rootObj !== "object") return null;

  const seenIds = new Set<string>();
  const nodes: MapNode[] = [];

  function walk(
    item: unknown,
    parentId: string | null,
    depth: number,
    branchIndex?: number,
  ): MapNode {
    if (nodes.length >= MAX_NODES) {
      throw new Error(
        `This mind map contains more than ${MAX_NODES} topics, which exceeds the limit.`,
      );
    }

    if (typeof item === "string" || typeof item === "number") {
      const id = sanitizeId(undefined, seenIds);
      const node: MapNode = {
        id,
        parentId,
        title: extractString(item, 300) || "Topic",
        x: 0,
        y: 0,
        collapsed: false,
        color: "default",
        textColor: "default",
        size: "m",
        icon: "none",
        notes: "",
        link: "",
      };
      nodes.push(node);
      return node;
    }

    const obj = (typeof item === "object" && item !== null ? item : {}) as any;
    const id = sanitizeId(obj.id || obj.nodeId || obj.key, seenIds);
    const title = extractNodeTitle(
      obj,
      depth === 0 ? rootDocTitle || defaultTitle || "Central Topic" : "Topic",
    );
    const notes = extractNotes(obj);
    const icon = extractIcon(obj);
    const link = extractLink(obj);
    const size = extractSize(obj, depth === 0 ? "l" : "m");

    let color = extractColor(obj);
    if (color === "default") {
      if (depth === 0) {
        color = "blue";
      } else if (depth === 1 && typeof branchIndex === "number") {
        color = BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]!;
      }
    }

    const pos = extractPosition(obj) ?? { x: 0, y: 0 };
    const node: MapNode = {
      id,
      parentId,
      title,
      x: pos.x,
      y: pos.y,
      collapsed: false,
      color,
      textColor: "default",
      size,
      icon,
      notes,
      link,
    };
    nodes.push(node);

    const children = extractChildrenArray(obj);
    if (children && Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child !== null && child !== undefined) {
          const childNode = walk(child, id, depth + 1, depth === 0 ? i : branchIndex);
          if (childNode.color === "default" && color !== "default") {
            childNode.color = color;
          }
        }
      }
    }

    return node;
  }

  const rootNode = walk(rootObj, null, 0);
  const title = extractDocTitle(raw, rootNode.title, defaultTitle || "Imported Mind Map");

  if (nodes.length === 0) return null;

  let doc: MapDoc = { layout: "radial", nodes, links: [] };
  doc = arrange(doc, estimateSize);

  const validated = DocSchema.parse(doc);
  return { title, doc: validated as MapDoc, detectedFormat: "hierarchical" };
}

// ---------- public normalizer and text parser ----------

/**
 * Normalizes any supported mind map JSON structure into a valid MindDesk MapDoc.
 * Supports:
 * - Native MindDesk JSON (with or without export envelope)
 * - Simple AI-generated hierarchical JSON (ChatGPT, Claude, etc.)
 * - Flat node JSON (with parentId, parent, etc.)
 * - Common React Flow JSON (nodes and edges)
 */
export function normalizeMindMapImport(raw: unknown, defaultTitle?: string): NormalizedMindMap {
  if (raw === null || raw === undefined) {
    throw new Error("The file is empty or does not contain valid data.");
  }

  if (typeof raw !== "object") {
    throw new Error("The file must contain a JSON object or array representing a mind map.");
  }

  if (Array.isArray(raw) && raw.length === 0) {
    throw new Error(
      "No topics or nodes were found in the file. Expected a mind map hierarchy, node list, or React Flow structure.",
    );
  }

  if (!Array.isArray(raw) && Object.keys(raw).length === 0) {
    throw new Error(
      "No topics or nodes were found in the file. Expected a mind map hierarchy, node list, or React Flow structure.",
    );
  }

  // 1. Try Native MindDesk
  const native = tryParseNative(raw, defaultTitle);
  if (native) return native;

  // 2. Try React Flow
  const reactFlow = tryParseReactFlow(raw, defaultTitle);
  if (reactFlow) return reactFlow;

  // 3. Try Flat Node List
  const flat = tryParseFlat(raw, defaultTitle);
  if (flat) return flat;

  // 4. Try Hierarchical (AI-generated: root with children, etc.)
  const hierarchical = tryParseHierarchical(raw, defaultTitle);
  if (hierarchical) return hierarchical;

  throw new Error(
    "Could not detect a supported mind map structure. Expected a mind map hierarchy (with title and children), a flat node list (with parentId), or React Flow nodes and edges.",
  );
}

/**
 * Parses raw JSON string, strips markdown code fences if present,
 * and normalizes into a valid MindDesk MapDoc.
 */
export function parseMindMapJson(jsonText: string, defaultTitle?: string): NormalizedMindMap {
  if (!jsonText || typeof jsonText !== "string" || !jsonText.trim()) {
    throw new Error("The file is empty.");
  }

  let text = jsonText.trim();
  // Strip UTF-8 byte order mark if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  if (text.startsWith("```")) {
    text = text
      .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The file isn't valid JSON. Please check for syntax errors.");
  }

  return normalizeMindMapImport(raw, defaultTitle);
}
