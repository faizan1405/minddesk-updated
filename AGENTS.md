<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md

- Production target is self-hosted Node.js on Hostinger with MySQL; never add Lovable Cloud/Supabase or other managed backends as runtime dependencies — owner requires full self-hosting.
- Backend = TanStack server routes under `src/routes/api.*` (REST, JSON) using Prisma (`prisma/schema.prisma`, MySQL); helpers in `src/lib/server/api.server.ts`, loaded via dynamic import inside handlers — keeps server code out of the client bundle.
- Auth is app-owned: scrypt password hashes, random session token in HTTP-only `md_session` cookie, hashed in the `sessions` table — no external auth provider.
- Frontend talks to the API only through `src/lib/api-client.ts`; task hooks live in `src/lib/tasks.ts`, auth in `src/hooks/use-auth.tsx` — single source of truth is MySQL, no local storage of data.
- Schema changes: edit `prisma/schema.prisma` and add a new folder under `prisma/migrations/` with the SQL; deploy with `prisma migrate deploy`.
- Hostinger build: `npm run build:hostinger` (Nitro `node-server` preset) then `npm start` — the Lovable sandbox ignores NITRO_PRESET, so this only applies outside Lovable.
- Signed-in pages live under the `_authenticated` pathless layout, which checks `/api/auth/me` and renders the sidebar shell.
- Notes and project pages share one `pages` table (`project_id` null = personal note); content is JSON text `{blocks:[{id,type:p|check|number|bullet,text,checked?}]}` validated by `src/lib/page-content.ts` — one simple editor for both.
- Page content saves use optimistic concurrency (`base_version` → 409 on stale) and the editor keeps one save in flight with debounce — prevents out-of-order overwrites.
- Tasks use `parent_id` for subtasks, `position` for ordering and `recurrence_rule` reserved for recurrence — so drag-and-drop and recurring tasks need no schema change.
- The app is dark-first: `:root` and `.dark` share the same tokens in `src/styles.css`.
- Calendar events (`events` table) store timed events as UTC instants and all-day events as dates at 00:00 UTC (end inclusive); recurrence is one RRULE per series expanded client-side in `src/lib/calendar.ts` — no per-occurrence rows, no tz shifts for all-day.
- Preview Mode (no-login UI testing) is client-only: `src/lib/api-client.ts` routes requests to the in-memory `src/lib/preview/adapter.ts` only when `import.meta.env.DEV` and `/api/health` reports no database — production builds strip it, server auth is never bypassed. New API endpoints need a matching handler in the adapter.
- Plan Your Day stores wall-clock minutes per local day (`end <= start` = overnight), routines as a weekday bitmask on one row, and per-day changes in `plan_activity_exceptions`; shared logic in `src/lib/plan-shared.ts`.
- Mind maps store each map as one validated JSON document (`mind_maps.data`: layout, nodes with manual x/y, custom links) saved whole with `base_version` → 409; shared rules/layout in `src/lib/mindmap-doc.ts` — atomic saves, and layouts only run on explicit user action.
- Habits store schedules as a weekday bitmask (bit 0 = Sunday) and completions as one row per habit+local date key; streak/progress rules live in `src/lib/habits-shared.ts` — shared by server, preview adapter and UI.
- Below the `md` breakpoint the global nav is `src/components/app/MobileBottomNav.tsx` (4 tabs; route grouping in `navGroupFor`) and the sidebar trigger is hidden; desktop keeps the sidebar — one primary nav per breakpoint.
- User preferences are one JSON document per user in `user_settings` (validated by `src/lib/settings-shared.ts`, unknown/invalid keys fall back to defaults); the client applies them in the `_authenticated` shell via `src/hooks/use-settings.tsx` — time helpers read `src/lib/prefs-runtime.ts`, appearance is classes/data-* on `<html>` styled in `src/styles.css`; localStorage only caches appearance to avoid a theme flash.
