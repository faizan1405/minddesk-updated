import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Moon, Sun, Sunrise, Sunset, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { colorVar } from "@/lib/calendar";
import { fmtDuration, fmtMinute, nowMinute, withLanes, type Block, type PlanCategory } from "@/lib/plan";

const ROWS: { label: string; from: number; icon: LucideIcon }[] = [
  { label: "Night & Dawn", from: 0, icon: Moon },
  { label: "Morning", from: 360, icon: Sunrise },
  { label: "Afternoon", from: 720, icon: Sun },
  { label: "Evening", from: 1080, icon: Sunset },
];
const SPAN = 360; // minutes per row
const CELLS = 12; // half-hour cells per row (48 for the day)

const shortHour = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
};

/**
 * 24-hour overview: four 6-hour rows of 12 half-hour cells each.
 * Normal mode: tap a cell to plan 30 min there; drag across cells (mouse) to plan a range.
 * Range mode: tap a start cell, then an end cell (touch-friendly); dragging also works.
 * Blocks keep exact minute positions and stack in lanes when they overlap.
 */
export function DayMap({
  blocks, categories, isToday, rangeMode, onCancelRange, onPickRange, onOpenBlock,
}: {
  blocks: Block[]; categories: PlanCategory[]; isToday: boolean; rangeMode: boolean; onCancelRange: () => void;
  onPickRange: (start: number, end: number) => void; onOpenBlock: (b: Block) => void;
}) {
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null); // range mode: first tapped cell
  const [hover, setHover] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  // Touch: tapping the compact map opens an enlarged half-hour picker for that period.
  const [zoom, setZoom] = useState<{ row: number; a: number | null; b: number | null } | null>(null);
  const dragRef = useRef<{ a: number; b: number; pointer: string } | null>(null);

  useEffect(() => {
    if (!isToday) { setNow(null); return; }
    setNow(nowMinute());
    const t = setInterval(() => setNow(nowMinute()), 30_000);
    return () => clearInterval(t);
  }, [isToday]);
  useEffect(() => { if (!rangeMode) setAnchor(null); }, [rangeMode]);

  const catOf = (id: string | null) => categories.find((c) => c.id === id);

  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return el ? Number(el.dataset["cell"]) : null;
  };
  function finish(lo: number, hi: number) {
    setAnchor(null);
    onPickRange(Math.min(lo, hi) * 30, (Math.max(lo, hi) + 1) * 30);
  }
  function down(e: PointerEvent<HTMLDivElement>, cell: number) {
    if (e.button !== 0) return;
    // Touch in normal mode: let the page scroll; a tap fires via click.
    if (e.pointerType !== "mouse" && !rangeMode) return;
    dragRef.current = { a: cell, b: cell, pointer: e.pointerType };
    setDrag({ a: cell, b: cell });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c !== null && c !== dragRef.current.b) {
      dragRef.current = { ...dragRef.current, b: c };
      setDrag({ a: dragRef.current.a, b: c });
    }
  }
  function up() {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (d.a !== d.b) { finish(d.a, d.b); return; }
    // Single tap/click
    if (rangeMode) {
      if (anchor === null) setAnchor(d.a);
      else finish(anchor, d.a);
    } else finish(d.a, d.a);
  }
  function touchTap(cell: number) {
    // Normal-mode touch tap (pointerdown was skipped so the page can scroll).
    if (!rangeMode && !dragRef.current) {
      const row = Math.floor((cell * 30) / SPAN) * SPAN;
      setZoom({ row, a: cell, b: null });
    }
  }

  let selLo = -1, selHi = -1;
  if (drag) { selLo = Math.min(drag.a, drag.b); selHi = Math.max(drag.a, drag.b); }
  else if (anchor !== null) {
    const other = hover ?? anchor;
    selLo = Math.min(anchor, other); selHi = Math.max(anchor, other);
  }

  return (
    <div className="select-none">
      {rangeMode && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs animate-in fade-in slide-in-from-top-1">
          <span className="min-w-0 flex-1">
            {anchor === null ? "Select range: tap the first half-hour (or drag across cells)."
              : `From ${fmtMinute(anchor * 30)} — now tap the last half-hour.`}
          </span>
          <button type="button" onClick={onCancelRange} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium hover:bg-accent">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      )}
      <div className="space-y-2.5 md:space-y-3" onPointerMove={move} onPointerUp={up}
        onPointerLeave={() => { if (dragRef.current?.pointer === "mouse") up(); setHover(null); }}>
        {ROWS.map((row) => {
          const Icon = row.icon;
          const rowBlocks = blocks
            .filter((b) => b.end > row.from && b.start < row.from + SPAN)
            .map((b) => ({ ...b, start: Math.max(b.start, row.from), end: Math.min(b.end, row.from + SPAN) }));
          const laid = withLanes(rowBlocks);
          return (
            <div key={row.label} className="md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-end md:gap-4">
              <div className="mb-1 flex items-center gap-2 md:mb-0 md:h-16 lg:h-[4.5rem]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground md:h-8 md:w-8">
                  <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-xs font-semibold md:text-sm">{row.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{fmtMinute(row.from).replace(":00", "")} – {fmtMinute(row.from + SPAN).replace(":00", "")}</p>
                </div>
              </div>
              <div className="min-w-0">
                <div className="relative mb-1 h-4 text-[10px] font-medium text-muted-foreground">
                  {Array.from({ length: 6 }, (_, h) => (
                    <span key={h} className={cn("absolute", h % 2 === 1 && "hidden sm:inline")} style={{ left: `${(h / 6) * 100}%` }}>
                      {shortHour(row.from + h * 60)}
                    </span>
                  ))}
                </div>
                <div className="relative h-14 overflow-hidden rounded-xl bg-background/60 ring-1 ring-border md:h-16 lg:h-[4.5rem]"
                  style={{ touchAction: rangeMode || drag ? "none" : "pan-y" }}>
                  <div className="absolute inset-0 grid gap-px p-px" style={{ gridTemplateColumns: `repeat(${CELLS}, minmax(0, 1fr))` }}>
                    {Array.from({ length: CELLS }, (_, i) => {
                      const cell = row.from / 30 + i;
                      const sel = cell >= selLo && cell <= selHi;
                      return (
                        <div
                          key={cell}
                          data-cell={cell}
                          role="button"
                          tabIndex={0}
                          aria-label={`Plan from ${fmtMinute(cell * 30)}`}
                          onPointerDown={(e) => down(e, cell)}
                          onPointerEnter={() => setHover(cell)}
                          onClick={(e) => { if ((e.nativeEvent as globalThis.PointerEvent).pointerType && (e.nativeEvent as globalThis.PointerEvent).pointerType !== "mouse") touchTap(cell); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (rangeMode) { if (anchor === null) setAnchor(cell); else finish(anchor, cell); } else finish(cell, cell); } }}
                          className={cn(
                            "cursor-pointer rounded-[5px] bg-muted/70 transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            i % 2 === 0 && "ml-px",
                            sel && "bg-primary/35 ring-1 ring-inset ring-primary hover:bg-primary/40",
                          )}
                        />
                      );
                    })}
                  </div>
                  {laid.map(({ block: b, lane, lanes }) => {
                    const c = catOf(b.activity.category_id);
                    const color = colorVar(c?.color ?? "gray");
                    const left = ((b.start - row.from) / SPAN) * 100;
                    const width = ((b.end - b.start) / SPAN) * 100;
                    const label = `${b.activity.title} · ${fmtMinute(b.fullStart)} – ${fmtMinute(b.fullEnd)}${lanes > 1 ? " · overlaps another activity" : ""}`;
                    return (
                      <button
                        key={b.key + row.from}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onOpenBlock(b)}
                        title={label}
                        aria-label={label}
                        className={cn(
                          "absolute flex flex-col justify-center overflow-hidden rounded-lg px-2 text-left leading-tight shadow-sm transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in",
                          b.activity.routine_type === "flexible" && b.activity.repeat_days > 0 && "border border-dashed border-foreground/40",
                          lanes > 1 && "ring-1 ring-inset ring-foreground/30",
                        )}
                        style={{
                          left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`,
                          top: `calc(${(lane / lanes) * 100}% + 3px)`, height: `calc(${100 / lanes}% - 6px)`,
                          background: `linear-gradient(180deg, color-mix(in srgb, ${color} 62%, var(--card)), color-mix(in srgb, ${color} 48%, var(--card)))`,
                          boxShadow: `inset 3px 0 0 ${color}`,
                        }}
                      >
                        {width > 7 && (
                          <>
                            <span className="truncate text-[11px] font-semibold text-foreground md:text-xs">{b.activity.title}</span>
                            {lanes === 1 && width > 16 && (
                              <span className="hidden truncate text-[10px] text-foreground/75 md:block">
                                {fmtMinute(b.fullStart)} – {fmtMinute(b.fullEnd)} · {fmtDuration(b.end - b.start)}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                  {now !== null && now >= row.from && now < row.from + SPAN && (
                    <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5" style={{ left: `${((now - row.from) / SPAN) * 100}%`, background: "var(--event-now)" }}>
                      <span className="absolute -left-1 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ background: "var(--event-now)" }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Sheet open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          {zoom && (() => {
            const row = ROWS.find((r) => r.from === zoom.row)!;
            const lo = zoom.a === null ? -1 : Math.min(zoom.a, zoom.b ?? zoom.a);
            const hi = zoom.a === null ? -1 : Math.max(zoom.a, zoom.b ?? zoom.a);
            const tap = (c: number) => setZoom((z) => !z ? z
              : z.a === null || z.b !== null ? { ...z, a: c, b: null } : { ...z, b: c });
            return <>
              <SheetHeader className="text-left">
                <SheetTitle>{row.label}</SheetTitle>
                <SheetDescription>Tap a start and an end half-hour.</SheetDescription>
              </SheetHeader>
              <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Half-hour slots">
                {Array.from({ length: CELLS }, (_, i) => {
                  const c = row.from / 30 + i, sel = c >= lo && c <= hi;
                  const busy = blocks.some((b) => b.start < (c + 1) * 30 && b.end > c * 30);
                  return (
                    <button key={c} type="button" onClick={() => tap(c)} aria-pressed={sel}
                      className={cn("relative h-12 rounded-xl border text-sm font-medium transition-colors active:scale-95",
                        sel ? "border-primary bg-primary/25 text-foreground" : "bg-muted/60 text-muted-foreground")}>
                      {fmtMinute(c * 30)}
                      {busy && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" aria-label="Has a block" />}
                    </button>
                  );
                })}
              </div>
              <Button className="mt-4 h-12 w-full text-base" disabled={lo < 0}
                onClick={() => { setZoom(null); onPickRange(lo * 30, (hi + 1) * 30); }}>
                {lo < 0 ? "Pick a time" : `Add block ${fmtMinute(lo * 30)} – ${fmtMinute((hi + 1) * 30)}`}
              </Button>
            </>;
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
