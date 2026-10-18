import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2, Repeat, NotebookPen, LayoutGrid, FolderKanban, CalendarDays, Clock, Network,
  Settings, UserRound, BarChart3, LayoutTemplate, type LucideIcon,
} from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
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

const moreItems: { title: string; url: "/projects" | "/calendar" | "/plan" | "/mind-maps" | "/analytics" | "/templates" | "/settings" | "/profile"; icon: LucideIcon }[] = [
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Plan Your Day", url: "/plan", icon: Clock },
  { title: "Mind Maps", url: "/mind-maps", icon: Network },
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
