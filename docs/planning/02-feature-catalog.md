# Done - Feature Catalog and Roadmap (Single User)

## Purpose
Capture features for a personal Workday integration consulting workflow and prioritize by release stage.

## Prioritization Model
- `MVP`: core features required for daily use.
- `Post-MVP`: important improvements after MVP stabilizes.
- `Long-term`: advanced capabilities after workflow maturity.

## Product Context
- Single user only.
- Work begins with project assignment.
- One primary role per project assignment: `Lead`, `Architect`, `Advisor`, `Builder`.
- Integrations are tracked within projects.
- Tasks can be viewed globally or inside an integration context.

## Feature Groups

### 1) Project Assignment Management
- Create and maintain project assignments (`MVP`).
- Set one primary role per assignment (`MVP`).
- Track project status and key milestones (`MVP`).
- Project templates for recurring engagement patterns (`Post-MVP`).

### 2) Integration Ownership Management
- Register integrations under each project (`MVP`).
- Mark ownership/responsibility for each integration (`MVP`).
- Track integration-level status and delivery stage (`MVP`).
- Integration playbooks/checklists (`Post-MVP`).

### 3) Task Tracker
- Create tasks linked to a project (`MVP`).
- Optionally link tasks to a project integration (`MVP`).
- View tasks in:
  - global task list (`MVP`)
  - integration-focused view (`MVP`)
- Task states/priorities and due-date tracking (`MVP`).
- Recurring tasks and templates (`Post-MVP`).

### 4) Planning and Execution Support
- Daily planning view by project and urgency (`MVP`).
- Weekly workload review by project/integration (`MVP`).
- Focus mode (today's critical tasks only) (`Post-MVP`).

### 5) AI Assistance
- AI task breakdown from project or integration objectives (`MVP`).
- AI prioritization suggestions with reasoning (`MVP`).
- AI next-action recommendations for blocked work (`MVP`).
- AI project/integration status summaries (`Post-MVP`).

### 6) Insights and Quality of Delivery
- Personal delivery dashboard (planned vs completed) (`MVP`).
- Project-level completion trends (`Post-MVP`).
- Integration risk flagging based on open/blocked tasks (`Post-MVP`).

### 7) UI and Experience
- Sleek, clean, modern interface baseline (`MVP`).
- Consistent layout system and design tokens (`MVP` planning, build later).
- Screenshot-driven visual direction pack (`Post-MVP planning enhancement`).

## MVP Release Candidate Definition
MVP is ready when the user can:
- Create project assignments with one primary role.
- Create integrations under projects and track ownership.
- Manage tasks linked to project and optionally to integration.
- Switch between global task view and integration task view.
- Use AI for actionable planning support.

## Deferred Decisions
- Which project and integration fields are mandatory for v1.
- Exact task status taxonomy and transition rules.
- Level of AI autonomy allowed without explicit confirmation.

## Notes For Requirements Phase
- Every `MVP` feature needs a requirement spec using `06-requirements-template.md`.
- Data attributes remain intentionally minimal until explicitly agreed.

For detailed, ticket-ready backlog items (internal time code, pre-defined tasks, catalog usage, auto-generated updates), see [feature-backlog.md](./feature-backlog.md).
