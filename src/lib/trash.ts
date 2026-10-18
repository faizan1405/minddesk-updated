import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { listsKey, tasksKey } from "@/lib/tasks";
import { pagesKey, projectsKey } from "@/lib/pages";

export type TrashItemType =
  | "note"
  | "task"
  | "task_list"
  | "project"
  | "mind_map"
  | "event"
  | "habit"
  | "routine";

export type TrashFilter = "all" | "note" | "task" | "project" | "mind_map" | "calendar" | "habit";

export interface TrashItem {
  id: string;
  type: TrashItemType;
  title: string;
  deleted_at: string;
  days_remaining: number;
  details?: string | undefined;
  parent_id?: string | null | undefined;
  parent_title?: string | null | undefined;
  is_locked?: boolean | undefined;
}

export interface TrashResponse {
  items: TrashItem[];
  counts: Record<TrashFilter, number>;
}

export const trashKey = ["trash"] as const;

export function useTrash(filter: TrashFilter = "all", search: string = "") {
  return useQuery({
    queryKey: [...trashKey, filter, search],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (filter && filter !== "all") sp.set("filter", filter);
      if (search.trim()) sp.set("q", search.trim());
      const query = sp.toString() ? `?${sp.toString()}` : "";
      return api<TrashResponse>(`/api/trash${query}`);
    },
  });
}

const fail = (msg: string) => (e: unknown) =>
  toast.error(msg, { description: e instanceof Error ? e.message : undefined });

export function useTrashActions() {
  const qc = useQueryClient();

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: trashKey });
    qc.invalidateQueries({ queryKey: listsKey });
    qc.invalidateQueries({ queryKey: tasksKey });
    qc.invalidateQueries({ queryKey: pagesKey });
    qc.invalidateQueries({ queryKey: projectsKey });
    qc.invalidateQueries({ queryKey: ["mind_maps"] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["habits"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: ["data-summary"] });
  };

  const restoreItemMutation = useMutation({
    mutationFn: ({ type, id }: { type: TrashItemType; id: string }) =>
      api<{ success: boolean; id: string; type: TrashItemType }>("/api/trash/restore", {
        method: "POST",
        body: { type, id },
      }),
    onSuccess: (_, variables) => {
      refreshAll();
      const typeLabel = formatType(variables.type);
      toast.success(`${typeLabel} restored`);
    },
    onError: fail("Couldn't restore item"),
  });

  const restoreAllMutation = useMutation({
    mutationFn: (filter?: TrashFilter) =>
      api<{ restoredCount: number }>("/api/trash/restore-all", {
        method: "POST",
        body: { filter },
      }),
    onSuccess: (data) => {
      refreshAll();
      toast.success(
        data.restoredCount === 1 ? "1 item restored" : `${data.restoredCount} items restored`,
      );
    },
    onError: fail("Couldn't restore items"),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: ({ type, id }: { type: TrashItemType; id: string }) =>
      api<{ success: boolean; id: string }>("/api/trash/permanent", {
        method: "POST",
        body: { type, id },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trashKey });
      qc.invalidateQueries({ queryKey: ["data-summary"] });
      toast.success("Item permanently deleted");
    },
    onError: fail("Couldn't delete item permanently"),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: (filter?: TrashFilter) =>
      api<{ deletedCount: number; lockedSkipped: number }>("/api/trash/empty", {
        method: "POST",
        body: { filter },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: trashKey });
      qc.invalidateQueries({ queryKey: ["data-summary"] });
      if (data.lockedSkipped > 0) {
        toast.success(
          `Deleted ${data.deletedCount} items (${data.lockedSkipped} locked mind map${data.lockedSkipped > 1 ? "s were" : " was"} protected)`,
        );
      } else {
        toast.success(
          data.deletedCount === 1
            ? "1 item permanently deleted"
            : `${data.deletedCount} items permanently deleted`,
        );
      }
    },
    onError: fail("Couldn't empty recycle bin"),
  });

  return {
    restoreItem: restoreItemMutation.mutate,
    restoreItemAsync: restoreItemMutation.mutateAsync,
    isRestoring: restoreItemMutation.isPending,

    restoreAll: restoreAllMutation.mutate,
    restoreAllAsync: restoreAllMutation.mutateAsync,
    isRestoringAll: restoreAllMutation.isPending,

    permanentlyDelete: permanentDeleteMutation.mutate,
    permanentlyDeleteAsync: permanentDeleteMutation.mutateAsync,
    isDeletingPermanently: permanentDeleteMutation.isPending,

    emptyTrash: emptyTrashMutation.mutate,
    emptyTrashAsync: emptyTrashMutation.mutateAsync,
    isEmptying: emptyTrashMutation.isPending,
  };
}

export function formatType(type: TrashItemType): string {
  switch (type) {
    case "note":
      return "Note";
    case "task":
      return "Task";
    case "task_list":
      return "Task List";
    case "project":
      return "Project";
    case "mind_map":
      return "Mind Map";
    case "event":
      return "Calendar Event";
    case "habit":
      return "Habit";
    case "routine":
      return "Routine";
    default:
      return "Item";
  }
}
