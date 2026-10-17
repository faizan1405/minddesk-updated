import { createFileRoute } from "@tanstack/react-router";
import { PageEditor } from "@/components/notes/PageEditor";

export const Route = createFileRoute("/_authenticated/projects/$projectId/$pageId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { pageId } = Route.useParams();
  return <PageEditor key={pageId} pageId={pageId} />;
}
