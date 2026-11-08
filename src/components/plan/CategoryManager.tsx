import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EVENT_COLORS, colorVar } from "@/lib/calendar";
import { usePlanActions, type PlanCategory } from "@/lib/plan";

function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Change color" className="h-7 w-7 shrink-0 rounded-full ring-1 ring-border" style={{ background: colorVar(value) }} />
      </PopoverTrigger>
      <PopoverContent className="flex w-auto gap-1.5 p-2">
        {EVENT_COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} className="h-7 w-7 rounded-full" style={{ background: colorVar(c) }} />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Row({ c }: { c: PlanCategory }) {
  const { updateCategory, deleteCategory } = usePlanActions();
  const { preservationMode } = useAuth();
  const isPreserved = preservationMode ?? true;
  const [name, setName] = useState(c.name);
  const commit = () => { const n = name.trim(); if (n && n !== c.name) updateCategory.mutate({ id: c.id, name: n }); else setName(c.name); };
  return (
    <li className="flex items-center gap-2">
      <ColorPick value={c.color} onChange={(color) => updateCategory.mutate({ id: c.id, color })} />
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label={`Rename ${c.name}`} maxLength={60} className="h-9" />
      {c.is_default ? (
        <span className="w-9 shrink-0 text-center text-[10px] text-muted-foreground">default</span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${c.name}`}
          disabled={isPreserved}
          title={isPreserved ? "Category deletion is disabled while Data Preservation Mode is active" : `Delete ${c.name}`}
          onClick={() => { if (!isPreserved) deleteCategory.mutate(c.id); }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

export function CategoryManager({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: PlanCategory[] }) {
  const { createCategory } = usePlanActions();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("teal");
  const add = () => { const n = name.trim(); if (!n) return; createCategory.mutate({ name: n, color }); setName(""); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>Rename or recolor categories. Deleting a custom category leaves its activities uncategorised.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">{categories.map((c) => <Row key={c.id + c.name + c.color} c={c} />)}</ul>
        <div className="flex items-center gap-2 border-t pt-4">
          <ColorPick value={color} onChange={setColor} />
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New category" maxLength={60} className="h-9" />
          <Button size="sm" className="gap-1" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
