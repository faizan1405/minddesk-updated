import { useState, type ReactNode } from "react";
import { Loader2, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextPromptDialog } from "./TextPromptDialog";
import { useTaskActions } from "@/lib/tasks";

export function LoadingState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <p className="font-medium">Couldn't load your tasks</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button className="mt-4" variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto mt-20 max-w-sm px-4 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function NewListButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const { createList } = useTaskActions();
  return (
    <>
      <Button variant={variant} className="gap-2 rounded-full" onClick={() => setOpen(true)}>
        <ListPlus className="h-4 w-4" /> New list
      </Button>
      <TextPromptDialog open={open} onOpenChange={setOpen} title="Create new list" placeholder="List name"
        confirmLabel="Create" onSubmit={(v) => createList.mutateAsync(v)} />
    </>
  );
}
