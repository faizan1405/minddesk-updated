import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { PageWorkspace } from "@/components/notes/PageWorkspace";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Notes — MindDesk" },
      { name: "description", content: "Simple notes with checklists, numbered and bullet lists." },
      { property: "og:title", content: "Notes — MindDesk" },
      { property: "og:description", content: "Simple notes with checklists, numbered and bullet lists." },
    ],
  }),
  component: NotesLayout,
});

function NotesLayout() {
  const { pageId } = useParams({ strict: false });
  return (
    <PageWorkspace scope={{ kind: "notes" }} title="Notes" activeId={pageId}>
      <Outlet />
    </PageWorkspace>
  );
}
