import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLists, useTaskActions } from "@/lib/tasks";
import { DueDatePicker } from "./DueDatePicker";
import { defaultDueFor, useSettings } from "@/hooks/use-settings";

export function NewTaskDialog({
  open, onOpenChange, defaultListId,
}: { open: boolean; onOpenChange: (o: boolean) => void; defaultListId?: string }) {
  const { data: lists = [] } = useLists();
  const { createTask, createList } = useTaskActions();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [listId, setListId] = useState<string>("");
  const prefs = useSettings();

  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setDue(defaultDueFor(prefs));
      setListId(defaultListId ?? lists[0]?.id ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultListId, lists]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    let target = listId;
    if (!target) {
      const l = await createList.mutateAsync("My Tasks");
      target = l.id;
    }
    await createTask.mutateAsync({
      list_id: target, title: title.trim(), description: description.trim() || null, due_date: due,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
          <Input autoFocus placeholder="Title" value={title} maxLength={500}
            onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-xl" />
          <Textarea placeholder="Details (optional)" value={description}
            onChange={(e) => setDescription(e.target.value)} className="min-h-20 rounded-xl" />
          <div className="flex flex-wrap items-center gap-2">
            <DueDatePicker value={due} onChange={setDue} />
            {lists.length > 0 ? (
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger className="h-9 w-auto min-w-36 rounded-full"><SelectValue placeholder="List" /></SelectTrigger>
                <SelectContent>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">A "My Tasks" list will be created.</span>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || createTask.isPending}>Add task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
