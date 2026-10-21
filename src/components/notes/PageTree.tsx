import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FileDown, FileText, MoreHorizontal, Pin, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ancestors, descendantCount, pageTitle, usePageActions, type PageFull, type PageMeta } from "@/lib/pages";
import { api } from "@/lib/api-client";
import { exportNoteToPdf } from "@/lib/pdf-export-notes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextPromptDialog } from "@/components/app/TextPromptDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

export type Scope = { kind: "notes" } | { kind: "project"; projectId: string };

export function PageLink({
  scope, pageId, className, children, onClick,
}: { scope: Scope; pageId: string; className?: string; children: ReactNode; onClick?: (() => void) | undefined }) {
  return scope.kind === "notes" ? (
    <Link to="/notes/$pageId" params={{ pageId }} className={className} onClick={onClick}>{children}</Link>
  ) : (
    <Link to="/projects/$projectId/$pageId" params={{ projectId: scope.projectId, pageId }} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

export function PageTree({
  scope, pages, activeId, onCreate, onDeleted, onNavigate,
}: {
  scope: Scope;
  pages: PageMeta[];
  activeId: string | undefined;
  onCreate: (parentId: string | null) => void;
  onDeleted: (id: string) => void;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Keep the branch containing the active page expanded.
  useEffect(() => {
    if (!activeId) return;
    const ids = ancestors(pages, activeId).map((p) => p.id);
    if (ids.length) setOpen((s) => new Set([...s, ...ids]));
  }, [activeId, pages]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const render = (parentId: string | null, depth: number): ReactNode => {
    const kids = pages.filter((p) => p.parent_id === parentId);
    if (!kids.length) return null;
    const sortedKids = [...kids].sort((a, b) => {
      if (Boolean(a.is_pinned) === Boolean(b.is_pinned)) return a.position - b.position;
      return a.is_pinned ? -1 : 1;
    });
    return sortedKids.map((p) => (
      <TreeRow
        key={p.id}
        page={p}
        scope={scope}
        depth={depth}
        hasKids={pages.some((c) => c.parent_id === p.id)}
        isOpen={open.has(p.id)}
        active={p.id === activeId}
        onToggle={() => toggle(p.id)}
        onAddChild={() => {
          setOpen((s) => new Set([...s, p.id]));
          onCreate(p.id);
        }}
        onDeleted={onDeleted}
        onNavigate={onNavigate}
        descendants={descendantCount(pages, p.id)}
      >
        {open.has(p.id) && render(p.id, depth + 1)}
      </TreeRow>
    ));
  };

  return <div role="tree" className="space-y-px">{render(null, 0)}</div>;
}

function TreeRow({
  page, scope, depth, hasKids, isOpen, active, onToggle, onAddChild, onDeleted, onNavigate, descendants, children,
}: {
  page: PageMeta; scope: Scope; depth: number; hasKids: boolean; isOpen: boolean; active: boolean;
  onToggle: () => void; onAddChild: () => void; onDeleted: (id: string) => void; onNavigate?: (() => void) | undefined;
  descendants: number; children: ReactNode;
}) {
  const { renamePage, deletePage, togglePinPage } = usePageActions();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading("Exporting note to PDF...");
    try {
      const fullPage = await api<PageFull>(`/api/pages/${page.id}`);
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
    <div role="treeitem" aria-expanded={hasKids ? isOpen : undefined} aria-selected={active}>
      <div
        className={cn(
          "group flex h-9 items-center gap-0.5 rounded-lg pr-1 text-sm transition-colors hover:bg-accent/70 md:h-8",
          active && "bg-accent text-foreground",
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={cn("flex h-7 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground", !hasKids && "invisible")}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
        </button>
        <PageLink scope={scope} pageId={page.id} onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2 py-1">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !page.title.trim() && "text-muted-foreground")}>{pageTitle(page)}</span>
          {page.is_pinned && (
            <Pin className="ml-auto mr-1 h-3 w-3 shrink-0 rotate-45 text-amber-500 fill-amber-500/20" />
          )}
        </PageLink>
        <button type="button" onClick={onAddChild} aria-label="Add subpage" title="Add subpage"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Page actions"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onSelect={() => togglePinPage.mutate({ id: page.id, pinned: !page.is_pinned })}>
              <Pin className="mr-2 h-4 w-4 text-amber-500" />
              <span>{page.is_pinned ? "Unpin note" : "Pin note"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddChild}>Add subpage</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={exporting} onSelect={handleExportPdf}>
              <FileDown className="mr-2 h-4 w-4 text-primary" />
              <span>Export as PDF</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(true)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}

      <TextPromptDialog open={renaming} onOpenChange={setRenaming} title="Rename page" initial={page.title}
        placeholder="Untitled" onSubmit={(v) => renamePage.mutateAsync({ id: page.id, title: v })} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete "${pageTitle(page)}"?`}
        description={descendants
          ? `Its ${descendants} subpage${descendants === 1 ? "" : "s"} will be deleted too. This can't be undone.`
          : "This can't be undone."}
        onConfirm={() => deletePage.mutate(page.id, { onSuccess: () => onDeleted(page.id) })} />
    </div>
  );
}
