import { useState } from "react";
import { Check, ChevronRight, MoreVertical, Star, CalendarIcon, CornerDownRight, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTaskActions, type Task, type TaskList } from "@/lib/tasks";
import { dueLabel, isOverdue } from "./due";
import { ConfirmDialog } from "./ConfirmDialog";
import { TaskEditDialog } from "./TaskEditDialog";

export function CompleteToggle({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      aria-pressed={task.completed}
      className={cn(
        "group/check relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors before:absolute before:-inset-3 before:content-[''] active:scale-90",
        task.completed
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/50 hover:border-primary",
      )}
    >
      <Check className={cn("h-3 w-3 transition-opacity", task.completed ? "opacity-100" : "opacity-0 group-hover/check:opacity-60")} strokeWidth={3} />
    </button>
  );
}

export function TaskItem({
  task, subtasks = [], lists, showList, onMoveUp, onMoveDown,
}: { task: Task; subtasks?: Task[]; lists: TaskList[]; showList?: boolean; onMoveUp?: (() => void) | undefined; onMoveDown?: (() => void) | undefined }) {
  const actions = useTaskActions();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isSub = !!task.parent_id;
  const doneSubs = subtasks.filter((s) => s.completed).length;
  const listName = lists.find((l) => l.id === task.list_id)?.title;

  return (
    <div className="group">
      <div className={cn("flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/60", isSub && "py-1.5")}>
        <CompleteToggle task={task} onToggle={() => actions.toggleComplete(task)} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(true)}>
          <div className={cn("break-words text-sm leading-5", task.completed && "text-muted-foreground line-through")}>
            {task.title}
          </div>
          {task.description && !task.completed && (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{task.description}</div>
          )}
          {(task.due_date || (showList && listName)) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {task.due_date && (
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                  !task.completed && isOverdue(task.due_date) ? "border-destructive/40 text-destructive" : "text-muted-foreground",
                )}>
                  <CalendarIcon className="h-3 w-3" /> {dueLabel(task.due_date)}
                </span>
              )}
              {showList && listName && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{listName}</span>
              )}
            </div>
          )}
        </button>

        {!isSub && subtasks.length > 0 && (
          <button type="button" onClick={() => setExpanded((e) => !e)}
            className="flex h-7 items-center gap-0.5 rounded-full px-1.5 text-[11px] text-muted-foreground hover:bg-secondary"
            aria-expanded={expanded} aria-label="Toggle subtasks">
            {doneSubs}/{subtasks.length}
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
        )}
        <Button variant="ghost" size="icon" onClick={() => actions.toggleStar(task)}
          aria-label={task.starred ? "Unstar" : "Star"} aria-pressed={task.starred}
          className={cn("-my-1.5 h-10 w-10 shrink-0 rounded-full md:my-0 md:h-7 md:w-7", !task.starred && "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100")}>
          <Star className={cn("h-4 w-4", task.starred ? "fill-star text-star" : "text-muted-foreground")} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Task actions"
              className="-my-1.5 h-10 w-10 shrink-0 rounded-full md:my-0 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => setEditing(true)}>Edit details</DropdownMenuItem>
            {!isSub && (
              <DropdownMenuItem onSelect={() => { setExpanded(true); setEditing(true); }}>
                <CornerDownRight className="h-4 w-4" /> Add subtask
              </DropdownMenuItem>
            )}
            {!isSub && lists.length > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {lists.filter((l) => l.id !== task.list_id).map((l) => (
                    <DropdownMenuItem key={l.id}
                      onSelect={() => actions.updateTask.mutate({ id: task.id, patch: { list_id: l.id } })}>
                      {l.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {(onMoveUp || onMoveDown) && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!onMoveUp} onSelect={() => onMoveUp?.()}><ArrowUp className="h-4 w-4" /> Move up</DropdownMenuItem>
              <DropdownMenuItem disabled={!onMoveDown} onSelect={() => onMoveDown?.()}><ArrowDown className="h-4 w-4" /> Move down</DropdownMenuItem>
            </>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!isSub && expanded && subtasks.length > 0 && (
        <div className="ml-7 border-l pl-2">
          {subtasks.map((s) => <TaskItem key={s.id} task={s} lists={lists} />)}
        </div>
      )}

      <TaskEditDialog open={editing} onOpenChange={setEditing} task={task} subtasks={subtasks} lists={lists} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this task?"
        description={subtasks.length ? "Its subtasks will be deleted too. This can't be undone." : "This can't be undone."}
        onConfirm={() => actions.deleteTask.mutate(task.id)} />
    </div>
  );
}
