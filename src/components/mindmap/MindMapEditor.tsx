import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, getNodesBounds, getViewportForBounds,
  useReactFlow, type Edge, type NodeChange, type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle, ArrowLeft, Check, ChevronDown, ChevronUp, CornerDownRight, Crosshair, Download, FileText, Keyboard, LayoutGrid, Loader2,
  Lock, LockOpen, Maximize, Minus, MoreHorizontal, Plus, Redo2, RotateCcw, Search, SlidersHorizontal, Trash2, Undo2, X,
} from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { api, ApiRequestError } from "@/lib/api-client";
import type { MindMapFull, MindMapMeta } from "@/lib/mindmaps";
import {
  EXPORT_FORMAT, LAYOUTS, LAYOUT_LABEL, MAP_COLORS, arrange, branchIds, childSpot, childrenMap, estimateSize,
  hiddenIds, makeNode, newId, rootOf, siblingSpot, type Layout, type MapDoc, type MapNode, type Size,
} from "@/lib/mindmap-doc";
import { FloatingEdge, MapCtx, TopicNode, colorVar, type TopicRFNode } from "./parts";
import { NodePanel, type NodeActions, type PanelTab } from "./NodePanel";
import { ContextToolbar } from "./ContextToolbar";
import { ExportMindMapDialog } from "./ExportMindMapDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const nodeTypes = { topic: TopicNode };
const edgeTypes = { floating: FloatingEdge };
const HISTORY_LIMIT = 100;
type Status = "saved" | "saving" | "error" | "conflict";
const BRANCH_COLORS = MAP_COLORS.filter((c) => c !== "default" && c !== "gray");

export function MindMapEditor(props: { map: MindMapFull }) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>;
}

function Editor({ map }: { map: MindMapFull }) {
  const rf = useReactFlow();
  const isMobile = useIsMobile();
  const [doc, setDocState] = useState<MapDoc>(map.data);
  const docRef = useRef(doc);
  const [title, setTitle] = useState(map.title);
  const [isLocked, setIsLocked] = useState(Boolean(map.is_locked));
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const [lockLoading, setLockLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [inspector, setInspector] = useState<PanelTab | null>(null);
  const [dragging, setDragging] = useState(false);
  // Opening the inspector only moves the camera (never topics) so the selected topic stays visible beside it.
  useEffect(() => {
    if (!inspector || isMobile || !selectedId || !wrapRef.current) return;
    const el = wrapRef.current.querySelector<HTMLElement>(`.react-flow__node[data-id="${selectedId}"]`); if (!el) return;
    const { x, zoom, y } = rf.getViewport();
    const box = wrapRef.current.getBoundingClientRect();
    const right = el.getBoundingClientRect().right - box.left;
    const limit = box.width - 312 - 24;
    if (right > limit) rf.setViewport({ x: x - (right - limit), y, zoom }, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspector !== null, selectedId]);
  useEffect(() => {
    const t = setTimeout(() => { rf.fitView({ padding: 0.25, duration: 250 }); }, 120);
    return () => clearTimeout(t);
  }, [rf]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const [, bump] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pending = useRef("");
  // Mirrors editingId synchronously so keys typed right after Tab/Enter (before re-render) are buffered.
  const editingRef = useRef<string | null>(null);
  editingRef.current = editingId;

  // ---------- sizes measured by the canvas (fallback: estimate) ----------
  const sizes = useRef(new Map<string, Size>());
  const [sizeTick, setSizeTick] = useState(0);
  const sizeOf = useCallback((n: MapNode) => sizes.current.get(n.id) ?? estimateSize(n), []);

  // ---------- history ----------
  const past = useRef<MapDoc[]>([]);
  const future = useRef<MapDoc[]>([]);
  const lastKey = useRef<{ key: string; t: number } | null>(null);
  const pushHistory = (snapshot: MapDoc) => {
    past.current.push(snapshot);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
  };

  // ---------- autosave (one request in flight, version checked) ----------
  const [status, setStatus] = useState<Status>("saved");
  const version = useRef(map.version);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflict = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current || !dirty.current || conflict.current) return;
    dirty.current = false;
    inFlight.current = true;
    setStatus("saving");
    try {
      const res = await api<MindMapMeta>(`/api/mind-maps/${map.id}`, { method: "PATCH", body: { data: docRef.current, base_version: version.current } });
      version.current = res.version;
      inFlight.current = false;
      if (dirty.current) void flush(); else setStatus("saved");
    } catch (e) {
      inFlight.current = false;
      dirty.current = true;
      if (e instanceof ApiRequestError && e.status === 409) { conflict.current = true; setStatus("conflict"); }
      else if (e instanceof ApiRequestError && e.status === 423) {
        setIsLocked(true);
        isLockedRef.current = true;
        dirty.current = false;
        setStatus("saved");
        toast.error("This mind map is locked. Edits were not saved.");
      }
      else setStatus("error");
    }
  }, [map.id]);

  const toggleLock = async () => {
    if (lockLoading) return;
    const targetLocked = !isLocked;
    if (targetLocked && (dirty.current || timer.current)) {
      await flush();
      if (dirty.current || conflict.current) {
        toast.error("Please wait for pending changes to save before locking.");
        return;
      }
    }
    setLockLoading(true);
    try {
      const res = await api<MindMapMeta>(`/api/mind-maps/${map.id}`, {
        method: "PATCH",
        body: { is_locked: targetLocked },
      });
      setIsLocked(res.is_locked);
      isLockedRef.current = res.is_locked;
      if (res.is_locked) {
        setEditingId(null);
        setConnectFrom(null);
        if (inspector === "style" || inspector === "details") {
          setInspector(null);
        }
        toast.success("Mind map locked (read-only)");
      } else {
        toast.success("Mind map unlocked");
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 423) {
        toast.error("Mind map is locked.");
      } else {
        toast.error("Failed to update lock state");
      }
    } finally {
      setLockLoading(false);
    }
  };

  const setDoc = useCallback((next: MapDoc) => {
    if (isLockedRef.current) return;
    docRef.current = next;
    setDocState(next);
    dirty.current = true;
    if (!inFlight.current && !conflict.current) setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }, [flush]);

  /** Change with undo support. Edits sharing `key` within 1.5s merge into one undo step (typing). */
  const commit = useCallback((next: MapDoc, key?: string) => {
    if (isLockedRef.current) return;
    const now = Date.now();
    const merge = key && lastKey.current?.key === key && now - lastKey.current.t < 1500;
    if (!merge) pushHistory(docRef.current);
    lastKey.current = key ? { key, t: now } : null;
    setDoc(next);
    bump((x) => x + 1);
  }, [setDoc]);

  const undo = useCallback(() => {
    if (isLockedRef.current) return;
    const prev = past.current.pop(); if (!prev) return;
    future.current.push(docRef.current); lastKey.current = null; setDoc(prev); bump((x) => x + 1);
  }, [setDoc]);
  const redo = useCallback(() => {
    if (isLockedRef.current) return;
    const next = future.current.pop(); if (!next) return;
    past.current.push(docRef.current); lastKey.current = null; setDoc(next); bump((x) => x + 1);
  }, [setDoc]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current || inFlight.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); void flush(); };
  }, [flush]);

  // ---------- derived ----------
  const kids = useMemo(() => childrenMap(doc.nodes), [doc.nodes]);
  const hidden = useMemo(() => hiddenIds(doc.nodes), [doc.nodes]);
  const byId = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes]);
  const root = rootOf(doc);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? doc.nodes.filter((n) => n.title.toLowerCase().includes(q) || n.notes.toLowerCase().includes(q)) : [];
  }, [doc.nodes, query]);
  const matchSet = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);

  const rfNodes = useMemo<TopicRFNode[]>(() => doc.nodes.filter((n) => !hidden.has(n.id)).map((n) => {
    const s = sizes.current.get(n.id);
    return {
      id: n.id, type: "topic", position: { x: n.x, y: n.y }, selected: n.id === selectedId,
      draggable: !isLocked,
      ...(s ? { measured: { width: s.w, height: s.h } } : {}),
      data: {
        node: n, isRoot: n.parentId === null, childCount: kids.get(n.id)?.length ?? 0,
        hiddenCount: n.collapsed ? branchIds(doc.nodes, n.id, kids).length - 1 : 0,
        match: matchSet.has(n.id), drop: n.id === dropTarget, connecting: !!connectFrom,
        isLocked,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [doc.nodes, hidden, kids, selectedId, matchSet, dropTarget, connectFrom, sizeTick, isLocked]);

  const rfEdges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const branchColor = (n: MapNode) => {
      let cur: MapNode | undefined = n;
      while (cur && cur.color === "default" && cur.parentId) cur = byId.get(cur.parentId);
      return cur && cur.parentId !== null && cur.color !== "default" ? colorVar(cur.color) : undefined;
    };
    for (const n of doc.nodes) if (n.parentId && !hidden.has(n.id))
      out.push({ id: `t-${n.id}`, source: n.parentId, target: n.id, type: "floating", selectable: false, focusable: false, data: { kind: "tree", color: branchColor(n) } });
    for (const l of doc.links) if (!hidden.has(l.source) && !hidden.has(l.target))
      out.push({ id: l.id, source: l.source, target: l.target, type: "floating", selected: l.id === selectedLink, data: { kind: "link" }, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)", width: 16, height: 16 } });
    return out;
  }, [doc.nodes, doc.links, hidden, byId, selectedLink]);

  const dropRef = useRef<string | null>(null);
  const drag = useRef<{ ids: Set<string>; moved: boolean } | null>(null);
  const onNodesChange = useCallback((changes: NodeChange<TopicRFNode>[]) => {
    let changed = false;
    for (const c of changes) if (c.type === "dimensions" && c.dimensions) {
      const prev = sizes.current.get(c.id);
      if (!prev || prev.w !== c.dimensions.width || prev.h !== c.dimensions.height) {
        sizes.current.set(c.id, { w: c.dimensions.width, h: c.dimensions.height }); changed = true;
      }
    }
    if (changed) setSizeTick((x) => x + 1);
    const g = drag.current;
    for (const c of changes) if (c.type === "position" && c.position && g && !isLockedRef.current) {
      const d = docRef.current;
      const cur = d.nodes.find((n) => n.id === c.id); if (!cur) continue;
      const dx = c.position.x - cur.x, dy = c.position.y - cur.y;
      if (!dx && !dy) continue;
      g.moved = true;
      setDoc({ ...d, nodes: d.nodes.map((n) => (g.ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) });
    }
  }, [setDoc]);

  // ---------- operations ----------
  const select = (id: string | null) => { setSelectedId(id); setSelectedLink(null); };

  const addChild = useCallback((parentId: string) => {
    if (isLockedRef.current) return;
    let d = docRef.current;
    const parent = d.nodes.find((n) => n.id === parentId); if (!parent) return;
    if (parent.collapsed) d = { ...d, nodes: d.nodes.map((n) => (n.id === parentId ? { ...n, collapsed: false } : n)) };
    const depth1 = parent.parentId === null;
    const color = depth1 ? BRANCH_COLORS[(childrenMap(d.nodes).get(parentId)?.length ?? 0) % BRANCH_COLORS.length]! : parent.color;
    const draft = makeNode({ parentId, x: 0, y: 0, color, size: depth1 ? "m" : "s" });
    const spot = childSpot(d, d.nodes.find((n) => n.id === parentId)!, sizeOf, estimateSize(draft));
    const node = { ...draft, ...spot };
    commit({ ...d, nodes: [...d.nodes, node] });
    pending.current = ""; editingRef.current = node.id; select(node.id); setEditingId(node.id);
  }, [commit, sizeOf]);

  const addSibling = useCallback((id: string) => {
    if (isLockedRef.current) return;
    const d = docRef.current;
    const n = d.nodes.find((x) => x.id === id); if (!n) return;
    if (!n.parentId) return addChild(id);
    const draft = makeNode({ parentId: n.parentId, x: 0, y: 0, color: n.color, size: n.size });
    const node = { ...draft, ...siblingSpot(d, n, sizeOf, estimateSize(draft)) };
    commit({ ...d, nodes: [...d.nodes, node] });
    pending.current = ""; editingRef.current = node.id; select(node.id); setEditingId(node.id);
  }, [addChild, commit, sizeOf]);

  const removeNode = useCallback((id: string) => {
    if (isLockedRef.current) return;
    const d = docRef.current;
    const n = d.nodes.find((x) => x.id === id); if (!n?.parentId) return;
    const gone = new Set(branchIds(d.nodes, id));
    commit({ ...d, nodes: d.nodes.filter((x) => !gone.has(x.id)), links: d.links.filter((l) => !gone.has(l.source) && !gone.has(l.target)) });
    select(n.parentId);
  }, [commit]);

  const duplicate = useCallback((id: string) => {
    if (isLockedRef.current) return;
    const d = docRef.current;
    const n = d.nodes.find((x) => x.id === id); if (!n?.parentId) return;
    const ids = branchIds(d.nodes, id);
    const remap = new Map(ids.map((i) => [i, newId()]));
    const spot = siblingSpot(d, n, sizeOf, sizeOf(n));
    const dx = spot.x - n.x, dy = spot.y - n.y;
    const copies = ids.map((i) => {
      const o = d.nodes.find((x) => x.id === i)!;
      return { ...o, id: remap.get(i)!, parentId: i === id ? o.parentId : remap.get(o.parentId!)!, x: o.x + dx, y: o.y + dy };
    });
    const links = d.links.filter((l) => remap.has(l.source) && remap.has(l.target)).map((l) => ({ id: newId(), source: remap.get(l.source)!, target: remap.get(l.target)! }));
    commit({ ...d, nodes: [...d.nodes, ...copies], links: [...d.links, ...links] });
    select(remap.get(id)!);
  }, [commit, sizeOf]);

  const update = useCallback((id: string, patch: Partial<MapNode>, key?: string) => {
    if (isLockedRef.current) return;
    const d = docRef.current;
    commit({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }, key);
  }, [commit]);

  const toggleCollapse = useCallback((id: string) => {
    if (isLockedRef.current) return;
    const n = docRef.current.nodes.find((x) => x.id === id); if (!n) return;
    update(id, { collapsed: !n.collapsed });
  }, [update]);

  const commitTitle = useCallback((id: string, t: string) => {
    editingRef.current = null;
    setEditingId(null);
    if (isLockedRef.current) return;
    const n = docRef.current.nodes.find((x) => x.id === id);
    if (n && n.title !== t) update(id, { title: t || (n.parentId ? "New topic" : "Central topic") });
    wrapRef.current?.focus();
  }, [update]);

  const doArrange = useCallback((branch?: string) => {
    if (isLockedRef.current) return;
    commit(arrange(docRef.current, sizeOf, branch));
    toast.success(branch ? "Branch arranged" : "Map arranged", { action: { label: "Undo", onClick: undo } });
  }, [commit, sizeOf, undo]);

  const setLayout = (l: Layout) => {
    if (isLockedRef.current) return;
    commit(arrange({ ...docRef.current, layout: l }, sizeOf));
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
    toast.success(`Layout: ${LAYOUT_LABEL[l]}`, { action: { label: "Undo", onClick: undo } });
  };

  const addLink = (source: string, target: string) => {
    if (isLockedRef.current) return;
    const d = docRef.current;
    setConnectFrom(null);
    if (source === target) return;
    if (d.links.some((l) => (l.source === source && l.target === target) || (l.source === target && l.target === source))) {
      toast("Those topics are already connected"); return;
    }
    commit({ ...d, links: [...d.links, { id: newId(), source, target }] });
  };
  const removeLink = (id: string) => {
    if (isLockedRef.current) return;
    const d = docRef.current;
    commit({ ...d, links: d.links.filter((l) => l.id !== id) });
    setSelectedLink(null);
  };

  // ---------- drag: moves the whole branch (Alt/Option = only this topic); drop on a topic to reparent ----------
  const onNodeDragStart: OnNodeDrag<TopicRFNode> = (e, node) => {
    if (isLockedRef.current) return;
    pushHistory(docRef.current); lastKey.current = null;
    const alt = "altKey" in e && (e as MouseEvent).altKey;
    drag.current = { ids: new Set(alt ? [node.id] : branchIds(docRef.current.nodes, node.id)), moved: false };
    select(node.id); setDragging(true);
  };
  const onNodeDrag: OnNodeDrag<TopicRFNode> = (e, node) => {
    if (isLockedRef.current) return;
    const g = drag.current; if (!g) return;
    const cur = docRef.current.nodes.find((n) => n.id === node.id);
    if (!cur?.parentId) return;
    // The drop target is the topic under the pointer (not just any overlap), excluding the dragged branch.
    const pt = "touches" in e ? (e as TouchEvent).touches[0] ?? (e as TouchEvent).changedTouches[0] : (e as MouseEvent);
    const overId = pt ? document.elementsFromPoint(pt.clientX, pt.clientY)
      .map((el) => el.closest<HTMLElement>(".react-flow__node")?.dataset["id"])
      .find((id) => id && !g.ids.has(id)) : undefined;
    const t = overId && overId !== cur.parentId ? overId : null;
    if (t !== dropRef.current) { dropRef.current = t; setDropTarget(t); }
  };
  const onNodeDragStop: OnNodeDrag<TopicRFNode> = (_e, node) => {
    if (isLockedRef.current) { drag.current = null; setDragging(false); return; }
    const g = drag.current; drag.current = null; setDragging(false);
    const target = dropRef.current; dropRef.current = null; setDropTarget(null);
    if (!g) return;
    if (!g.moved) { past.current.pop(); return; }
    const d = docRef.current;
    const n = d.nodes.find((x) => x.id === node.id);
    if (!target || !n?.parentId) { bump((x) => x + 1); return; }
    const branch = new Set(branchIds(d.nodes, n.id));
    if (branch.has(target)) { toast.error("A topic can't be moved inside its own branch"); return; }
    const reparented = { ...d, nodes: d.nodes.map((x) => (x.id === n.id ? { ...x, parentId: target, ...(x.color !== "default" && d.nodes.find((p) => p.id === target)?.parentId ? { color: d.nodes.find((p) => p.id === target)!.color } : {}) } : x)) };
    const parent = reparented.nodes.find((x) => x.id === target)!;
    const withoutBranch = { ...reparented, nodes: reparented.nodes.filter((x) => !branch.has(x.id)) };
    const spot = childSpot(withoutBranch, parent, sizeOf, sizeOf(n));
    const dx = spot.x - n.x, dy = spot.y - n.y;
    const finalDoc = { ...reparented, nodes: reparented.nodes.map((x) => (branch.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)) };
    if (parent.collapsed) finalDoc.nodes = finalDoc.nodes.map((x) => (x.id === parent.id ? { ...x, collapsed: false } : x));
    setDoc(finalDoc); bump((x) => x + 1);
    toast.success(`Moved under "${parent.title || "topic"}"`, { action: { label: "Undo", onClick: undo } });
  };

  // ---------- view ----------
  const focusNode = useCallback((id: string) => {
    const n = docRef.current.nodes.find((x) => x.id === id); if (!n) return;
    const s = sizeOf(n);
    rf.setCenter(n.x + s.w / 2, n.y + s.h / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: 300 });
  }, [rf, sizeOf]);
  const goToMatch = (i: number) => {
    if (!matches.length) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    setHit(idx);
    const m = matches[idx]!;
    const d = docRef.current;
    if (hiddenIds(d.nodes).has(m.id)) {
      const anc = new Set<string>();
      let cur = d.nodes.find((x) => x.id === m.id)?.parentId ?? null;
      while (cur) { anc.add(cur); cur = d.nodes.find((x) => x.id === cur)?.parentId ?? null; }
      commit({ ...d, nodes: d.nodes.map((x) => (anc.has(x.id) && x.collapsed ? { ...x, collapsed: false } : x)) });
    }
    select(m.id);
    setTimeout(() => focusNode(m.id), 30);
  };
  const resetView = () => {
    const s = sizeOf(root);
    const el = wrapRef.current!;
    rf.setViewport({ x: el.clientWidth / 2 - (root.x + s.w / 2), y: el.clientHeight / 2 - (root.y + s.h / 2), zoom: 1 }, { duration: 300 });
  };

  // ---------- export ----------
  const download = (href: string, name: string) => { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); };
  const fileBase = (title.trim() || "mind-map").replace(/[^\w\- ]+/g, "").slice(0, 60) || "mind-map";
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ format: EXPORT_FORMAT, version: 1, title, map: docRef.current }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(url, `${fileBase}.minddesk.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportImage = async (kind: "png" | "svg") => {
    const el = wrapRef.current?.querySelector<HTMLElement>(".react-flow__viewport"); if (!el) return;
    const bounds = getNodesBounds(rf.getNodes());
    const w = Math.min(4000, Math.max(400, bounds.width + 160)), h = Math.min(4000, Math.max(300, bounds.height + 160));
    const vp = getViewportForBounds(bounds, w, h, 0.1, 2, 0.05);
    const bg = getComputedStyle(wrapRef.current!).backgroundColor;
    const opts = { backgroundColor: bg, width: w, height: h, style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } };
    try {
      download(kind === "png" ? await toPng(el, { ...opts, pixelRatio: 2 }) : await toSvg(el, opts), `${fileBase}.${kind}`);
    } catch {
      toast.error("Couldn't create the image");
    }
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (isLockedRef.current) {
        // Locked mode: Only navigation/view shortcuts are permitted
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); document.getElementById("mm-search")?.focus(); return; }
        if (e.key === "Escape") { select(null); setInspector(null); return; }
        return;
      }
      if (editingRef.current) {
        // The new topic's text box mounts a moment after Tab/Enter; buffer keys typed meanwhile.
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key.length === 1) { e.preventDefault(); pending.current += e.key; }
        else if (e.key === "Backspace") { e.preventDefault(); pending.current = pending.current.slice(0, -1); }
        else if (e.key === "Enter" && pending.current && !pending.current.includes("\n")) { e.preventDefault(); pending.current += "\n"; }
        return;
      }
      if (document.querySelector("[role=dialog]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); document.getElementById("mm-search")?.focus(); return; }
      if (e.key === "Escape") { setConnectFrom(null); select(null); return; }
      if (selectedLink && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); removeLink(selectedLink); return; }
      const sel = selectedId; if (!sel) return;
      if (e.key === "Tab") { e.preventDefault(); addChild(sel); }
      else if (e.key === "Enter") { e.preventDefault(); addSibling(sel); }
      else if (e.key === "F2" || e.key === " ") { e.preventDefault(); setEditingId(sel); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeNode(sel); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(sel); }
      else if (e.key === "." || e.key === "/") { e.preventDefault(); toggleCollapse(sel); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const renameMap = async () => {
    if (isLockedRef.current) return;
    const t = title.trim();
    if (!t) { setTitle(map.title); return; }
    try { await api(`/api/mind-maps/${map.id}`, { method: "PATCH", body: { title: t } }); }
    catch { toast.error("Couldn't rename mind map"); }
  };

  const sel = selectedId ? byId.get(selectedId) : undefined;
  const actions: NodeActions | null = sel ? {
    update: (p, k) => update(sel.id, p, k), addChild: () => addChild(sel.id), addSibling: () => addSibling(sel.id),
    duplicate: () => duplicate(sel.id), remove: () => { removeNode(sel.id); setInspector(null); },
    toggleCollapse: () => toggleCollapse(sel.id), connect: () => { setConnectFrom(sel.id); setInspector(null); },
    arrangeBranch: () => doArrange(sel.id),
  } : null;
  const ctx = useMemo(() => ({ editingId, takePending: () => { const t = pending.current; pending.current = ""; return t; }, commitTitle, cancelEdit: () => setEditingId(null), toggleCollapse }), [editingId, commitTitle, toggleCollapse]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-background px-2 py-2 md:px-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to mind maps"><Link to="/mind-maps"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <Input value={title} maxLength={200} aria-label="Mind map name" onChange={(e) => setTitle(e.target.value)} onBlur={renameMap}
          disabled={isLocked} readOnly={isLocked}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cn("h-8 w-36 border-transparent bg-transparent font-medium shadow-none md:w-56", !isLocked ? "hover:border-border" : "cursor-default opacity-85")} />
        {isLocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 select-none">
            <Lock className="h-3 w-3" />
            <span>Locked</span>
          </span>
        ) : (
          <SaveBadge status={status} onRetry={() => { setStatus("saving"); void flush(); }} />
        )}
        <div className="ml-auto flex items-center gap-1">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isLocked ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={isLocked ? "Unlock Mind Map" : "Lock Mind Map"}
                  title={isLocked ? "Unlock Mind Map" : "Lock Mind Map"}
                  disabled={lockLoading}
                  onClick={toggleLock}
                  className={cn(
                    "relative transition-all duration-200",
                    isLocked && "border border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                  )}
                >
                  {lockLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isLocked ? (
                    <Lock className="h-4 w-4 transition-transform duration-200" />
                  ) : (
                    <LockOpen className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isLocked ? "Unlock Mind Map" : "Lock Mind Map"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button variant="ghost" size="icon" title="Undo (Ctrl/⌘+Z)" aria-label="Undo" onClick={undo} disabled={isLocked || !past.current.length}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo" onClick={redo} disabled={isLocked || !future.current.length}><Redo2 className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1.5" disabled={isLocked}><LayoutGrid className="h-4 w-4" /><span className="hidden sm:inline">Auto arrange</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => doArrange()}>Arrange whole map</DropdownMenuItem>
              <DropdownMenuItem disabled={!sel} onSelect={() => sel && doArrange(sel.id)}>Arrange selected branch</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Layout (rearranges the map)</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={doc.layout} onValueChange={(v) => setLayout(v as Layout)}>
                {LAYOUTS.map((l) => <DropdownMenuRadioItem key={l} value={l}>{LAYOUT_LABEL[l]}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Export" title="Export"><Download className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={exportJson}>Full backup (.json, re-importable)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPdfDialogOpen(true)}>
                <FileText className="mr-2 h-4 w-4 text-primary" />
                <span>PDF (.pdf)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportImage("png")}>Image (.png)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportImage("svg")}>Image (.svg)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" className="hidden md:inline-flex" onClick={() => setHelpOpen(true)}><Keyboard className="h-4 w-4" /></Button>
        </div>
      </div>

      {status === "conflict" && (
        <div className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="flex-1">This mind map was changed on another device. Your latest edits here were not saved.</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}

      <div ref={wrapRef} tabIndex={-1} className="relative flex-1 overflow-hidden touch-none overscroll-none bg-[var(--mm-canvas)] outline-none">
        <MapCtx.Provider value={ctx}>
          <ReactFlow className="mm-canvas"
            nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode="dark"
            onNodesChange={onNodesChange}
            onNodeClick={(_e, n) => { if (connectFrom && !isLocked) addLink(connectFrom, n.id); else select(n.id); }}
            onNodeDoubleClick={(_e, n) => { select(n.id); if (!isLocked) setEditingId(n.id); else setInspector("content"); }}
            onEdgeClick={(_e, ed) => { if (!ed.id.startsWith("t-")) { setSelectedLink(ed.id); setSelectedId(null); } }}
            onPaneClick={() => { select(null); setConnectFrom(null); setInspector(null); }}
            onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
            nodesDraggable={!isLocked}
            nodesConnectable={false} elementsSelectable={false} selectNodesOnDrag={false} nodeDragThreshold={4}
            zoomOnDoubleClick={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null}
            minZoom={0.15} maxZoom={2.5} fitView fitViewOptions={{ padding: 0.25, maxZoom: 1.1, minZoom: 0.35 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="var(--mm-dot)" bgColor="var(--mm-canvas)" />
            {!isMobile && <MiniMap pannable zoomable className="!rounded-xl !border !bg-card" maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
              nodeColor={(n) => { const c = (n.data as { node: MapNode }).node.color; return c === "default" ? "var(--muted-foreground)" : colorVar(c); }} />}
          </ReactFlow>
        </MapCtx.Provider>

        {/* search */}
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full border bg-card/95 py-1 pl-3 pr-1 shadow-sm backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input id="mm-search" value={query} placeholder="Search topics" aria-label="Search topics"
            onChange={(e) => { setQuery(e.target.value); setHit(0); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goToMatch(e.shiftKey ? hit - 1 : matches.length && selectedId === matches[hit]?.id ? hit + 1 : hit); } if (e.key === "Escape") setQuery(""); }}
            className="w-28 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-40" />
          {query && (
            <>
              <span className="px-1 text-xs tabular-nums text-muted-foreground">{matches.length ? `${hit + 1}/${matches.length}` : "0"}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous result" onClick={() => goToMatch(hit - 1)} disabled={!matches.length}><ChevronUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Next result" onClick={() => goToMatch(hit + 1)} disabled={!matches.length}><ChevronDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Clear search" onClick={() => setQuery("")}><X className="h-4 w-4" /></Button>
            </>
          )}
        </div>

        {/* view controls */}
        <div className={cn("absolute flex flex-col overflow-hidden rounded-xl border bg-card/95 shadow-sm backdrop-blur", isMobile ? "right-3 top-3" : "bottom-3 left-3")}>
          <Button variant="ghost" size="icon" className="rounded-none" title="Zoom in" aria-label="Zoom in" onClick={() => rf.zoomIn({ duration: 200 })}><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="rounded-none" title="Zoom out" aria-label="Zoom out" onClick={() => rf.zoomOut({ duration: 200 })}><Minus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="rounded-none" title="Fit to screen" aria-label="Fit to screen" onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}><Maximize className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="rounded-none" title="Center on central topic" aria-label="Center on central topic" onClick={() => focusNode(root.id)}><Crosshair className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="rounded-none" title="Reset view" aria-label="Reset view" onClick={resetView}><RotateCcw className="h-4 w-4" /></Button>
        </div>

        {connectFrom && (
          <div className="absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-4 py-2 text-sm shadow-lg">
            Tap another topic to connect it
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConnectFrom(null)}>Cancel</Button>
          </div>
        )}

        {selectedLink && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-sm shadow-lg">
            Connection selected
            {!isLocked && (
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-destructive hover:text-destructive" onClick={() => removeLink(selectedLink)}><Trash2 className="h-4 w-4" />Remove</Button>
            )}
          </div>
        )}

        {/* floating quick actions (desktop) */}
        {!isMobile && sel && actions && !inspector && !connectFrom && !dragging && editingId !== sel.id && !isLocked && (
          <TooltipProvider delayDuration={300}>
            <ContextToolbar key={sel.id} node={sel} isRoot={!sel.parentId} childCount={kids.get(sel.id)?.length ?? 0} actions={actions}
              onEdit={() => setEditingId(sel.id)} onInspect={setInspector} container={wrapRef.current} reservedRight={inspector ? 312 : 0} />
          </TooltipProvider>
        )}

        {/* desktop read-only action button when locked */}
        {!isMobile && sel && !inspector && !connectFrom && isLocked && (
          <div className="mm-fade-in absolute bottom-3 right-3 z-10">
            <Button variant="secondary" size="sm" onClick={() => setInspector("content")} className="gap-1.5 shadow-md border">
              <FileText className="h-4 w-4" />
              View notes & details
            </Button>
          </div>
        )}

        {/* desktop inspector — closed by default, opened from the toolbar */}
        {!isMobile && sel && actions && inspector && !connectFrom && (
          <div className="mm-fade-in absolute bottom-3 right-3 top-3 z-10 w-[296px] overflow-y-auto rounded-2xl border bg-card/95 p-4 shadow-xl backdrop-blur">
            <NodePanel node={sel} isRoot={!sel.parentId} childCount={kids.get(sel.id)?.length ?? 0} actions={actions}
              tab={inspector} onTab={setInspector} onClose={() => setInspector(null)} readOnly={isLocked} />
          </div>
        )}

        {/* mobile action bar */}
        {isMobile && sel && actions && !connectFrom && !editingId && (
          isLocked ? (
            <div className="mm-fade-in absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-center rounded-2xl border bg-popover/95 p-1.5 shadow-lg backdrop-blur">
              <MobileBtn label="Notes & Details" onClick={() => setInspector("content")}><FileText className="h-5 w-5" /></MobileBtn>
            </div>
          ) : (
            <div className="mm-fade-in absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-around rounded-2xl border bg-popover/95 p-1.5 shadow-lg backdrop-blur">
              <MobileBtn label="Child" onClick={actions.addChild}><CornerDownRight className="h-5 w-5" /></MobileBtn>
              <MobileBtn label="Sibling" onClick={actions.addSibling} disabled={!sel.parentId}><Plus className="h-5 w-5" /></MobileBtn>
              <MobileBtn label="Rename" onClick={() => setEditingId(sel.id)}><span className="text-base font-semibold leading-none">Aa</span></MobileBtn>
              <MobileBtn label="Style" onClick={() => setInspector("style")}><SlidersHorizontal className="h-5 w-5" /></MobileBtn>
              <MobileBtn label="More" onClick={() => setInspector("details")}><MoreHorizontal className="h-5 w-5" /></MobileBtn>
            </div>
          )
        )}
      </div>

      {isMobile && (
        <Sheet open={!!inspector && !!sel} onOpenChange={(o) => !o && setInspector(null)}>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="mb-2 p-0"><SheetTitle className="text-sm">{sel?.title || "Topic"}</SheetTitle></SheetHeader>
            {sel && actions && inspector && <NodePanel node={sel} isRoot={!sel.parentId} childCount={kids.get(sel.id)?.length ?? 0} actions={actions} tab={inspector} onTab={setInspector} readOnly={isLocked} />}
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Shortcuts & tips</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {[
              ["Tab", "Add child topic"], ["Enter", "Add sibling topic"], ["F2 / Space / double-click", "Edit title"],
              ["Delete / Backspace", "Delete topic (or selected connection)"], ["Ctrl/⌘ + D", "Duplicate branch"],
              [". or /", "Collapse / expand branch"], ["Ctrl/⌘ + Z", "Undo"], ["Ctrl/⌘ + Shift + Z, Ctrl + Y", "Redo"],
              ["Ctrl/⌘ + F", "Search topics"], ["Esc", "Deselect / cancel"],
              ["Drag", "Move topic with its branch"], ["Alt/Option + drag", "Move only this topic"],
              ["Drop onto a topic", "Move branch under that topic"],
            ].map(([k, v]) => (
              <div key={k} className="contents"><dt><kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">{k}</kbd></dt><dd className="text-muted-foreground">{v}</dd></div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <ExportMindMapDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        viewportElement={wrapRef.current?.querySelector<HTMLElement>(".react-flow__viewport") ?? null}
        nodes={rf.getNodes()}
        title={title}
        canvasBgColor={wrapRef.current ? getComputedStyle(wrapRef.current).backgroundColor : undefined}
        onBeforeExport={() => {
          if (editingId) {
            const el = document.querySelector<HTMLTextAreaElement>(".mm-node textarea");
            commitTitle(editingId, el?.value ?? "");
          }
          setSelectedId(null);
        }}
      />
    </div>
  );
}

function MobileBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] text-muted-foreground active:bg-accent disabled:opacity-40">
      {children}{label}
    </button>
  );
}

function SaveBadge({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === "saving") return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>;
  if (status === "error") return (
    <button type="button" onClick={onRetry} className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3.5 w-3.5" />Failed to save — Retry
    </button>
  );
  if (status === "conflict") return <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" />Not saved</span>;
  return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" />Saved</span>;
}

