# StudyMate

StudyMate creates and tracks personal study timetables using exam dates, subject topics, confidence, practice results, and weekly availability.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/studymate run dev` — run the StudyMate web app
- `pnpm --filter @workspace/studymate test` — run scheduling and local-storage tests
- `pnpm --filter @workspace/studymate run typecheck` — typecheck StudyMate
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- StudyMate has no runtime credentials or database requirement.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/studymate/src/` — React app and screens
- `artifacts/studymate/src/lib/planner.ts` — deterministic timetable generation
- `artifacts/studymate/src/lib/storage.ts` — browser persistence and JSON backup validation
- `artifacts/studymate/README.md` — scheduler rules and data-storage caveats

## Architecture decisions

- Personal planner data stays in versioned browser localStorage; no cloud account or backend is used.
- Scheduling is deterministic and makes no paid AI or external API calls.
- Completed sessions remain records when the remaining plan is regenerated.

## Product

Learners can manage subjects and topics, configure exam and study availability, generate daily and weekly plans, track sessions and practice results, review progress, and back up or restore data as JSON.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
