// Browser-side helper for calling the MindDesk REST API (same origin, cookie session).
//
// Development-only Preview Mode: when the app runs on the Vite dev server (import.meta.env.DEV)
// AND the server explicitly reports that no database is configured (/api/health → database:false),
// requests are answered by an in-memory adapter instead of the server. Production builds compile
// `import.meta.env.DEV` to `false`, so the adapter is never bundled or reachable there; server
// routes are untouched and always enforce real authentication.
export class ApiRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Init = { method?: string; body?: unknown };

let previewCheck: Promise<boolean> | null = null;

/** Resolves true only in development when the server has no database. Fails closed. */
export function isPreviewMode(): Promise<boolean> {
  if (!import.meta.env.DEV || typeof window === "undefined") return Promise.resolve(false);
  if (import.meta.env["VITE_PREVIEW_MODE"] === "off") return Promise.resolve(false);
  previewCheck ??= fetch("/api/health", { credentials: "same-origin" })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = (await r.json().catch(() => null)) as { database?: unknown } | null;
      return data?.database === false;
    })
    .catch(() => false);
  return previewCheck;
}

async function realFetch<T>(path: string, init: Init): Promise<T> {
  const req: RequestInit = { method: init.method ?? "GET", credentials: "same-origin" };
  if (init.body !== undefined) {
    req.headers = { "content-type": "application/json" };
    req.body = JSON.stringify(init.body);
  }
  const res = await fetch(path, req);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  if (import.meta.env.DEV && (await isPreviewMode())) {
    const { previewRequest } = await import("@/lib/preview/adapter");
    const res = previewRequest(init.method ?? "GET", path, init.body === undefined ? undefined : JSON.parse(JSON.stringify(init.body)));
    if (res.status >= 400) throw new ApiRequestError(res.status, (res.data as { error?: string }).error ?? "Request failed");
    return JSON.parse(JSON.stringify(res.data)) as T;
  }
  return realFetch<T>(path, init);
}
