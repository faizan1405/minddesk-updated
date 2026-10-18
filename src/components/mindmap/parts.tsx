import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import {
  BaseEdge, Handle, Position, getBezierPath, useInternalNode, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle, BookOpen, Check, Flag, Heart, HelpCircle, Lightbulb, Link2, Star, StickyNote, Target, type LucideIcon,
} from "lucide-react";
import type { MapColor, MapNode, NodeIcon, TextColor } from "@/lib/mindmap-doc";
import { cn } from "@/lib/utils";

export const ICONS: Record<Exclude<NodeIcon, "none">, LucideIcon> = {
  star: Star, lightbulb: Lightbulb, flag: Flag, check: Check, alert: AlertTriangle, heart: Heart,
  question: HelpCircle, target: Target, book: BookOpen,
};
export const colorVar = (c: MapColor) => (c === "default" ? "var(--muted-foreground)" : `var(--event-${c})`);
export const fillFor = (c: MapColor) => (c === "default" ? "var(--card)" : `color-mix(in oklch, var(--event-${c}) 22%, var(--card))`);
export const textFor = (t: TextColor, c: MapColor) =>
  t === "muted" ? "var(--muted-foreground)" : t === "accent" ? "var(--primary)" : t === "dark" ? "var(--background)"
    : t === "color" ? colorVar(c) : "var(--foreground)";

export type TopicData = { node: MapNode; isRoot: boolean; hiddenCount: number; childCount: number; match: boolean; drop: boolean; connecting: boolean; isLocked?: boolean };
export type TopicRFNode = Node<TopicData, "topic">;

type Ctx = {
  editingId: string | null;
  /** Keys typed before the title box received focus. */
  takePending: () => string;
  commitTitle: (id: string, title: string) => void;
  cancelEdit: () => void;
  toggleCollapse: (id: string) => void;
  isLocked?: boolean;
};
export const MapCtx = createContext<Ctx | null>(null);

const SIZE_CLS = {
  s: "px-3.5 py-2 text-[13px] rounded-xl",
  m: "px-4 py-2.5 text-sm font-medium rounded-xl",
  l: "px-5 py-3 text-base font-semibold rounded-2xl",
};

export const TopicNode = memo(function TopicNode({ data, selected }: NodeProps<TopicRFNode>) {
  const ctx = useContext(MapCtx)!;
  const { node: n, isRoot } = data;
  const editing = !ctx.isLocked && !data.isLocked && ctx.editingId === n.id;
  const Icon = n.icon !== "none" ? ICONS[n.icon] : null;
  const accent = n.color === "default" ? (isRoot ? "var(--primary)" : "var(--border)") : colorVar(n.color);
  return (
    <div
      className={cn(
        "mm-node relative max-w-[280px] border",
        !data.isLocked ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        SIZE_CLS[n.size],
        isRoot && "min-w-[140px] border-2 text-center tracking-tight",
        isRoot && n.size === "m" && "px-6 py-3.5 text-[17px] font-semibold",
        selected && "outline-2 outline-offset-[3px] outline-primary",
        !selected && "outline-0 outline-offset-[3px] outline-transparent",
        data.match && !selected && "ring-2 ring-[var(--star)] ring-offset-2 ring-offset-background",
        data.drop && "outline-2 outline-dashed outline-offset-4 outline-primary",
        data.connecting && "cursor-crosshair",
      )}
      style={{
        background: isRoot && n.color === "default"
          ? "linear-gradient(160deg, color-mix(in oklch, var(--primary) 16%, var(--card)), var(--card))"
          : fillFor(n.color),
        borderColor: selected ? accent : `color-mix(in oklch, ${accent} ${isRoot || n.color !== "default" ? 70 : 100}%, transparent)`,
        borderLeftWidth: !isRoot && n.color !== "default" ? 3 : undefined,
        boxShadow: isRoot ? "var(--mm-shadow-root)" : undefined,
        color: textFor(n.textColor, n.color),
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!pointer-events-none !opacity-0" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="!pointer-events-none !opacity-0" />
      <div className={cn("flex items-center gap-1.5", isRoot && "justify-center")}>
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {editing ? (
          <TitleEditor initial={n.title} takePending={ctx.takePending} onDone={(t) => ctx.commitTitle(n.id, t)} onCancel={ctx.cancelEdit} />
        ) : (
          <span className={cn("whitespace-pre-wrap break-words leading-snug", !n.title && "opacity-50")}>{n.title || "New topic"}</span>
        )}
        {(n.notes || n.link) && !editing && (
          <span className="ml-0.5 flex shrink-0 gap-0.5 opacity-60">
            {n.notes && <StickyNote className="h-3 w-3" aria-label="Has notes" />}
            {n.link && <Link2 className="h-3 w-3" aria-label="Has link" />}
          </span>
        )}
      </div>
      {data.childCount > 0 && (data.hiddenCount > 0 || selected) && !isRoot && (
        <button
          type="button"
          aria-label={n.collapsed ? `Expand ${data.hiddenCount} hidden topics` : "Collapse branch"}
          onClick={(e) => { e.stopPropagation(); ctx.toggleCollapse(n.id); }}
          className="nodrag absolute -right-3 top-1/2 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-popover px-1 text-[11px] font-semibold text-popover-foreground shadow"
        >
          {n.collapsed ? `+${data.hiddenCount}` : "−"}
        </button>
      )}
    </div>
  );
});

function TitleEditor({ initial, takePending, onDone, onCancel }: { initial: string; takePending: () => string; onDone: (t: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const vRef = useRef(initial);
  vRef.current = v;
  useEffect(() => {
    // A new topic is invisible until the canvas measures it, so retry focusing briefly.
    let tries = 0;
    const id = setInterval(() => {
      const el = ref.current;
      if (!el || tries++ > 60) return clearInterval(id);
      if (document.activeElement !== el) { el.focus(); if (document.activeElement === el) el.select(); }
      if (document.activeElement !== el) return;
      clearInterval(id);
      const extra = takePending();
      if (extra) {
        // Buffered keys were typed first; anything typed natively after focus comes after them.
        const [typed = "", rest] = extra.split("\n");
        const base = vRef.current === initial ? "" : vRef.current;
        if (rest !== undefined) { done.current = true; onDone((typed + base).trim()); return; }
        // Write to the DOM synchronously so keys typed next append instead of racing React state.
        el.value = typed + base;
        el.setSelectionRange(el.value.length, el.value.length);
        setV(el.value);
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onDone(v.trim()); else onCancel();
  };
  return (
    <textarea
      ref={ref} value={v} rows={1} maxLength={300} aria-label="Topic title" placeholder="New topic"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
      }}
      className="nodrag nopan nowheel field-sizing-content min-w-[6rem] resize-none bg-transparent leading-snug outline-none placeholder:opacity-50"
    />
  );
}

/** Curved connection that attaches to whichever side of each topic faces the other — works for every layout. */
export function FloatingEdge({ id, source, target, data, selected, markerEnd }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const box = (n: NonNullable<typeof s>) => {
    const { x, y } = n.internals.positionAbsolute;
    const w = n.measured.width ?? 100, h = n.measured.height ?? 40;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };
  const a = box(s), b = box(t);
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const horizontal = Math.abs(dx) >= Math.abs(dy) * 0.6;
  const [sp, tp] = horizontal
    ? dx > 0 ? [Position.Right, Position.Left] : [Position.Left, Position.Right]
    : dy > 0 ? [Position.Bottom, Position.Top] : [Position.Top, Position.Bottom];
  const pt = (q: typeof a, p: Position) =>
    p === Position.Right ? [q.x + q.w, q.cy] : p === Position.Left ? [q.x, q.cy] : p === Position.Bottom ? [q.cx, q.y + q.h] : [q.cx, q.y];
  const [sx, sy] = pt(a, sp), [tx, ty] = pt(b, tp);
  const [path] = getBezierPath({ sourceX: sx!, sourceY: sy!, sourcePosition: sp, targetX: tx!, targetY: ty!, targetPosition: tp });
  const d = data as { kind: "tree" | "link"; color?: string } | undefined;
  const link = d?.kind === "link";
  return (
    <BaseEdge
      id={id} path={path} {...(markerEnd ? { markerEnd } : {})} interactionWidth={link ? 16 : 0}
      style={link
        ? { stroke: "var(--primary)", strokeWidth: selected ? 2.4 : 1.4, strokeDasharray: "5 6", strokeLinecap: "round", opacity: selected ? 1 : 0.7, transition: "stroke-width 150ms, opacity 150ms", filter: selected ? "drop-shadow(0 0 3px color-mix(in oklch, var(--primary) 50%, transparent))" : undefined }
        : { stroke: d?.color ?? "var(--muted-foreground)", strokeWidth: 2, strokeLinecap: "round", opacity: 0.6 }}
    />
  );
}
