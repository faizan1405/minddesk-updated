import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dueLabel } from "./due";

export function DueDatePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full">
            <CalendarIcon className="h-3.5 w-3.5" />
            {value ? dueLabel(value) : "Date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ? parseISO(value) : undefined}
            onSelect={(d) => { onChange(d ? format(d, "yyyy-MM-dd") : null); setOpen(false); }}
            className="pointer-events-auto p-3"
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Clear date"
          onClick={() => onChange(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
