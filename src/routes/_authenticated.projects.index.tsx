import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, MoreHorizontal, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePageActions, usePages, useProjects, type Project } from "@/lib/pages";
import { TextPromptDialog } from "@/components/app/TextPromptDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { ErrorState, LoadingState } from "@/components/app/PageStates";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsHome,
});

function ProjectsHome() {
  const projects = useProjects();
  const pages = usePages();
  const { createProject } = usePageActions();
  const [creating, setCreating] = useState(false);

  if (projects.isPending) return <LoadingState />;
  if (projects.error) return <ErrorState message={projects.error.message} onRetry={() => projects.refetch()} />;

  const countFor = (id: string) => pages.data?.filter((p) => p.project_id === id).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <Button className="gap-2 rounded-full" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      {projects.data.length === 0 ? (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border bg-card">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">No projects yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a project, then add pages and subpages inside it.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((p) => <ProjectCard key={p.id} project={p} pageCount={countFor(p.id)} />)}
        </div>
      )}

      <TextPromptDialog open={creating} onOpenChange={setCreating} title="New project" placeholder="Project name"
        confirmLabel="Create" onSubmit={(v) => createProject.mutateAsync(v)} />
    </div>
  );
}

function ProjectCard({ project, pageCount }: { project: Project; pageCount: number }) {
  const { renameProject, deleteProject } = usePageActions();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="group relative rounded-2xl border bg-card transition-colors hover:border-primary/40">
      <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block p-5 pr-12">
        <FolderKanban className="mb-4 h-5 w-5 text-primary" />
        <div className="truncate font-medium">{project.title}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {pageCount} page{pageCount === 1 ? "" : "s"} · updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Project actions"
            className="absolute right-3 top-3 h-8 w-8 rounded-full">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TextPromptDialog open={renaming} onOpenChange={setRenaming} title="Rename project" initial={project.title}
        onSubmit={(v) => renameProject.mutateAsync({ id: project.id, title: v })} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete "${project.title}"?`}
        description={`All ${pageCount} page(s) in this project will be deleted. This can't be undone.`}
        onConfirm={() => deleteProject.mutate(project.id)} />
    </div>
  );
}
