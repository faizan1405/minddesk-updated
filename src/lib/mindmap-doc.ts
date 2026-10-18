// Mind map document: pure, browser- and server-safe logic shared by the editor,
// the API (validation) and Preview Mode. A whole map is stored as one JSON document
// so every save is a single atomic, version-checked write.
import { z } from "zod";

export const MAP_COLORS = [
  "default",
  "blue",
  "green",
  "amber",
  "red",
  "violet",
  "teal",
  "gray",
] as const;
export const TEXT_COLORS = ["default", "muted", "accent", "color", "dark"] as const;
export const NODE_SIZES = ["s", "m", "l"] as const;
export const NODE_ICONS = [
  "none",
  "star",
  "lightbulb",
  "flag",
  "check",
  "alert",
  "heart",
  "question",
  "target",
  "book",
] as const;
export const LAYOUTS = ["radial", "right", "left", "down"] as const;
export type MapColor = (typeof MAP_COLORS)[number];
export type TextColor = (typeof TEXT_COLORS)[number];
export type NodeSize = (typeof NODE_SIZES)[number];
export type NodeIcon = (typeof NODE_ICONS)[number];
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_LABEL: Record<Layout, string> = {
  radial: "Standard (both sides)",
  right: "Tree — left to right",
  left: "Tree — right to left",
  down: "Top-down hierarchy",
};

const finite = z.number().finite().min(-1e6).max(1e6);
const LinkUrl = z
  .string()
  .max(2000)
  .refine(
    (s) => s === "" || /^https?:\/\/\S+$/i.test(s),
    "Links must start with http:// or https://",
  );

export const NodeSchema = z.object({
  id: z.string().min(1).max(64),
  parentId: z.string().min(1).max(64).nullable(),
  title: z.string().max(300),
  x: finite,
  y: finite,
  collapsed: z.boolean().default(false),
  color: z.enum(MAP_COLORS).default("default"),
  textColor: z.enum(TEXT_COLORS).default("default"),
  size: z.enum(NODE_SIZES).default("m"),
  icon: z.enum(NODE_ICONS).default("none"),
  notes: z.string().max(10000).default(""),
  link: LinkUrl.default(""),
});
export const LinkSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().min(1).max(64),
  target: z.string().min(1).max(64),
});
export const MAX_NODES = 2000;
export const DocSchema = z
  .object({
    layout: z.enum(LAYOUTS).default("radial"),
    nodes: z.array(NodeSchema).min(1).max(MAX_NODES),
    links: z.array(LinkSchema).max(MAX_NODES).default([]),
  })
  .superRefine((d, ctx) => {
    const msg = checkStructure(d);
    if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  });

export type MapNode = z.infer<typeof NodeSchema>;
export type MapLink = z.infer<typeof LinkSchema>;
export type MapDoc = { layout: Layout; nodes: MapNode[]; links: MapLink[] };

/** Exactly one root, unique ids, existing parents, no cycles, links between existing distinct nodes. */
export function checkStructure(d: {
  nodes: { id: string; parentId: string | null }[];
  links: MapLink[];
}): string | null {
  const ids = new Set<string>();
  for (const n of d.nodes) {
    if (ids.has(n.id)) return "Duplicate topic id";
    ids.add(n.id);
  }
  const roots = d.nodes.filter((n) => n.parentId === null);
  if (roots.length !== 1) return "A mind map needs exactly one central topic";
  const parent = new Map(d.nodes.map((n) => [n.id, n.parentId]));
  for (const n of d.nodes) {
    if (n.parentId !== null && !ids.has(n.parentId)) return "A topic points to a missing parent";
    let cur: string | null = n.id;
    for (let i = 0; cur !== null; i++) {
      if (i > d.nodes.length) return "Topic hierarchy contains a cycle";
      cur = parent.get(cur) ?? null;
    }
  }
  const linkIds = new Set<string>();
  for (const l of d.links) {
    if (linkIds.has(l.id)) return "Duplicate connection id";
    linkIds.add(l.id);
    if (!ids.has(l.source) || !ids.has(l.target) || l.source === l.target)
      return "A connection points to a missing topic";
  }
  return null;
}

/** Parse anything (API body, imported file) into a valid document or throw a ZodError. */
export const parseDoc = (raw: unknown): MapDoc => DocSchema.parse(raw) as MapDoc;

export const EXPORT_FORMAT = "minddesk-mindmap";
export const ImportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  title: z.string().trim().max(200).default("Imported map"),
  map: DocSchema,
});

export const newId = () => crypto.randomUUID();

export function makeNode(
  p: Partial<MapNode> & { parentId: string | null; x: number; y: number },
): MapNode {
  return {
    id: newId(),
    title: "",
    collapsed: false,
    color: "default",
    textColor: "default",
    size: "m",
    icon: "none",
    notes: "",
    link: "",
    ...p,
  };
}

export function newDoc(title = "Central topic"): MapDoc {
  return {
    layout: "radial",
    nodes: [makeNode({ parentId: null, title, x: 0, y: 0, size: "l", color: "blue" })],
    links: [],
  };
}

// ---------- tree helpers ----------
export function childrenMap(nodes: MapNode[]) {
  const m = new Map<string, MapNode[]>();
  for (const n of nodes)
    if (n.parentId) {
      const arr = m.get(n.parentId);
      if (arr) arr.push(n);
      else m.set(n.parentId, [n]);
    }
  return m;
}
export const rootOf = (doc: MapDoc) => doc.nodes.find((n) => n.parentId === null)!;

/** Node id plus all descendant ids (order: breadth first). */
export function branchIds(nodes: MapNode[], id: string, kids = childrenMap(nodes)): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of kids.get(out[i]!) ?? []) out.push(c.id);
  return out;
}

/** Ids hidden because an ancestor is collapsed. */
export function hiddenIds(nodes: MapNode[]): Set<string> {
  const kids = childrenMap(nodes);
  const hidden = new Set<string>();
  for (const n of nodes)
    if (n.collapsed) for (const id of branchIds(nodes, n.id, kids).slice(1)) hidden.add(id);
  return hidden;
}

export const isDescendant = (nodes: MapNode[], ancestor: string, id: string) =>
  branchIds(nodes, ancestor).includes(id);

// ---------- sizes & placement ----------
export type Size = { w: number; h: number };
const SIZE_H: Record<NodeSize, number> = { s: 34, m: 42, l: 56 };
export function estimateSize(n: MapNode): Size {
  const ch = n.size === "l" ? 10 : n.size === "s" ? 7 : 8;
  const w = Math.min(
    260,
    Math.max(n.size === "l" ? 140 : 90, (n.title || "New topic").length * ch + 40),
  );
  return { w, h: SIZE_H[n.size] };
}
type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box, pad = 14) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** Which side a new child grows to, without moving anything else. */
function growDirection(
  doc: MapDoc,
  parent: MapNode,
  kids: Map<string, MapNode[]>,
): "right" | "left" | "down" {
  if (doc.layout === "down") return "down";
  if (doc.layout === "left") return "left";
  if (doc.layout === "right") return "right";
  if (parent.parentId === null) {
    const ks = kids.get(parent.id) ?? [];
    const right = ks.filter((k) => k.x >= parent.x).length;
    return right > ks.length - right ? "left" : "right";
  }
  const gp = doc.nodes.find((n) => n.id === parent.parentId);
  return gp && parent.x < gp.x ? "left" : "right";
}

/**
 * Find a free spot for a new topic near `anchor`, scanning outward along the cross axis.
 * Existing topics never move.
 */
export function freeSpot(
  doc: MapDoc,
  base: { x: number; y: number },
  size: Size,
  axis: "x" | "y",
  sizeOf: (n: MapNode) => Size,
  ignore = new Set<string>(),
) {
  const hidden = hiddenIds(doc.nodes);
  const boxes = doc.nodes
    .filter((n) => !hidden.has(n.id) && !ignore.has(n.id))
    .map((n) => ({ x: n.x, y: n.y, ...sizeOf(n) }));
  const step = axis === "y" ? size.h + 16 : size.w + 24;
  for (let i = 0; i < 200; i++) {
    const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    const c =
      axis === "y" ? { x: base.x, y: base.y + k * step } : { x: base.x + k * step, y: base.y };
    if (!boxes.some((b) => overlaps({ ...c, w: size.w, h: size.h }, b))) return c;
  }
  return base;
}

export function childSpot(doc: MapDoc, parent: MapNode, sizeOf: (n: MapNode) => Size, size: Size) {
  const kids = childrenMap(doc.nodes);
  const ps = sizeOf(parent);
  const dir = growDirection(doc, parent, kids);
  const siblings = (kids.get(parent.id) ?? []).filter((k) =>
    dir === "down" ? true : dir === "right" ? k.x >= parent.x : k.x < parent.x,
  );
  if (dir === "down") {
    const y = parent.y + ps.h + 70;
    const x = siblings.length
      ? Math.max(...siblings.map((s) => s.x + sizeOf(s).w)) + 24
      : parent.x + ps.w / 2 - size.w / 2;
    return freeSpot(doc, { x, y }, size, "x", sizeOf);
  }
  const x = dir === "right" ? parent.x + ps.w + 70 : parent.x - 70 - size.w;
  const y = siblings.length
    ? Math.max(...siblings.map((s) => s.y + sizeOf(s).h)) + 16
    : parent.y + ps.h / 2 - size.h / 2;
  return freeSpot(doc, { x, y }, size, "y", sizeOf);
}

export function siblingSpot(doc: MapDoc, node: MapNode, sizeOf: (n: MapNode) => Size, size: Size) {
  const ns = sizeOf(node);
  if (doc.layout === "down")
    return freeSpot(doc, { x: node.x + ns.w + 24, y: node.y }, size, "x", sizeOf);
  return freeSpot(doc, { x: node.x, y: node.y + ns.h + 16 }, size, "y", sizeOf);
}

// ---------- explicit Auto Arrange (only ever run on user request) ----------
const H_GAP = 70,
  V_GAP = 14;

/** Positions for the visible subtree of `rootId`, laid out as a tidy tree in `dir`, with rootId kept where it is. */
function treeLayout(
  doc: MapDoc,
  rootId: string,
  dir: "right" | "left" | "down",
  sizeOf: (n: MapNode) => Size,
  onlyKids?: MapNode[],
) {
  const kids = childrenMap(doc.nodes);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const visibleKids = (n: MapNode) => {
    const list = n.id === rootId && onlyKids ? onlyKids : n.collapsed ? [] : (kids.get(n.id) ?? []);
    // Keep the user's current ordering: sort by the cross-axis coordinate.
    return [...list].sort((a, b) => (dir === "down" ? a.x - b.x : a.y - b.y));
  };
  const cross = (n: MapNode) => (dir === "down" ? sizeOf(n).w + 24 : sizeOf(n).h + V_GAP);
  const extent = new Map<string, number>();
  const measure = (n: MapNode): number => {
    const ks = visibleKids(n);
    const own = cross(n);
    const sum = ks.reduce((s, k) => s + measure(k), 0);
    const e = Math.max(own, sum);
    extent.set(n.id, e);
    return e;
  };
  const root = byId.get(rootId)!;
  measure(root);
  const pos = new Map<string, { x: number; y: number }>();
  const place = (n: MapNode, main: number, crossStart: number) => {
    const s = sizeOf(n);
    const e = extent.get(n.id)!;
    const center = crossStart + e / 2;
    if (dir === "down") pos.set(n.id, { x: center - s.w / 2, y: main });
    else pos.set(n.id, { x: dir === "right" ? main : main - s.w, y: center - s.h / 2 });
    const ks = visibleKids(n);
    const total = ks.reduce((t, k) => t + extent.get(k.id)!, 0);
    let c = center - total / 2;
    const nextMain =
      dir === "down" ? main + s.h + 60 : dir === "right" ? main + s.w + H_GAP : main - s.w - H_GAP;
    for (const k of ks) {
      place(k, nextMain, c);
      c += extent.get(k.id)!;
    }
  };
  const rs = sizeOf(root);
  const main0 = dir === "down" ? root.y : dir === "right" ? root.x : root.x + rs.w;
  place(
    root,
    main0,
    dir === "down"
      ? root.x + rs.w / 2 - extent.get(root.id)! / 2
      : root.y + rs.h / 2 - extent.get(root.id)! / 2,
  );
  // Anchor: keep the arranged root exactly where it was.
  const p0 = pos.get(rootId)!;
  const dx = root.x - p0.x,
    dy = root.y - p0.y;
  for (const [id, p] of pos) pos.set(id, { x: p.x + dx, y: p.y + dy });
  return pos;
}

/** Apply new positions; hidden (collapsed) descendants follow their visible ancestor so expanding restores them in place. */
function applyPositions(doc: MapDoc, pos: Map<string, { x: number; y: number }>): MapDoc {
  const kids = childrenMap(doc.nodes);
  const delta = new Map<string, { dx: number; dy: number }>();
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const [id, p] of pos) {
    const n = byId.get(id)!;
    delta.set(id, { dx: p.x - n.x, dy: p.y - n.y });
    if (n.collapsed)
      for (const h of branchIds(doc.nodes, id, kids).slice(1))
        delta.set(h, { dx: p.x - n.x, dy: p.y - n.y });
  }
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const d = delta.get(n.id);
      return d ? { ...n, x: n.x + d.dx, y: n.y + d.dy } : n;
    }),
  };
}

export function arrange(doc: MapDoc, sizeOf: (n: MapNode) => Size, branchId?: string): MapDoc {
  const root = rootOf(doc);
  const target = branchId ? (doc.nodes.find((n) => n.id === branchId) ?? root) : root;
  if (target.id !== root.id) {
    const parent = doc.nodes.find((n) => n.id === target.parentId)!;
    const dir =
      doc.layout === "down"
        ? "down"
        : doc.layout === "radial"
          ? target.x < parent.x
            ? "left"
            : "right"
          : doc.layout;
    return applyPositions(doc, treeLayout(doc, target.id, dir, sizeOf));
  }
  if (doc.layout !== "radial")
    return applyPositions(doc, treeLayout(doc, root.id, doc.layout, sizeOf));
  // Standard map: split main topics between the right and left side (keeping their current side order).
  const ks = root.collapsed ? [] : (childrenMap(doc.nodes).get(root.id) ?? []);
  const ordered = [...ks].sort((a, b) => {
    const ang = (n: MapNode) => {
      const a2 = Math.atan2(n.y - root.y, n.x - root.x);
      return n.x >= root.x ? a2 : Math.PI * 2 - a2;
    };
    return (a.x >= root.x ? 0 : 10) - (b.x >= root.x ? 0 : 10) || ang(a) - ang(b);
  });
  const half = Math.ceil(ordered.length / 2);
  const right = ordered.slice(0, half),
    left = ordered.slice(half);
  const pos = new Map([
    ...treeLayout(doc, root.id, "right", sizeOf, right),
    ...treeLayout(doc, root.id, "left", sizeOf, left),
  ]);
  pos.set(root.id, { x: root.x, y: root.y });
  return applyPositions(doc, pos);
}

export {
  normalizeMindMapImport,
  parseMindMapJson,
  type NormalizedMindMap,
  type DetectedFormat,
} from "./mindmap-import";
