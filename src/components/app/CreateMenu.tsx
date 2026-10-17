import { useState } from "react";
import { Plus, ListPlus, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextPromptDialog } from "./TextPromptDialog";
import { NewTaskDialog } from "./NewTaskDialog";
import { useTaskActions } from "@/lib/tasks";

export function CreateMenu({ compact }: { compact?: boolean }) {
  const [listOpen, setListOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const { createList } = useTaskActions();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <Button size="icon" className="h-9 w-9 rounded-full" aria-label="Create">
              <Plus className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="h-10 w-full justify-start gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Create
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => setTaskOpen(true)}>
            <SquarePen className="h-4 w-4" /> New task
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setListOpen(true)}>
            <ListPlus className="h-4 w-4" /> New list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TextPromptDialog
        open={listOpen}
        onOpenChange={setListOpen}
        title="Create new list"
        placeholder="List name"
        confirmLabel="Create"
        onSubmit={(title) => createList.mutateAsync(title)}
      />
      <NewTaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
    </>
  );
}
