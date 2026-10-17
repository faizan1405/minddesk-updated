import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLists, useTasks } from "@/lib/tasks";
import { TaskColumn } from "@/components/app/TaskColumn";
import { ListCarousel } from "@/components/app/ListCarousel";
import { EmptyState, ErrorState, LoadingState, NewListButton } from "@/components/app/PageStates";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "All Tasks — MindDesk" },
      { name: "description", content: "All your task lists side by side." },
      { property: "og:title", content: "All Tasks — MindDesk" },
      { property: "og:description", content: "All your task lists side by side." },
    ],
  }),
  component: AllTasks,
});

function AllTasks() {
  const lists = useLists();
  const tasks = useTasks();
  const isMobile = useIsMobile();

  if (lists.isPending || tasks.isPending) return <LoadingState />;
  if (lists.error || tasks.error)
    return <ErrorState message={(lists.error ?? tasks.error)!.message}
      onRetry={() => { lists.refetch(); tasks.refetch(); }} />;

  const allLists = lists.data;
  if (allLists.length === 0)
    return <EmptyState title="Start your first list"
      body="Create a list to group your tasks — like Personal, Work, or Groceries." action={<NewListButton />} />;

  const tasksFor = (id: string) => tasks.data.filter((t) => t.list_id === id);

  if (isMobile) {
    return (
      <div className="space-y-2 pt-3">
        <div className="flex items-center gap-2 px-3">
          <nav aria-label="Task views" className="flex min-w-0 flex-1 gap-1.5">
            <span aria-current="page" className="rounded-full bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary">Lists</span>
            <Link to="/starred" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors active:bg-accent">
              <Star className="h-3.5 w-3.5" aria-hidden /> Starred
            </Link>
          </nav>
          <NewListButton variant="outline" />
        </div>
        <ListCarousel lists={allLists} tasks={tasks.data} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between px-6 pb-2 pt-5">
        <h1 className="text-xl font-semibold tracking-tight">All Tasks</h1>
        <NewListButton variant="outline" />
      </div>
      <div className="flex flex-1 items-start gap-4 overflow-x-auto px-6 pb-6 pt-2">
        {allLists.map((l) => (
          <TaskColumn key={l.id} list={l} tasks={tasksFor(l.id)} lists={allLists} className="w-[340px] shrink-0" />
        ))}
      </div>
    </div>
  );
}
