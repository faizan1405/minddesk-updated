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

All task endpoints require a session and only touch the signed-in user's rows.
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

## 3. Create the tables (once, and after future schema changes)
Run `npm run db:migrate` (Prisma `migrate deploy`) from Hostinger's terminal/SSH,
or import the SQL files in `prisma/migrations/` with phpMyAdmin, in order (0001, 0002, 0003, 0004, 0005, 0006, then 0007).
Migration 0006 (`0006_habits_routines`) adds the `routines`, `habits` and `habit_completions` tables; existing data is untouched.
Migration 0007 (`0007_settings`) adds a `display_name` column to `users` and a `user_settings` table for preferences; existing data is untouched.

## 4. HTTPS
Enable SSL for the domain in hPanel. In production the session cookie is `Secure`, so the site must use HTTPS.

## Local development against MySQL
```
cp .env.example .env.local   # set DATABASE_URL
npm install && npm run db:migrate
npm run build:hostinger && DATABASE_URL=... npm start
```
