import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2, Repeat, NotebookPen, LayoutGrid, FolderKanban, CalendarDays, Clock, Network,
  Settings, UserRound, BarChart3, LayoutTemplate, Trash2, Pin, ShieldCheck, type LucideIcon,
} from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { pageTitle, usePages, useProjects } from "@/lib/pages";
import { useMindMaps } from "@/lib/mindmaps";
import { cn } from "@/lib/utils";

export type NavGroup = "tasks" | "habits" | "notes" | "more";

/** Explicit route grouping for the mobile bottom bar. */
export function navGroupFor(path: string): NavGroup {
  const under = (p: string) => path === p || path.startsWith(p + "/");
  if (under("/tasks") || under("/starred") || under("/lists")) return "tasks";
  if (under("/habits")) return "habits";
  if (under("/notes")) return "notes";
  return "more";
}

const moreItems: { title: string; url: "/vault" | "/projects" | "/calendar" | "/plan" | "/mind-maps" | "/analytics" | "/templates" | "/trash" | "/settings" | "/profile"; icon: LucideIcon }[] = [
  { title: "My Private Vault", url: "/vault", icon: ShieldCheck },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Plan Your Day", url: "/plan", icon: Clock },
  { title: "Mind Maps", url: "/mind-maps", icon: Network },
  { title: "Recycle Bin", url: "/trash", icon: Trash2 },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Profile", url: "/profile", icon: UserRound },
];

const itemCls = (active: boolean) =>
  cn(
    "group flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] leading-tight outline-none",
    "transition-colors duration-200 motion-reduce:transition-none active:scale-95 motion-reduce:active:scale-100",
    "focus-visible:ring-2 focus-visible:ring-ring",
    active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
  );

function Pill({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span className={cn(
      "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
      active ? "bg-primary/15" : "group-active:bg-accent",
    )}>
      <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
    </span>
  );
}

export function MobileBottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const group = navGroupFor(path);
  const [moreOpen, setMoreOpen] = useState(false);
  const [typing, setTyping] = useState(false);

  const { data: pages } = usePages();
  const { data: projects } = useProjects();
  const { data: mindMaps } = useMindMaps();

  const pinnedProjects = (projects || []).filter((p) => p.is_pinned);
  const pinnedNotes = (pages || []).filter((p) => p.is_pinned);
  const pinnedMindMaps = (mindMaps || []).filter((m) => m.is_pinned);
  const totalPinned = pinnedProjects.length + pinnedNotes.length + pinnedMindMaps.length;

  // Close the panel on any navigation (incl. Android/browser back).
  useEffect(() => { setMoreOpen(false); }, [path]);

  // Keyboard-aware: hide the bar while a text field is focused so it never sits over the keyboard.
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.isContentEditable || el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes((el as HTMLInputElement).type)));
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTimeout(() => setTyping(isField(document.activeElement)), 0);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); };
  }, []);

  const tabs = [
    { key: "tasks" as const, label: "My Tasks", aria: "My Tasks", to: "/tasks" as const, icon: CheckCircle2 },
    { key: "habits" as const, label: "Habits", aria: "Habits & Routines", to: "/habits" as const, icon: Repeat },
    { key: "notes" as const, label: "Notes", aria: "Notes", to: "/notes" as const, icon: NotebookPen },
  ];

  return (
    <>
      <nav
        aria-label="Main"
        data-mobile-nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden",
          "pb-[env(safe-area-inset-bottom)] transition-transform duration-200 motion-reduce:transition-none",
          typing && "pointer-events-none translate-y-full",
        )}
      >
        <ul className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1.5">
          {tabs.map((t) => {
            const active = group === t.key;
            return (
              <li key={t.key} className="flex min-w-0 flex-1">
                <Link to={t.to} aria-label={t.aria} aria-current={active ? "page" : undefined} className={itemCls(active)}>
                  <Pill icon={t.icon} active={active} />
                  <span className="truncate">{t.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={group === "more" ? "page" : undefined}
              onClick={() => setMoreOpen(true)}
              className={itemCls(group === "more")}
            >
              <Pill icon={LayoutGrid} active={group === "more"} />
              <span className="truncate">More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen} shouldScaleBackground={false}>
        <DrawerContent className="border-sidebar-border bg-sidebar pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerTitle className="px-5 pt-3 text-base font-semibold tracking-tight">More</DrawerTitle>
          <DrawerDescription className="sr-only">Other MindDesk sections</DrawerDescription>

          {totalPinned > 0 && (
            <div className="px-4 pt-2">
              <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Pin className="h-3 w-3 rotate-45 fill-amber-500/20 text-amber-500" />
                <span>Pinned ({totalPinned})</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {pinnedProjects.map((p) => (
                  <Link
                    key={`mob-pin-proj-${p.id}`}
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    onClick={() => setMoreOpen(false)}
                    className="flex max-w-[160px] items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors active:bg-accent"
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{p.title}</span>
                  </Link>
                ))}
                {pinnedNotes.map((n) => (
                  <Link
                    key={`mob-pin-note-${n.id}`}
                    to={n.project_id ? "/projects/$projectId/$pageId" : "/notes/$pageId"}
                    params={n.project_id ? { projectId: n.project_id, pageId: n.id } : { pageId: n.id }}
                    onClick={() => setMoreOpen(false)}
                    className="flex max-w-[160px] items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors active:bg-accent"
                  >
                    <NotebookPen className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    <span className="truncate">{pageTitle(n)}</span>
                  </Link>
                ))}
                {pinnedMindMaps.map((m) => (
                  <Link
                    key={`mob-pin-map-${m.id}`}
                    to="/mind-maps/$mapId"
                    params={{ mapId: m.id }}
                    onClick={() => setMoreOpen(false)}
                    className="flex max-w-[160px] items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors active:bg-accent"
                  >
                    <Network className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span className="truncate">{m.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <ul className="grid grid-cols-3 gap-2 p-4">
            {moreItems.map((m) => {
              const active = path === m.url || path.startsWith(m.url + "/");
              return (
                <li key={m.url}>
                  <Link
                    to={m.url}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-center text-xs outline-none",
                      "transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent",
                      active ? "border-primary/40 bg-primary/10 font-semibold text-primary" : "bg-card font-medium text-foreground",
                    )}
                  >
                    <m.icon className="h-5 w-5" aria-hidden />
                    <span className="leading-tight">{m.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </DrawerContent>
      </Drawer>
    </>
  );
}
