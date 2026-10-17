import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Task, TaskList } from "@/lib/tasks";
import { TaskColumn } from "./TaskColumn";

/** Mobile-only swipeable list cards using native CSS scroll-snap (no carousel library). */
export function ListCarousel({ lists, tasks }: { lists: TaskList[]; tasks: Task[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const prevIds = useRef<string[]>(lists.map((l) => l.id));
  const currentId = useRef<string | undefined>(lists[0]?.id);

  const goTo = useCallback((i: number, smooth = true) => {
    const el = scroller.current?.children[i] as HTMLElement | undefined;
    if (!el || !scroller.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current.scrollTo({ left: el.offsetLeft - scroller.current.offsetLeft - 12, behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  // Track the visible card from scroll position (rAF-throttled; one state update per change).
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const first = sc.children[0] as HTMLElement | undefined;
        const step = first ? first.offsetWidth + 12 : sc.clientWidth;
        const i = Math.max(0, Math.min(lists.length - 1, Math.round(sc.scrollLeft / step)));
        setIndex(i);
        currentId.current = lists[i]?.id;
      });
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => { sc.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [lists]);

  // New list → jump to it. Deleted current list → move to the closest remaining one.
  useEffect(() => {
    const ids = lists.map((l) => l.id);
    const added = ids.find((id) => !prevIds.current.includes(id));
    if (added && prevIds.current.length > 0) {
      requestAnimationFrame(() => goTo(ids.indexOf(added)));
    } else if (currentId.current && !ids.includes(currentId.current)) {
      const oldIdx = prevIds.current.indexOf(currentId.current);
      const next = Math.max(0, Math.min(ids.length - 1, oldIdx));
      currentId.current = ids[next];
      setIndex(next);
      requestAnimationFrame(() => goTo(next));
    }
    prevIds.current = ids;
  }, [lists, goTo]);

  const total = lists.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          <span className="sr-only">Showing list </span>{index + 1} of {total} {total === 1 ? "list" : "lists"}
        </p>
        {total > 1 && (
          <div className="flex items-center gap-1">
            {total <= 6 && (
              <div className="mr-1 flex gap-1" aria-hidden>
                {lists.map((l, i) => (
                  <span key={l.id} className={cn("h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none",
                    i === index ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40")} />
                ))}
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Previous list"
              disabled={index === 0} onClick={() => goTo(index - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Next list"
              disabled={index === total - 1} onClick={() => goTo(index + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="Task lists — swipe to switch"
        className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain scroll-px-3 px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-x pan-y" }}
      >
        {lists.map((l) => (
          <TaskColumn
            key={l.id}
            list={l}
            lists={lists}
            tasks={tasks.filter((t) => t.list_id === l.id)}
            className={cn("shrink-0 snap-start [scroll-snap-stop:always]",
              total > 1 ? "w-[calc(100vw-3.25rem)] max-w-[420px]" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}
