# Done — Feature backlog

## Purpose

This document holds **implementation-ready backlog items**: concrete goals, acceptance criteria, and pointers into the current codebase and schema. It complements [02-feature-catalog.md](./02-feature-catalog.md), which stays roadmap-oriented (MVP / Post-MVP / Long-term groupings). Use this file when breaking work into tickets and migrations.

**Related:** [05-domain-model.md](./05-domain-model.md) for the persistence baseline.

---

## 1. Internal time code (catalog identity)

**Status:** Shipped — 2026-04-18.

---

## 2. Pre-defined tasks (two tracks)

Shared theme: **bootstrap tasks** when standing up or enriching a project integration.

### 2a. Catalog-bound pre-defined tasks

#### Goal

An integration **catalog** entry can carry **pre-defined tasks** bundled with that pattern (from prior experience). Initially these are **manually authored** on the catalog entry. Later, **AI suggestions** can propose tasks based on tasks the user has entered for a given integration instance or pattern.

#### Acceptance criteria

- [ ] Catalog entry UI (or structured editor) to add, reorder, remove pre-defined task titles (and minimal metadata as agreed: notes, default due offset, etc.).
- [ ] When creating a project integration **from** that catalog entry, user can opt in to copy those tasks into `integration_tasks` (or clear rules if copy is automatic).
- [ ] Future: AI-suggested rows merge with or replace manual templates per product rules (out of scope for first slice unless explicitly scheduled).

#### Current baseline

- `integration_type_task_templates` is keyed by `integration_type_id`, not by catalog integration id — see `web/supabase/migrations/20260328120001_integration_tasks_and_templates.sql`.
- Task CRUD for a linked integration: `web/lib/actions/integration-tasks.ts`, `web/app/projects/[id]/integrations/[projectIntegrationId]/integration-tasks-panel.tsx`.

#### Open questions

- **Model:** Per-catalog-integration template table vs JSON column vs extend type-level templates with optional `integration_id` FK.
- **AI scope:** Which source rows feed suggestions (single project instance vs all usages linked via `prefilled_from_integration_id`).

### 2b. Categorized task catalog (library import)

#### Goal

A separate **task catalog** holds reusable tasks grouped by **category**. The user **multi-selects** tasks to import into a project track; **the order of selection determines the order** in which tasks are created (or explicit ordering controls after selection).

#### Acceptance criteria

- [ ] Task catalog data model: tasks, categories, owner scoping, optional activation/sort.
- [ ] Browse/filter UI by category; multi-select with visible ordering (or drag-to-order after select).
- [ ] Import action creates `integration_tasks` on the target `project_track_id` in the chosen order.
- [ ] Idempotent or duplicate-handling policy documented (e.g. allow duplicate titles vs dedupe by title).

#### Current baseline

- Tasks belong to `project_tracks`: [05-domain-model.md](./05-domain-model.md) (`integration_tasks`).
- Natural UI anchors: `web/app/projects/[id]/integrations/new/add-integration-client.tsx`, integration tasks panel above.

#### Open questions

- Whether the task catalog is shared with 2a or strictly separate product surfaces.
- Category taxonomy: flat vs nested; whether tasks can appear in multiple categories.

---

## 3. Catalog usage tracking

**Status:** Shipped — 2026-04-18.

---

## 4. Auto-generated integration updates

**Status:** Cancelled — 2026-04-18. Superseded by the project activity feed (`web/lib/project-activity.ts`, `web/app/projects/[id]/project-activity-feed.tsx`), which derives an event timeline directly from session/task/state changes without writing synthetic rows into `integration_updates`.

---

## 5. User settings page — timezone

### Goal

Introduce a **user settings page** (does not exist yet) where a user can set their **preferred timezone**. The stored timezone is used app-wide wherever dates and times are displayed or compared against "today" (e.g. past-due task grouping, due-date defaults, phase status, effort session timestamps).

### Context

Currently, `todayISO()` in `web/lib/project-phase-status.ts` returns the UTC calendar date, which causes off-by-one date comparisons for users west of UTC late in the day. The past-due grouping in `IntegrationTasksPanel` works around this with a client-side `localTodayIso()` helper, but a proper fix is a persisted user timezone that all date-sensitive surfaces can rely on consistently.

### Acceptance criteria

- [ ] User settings page exists (route TBD, e.g. `/settings` or `/account`); accessible from the main navigation.
- [ ] Timezone picker on the settings page — searchable list of IANA timezone identifiers (e.g. `America/New_York`); defaults to browser-detected timezone on first save.
- [ ] Preferred timezone persisted per user (new column on the `profiles` / `users` table or equivalent).
- [ ] Server-side date helpers (`todayISO()`, phase status calculations, effort session grouping) accept or derive the user's timezone when one is available.
- [ ] Client surfaces that currently use `localTodayIso()` or `todayISO()` are updated to use the stored preference once it is available.
- [ ] Changing timezone takes effect immediately without requiring re-login.

### Current baseline

- `todayISO()`: `web/lib/project-phase-status.ts` — UTC-only, no timezone awareness.
- Client workaround: `localTodayIso()` helper in `web/app/projects/[id]/integrations/[projectIntegrationId]/integration-tasks-panel.tsx` (past-due grouping only).
- No user settings page or user preferences table exists today.

### Open questions

- **Route and nav placement:** `/settings`, `/account`, or user-profile dropdown? Whether settings eventually expand to other preferences (notifications, display density) or stay minimal.
- **Schema:** New column on existing auth/profile table vs a dedicated `user_preferences` table for extensibility.
- **Server vs client:** Whether timezone is passed to every RSC as a cookie/header or fetched once and stored in a client context.
- **First-load default:** Auto-detect from browser `Intl.DateTimeFormat().resolvedOptions().timeZone` and pre-fill — or leave blank until explicitly set.

---

## 6. Project integrations quick actions — Provide Update wizard + Add Integration shortcut

**Status:** Shipped — 2026-04-18.

---

## 7. Tasks page calendar view — v2 enhancements

### Goal

Extend the cross-integration calendar view on `/tasks` (shipped as v1: read-only day/week/month grid with by-integration summary tiles and project-tinted blocks) so users can manage time directly from the Tasks page instead of jumping back to each project integration's Effort view.

### Context

V1 intentionally stayed read-only to ship quickly and keep create/edit flows centralized on the per-integration Effort view (`web/components/integration-effort-section.tsx`). Clicking a block on `/tasks` opens a detail popover with an "Open on integration" link; any mutation still happens on the integration page. The items below are the deferred capabilities v1 explicitly did not include.

### Acceptance criteria

- [ ] **In-calendar create / edit of manual effort entries.** Clicking an empty slot on the Tasks calendar opens the existing "Add Task or Meeting" dialog (see `IntegrationEffortSection`), with a required target-integration picker when the Tasks filters don't narrow to exactly one `project_integration_id`. Clicking a manual block opens the edit dialog inline (no round-trip through the integration page).
- [ ] **Drag-to-reschedule sessions in the calendar.** User can drag a task work session or manual entry block to a new time slot (and across days in the week grid); server actions update `started_at` / `finished_at` preserving duration. Matches the 15-minute snap used by the day/week grid. Permissions mirror the per-integration view.
- [ ] **Per-day drill-down from month view.** Clicking a day cell in the month grid switches scope to `day` anchored on that date (mirroring behavior that should also land on the existing integration Effort month view for parity).
- [ ] **Export.** Export the currently visible, filtered sessions as CSV (and optionally ICS) from both `/tasks` calendar and the per-integration Effort view. Columns at minimum: date, start, end, duration_hours, project, integration, task title / meeting title, source (`task_work_session` | `manual`), work_accomplished.

### Current baseline

- Cross-integration calendar: `web/app/tasks/tasks-effort-calendar.tsx` (v1), loader `web/lib/actions/tasks-calendar.ts`, shared grids `web/components/effort-calendar-grids.tsx`.
- Per-integration Effort view (source of create/edit UI to reuse): `web/components/integration-effort-section.tsx`, server actions `web/lib/actions/integration-manual-effort.ts`.
- Session schema: `integration_task_work_sessions` (`web/supabase/migrations/20260329180000_integration_task_work_sessions.sql`), `integration_manual_effort_entries` (`web/supabase/migrations/20260401123000_integration_manual_effort_entries.sql`).

### Open questions

- **Target integration for a new manual entry from `/tasks`:** require the user to pick when filters are ambiguous, or auto-pick the most-recently-used integration for that project?
- **Drag across integrations:** should a user be allowed to drag a session from one integration's block to another (which would rewrite `project_integration_id`), or is drag strictly a time move? Proposed: time-only in v2, cross-integration reassignment in a separate follow-up.
- **Export scope:** does "currently visible" respect only the period bounds, or also the Tasks filters (project / integration / priority / search)? Proposed: filters apply, with a small "X sessions will be exported" preview.
- **ICS viability:** whether to ship ICS in the same pass as CSV or split; ICS implies producing stable UIDs per session.

---

## 8. Effort forecasting with load-shaping dial

### Goal

Add an effort **forecasting view** that projects upcoming workload using actual historical effort data, and provides an interactive **load-shaping dial** so users can smooth peaks/valleys and spread work across days/weeks without losing visibility into deadlines.

### Context

Today the app records rich effort signals (task work sessions + manual effort entries) and renders them in calendars, but planning still relies on manual interpretation. Users need a visually clear forecast that translates remaining work into future capacity usage and lets them tune scheduling behavior (front-loaded vs balanced vs deadline-weighted) with immediate visual feedback.

### Acceptance criteria

- [ ] New forecasting surface (route TBD, likely under `/tasks` and/or per integration) that visualizes projected workload by day/week with clear capacity bands and over-capacity highlighting.
- [ ] Forecast model uses **actual effort history** (recent velocity/session duration patterns) plus remaining task effort where available; assumptions are shown in the UI (e.g. "based on last 4 weeks").
- [ ] Interactive **load-shaping dial** control that adjusts distribution behavior across a spectrum (e.g. preserve peaks -> smooth -> aggressively flatten), updating projections live.
- [ ] Forecast timeline includes a **graphic-EQ style weekly control** where each forecasted week is a draggable/step-adjustable node ("slider bar") that can be raised or lowered to shift planned effort volume for that week.
- [ ] Dial behavior explicitly redistributes forecasted effort from peak days into nearby valleys while respecting hard constraints (due dates, non-working days, minimum session granularity).
- [ ] Weekly node adjustments rebalance adjacent weeks automatically (within defined bounds) so increasing one week reduces available effort elsewhere and total remaining effort stays consistent.
- [ ] User can preview before/after impact (delta view) and apply the plan to create/update scheduled sessions only after confirmation.
- [ ] Forecast visuals meet current UI standards for readability (color contrast, labels, responsive layout, hover/detail affordances) so the feature is visually trustworthy and actionable.

### Current baseline

- Recorded effort data lives in `integration_task_work_sessions` and `integration_manual_effort_entries` (see migrations already referenced in item 7).
- Primary planning UIs today: cross-integration calendar on `/tasks` (`web/app/tasks/tasks-effort-calendar.tsx`) and per-integration effort planner (`web/components/integration-effort-section.tsx`).
- No current forecasting engine or capacity model is implemented.

### Open questions

- **Forecast scope:** global forecast across all active integrations vs project-level vs integration-level first slice.
- **Capacity source:** fixed daily hours setting, inferred from history, or hybrid with user override.
- **Control model:** how the global dial and per-week graphic-EQ nodes interact (e.g. dial sets baseline curve, node edits become local overrides with reset affordance).
- **Node constraints:** min/max weekly limits, snap increments, and whether locked weeks (vacation, hard commitments) can be excluded from auto-rebalancing.
- **Write-back strategy:** create explicit "planned sessions" records vs annotate existing tasks with recommended effort windows until user accepts.

---

## 9. Home page engagement layer

### Goal

Deliver a feature-rich Home page that acts as the first-stop engagement layer: users can ask AI for cross-project insights, quickly launch common cross-project actions, and triage auto-generated inbox items that surface what needs attention now before moving into day-to-day execution on Work.

### Context

The current Home route is a placeholder (`web/app/home/page.tsx`), while the app's strongest AI pattern today is project-level activity summarization. We need a concrete backlog definition that reuses those proven AI implementation patterns for Home, adds fixed quick actions, and introduces deterministic recurring automation rules that feed a single Home inbox in v1.

### Acceptance criteria

- [ ] Home includes an AI chat bar that accepts natural-language prompts and returns cross-project insights/answers scoped to user-authorized data.
- [ ] Home AI follows an **insights-only** v1 policy: responses do not directly execute mutating actions (no write operations from chat).
- [ ] Home AI supports streamed responses and explicit fallback states for: AI not configured, transient generation failure, and no-signal/empty-result responses.
- [ ] Home shows fixed cross-project quick actions: `Share Update`, `Summarize Activity`, `Add Project`, `Add Integration`.
- [ ] Quick actions are available without project-detail navigation and each action has a defined destination flow (modal or route) with ownership/authorization checks.
- [ ] Home inbox is the single v1 delivery surface for recurring automation tasks (no separate notification center or calendar dependency).
- [ ] Integration maintenance rule: when an integration has not received an update event for 7+ days, create an inbox task in the form `Integration <X> requires an update`.
- [ ] Friday summary rule: create a Friday summary inbox task unless a manual summary occurred in the effective weekly period.
- [ ] Monday review rule: create a Monday inbox task to review actuals and apply forecasting updates/recommendations.
- [ ] Recurring task generation is deterministic and idempotent (no duplicate tasks for the same rule/time window/entity key).
- [ ] Manual completion or qualifying manual summary activity suppresses duplicate task creation according to the rule window.
- [ ] Home UX clearly frames prioritization and routing into Work: Home answers "what needs attention now", then sends users into Work for task/meeting execution.

### Current baseline

- Home route exists as placeholder only: `web/app/home/page.tsx`.
- Existing AI implementation seam and model configuration: `web/lib/ai/client.ts`.
- Existing streamed AI route and authorization/persistence pattern: `web/app/api/projects/[id]/summaries/route.ts`.
- Existing prompt/context builders and range logic for summaries: `web/lib/project-summaries.ts`.
- Existing summary launch UX pattern: `web/app/projects/[id]/summarize-activity-dialog.tsx` and `web/app/projects/[id]/project-quick-actions-bar.tsx`.
- Existing normalized project activity feed (candidate source for Home insight context): `web/lib/project-activity.ts`.

### Open questions

- **Home AI retrieval scope:** Which entities participate in cross-project context for v1 (all active projects vs filtered set, and how "active" is defined)?
- **Quick action routing:** Should `Summarize Activity` from Home require an explicit project selector first or support a cross-project synthesis mode immediately?
- **Rule windows and timestamps:** What exact timestamp/event qualifies as an "integration update" and a "manual summary" for suppression logic?
- **Inbox ranking:** How should recurring tasks be ordered relative to user-created inbox items (due-date first, severity first, or hybrid)?

---

## 10. Profile page + Setup preferences hub

### Goal

Define and ship a user-facing **Profile entry point** (from the user profile click target) with a dedicated **Setup** page where users manage personal defaults that affect behavior across the app: configurable dropdown options, timezone, and recurring review cadence (activity summaries and forecast reviews).

### Context

The backlog currently includes a timezone-only settings item (`## 5. User settings page — timezone`), but user preferences are broader than timezone and need one coherent surface. A Profile -> Setup pattern also creates a stable home for future per-user controls (notifications, display defaults, workflow preferences) without scattering settings across pages.

### Acceptance criteria

- [ ] Clicking the user profile avatar/name in the primary app shell exposes a profile menu/surface with a clear entry to `Setup`.
- [ ] A Setup route exists (route TBD, e.g. `/settings` or `/profile/setup`) and is reachable from profile click flow without deep linking.
- [ ] Setup contains a **Preferences** section for user-managed dropdown controls used across the application, with explicit save/update affordances and clear scope labels (user-specific vs shared list).
- [ ] Setup contains a timezone picker (IANA timezone identifiers) with browser-detected default on first save when no preference exists.
- [ ] Setup contains `Activity summary day` and `Forecast review day` preferences (v1: single-select day-of-week each).
- [ ] Default values are defined for new users when cadence values are unset (proposed: Friday summary, Monday forecast review) and are visible/editable in Setup.
- [ ] Persisted preferences are applied to downstream UI/logic without requiring re-login.
- [ ] Validation and fallback states are defined (invalid timezone, missing day selection, save failure, and no-permission scenarios).

### Current baseline

- Existing timezone backlog definition: `## 5. User settings page — timezone` in this file.
- No current profile/settings route or profile-click settings destination is documented as implemented.
- Existing date-sensitive behavior currently spans:
  - `web/lib/project-phase-status.ts` (`todayISO()` UTC behavior)
  - `web/app/projects/[id]/integrations/[projectIntegrationId]/integration-tasks-panel.tsx` (`localTodayIso()` client workaround)
- Home recurring workflow context exists and can consume future cadence settings:
  - `web/app/home/page.tsx`
  - `web/lib/project-activity.ts`
  - `web/app/api/projects/[id]/summaries/route.ts`

### Open questions

- **Information architecture:** one Setup page with sections vs multi-tab profile/settings structure.
- **Persistence model:** extend `profiles` vs introduce dedicated `user_preferences` for long-term extensibility.
- **Dropdown ownership:** which dropdowns are user-editable in v1 vs admin/system-managed only.
- **Cadence model:** keep v1 single-day selections or support multi-day recurrence immediately.
- **Application strategy:** server-fetched preferences per request vs client context bootstrap with cache invalidation rules.

### Optional implementation split (ticketing guidance)

- **Ticket A — Profile navigation surface:** add profile-click entry, route plumbing, and auth guardrails.
- **Ticket B — Preferences schema + persistence:** add DB fields/table, read/write actions, validation, and defaults.
- **Ticket C — Setup UI:** build timezone + cadence + dropdown preference controls with optimistic/error states.
- **Ticket D — Preference consumers:** wire timezone/cadence/dropdown usage into affected date/grouping/review flows.

---

## 11. Career — quarterly check-in prep

### Goal

Add a **Career** destination in the primary side navigation with a dedicated surface that helps users **prepare for quarterly check-ins** (for example manager or HR conversations) by generating a **contribution summary** for a chosen **time period**, with **calendar quarter** as the default framing.

### Context

Done already captures execution signals across projects (tasks, effort, updates, and normalized activity). Career turns that into a time-bounded view users can refine before check-ins, instead of manually reconstructing the quarter from scattered project and integration screens.

### Acceptance criteria

- [ ] **Career** appears in the primary sidebar navigation (route TBD, e.g. `/career`) with active-state behavior consistent with other shell items.
- [ ] Period selection defaults to **calendar quarter** (Q1–Q4 + year); users can choose a **custom date range** for partial quarters or other windows.
- [ ] The summary aggregates **contributions** across projects and integrations the user is authorized to see for the selected period, including at minimum: notable task completions or progress, logged effort (task work sessions and manual effort entries where applicable), and integration updates / activity signals per agreed product rules (exact joins and weighting left to implementation tickets).
- [ ] Presentation is **readable and shareable**: clear on-screen sections or narrative, with copy and/or export affordances (format TBD — see open questions).
- [ ] **Empty**, **loading**, and **error** states are explicit when no data exists in the range, generation fails, or the requested scope is invalid.

### Current baseline

- Primary sidebar `navItems`: `web/components/projects-shell.tsx`.
- Patterns to reuse for cross-entity summaries and activity context (project-scoped today, not Career): `web/lib/project-activity.ts`, `web/lib/project-summaries.ts`, `web/app/api/projects/[id]/summaries/route.ts`.

### Open questions

- **Quarter model:** calendar quarters only in v1 vs optional **fiscal quarter** alignment (employer fiscal year).
- **Summary engine:** deterministic rollup from activity and effort data vs **AI-assisted** narrative (or hybrid); how much user editing is expected before paste into performance or HR tools.
- **Scope defaults:** all authorized active projects vs a user-filtered subset for v1.
- **Sensitivity:** default tone and field inclusion so excerpts are appropriate for external systems; optional redaction or separation of “internal notes” vs shareable bullets.
- **Persistence:** ephemeral generated summary only vs **saved drafts** per quarter with simple version history.

---

## Maintenance

When an item ships, either remove it from this backlog or mark it with a status line and date so history stays readable.
