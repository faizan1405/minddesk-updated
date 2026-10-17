import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings-shared";
import { applyAppearance, setRuntimePrefs } from "@/lib/prefs-runtime";
import { addDaysKey } from "@/lib/plan-shared";
import { todayIn } from "@/lib/habits-shared";

export const settingsKey = ["settings"] as const;

export function useSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api<Settings>("/api/settings"),
    staleTime: Infinity,
    retry: 1,
    enabled,
  });
}

/** Current preferences (defaults until loaded or if loading failed). */
export function useSettings(): Settings {
  const q = useSettingsQuery();
  return q.data ?? DEFAULT_SETTINGS;
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api<Settings>("/api/settings", { method: "PUT", body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      const prev = qc.getQueryData<Settings>(settingsKey);
      qc.setQueryData<Settings>(settingsKey, { ...(prev ?? DEFAULT_SETTINGS), ...patch });
      return { prev };
    },
    onError: (e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(settingsKey, ctx.prev);
      toast.error("Couldn't save setting", { description: e instanceof Error ? e.message : undefined });
    },
    onSuccess: (s) => qc.setQueryData(settingsKey, s),
  });
}

/** Applies preferences app-wide: runtime values for time helpers (synchronously) and appearance on <html>. */
export function useApplySettings(s: Settings) {
  setRuntimePrefs(s);
  const { theme, accent, density, text_size, reduce_motion, high_contrast } = s;
  useEffect(() => {
    const a = { theme, accent, density, text_size, reduce_motion, high_contrast };
    applyAppearance(a);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => applyAppearance(a);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme, accent, density, text_size, reduce_motion, high_contrast]);
}

/** Due date a brand-new task starts with, per Settings. */
export function defaultDueFor(s: Settings): string | null {
  if (s.default_due === "none") return null;
  const today = todayIn();
  return s.default_due === "today" ? today : addDaysKey(today, 1);
}

/** Short completion chime generated in the browser (no audio files or services). */
export function playChime(volume: number) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const v = Math.max(0, Math.min(1, volume / 100)) * 0.4;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g).connect(gain);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
    setTimeout(() => void ctx.close(), 1200);
    return ctx.state !== "suspended";
  } catch {
    return false;
  }
}
