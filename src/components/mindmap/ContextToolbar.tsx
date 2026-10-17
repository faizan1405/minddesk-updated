import { useInternalNode, useStore } from "@xyflow/react";
import {
  ChevronsDownUp, ChevronsUpDown, Copy, CornerDownRight, LayoutGrid, MoreHorizontal, Palette, Pencil, Plus, Spline, SlidersHorizontal, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MapNode } from "@/lib/mindmap-doc";
import type { NodeActions, PanelTab } from "./NodePanel";

const GAP = 10, EDGE = 8;
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** Small floating actions next to the selected topic. Screen-space only — never touches node coordinates. */
export function ContextToolbar({ node, isRoot, childCount, actions, onEdit, onInspect, container, reservedRight }: {
  node: MapNode; isRoot: boolean; childCount: number; actions: NodeActions;
  onEdit: () => void; onInspect: (t: PanelTab) => void; container: HTMLElement | null; reservedRight: number;
}) {
  const touch = coarse();
  const W = touch ? 264 : 212, H = touch ? 50 : 38;
  const internal = useInternalNode(node.id);
  const [tx, ty, zoom] = useStore((s) => s.transform);
  if (!internal || !container) return null;
  const { x, y } = internal.internals.positionAbsolute;
  const w = (internal.measured.width ?? 120) * zoom, h = (internal.measured.height ?? 40) * zoom;
  const sx = x * zoom + tx, sy = y * zoom + ty;
  const cw = container.clientWidth - reservedRight, ch = container.clientHeight;
  // Prefer above the topic; flip below near the top edge so the title is never covered.
  let top = sy - H - GAP;
  if (top < EDGE + 48) top = sy + h + GAP;
  top = Math.min(Math.max(top, EDGE), ch - H - EDGE);
  const left = Math.min(Math.max(sx + w / 2 - W / 2, EDGE), Math.max(EDGE, cw - W - EDGE));
  if (sx + w < 0 || sx > cw || sy + h < 0 || sy > ch) return null;

  return (
    <div
      role="toolbar" aria-label="Topic actions"
      className="mm-fade-in absolute z-10 flex items-center gap-0.5 rounded-xl border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur"
      style={{ left, top, width: W, height: H }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Tip label="Add child (Tab)"><TB onClick={actions.addChild} label="Add child"><CornerDownRight className="h-4 w-4" /></TB></Tip>
      <Tip label="Add sibling (Enter)"><TB onClick={actions.addSibling} label="Add sibling" disabled={isRoot}><Plus className="h-4 w-4" /></TB></Tip>
      <Tip label="Edit title (F2)"><TB onClick={onEdit} label="Edit title"><Pencil className="h-4 w-4" /></TB></Tip>
      <Tip label="Style"><TB onClick={() => onInspect("style")} label="Style"><Palette className="h-4 w-4" /></TB></Tip>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <DropdownMenu>
        <Tip label="More actions">
          <DropdownMenuTrigger asChild><TB label="More actions"><MoreHorizontal className="h-4 w-4" /></TB></DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" collisionPadding={8} className="w-52">
          <DropdownMenuItem onSelect={() => onInspect("content")}><SlidersHorizontal className="h-4 w-4" />Notes & link…</DropdownMenuItem>
          <DropdownMenuItem onSelect={actions.connect}><Spline className="h-4 w-4" />Connect…</DropdownMenuItem>
          <DropdownMenuItem disabled={isRoot} onSelect={actions.duplicate}><Copy className="h-4 w-4" />Duplicate</DropdownMenuItem>
          <DropdownMenuItem disabled={isRoot || childCount === 0} onSelect={actions.toggleCollapse}>
            {node.collapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}{node.collapsed ? "Expand" : "Collapse"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={childCount === 0} onSelect={actions.arrangeBranch}><LayoutGrid className="h-4 w-4" />Arrange branch</DropdownMenuItem>
          {!isRoot && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={actions.remove}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="bottom" className="text-xs">{label}</TooltipContent></Tooltip>;
}

function TB({ label, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} {...rest}
      className="flex h-8 flex-1 items-center [@media(pointer:coarse)]:h-11 active:scale-95 justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-35">
      {children}
    </button>
  );
}
