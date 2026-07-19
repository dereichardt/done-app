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

2. Apply the database migrations:

   The ordered migration history lives in [`supabase/migrations/`](./supabase/migrations/). Use the Supabase CLI to replay it locally with `npx supabase db reset`, or apply pending migrations to a linked project with `npx supabase db push`. Do not run individual files out of order.

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
- `npm run typecheck` — strict TypeScript check without emitting files
- `npm test` — run the Vitest suite once
- `npm run test:watch` — run Vitest in watch mode

## Activity reports

**Summarize activity** on the project detail page builds a deterministic report from recorded
timeline, integration, work, and project-management data. It runs locally in the application and
does not require an external AI provider or API key.

## Notes

- Lookup defaults are provisioned transactionally by database migrations for existing accounts and signup triggers for new accounts; ordinary page navigation is read-only.
