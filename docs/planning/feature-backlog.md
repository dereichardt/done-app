# Done — Feature backlog

## Purpose

This document holds **implementation-ready backlog items**: concrete goals, acceptance criteria, and pointers into the current codebase and schema. It complements [02-feature-catalog.md](./02-feature-catalog.md), which stays roadmap-oriented (MVP / Post-MVP / Long-term groupings). Use this file when breaking work into tickets and migrations.

**Related:** [05-domain-model.md](./05-domain-model.md) for the persistence baseline.

---

## 1. Internal time code (catalog identity)

### Goal

Give each **integration catalog** entry a stable **internal time code** (billing / time-tracking identifier) so catalog rows are uniquely identifiable by that code. The field remains **optional** on ordinary project-scoped integration definitions, but becomes **mandatory** when publishing or maintaining a row in the catalog (`catalog_visibility = 'catalog'`). **Two catalog entries cannot share the same internal time code** for the same owner.

### Acceptance criteria

- [ ] Optional internal time code on project-only integrations (or absent until explicitly set).
- [ ] Creating or editing a catalog-visible integration **requires** a non-empty internal time code; server and client validation agree.
- [ ] Database enforces uniqueness among catalog rows per owner (partial unique index or equivalent on non-null code where `catalog_visibility = 'catalog'`).
- [ ] Promote-to-catalog and direct catalog-create flows validate the requirement (see `promoteIntegrationToCatalog` and catalog insert paths in `web/lib/actions/projects.ts`).
- [ ] Catalog picker and catalog detail surfaces show the code where it helps disambiguation.

### Current baseline

- `integrations` includes `integration_code` (optional; duplicates allowed per owner after `20260328250000_integrations_integration_code_not_unique.sql`). Domain doc: [05-domain-model.md](./05-domain-model.md).
- Definition form and actions: `web/app/projects/[id]/integration-definition-fields.tsx`, `web/lib/actions/projects.ts` (`parseIntegrationDefinitionForm`, `createCatalogIntegration`, `promoteIntegrationToCatalog`, `updateIntegrationFromForm`).

### Open questions

- **New column vs reuse:** Introduce `internal_time_code` (recommended if `integration_code` stays a loose “business label”) vs tighten rules on `integration_code` for catalog rows only. If reusing `integration_code`, reconcile with historical “non-unique code” migration intent.
- **Display label:** Whether internal time code is shown alongside or instead of `integration_code` in lists.

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

A separate **task catalog** holds reusable tasks grouped by **category**. The user **multi-selects** tasks to import into a project integration; **the order of selection determines the order** in which tasks are created (or explicit ordering controls after selection).

#### Acceptance criteria

- [ ] Task catalog data model: tasks, categories, owner scoping, optional activation/sort.
- [ ] Browse/filter UI by category; multi-select with visible ordering (or drag-to-order after select).
- [ ] Import action creates `integration_tasks` on the target `project_integration_id` in the chosen order.
- [ ] Idempotent or duplicate-handling policy documented (e.g. allow duplicate titles vs dedupe by title).

#### Current baseline

- Tasks belong to `project_integrations`: [05-domain-model.md](./05-domain-model.md) (`integration_tasks`).
- Natural UI anchors: `web/app/projects/[id]/integrations/new/add-integration-client.tsx`, integration tasks panel above.

#### Open questions

- Whether the task catalog is shared with 2a or strictly separate product surfaces.
- Category taxonomy: flat vs nested; whether tasks can appear in multiple categories.

---

## 3. Catalog usage tracking

### Goal

When a catalog integration is **copied** into a project, the project row is a **separate instance**; still, **usage of the catalog pattern** must be observable from the catalog entry: which projects used it, effort, tasks executed or completed, and other agreed aggregates.

### Acceptance criteria

- [ ] From a catalog entry detail (or equivalent), user opens a **usage** view listing each project integration derived from that catalog pattern with links into the project/integration.
- [ ] Each row shows agreed metrics (minimum: project name, link; extend with `estimated_effort_hours`, task counts, done vs open, dates).
- [ ] Usage list stays correct when project integrations or tasks are deleted (cascade or null-safe queries).

### Current baseline

- `integrations.prefilled_from_integration_id` references the catalog template used when instantiating from the picker; see `web/supabase/migrations/20260328150000_integrations_prefilled_from.sql` and `createIntegrationAndLink` in `web/lib/actions/projects.ts` (template id validated, then stored on the new project-scoped `integrations` row).
- Query pattern: `integrations` where `prefilled_from_integration_id = <catalog_integration_id>`, join `project_integrations`, `projects`, aggregate `integration_tasks`.

### Open questions

- **`promoteIntegrationToCatalog`** creates a new catalog row without recording which project instance was the source; if “usage” must include **catalog provenance** (seeded from project X), add a field or join table.
- Retention: whether archived projects appear in usage history.

---

## 4. Auto-generated integration updates

### Goal

Certain events **automatically append** a row in `integration_updates` (same lifecycle as a manual update in the UI), clearly marked as **auto-generated**, while remaining **editable and deletable** like any other update.

### Trigger families

1. **User activity:** completing a work session; completing a task; adding a task or meeting **directly to the calendar** (exact entities depend on calendar feature scope in the app).
2. **Delivery / state:** changes to **delivery progress** and/or **integration state** on `project_integrations` (see `20260329120000_integration_status_and_updates.sql`).

### Acceptance criteria

- [ ] On each covered event, create an `integration_updates` row (or agreed equivalent) with human-readable default body text within length limits (`body` check constraint today: 300 characters — may need product decision to raise or truncate smartly).
- [ ] UI shows an **auto-generated** affordance (badge, icon, or sublabel) distinguishable from manual entries.
- [ ] User can **edit** body and **delete** auto-generated updates the same as manual ones.
- [ ] Reduced noise: define rules for deduplication or batching (e.g. multiple rapid field changes) so the log stays useful.

### Current baseline

- Table: `integration_updates` (`project_integration_id`, `body`, timestamps) — `web/supabase/migrations/20260329120000_integration_status_and_updates.sql`.
- UI: `web/app/projects/[id]/integrations/[projectIntegrationId]/integration-updates-panel.tsx`.

### Open questions

- Schema: `is_auto_generated boolean`, `source text` / enum (`session`, `task`, `calendar`, `delivery_progress`, `integration_state`), optional `source_ref_id` for deep links — balance privacy and debuggability.
- **Idempotency:** avoid duplicate auto rows on retry or double-save (e.g. stable event id or “last written hash” per dimension).
- **Calendar:** backlog assumes a calendar surface exists; until then, scope family (1) to session + task only or stub hooks.

---

## Maintenance

When an item ships, either remove it from this backlog or mark it with a status line and date so history stays readable.
