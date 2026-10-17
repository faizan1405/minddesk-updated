import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ancestors, descendantCount, pageTitle, usePageActions, type PageMeta } from "@/lib/pages";
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
    return kids.map((p) => (
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
  const { renamePage, deletePage } = usePageActions();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddChild}>Add subpage</DropdownMenuItem>
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
