# Done - Tech Stack Decision Record (Single User)

## Purpose
Define the planning baseline stack for a single-user Workday integration consultant application, optimized for speed, clarity, and modern UI quality.

## Decision
Continue with a TypeScript-first stack using Next.js and Supabase as the MVP baseline.

## Frontend Stack
- `Framework`: Next.js (App Router).
- `Language`: TypeScript.
- `UI Architecture`: component-driven React UI with a design-system-first approach.
- `Styling Direction`: modern, clean visual system using reusable tokens/components.
- `State Strategy`: server-first state with minimal client state.

### Why This Fits
- Enables rapid iteration while maintaining UI quality.
- Keeps frontend and backend logic in one TypeScript ecosystem.
- Supports polished UX development with consistent components.

## Backend/Application Layer
- `Execution Model`: Next.js route handlers/server actions for app APIs.
- `Domain Layer`: explicit services for project, integration, task, and AI planning workflows.
- `Async Work`: defer or keep lightweight until clear need emerges.

### Why This Fits
- Appropriate complexity for a single-user product.
- Fast feedback cycle while requirements are still evolving.
- Domain logic remains centralized and easy to reason about.

## Data and Platform
- `Primary Database`: Supabase Postgres.
- `Authentication`: Supabase Auth (single user account context).
- `Storage`: Supabase Storage for optional supporting artifacts.
- `Realtime`: optional, only if it improves personal UX.

### Why This Fits
- Managed services reduce setup overhead during planning-to-build transition.
- Keeps operational focus on product behavior and design quality.

## AI Stack Direction
- `AI Orchestration`: dedicated module in application layer.
- `Provider Strategy`: primary provider with optional fallback.
- `Control Model`: AI suggestions are never auto-applied; user confirms changes.
- `Logging`: capture operational metadata with privacy-conscious practices.

## Deployment Baseline
- `Default`: Vercel-compatible frontend/backend deployment + Supabase services.
- `Portability`: architecture should remain portable if hosting changes later.

## Tradeoffs

### Benefits
- Strong delivery speed for MVP.
- Unified developer workflow and typing.
- Good foundation for modern and consistent UI implementation.

### Risks
- Vendor coupling to Supabase patterns.
- AI provider variability in quality and cost.
- Need discipline to avoid stack overengineering for a single-user product.

## Alternatives Considered
- `Next.js + custom backend services`: more control, more operations.
- `React + FastAPI`: backend flexibility, split-language overhead.
- `Desktop-first stack`: potentially better offline UX, slower web delivery.

## Open Decisions
- Final UI component strategy and design token conventions.
- Whether realtime features are useful enough for MVP.
- Exact testing setup for rapid but safe iteration.
