import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Pin, PinOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreatePageNav } from "@/components/notes/PageWorkspace";
import { pageTitle, usePageActions, usePages, useProjects } from "@/lib/pages";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { data: projects = [] } = useProjects();
  const { data: allPages = [] } = usePages();
  const { create, pending } = useCreatePageNav({ kind: "project", projectId });
  const { togglePinProject } = usePageActions();
  const project = projects.find((p) => p.id === projectId);
  const pages = allPages.filter((p) => p.project_id === projectId);
  const top = useMemo(() => {
    const list = pages.filter((p) => !p.parent_id);
    return [...list].sort((a, b) => {
      const aPin = a.is_pinned ? 1 : 0;
      const bPin = b.is_pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return 0;
    });
  }, [pages]);
  const subCount = (id: string) => pages.filter((p) => p.parent_id === id).length;

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-6 md:px-10 md:pt-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{project?.title}</h1>
        {project && (
          <Button
            variant={project.is_pinned ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5 rounded-full"
            aria-label={project.is_pinned ? "Unpin project" : "Pin project"}
            onClick={() => togglePinProject.mutate({ id: project.id, pinned: !project.is_pinned })}
          >
            {project.is_pinned ? (
              <>
                <Pin className="h-4 w-4 fill-primary/20 rotate-45 text-primary" />
                <span>Pinned</span>
              </>
            ) : (
              <>
                <Pin className="h-4 w-4 text-muted-foreground" />
                <span>Pin</span>
              </>
            )}
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {pages.length} page{pages.length === 1 ? "" : "s"} in this project
      </p>

      <div className="mt-8 space-y-1">
        {top.map((p) => (
          <Link key={p.id} to="/projects/$projectId/$pageId" params={{ projectId, pageId: p.id }}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate">{pageTitle(p)}</span>
              {p.is_pinned && (
                <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 fill-primary/20 text-primary" aria-label="Pinned" />
              )}
            </span>
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
