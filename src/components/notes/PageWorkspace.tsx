import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, PanelLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ancestors, pageTitle, usePageActions, usePages } from "@/lib/pages";
import { ErrorState, LoadingState } from "@/components/app/PageStates";
import { PageLink, PageTree, type Scope } from "./PageTree";
import { NoteMobileBar, NoteMobileSubpages, NotesMobileList } from "./NotesMobile";

export function useCreatePageNav(scope: Scope) {
  const navigate = useNavigate();
  const { createPage } = usePageActions();
  return {
    pending: createPage.isPending,
    create: (parentId: string | null) =>
      createPage.mutate(
        { parent_id: parentId, project_id: scope.kind === "project" ? scope.projectId : null },
        {
          onSuccess: (p) =>
            scope.kind === "notes"
              ? navigate({ to: "/notes/$pageId", params: { pageId: p.id } })
              : navigate({ to: "/projects/$projectId/$pageId", params: { projectId: scope.projectId, pageId: p.id } }),
        },
      ),
  };
}

export function PageWorkspace({
  scope, title, titleSlot, activeId, children,
}: { scope: Scope; title: string; titleSlot?: ReactNode; activeId: string | undefined; children: ReactNode }) {
  const pagesQ = usePages();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { create, pending } = useCreatePageNav(scope);

  if (pagesQ.isPending) return <LoadingState />;
  if (pagesQ.error) return <ErrorState message={pagesQ.error.message} onRetry={() => pagesQ.refetch()} />;

  const pages = pagesQ.data.filter((p) =>
    scope.kind === "notes" ? p.project_id === null : p.project_id === scope.projectId,
  );
  const trail = activeId ? ancestors(pages, activeId) : [];
  const current = pages.find((p) => p.id === activeId);
  // Phones browse notes as a direct list + full-screen editor; desktop keeps the tree.
  const phoneNotes = scope.kind === "notes";

  const onDeleted = (id: string) => {
    if (activeId && (id === activeId || trail.some((a) => a.id === id))) {
      if (scope.kind === "notes") navigate({ to: "/notes" });
      else navigate({ to: "/projects/$projectId", params: { projectId: scope.projectId } });
    }
  };

  const tree = (
    <>
      <div className="mb-2 flex items-center gap-2 px-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{titleSlot ?? title}</div>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="New page"
          title="New page" disabled={pending} onClick={() => { create(null); setMobileOpen(false); }}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {pages.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">No pages yet.</p>
      ) : (
        <PageTree scope={scope} pages={pages} activeId={activeId} onDeleted={onDeleted}
          onCreate={(pid) => { create(pid); setMobileOpen(false); }} onNavigate={() => setMobileOpen(false)} />
      )}
    </>
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r px-2 py-4 md:block">
        {tree}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto p-3">
          <SheetHeader className="sr-only"><SheetTitle>{title} pages</SheetTitle></SheetHeader>
          <div className="pt-8">{tree}</div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        {phoneNotes && (
          <div className="md:hidden">
            {!activeId ? (
              <NotesMobileList pages={pages} pending={pending} onCreate={() => create(null)} />
            ) : current ? (
              <div key={current.id} className="animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none">
                <NoteMobileBar pages={pages} current={current} pending={pending} onAddSub={() => create(current.id)} />
                {children}
                <NoteMobileSubpages pages={pages} current={current} pending={pending} onAddSub={() => create(current.id)} />
              </div>
            ) : children}
          </div>
        )}
        <div className={phoneNotes ? "hidden md:block" : undefined}>
        <div className="flex min-h-11 items-center gap-1 border-b px-3 text-sm md:border-0 md:px-6 md:pt-3">
          <Button variant="ghost" size="sm" className="-ml-1 h-9 gap-1.5 md:hidden" onClick={() => setMobileOpen(true)}>
            <PanelLeft className="h-4 w-4" /> Pages
          </Button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 overflow-hidden text-muted-foreground">
            {scope.kind === "project" && (
              <Link to="/projects/$projectId" params={{ projectId: scope.projectId }}
                className="hidden max-w-40 truncate hover:text-foreground sm:block">{title}</Link>
            )}
            {current &&
              trail.map((a) => (
                <span key={a.id} className="flex min-w-0 items-center gap-1">
                  {(scope.kind === "project" || a !== trail[0]) && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 sm:block" />}
                  <PageLink scope={scope} pageId={a.id} className="max-w-36 truncate hover:text-foreground">{pageTitle(a)}</PageLink>
                </span>
              ))}
            {current && (trail.length > 0 || scope.kind === "project") && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {current && <span className="truncate text-foreground">{pageTitle(current)}</span>}
          </nav>
        </div>
        {children}
        </div>
      </div>
    </div>
  );
}
