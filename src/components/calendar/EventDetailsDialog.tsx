import { useState } from "react";
import { format } from "date-fns";
import { AlignLeft, CalendarDays, MapPin, Pencil, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import {
  RECURRENCE_LABEL, colorVar, formatTime, keyToLocalDate, ruleToRecurrence, useEventActions, type Occurrence,
} from "@/lib/calendar";

export function whenLabel(o: Occurrence, tz: string) {
  const d = (k: string) => format(keyToLocalDate(k), "EEE, MMM d, yyyy");
  if (o.allDay) return o.startDay === o.endDay ? `${d(o.startDay)} · All day` : `${d(o.startDay)} – ${d(o.endDay)} · All day`;
  const range = `${formatTime(o.start, tz)} – ${formatTime(o.end, tz)}`;
  return o.startDay === o.endDay ? `${d(o.startDay)} · ${range}` : `${d(o.startDay)}, ${formatTime(o.start, tz)} – ${d(o.endDay)}, ${formatTime(o.end, tz)}`;
}

export function EventDetailsDialog({
  occurrence, onClose, onEdit, onGoToDate, tz,
}: { occurrence: Occurrence | null; onClose: () => void; onEdit: () => void; onGoToDate: (day: string) => void; tz: string }) {
  const { deleteEvent } = useEventActions();
  const [confirm, setConfirm] = useState(false);
  const o = occurrence;
  const recurring = !!o?.event.recurrence_rule;

  return (
    <>
      <Dialog open={!!o} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          {o && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <span className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: colorVar(o.event.color) }} />
                  <div className="min-w-0 text-left">
                    <DialogTitle className="break-words text-lg">{o.event.title}</DialogTitle>
                    <DialogDescription className="mt-1">{whenLabel(o, tz)}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {recurring && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Repeat className="h-4 w-4 shrink-0" /> {RECURRENCE_LABEL[ruleToRecurrence(o.event.recurrence_rule)]}
                  </div>
                )}
                {o.event.location && (
                  <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words">{o.event.location}</span></div>
                )}
                {o.event.description && (
                  <div className="flex items-start gap-3"><AlignLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><p className="whitespace-pre-wrap break-words">{o.event.description}</p></div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => { onGoToDate(o.startDay); onClose(); }}>
                  <CalendarDays className="h-4 w-4" /> Go to date
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirm(true)}>
                  <Trash2 className="h-4 w-4" /> Delete{recurring ? " series" : ""}
                </Button>
                <Button size="sm" className="gap-2" onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit{recurring ? " series" : ""}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={recurring ? "Delete this recurring series?" : "Delete this event?"}
        description={recurring ? "Every occurrence of this event will be removed. This can't be undone." : "This can't be undone."}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!o) return;
          await deleteEvent.mutateAsync(o.event.id).catch(() => {});
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}
