import { createFileRoute } from "@tanstack/react-router";
import { useLists, useTasks } from "@/lib/tasks";
import { TaskItem } from "@/components/app/TaskItem";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/PageStates";

export const Route = createFileRoute("/_authenticated/starred")({
  head: () => ({
    meta: [
      { title: "Starred — MindDesk" },
      { name: "description", content: "Your starred tasks across every list." },
      { property: "og:title", content: "Starred — MindDesk" },
      { property: "og:description", content: "Your starred tasks across every list." },
    ],
  }),
  component: Starred,
});

function Starred() {
  const lists = useLists();
  const tasks = useTasks();

  if (lists.isPending || tasks.isPending) return <LoadingState />;
  if (lists.error || tasks.error)
    return <ErrorState message={(lists.error ?? tasks.error)!.message}
      onRetry={() => { lists.refetch(); tasks.refetch(); }} />;

  const starred = tasks.data.filter((t) => t.starred && !t.completed);
  const subsOf = (id: string) => tasks.data.filter((t) => t.parent_id === id);

  return (
    <div className="mx-auto max-w-2xl p-3 md:p-6">
      <h1 className="mb-3 px-1 text-xl font-semibold tracking-tight">Starred</h1>
      {starred.length === 0 ? (
        <EmptyState title="No starred tasks" body="Star important tasks to see them all here." />
      ) : (
        <div className="rounded-2xl border bg-card p-2">
          {starred.map((t) => (
            <TaskItem key={t.id} task={t} subtasks={t.parent_id ? [] : subsOf(t.id)} lists={lists.data} showList />
          ))}
        </div>
      )}
    </div>
  );
}
