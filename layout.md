# Google Tag Manager Automation Engine — System Layout

> Written screen by screen. Each screen covers one layer of the system.
> Last updated: 2026-03-31

---

# SCREEN 1 — The Big Picture

## What this app does

A user points it at their codebase (React, Next.js, Vue, etc.) and it:
1. Scans the code to find every button, link, form, and interactive element
2. Adds consistent IDs and CSS classes to those elements
3. Plans what Google Analytics events to track and how
4. Writes the actual tracking code into source files
5. Creates GTM tags, triggers, and variables in Google Tag Manager
6. Tests that the tracking fires correctly
7. Generates documentation for the whole thing

All of this is done by Claude (the AI) running inside a local server. The user interacts through a React web app.

---

## The three main pieces

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (React)                                   │
│  app/src/                                           │
│  Runs in the browser. Shows the pipeline UI.        │
│  Talks to the backend via REST + SSE.               │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼────────────────────────────────┐
│  BACKEND (Node.js + Express)                        │
│  server/src/                                        │
│  Manages state, runs Claude, calls GTM API.         │
│  Reads/writes project files on disk.                │
└────────────────────┬────────────────────────────────┘
                     │ SQL
┌────────────────────▼────────────────────────────────┐
│  DATABASE (SQLite)                                  │
│  data/gtm-engine.db                                 │
│  Stores sessions, skill outputs, run history,       │
│  costs, approvals, file snapshots.                  │
└─────────────────────────────────────────────────────┘
```

---

## The 6-step pipeline

Every project goes through the same 6 steps in order. Each step is called a "skill."

| # | Name (code) | Label (UI) | What Claude does | Modifies files? |
|---|-------------|------------|------------------|-----------------|
| 1 | gtm-analytics-audit | Audit | Scans codebase, finds trackable elements, measures coverage | No |
| 2 | gtm-dom-standardization | Prepare Elements | Adds id/class attributes to elements | Yes |
| 3 | gtm-strategy | Strategy | Plans GA4 events, priorities, implementation methods | No |
| 4 | gtm-implementation | Implementation | Writes dataLayer code + creates GTM tags/triggers/variables | Yes |
| 5 | gtm-testing | Testing | Validates tracking fires correctly (static + GTM config) | No |
| 6 | gtm-reporting | Reporting | Generates markdown docs and data dictionary | No |

Steps unlock in order. You cannot run step 4 until steps 1, 2, 3 are done AND the strategy is approved by the user.

---

## What "running a skill" means

When the user clicks "Run Audit" (or any skill button):

1. Frontend sends `POST /api/skill/run` with the skill name and a prompt
2. Backend assembles the full prompt (SKILL.md instructions + project file list + context from prior steps)
3. Backend spawns Claude via CLI (`claude --print --output-format stream-json`)
4. Claude reads project files, makes edits, runs bash commands, calls GTM API
5. Claude's output streams back to the frontend in real time via SSE (Server-Sent Events)
6. When done, backend parses the output, stores results in DB, marks step complete

The frontend shows a live activity feed while this runs. Each tool use (file read, file edit, bash command) appears as a line item.

---

## What "session" means

A session = one project. Each project path gets its own session with its own:
- Run history
- Skill outputs
- GTM credentials
- Progress through the pipeline

The user can have multiple sessions (multiple projects) and switch between them.

---

## Key constraint: Windows vs Mac/Linux

GTM work (creating tags, triggers, variables) uses different tools depending on OS:

- **Mac/Linux**: `@owntag/gtm-cli` command-line tool
- **Windows**: googleapis REST API with OAuth2 tokens

This affects SKILL.md instructions, context builders, and the setup flow. Both paths lead to the same result — GTM objects created in the container.

---

*Next: SCREEN 2 — The Database (all tables, what each stores, how they connect)*

Type "next" to continue to Screen 2.

---

# SCREEN 2 — The Database

**File:** `data/gtm-engine.db` (SQLite, WAL mode)

There are 11 tables. Here is every one of them.

---

## Table map (what connects to what)

```
sessions (1)
  ├── session_outputs (many)      — full skill output JSON
  ├── skill_runs (many)           — every execution attempt
  ├── cost_events (many)          — token cost per run
  ├── approvals (many)            — strategy review gate
  ├── file_snapshots (many)       — pre-edit backups
  ├── element_resolutions (many)  — DOM fix queue
  ├── activity_log (many)         — audit trail
  └── oauth_tokens (1)            — Windows OAuth tokens

skill_config (standalone)         — per-skill customization
app_config (standalone)           — global settings (active session, adapter)
```

All child tables cascade-delete when the parent session is deleted.

---

## sessions

The core record. One row = one project.

| Column | What it stores |
|--------|----------------|
| id | UUID, primary key |
| name | User label (optional) |
| project_path | Path to the codebase on disk |
| gtm_account_id | GTM account ID — **encrypted** |
| gtm_container_id | GTM container ID — **encrypted** |
| google_client_id | OAuth client ID — **encrypted** |
| google_client_secret | OAuth client secret — **encrypted** |
| completed_skills | JSON array: `["gtm-analytics-audit", "gtm-strategy", ...]` |
| current_skill | Which skill is running right now (or null) |
| skill_sessions | JSON map: `{ "gtm-strategy": "<claude-session-id>" }` — for resuming Claude conversations |
| compact_outputs | JSON map: `{ "gtm-analytics-audit": { summary... }, ... }` — lean summaries used by context builders |
| file_tree_snapshot | JSON list of source files at time of audit — used to detect codebase drift |
| audit_coverage_pct | 0–100, extracted from audit output |
| resolution_queue | JSON array of elements needing manual resolution |
| drift_acknowledged | 0 or 1 — has the user reviewed the drift warning |

**Key point:** `compact_outputs` lives here as a JSON blob. It is a pre-computed cache used ONLY by the backend context builders. The frontend reads it too but should not rely on it for display — it uses the full outputs from `session_outputs` for that.

---

## session_outputs

**The single source of truth for skill results.**

| Column | What it stores |
|--------|----------------|
| session_id | FK to sessions |
| skill_name | e.g. `gtm-analytics-audit` |
| output_json | The complete JSON (or markdown) Claude produced |
| UNIQUE(session_id, skill_name) | One output per skill per session |

When a skill completes, its full output is written here via `upsertSessionOutput()`. This is the only place the full output lives. The `compact_outputs` blob in `sessions` is derived from this.

**What to keep:** Everything. This is the right design.

---

## skill_runs

Every execution attempt — whether it succeeded, failed, or was retried.

| Column | What it stores |
|--------|----------------|
| id | UUID |
| session_id | FK to sessions |
| skill_name | Which skill |
| status | `running` / `complete` / `error` |
| claude_session_id | Claude's session ID (for conversation resume) |
| prompt_sent | The full assembled prompt text |
| output_log | Everything Claude said (streamed) |
| result_json | Parsed edits/GTM resource counts |
| adapter_type | `claude_code` / `gemini` / `opencode` |
| page_context | For per-page DOM runs — which page this run was for |
| input_tokens / output_tokens | Token usage |
| cost_usd | Computed cost |
| duration_ms | Wall-clock time |
| score | Quality score 0.0–1.0 |
| retry_count | How many retries happened |

This table is used for the run history panel in the UI and the `/runs/:id` detail page.

---

## cost_events

Tracks costs independently of skill_runs for analytics purposes.

| Column | What it stores |
|--------|----------------|
| session_id | FK to sessions |
| skill_run_id | FK to skill_runs (nullable) |
| skill_name | Which skill |
| model | Model name (e.g. `claude-opus-4-6`) |
| input_tokens / output_tokens | Token usage |
| cost_usd | Total cost for this run |

Used by the cost summary panel on the dashboard and the history page.

---

## approvals

The review gate between Strategy and Implementation.

| Column | What it stores |
|--------|----------------|
| session_id | FK to sessions |
| skill_name | Always `gtm-strategy` right now |
| status | `pending` / `approved` / `rejected` / `revision_requested` |
| review_note | User's comment |
| payload | JSON snapshot of the tracking plan being reviewed |

Created automatically when `gtm-strategy` completes. Implementation is locked until this is approved.

**Key point:** Implementation checks for an approved approval before it will run. This is enforced in `isSkillUnlocked()` on the frontend and in the backend context builder.

---

## file_snapshots

Pre-edit backups so changes can be undone.

| Column | What it stores |
|--------|----------------|
| session_id | FK to sessions |
| skill_name | Which skill took the snapshot |
| file_path | Full path to the file |
| original_content | File content before Claude touched it |

Taken before DOM standardization and implementation runs. The "Restore" button on those pages uses this data.

---

## element_resolutions

Tracks elements from the audit that need manual attention.

| Column | What it stores |
|--------|----------------|
| session_id | FK to sessions |
| element_id | Element identifier from audit |
| element_type | Category: cta / nav / form / media / outbound |
| element_context | Description of the element |
| status | `pending` / `resolved` |
| resolution_output | Notes/result from resolution |

Used by the "Resolution Queue" panel on the Audit page. Users can resolve or skip individual elements.

---

## activity_log

An append-only audit trail of every significant action.

| Column | What it stores |
|--------|----------------|
| session_id | Which session |
| event_type | e.g. `skill.started`, `skill.completed`, `approval.created`, `file.applied` |
| entity_type | What was acted on: `skill_run`, `approval`, `session` |
| entity_id | ID of that entity |
| detail | JSON details |

Shown on the Activity page. Never deleted, never updated — only appended to.

---

## oauth_tokens

Windows-only. Stores Google OAuth2 tokens for GTM API calls.

| Column | What it stores |
|--------|----------------|
| session_id | PK + FK (one row per session) |
| access_token | Short-lived access token |
| refresh_token | Long-lived token — auto-renews access token |
| expiry_date | Unix timestamp when access token expires |
| email | Google account email |

On Windows, Claude uses these tokens to call the GTM REST API directly via `googleapis`. The `refresh_token` is the important one — googleapis auto-renews the access token when it expires, so re-authentication is not needed unless the refresh token is revoked.

**NOT encrypted** (unlike gtmConfig credentials in `sessions`). Worth noting as a future improvement.

---

## skill_config

Per-skill customization. Allows users to override parts of the SKILL.md prompt.

| Column | What it stores |
|--------|----------------|
| skill_name | PK |
| section_overrides | JSON: which sections of SKILL.md to replace |
| additional_instructions | Text appended to the prompt |

Shown as the "Additional Instructions" expander on each skill page.

---

## app_config

Global key-value settings.

| Key | What it stores |
|-----|----------------|
| `adapter_type` | Which AI adapter to use: `claude_code` / `gemini` / `opencode` |
| `active_session_id` | UUID of the currently active session |

---

## What can be removed

| Thing | Status | Why |
|-------|--------|-----|
| `step_instructions` table | **Keep** — actively used. `step_instructions` stores `additionalInstructions` (free text), `skill_config` stores `sectionOverrides` (JSON). They are used together via `GET/PUT /api/skill/config/:skillName`. Not a duplicate. |
| Legacy blob columns in `sessions` | **Already removed** — migration v8 dropped `audit_report`, `tracking_plan`, `dom_changes`, `setup_config`, `implementation_result`, `test_results`, `reporting_result`. `session_outputs` is now the source of truth. |

---

## Encryption

Sensitive fields in `sessions` are encrypted at rest using AES-256-GCM:
- `gtm_account_id`, `gtm_container_id`
- `google_client_id`, `google_client_secret`

Requires `GTM_MASTER_KEY` env var (64-char hex). If not set, values stored as plain text.

---

*Next: SCREEN 3 — The Backend (every route, every service, how a skill run flows end to end)*

Type "next" to continue to Screen 3.

---

# SCREEN 3 — The Backend

**Root:** `server/src/`

---

## File map

```
server/src/
├── index.ts              — starts Express, registers all routers
├── db.ts                 — SQLite init, migrations, output helpers
├── session.ts            — session CRUD, markSkillComplete, compact output logic
├── execute.ts            — runs skills, handles retries, parses output
├── crypto.ts             — AES-256-GCM encryption for credentials
├── schemas.ts            — Zod validation for all request bodies
│
├── routes/
│   ├── session.ts        — GET/POST/PATCH /api/session, skill-complete, dom-page-result
│   ├── skill.ts          — POST /api/skill/run, context builders, history
│   ├── files.ts          — diff, apply, snapshot, restore, changed
│   ├── gtm.ts            — GTM status, OAuth flow, container data, verify
│   ├── approvals.ts      — approve/reject/revision workflow
│   └── config.ts         — per-skill customization
│
├── adapters/
│   ├── types.ts          — Adapter interface
│   ├── registry.ts       — getAdapter(), ADAPTER_LIST
│   ├── claude-code.ts    — spawns `claude` CLI, parses stream-json
│   ├── gemini.ts         — spawns `gemini` CLI, same parsing
│   └── opencode.ts       — spawns `opencode` CLI
│
├── services/
│   ├── activity.ts       — logActivity() — writes to activity_log
│   ├── skill.ts          — scoring, getSkillHistory()
│   └── changeDetector.ts — snapshotFileTree(), detectChanges()
│
└── skills/               — SKILL.md files (Claude's instructions per skill)
    ├── gtm-analytics-audit/SKILL.md
    ├── gtm-dom-standardization/SKILL.md
    ├── gtm-strategy/SKILL.md
    ├── gtm-implementation/SKILL.md
    ├── gtm-testing/SKILL.md
    └── gtm-reporting/SKILL.md
```

---

## Every API route

### Session routes — `/api/session`

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/session` | Returns the active session (decrypted) |
| POST | `/api/session` | Create new session or update existing (validates project path) |
| PATCH | `/api/session` | Update name, GTM config, or OAuth credentials |
| DELETE | `/api/session/:id` | Delete a project and all its data |
| GET | `/api/session/output/:skillName` | Get full skill output from session_outputs |
| GET | `/api/session/browse` | List drives/folders for the path picker |
| POST | `/api/session/validate-path` | Check if a path exists and is a directory |
| POST | `/api/session/reset` | Clear the active session |
| PATCH | `/api/session/skill-complete` | Mark a skill done, store output, create approval if needed |
| PATCH | `/api/session/dom-page-result` | Store per-page DOM result, patch audit report |
| POST | `/api/session/recover-approval` | Re-create a missing strategy approval |
| POST | `/api/session/resume/:id` | Switch to a past session |
| GET | `/api/session/history` | Paginated list of all sessions |
| GET | `/api/session/scores` | Quality scores for each skill in current session |

### Skill routes — `/api/skill`

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/skill/adapters` | List available adapters, show active one |
| POST | `/api/skill/adapters/test` | Test if an adapter's CLI is installed |
| POST | `/api/skill/adapters/select` | Save adapter preference |
| POST | `/api/skill/run` | **Main skill runner** — streams SSE |
| POST | `/api/skill/run-parallel` | Run multiple workers in parallel (strategy variants) |
| GET | `/api/skill/run/:runId` | Get a single run's full detail |
| GET | `/api/skill/history/:skillName` | Past runs for a skill |
| GET | `/api/skill/context/gtm-implementation` | Preview what Claude will receive (plain English) |
| GET | `/api/skill/page-runs/:skillName` | Latest run per page (for DOM step) |
| GET | `/api/skill/resolution-queue` | Elements pending manual resolution |
| POST | `/api/skill/resolve-element` | Trigger Claude to fix one element |
| PATCH | `/api/skill/resolution/:id/skip` | Skip an element resolution |
| GET | `/api/skill/codebase-drift` | Detect new/removed files since audit |
| PATCH | `/api/skill/acknowledge-drift` | Dismiss the drift warning |

### File routes — `/api/files`

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/files/diff` | Generate unified diff (original vs proposed) |
| POST | `/api/files/apply` | Write a file to disk |
| POST | `/api/files/snapshot` | Take pre-edit backup of files |
| POST | `/api/files/restore` | Roll back files from snapshot |
| GET | `/api/files/changed/:skillName` | Compare current files against snapshot |
| GET | `/api/files/audit-coverage` | Files in project vs files Claude scanned |
| GET | `/api/files/dom-check` | Scan files for still-untracked elements |

### GTM routes — `/api/gtm`

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/gtm/status` | Check if CLI installed and authenticated |
| POST | `/api/gtm/install` | Run `npm install -g @owntag/gtm-cli` |
| POST | `/api/gtm/auth-start` | Start `gtm auth login` (Mac/Linux CLI flow) |
| GET | `/api/gtm/auth-status/:id` | Poll CLI auth completion |
| POST | `/api/gtm/oauth-start` | Start Windows OAuth2 flow |
| GET | `/api/gtm/oauth-callback` | Handle redirect from Google |
| GET | `/api/gtm/oauth-poll/:stateId` | Poll Windows OAuth completion |
| POST | `/api/gtm/oauth-manual-callback` | Manual flow — user pastes redirect URL |
| GET | `/api/gtm/container-data` | Fetch tags/triggers/variables (cached 5 min) |
| POST | `/api/gtm/verify-implementation` | Count GTM objects, compare to plan |
| POST | `/api/gtm/cleanup-dupes` | Delete duplicate GTM objects |

### Other routes

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/approvals` | List approvals for session |
| GET | `/api/approvals/:id` | Get one approval |
| POST | `/api/approvals/:id/approve` | Approve with optional note |
| POST | `/api/approvals/:id/reject` | Reject with optional note |
| POST | `/api/approvals/:id/request-revision` | Request changes |
| GET | `/api/skill/config/:skillName` | Get skill customization |
| PUT | `/api/skill/config/:skillName` | Save section overrides + instructions |
| GET | `/api/costs/summary` | Token costs by skill for a session |
| GET | `/api/activity` | Activity log for a session |
| GET | `/api/settings/encryption-status` | Whether GTM_MASTER_KEY is set |
| GET | `/api/health` | Server alive check |

---

## How a skill run works end to end

This is what happens when the user clicks "Run Implementation":

```
1. FRONTEND
   ImplementationPage.tsx calls run('gtm-implementation', prompt)
   → useSkillRun hook sends POST /api/skill/run
     { skillName, prompt, projectPath, scopedPages? }

2. BACKEND — route handler (routes/skill.ts)
   a. Reads active session from DB
   b. Builds scoped file manifest (only files relevant to this skill)
   c. Builds skill context (reads compactOutputs from session)
   d. Reads additional instructions from skill_config table
   e. Assembles full prompt: manifest + context + task + output format rules
   f. Determines runContext: first_run or rerun (skill already completed?)
   g. Creates skill_run record in DB with status=running
   h. Opens SSE connection to frontend

3. BACKEND — execute.ts
   a. Reads SKILL.md from server/skills/gtm-implementation/SKILL.md
   b. Writes SKILL.md content to a temp file
   c. Gets adapter (claude_code by default)
   d. Calls adapter.execute() with:
      - prompt (assembled in step 2)
      - workspacePath (project path)
      - systemPromptFile (the temp SKILL.md file)
      - claudeSessionId (for conversation resume, if rerun)

4. ADAPTER — adapters/claude-code.ts
   Spawns: claude --print --output-format stream-json
                  --dangerously-skip-permissions
                  --append-system-prompt-file <tmpfile>
                  [--resume <sessionId> if rerun]

   Streams output back as JSON events:
   - assistant message chunks → onChunk callback
   - tool_use events (Read, Write, Edit, Bash) → onActivity callback
   - result event → extract sessionId, tokens, model

5. BACKEND — streaming to frontend
   Every chunk/activity emits an SSE event to the browser:
   - "chunk" → raw text output
   - "activity" → tool use (file read, file edit, bash command)
   - "retry" → if Claude's output fails validation
   - "confidenceUpdate" → coverage % extracted from output
   - "complete" → done, with final sessionId
   - "error" → if all retries exhausted

6. BACKEND — after completion (execute.ts + skill.ts route)
   a. parseRunEdits() — extract file edits from output
   b. parseImplementationResult() — extract GTM resource counts
   c. extractCoverageSignals() — extract coverage % from confidence block
   d. Update skill_run record: status=complete, tokens, cost, duration, score
   e. Write cost_event record
   f. Log to activity_log: skill.completed

7. FRONTEND — receives "complete" SSE event
   a. Calls api.markSkillComplete(skillName, claudeSessionId, parsedOutput)
   b. This hits PATCH /api/session/skill-complete

8. BACKEND — markSkillComplete (session.ts)
   a. upsertSessionOutput() → writes full output to session_outputs table
   b. computeCompactOutput() → derives lean summary
   c. Updates sessions.compact_outputs with new compact
   d. Adds skill to sessions.completed_skills
   e. Records skillSessions[skillName] = claudeSessionId
   f. If gtm-strategy: auto-creates pending approval in approvals table
   g. Returns updated session to frontend

9. FRONTEND — updates UI
   Session context refreshes, step marked complete, next step unlocks
```

---

## The context builders

Before every skill run, the backend assembles what Claude will read. This is done by per-skill "context builder" functions in `routes/skill.ts`. Each one reads from `session.compactOutputs` and produces a plain-text `CONTEXT:` block.

| Skill | What the context builder passes to Claude |
|-------|------------------------------------------|
| gtm-analytics-audit | Project framework hints, additional instructions only — Claude reads files itself |
| gtm-dom-standardization | List of files with untracked elements (from audit compact), naming conventions |
| gtm-strategy | Audit findings summary, element counts by category, framework, DOM step results |
| gtm-implementation | GTM account/container IDs, OAuth tokens (Windows), all planned events with methods, files to modify, previous run state |
| gtm-testing | Events implemented, files modified, test plan structure |
| gtm-reporting | All prior step summaries, implementation stats |

**The problem:** Right now these context builders contain decision logic (e.g. which files to scope, which events remain). That logic should move to an orchestrator, but it is currently split across context builders, SKILL.md files, and the frontend prompt.

---

## Retry logic

If Claude's output fails validation, `execute.ts` retries up to 3 times:

| Error type | What triggers it | What changes on retry |
|------------|-----------------|----------------------|
| `incomplete_json` | Output ends mid-JSON | Prompt: "Your previous response was cut off. Complete the JSON." |
| `malformed_json` | JSON parse fails | Prompt: "Your JSON had a syntax error. Re-output valid JSON only." |
| `missing_fields` | Required fields absent | Prompt: "Missing required fields: X, Y. Output only the JSON block." |
| `timeout` | Run exceeded time limit | Fresh start, shorter scope |
| `unknown` | Any other error | General retry prompt |

Retry count tracked in `skill_runs.retry_count`. Shown in UI as "x2 retries" badge.

---

## Skill scoring

After each run, `services/skill.ts` computes a 0.0–1.0 quality score:

| Skill | How score is computed |
|-------|----------------------|
| gtm-analytics-audit | elements with tracking / total elements |
| gtm-dom-standardization | files modified / files that needed fixing |
| gtm-strategy | total events planned / 10 (capped at 1.0) |
| gtm-implementation | (files modified + tags created) / (expected events × 2) |
| gtm-testing | tests passed / total tests |
| gtm-reporting | 1.0 if output > 500 chars with headings, 0.5 otherwise |

Shown as a percentage in run history and on the dashboard timeline.

---

## What is redundant / should change

| Thing | Current state | What to do |
|-------|---------------|------------|
| Decision logic in context builders | `buildScopedManifest`, `buildImplementationContext` decide which files to scope and which events remain | Move to an orchestrator — context builders should just pass data, not make decisions |
| Decision logic in SKILL.md | gtm-strategy SKILL.md has the full implementation method decision tree (CSS selector vs dataLayer push) | Move to orchestrator — skill files should be execution instructions only |
| Frontend prompt in ImplementationPage | Hardcoded multi-step instruction string inside `doRun()` in ImplementationPage.tsx | Should come from the backend / orchestrator, not be hardcoded in the UI |
| `step_instructions` table | Exists but nothing reads it — `skill_config` is used instead | Delete it |

---

*Next: SCREEN 4 — The Frontend (every page, every component, what each reads from the backend)*

Type "next" to continue to Screen 4.

---

# SCREEN 4 — The Frontend

**Root:** `app/src/`

---

## File map

```
app/src/
├── App.tsx                    — router, wraps all pages in Layout
├── main.tsx                   — entry point, mounts SessionProvider
│
├── pages/                     — one file per screen
│   ├── DashboardPage.tsx      — home, project overview, next step
│   ├── ProjectsPage.tsx       — list/switch/delete projects
│   ├── SetupPage.tsx          — project path + GTM connection
│   ├── AuditPage.tsx          — step 1: run audit, view results
│   ├── DomPage.tsx            — step 2: prepare elements
│   ├── StrategyPage.tsx       — step 3: plan events, approve
│   ├── ImplementationPage.tsx — step 4: run implementation
│   ├── TestingPage.tsx        — step 5: validate tracking
│   ├── ReportingPage.tsx      — step 6: generate docs
│   ├── HistoryPage.tsx        — all past sessions
│   ├── SettingsPage.tsx       — adapter selection, reset
│   ├── ActivityPage.tsx       — event audit trail
│   ├── ApprovalsPage.tsx      — review/approve strategy
│   ├── GtmDocsPage.tsx        — static GTM documentation
│   └── RunDetailPage.tsx      — detail view for one skill run (/runs/:id)
│
├── components/
│   ├── Layout.tsx             — sidebar, nav, breadcrumb
│   ├── ActivityFeed.tsx       — live tool-use log during skill run
│   ├── RunHistory.tsx         — collapsible past runs table
│   ├── AuditDisplay.tsx       — coverage bar, element breakdown
│   ├── AuditShared.tsx        — shared panels: PagesPanel, GtmContainerPanel
│   ├── TrackingEditsPanel.tsx — shows file edits from DOM/impl runs
│   ├── DiffPanel.tsx          — unified diff viewer with apply/skip
│   ├── StepInfo.tsx           — "what this step does" description panel
│   ├── AdditionalInstructions.tsx — per-skill custom instructions editor
│   ├── GtmAuthBanner.tsx      — real-time GTM connection health banner (SSE-based)
│   ├── SiteOverviewCard.tsx   — project summary card on dashboard
│   ├── RerunSkillModal.tsx    — confirm before re-running a step
│   ├── ResetSessionModal.tsx  — confirm before resetting session
│   ├── WelcomeOverlay.tsx     — first-time user onboarding overlay
│   ├── SkillOutput.tsx        — monospace output viewer with autoscroll
│   └── Skeleton.tsx           — loading placeholders
│
├── context/
│   └── SessionContext.tsx     — global session state, markSkillComplete
│
├── hooks/
│   ├── useSkillRun.ts         — skill execution + SSE streaming
│   ├── useGtmStatus.ts        — GTM CLI/auth status (react-query, 60s stale)
│   ├── useGtmHealth.ts        — real-time GTM API health via SSE (one-shot per call)
│   ├── useGtmContainerData.ts — GTM tags/triggers/variables (react-query)
│   ├── useRunHistory.ts       — past runs for a skill
│   ├── useSessionHistory.ts   — all past sessions
│   ├── useSessionStats.ts     — cost + approval + score summaries
│   ├── useStrategyVariants.ts — parallel variant generation
│   └── useLocalToggle.ts      — localStorage boolean toggle
│
├── lib/
│   ├── api.ts                 — every backend API call
│   ├── constants.ts           — PIPELINE_STEPS, API_BASE
│   ├── utils.ts               — cn(), formatElapsed()
│   ├── parseOutput.ts         — extract JSON/diffs from Claude output
│   └── session.ts             — isSkillUnlocked(), isSkillComplete()
│
└── types/
    └── session.ts             — AuditReport, TrackingPlan, SessionData, etc.
```

---

## Every page — what it does and what it reads

### DashboardPage
The home screen. Only shown if a session exists.

**Reads:**
- `session` from SessionContext (compactOutputs for framework/coverage)
- `api.getCostsSummary()` — total cost, cost by skill
- `api.getApprovals()` — count of pending approvals
- `api.getSessionScores()` — quality score per skill for timeline
- `api.checkCodebaseDrift()` — has codebase changed since audit?

**Shows:** Project card, pipeline progress, run score timeline, next recommended step, drift warning banner.

**Backend impact:** If `drift_acknowledged = 0` and files have changed, shows a warning. User can dismiss via `api.acknowledgeDrift()`.

---

### ProjectsPage
Lists all past sessions. Entry point for switching projects.

**Reads:**
- `api.getHistory()` — all sessions paginated
- compactOutputs from each session for framework name, step counts

**Shows:** Project list with progress, framework, cost, last run. Delete button per project.

---

### SetupPage
Step 0 — configure the project before the pipeline runs.

**Reads:**
- `api.browsePath()` — folder picker
- `api.validatePath()` — path existence check
- `useGtmStatus` hook — CLI installed? Authenticated?

**Actions:**
- Create/update session via `api.createOrUpdateSession()`
- Install GTM CLI via `api.installGtmCli()`
- Mac/Linux OAuth: `api.startGtmAuth()` → poll `api.pollGtmAuth()`
- Windows OAuth: `api.startGtmOAuth()` → poll `api.pollGtmOAuth()` or manual `api.submitOAuthManualCallback()`

**Backend impact:** On Windows, OAuth flow stores tokens in `oauth_tokens` table. GTM credentials stored encrypted in `sessions` table.

---

### AuditPage (Step 1)
**Skill:** `gtm-analytics-audit`

**Reads:**
- `api.getSkillOutput('gtm-analytics-audit')` — full AuditReport JSON for display
- `api.getResolutionQueue()` — elements needing manual fix
- `api.auditCoverage()` — files scanned vs project files

**Shows:** Coverage bar, element breakdown by category, pages + elements panel, GTM container panel, resolution queue, run history.

**Actions:**
- Run skill via `useSkillRun`
- Resolve elements via `api.resolveElement()`
- Skip resolutions via `api.skipResolution()`

**Backend impact:** When complete, `audit_coverage_pct` is stored on session. File tree snapshot taken for drift detection.

---

### DomPage (Step 2)
**Skill:** `gtm-dom-standardization`

**Reads:**
- `api.getSkillOutput('gtm-analytics-audit')` — to know which elements need IDs/classes
- `api.getChangedFiles('gtm-dom-standardization')` — diffs for display

**Shows:** Untracked elements grouped by page. For each page: elements list, run button, diff view after changes.

**Actions:**
- Run skill per page (or all at once)
- `api.saveDomPageResult()` after each page — stores result, patches audit report

**Backend impact:** Each page run creates a `skill_run` with `page_context` = page path. `patchAuditReportAfterResolve()` flips tracking flags in the audit report and recalculates coverage.

---

### StrategyPage (Step 3)
**Skill:** `gtm-strategy`

**Reads:**
- `api.getSkillOutput('gtm-strategy')` — full tracking plan
- `api.getSkillOutput('gtm-analytics-audit')` — audit summary for context display
- `api.getApprovals()` — current approval status

**Shows:** Tracking plan with events, priorities, implementation methods. Variant selector (Conservative/Balanced/Comprehensive). Approval card.

**Actions:**
- Run strategy (single or variants via `useStrategyVariants`)
- Approve/reject/request revision via approvals API

**Backend impact:** When strategy completes, an `approval` record is created automatically with status=`pending`. Implementation is locked until this is approved. The approval stores a snapshot of the tracking plan.

---

### ImplementationPage (Step 4)
**Skill:** `gtm-implementation`

**Reads:**
- `api.getSkillOutput('gtm-strategy')` — tracking plan for ImplementationPreview component
- `api.getImplementationContext()` — structured context preview (what Claude will read)
- `api.getChangedFiles('gtm-implementation')` — files changed after run
- `useGtmStatus` — show auth warning if not connected
- `session.compactOutputs['gtm-implementation']` — GTM resource counts after run

**Shows:** Context preview panel (what Claude reads in plain English), tracking plan preview, GTM auth warning, GTM verification grid (created this run / container totals), changed files list, run history.

**Actions:**
- Run skill with hardcoded multi-step prompt (in `doRun()`)
- `api.verifyGtmImplementation()` — live GTM container check after run
- `api.cleanupGtmDupes()` — remove duplicate GTM objects
- `api.restoreFiles()` — roll back source file changes

**Backend impact:** On completion, source files are modified on disk. GTM tags/triggers/variables created in container. Version published.

---

### TestingPage (Step 5)
**Skill:** `gtm-testing`

**Reads:**
- `api.getSkillOutput('gtm-testing')` — test results (passed/failed per event)

**Shows:** Test results table with per-event pass/fail status. Run history.

**Actions:** Run skill via `useSkillRun`.

---

### ReportingPage (Step 6)
**Skill:** `gtm-reporting`

**Reads:**
- `api.getSkillOutput('gtm-reporting')` — markdown text output
- `api.getSkillOutput('gtm-analytics-audit')` — for context display
- `api.getSkillOutput('gtm-strategy')` — for context display

**Shows:** Rendered markdown report. Run history.

**Actions:** Run skill via `useSkillRun`.

---

### RunDetailPage (`/runs/:id`)
Shows full detail for one historical skill run.

**Reads:**
- `api.getSkillRun(runId)` — full SkillRunDetail

**Skill-specific views (all 6 skills now have dedicated views):**
- `gtm-analytics-audit` → AuditRunDetail: coverage bar, pages panel, GTM container panel, history tab
- `gtm-dom-standardization` → DomRunDetail: stats grid, modified files list, TrackingEditsPanel
- `gtm-strategy` → StrategyRunDetail: stats grid, TrackingPlanView with event cards by priority
- `gtm-implementation` → ImplementationRunDetail: GTM resource grid, ImplementationChangedFiles
- `gtm-testing` → TestingRunDetail: stats grid, TestingOutput with pass/fail per event
- `gtm-reporting` → ReportingRunDetail: stats grid, ReportOutput with parsed markdown sections

---

### ApprovalsPage
Review pending strategy approvals.

**Reads:**
- `api.getApprovals()` — all approvals for session

**Shows:** Approval cards with tracking plan summary, action buttons.

**Actions:** `api.approveApproval()`, `api.rejectApproval()`, `api.requestRevision()`

---

### SettingsPage
Adapter selection and session management.

**Reads:**
- `GET /api/skill/adapters` — list + active adapter
- `api.getEncryptionStatus()` — is GTM_MASTER_KEY set?

**Actions:** Select adapter, test adapter, reset session.

---

## Key components explained

### SessionContext
The most important piece of frontend state. Wraps the entire app.

Holds:
- `session` — the full SessionData object (id, projectPath, completedSkills, compactOutputs, etc.)
- `markSkillComplete(skillName, claudeSessionId, output)` — calls `PATCH /api/session/skill-complete`, refreshes session
- `isSkillUnlocked(skillName)` — checks completedSkills + strategy approval status
- `isSkillComplete(skillName)` — checks completedSkills array

**Backend impact:** Every time `markSkillComplete` is called, the session is re-fetched from the server. This is how the UI knows to unlock the next step.

---

### useSkillRun
Manages the SSE stream for a skill run. Used by every pipeline page.

```
run(skillName, prompt, projectPath, scopedPages?)
  → POST /api/skill/run
  → opens EventSource (SSE)
  → receives: chunk, activity, retry, confidenceUpdate, complete, error
  → on complete: calls onComplete(claudeSessionId, fullOutput)
```

The `onComplete` callback is where each page calls `markSkillComplete`.

---

### ActivityFeed
Shows live tool-use events during a skill run. Reads from the `activity` array in `useSkillRun`.

Each entry shows: tool name (Read/Write/Edit/Bash/Grep), file path or command, status.
Also shows: elapsed time, files read vs modified progress bar, current action highlight.

---

### RunHistory
Collapsible table of past runs for a skill. Used at the bottom of every pipeline page.

Each row links to `/runs/:id`. Has "Load output" button to restore a previous run's output into the page display. Has "Re-run" button.

---

## How the frontend knows what step is unlocked

`lib/session.ts` — `isSkillUnlocked(skillName, session, strategyApproved)`:

```
Step 1 (audit):        unlocked if session.projectPath exists
Step 2 (dom):          unlocked if step 1 complete
Step 3 (strategy):     unlocked if step 2 complete
Step 4 (implementation): unlocked if step 3 complete
                          AND strategyApproved = true
                          AND audit_coverage_pct >= 90
Step 5 (testing):      unlocked if step 4 complete
Step 6 (reporting):    unlocked if step 5 complete
```

`strategyApproved` is computed in `SessionContext` by checking if any approval for `gtm-strategy` has `status = 'approved'`.

---

## Backend changes that directly affect the frontend

| Backend change | Frontend impact |
|----------------|-----------------|
| `session.compactOutputs` updated | SessionContext re-fetches session → UI updates automatically |
| New skill added to `completed_skills` | Next pipeline step unlocks in sidebar |
| Approval created for gtm-strategy | ApprovalsPage shows new pending item; Approvals badge shows count |
| Approval status set to `approved` | Implementation step unlocks |
| `audit_coverage_pct` updated | Implementation lock threshold checked; coverage bar updates |
| `drift_acknowledged` set to 0 | Dashboard shows drift warning banner |
| `oauth_tokens` saved | GTM status check returns `authenticated: true`; auth warning disappears on ImplementationPage |

---

## What is redundant / should change

| Thing | Current state | What to do |
|-------|---------------|------------|
| `doRun()` prompt in ImplementationPage | 6-step hardcoded instruction string in the UI file | Move to backend — frontend should not contain skill instructions |
| `GtmSetupPage.tsx` | Legacy page, not in the pipeline, not linked from nav | Remove |
| `compactOutputs` read by frontend for display | ImplementationPage reads `session.compactOutputs['gtm-implementation']` for GTM resource counts | Fine to keep for now — it is the right lightweight data for that use case |
| `useStrategyVariants` + parallel run | Complex parallel execution for 3 strategy variants | Keep — this is intentional UX, not redundancy |

---

*Next: SCREEN 5 — The SKILL.md Files (what they contain, what should stay, what should move)*

Type "next" to continue to Screen 5.

---

# SCREEN 5 — The SKILL.md Files

**Location:** `server/skills/{skill-name}/SKILL.md`

These files are Claude's instructions for each skill. They are read at runtime, written to a temp file, and passed to Claude as a system prompt via `--append-system-prompt-file`.

Every SKILL.md has the same structure:

```
---
name: skill-name
description: when to use this skill (trigger phrases)
---

## PERSONA
## CRITICAL RULES
## WORKFLOW
## OUTPUT_FORMAT
## EXAMPLES        (optional)
## EDGE_CASES      (optional)
## CONFIDENCE REPORT
```

---

## What each SKILL.md contains today

### gtm-analytics-audit

**PERSONA:** Senior Frontend Engineer with GA4 expertise.

**What it tells Claude to do:**
- Scan component files for buttons, links, forms, interactive elements
- Classify by category (cta, nav, form, media, outbound)
- Measure existing tracking coverage
- Output a structured JSON report with every element found

**Decision logic inside:**
- What counts as a "leaf element" vs a wrapper (e.g. `<button>` not `<div onClick>`)
- Rules for incremental mode (only scan new files, not the whole project again)
- Naming heuristics for element categories

**Output format:** Large JSON — `AuditReport` schema with summary, categorized elements, issues, recommendations, existing tracking.

**KEEP / MOVE:**
- Keep: All execution instructions (how to scan, what tools to use, output format)
- Keep: Incremental scan rules — these are execution details
- Keep here: Category classification rules — they belong with the scanning logic

---

### gtm-dom-standardization

**PERSONA:** Senior Frontend Engineer focused on DOM standardization.

**What it tells Claude to do:**
- Add `id="cta_hero_get_started"` and `class="js-track js-cta"` to elements
- Edit files directly — no diffs, no output blocks
- Never remove existing onClick handlers

**Decision logic inside:**
- Naming convention: `{category}_{location}_{descriptor}` for IDs
- Class convention: `js-track js-{category} js-{action} js-{location}`
- Which elements get which classes

**Output format:** JSON — `{ filesModified, appliedCount, changes[] }`

**KEEP / MOVE:**
- Keep: File editing instructions, naming convention rules
- Keep: Class/ID format — this is execution detail
- These rules are tightly coupled to the output — they stay here

---

### gtm-strategy

**PERSONA:** Product Manager with Analytics expertise.

**What it tells Claude to do:**
- Read element counts from CONTEXT
- For each element category, decide the implementation method
- Assign P0/P1/P2 priority
- Output a full tracking plan JSON

**Decision logic inside (THE IMPORTANT ONE):**

This file contains the **full decision tree** for implementation methods:

```
Does the event need custom data NOT in the DOM?
  YES → dataLayer push (code changes required)
  NO  → Is the element identifiable by CSS selector?
    YES → css_selector_trigger (zero code changes)
    NO  → dataLayer push
```

Plus category-level rules:
- CTA clicks with standardized IDs → css_selector_trigger
- Nav clicks → css_selector_trigger + dom_variable for text/href
- Form submissions → builtin_form (unless validation status needed)
- Scroll depth → always builtin_scroll
- YouTube → always builtin_youtube
- SPA page views → always dataLayer push
- E-commerce/auth → always dataLayer push

**Output format:** JSON — full `TrackingPlan` with events[], summary, recommendedReports.

**KEEP / MOVE:**
- **MOVE to orchestrator:** The decision tree and category rules. This is business logic about WHAT to track and HOW. It should not live inside a Claude prompt — it should be a deterministic set of rules the orchestrator applies before Claude runs.
- Keep: Output format instructions, business value framing, gap analysis guidance

---

### gtm-implementation

**PERSONA:** Senior Frontend Engineer specializing in analytics implementation.

**What it tells Claude to do:**
- Phase 1: Check platform (Windows vs Mac/Linux), verify GTM credentials
- Phase 2: Enable built-in GTM variables
- Phase 3: Create GTM-native triggers (CSS selector, built-in click/form/scroll/video)
- Phase 4: Create GA4 tags for each trigger
- Phase 5: Write dataLayer.push() calls for datalayer_push events
- Phase 6: Create dataLayer variables and custom event triggers
- Phase 7: Publish container version

**Decision logic inside:**
- Full CLI command examples for every trigger type (css_selector, builtin_click, builtin_form, builtin_scroll, builtin_visibility, builtin_youtube)
- Windows API equivalents for every CLI command
- Naming conventions: `DOM - {Description}`, `DLV - {Param}`, `CE - {Event}`, `GA4 - {Event}`
- Framework-specific code rules (Next.js App Router needs `'use client'`, TypeScript uses optional chaining)

**Output format:** JSON — `{ filesModified, filesEdited, eventsImplemented, gtmResources, errors }`

**KEEP / MOVE:**
- Keep: All CLI commands and API equivalents — this is HOW to execute, not WHAT to do
- Keep: Naming conventions — execution detail
- Keep: Framework-specific code rules — execution detail
- **MOVE to orchestrator:** Which events to implement and in what order — this comes from the tracking plan. The orchestrator should pass a pre-decided list; the skill should just execute it.

---

### gtm-testing

**PERSONA:** QA Engineer focused on analytics validation.

**What it tells Claude to do:**
- Tier 1: Static analysis — grep source files for dataLayer.push(), verify event names match plan
- Tier 2: GTM config validation — check GTM container has correct triggers and tags
- Tier 3: Parameter validation — check event parameters match expected values

**Decision logic inside:**
- What to check at each tier
- Failure criteria (exact match vs partial match)

**Output format:** JSON — `{ passed, failed, warnings, events[] }`

**KEEP / MOVE:**
- Keep: All of it. Testing instructions are execution logic. No business decisions here.

---

### gtm-reporting

**PERSONA:** Technical Writer and Analytics Strategist.

**What it tells Claude to do:**
- Write a markdown document with exactly 5 required headings
- Max 1500 words
- Include: Implementation Summary, What Was Tracked, Events Implemented, Data Dictionary, Next Steps

**Decision logic inside:**
- Required headings (non-negotiable structure)
- Word count limit

**Output format:** Markdown (not JSON).

**KEEP / MOVE:**
- Keep: All of it. This is purely output formatting instructions.

---

## Summary: what belongs in SKILL.md vs what should move

| Content type | Belongs in SKILL.md? | Why |
|--------------|---------------------|-----|
| How to execute a task (tools to use, commands to run) | YES | Execution detail — Claude needs this |
| Output format (JSON schema, required fields) | YES | Claude needs to know what shape to produce |
| Naming conventions (IDs, GTM object names) | YES | Execution detail |
| CLI command examples | YES | Claude needs these to call the right commands |
| **What to track (which events matter)** | **NO** | Business decision — belongs in orchestrator |
| **Which implementation method per event** | **NO** | Decision logic — belongs in orchestrator |
| **Which files to scope** | **NO** | Data derivation — belongs in context builder reading orchestrator output |
| **Priority assignment (P0/P1/P2)** | **NO** | Business decision — belongs in orchestrator |

---

## The current confusion

Right now there are **three places** that all participate in deciding what to do:

```
1. SKILL.md (gtm-strategy)
   → Contains the decision tree for implementation methods
   → Claude reads this and makes decisions

2. Context builders (routes/skill.ts)
   → buildScopedManifest() decides which files Claude sees
   → buildImplementationContext() decides which events remain

3. Frontend (ImplementationPage.tsx doRun())
   → Contains a hardcoded 6-step instruction string
   → Step 2 tells Claude which GTM method to use on which OS
```

These three places need to agree. When they disagree, Claude gets conflicting instructions or makes decisions that were already made elsewhere. This is the root cause of the confusion around "what does the skill file decide."

**The fix:** One orchestrator makes all decisions and stores them in the DB. SKILL.md files receive those decisions via the CONTEXT block and just execute. The frontend prompt disappears — the backend assembles the full instruction.

---

## What other files live alongside SKILL.md

Each skill directory can also contain reference files that Claude reads:

```
server/skills/
├── gtm-analytics-audit/
│   └── references/naming-conventions.md    — element naming rules
├── gtm-dom-standardization/
│   └── references/element-patterns.md      — patterns for identifying elements
├── gtm-implementation/
│   ├── assets/templates/saas.json          — SaaS tracking template
│   └── references/
│       ├── datalayer-patterns.md           — dataLayer code patterns
│       └── event-taxonomies.md             — event naming taxonomy
```

These reference files are NOT automatically passed to Claude. They exist as documentation or could be injected via the context builder if needed.

---

*Next: SCREEN 6 — Data flow (how data moves from step to step, every dependency between skills)*

Type "next" to continue to Screen 6.

---

# SCREEN 6 — Data Flow

How data moves from one step to the next. Every dependency mapped.

---

## The chain

```
Project path
    ↓
[Step 1: Audit] ──────────────────────────────────────────────────────┐
    ↓ writes to DB:                                                    │
    │  session_outputs['gtm-analytics-audit'] = full AuditReport JSON │
    │  compact_outputs['gtm-analytics-audit'] = {                     │
    │    summary, metadata, untrackedByFile, topRecommendations        │
    │  }                                                               │
    │  audit_coverage_pct (on sessions row)                            │
    │  file_tree_snapshot (for drift detection)                        │
    ↓                                                                  │
[Step 2: Prepare Elements] ────────────────────────────────────────────┤
    reads:  compact_outputs['gtm-analytics-audit'].untrackedByFile     │
    ↓ writes to DB:                                                    │
    │  session_outputs['gtm-dom-standardization'] = full DOM report    │
    │  compact_outputs['gtm-dom-standardization'] = {                  │
    │    appliedFiles, appliedCount, pageResults                        │
    │  }                                                               │
    │  ALSO patches session_outputs['gtm-analytics-audit']:            │
    │    flips tracking=true for resolved elements                      │
    │    recalculates summary.withTracking, coveragePercent            │
    │    updates audit_coverage_pct on sessions row                    │
    ↓                                                                  │
[Step 3: Strategy] ────────────────────────────────────────────────────┤
    reads:  compact_outputs['gtm-analytics-audit'] (element counts)    │
            compact_outputs['gtm-dom-standardization'] (applied files) │
    ↓ writes to DB:                                                    │
    │  session_outputs['gtm-strategy'] = full TrackingPlan JSON        │
    │  compact_outputs['gtm-strategy'] = {                             │
    │    summary, events[{name, priority, implementationMethod,        │
    │      gtmResourcesToCreate, params}]                              │
    │  }                                                               │
    │  approvals record created (status=pending)                       │
    ↓                                                                  │
[User approves strategy] ──────────────────────────────────────────────┤
    approvals.status = 'approved'                                      │
    ↓                                                                  │
[Step 4: Implementation] ──────────────────────────────────────────────┤
    reads:  compact_outputs['gtm-strategy'].events (what to implement) │
            compact_outputs['gtm-dom-standardization'].appliedFiles    │
            oauth_tokens (Windows) or GTM CLI (Mac/Linux)              │
            session.gtmConfig.accountId + containerId                  │
    ↓ writes to DB:                                                    │
    │  session_outputs['gtm-implementation'] = full impl result        │
    │  compact_outputs['gtm-implementation'] = {                       │
    │    filesModified, eventsImplemented, filesEdited, gtmResources   │
    │  }                                                               │
    │  file_snapshots (pre-edit backup of source files)                │
    │  GTM container: tags + triggers + variables CREATED in GTM       │
    │  Source files: dataLayer.push() calls WRITTEN to disk            │
    ↓                                                                  │
[Step 5: Testing] ─────────────────────────────────────────────────────┤
    reads:  compact_outputs['gtm-implementation'] (events done)        │
            compact_outputs['gtm-strategy'] (expected events)          │
    ↓ writes to DB:                                                    │
    │  session_outputs['gtm-testing'] = test results JSON              │
    │  compact_outputs['gtm-testing'] = { passed, failed, events }     │
    ↓                                                                  │
[Step 6: Reporting] ───────────────────────────────────────────────────┘
    reads:  compact_outputs (all skills) for summary data
    ↓ writes to DB:
       session_outputs['gtm-reporting'] = markdown text
       compact_outputs['gtm-reporting'] = null
```

---

## Dependency table

What each step MUST have in the DB before it can produce useful output:

| Step | Hard dependencies | What breaks without it |
|------|-------------------|----------------------|
| Audit | project_path | Cannot scan files |
| Prepare Elements | audit compact: `untrackedByFile` | Doesn't know which files to edit |
| Strategy | audit compact: element counts | Cannot plan events without knowing what exists |
| Strategy | dom compact: `appliedFiles` | Cannot determine if CSS selectors are safe to use |
| Implementation | strategy compact: `events[]` with `implementationMethod` | Defaults everything to dataLayer push |
| Implementation | dom compact: `appliedFiles` | No file scope — edits wrong files |
| Implementation | `gtmConfig` on session | Cannot call GTM API |
| Implementation | `oauth_tokens` (Windows) OR CLI auth (Mac/Linux) | GTM objects not created |
| Testing | impl compact: `eventsImplemented` | Doesn't know what to test |
| Reporting | all prior compact_outputs | Report has no content |

---

## What compact_outputs each step reads from prior steps

### Step 2 (DOM) reads from Step 1 (Audit):
```
compact_outputs['gtm-analytics-audit'].untrackedByFile
  → { "src/Hero.tsx": [{ file, line, text, id, classes, tracking, recommendation }] }
  → Used to build the scoped file manifest (only files with untracked elements)
```

### Step 3 (Strategy) reads from Steps 1 + 2:
```
compact_outputs['gtm-analytics-audit']
  → summary.totalClickableElements, .withTracking, .withoutTracking
  → metadata.framework
  → catSummary (category breakdown)
  → topRecommendations
  → Used to infer business model and plan events

compact_outputs['gtm-dom-standardization']
  → appliedFiles (list of files that got IDs/classes)
  → appliedCount
  → Used to determine if CSS selector triggers are safe
    (if DOM ran → elements have standardized IDs → css_selector_trigger works)
    (if DOM did NOT run → no IDs → must use dataLayer_push instead)
```

### Step 4 (Implementation) reads from Steps 2 + 3:
```
compact_outputs['gtm-strategy']
  → events[].name, .priority, .implementationMethod, .params, .gtmResourcesToCreate
  → Used to build the full list of what to create in GTM and which files to edit

compact_outputs['gtm-dom-standardization']
  → appliedFiles
  → Used as the SCOPE — only these files should have dataLayer events added

compact_outputs['gtm-implementation'] (if re-run)
  → eventsImplemented (already done — skip these)
  → filesEdited (already modified — skip these)
  → gtmResources (already created — skip these)
  → Used to implement only the REMAINING work on a re-run
```

### Step 5 (Testing) reads from Steps 3 + 4:
```
compact_outputs['gtm-strategy']
  → events[] (the expected events — what should have been implemented)

compact_outputs['gtm-implementation']
  → eventsImplemented (what was actually done)
  → filesEdited (which source files to check)
```

### Step 6 (Reporting) reads from all steps:
```
compact_outputs['gtm-analytics-audit']  → coverage stats
compact_outputs['gtm-dom-standardization'] → elements fixed
compact_outputs['gtm-strategy']  → events planned
compact_outputs['gtm-implementation'] → GTM objects created
compact_outputs['gtm-testing'] → test results
```

---

## The audit patch — a special case

When Prepare Elements completes, it does something no other step does: it **patches a previous step's output**.

```
Before DOM runs:
  session_outputs['gtm-analytics-audit'].categorized.cta.elements[0].tracking = false

After DOM runs and patchAuditReportAfterResolve() is called:
  session_outputs['gtm-analytics-audit'].categorized.cta.elements[0].tracking = true
  session_outputs['gtm-analytics-audit'].summary.withTracking += 1
  session_outputs['gtm-analytics-audit'].summary.withoutTracking -= 1
  audit_coverage_pct on sessions row is recalculated
```

This is why the Implementation step can become unlocked AFTER the audit runs — the 90% coverage threshold is re-evaluated every time DOM patches the audit report.

---

## Claude session continuity

Steps can resume the Claude conversation from a prior step (instead of starting fresh):

```
SESSION_CHAIN = {
  'gtm-strategy':       resumes 'gtm-dom-standardization' session
  'gtm-implementation': resumes 'gtm-strategy' session
  'gtm-testing':        resumes 'gtm-implementation' session
  'gtm-reporting':      resumes 'gtm-testing' session
}
```

This means Claude remembers what it did in the previous step when running the next one. The Claude session ID is stored in `sessions.skillSessions[skillName]`.

**Exceptions — these always start fresh:**
- Audit (no prior session to resume)
- DOM standardization (resuming audit session causes Claude to think work is already done)
- Implementation (resuming strategy session causes "No conversation found" errors on re-runs)

---

## What breaks if steps are skipped

| Skipped step | Effect on downstream |
|--------------|---------------------|
| Skip Audit | DOM has no element list → edits nothing. Strategy has no element counts → plans generically. |
| Skip DOM | Strategy cannot determine if css_selector_trigger is safe → may default all events to dataLayer push |
| Skip Strategy | Implementation has no events list → nothing to implement |
| Skip approval | Implementation is blocked — `isSkillUnlocked` returns false |
| Skip Implementation | Testing has nothing to test. Reporting says "0 events implemented." |
| Skip Testing | Reporting can still run but has no test results section |

---

## Re-run behaviour

When a step is re-run (already completed before):

1. Frontend calls `markSkillComplete` which calls `upsertSessionOutput` — this REPLACES the old output with the new one
2. `computeCompactOutput` replaces the compact summary
3. The downstream steps are NOT automatically reset — their old outputs stay
4. The user must manually re-run downstream steps if they want updated results

**Exception:** Strategy re-run auto-creates a new approval in `pending` status, locking Implementation again until re-approved.

---

## Files on disk vs data in DB

Two things change on disk (outside the DB) when the pipeline runs:

| Step | What changes on disk |
|------|---------------------|
| Prepare Elements | Source files get id/class attributes added |
| Implementation | Source files get dataLayer.push() calls added |

Both of these are backed up to `file_snapshots` before the run. The "Restore" button uses those snapshots to undo changes.

The DB stores WHAT was changed (file paths, diffs). The actual file content lives on disk.

---

*Next: SCREEN 7 — What to keep, what to remove, and what to build (the orchestrator)*

Type "next" to continue to Screen 7.

---

# SCREEN 7 — What to Keep, Remove, and Build

This is the full audit of what is working, what is dead weight, and what needs to change.

---

## What is working well — keep as-is

| Thing | Why it is good |
|-------|---------------|
| `session_outputs` table | Clean single source of truth for full skill outputs |
| `compact_outputs` JSON blob on sessions | Right design — fast reads for context builders without re-parsing large JSON |
| `skill_runs` table | Complete execution history, nothing redundant |
| `file_snapshots` + restore flow | Solid rollback mechanism |
| `approvals` gate between strategy and implementation | Correct design — human review before destructive changes |
| SSE streaming from backend to frontend | Works well, no changes needed |
| `useSkillRun` hook | Clean abstraction, handles all streaming edge cases |
| Per-skill scoring in `services/skill.ts` | Useful quality signal, correct place for it |
| `activity_log` | Good audit trail, append-only |
| Adapter abstraction | Clean — swapping Claude for Gemini/OpenCode requires no other changes |
| SKILL.md execution instructions | The HOW (CLI commands, output format, code patterns) belongs here |
| `AdditionalInstructions` component + `skill_config` table | Good — lets users customize prompts without touching code |

---

## What to remove — dead code and duplicates

| Thing | Location | Why remove |
|-------|----------|-----------|
| `step_instructions` table | `db.ts` | **KEEP** - actively used by `routes/config.ts` and `routes/skill.ts`. Stores `additionalInstructions` alongside `skill_config` section overrides. Not a duplicate. |
| `GtmSetupPage.tsx` | `app/src/pages/` | **DONE** - deleted 2026-03-31. Not in App.tsx router. |
| `doRun()` prompt string | `app/src/pages/ImplementationPage.tsx` | **DONE** - moved to `DEFAULT_TASK_PROMPTS['gtm-implementation']` in `routes/skill.ts`. Frontend sends empty prompt; backend uses default. |
| `gtm-setup` case branches | `session.ts`, `routes/skill.ts`, `services/skill.ts` | **DONE** - removed all 3. Historical migration in `db.ts` left intact. |
| Decision tree in `gtm-strategy` SKILL.md | `server/skills/gtm-strategy/SKILL.md` | **Pending orchestrator** - depends on orchestrator being built first. |
| `buildScopedManifest()` file scoping | `server/src/routes/skill.ts` | **Pending orchestrator** - should read orchestrator output once built. |

---

## What to build — the orchestrator

### The problem it solves

Right now "what to do" is decided in three scattered places:
1. `gtm-strategy` SKILL.md — Claude decides implementation methods
2. Context builders in `routes/skill.ts` — code derives file scope and remaining work
3. `doRun()` in `ImplementationPage.tsx` — frontend hardcodes step-by-step instructions

When these disagree, Claude gets conflicting signals. When something changes (e.g. a new implementation method), it must be updated in all three places.

### What the orchestrator is

A new skill called `gtm-orchestrator`. It:
- Runs as a Claude call (like any other skill)
- Reads all prior step outputs from the DB
- Decides: which events to implement, which method per event, which files to scope, what GTM objects to create
- Writes its decisions to `session_outputs['gtm-orchestrator']` and `compact_outputs['gtm-orchestrator']`
- Runs automatically before implementation (triggered when the user clicks "Run Implementation" if its output does not exist yet, or after strategy is approved)

It is NOT a new UI step. It runs invisibly in the background.

### What the orchestrator decides (stored in DB)

```
compact_outputs['gtm-orchestrator'] = {
  events: [
    {
      name: "cta_click",
      priority: "P0",
      method: "css_selector_trigger",   // decided here, not in SKILL.md
      files: ["src/Hero.tsx"],           // decided here, not in buildScopedManifest
      gtmResources: {
        variables: ["DOM - CTA Text"],
        triggers: ["Click - CTA Hero"],
        tags: ["GA4 - CTA Click"]
      },
      params: ["cta_text", "cta_id"],
      done: false                        // updated as implementation runs
    }
  ],
  scopeFiles: ["src/Hero.tsx", "src/Nav.tsx"],  // union of all event file assignments
  platform: "windows",
  gtmAuth: "oauth_api"
}
```

### How skills change after orchestrator exists

| Skill | Before orchestrator | After orchestrator |
|-------|--------------------|--------------------|
| gtm-strategy SKILL.md | Contains decision tree for method selection | Removed. Orchestrator makes method decisions. Strategy just plans events and business value. |
| buildScopedManifest() | Derives file scope per skill from compact outputs | Reads `compact_outputs['gtm-orchestrator'].scopeFiles` |
| buildImplementationContext() | Derives remaining events, scoped files, re-run delta | Reads orchestrator output directly — no derivation |
| ImplementationPage `doRun()` | 6-step hardcoded instruction string | Removed. Backend assembles the full prompt from orchestrator output. |
| gtm-implementation SKILL.md | Receives method per event in CONTEXT, executes | Unchanged — execution instructions stay |

### Where the orchestrator SKILL.md lives

`server/skills/gtm-orchestrator/SKILL.md`

It is short. It tells Claude to:
- Read audit, DOM, and strategy outputs from CONTEXT
- Apply the method decision rules (now defined once, here, not scattered)
- Output the execution plan JSON
- Do NOT modify any files or call any APIs

### Trigger logic

```
User clicks "Run Implementation"
  → Backend checks: does compact_outputs['gtm-orchestrator'] exist?
    YES → use it, run implementation directly
    NO  → run orchestrator first (invisible to user), then run implementation
```

The orchestrator re-runs automatically if:
- Strategy was re-run and approved again (new events/methods may have changed)
- User manually triggers it (future: "Re-plan" button)

---

## Complete picture — before vs after

### Before (current state)

```
Frontend                Backend                 Claude
─────────              ─────────               ──────
doRun() prompt    →    context builders    →   SKILL.md decision tree
(6-step hardcode)      (derive scope/remaining) (decides method per event)
```

Three places making decisions. All must agree. Hard to change.

### After (with orchestrator)

```
Frontend                Backend                 Claude
─────────              ─────────               ──────
Run button        →    orchestrator runs   →   orchestrator SKILL.md
                       stores plan in DB        (one place for decisions)
                            ↓
                       skill runs read     →   execution SKILL.md
                       plan from DB             (just executes)
```

One place makes decisions (orchestrator). Skills just execute. Frontend just triggers.

---

## Recommended order of changes

Do these in order. Each one is independent and can be shipped separately.

### 1. Remove dead code - **DONE 2026-03-31**
- `GtmSetupPage.tsx` deleted
- `gtm-setup` case branches removed from `session.ts`, `routes/skill.ts`, `services/skill.ts`
- `step_instructions` table kept (it IS used - not dead code)

### 2. Move frontend prompt to backend - **DONE 2026-03-31**
- `doRun()` prompt string moved to `DEFAULT_TASK_PROMPTS['gtm-implementation']` in `routes/skill.ts`
- Frontend sends empty prompt string; backend falls back to `DEFAULT_TASK_PROMPTS`
- Schema updated to allow empty prompt (`z.string().default('')`)

### 3. Build the orchestrator (medium effort)
- Create `server/skills/gtm-orchestrator/SKILL.md`
- Add `POST /api/orchestrator/run` endpoint (or trigger inline)
- Wire it to run before implementation if output missing
- Store output in `session_outputs` + `compact_outputs`

### 4. Update context builders to read orchestrator output (low risk, depends on 3)
- `buildScopedManifest()` reads `compact_outputs['gtm-orchestrator'].scopeFiles`
- `buildImplementationContext()` reads orchestrator events instead of re-deriving

### 5. Strip decision logic from gtm-strategy SKILL.md (depends on 3+4)
- Remove the decision tree section
- Strategy Claude just plans events and business value
- Orchestrator Claude applies the method rules after

---

## Summary in one paragraph

The app works. The data model is clean. The pipeline is correct. The problem is that decision-making logic is split across three places — a SKILL.md file, backend context builder functions, and a hardcoded frontend string — so when something changes, it must be updated in all three. The fix is a new internal skill called `gtm-orchestrator` that runs before implementation, reads all prior outputs, makes all the decisions once, and writes them to the DB. Every skill after it just reads from the DB and executes. No decisions in SKILL.md, no decisions in the frontend. One brain, stored in the DB, consumed by executors.

---

*End of layout document. All 7 screens complete.*

---

# SCREEN 8 — Run History Detail Pages (What's Broken and What to Fix)

When a user clicks any run from the history table, they land on `/runs/:id`.

**The problem:** Most skill run detail pages show a generic stats grid + raw output. They do not match what the actual skill page shows after a run completes. The user sees completely different UI for the same data depending on whether they're on the live page or the history page.

---

## Current state — what each skill shows on `/runs/:id`

| Skill | Current RunDetailPage | What the actual skill page shows |
|-------|----------------------|----------------------------------|
| gtm-analytics-audit | Stats grid + SlimCoverageBar + PagesPanel + GtmContainerPanel + History tab | Same — **this one already matches** |
| gtm-dom-standardization | Stats grid + TrackingEditsPanel | Full per-page element breakdown, CombinedResultCard, files modified with category chart |
| gtm-strategy | Stats grid + raw output (collapsible text) | TrackingPlanView with event cards, metadata bar, summary stats, approval panel |
| gtm-implementation | Stats grid + GTM resource grid + ImplementationChangedFiles | Same GTM grid + ImplementationChangedFiles — **this one already matches** |
| gtm-testing | Stats grid + raw output (collapsible text) | TestingOutput with pass/fail summary, per-event result table with status icons |
| gtm-reporting | Stats grid + raw output (collapsible text) | Parsed markdown sections (collapsible), pipeline summary stats |

---

## Skill by skill — exact gap and what to reuse

### 1. Audit — ALREADY DONE
RunDetailPage has `AuditRunDetail` which renders SlimCoverageBar + PagesPanel + GtmContainerPanel.
This matches the audit page output. No changes needed.

**Missing (acceptable to leave out):** Resolution queue, coverage gap panel, re-run buttons.
These are workflow actions, not output display. A history view is read-only — these should not be there.

---

### 2. DOM Standardization — NEEDS WORK

**What the skill page shows after completion:**
- `CombinedResultCard` — pages resolved, elements fixed, files modified, cost/tokens/duration stats
- Per-page list with element counts and file names
- `TrackingEditsPanel` — structured element edits (added IDs, classes per element per file)

**What RunDetailPage shows:**
- `TrackingEditsPanel` only (already imported and used)

**What to add:**
- The stats summary: pages resolved, elements fixed, files modified (from `run.result_json` or `compact_outputs`)
- The `TrackingEditsPanel` is already there and correct

**Components to reuse:** `TrackingEditsPanel` (already used). Stats can be a simple grid, no new component needed — just read from `run.result_json`.

**Data available in the run record:** `result_json` contains `{ filesModified, appliedCount, pageResults }`. `run.edits` contains the per-element breakdown already parsed.

---

### 3. Strategy — NEEDS WORK

**What the skill page shows after completion:**
- `TrackingPlanView` — metadata bar, summary stats grid, events grouped by priority (P0/P1/P2), each event expandable with parameters, business value, reporting impact
- Approval panel (pending/approved/rejected state)

**What RunDetailPage shows:**
- Generic: stats grid + raw output collapsible

**What to add:**
- `StrategyRunDetail` component that parses `run.output_log` as JSON (same `extractJson()` used by AuditRunDetail) and renders the tracking plan
- Reuse the tracking plan display components from `StrategyPage.tsx`

**Components to reuse:** `extractJson()` from `AuditDisplay.tsx` to parse the plan. The `TrackingPlanView` and `EventCard` components are currently local to `StrategyPage.tsx` — they need to be exported so RunDetailPage can import them.

**What NOT to show:** Approval panel (that is a workflow action, not output display). Re-run buttons.

**Data available:** `run.output_log` contains the full JSON tracking plan Claude produced.

---

### 4. Implementation — ALREADY DONE
RunDetailPage has `ImplementationRunDetail` which renders GTM resource grid + `ImplementationChangedFiles`.
This matches the implementation page output. No changes needed.

---

### 5. Testing — NEEDS WORK

**What the skill page shows after completion:**
- `TestingOutput` component:
  - Summary stats bar: Passed count (green), Failed count (red), Warnings count (yellow)
  - Status banner: "All checks passed" / "X events failed" / "X warnings"
  - Per-event result list: status icon, event name, status label, notes

**What RunDetailPage shows:**
- Generic: stats grid + raw output collapsible

**What to add:**
- `TestingRunDetail` component that parses `run.output_log` as JSON and renders test results
- Reuse the testing output display from `TestingPage.tsx`

**Components to reuse:** The `TestingOutput` component (or equivalent inline rendering) from `TestingPage.tsx` — needs to be exported.

**Data available:** `run.output_log` contains `{ passed, failed, warnings, events: [{ name, status, notes }] }`.

---

### 6. Reporting — NEEDS WORK

**What the skill page shows after completion:**
- Pipeline summary stats: coverage %, elements tracked, events defined
- `ReportOutput` — markdown parsed into collapsible sections, each section renderable
- Raw markdown toggle

**What RunDetailPage shows:**
- Generic: stats grid + raw output collapsible (the raw output IS the markdown, just not rendered)

**What to add:**
- `ReportingRunDetail` component that renders `run.output_log` as parsed markdown
- Reuse the markdown section parsing + rendering from `ReportingPage.tsx`

**Components to reuse:** The `ReportOutput` component (or its section parser) from `ReportingPage.tsx` — needs to be exported. The raw markdown is already in `run.output_log`.

**Data available:** `run.output_log` is the full markdown report. No JSON parsing needed — it is already plain text.

---

## Summary of changes (all DONE as of 2026-03-31)

| Skill | Status | What was done |
|-------|--------|---------------|
| Audit | DONE | AuditRunDetail already matched skill page |
| DOM | DONE | Added DomRunDetail: stats grid + files list + TrackingEditsPanel |
| Strategy | DONE | Added StrategyRunDetail: exported TrackingPlanView + EventCard from StrategyPage |
| Implementation | DONE | ImplementationRunDetail already matched skill page |
| Testing | DONE | Added TestingRunDetail: exported TestingOutput from TestingPage |
| Reporting | DONE | Added ReportingRunDetail: exported ReportOutput from ReportingPage |

---

## How to do this without reinventing anything

The pattern is the same for every skill:

1. Extract the output display component from the skill page into a named export
2. Add a `{Skill}RunDetail` component in `RunDetailPage.tsx` that uses that component
3. Add a routing case in `RunDetailPage`'s skill dispatcher: `if (run.skill_name === 'gtm-X') return <XRunDetail run={run} />`
4. Pass `run.output_log` as the data source (parsed with `extractJson()` for JSON skills, raw text for reporting)

No new components need to be invented. Every display component already exists on the skill page. They just need to be exported and consumed by RunDetailPage.

---

## What should NOT be on a history run detail page

These are workflow actions that only belong on the live skill page, never on a read-only history view:

- Run / Re-run buttons
- Approval panel (approve/reject)
- Resolution queue
- Additional instructions editor
- "Next step" navigation links
- File restore button
- Clean dupes button
- Coverage gap / re-scan panel

A history run page is **read-only**. It answers the question: "what happened in this run?" not "what do I do next?"

---

## What SHOULD be on every history run detail page

Regardless of skill, every `/runs/:id` page should have:

- Back button
- Skill name + run date/time
- Stats: duration, tokens (in/out), cost, score
- Error message (if the run failed)
- Status badge (complete / error / retried)
- Retry count (if retries happened)
- The same output display as the skill page (coverage bar, event cards, test results, etc.)

---

*End of Screen 8. layout.md is now complete with all 8 screens.*
