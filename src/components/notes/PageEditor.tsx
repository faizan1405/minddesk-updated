import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, FileDown, Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { api, ApiRequestError } from "@/lib/api-client";
import { setPageTitleInCache, usePage, type PageFull, type PageMeta } from "@/lib/pages";
import type { Block } from "@/lib/page-content";
import type { MindMapMeta } from "@/lib/mindmaps";
import { pageContentToMindMap } from "@/lib/mindmap-bridge";
import { exportNoteToPdf } from "@/lib/pdf-export-notes";
import { BlockEditor } from "./BlockEditor";
import { ErrorState, LoadingState } from "@/components/app/PageStates";
import { Button } from "@/components/ui/button";

type Status = "saved" | "dirty" | "saving" | "error" | "conflict";
const DEBOUNCE_MS = 800;

export function PageEditor({ pageId }: { pageId: string }) {
  const q = usePage(pageId);
  if (q.isPending) return <LoadingState />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  // Remount per page/version so local editing state never leaks between pages.
  return (
    <LoadedEditor
      key={`${q.data.id}:${q.dataUpdatedAt}`}
      page={q.data}
      onReload={() => q.refetch()}
    />
  );
}

function LoadedEditor({ page, onReload }: { page: PageFull; onReload: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(page.title);
  const [blocks, setBlocks] = useState<Block[]>(page.content.blocks);
  const [status, setStatus] = useState<Status>("saved");
  const [focusFirst, setFocusFirst] = useState(0);

  // Latest state lives in refs so the save loop always sends the newest edit,
  // and only one request is in flight at a time (no out-of-order overwrites).
  const latest = useRef({ title: page.title, blocks: page.content.blocks });
  const version = useRef(page.version);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current || !dirty.current || blocked.current) return;
    inFlight.current = true;
    dirty.current = false;
    setStatus("saving");
    const snapshot = latest.current;
    let errored = false;
    try {
      const res = await api<PageMeta>(`/api/pages/${page.id}`, {
        method: "PATCH",
        body: {
          title: snapshot.title,
          content: { blocks: snapshot.blocks },
          base_version: version.current,
        },
      });
      version.current = res.version;
      setPageTitleInCache(qc, page.id, res.title);
      setStatus(dirty.current ? "dirty" : "saved");
    } catch (e) {
      dirty.current = true;
      errored = true;
      if (e instanceof ApiRequestError && e.status === 409) {
        blocked.current = true;
        setStatus("conflict");
      } else {
        setStatus("error");
      }
    } finally {
      inFlight.current = false;
    }
    // Edits made while this request was in flight are sent next.
    if (dirty.current && !blocked.current && !errored)
      timer.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
  }, [page.id, qc]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  function edit(next: { title?: string; blocks?: Block[] }) {
    latest.current = { ...latest.current, ...next };
    if (next.title !== undefined) {
      setTitle(next.title);
      setPageTitleInCache(qc, page.id, next.title);
    }
    if (next.blocks) setBlocks(next.blocks);
    dirty.current = true;
    if (!blocked.current) {
      setStatus("dirty");
      schedule();
    }
  }

  // Save pending changes when leaving the page or the tab.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      void flush();
    };
  }, [flush]);

  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);

  const handleVisualizeMindMap = useCallback(async () => {
    if (isVisualizing) return;
    setIsVisualizing(true);
    const toastId = toast.loading("Converting note to Mind Map...");
    try {
      if (dirty.current || inFlight.current) {
        await flush();
      }
      const { doc } = pageContentToMindMap(latest.current.title, {
        blocks: latest.current.blocks,
      });
      const mapRes = await api<MindMapMeta>("/api/mind-maps", {
        method: "POST",
        body: {
          title: latest.current.title.trim() || "Untitled Note",
          data: doc,
        },
      });
      toast.success("Note visualized as Mind Map", { id: toastId });
      navigate({ to: "/mind-maps/$mapId", params: { mapId: mapRes.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed";
      toast.error(`Visualization failed: ${msg}`, { id: toastId });
    } finally {
      setIsVisualizing(false);
    }
  }, [flush, isVisualizing, navigate]);

  const handleExportPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading("Exporting note to PDF...");
    try {
      await exportNoteToPdf({
        title: latest.current.title,
        blocks: latest.current.blocks,
      });
      toast.success("Note PDF downloaded successfully", { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate PDF";
      toast.error(`Export failed: ${msg}`, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-32 pt-6 md:px-10 md:pt-10">
      <div className="mb-3 flex h-8 items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleVisualizeMindMap}
            disabled={isVisualizing}
            className="h-8 gap-1.5 rounded-lg border-border/70 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-none transition-all hover:bg-accent hover:text-foreground active:scale-95"
            title="Visualize note as Mind Map"
            aria-label="Visualize as Mind Map"
          >
            {isVisualizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Network className="h-3.5 w-3.5 text-primary" />
            )}
            <span>Visualize as Mind Map</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="h-8 gap-1.5 rounded-lg border-border/70 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-none transition-all hover:bg-accent hover:text-foreground active:scale-95"
            title="Export note as PDF"
            aria-label="Export as PDF"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <FileDown className="h-3.5 w-3.5 text-primary" />
            )}
            <span>Export as PDF</span>
          </Button>
        </div>
        <SaveStatus
          status={status}
          onRetry={() => {
            setStatus("dirty");
            void flush();
          }}
        />
      </div>
      {status === "conflict" && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1">
            This page was changed on another device. Your latest edits here were not saved.
          </span>
          <Button size="sm" variant="outline" onClick={onReload}>
            Load latest version
          </Button>
        </div>
      )}
      <textarea
        value={title}
        rows={1}
        maxLength={300}
        placeholder="Untitled"
        aria-label="Page title"
        onChange={(e) => edit({ title: e.target.value.replace(/\n/g, "") })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setFocusFirst((n) => n + 1);
          }
        }}
        ref={(el) => {
          if (el) {
            el.style.height = "0px";
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        className="mb-4 block w-full resize-none overflow-hidden bg-transparent text-3xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-4xl"
      />
      <BlockEditor
        blocks={blocks}
        onChange={(b) => edit({ blocks: b })}
        focusFirstSignal={focusFirst}
        onExportPdf={handleExportPdf}
        isExporting={isExporting}
      />
    </div>
  );
}

function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === "saving" || status === "dirty")
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-2 text-xs text-destructive" aria-live="polite">
        <AlertCircle className="h-3.5 w-3.5" /> Not saved
        <button className="font-medium underline underline-offset-2" onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  if (status === "conflict") return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
      <Check className="h-3 w-3" /> Saved
    </span>
  );
}
