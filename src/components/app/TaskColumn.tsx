import { useState, type FormEvent } from "react";
import { ChevronRight, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTaskActions, type Task, type TaskList } from "@/lib/tasks";
import { TaskItem } from "./TaskItem";
import { defaultDueFor, useSettings } from "@/hooks/use-settings";
import { TextPromptDialog } from "./TextPromptDialog";
import { ConfirmDialog } from "./ConfirmDialog";

export function TaskColumn({
  list, tasks, lists, className,
}: { list: TaskList; tasks: Task[]; lists: TaskList[]; className?: string }) {
  const actions = useTaskActions();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const prefs = useSettings();
  const [showDone, setShowDone] = useState(prefs.show_completed);
  const manual = prefs.task_sort === "manual";
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const top = tasks.filter((t) => !t.parent_id);
  const subsOf = (id: string) => tasks.filter((t) => t.parent_id === id);
  const manualOrder = top.filter((t) => !t.completed)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  // Due date / newest are view-only orders: saved manual positions are never rewritten by them.
  const active = manual ? manualOrder : [...manualOrder].sort((a, b) =>
    prefs.task_sort === "newest"
      ? b.created_at.localeCompare(a.created_at)
      : (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.position - b.position);
  // Non-drag reordering: rewrite positions as 0..n so every move is a clean swap.
  const move = (id: string, dir: -1 | 1) => {
    const order = active.map((t) => t.id);
    const i = order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    order.forEach((tid, idx) => {
      const t = active.find((x) => x.id === tid)!;
      if (t.position !== idx) actions.updateTask.mutate({ id: tid, patch: { position: idx } });
    });
  };
  const done = top
    .filter((t) => t.completed)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    actions.createTask.mutate({ list_id: list.id, title: t, due_date: defaultDueFor(prefs) });
    setTitle("");
  }

  return (
    <section className={cn("flex flex-col rounded-2xl border bg-card", className)} aria-label={list.title}>
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{list.title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="List actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename list</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(true)}>
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="px-2">
        {adding ? (
          <form onSubmit={add} className="flex items-center gap-2 px-2 py-1">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title"
              onBlur={() => !title.trim() && setAdding(false)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)} className="h-10 rounded-xl" />
            <Button type="submit" size="sm" disabled={!title.trim()}>Add</Button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/60">
            <Plus className="h-5 w-5" /> Add a task
          </button>
        )}
      </div>

      <div className="flex-1 px-2 pb-2">
        {active.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {done.length ? "All tasks complete. Nice work." : "No tasks yet."}
          </p>
        )}
        {active.map((t, i) => <TaskItem key={t.id} task={t} subtasks={subsOf(t.id)} lists={lists}
          onMoveUp={manual && i > 0 ? () => move(t.id, -1) : undefined}
          onMoveDown={manual && i < active.length - 1 ? () => move(t.id, 1) : undefined} />)}
      </div>

      {done.length > 0 && (
        <div className="border-t px-2 py-2">
          <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted-foreground hover:bg-accent/60">
            <ChevronRight className={cn("h-4 w-4 transition-transform", showDone && "rotate-90")} />
            Completed ({done.length})
          </button>
          {showDone && done.map((t) => <TaskItem key={t.id} task={t} subtasks={subsOf(t.id)} lists={lists} />)}
        </div>
      )}

      <TextPromptDialog open={renaming} onOpenChange={setRenaming} title="Rename list" initial={list.title}
        onSubmit={(v) => actions.renameList.mutateAsync({ id: list.id, title: v })} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete "${list.title}"?`}
        description={`All ${top.length} task(s) in this list will be deleted. This can't be undone.`}
        onConfirm={() => actions.deleteList.mutate(list.id)} />
    </section>
  );
}
