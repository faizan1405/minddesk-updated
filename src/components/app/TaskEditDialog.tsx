import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTaskActions, type Task, type TaskList } from "@/lib/tasks";
import { DueDatePicker } from "./DueDatePicker";
import { CompleteToggle } from "./TaskItem";

export function TaskEditDialog({
  open, onOpenChange, task, subtasks, lists,
}: { open: boolean; onOpenChange: (o: boolean) => void; task: Task; subtasks: Task[]; lists: TaskList[] }) {
  const actions = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState<string | null>(task.due_date);
  const [listId, setListId] = useState(task.list_id);
  const [newSub, setNewSub] = useState("");
  const isSub = !!task.parent_id;

  useEffect(() => {
    if (open) {
      setTitle(task.title); setDescription(task.description ?? ""); setDue(task.due_date);
      setListId(task.list_id); setNewSub("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    actions.updateTask.mutate({
      id: task.id,
      patch: {
        title: title.trim(),
        description: description.trim() || null,
        due_date: due,
        ...(listId !== task.list_id ? { list_id: listId } : {}),
      },
    });
    onOpenChange(false);
  }

  function addSub() {
    const t = newSub.trim();
    if (!t) return;
    actions.createTask.mutate({ list_id: task.list_id, parent_id: task.id, title: t });
    setNewSub("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader><DialogTitle>{isSub ? "Edit subtask" : "Edit task"}</DialogTitle></DialogHeader>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500}
            className="h-11 rounded-xl text-base" aria-label="Title" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details" className="min-h-24 rounded-xl" aria-label="Details" />
          <div className="flex flex-wrap items-center gap-2">
            <DueDatePicker value={due} onChange={setDue} />
            {!isSub && (
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger className="h-9 w-auto min-w-36 rounded-full" aria-label="List"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {!isSub && (
            <div className="space-y-1 rounded-xl border p-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Subtasks</div>
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1">
                  <CompleteToggle task={s} onToggle={() => actions.toggleComplete(s)} />
                  <span className={cn("flex-1 text-sm", s.completed && "text-muted-foreground line-through")}>{s.title}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete subtask"
                    onClick={() => actions.deleteTask.mutate(s.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subtask"
                  className="h-9 rounded-lg" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} />
                <Button type="button" size="icon" variant="secondary" className="h-9 w-9 shrink-0"
                  onClick={addSub} aria-label="Add subtask" disabled={!newSub.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
