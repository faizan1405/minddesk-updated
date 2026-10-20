import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, FileDown, Loader2, Network, Pin } from "lucide-react";
import { toast } from "sonner";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  setPageTitleInCache,
  usePage,
  usePageActions,
  type PageFull,
  type PageMeta,
} from "@/lib/pages";
import type { Block } from "@/lib/page-content";
import type { MindMapMeta } from "@/lib/mindmaps";
import { pageContentToMindMap } from "@/lib/mindmap-bridge";
import { exportNoteToPdf } from "@/lib/pdf-export-notes";
import { NotesHistoryManager } from "@/lib/notes-history";
import { BlockEditor, type FocusTarget } from "./BlockEditor";
import { ErrorState, LoadingState } from "@/components/app/PageStates";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "saved" | "dirty" | "saving" | "error" | "conflict";
const DEBOUNCE_MS = 800;

export function PageEditor({ pageId }: { pageId: string }) {
  const [reloadCounter, setReloadCounter] = useState(0);
  const q = usePage(pageId);
  if (q.isPending) return <LoadingState />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  // Remount per pageId or explicit user reload, but never on metadata query updates like pin/unpin
  return (
    <LoadedEditor
      key={`${pageId}:${reloadCounter}`}
      page={q.data}
      onReload={() => {
        setReloadCounter((c) => c + 1);
        void q.refetch();
      }}
    />
  );
}

function LoadedEditor({ page, onReload }: { page: PageFull; onReload: () => void }) {
  const qc = useQueryClient();
  const { togglePinPage } = usePageActions();

  const [isPinned, setIsPinned] = useState(Boolean(page.is_pinned));
  useEffect(() => {
    setIsPinned(Boolean(page.is_pinned));
  }, [page.is_pinned]);

  const [title, setTitle] = useState(page.title);
  const [blocks, setBlocks] = useState<Block[]>(page.content.blocks);
  const [status, setStatus] = useState<Status>("saved");
  const [focusFirst, setFocusFirst] = useState(0);

  // Undo / Redo history manager (minimum 100 steps, default 150)
  const historyRef = useRef<NotesHistoryManager>(
    new NotesHistoryManager({ title: page.title, blocks: page.content.blocks }),
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [pendingFocusExternal, setPendingFocusExternal] = useState<FocusTarget | null>(null);

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const syncHistoryState = useCallback(() => {
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

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

  function edit(
    next: { title?: string; blocks?: Block[] | ((prev: Block[]) => Block[]) },
    isTyping = false,
    cursor?: FocusTarget,
  ) {
    const nextTitle = next.title !== undefined ? next.title : latest.current.title;
    const nextBlocks =
      typeof next.blocks === "function"
        ? next.blocks(latest.current.blocks)
        : next.blocks !== undefined
          ? next.blocks
          : latest.current.blocks;
    const nextDoc = { title: nextTitle, blocks: nextBlocks };

    latest.current = nextDoc;
    if (next.title !== undefined) {
      setTitle(next.title);
      setPageTitleInCache(qc, page.id, next.title);
    }
    if (next.blocks !== undefined) {
      setBlocks(nextBlocks);
    }

    const typingKey = isTyping
      ? cursor?.isTitle
        ? "typing:title"
        : cursor?.id
          ? `typing:${cursor.id}`
          : "typing"
      : undefined;

    historyRef.current.commit(nextDoc, {
      key: typingKey,
      cursor: cursor ?? undefined,
    });
    syncHistoryState();

    dirty.current = true;
    if (!blocked.current) {
      setStatus("dirty");
      schedule();
    }
  }

  const getActiveCursor = useCallback((): FocusTarget | null => {
    if (document.activeElement === titleRef.current && titleRef.current) {
      return {
        isTitle: true,
        pos: titleRef.current.selectionStart,
        endPos: titleRef.current.selectionEnd,
      };
    }
    return null;
  }, []);

  const handleUndo = useCallback(() => {
    const activeCur = getActiveCursor();
    if (activeCur) {
      historyRef.current.setCursor(activeCur);
    }
    const res = historyRef.current.undo();
    if (!res) return;

    const { doc, cursor } = res;
    latest.current = doc;
    setTitle(doc.title);
    setBlocks(doc.blocks);
    setPageTitleInCache(qc, page.id, doc.title);

    dirty.current = true;
    if (!blocked.current) {
      setStatus("dirty");
      schedule();
    }
    syncHistoryState();

    if (cursor) {
      if (cursor.isTitle && titleRef.current) {
        titleRef.current.focus();
        titleRef.current.setSelectionRange(cursor.pos, cursor.endPos ?? cursor.pos);
      } else if (cursor.id) {
        setPendingFocusExternal({ id: cursor.id, pos: cursor.pos, endPos: cursor.endPos });
      }
    }
  }, [getActiveCursor, page.id, qc, schedule, syncHistoryState]);

  const handleRedo = useCallback(() => {
    const res = historyRef.current.redo();
    if (!res) return;

    const { doc, cursor } = res;
    latest.current = doc;
    setTitle(doc.title);
    setBlocks(doc.blocks);
    setPageTitleInCache(qc, page.id, doc.title);

    dirty.current = true;
    if (!blocked.current) {
      setStatus("dirty");
      schedule();
    }
    syncHistoryState();

    if (cursor) {
      if (cursor.isTitle && titleRef.current) {
        titleRef.current.focus();
        titleRef.current.setSelectionRange(cursor.pos, cursor.endPos ?? cursor.pos);
      } else if (cursor.id) {
        setPendingFocusExternal({ id: cursor.id, pos: cursor.pos, endPos: cursor.endPos });
      }
    }
  }, [page.id, qc, schedule, syncHistoryState]);

  // Keyboard shortcut listener scoped to the editor container
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const active = document.activeElement;
      if (!editorContainerRef.current?.contains(active)) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;

      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key.toLowerCase() === "y" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo]);

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
    <div
      ref={editorContainerRef}
      className="mx-auto w-full max-w-[720px] px-5 pb-32 pt-6 md:px-10 md:pt-10"
    >
      <div className="mb-3 flex h-8 items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Pin / Unpin button in opened note header */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const nextPinned = !isPinned;
              setIsPinned(nextPinned);
              togglePinPage.mutate(
                { id: page.id, pinned: nextPinned },
                {
                  onError: () => {
                    setIsPinned(!nextPinned);
                  },
                },
              );
            }}
            className={cn(
              "h-8 gap-1.5 rounded-lg border-border/70 bg-background/50 px-2.5 text-xs font-medium shadow-none transition-all hover:bg-accent active:scale-95",
              isPinned
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
            title={isPinned ? "Unpin note" : "Pin note"}
            aria-label={isPinned ? "Unpin note" : "Pin note"}
          >
            <Pin
              className={cn(
                "h-3.5 w-3.5",
                isPinned ? "rotate-45 fill-amber-500/30 text-amber-500" : "text-muted-foreground",
              )}
            />
            <span>{isPinned ? "Pinned" : "Pin"}</span>
          </Button>

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
        ref={(el) => {
          titleRef.current = el;
          if (el) {
            el.style.height = "0px";
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        value={title}
        rows={1}
        maxLength={300}
        placeholder="Untitled"
        aria-label="Page title"
        onChange={(e) => {
          const val = e.target.value.replace(/\n/g, "");
          const cursor: FocusTarget = {
            isTitle: true,
            pos: e.target.selectionStart,
            endPos: e.target.selectionEnd,
          };
          edit({ title: val }, true, cursor);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setFocusFirst((n) => n + 1);
          }
        }}
        className="mb-4 block w-full resize-none overflow-hidden bg-transparent text-3xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-4xl"
      />
      <BlockEditor
        blocks={blocks}
        onChange={(b, isTyping, cursor) => edit({ blocks: b }, isTyping, cursor ?? undefined)}
        focusFirstSignal={focusFirst}
        onExportPdf={handleExportPdf}
        isExporting={isExporting}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        pendingFocusExternal={pendingFocusExternal}
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
