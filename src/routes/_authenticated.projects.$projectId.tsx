import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { PageWorkspace } from "@/components/notes/PageWorkspace";
import { useProjects } from "@/lib/pages";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/PageStates";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { pageId } = useParams({ strict: false });
  const projects = useProjects();

  if (projects.isPending) return <LoadingState />;
  if (projects.error) return <ErrorState message={projects.error.message} onRetry={() => projects.refetch()} />;
  const project = projects.data.find((p) => p.id === projectId);
  if (!project)
    return <EmptyState title="Project not found" body="It may have been deleted."
      action={<Button asChild variant="outline"><Link to="/projects">All projects</Link></Button>} />;

  return (
    <PageWorkspace
      scope={{ kind: "project", projectId }}
      title={project.title}
      titleSlot={<Link to="/projects/$projectId" params={{ projectId }} className="hover:text-primary">{project.title}</Link>}
      activeId={pageId}
    >
      <Outlet />
    </PageWorkspace>
  );
}
