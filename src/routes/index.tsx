import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSettingsQuery } from "@/hooks/use-settings";
import type { Settings } from "@/lib/settings-shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MindDesk — My Tasks" },
      { name: "description", content: "Organize your tasks, lists and subtasks in MindDesk." },
      { property: "og:title", content: "MindDesk — My Tasks" },
      { property: "og:description", content: "Organize your tasks, lists and subtasks in MindDesk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StartPage,
});

const TARGET = {
  tasks: "/tasks", starred: "/starred", notes: "/notes", projects: "/projects", calendar: "/calendar",
  plan: "/plan", "mind-maps": "/mind-maps", habits: "/habits",
} as const satisfies Record<Settings["start_page"], string>;

/** Opening the app at "/" goes to the start page chosen in Settings; direct links are never redirected. */
function StartPage() {
  const { user, loading } = useAuth();
  const settings = useSettingsQuery(!!user);
  if (loading || (user && settings.isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <Navigate to={TARGET[settings.data?.start_page ?? "tasks"]} replace />;
}
