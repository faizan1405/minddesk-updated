// Browser-side runtime copy of the signed-in user's display preferences.
// The authoritative copy lives on the server (user_settings); this module only lets plain
// helper functions (time formatting, week start, "today") read the current values.
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings-shared";

export const prefs: { timeZone: string; clock: "12" | "24"; weekStart: 0 | 1 } = {
  timeZone: DEFAULT_SETTINGS.time_zone,
  clock: DEFAULT_SETTINGS.clock,
  weekStart: 1,
};

export function setRuntimePrefs(s: Settings) {
  prefs.timeZone = s.time_zone;
  prefs.clock = s.clock;
  prefs.weekStart = s.week_start === "sunday" ? 0 : 1;
}

/** Cached appearance (theme etc.) — only to avoid a wrong-theme flash before the server answers. */
export const APPEARANCE_CACHE_KEY = "md_appearance";
type Appearance = Pick<Settings, "theme" | "accent" | "density" | "text_size" | "reduce_motion" | "high_contrast">;

export function resolveTheme(theme: Settings["theme"]): "dark" | "light" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyAppearance(a: Appearance) {
  const el = document.documentElement;
  const t = resolveTheme(a.theme);
  el.classList.toggle("dark", t === "dark");
  el.classList.toggle("light", t === "light");
  el.style.colorScheme = t;
  el.dataset["accent"] = a.accent;
  el.dataset["density"] = a.density;
  el.dataset["text"] = a.text_size;
  el.dataset["motion"] = a.reduce_motion ? "reduce" : "full";
  el.dataset["contrast"] = a.high_contrast ? "high" : "normal";
  try {
    const { theme, accent, density, text_size, reduce_motion, high_contrast } = a;
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ theme, accent, density, text_size, reduce_motion, high_contrast }));
  } catch { /* storage unavailable */ }
}

/** Inline script for <head>: applies the cached appearance before first paint. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_CACHE_KEY)})||"null");if(!a)return;var e=document.documentElement;var t=a.theme==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):a.theme;e.classList.toggle("dark",t==="dark");e.classList.toggle("light",t==="light");e.style.colorScheme=t;e.dataset.accent=a.accent;e.dataset.density=a.density;e.dataset.text=a.text_size;e.dataset.motion=a.reduce_motion?"reduce":"full";e.dataset.contrast=a.high_contrast?"high":"normal";}catch(x){}})();`;
