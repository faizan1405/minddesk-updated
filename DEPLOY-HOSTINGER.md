# Deploying MindDesk to Hostinger (Node.js + MySQL)

Architecture: Browser → MindDesk Node.js app (pages + `/api/*` REST endpoints) → Hostinger MySQL.
One Node.js process serves both the React frontend and the API, so refreshing any page works.

## API
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Disabled (returns 403 Forbidden) |
| POST | `/api/auth/login` | Sign in, sets HTTP-only `md_session` cookie |
| POST | `/api/auth/logout` | Ends session |
| GET | `/api/auth/me` | Current user or `null` |
| GET/POST | `/api/task-lists` | List / create task lists |
| PATCH/DELETE | `/api/task-lists/:id` | Rename / delete list (deletes its tasks) |
| GET/POST | `/api/tasks` | List / create tasks and subtasks |
| PATCH/DELETE | `/api/tasks/:id` | Update (title, details, completed, starred, due date, list) / delete |
| GET/POST | `/api/projects` | List / create projects |
| PATCH/DELETE | `/api/projects/:id` | Rename / delete project (deletes its pages) |
| GET/POST | `/api/pages` | List page tree (no content) / create note, project page or subpage |
| GET/PATCH/DELETE | `/api/pages/:id` | Read with content / save title+content (`base_version` required for content) / delete with subpages |
| GET/POST | `/api/events` | List / create calendar events |
| PATCH/DELETE | `/api/events/:id` | Update / delete event |
| GET/POST | `/api/mind-maps` | List / create mind maps |
| GET/PATCH/DELETE | `/api/mind-maps/:id` | Read with nodes+edges / update / delete (locked maps cannot be deleted) |
| GET/POST | `/api/routines` | List / create routines |
| PATCH/DELETE | `/api/routines/:id` | Update / delete routine (moves habits to trash) |
| GET/POST | `/api/habits` | List / create habits |
| PATCH/DELETE | `/api/habits/:id` | Update / delete habit |
| GET/POST | `/api/trash` | List trashed items (supports `?type=` filter and `?q=` search) |
| POST | `/api/trash/restore` | Restore a trashed item by `{ type, id }` |
| POST | `/api/trash/restore-all` | Restore all trashed items for current user |
| POST/DELETE | `/api/trash/permanent` | Permanently delete a trashed item by `{ type, id }` |
| POST/DELETE | `/api/trash/empty` | Empty entire recycle bin for current user |
| GET/POST | `/api/trash/cleanup` | Server-side scheduled cleanup of items expired > 30 days (requires `CRON_SECRET` authorization) |

All user endpoints require an authenticated session and only touch the signed-in user's rows.
Passwords use scrypt with a random salt; session tokens are random and stored only as SHA-256 hashes.

## 1. Create the database (hPanel → Databases → MySQL)
Create a database and user, note host, name, user and password.

## 2. Create the Node.js app (hPanel → Websites → Add → Node.js app, GitHub import)
- Node version: **20.19+ (22 recommended)**
- Install: `npm install` (runs `prisma generate` automatically)
- Build command: `npm run build:hostinger`
- Start command: `npm start`  (runs `node .output/server/index.mjs`, listens on `PORT`)
- Environment variables:
  - `DATABASE_URL` (see `.env.example`)
  - `NODE_ENV=production`
  - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (one-time owner account bootstrap on empty database; `ADMIN_PASSWORD` can be removed after initial login)
  - `CRON_SECRET` (optional, secure token used to authenticate automated cleanup if using HTTP webhook cron)

## 3. Database Migrations (Run before deploying updated code)

> [!IMPORTANT]
> Always take a complete database backup in **Hostinger hPanel → Databases → phpMyAdmin → Export** before running any migration on a production database!

Prisma migrations do not run automatically during deployment on Hostinger. You must apply them manually or via Hostinger terminal/SSH.

If using Hostinger SSH/Terminal:
```bash
npm run db:migrate
```

If using **Hostinger phpMyAdmin**:
Open your database in phpMyAdmin, click the **SQL** tab, and run the migration files in order (0001 through 0009).

### Migration 0009 (`0009_recycle_bin`) — Recycle Bin with Soft Deletion
This migration adds `deleted_at` timestamp columns and indexed lookups to all 8 core models (`task_lists`, `tasks`, `projects`, `pages`, `events`, `mind_maps`, `routines`, `habits`).
Existing rows remain active (`deleted_at` defaults to `NULL`). No data is modified or deleted.

Run this SQL in phpMyAdmin:
```sql
-- AlterTable: Add deleted_at columns
ALTER TABLE `task_lists` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `tasks` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `projects` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `pages` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `events` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `mind_maps` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `routines` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `habits` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex: Add composite indexes for efficient user_id + deleted_at queries
CREATE INDEX `task_lists_user_id_deleted_at_idx` ON `task_lists`(`user_id`, `deleted_at`);
CREATE INDEX `tasks_user_id_deleted_at_idx` ON `tasks`(`user_id`, `deleted_at`);
CREATE INDEX `projects_user_id_deleted_at_idx` ON `projects`(`user_id`, `deleted_at`);
CREATE INDEX `pages_user_id_deleted_at_idx` ON `pages`(`user_id`, `deleted_at`);
CREATE INDEX `events_user_id_deleted_at_idx` ON `events`(`user_id`, `deleted_at`);
CREATE INDEX `mind_maps_user_id_deleted_at_idx` ON `mind_maps`(`user_id`, `deleted_at`);
CREATE INDEX `routines_user_id_deleted_at_idx` ON `routines`(`user_id`, `deleted_at`);
CREATE INDEX `habits_user_id_deleted_at_idx` ON `habits`(`user_id`, `deleted_at`);
```

### Previous Migrations Reference:
- Migration 0006 (`0006_habits_routines`): adds `routines`, `habits` and `habit_completions` tables.
- Migration 0007 (`0007_settings`): adds `display_name` column to `users` and `user_settings` table.
- Migration 0008 (`0008_mind_map_lock`): adds `is_locked` column to `mind_maps` (`ALTER TABLE mind_maps ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false;`).

### Safe Reconciliation for Manually Applied Migrations
If SQL migrations (e.g. `0008_mind_map_lock` or `0009_recycle_bin`) were executed manually in phpMyAdmin:
Do **not** run `prisma migrate deploy` before reconciling, as Prisma would attempt to re-add existing columns and throw errors.
Instead, register the migrations as applied in `_prisma_migrations` using the Hostinger SSH/terminal:
```bash
npx prisma migrate resolve --applied 0008_mind_map_lock
npx prisma migrate resolve --applied 0009_recycle_bin
```
This safely records the migrations in `_prisma_migrations` without re-executing any SQL statements.

## 4. HTTPS
Enable SSL for the domain in hPanel. In production the session cookie is `Secure`, so the site must use HTTPS.

## 5. Automatic 30-Day Recycle Bin Cleanup (Hostinger Cron Setup)

> [!WARNING]
> Automatic permanent deletion of expired items (> 30 days) requires a server-side scheduled cron job. Do **not** expect expired items to be automatically purged unless one of the two Hostinger Cron setups below is active!

You can configure the scheduled cleanup in **hPanel → Advanced → Cron Jobs**. Run it once daily (e.g., at midnight `0 0 * * *`).

### Option A: Hostinger CLI Cron Job (Recommended)
This runs the lightweight cleanup script directly via Node.js on the server:

1. In hPanel, go to **Cron Jobs**.
2. Select **Custom** type.
3. Schedule: **Once per day** (`0 0 * * *`).
4. Command:
   ```bash
   cd /home/uXXXX/domains/yourdomain.com/public_html && node scripts/cleanup-trash.mjs
   ```
   *(Replace `/home/uXXXX/domains/yourdomain.com/public_html` with your actual Hostinger app root path).*

The script loads your environment, calculates the 30-day UTC expiration cutoff, executes idempotent batch purges of expired items (respecting lock protection), outputs a JSON summary of removed items, and exits.

### Option B: Hostinger HTTP Webhook Cron Job
If your plan prefers web requests or you use an external cron service (like cron-job.org):

1. Set `CRON_SECRET="your-secure-random-secret"` in Hostinger Environment Variables.
2. In hPanel **Cron Jobs**, set the command to:
   ```bash
   curl -s -X POST https://yourdomain.com/api/trash/cleanup -H "Authorization: Bearer your-secure-random-secret"
   ```
3. Schedule: **Once per day** (`0 0 * * *`).

## Local development against MySQL
```
cp .env.example .env.local   # set DATABASE_URL
npm install && npm run db:migrate
npm run build:hostinger && DATABASE_URL=... npm start
```
