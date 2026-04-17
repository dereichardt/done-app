# Done - Open Questions and Decisions Log (Consultant Workflow)

## Purpose
Track unresolved decisions for the single-user Workday integration consultant planning model.

## Usage Rules
- Keep questions scoped and decision-ready.
- Assign one owner for each item.
- Link outcomes back to the requirements docs.

---

## Open Questions

| ID | Area | Question | Impact | Owner | Priority | Target Date | Status |
|---|---|---|---|---|---|---|---|
| OQ-001 | Domain | What are the minimum required fields for `Project` in MVP? | Blocks schema and UI forms | Product | High | TBD | Open |
| OQ-002 | Domain | What are the minimum required fields for `Integration` in MVP? | Blocks integration structure and views | Product | High | TBD | Open |
| OQ-003 | Domain | What are the minimum required fields for `Task` in MVP? | Blocks task capture and workflow | Product | High | TBD | Open |
| OQ-004 | Domain | Should all tasks require a project link with no exceptions? | Core rule enforcement and UX design | Product | High | TBD | Open |
| OQ-005 | Domain | Should integration linkage be optional for tasks in MVP? | Task UX complexity and filtering logic | Product | High | TBD | Open |
| OQ-006 | Workflow | What are the allowed status values and transitions for projects, integrations, and tasks? | Domain consistency and reporting | Product | High | TBD | Open |
| OQ-007 | AI | Which planning actions should AI assist first (breakdown, prioritization, next steps, summaries)? | MVP scope focus | Product | Medium | TBD | Open |
| OQ-008 | AI | What exact approval checkpoints are mandatory before AI-suggested changes are saved? | Safety and trust model | Product | Medium | TBD | Open |
| OQ-009 | UI | Which screenshot references should define the first design system direction? | Visual consistency and implementation alignment | Product | Medium | TBD | Open |
| OQ-010 | UI | What are the top three UX priorities: speed, density, or visual polish? | Layout and interaction design tradeoffs | Product | Medium | TBD | Open |

---

## Decision Log

| Decision ID | Date | Area | Decision | Rationale | Owner | Status |
|---|---|---|---|---|---|---|
| D-001 | 2026-03-27 | Product | `Done` is single-user only for MVP | Aligns with personal consultant workflow and reduces complexity | Product | Accepted |
| D-002 | 2026-03-27 | Domain | `Project` is the core model anchor | Matches real-world assignment-first workflow | Product | Accepted |
| D-003 | 2026-03-27 | Domain | One primary role per project assignment | Keeps role model simple and aligned with stated requirement | Product | Accepted |
| D-004 | 2026-03-27 | Architecture | Baseline stack remains Next.js + Supabase | Preserves speed and manageable operational overhead | Engineering | Accepted |

---

## Decision Criteria
- Impact on personal project delivery outcomes.
- Simplicity and maintainability of domain model.
- Buildability for MVP without overengineering.
- Reversibility of the decision in later iterations.

## Review Cadence
- Resolve all `High` priority domain questions before schema planning.
- Review open questions weekly and convert resolved items into requirement specs.
