# PR: Align MCP Hackathon Server to Neon + Expected Tool Contract

## Summary
This PR aligns the repository with the intended build plan for `workato-hackathon-mcp`:
- Neon-backed TypeScript MCP server
- SSE transport
- Expected core MCP tool contract
- Shared webhook helper structure
- Schema consistency with runtime queries

It also removes structural drift found during the repo audit (missing folders/files, tool-name mismatches, and missing schema objects referenced by code).

## What Was Done

### 1) Neon DB wiring centralized
- Added [`src/db/neon.ts`](./src/db/neon.ts)
  - `getNeonClient()` creates/reuses a singleton Postgres client using `DATABASE_URL`.
  - `closeNeonClient()` handles graceful shutdown.
- Updated [`src/index.ts`](./src/index.ts)
  - Replaced inline DB initialization with shared `getNeonClient()`.
  - Replaced direct `db.end()` with `closeNeonClient()`.

### 2) Shared Workato webhook helper added
- Added [`src/webhooks/workato.ts`](./src/webhooks/workato.ts)
  - Generic `fireWorkatoWebhook(envVarName, payload, context)` utility.
- Refactored tool modules to use shared helper:
  - [`src/tools/participants.ts`](./src/tools/participants.ts)
  - [`src/tools/teams.ts`](./src/tools/teams.ts)

### 3) MCP tool contract alignment
Expected core tools:
- `register_participant`
- `match_teams_by_skills`
- `confirm_team_formation`
- `submit_project`
- `score_submission`
- `trigger_awards`
- `get_event_status`

Changes made:
- Added `submit_project` in [`src/tools/submissions.ts`](./src/tools/submissions.ts)
  - Inserts submission directly in `submitted` state and sets `submitted_at`.
- Moved/implemented `score_submission` in [`src/tools/awards.ts`](./src/tools/awards.ts)
  - Maintains upsert behavior by `(submission_id, judge_id)`.
- Added `trigger_awards` in [`src/tools/awards.ts`](./src/tools/awards.ts)
  - Computes top scored submissions and assigns top awards.
  - Updates existing awards by name/event when present; inserts otherwise.
  - Optionally fires `WORKATO_AWARDS_WEBHOOK`.
- Added `get_event_status` in [`src/tools/awards.ts`](./src/tools/awards.ts)
  - Returns aggregate event metrics (participants, teams, submissions by status, scores, awarded count).

Note: Existing utility tools (`list_submissions`, `get_submission`, `update_submission`, `get_submission_scores`, `list_awards`, `get_leaderboard`) were preserved for operational convenience.

### 4) Schema consistency fixed
- Reworked [`sql/schema.sql`](./sql/schema.sql) to include missing tables referenced by runtime:
  - `registrations`
  - `team_members`
- Ensured FK creation order is valid on a clean bootstrap:
  - `registrations` is created before tables that reference it (e.g., `scores`).
- Preserved existing tables and indexes (`teams`, `hackathon_events`, `submissions`, `scores`, `awards`) with idempotent statements.

### 5) Environment template updated
- Updated [`.env.example`](./.env.example) with:
  - `WORKATO_AWARDS_WEBHOOK`

### 6) Dependencies
- Added `@neondatabase/serverless` to dependencies in [`package.json`](./package.json).

## Challenges Faced

1. Sandbox restrictions
- Network-restricted environment initially blocked `npm install`.
- Writing outside the `scripts/` writable root required escalated execution.

2. Local runtime mismatch
- Local Node runtime is `12.15.0`, while project expects Node `>=20`.
- As a result, both `npm run typecheck` and `npm run build` fail before project-level TS validation due to unsupported syntax in modern TypeScript runtime.

3. Schema drift from code expectations
- Runtime code referenced `registrations` and `team_members`, but schema initially lacked those objects.
- Required careful schema reorder to avoid FK failures on fresh DB setup.

## Design/Implementation Ideas Captured

- Keep DB client creation centralized (`src/db/neon.ts`) to avoid duplicate connection logic and simplify lifecycle handling.
- Keep webhook behavior centralized (`src/webhooks/workato.ts`) to avoid per-tool drift in error handling and payload dispatch.
- Preserve additional operational tools while enforcing required core tool names to satisfy both plan compliance and practical admin workflows.
- Keep schema idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) to reduce deployment friction.

## Validation Status

### Completed checks
- File structure now includes:
  - `src/index.ts`
  - `src/db/neon.ts`
  - `src/tools/participants.ts`
  - `src/tools/teams.ts`
  - `src/tools/submissions.ts`
  - `src/tools/awards.ts`
  - `src/webhooks/workato.ts`
- Verified required tool names are now present in source.
- Verified no active Supabase client usage in source.

### Blocked checks
- `npm run typecheck` blocked by local Node runtime version.
- `npm run build` blocked by local Node runtime version.

## Risks / Follow-ups

- `@neondatabase/serverless` is installed but current runtime path still uses `postgres` client in `src/db/neon.ts`.
  - This is functionally valid for Neon via `DATABASE_URL`, but if strict library standardization is desired, follow-up can migrate adapter code to Neon serverless driver fully.
- Award assignment strategy in `trigger_awards` is simple top-N by average total.
  - If tie-break rules are needed, they should be defined and encoded explicitly.
- `get_event_status` counts all registrations globally (not event-scoped), because participant-to-event linkage is not explicit in current schema.
  - If event-level participant counts are required, add event linkage in registrations or a join table.

## Next Steps / TODO

1. Upgrade local/runtime environment to Node 20+.
2. Re-run and fix any issues from:
   - `npm run typecheck`
   - `npm run build`
3. Execute schema on a clean Neon DB and validate all FK/index behavior.
4. Perform end-to-end smoke tests for SSE transport and required MCP tools.
5. Validate Workato webhook payload contracts for register/team/awards flows.
6. Decide whether to standardize fully on `@neondatabase/serverless` at runtime or keep `postgres` for current driver path.

## Suggested QA Checklist
- [ ] `/health` returns 200.
- [ ] SSE connection established on `/sse` and messages accepted on `/messages?sessionId=...`.
- [ ] `register_participant` inserts and returns registration metadata.
- [ ] `match_teams_by_skills` returns expected candidates.
- [ ] `confirm_team_formation` creates team + team_members rows.
- [ ] `submit_project` creates `submitted` submission with timestamp.
- [ ] `score_submission` upserts judge score.
- [ ] `trigger_awards` assigns top-ranked awards.
- [ ] `get_event_status` returns expected aggregate metrics.
