// Habits & Routines data hooks (REST via api-client). Completion toggles are optimistic,
// serialized per habit+date so rapid clicks always end in the last state the user chose.
import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { Habit, HabitsData, Routine } from "@/lib/habits-shared";

export * from "@/lib/habits-shared";
export const habitsKey = ["habits"] as const;
export const useHabitsData = () => useQuery({ queryKey: habitsKey, queryFn: () => api<HabitsData>("/api/habits") });

// ---------- save status (only "Saved" after the server confirms) ----------
type SaveState = "idle" | "saving" | "saved" | "error";
let saveState: SaveState = "idle";
let pendingCount = 0;
const listeners = new Set<() => void>();
const setSave = (s: SaveState) => { saveState = s; listeners.forEach((l) => l()); };
export const useSaveState = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => saveState, () => "idle" as SaveState);
async function tracked<T>(p: Promise<T>) {
  pendingCount++; setSave("saving");
  try { const r = await p; pendingCount--; if (!pendingCount && saveState !== "error") setSave("saved"); return r; }
  catch (e) { pendingCount--; setSave("error"); throw e; }
}

const patchCache = (qc: QueryClient, fn: (d: HabitsData) => HabitsData) =>
  qc.setQueryData<HabitsData>(habitsKey, (d) => (d ? fn(d) : d));
const fail = (msg: string) => (e: unknown) => toast.error(msg, { description: e instanceof Error ? e.message : undefined });

const queues = new Map<string, Promise<unknown>>();
const desired = new Map<string, boolean>();

export function useHabitActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: habitsKey });

  const setDone = (habitId: string, date: string, done: boolean) => {
    const key = `${habitId}|${date}`;
    desired.set(key, done);
    patchCache(qc, (d) => ({
      ...d,
      habits: d.habits.map((h) => h.id !== habitId ? h : {
        ...h, completions: done ? [...new Set([...h.completions, date])].sort() : h.completions.filter((x) => x !== date),
      }),
    }));
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      if (desired.get(key) !== done) return; // a newer click superseded this one
      await tracked(api(`/api/habits/${habitId}/completions/${date}`, { method: done ? "PUT" : "DELETE" }));
    }).catch((e) => {
      if (desired.get(key) === done) { fail("Couldn't save check-in")(e); refresh(); }
    });
    queues.set(key, next);
  };

  return {
    setDone,
    createHabit: useMutation({
      mutationFn: (b: Partial<Habit> & { title: string }) => tracked(api<Habit>("/api/habits", { method: "POST", body: b })),
      onSuccess: (h) => { patchCache(qc, (d) => ({ ...d, habits: [...d.habits, h] })); toast.success("Habit added"); },
      onError: fail("Couldn't add habit"),
    }),
    updateHabit: useMutation({
      mutationFn: ({ id, ...b }: Partial<Habit> & { id: string }) => tracked(api<Habit>(`/api/habits/${id}`, { method: "PATCH", body: b })),
      onSuccess: (h) => patchCache(qc, (d) => ({ ...d, habits: d.habits.map((x) => (x.id === h.id ? h : x)) })),
      onError: (e) => { fail("Couldn't update habit")(e); refresh(); },
    }),
    deleteHabit: useMutation({
      mutationFn: (id: string) => tracked(api(`/api/habits/${id}`, { method: "DELETE" })),
      onSuccess: (_r, id) => { patchCache(qc, (d) => ({ ...d, habits: d.habits.filter((x) => x.id !== id) })); toast.success("Habit deleted"); },
      onError: fail("Couldn't delete habit"),
    }),
    reorder: useMutation({
      mutationFn: (b: { routine_id: string | null; habit_ids: string[] }) => tracked(api("/api/habits/order", { method: "PUT", body: b })),
      onMutate: (b) => patchCache(qc, (d) => ({
        ...d, habits: d.habits.map((h) => { const i = b.habit_ids.indexOf(h.id); return i < 0 ? h : { ...h, routine_id: b.routine_id, position: i + 1 }; }),
      })),
      onError: (e) => { fail("Couldn't reorder")(e); refresh(); },
    }),
    createRoutine: useMutation({
      mutationFn: (title: string) => tracked(api<Routine>("/api/routines", { method: "POST", body: { title } })),
      onSuccess: (r) => { patchCache(qc, (d) => ({ ...d, routines: [...d.routines, r] })); toast.success("Routine created"); },
      onError: fail("Couldn't create routine"),
    }),
    updateRoutine: useMutation({
      mutationFn: ({ id, ...b }: { id: string; title?: string; collapsed?: boolean }) => tracked(api<Routine>(`/api/routines/${id}`, { method: "PATCH", body: b })),
      onMutate: ({ id, ...b }) => patchCache(qc, (d) => ({ ...d, routines: d.routines.map((r) => (r.id === id ? { ...r, ...b } : r)) })),
      onError: (e) => { fail("Couldn't update routine")(e); refresh(); },
    }),
    deleteRoutine: useMutation({
      mutationFn: (id: string) => tracked(api(`/api/routines/${id}`, { method: "DELETE" })),
      onSuccess: () => { refresh(); toast.success("Routine deleted — its habits are kept"); },
      onError: fail("Couldn't delete routine"),
    }),
  };
}
