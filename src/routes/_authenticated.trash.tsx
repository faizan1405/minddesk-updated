import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Trash2, RotateCcw, Search, X, CheckSquare, List, NotebookPen, FolderKanban,
  CalendarDays, Network, Repeat, Flame, Info, AlertTriangle, Lock,
} from "lucide-react";
import { useTrash, useTrashActions, type TrashFilter, type TrashItem, formatType } from "@/lib/trash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/PageStates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trash")({
  head: () => ({
    meta: [
      { title: "Recycle Bin — MindDesk" },
      { name: "description", content: "Recover or permanently delete deleted items within 30 days." },
      { property: "og:title", content: "Recycle Bin — MindDesk" },
      { property: "og:description", content: "Recover or permanently delete deleted items within 30 days." },
    ],
  }),
  component: RecycleBinPage,
});

const filterTabs: { key: TrashFilter; label: string }[] = [
  { key: "all", label: "All Items" },
  { key: "note", label: "Notes" },
  { key: "task", label: "Tasks" },
  { key: "project", label: "Projects" },
  { key: "mind_map", label: "Mind Maps" },
  { key: "calendar", label: "Calendar" },
  { key: "habit", label: "Habits" },
];

function getItemIcon(item: TrashItem) {
  switch (item.type) {
    case "note":
      return NotebookPen;
    case "task":
      return CheckSquare;
    case "task_list":
      return List;
    case "project":
      return FolderKanban;
    case "mind_map":
      return Network;
    case "event":
      return CalendarDays;
    case "routine":
      return Repeat;
    case "habit":
      return Flame;
    default:
      return Trash2;
  }
}

function formatDeletedDate(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

export function RecycleBinPage() {
  const [filter, setFilter] = useState<TrashFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = useTrash(filter, search);
  const actions = useTrashActions();

  // Dialog states
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;

  const items = data?.items ?? [];
  const counts = data?.counts ?? {
    all: 0,
    note: 0,
    task: 0,
    project: 0,
    mind_map: 0,
    calendar: 0,
    habit: 0,
  };

  const totalInBin = counts.all;
  const currentCount = counts[filter];

  return (
    <div className="mx-auto max-w-4xl p-3 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Recycle Bin</h1>
            {totalInBin > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                {totalInBin}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Items remain recoverable for 30 days before being automatically and permanently deleted.
          </p>
        </div>

        {totalInBin > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={actions.isRestoringAll || items.length === 0}
              onClick={() => setConfirmRestoreAll(true)}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{filter === "all" ? "Restore All" : `Restore All (${currentCount})`}</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actions.isEmptying || items.length === 0}
              onClick={() => setConfirmEmpty(true)}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              <span>{filter === "all" ? "Empty Recycle Bin" : "Empty Category"}</span>
            </Button>
          </div>
        )}
      </div>

      {/* 30-Day Auto-Deletion Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground sm:text-sm">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">30-Day Recovery Window</p>
          <p>
            When items are deleted from MindDesk, they move here for 30 days. Restoring recovers all original
            content, hierarchy, and associations. After 30 days, expired items are permanently purged.
          </p>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Horizontal filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((t) => {
            const count = counts[t.key] ?? 0;
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deleted items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 pr-8 text-xs sm:text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      {items.length === 0 ? (
        totalInBin === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Trash2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Recycle Bin is empty</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              Items you delete from tasks, notes, projects, mind maps, calendar, or habits will remain here for 30 days.
            </p>
          </div>
        ) : (
          <EmptyState
            title="No matching items"
            body={`No deleted items match the "${filterTabs.find((f) => f.key === filter)?.label}" filter${search ? ` and search query "${search}"` : ""}.`}
          />
        )
      ) : (
        <div className="rounded-2xl border bg-card divide-y">
          {items.map((item) => {
            const Icon = getItemIcon(item);
            const daysLeft = item.days_remaining;
            return (
              <div
                key={`${item.type}-${item.id}`}
                className="group flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/30"
              >
                {/* Left: Icon, Title, and details */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm truncate max-w-md" title={item.title}>
                        {item.title}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wider py-0 px-1.5">
                        {formatType(item.type)}
                      </Badge>
                      {item.is_locked && (
                        <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] py-0 px-1.5">
                          <Lock className="h-2.5 w-2.5" />
                          Locked
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {item.details && <span>{item.details}</span>}
                      <span>Deleted {formatDeletedDate(item.deleted_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Days remaining and actions */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                  {/* Days remaining badge */}
                  <div>
                    {daysLeft <= 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Expires today
                      </span>
                    ) : daysLeft <= 5 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                        {daysLeft} days left
                      </span>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => actions.restoreItem({ type: item.type, id: item.id })}
                      disabled={actions.isRestoring}
                      title="Restore original item"
                      className="h-8 gap-1 px-2.5 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restore</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setItemToDelete(item)}
                      disabled={actions.isDeletingPermanently}
                      title="Permanently remove from database"
                      className="h-8 gap-1 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Single Item Permanent Delete Dialog */}
      <ConfirmDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title={`Permanently delete "${itemToDelete?.title}"?`}
        description={
          itemToDelete?.is_locked
            ? "This mind map is currently locked. You must unlock it before it can be deleted."
            : "This action cannot be undone. This item and any dependent content will be immediately and permanently removed from MySQL."
        }
        confirmLabel="Delete Permanently"
        onConfirm={() => {
          if (itemToDelete) {
            actions.permanentlyDelete({ type: itemToDelete.type, id: itemToDelete.id });
            setItemToDelete(null);
          }
        }}
      />

      {/* Empty Trash Confirmation Dialog */}
      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title={filter === "all" ? "Empty Recycle Bin?" : `Empty ${filterTabs.find((f) => f.key === filter)?.label}?`}
        description="All items in this view will be permanently deleted from MySQL. This action is irreversible. Active and locked items remain safe."
        confirmLabel="Empty Recycle Bin"
        onConfirm={() => {
          actions.emptyTrash(filter);
          setConfirmEmpty(false);
        }}
      />

      {/* Restore All Confirmation Dialog */}
      <ConfirmDialog
        open={confirmRestoreAll}
        onOpenChange={setConfirmRestoreAll}
        title={filter === "all" ? "Restore all items?" : `Restore all ${filterTabs.find((f) => f.key === filter)?.label}?`}
        description="All deleted items will be returned to their original places with their hierarchy and content intact."
        confirmLabel="Restore All"
        onConfirm={() => {
          actions.restoreAll(filter);
          setConfirmRestoreAll(false);
        }}
      />
    </div>
  );
}
