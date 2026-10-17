// Plan Your Day data hooks (REST via api-client).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { FocusSession, PlanActivity, PlanActivityInput, PlanCategory } from "@/lib/plan-shared";

export * from "@/lib/plan-shared";

export const planCategoriesKey = ["plan", "categories"] as const;
export const planActivitiesKey = ["plan", "activities"] as const;
export const focusKey = ["plan", "focus"] as const;

export function usePlanCategories() {
  return useQuery({ queryKey: planCategoriesKey, queryFn: () => api<PlanCategory[]>("/api/plan/categories") });
}
export function usePlanActivities(from: string, to: string) {
  return useQuery({
    queryKey: [...planActivitiesKey, from, to],
    queryFn: () => api<PlanActivity[]>(`/api/plan/activities?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });
}
export function useFocusSessions(date: string) {
  return useQuery({ queryKey: [...focusKey, date], queryFn: () => api<FocusSession[]>(`/api/plan/focus-sessions?date=${date}`) });
}

const fail = (msg: string) => (e: unknown) => toast.error(msg, { description: e instanceof Error ? e.message : undefined });

export function usePlanActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: planActivitiesKey });
  const refreshCats = () => qc.invalidateQueries({ queryKey: planCategoriesKey });

  return {
    createActivity: useMutation({
      mutationFn: (body: PlanActivityInput) => api<PlanActivity>("/api/plan/activities", { method: "POST", body }),
      onSuccess: () => { refresh(); toast.success("Activity added"); },
      onError: fail("Couldn't add activity"),
    }),
    updateActivity: useMutation({
      mutationFn: ({ id, body }: { id: string; body: PlanActivityInput }) => api<PlanActivity>(`/api/plan/activities/${id}`, { method: "PUT", body }),
      onSuccess: () => { refresh(); toast.success("Activity updated"); },
      onError: fail("Couldn't update activity"),
    }),
    deleteActivity: useMutation({
      mutationFn: (id: string) => api(`/api/plan/activities/${id}`, { method: "DELETE" }),
      onSuccess: () => { refresh(); toast.success("Activity deleted"); },
      onError: fail("Couldn't delete activity"),
    }),
    setException: useMutation({
      mutationFn: ({ id, date, body }: { id: string; date: string; body: { cancelled: boolean; start_minute?: number | null; end_minute?: number | null } }) =>
        api<PlanActivity>(`/api/plan/activities/${id}/exceptions/${date}`, { method: "PUT", body }),
      onSuccess: (_d, v) => { refresh(); toast.success(v.body.cancelled ? "Skipped for this day" : "Changed for this day only"); },
      onError: fail("Couldn't change this day"),
    }),
    clearException: useMutation({
      mutationFn: ({ id, date }: { id: string; date: string }) => api<PlanActivity>(`/api/plan/activities/${id}/exceptions/${date}`, { method: "DELETE" }),
      onSuccess: () => { refresh(); toast.success("Day restored to the routine"); },
      onError: fail("Couldn't restore this day"),
    }),
    createCategory: useMutation({
      mutationFn: (body: { name: string; color: string }) => api<PlanCategory>("/api/plan/categories", { method: "POST", body }),
      onSuccess: refreshCats, onError: fail("Couldn't add category"),
    }),
    updateCategory: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; color?: string }) => api<PlanCategory>(`/api/plan/categories/${id}`, { method: "PATCH", body }),
      onSuccess: refreshCats, onError: fail("Couldn't update category"),
    }),
    deleteCategory: useMutation({
      mutationFn: (id: string) => api(`/api/plan/categories/${id}`, { method: "DELETE" }),
      onSuccess: () => { refreshCats(); refresh(); }, onError: fail("Couldn't delete category"),
    }),
    saveFocusSession: useMutation({
      mutationFn: (body: Omit<FocusSession, "id">) => api<FocusSession>("/api/plan/focus-sessions", { method: "POST", body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: focusKey }),
      onError: fail("Couldn't save focus session"),
    }),
  };
}
