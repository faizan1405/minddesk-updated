import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function TextPromptDialog({
  open, onOpenChange, title, placeholder, initial = "", confirmLabel = "Save", onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onSubmit(v);
      onOpenChange(false);
    } catch {
      /* toast handled by mutation */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <Input autoFocus value={value} placeholder={placeholder} maxLength={200}
            onChange={(e) => setValue(e.target.value)} className="h-11 rounded-xl" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !value.trim()}>{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
