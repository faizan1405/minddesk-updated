import { createFileRoute } from "@tanstack/react-router";
import { NotebookPen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreatePageNav } from "@/components/notes/PageWorkspace";
import { usePages } from "@/lib/pages";

export const Route = createFileRoute("/_authenticated/notes/")({
  component: NotesHome,
});

function NotesHome() {
  const { create, pending } = useCreatePageNav({ kind: "notes" });
  const { data = [] } = usePages();
  const count = data.filter((p) => p.project_id === null).length;
  return (
    <div className="mx-auto mt-16 max-w-sm px-4 text-center md:mt-24">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border bg-card">
        <NotebookPen className="h-5 w-5 text-primary" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{count ? "Pick a note" : "Your notes"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {count
          ? "Choose a page from the list, or start a new one."
          : "Write freely with plain text, checklists, numbered and bullet lists."}
      </p>
      <Button className="mt-6 gap-2 rounded-full" disabled={pending} onClick={() => create(null)}>
        <Plus className="h-4 w-4" /> New note
      </Button>
    </div>
  );
}
