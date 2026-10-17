import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { isPreviewMode } from "@/lib/api-client";

/** Small indicator shown only while development Preview Mode is active. */
export function PreviewBanner() {
  const preview = useQuery({ queryKey: ["preview-mode"], queryFn: isPreviewMode, staleTime: Infinity });
  if (!preview.data) return null;
  return (
    <div role="status" className="pointer-events-none fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 md:bottom-3 md:left-auto md:right-4 md:translate-x-0">
      <div className="flex items-center gap-2 whitespace-nowrap rounded-full border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
        <FlaskConical className="h-3.5 w-3.5 text-primary" />
        Preview Mode — Changes are temporary.
      </div>
    </div>
  );
}
