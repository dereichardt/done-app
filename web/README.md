# Done web app

Next.js (App Router) + Supabase Auth and Postgres for the Done single-user product.

UI uses **Workday Canvas tokens** (`@workday/canvas-tokens-web`) and the same semantic variables as [`done-ui-prototype-canvas`](../done-ui-prototype-canvas). Primary actions use a **neutral** filled style (`.btn-cta`), not solid blue; blue is reserved for `.link-canvas` text links.

## Prerequisites

- Node 20+
- A [Supabase](https://supabase.com) project

## Setup

1. Copy environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

   Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project settings (API).

2. Apply the database migration (SQL editor or Supabase CLI):

   Run SQL migrations in [`supabase/migrations/`](./supabase/migrations/) in order against your database:

   1. [`20260227120000_initial_domain.sql`](./supabase/migrations/20260227120000_initial_domain.sql) — `project_types`, `project_roles`, `projects`, `project_phases`, base `integrations` / `project_integrations`, RLS, signup trigger for types and roles.
   2. [`20260328120000_integrations_extended.sql`](./supabase/migrations/20260328120000_integrations_extended.sql) — `integration_types`, `functional_areas`, `integration_domains`, extended catalog and project-link columns; updated signup seed.
   3. [`20260328120001_integration_tasks_and_templates.sql`](./supabase/migrations/20260328120001_integration_tasks_and_templates.sql) — `integration_tasks`, `integration_type_task_templates`.
   4. [`20260328140000_integrations_multiple_per_owner.sql`](./supabase/migrations/20260328140000_integrations_multiple_per_owner.sql) — optional integration codes; duplicate names per owner allowed; empty codes normalized.

3. Configure Auth redirect URL in Supabase:

   Add your site URL and redirect URL for magic links, e.g. `http://localhost:3000/auth/callback` for local development.

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign in with email (magic link), then use **Projects** to create and manage data.

### Local testing without magic link (optional)

Supabase’s built-in email has a low rate limit. For local development you can use **email + password**:

1. In `.env.local`, set `AUTH_PASSWORD_LOGIN=true` and restart `npm run dev`.
2. In Supabase: **Authentication → Users → Add user** — enter email and password, enable **Auto Confirm User** (or confirm the user).
3. On [http://localhost:3000/login](http://localhost:3000/login) use the **Test sign-in** section.

Do not set `AUTH_PASSWORD_LOGIN=true` in production unless you intentionally want password login.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint

## Notes

- If your account existed before the migration ran, open **Projects** once; `ensureDefaultLookups` backfills missing type/role rows.
- If your account existed before the integration migrations, open **Projects** once so `ensureDefaultLookups` can backfill `integration_types` / `functional_areas` / `integration_domains`.
