import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, FileDown, FileText, Layers, MoreHorizontal, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextPromptDialog } from "@/components/app/TextPromptDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { ancestors, descendantCount, pageTitle, usePageActions, type PageFull, type PageMeta } from "@/lib/pages";
import { api } from "@/lib/api-client";
import { exportNoteToPdf } from "@/lib/pdf-export-notes";
import { cn } from "@/lib/utils";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};

function NoteCard({ page, pages, context }: { page: PageMeta; pages: PageMeta[]; context?: string | undefined }) {
  const kids = pages.filter((p) => p.parent_id === page.id).length;
  const date = fmtDate(page.updated_at);
  return (
    <Link
      to="/notes/$pageId"
      params={{ pageId: page.id }}
      className="flex min-h-[60px] items-center gap-3 rounded-xl border bg-card px-3.5 py-3 outline-none transition-[transform,background-color] duration-150 active:scale-[0.99] active:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        {context && <span className="block truncate text-[11px] text-muted-foreground">{context}</span>}
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={cn("block truncate text-[15px] font-medium", !page.title.trim() && "text-muted-foreground")}>
            {pageTitle(page)}
          </span>
          {page.is_pinned && (
            <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 fill-primary/20 text-primary" aria-label="Pinned" />
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {date && <span>Edited {date}</span>}
          {kids > 0 && (
            <span className="flex items-center gap-1"><Layers className="h-3 w-3" aria-hidden />{kids} subpage{kids === 1 ? "" : "s"}</span>
          )}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Phone Notes home: every note visible straight away, with search. */
export function NotesMobileList({ pages, onCreate, pending }: { pages: PageMeta[]; onCreate: () => void; pending: boolean }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const top = useMemo(() => {
    const list = pages.filter((p) => p.parent_id === null);
    return [...list].sort((a, b) => {
      const aPin = a.is_pinned ? 1 : 0;
      const bPin = b.is_pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return 0;
    });
  }, [pages]);
  const results = useMemo(
    () => (term ? pages.filter((p) => pageTitle(p).toLowerCase().includes(term)) : []),
    [pages, term],
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-5 animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My Notes</h1>
        <Button className="h-11 gap-1.5 rounded-full px-4" disabled={pending} onClick={onCreate}>
          <Plus className="h-4 w-4" /> New note
        </Button>
      </div>
      {top.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border bg-card">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <p className="text-lg font-semibold">No notes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first note to get started.</p>
          <Button className="mt-5 gap-2 rounded-full" disabled={pending} onClick={onCreate}>
            <Plus className="h-4 w-4" /> New note
          </Button>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes"
              aria-label="Search notes" className="h-11 rounded-xl pl-9 pr-10" />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {(term ? results : top).map((p) => (
              <li key={p.id}>
                <NoteCard page={p} pages={pages}
                  context={term ? ancestors(pages, p.id).map(pageTitle).join(" › ") || undefined : undefined} />
              </li>
            ))}
          </ul>
          {term && results.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No notes match “{q.trim()}”.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Phone top bar for an open note: back, parent trail, actions. */
export function NoteMobileBar({
  pages, current, onAddSub, pending,
}: { pages: PageMeta[]; current: PageMeta; onAddSub: () => void; pending: boolean }) {
  const navigate = useNavigate();
  const { renamePage, deletePage, togglePinPage } = usePageActions();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const trail = ancestors(pages, current.id);
  const parent = trail[trail.length - 1];
  const desc = descendantCount(pages, current.id);
  const goBack = () =>
    parent ? navigate({ to: "/notes/$pageId", params: { pageId: parent.id } }) : navigate({ to: "/notes" });

  const [exporting, setExporting] = useState(false);
  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading("Exporting note to PDF...");
    try {
      const fullPage = await api<PageFull>(`/api/pages/${current.id}`);
      await exportNoteToPdf({
        title: fullPage.title,
        blocks: fullPage.content.blocks,
      });
      toast.success("Note PDF downloaded successfully", { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to export PDF";
      toast.error(`Export failed: ${msg}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sticky top-14 z-10 flex h-12 items-center gap-1 border-b bg-background/95 px-2 backdrop-blur">
      <Button variant="ghost" className="h-10 shrink-0 gap-1 px-2" onClick={goBack}
        aria-label={parent ? `Back to ${pageTitle(parent)}` : "Back to Notes"}>
        <ArrowLeft className="h-4 w-4" />
        <span className="max-w-[9rem] truncate text-sm">{parent ? pageTitle(parent) : "Notes"}</span>
      </Button>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {trail.length > 1 && trail.slice(0, -1).map(pageTitle).join(" › ")}
      </nav>
      <Button
        variant={current.is_pinned ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 shrink-0"
        aria-label={current.is_pinned ? "Unpin note" : "Pin note"}
        title={current.is_pinned ? "Unpin note" : "Pin note"}
        onClick={() => togglePinPage.mutate({ id: current.id, pinned: !current.is_pinned })}
      >
        {current.is_pinned ? (
          <Pin className="h-4 w-4 fill-primary/20 rotate-45 text-primary" />
        ) : (
          <Pin className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Note actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => togglePinPage.mutate({ id: current.id, pinned: !current.is_pinned })}>
            {current.is_pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
            <span>{current.is_pinned ? "Unpin note" : "Pin note"}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={onAddSub}>Add subpage</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={exporting} onSelect={handleExportPdf}>
            <FileDown className="mr-2 h-4 w-4 text-primary" />
            <span>Export as PDF</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(true)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TextPromptDialog open={renaming} onOpenChange={setRenaming} title="Rename note" initial={current.title}
        placeholder="Untitled" onSubmit={(v) => renamePage.mutateAsync({ id: current.id, title: v })} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete "${pageTitle(current)}"?`}
        description={desc ? `Its ${desc} subpage${desc === 1 ? "" : "s"} will be deleted too. This can't be undone.` : "This can't be undone."}
        onConfirm={() => deletePage.mutate(current.id, { onSuccess: goBack })} />
    </div>
  );
}

/** Phone subpages section shown under the editor. */
export function NoteMobileSubpages({
  pages, current, onAddSub, pending,
}: { pages: PageMeta[]; current: PageMeta; onAddSub: () => void; pending: boolean }) {
  const kids = useMemo(() => {
    const list = pages.filter((p) => p.parent_id === current.id);
    return [...list].sort((a, b) => {
      const aPin = a.is_pinned ? 1 : 0;
      const bPin = b.is_pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return 0;
    });
  }, [pages, current.id]);
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-28">
      <div className="mb-2 flex items-center justify-between border-t pt-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Subpages{kids.length ? ` · ${kids.length}` : ""}</h2>
        <Button variant="ghost" size="sm" className="h-10 gap-1" disabled={pending} onClick={onAddSub}>
          <Plus className="h-4 w-4" /> Add subpage
        </Button>
      </div>
      {kids.length > 0 && (
        <ul className="space-y-2">
          {kids.map((k) => <li key={k.id}><NoteCard page={k} pages={pages} /></li>)}
        </ul>
      )}
    </section>
  );
}
