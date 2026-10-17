import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Card({ title, description, children, tone }: { title?: string; description?: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 md:p-5", tone === "danger" && "border-destructive/40")}>
      {title && <h3 className={cn("text-sm font-semibold", tone === "danger" && "text-destructive")}>{title}</h3>}
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className={cn(title || description ? "mt-4" : "", "space-y-4")}>{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, htmlFor }: { label: string; hint?: string | undefined; children: ReactNode; htmlFor?: string | undefined }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-muted/50 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn(
            "min-h-9 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, id }: { label: string; hint?: string | undefined; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Row>
  );
}
