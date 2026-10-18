import { useState } from "react";
import { Download, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Node } from "@xyflow/react";
import {
  exportMindMapToPdf,
  type PdfFormat,
  type PdfPageSize,
  type PdfTheme,
} from "@/lib/pdf-export-mindmap";

interface ExportMindMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewportElement: HTMLElement | null;
  nodes: Node[];
  title: string;
  canvasBgColor?: string | undefined;
  onBeforeExport?: (() => void) | undefined;
  onAfterExport?: (() => void) | undefined;
}

export function ExportMindMapDialog({
  open,
  onOpenChange,
  viewportElement,
  nodes,
  title,
  canvasBgColor,
  onBeforeExport,
  onAfterExport,
}: ExportMindMapDialogProps) {
  const [pageSize, setPageSize] = useState<PdfPageSize>("A4");
  const [format, setFormat] = useState<PdfFormat>(nodes.length > 20 ? "multipage" : "single");
  const [theme, setTheme] = useState<PdfTheme>("light");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    if (!viewportElement) {
      toast.error("Mind map canvas is not ready. Please try again.");
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading("Generating Mind Map PDF...");

    try {
      if (onBeforeExport) onBeforeExport();
      // Allow DOM to update (e.g. selection handles to be removed)
      await new Promise((r) => setTimeout(r, 60));

      await exportMindMapToPdf({
        viewportElement,
        nodes,
        title,
        pageSize,
        format,
        theme,
        canvasBgColor,
      });

      toast.success("Mind Map PDF downloaded successfully", { id: toastId });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate PDF";
      toast.error(`Export failed: ${msg}`, { id: toastId });
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  };

  const isLargeMap = nodes.length > 15;

  return (
    <Dialog open={open} onOpenChange={isExporting ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Export Mind Map to PDF</DialogTitle>
              <DialogDescription>
                Download a high-resolution, vector-quality PDF of the complete map.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Map stats banner */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span>
              Total visible topics: <strong className="text-foreground">{nodes.length}</strong>
            </span>
            <span>Landscape layout</span>
          </div>

          {/* Page size selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Page Size
            </Label>
            <RadioGroup
              value={pageSize}
              onValueChange={(v) => setPageSize(v as PdfPageSize)}
              className="grid grid-cols-2 gap-2"
            >
              <div>
                <RadioGroupItem value="A4" id="size-a4" className="peer sr-only" />
                <Label
                  htmlFor="size-a4"
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer text-center"
                >
                  <span className="text-sm font-semibold">A4 Landscape</span>
                  <span className="text-xs text-muted-foreground">Standard (297 × 210 mm)</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="A3" id="size-a3" className="peer sr-only" />
                <Label
                  htmlFor="size-a3"
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer text-center"
                >
                  <span className="text-sm font-semibold">A3 Landscape</span>
                  <span className="text-xs text-muted-foreground">Large format (420 × 297 mm)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Layout / Format selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Document Layout
            </Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as PdfFormat)}
              className="grid grid-cols-2 gap-2"
            >
              <div>
                <RadioGroupItem value="single" id="format-single" className="peer sr-only" />
                <Label
                  htmlFor="format-single"
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer text-center"
                >
                  <span className="text-sm font-semibold">Single Page</span>
                  <span className="text-xs text-muted-foreground">
                    Proportionally fit to 1 page
                  </span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="multipage" id="format-multi" className="peer sr-only" />
                <Label
                  htmlFor="format-multi"
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer text-center"
                >
                  <span className="text-sm font-semibold">Multipage Grid</span>
                  <span className="text-xs text-muted-foreground">
                    Overview + readable sections
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Theme selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Background Theme
            </Label>
            <RadioGroup
              value={theme}
              onValueChange={(v) => setTheme(v as PdfTheme)}
              className="grid grid-cols-2 gap-2"
            >
              <div>
                <RadioGroupItem value="light" id="theme-light" className="peer sr-only" />
                <Label
                  htmlFor="theme-light"
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-2.5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer text-center"
                >
                  <span className="text-xs font-medium">Clean Light</span>
                  <span className="text-[10px] text-muted-foreground">Print-friendly white</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="canvas" id="theme-canvas" className="peer sr-only" />
                <Label
                  htmlFor="theme-canvas"
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-2.5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer text-center"
                >
                  <span className="text-xs font-medium">Canvas Background</span>
                  <span className="text-[10px] text-muted-foreground">Current app canvas</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {isLargeMap && (
            <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-2.5 text-xs text-primary">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Large mind map detected:</strong> Using <em>Multipage Grid</em> or{" "}
                <em>A3 Landscape</em> ensures all text remains large, sharp, and easy to read.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            disabled={isExporting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isExporting} onClick={handleExport} className="gap-2">
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Exporting PDF...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>Export PDF</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
