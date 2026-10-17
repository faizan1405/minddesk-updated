import { createFileRoute, Link } from "@tanstack/react-router";
import { useLists, useTasks } from "@/lib/tasks";
import { TaskColumn } from "@/components/app/TaskColumn";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/PageStates";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/lists/$listId")({
  head: () => ({
    meta: [
      { title: "Task list — MindDesk" },
      { name: "description", content: "A single MindDesk task list." },
      { property: "og:title", content: "Task list — MindDesk" },
      { property: "og:description", content: "A single MindDesk task list." },
    ],
  }),
  component: ListPage,
});

function ListPage() {
  const { listId } = Route.useParams();
  const lists = useLists();
  const tasks = useTasks();

  if (lists.isPending || tasks.isPending) return <LoadingState />;
  if (lists.error || tasks.error)
    return <ErrorState message={(lists.error ?? tasks.error)!.message}
      onRetry={() => { lists.refetch(); tasks.refetch(); }} />;

  const list = lists.data.find((l) => l.id === listId);
  if (!list)
    return <EmptyState title="List not found" body="It may have been deleted."
      action={<Button asChild variant="outline"><Link to="/tasks">Back to All Tasks</Link></Button>} />;

  return (
    <div className="mx-auto max-w-2xl p-3 md:p-6">
      <TaskColumn list={list} tasks={tasks.data.filter((t) => t.list_id === list.id)} lists={lists.data} />
    </div>
  );
}
