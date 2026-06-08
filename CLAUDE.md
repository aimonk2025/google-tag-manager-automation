# CLAUDE.md

Notes for AI assistants and developers working in this repo.

## UNRESOLVED: local `main` has diverged from `origin/main` (as of 2026-06-08)

`main` and `origin/main` have **both moved forward from their common ancestor** and
are **not** pushed/pulled. Nothing has been discarded or force-pushed — both sides
are preserved as-is pending a reconciliation decision.

### Common ancestor (merge base)
`cbe7d55` — "Add getting started guide for new users"

### Local `main` (3 commits ahead of merge base; NOT on remote)
- `675d3eb` Migrate skills to AGENT.md and improve audit/instruction handling
- `8da9cb4` Auto-create data/ directory on first run
- `2cd08ec` Initial release - Google Tag Manager Automation Engine

Key characteristics of local `main`:
- Skills live under **`server/skills/`**
- Uses **`AGENT.md`** as the skill doc filename (renamed from `SKILL.md`)
- `server/src/execute.ts` parses audit JSON server-side from the NDJSON output log
- `server/src/routes/skill.ts` adds instruction-aware file scoping
- `app/src/pages/AuditPage.tsx` loads the audit report from DB instead of client-side stream parsing
- `app/src/components/AdditionalInstructions.tsx` UI: active-indicator dot + "Saved" confirmation

### Remote `origin/main` (8 commits ahead of merge base; NOT in local)
- `771a732` Remove security notes from README
- `5f8de3a` Remove .github/CODEOWNERS - branch protection now configured via GitHub API
- `f51ba7a` Release v2.5: add 4 utility skills and update core skills
- `03bc166` Update README to v2.0 with dynamic workspace resolution changes
- `7b06eaf` Add dynamic workspace resolution to prevent stale workspace ID errors
- `5273916` Merge branch 'main' of ...
- `09a0e79` Convert plugin to installable skills repo with npx skills add support (#1)
- `0ff7491` Convert plugin to installable skills repo with npx skills add support

Key characteristics of remote `origin/main`:
- Skills live under **top-level `skills/`** (moved out of `server/skills/`)
- Uses **`SKILL.md`** as the skill doc filename
- Added new skills: `gtm-diff`, `gtm-fix-guide`, `gtm-quickstart`, `gtm-setup`, `gtm-status`
- Richer skill content (examples/, references/, scripts/, template.md)
- Dynamic workspace resolution + installable-skills packaging (npx skills add)

### Why this is not a normal pull/push
`git merge-tree main origin/main` reports **11 conflicting paths**. The conflict is
**structural**, not textual:

1. **Directory rename vs. directory additions** — local renamed/moved
   `skills/gtm-implementation/` into `server/skills/gtm-implementation/`; remote added
   new files under `skills/gtm-implementation/` (e.g. `examples/sample.md`, `template.md`).
   Git flags these as "file location" conflicts.
2. **modify/delete on every skill doc** — local deleted `SKILL.md` (→ `AGENT.md`); remote
   modified `SKILL.md`. Affected: `skills/gtm-{analytics-audit,dom-standardization,
   implementation,reporting,setup,strategy,testing}/SKILL.md` plus
   `skills/gtm-setup/references/google-cloud-setup.md`.
3. **README.md** content conflict.

Conflicting paths (preview):
```
README.md
skills/gtm-analytics-audit/SKILL.md
skills/gtm-dom-standardization/SKILL.md
skills/gtm-implementation/SKILL.md
skills/gtm-implementation/examples/sample.md
skills/gtm-implementation/template.md
skills/gtm-reporting/SKILL.md
skills/gtm-setup/SKILL.md
skills/gtm-setup/references/google-cloud-setup.md
skills/gtm-strategy/SKILL.md
skills/gtm-testing/SKILL.md
```

### Options to resolve (decision pending)
1. **Sync to remote, discard local** — `git reset --hard origin/main`. Remote is the newer,
   richer layout; the AGENT.md migration targeted the now-obsolete `server/skills/` path.
   Re-apply wanted changes (audit parsing, UI tweaks) against the new `skills/` layout later.
2. **Merge, keep remote layout** — `git merge origin/main`, resolve conflicts favoring
   `skills/` (top-level), salvage useful local code changes, then redo AGENT.md on
   `skills/` if still desired.
3. **Force-push local over remote** — DESTRUCTIVE; discards the remote's 8 commits incl.
   the v2.5 release and new skills. Not recommended.

### Decision log
- 2026-06-08: Divergence discovered on `git push`. Decision deferred — **keep both
  branches as-is** for now. Resolve soon.
