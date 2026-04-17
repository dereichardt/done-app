# Done - Requirements Template (Consultant Workflow)

Use this template to define each feature before implementation. Keep data modeling explicit and avoid assumptions.

---

## 1) Feature Metadata
- Feature name:
- Feature ID:
- Owner:
- Status: draft | review | approved
- Priority: MVP | post-MVP | long-term
- Related roadmap item:

## 2) Problem and Outcome
- Problem statement:
- Intended user outcome:
- Why this matters for project delivery:
- Success metric(s):

## 3) Persona and Context
- Persona: Workday integration consultant (single user).
- Current project context:
- Primary role context (`Lead` | `Architect` | `Advisor` | `Builder`):
- Integration context (if applicable):

## 4) Scope
### In Scope
- 

### Out of Scope
- 

## 5) Functional Requirements
- FR-1:
- FR-2:
- FR-3:

## 6) Workflow Mapping
- Entry point:
- Main user flow:
- Alternate flow(s):
- Failure and recovery flow:

## 7) Domain and Data Definition
- Domain entities touched (Project, ProjectAssignment, Integration, Task, etc.):
- New fields requested (if any):
- Which fields are confirmed vs proposed:
- Relationship impact:
- State transition impact:
- Questions that must be resolved before build:

## 8) Task Linkage Rules (If Applicable)
- Must task link to project? (expected yes unless exception):
- Can task link to integration? (optional/required/not allowed):
- View requirements:
  - global task view behavior:
  - integration task view behavior:

## 9) AI Behavior (If Applicable)
- AI use case:
- Context inputs:
- Required output structure:
- User confirmation requirement before persistence:
- Guardrails:
- Fallback behavior:

## 10) UX and UI Expectations
- Desired user experience:
- Visual style requirements:
- Information hierarchy requirements:
- Screenshot/design references available:

## 11) Non-Functional Requirements
- Performance targets:
- Reliability expectations:
- Security/privacy constraints:
- Accessibility expectations:
- Observability requirements:

## 12) Dependencies and Risks
- Dependencies:
- Risks:
- Mitigations:

## 13) Acceptance Criteria
- [ ] AC-1
- [ ] AC-2
- [ ] AC-3

## 14) Validation Plan
- Unit-level validation considerations:
- Integration-level validation considerations:
- End-to-end scenario checks:
- Manual workflow checks:

## 15) Open Questions
- 

## 16) Decision Log
- Date:
- Decision:
- Rationale:
- Owner:

---

## Quality Gate Checklist
- [ ] Scope is clear and specific.
- [ ] Domain relationships are explicitly documented.
- [ ] Confirmed data fields are separated from assumptions.
- [ ] Acceptance criteria are testable.
- [ ] AI behavior includes explicit human approval when applicable.
