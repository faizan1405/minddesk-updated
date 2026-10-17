import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreatePageNav } from "@/components/notes/PageWorkspace";
import { pageTitle, usePages, useProjects } from "@/lib/pages";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { data: projects = [] } = useProjects();
  const { data: allPages = [] } = usePages();
  const { create, pending } = useCreatePageNav({ kind: "project", projectId });
  const project = projects.find((p) => p.id === projectId);
  const pages = allPages.filter((p) => p.project_id === projectId);
  const top = pages.filter((p) => !p.parent_id);
  const subCount = (id: string) => pages.filter((p) => p.parent_id === id).length;

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-6 md:px-10 md:pt-10">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{project?.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {pages.length} page{pages.length === 1 ? "" : "s"} in this project
      </p>

      <div className="mt-8 space-y-1">
        {top.map((p) => (
          <Link key={p.id} to="/projects/$projectId/$pageId" params={{ projectId, pageId: p.id }}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{pageTitle(p)}</span>
            {subCount(p.id) > 0 && (
              <span className="text-xs text-muted-foreground">{subCount(p.id)} subpage{subCount(p.id) === 1 ? "" : "s"}</span>
            )}
          </Link>
        ))}
      </div>

      <Button variant={top.length ? "outline" : "default"} className="mt-4 gap-2 rounded-full" disabled={pending}
        onClick={() => create(null)}>
        <Plus className="h-4 w-4" /> New page
      </Button>
    </div>
  );
}
