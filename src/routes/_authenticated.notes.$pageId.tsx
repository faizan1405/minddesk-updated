import { createFileRoute } from "@tanstack/react-router";
import { PageEditor } from "@/components/notes/PageEditor";

export const Route = createFileRoute("/_authenticated/notes/$pageId")({
  component: NotePage,
});

function NotePage() {
  const { pageId } = Route.useParams();
  return <PageEditor key={pageId} pageId={pageId} />;
}
