import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft, ChevronRight, Clock, Database, Eye, LayoutGrid, ListChecks, Palette, Shield, Timer, UserRound, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AccessibilitySection, AppearanceSection, DataSection, DateTimeSection, FocusSection, ProfileSection, SecuritySection,
  TaskSection, WorkspaceSection,
} from "@/components/settings/sections";

const SECTIONS = ["profile", "appearance", "datetime", "tasks", "focus", "workspace", "accessibility", "data", "security"] as const;
type Section = (typeof SECTIONS)[number];

const META: Record<Section, { title: string; blurb: string; icon: LucideIcon; Body: () => React.JSX.Element }> = {
  profile: { title: "Profile & Account", blurb: "Name, email and account", icon: UserRound, Body: ProfileSection },
  appearance: { title: "Appearance & Theme", blurb: "Dark, light or system · accent colour", icon: Palette, Body: AppearanceSection },
  datetime: { title: "Date & Time", blurb: "Time zone, clock, week start", icon: Clock, Body: DateTimeSection },
  tasks: { title: "Task Preferences", blurb: "Sorting, completed tasks, due dates", icon: ListChecks, Body: TaskSection },
  focus: { title: "Focus & Productivity", blurb: "Timer lengths, auto-start, sound", icon: Timer, Body: FocusSection },
  workspace: { title: "Workspace & Layout", blurb: "Density, opening page, sidebar", icon: LayoutGrid, Body: WorkspaceSection },
  accessibility: { title: "Accessibility", blurb: "Text size, motion, contrast, shortcuts", icon: Eye, Body: AccessibilitySection },
  data: { title: "Data & Backup", blurb: "Export and delete your data", icon: Database, Body: DataSection },
  security: { title: "Security & Privacy", blurb: "Password and sign out", icon: Shield, Body: SecuritySection },
};

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: z.object({ section: z.enum(SECTIONS).optional() }),
  head: () => ({
    meta: [
      { title: "Settings — MindDesk" },
      { name: "description", content: "Theme, time, tasks, focus, accessibility and data settings for your MindDesk workspace." },
      { property: "og:title", content: "Settings — MindDesk" },
      { property: "og:description", content: "Theme, time, tasks, focus, accessibility and data settings for your MindDesk workspace." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { section } = Route.useSearch();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const active: Section = section ?? "profile";
  const { title, Body } = META[active];

  const nav = (mobile: boolean) => (
    <ul className={cn(mobile ? "space-y-2" : "space-y-0.5")}>
      {SECTIONS.map((k) => {
        const m = META[k];
        const on = !mobile && k === active;
        return (
          <li key={k}>
            <Link to="/settings" search={{ section: k }} aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                mobile ? "min-h-[60px] rounded-xl border bg-card px-3.5 py-2.5 active:bg-accent" : "rounded-lg px-3 py-2 text-sm hover:bg-accent/60",
                on && "bg-accent font-medium text-foreground",
              )}>
              <span className={cn("flex shrink-0 items-center justify-center rounded-lg", mobile ? "h-9 w-9 bg-primary/10 text-primary" : "h-6 w-6 text-muted-foreground", on && "text-primary")}>
                <m.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.title}</span>
                {mobile && <span className="block truncate text-xs text-muted-foreground">{m.blurb}</span>}
              </span>
              {mobile && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  // Render only one layout so each control exists once on the page.
  if (isMobile) return (
      <>
      {/* Phones: a list of categories, each opening its own screen. */}
      <div className="mx-auto w-full max-w-lg px-4 pb-8 pt-5">
        {section ? (
          <div className="animate-in fade-in slide-in-from-right-2 duration-200">
            <Link to="/settings" search={{}} className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground active:bg-accent">
              <ArrowLeft className="h-4 w-4" /> Settings
            </Link>
            <h1 className="mb-4 text-xl font-semibold tracking-tight">{title}</h1>
            <Body />
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="mb-4 text-sm text-muted-foreground">{user?.preview ? "Preview Mode — changes are temporary." : "Saved to your account."}</p>
            {nav(true)}
          </>
        )}
      </div>
      </>
  );

  return (
    <>
      {/* Tablets and computers: categories on the left, the chosen one on the right. */}
      <div className="mx-auto flex w-full max-w-5xl gap-8 px-6 py-8">
        <aside className="w-60 shrink-0">
          <h1 className="mb-1 px-3 text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mb-4 px-3 text-xs text-muted-foreground">{user?.preview ? "Preview Mode — changes are temporary." : "Saved to your account."}</p>
          <nav aria-label="Settings sections">{nav(false)}</nav>
        </aside>
        <div key={active} className="min-w-0 flex-1 animate-in fade-in duration-200">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
          <Body />
        </div>
      </div>
    </>
  );
}
