import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md px-4 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border bg-card">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <span className="mt-5 inline-block rounded-full border px-3 py-1 text-xs text-muted-foreground">
        Coming in a later phase
      </span>
    </div>
  );
}
