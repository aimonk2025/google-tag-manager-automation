import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { readSession, updateSession } from '../session.js';
import { runSkill, runSkillParallel, getSkillRun, parseImplementationResult } from '../execute.js';
import { getAdapterOrDefault, ADAPTER_LIST } from '../adapters/registry.js';
import { getDb, getSessionOutput, getOAuthTokens } from '../db.js';
import { computeSkillScore, persistSkillScore, getSkillHistory } from '../services/skill.js';
import { logActivity } from '../services/activity.js';
import { computeChangedFiles } from './files.js';
import { snapshotFileTree, detectChanges } from '../services/changeDetector.js';
import { validate, RunSkillSchema, RunParallelSchema, SelectAdapterSchema, TestAdapterSchema } from '../schemas.js';

const router = Router();

// GET /api/skill/adapters — list available adapters
router.get('/adapters', (_req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM app_config WHERE key = 'adapter_type'`).get() as { value: string } | undefined;
  const activeType = row?.value ?? 'claude_code';
  res.json({ adapters: ADAPTER_LIST, activeType });
});

// POST /api/skill/adapters/test — test a specific adapter environment
router.post('/adapters/test', async (req: Request, res: Response) => {
  const body = validate(TestAdapterSchema, req, res);
  if (!body) return;
  const { type } = body;
  try {
    const adapter = getAdapterOrDefault(type);
    const result = await adapter.testEnvironment();
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, message });
  }
});

// POST /api/skill/adapters/select — save adapter preference
router.post('/adapters/select', (req: Request, res: Response) => {
  const body = validate(SelectAdapterSchema, req, res);
  if (!body) return;
  const { type } = body;
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO app_config (key, value) VALUES ('adapter_type', ?)`).run(type);
  res.json({ success: true, activeType: type });
});

// POST /api/skill/run — run a single skill via selected adapter, stream via SSE
router.post('/run', async (req: Request, res: Response) => {
  try {
  const body = validate(RunSkillSchema, req, res);
  if (!body) return;
  const { skillName, prompt, adapterType: reqAdapterType, scopedPages, pageContext } = body;

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session. Complete setup first.' });
    return;
  }

  // Concurrency lock: reject if a skill is already running for this session
  const db = getDb();
  const activeRun = db.prepare(`SELECT id, skill_name FROM skill_runs WHERE session_id = ? AND status = 'running' LIMIT 1`).get(session.id) as { id: string; skill_name: string } | undefined;
  if (activeRun) {
    res.status(409).json({ error: 'SKILL_ALREADY_RUNNING', message: `A skill is already running for this project (${activeRun.skill_name}). Wait for it to complete before starting another.` });
    return;
  }

  // Resolve adapter: request body > saved preference > default (claude_code)
  const savedAdapter = (db.prepare(`SELECT value FROM app_config WHERE key = 'adapter_type'`).get() as { value: string } | undefined)?.value;
  const resolvedAdapterType = reqAdapterType ?? savedAdapter ?? 'claude_code';

  // Read any user-defined additional instructions for this skill
  const instrRow = db.prepare('SELECT instructions FROM step_instructions WHERE skill_name = ?')
    .get(skillName) as { instructions: string } | undefined;
  const additionalInstructions = instrRow?.instructions ?? '';

  if (additionalInstructions.trim()) {
    console.log(`[${skillName}] Additional instructions active (${additionalInstructions.length} chars): "${additionalInstructions.slice(0, 120)}${additionalInstructions.length > 120 ? '...' : ''}"`);
  } else {
    console.log(`[${skillName}] No additional instructions`);
  }

  let manifest: string;
  let skillContext: string;
  let fullPrompt: string;
  // Scoped manifest — only include files relevant to this skill's scope
  manifest = buildScopedManifest(skillName, session.projectPath, session, scopedPages, additionalInstructions);
  if (skillName === 'gtm-analytics-audit') {
    const manifestLines = manifest.split('\n').filter(l => l.trim() && !l.startsWith('PROJECT') && !l.startsWith('Framework') && !l.startsWith('Source'));
    console.log(`[${skillName}] Manifest scope: ${manifestLines.length} files`);
    if (manifestLines.length <= 10) console.log(`[${skillName}] Files in scope:`, manifestLines);
  }
  // Per-skill context builder — pass additionalInstructions so audit can parse page mentions
  skillContext = buildSkillContext(skillName, session, scopedPages, additionalInstructions);
  // Structured prompt with optional additional instructions
  fullPrompt = assemblePrompt(skillName, manifest, skillContext, prompt, additionalInstructions);

  // Determine run context (first_run vs rerun)
  const isRerun = (session.completedSkills ?? []).includes(skillName);
  const runContext: 'first_run' | 'rerun' = isRerun ? 'rerun' : 'first_run';

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  let currentRunId: string | null = null;
  let sseSequence = 0;

  const send = (event: string, data: unknown) => {
    const seq = ++sseSequence;
    res.write(`id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Persist event for replay
    if (currentRunId) {
      try {
        db.prepare(`INSERT INTO sse_events (id, run_id, event_type, data, sequence_num, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
          .run(uuidv4(), currentRunId, event, JSON.stringify(data), seq);
      } catch { /* non-fatal */ }
    }
  };

  updateSession(session.id, { currentSkill: skillName });

  // Audit always runs fresh — resuming its session causes Claude to summarize from
  // memory instead of actually scanning files and returning structured JSON.
  // DOM and Implementation also run fresh — Implementation edits files directly and
  // resuming a stale session causes "No conversation found" errors.
  const FRESH_SKILLS = new Set(['gtm-analytics-audit', 'gtm-dom-standardization', 'gtm-implementation', 'gtm-testing']);
  const ownSessionId = session.skillSessions[skillName] ?? null;
  const parentSessionId = getParentSessionId(skillName, session);
  const claudeSessionId = FRESH_SKILLS.has(skillName) ? null : (ownSessionId ?? parentSessionId);

  try {
    const result = await runSkill({
      skillName,
      prompt: fullPrompt,
      projectPath: session.projectPath,
      sessionId: session.id,
      claudeSessionId,
      adapterType: resolvedAdapterType,
      runContext,
      pageContext,
      onRunId: (runId) => { currentRunId = runId; send('run_id', { runId }); },
      onChunk: (chunk) => send('chunk', { type: 'content', text: chunk }),
      onSessionId: (id) => send('chunk', { type: 'session_id', sessionId: id }),
      onActivity: (event) => send('activity', event),
      onRetry: (attempt, reason) => send('retry', { attempt, reason, maxRetries: 3 }),
      onTimeout: () => send('timeout', { message: 'Skill timed out after 10 minutes of no output. Try reducing the project scope or re-running.' }),
      onConfidenceUpdate: (signals) => send('confidence_update', signals),
    });

    // Compute quality score via service
    const score = computeSkillScore(skillName, result.outputLog, session?.compactOutputs ?? {});
    persistSkillScore(result.skillRunId, score);

    // Capture changed files at run completion time and persist to result_json
    const MODIFYING_SKILLS = new Set(['gtm-dom-standardization', 'gtm-implementation']);
    if (MODIFYING_SKILLS.has(skillName)) {
      try {
        const changedResult = computeChangedFiles(session.id, skillName);
        getDb().prepare('UPDATE skill_runs SET result_json = ? WHERE id = ?')
          .run(JSON.stringify(changedResult), result.skillRunId);
      } catch { /* non-fatal */ }
    }

    // For implementation: parse GTM creation counts from the output log and store them
    // in compact_outputs so the UI can show "Created this run" without relying on Claude
    // to format perfect JSON that then gets overwritten by the verify call.
    if (skillName === 'gtm-implementation') {
      try {
        const implResult = parseImplementationResult(result.outputLog);
        if (implResult) {
          const db2 = getDb();
          const row2 = db2.prepare('SELECT compact_outputs FROM sessions WHERE id = ?').get(session.id) as { compact_outputs: string } | undefined;
          const compact2 = row2 ? JSON.parse(row2.compact_outputs || '{}') as Record<string, unknown> : {};
          const existing2 = (compact2['gtm-implementation'] ?? {}) as Record<string, unknown>;
          compact2['gtm-implementation'] = {
            ...existing2,
            createdResources: {
              variablesCreated: implResult.variablesCreated,
              triggersCreated: implResult.triggersCreated,
              tagsCreated: implResult.tagsCreated,
              versionId: implResult.versionId,
              published: implResult.published,
            },
          };
          db2.prepare('UPDATE sessions SET compact_outputs = ? WHERE id = ?').run(JSON.stringify(compact2), session.id);
        }
      } catch { /* non-fatal */ }
    }



    send('complete', { sessionId: result.claudeSessionId, skillRunId: result.skillRunId, score, retryCount: result.retryCount });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let code = 'PROCESS_ERROR';
    if (message.includes('not found') || message.includes('ENOENT')) code = 'CLAUDE_NOT_FOUND';
    if (message.includes('auth') || message.includes('login')) code = 'CLAUDE_AUTH_REQUIRED';
    if (res.headersSent) {
      send('error', { message, code });
      res.end();
    } else {
      res.status(500).json({ error: code, message });
    }
  }
  } catch (outerErr) {
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    console.error('[skill/run] Unhandled error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  }
});

// GET /api/skill/run/:runId/stream — replay stored SSE events for a run (reconnect support)
router.get('/run/:runId/stream', (req: Request, res: Response) => {
  const { runId } = req.params;
  const lastEventId = req.headers['last-event-id'];
  const afterSeq = lastEventId ? parseInt(lastEventId as string, 10) : 0;

  const replayDb = getDb();

  // Verify run exists
  const run = replayDb.prepare('SELECT id, status FROM skill_runs WHERE id = ?').get(runId) as { id: string; status: string } | undefined;
  if (!run) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Skill run not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Replay stored events after the last received sequence
  const events = replayDb.prepare(
    'SELECT event_type, data, sequence_num FROM sse_events WHERE run_id = ? AND sequence_num > ? ORDER BY sequence_num ASC'
  ).all(runId, afterSeq) as { event_type: string; data: string; sequence_num: number }[];

  for (const ev of events) {
    res.write(`id: ${ev.sequence_num}\nevent: ${ev.event_type}\ndata: ${ev.data}\n\n`);
  }

  // If run is no longer running, close immediately after replay
  if (run.status !== 'running') {
    res.end();
    return;
  }

  // Keep connection alive with heartbeats while run is active
  const heartbeat = setInterval(() => {
    const currentRun = replayDb.prepare('SELECT status FROM skill_runs WHERE id = ?').get(runId) as { status: string } | undefined;
    if (!currentRun || currentRun.status !== 'running') {
      clearInterval(heartbeat);
      // Send any newly stored events since last replay
      const newEvents = replayDb.prepare(
        'SELECT event_type, data, sequence_num FROM sse_events WHERE run_id = ? AND sequence_num > ? ORDER BY sequence_num ASC'
      ).all(runId, events.length > 0 ? events[events.length - 1].sequence_num : afterSeq) as { event_type: string; data: string; sequence_num: number }[];
      for (const ev of newEvents) {
        res.write(`id: ${ev.sequence_num}\nevent: ${ev.event_type}\ndata: ${ev.data}\n\n`);
      }
      res.end();
    } else {
      res.write(': heartbeat\n\n');
    }
  }, 5000);

  req.on('close', () => clearInterval(heartbeat));
});

// POST /api/skill/run-parallel — fan out to N Claude workers, merge results
router.post('/run-parallel', async (req: Request, res: Response) => {
  const body = validate(RunParallelSchema, req, res);
  if (!body) return;
  const { skillName, workers } = body;

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  updateSession(session.id, { currentSkill: skillName });

  const manifest = buildProjectManifest(session.projectPath);

  const parallelDb = getDb();
  const parallelSavedAdapter = (parallelDb.prepare(`SELECT value FROM app_config WHERE key = 'adapter_type'`).get() as { value: string } | undefined)?.value;
  const parallelAdapterType = parallelSavedAdapter ?? 'claude_code';

  try {
    const results = await runSkillParallel({
      skillName,
      workers: workers.map(w => ({
        id: w.id,
        prompt: assemblePrompt(skillName, manifest, `SCOPE: Only examine files matching: ${w.scope}\n`, w.prompt),
      })),
      projectPath: session.projectPath,
      sessionId: session.id,
      adapterType: parallelAdapterType,
      onChunk: (workerId, chunk) => send('chunk', { workerId, type: 'content', text: chunk }),
      onActivity: (workerId, event) => send('activity', { workerId, ...event }),
      onWorkerComplete: (workerId, sessionId) => send('worker-complete', { workerId, sessionId }),
    });

    send('all-complete', { results });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send('error', { message });
    res.end();
  }
});

// GET /api/skill/active-run — returns the currently running skill run for the active session
router.get('/active-run', (req: Request, res: Response) => {
  const session = readSession();
  if (!session) {
    res.json({ activeRun: null });
    return;
  }
  const activeRunDb = getDb();
  const activeRun = activeRunDb.prepare(
    `SELECT id, skill_name, started_at FROM skill_runs WHERE session_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`
  ).get(session.id) as { id: string; skill_name: string; started_at: string } | undefined;
  res.json({ activeRun: activeRun ?? null });
});

// GET /api/skill/run/:runId
router.get('/run/:runId', (req: Request, res: Response) => {
  const run = getSkillRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Skill run not found' });
    return;
  }
  res.json(run);
});

// GET /api/skill/history/:skillName?sessionId=<id>&limit=10
// GET /api/skill/page-runs/:skillName — all per-page runs for a session, keyed by page_context
router.get('/page-runs/:skillName', (req: Request, res: Response) => {
  const { skillName } = req.params;
  const sessionId = req.query.sessionId as string | undefined;

  const session = readSession();
  const resolvedSessionId = sessionId ?? session?.id;
  if (!resolvedSessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId required or active session needed' });
    return;
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT page_context, output_log, input_tokens, output_tokens, cost_usd, duration_ms, status, started_at, completed_at
    FROM skill_runs
    WHERE session_id = ? AND skill_name = ? AND page_context IS NOT NULL AND status = 'complete'
    ORDER BY started_at DESC
  `).all(resolvedSessionId, skillName) as Array<{
    page_context: string;
    output_log: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    duration_ms: number;
    status: string;
    started_at: string;
    completed_at: string | null;
  }>;

  // Return latest run per page
  const byPage: Record<string, typeof rows[0]> = {};
  for (const row of rows) {
    if (!byPage[row.page_context]) byPage[row.page_context] = row;
  }

  res.json(byPage);
});

router.get('/history/:skillName', (req: Request, res: Response) => {
  const { skillName } = req.params;
  const sessionId = req.query.sessionId as string | undefined;
  const limit = parseInt((req.query.limit as string) ?? '10', 10);

  const session = readSession();
  const resolvedSessionId = sessionId ?? session?.id;
  if (!resolvedSessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId required or active session needed' });
    return;
  }

  res.json(getSkillHistory(resolvedSessionId, skillName, limit));
});

// GET /api/skill/context/gtm-implementation — return structured context preview (plain English)
router.get('/context/gtm-implementation', (req: Request, res: Response) => {
  const session = readSession();
  if (!session) { res.status(404).json({ error: 'NO_SESSION' }); return; }

  const platform = process.platform;
  const oauthTokens = platform === 'win32' ? getOAuthTokens(session.id) : null;
  const hasRefreshToken = !!(oauthTokens?.refresh_token && session.oauthCredentials);
  const hasAccessToken = !!oauthTokens?.access_token;

  const planCompact = session.compactOutputs['gtm-strategy'] as Record<string, unknown> | undefined;
  const domCompact = session.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
  const implCompact = session.compactOutputs['gtm-implementation'] as Record<string, unknown> | undefined;

  type EventItem = { name: string; priority: string; implementationMethod: string; gtmResourcesToCreate: unknown; params: string[] };
  const allEvents: EventItem[] = (planCompact?.events as EventItem[] | undefined) ?? [];
  const planSummary = planCompact?.summary as Record<string, unknown> | undefined;
  const appliedFiles: string[] = (domCompact?.appliedFiles as string[] | undefined) ?? [];

  // Previous run state
  let previousRun: Record<string, unknown> | null = null;
  let remainingEvents: EventItem[] = allEvents;
  let remainingFiles: string[] = appliedFiles;
  if (implCompact) {
    const doneEvents = (implCompact.eventsImplemented as string[] | undefined) ?? [];
    const doneFiles = (implCompact.filesEdited as string[] | undefined) ?? [];
    const gtmRes = implCompact.gtmResources as Record<string, unknown> | null | undefined;
    previousRun = { doneEvents, doneFiles, gtmRes: gtmRes ?? null };
    remainingEvents = allEvents.filter(e => !doneEvents.includes(e.name));
    remainingFiles = appliedFiles.filter(f => !doneFiles.includes(f));
  }

  res.json({
    gtmConfig: session.gtmConfig ?? null,
    platform: platform === 'win32' ? 'Windows' : 'Mac/Linux',
    auth: platform === 'win32'
      ? { hasRefreshToken, hasAccessToken, authMissing: !hasRefreshToken && !hasAccessToken }
      : { platform: 'Mac/Linux', usesCli: true },
    trackingPlan: planSummary
      ? {
          totalEvents: planSummary.totalEvents,
          p0: planSummary.p0Events,
          p1: planSummary.p1Events,
          p2: planSummary.p2Events,
        }
      : null,
    events: allEvents.map(e => ({
      name: e.name,
      priority: e.priority,
      method: e.implementationMethod,
      params: e.params,
      gtmResourcesToCreate: e.gtmResourcesToCreate ?? null,
    })),
    scopeFiles: appliedFiles,
    previousRun,
    remainingEvents: remainingEvents.map(e => ({ name: e.name, priority: e.priority, method: e.implementationMethod, params: e.params })),
    remainingFiles,
  });
});


// ---------------------------------------------------------------------------
// Phase 8: scoped manifest — only include files relevant to the current skill
// ---------------------------------------------------------------------------
function buildScopedManifest(skillName: string, projectPath: string, session: ReturnType<typeof readSession>, scopedPages?: string[], additionalInstructions?: string): string {
  // Setup and reporting don't need a file list
  if (skillName === 'gtm-reporting') {
    return `Project path: ${projectPath}\n(File scan not required for this step)`;
  }

  // Audit: if scoped pages provided via UI, only list those files
  if (skillName === 'gtm-analytics-audit') {
    if (scopedPages && scopedPages.length > 0) {
      return [
        'PROJECT FILES (incremental scan — only read these files, do not scan anything else):',
        `Files to scan: ${scopedPages.length}`,
        '',
        ...scopedPages,
      ].join('\n');
    }

    // Audit: if additional instructions restrict scope, only list matched files
    const isRestrictive = !!(additionalInstructions && /\b(only|just|focus|limit|restrict|solely|exclusively)\b/i.test(additionalInstructions));
    if (isRestrictive) {
      const allFiles = getProjectSourceFiles(projectPath);
      const scoped = extractScopedFilesFromInstructions(additionalInstructions ?? '', allFiles);
      if (scoped.length > 0) {
        return [
          'PROJECT FILES (user-restricted scope — only read these files, do not scan anything else):',
          `Files to scan: ${scoped.length}`,
          '',
          ...scoped,
        ].join('\n');
      }
    }

    return buildProjectManifest(projectPath);
  }

  // DOM step: only untracked files from audit
  if (skillName === 'gtm-dom-standardization') {
    const auditCompact = session?.compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
    const untrackedFiles = Object.keys((auditCompact?.untrackedByFile as Record<string, unknown> | undefined) ?? {});
    if (untrackedFiles.length > 0) {
      return [
        'PROJECT FILES (only files with untracked elements — do not scan others):',
        `Files to modify: ${untrackedFiles.length}`,
        '',
        ...untrackedFiles,
      ].join('\n');
    }
    return buildProjectManifest(projectPath);
  }

  // Strategy and implementation: only DOM-modified files
  if (skillName === 'gtm-strategy' || skillName === 'gtm-implementation') {
    const domCompact = session?.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
    const appliedFiles = (domCompact?.appliedFiles as string[] | undefined) ?? [];
    if (appliedFiles.length > 0) {
      return [
        'PROJECT FILES (only files modified in DOM standardization step):',
        `Files: ${appliedFiles.length}`,
        '',
        ...appliedFiles,
      ].join('\n');
    }
    return buildProjectManifest(projectPath);
  }

  // Testing: union of DOM + implementation files
  if (skillName === 'gtm-testing') {
    const domCompact = session?.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
    const implCompact = session?.compactOutputs['gtm-implementation'] as Record<string, unknown> | undefined;
    const domFiles = Array.isArray(domCompact?.appliedFiles) ? (domCompact.appliedFiles as string[]) : [];
    const implFiles = Array.isArray(implCompact?.filesEdited) ? (implCompact.filesEdited as string[]) : [];
    const allFiles = [...new Set([...domFiles, ...implFiles])];
    if (allFiles.length > 0) {
      return [
        'PROJECT FILES (only modified files — do not scan others):',
        `Files to test: ${allFiles.length}`,
        '',
        ...allFiles,
      ].join('\n');
    }
    return buildProjectManifest(projectPath);
  }

  return buildProjectManifest(projectPath);
}

// ---------------------------------------------------------------------------
// PLAN-04: session continuity chain
// DOM resumes Audit, Strategy resumes DOM, etc.
// ---------------------------------------------------------------------------
const SESSION_CHAIN: Record<string, string> = {
  // DOM starts fresh — it gets full context from buildDomContext(), not conversation memory.
  // Resuming the audit session causes Claude to think the work is "already done".
  'gtm-strategy':        'gtm-dom-standardization',
  'gtm-implementation':  'gtm-strategy',
  'gtm-testing':         'gtm-implementation',
  'gtm-reporting':       'gtm-testing',
};

function getParentSessionId(skillName: string, session: ReturnType<typeof readSession>): string | null {
  if (!session) return null;
  const parentSkill = SESSION_CHAIN[skillName];
  if (!parentSkill) return null;
  return session.skillSessions[parentSkill] ?? null;
}

// ---------------------------------------------------------------------------
// PLAN-07: pre-flight project manifest — fast Node.js scan, no Claude needed
// ---------------------------------------------------------------------------

const SOURCE_IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.cache', '__pycache__']);
const SOURCE_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.py', '.rb', '.go', '.java']);

function walkSourceFiles(projectPath: string): string[] {
  const files: string[] = [];
  function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SOURCE_IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
        files.push(path.relative(projectPath, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(projectPath);
  return files;
}

function buildProjectManifest(projectPath: string): string {
  try {
    const rawFiles = walkSourceFiles(projectPath);
    const files = rawFiles.map(rel => {
      try {
        const size = fs.statSync(path.join(projectPath, rel)).size;
        return `${rel} (${Math.round(size / 1024 * 10) / 10}KB)`;
      } catch {
        return rel;
      }
    });

    // Detect framework
    let framework = 'unknown';
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
        const deps = { ...pkg.dependencies as Record<string,string>, ...pkg.devDependencies as Record<string,string> };
        if (deps['next']) framework = 'Next.js';
        else if (deps['nuxt']) framework = 'Nuxt';
        else if (deps['@remix-run/react']) framework = 'Remix';
        else if (deps['react']) framework = 'React';
        else if (deps['vue']) framework = 'Vue';
        else if (deps['@angular/core']) framework = 'Angular';
        else if (deps['svelte']) framework = 'Svelte';
      } catch { /* ignore */ }
    }

    const lines = [
      'PROJECT MANIFEST (pre-scanned — do not re-scan the file tree):',
      `Framework: ${framework}`,
      `Source files: ${files.length}`,
      '',
      ...files.slice(0, 200), // cap at 200 files to avoid context overflow
    ];
    if (files.length > 200) lines.push(`... and ${files.length - 200} more files`);

    return lines.join('\n');
  } catch {
    return `Project path: ${projectPath}`;
  }
}

// ---------------------------------------------------------------------------
// PLAN-01: per-skill context builders
// Each skill gets exactly the fields it needs — nothing more
// ---------------------------------------------------------------------------

type AuditElement = {
  file: string; line: number; text: string;
  id: string | null; classes: string[]; tracking: boolean; recommendation: string;
};

function buildSkillContext(skillName: string, session: ReturnType<typeof readSession>, scopedPages?: string[], additionalInstructions?: string): string {
  if (!session) return '';
  switch (skillName) {
    case 'gtm-analytics-audit':   return buildAuditContext(session, scopedPages, additionalInstructions);
    case 'gtm-dom-standardization': return buildDomContext(session);
    case 'gtm-strategy':          return buildStrategyContext(session);
    case 'gtm-implementation':    return buildImplementationContext(session);
    case 'gtm-testing':           return buildTestingContext(session);
    case 'gtm-reporting':         return buildReportingContext(session);
    default:                      return '';
  }
}

function buildAuditContext(session: ReturnType<typeof readSession>, scopedPages?: string[], additionalInstructions?: string): string {
  if (!session) return '';

  const prevAudit = getSessionOutput(session.id, 'gtm-analytics-audit');
  const auditCompact = session.compactOutputs?.['gtm-analytics-audit'] as Record<string, unknown> | undefined;
  let prevScannedFiles = (auditCompact?.scannedFiles as string[] | undefined) ?? [];

  // Backfill: legacy sessions with no scannedFiles stored
  if (prevAudit && auditCompact && prevScannedFiles.length === 0) {
    prevScannedFiles = getProjectSourceFiles(session.projectPath);
    if (prevScannedFiles.length > 0) {
      const updated = { ...auditCompact, scannedFiles: prevScannedFiles };
      const db = getDb();
      const row = db.prepare('SELECT compact_outputs FROM sessions WHERE id = ?').get(session.id) as { compact_outputs: string } | undefined;
      if (row) {
        const compact = JSON.parse(row.compact_outputs || '{}') as Record<string, unknown>;
        compact['gtm-analytics-audit'] = updated;
        db.prepare('UPDATE sessions SET compact_outputs = ? WHERE id = ?').run(JSON.stringify(compact), session.id);
      }
    }
  }

  // No previous audit — full scan (or scoped scan if instructions restrict it)
  if (!prevAudit) {
    const allFiles = getProjectSourceFiles(session.projectPath);
    const instructionScoped = extractScopedFilesFromInstructions(additionalInstructions ?? '', allFiles);
    const isRestrictive = !!(additionalInstructions && /\b(only|just|focus|limit|restrict|solely|exclusively)\b/i.test(additionalInstructions));

    if (isRestrictive && instructionScoped.length > 0) {
      return [
        'CONTEXT:',
        `Project path: ${session.projectPath}`,
        '',
        'IMPORTANT: This is a fresh run. Do NOT rely on any previous conversation history or memory.',
        `The user has restricted the scope. Scan ONLY these ${instructionScoped.length} file(s) — do NOT read any other files:`,
        ...instructionScoped.map(f => `  - ${f}`),
        '',
        'Any previous audit-report.json on disk should be treated as stale and overwritten.',
      ].join('\n');
    }

    return [
      'CONTEXT:',
      `Project path: ${session.projectPath}`,
      '',
      'IMPORTANT: This is a fresh run. Do NOT rely on any previous conversation history or memory.',
      'You MUST actually read the source files now and produce a complete JSON audit.',
      'Any previous audit-report.json on disk should be treated as stale and overwritten.',
    ].join('\n');
  }

  // --- INCREMENTAL: compute what needs re-scanning ---

  const currentFiles = getProjectSourceFiles(session.projectPath);
  const prevSet = new Set(prevScannedFiles);

  // UC1/UC2: New files never seen before
  const newFiles = currentFiles.filter(f => !prevSet.has(f));

  // UC2/UC3: Files modified on disk since last audit
  // Get last audit date from the session_outputs table updated_at
  const db = getDb();
  const auditRow = db.prepare('SELECT updated_at FROM session_outputs WHERE session_id = ? AND skill_name = ?')
    .get(session.id, 'gtm-analytics-audit') as { updated_at: string } | undefined;
  const lastAuditMs = auditRow?.updated_at ? new Date(auditRow.updated_at).getTime() : 0;

  const modifiedFiles = prevScannedFiles.filter(f => {
    try {
      const full = path.join(session.projectPath, f);
      const mtime = fs.statSync(full).mtimeMs;
      return mtime > lastAuditMs;
    } catch { return false; }
  });

  // UC6/UC7: Files that were scanned before but no longer exist — remove from report
  const deletedFiles = prevScannedFiles.filter(f => {
    try { fs.statSync(path.join(session.projectPath, f)); return false; } catch { return true; }
  });

  // UC4: Additional instructions mention specific pages/files — parse them out
  const instructionScoped = extractScopedFilesFromInstructions(additionalInstructions ?? '', currentFiles);
  const isRestrictive = !!(additionalInstructions && /\b(only|just|focus|limit|restrict|solely|exclusively)\b/i.test(additionalInstructions));

  // UC4: Explicit scopedPages from frontend (e.g. user picks pages in UI)
  const explicitScoped = (scopedPages ?? []).flatMap(page =>
    currentFiles.filter(f => {
      const norm = f.toLowerCase();
      const p = page.toLowerCase().replace(/^\//, '');
      return norm.includes(p) || norm.includes(p.replace(/\//g, path.sep.toLowerCase()));
    })
  );

  // If user is restricting scope, only scan exactly those files — ignore new/modified outside that scope
  const toRescan = isRestrictive && (instructionScoped.length > 0 || explicitScoped.length > 0)
    ? [...new Set([...instructionScoped, ...explicitScoped])]
    : [...new Set([...newFiles, ...modifiedFiles, ...instructionScoped, ...explicitScoped])];

  // Apply deleted files: remove their elements from the baseline before returning
  const patchedAudit = deletedFiles.length > 0
    ? removeDeletedFilesFromAudit(prevAudit as Record<string, unknown>, deletedFiles)
    : prevAudit;

  if (toRescan.length === 0 && deletedFiles.length === 0) {
    // UC1 result: nothing to do — audit is current
    return [
      'CONTEXT: NO NEW FILES',
      `Project path: ${session.projectPath}`,
      '',
      'All source files in this project were already covered by the previous audit.',
      'No files have been added, modified, or deleted since the last audit.',
      'Return the baseline audit JSON below EXACTLY as-is — do not modify it, do not re-scan anything.',
      '',
      'BASELINE AUDIT (return this unchanged):',
      '```json',
      JSON.stringify(patchedAudit),
      '```',
    ].join('\n');
  }

  if (toRescan.length === 0 && deletedFiles.length > 0) {
    // Only deletions — return patched audit with removed files, no scan needed
    return [
      'CONTEXT: NO NEW FILES',
      `Project path: ${session.projectPath}`,
      '',
      `${deletedFiles.length} file(s) were removed from the project since the last audit. Their elements have been removed from the baseline.`,
      'Return the baseline audit JSON below EXACTLY as-is — do not modify it, do not re-scan anything.',
      '',
      'BASELINE AUDIT (return this unchanged):',
      '```json',
      JSON.stringify(patchedAudit),
      '```',
    ].join('\n');
  }

  // Build reason annotations for transparency
  const reasons: string[] = [];
  if (newFiles.length) reasons.push(`${newFiles.length} new file(s) added to project`);
  if (modifiedFiles.length) reasons.push(`${modifiedFiles.length} file(s) modified since last audit`);
  if (instructionScoped.length) reasons.push(`${instructionScoped.length} file(s) mentioned in additional instructions`);
  if (explicitScoped.length) reasons.push(`${explicitScoped.length} file(s) from explicit page scope`);
  if (deletedFiles.length) reasons.push(`${deletedFiles.length} file(s) deleted (removed from baseline)`);

  return [
    'CONTEXT: INCREMENTAL MODE — TARGETED RESCAN',
    `Project path: ${session.projectPath}`,
    '',
    `Re-scan reason(s): ${reasons.join('; ')}`,
    '',
    `Scan ONLY these ${toRescan.length} file(s). Do NOT read or re-scan any other file.`,
    ...toRescan.map(f => `  - ${f}`),
    '',
    'After scanning, merge results into the baseline:',
    '  - Replace elements from re-scanned files with freshly found elements',
    '  - Keep all elements from files NOT in the list above unchanged',
    '  - Recalculate summary totals',
    '  - Update metadata.filesScannedList to include the newly scanned files',
    '',
    'BASELINE AUDIT:',
    '```json',
    JSON.stringify(patchedAudit),
    '```',
  ].join('\n');
}

/**
 * Removes elements belonging to deleted files from the audit report.
 * Returns a new report object with updated counts.
 */
function removeDeletedFilesFromAudit(report: Record<string, unknown>, deletedFiles: string[]): Record<string, unknown> {
  const deletedSet = new Set(deletedFiles.map(f => f.replace(/\\/g, '/').toLowerCase()));
  const categorized = report.categorized as Record<string, {
    total: number; tracked: number; untracked: number;
    elements?: Array<{ file: string; tracking: boolean }>;
  }> | undefined;
  if (!categorized) return report;

  const patched = JSON.parse(JSON.stringify(report)) as typeof report;
  const patchedCat = patched.categorized as typeof categorized;

  for (const cat of Object.values(patchedCat ?? {})) {
    if (!cat.elements) continue;
    const before = cat.elements.length;
    cat.elements = cat.elements.filter(el => {
      const f = (el.file ?? '').replace(/\\/g, '/').toLowerCase();
      return !deletedSet.has(f) && ![...deletedSet].some(d => f.endsWith(d) || d.endsWith(f));
    });
    const removed = before - cat.elements.length;
    if (removed > 0) {
      cat.total = Math.max(0, cat.total - removed);
      cat.tracked = cat.elements.filter(e => e.tracking).length;
      cat.untracked = cat.elements.filter(e => !e.tracking).length;
    }
  }

  // Recalculate summary
  let totalTracked = 0, totalUntracked = 0;
  for (const cat of Object.values(patchedCat ?? {})) {
    totalTracked += cat.tracked ?? 0;
    totalUntracked += cat.untracked ?? 0;
  }
  const total = totalTracked + totalUntracked;
  const pct = total > 0 ? Math.round((totalTracked / total) * 100) : 0;
  const summary = patched.summary as Record<string, unknown> | undefined;
  if (summary) {
    summary.totalClickableElements = total;
    summary.withTracking = totalTracked;
    summary.withoutTracking = totalUntracked;
    summary.analyticsReadiness = `${pct}%`;
    summary.coveragePercent = pct;
  }

  return patched;
}

/**
 * Parses additional instructions text for page names or file path hints.
 * Maps them to actual files in the project.
 */
function extractScopedFilesFromInstructions(instructions: string, currentFiles: string[]): string[] {
  if (!instructions.trim()) return [];

  // Extract quoted strings, path-like tokens, and words after "rescan"/"re-scan"/"scan"/"check"
  const tokens = new Set<string>();

  // Quoted strings: "pricing page", 'checkout'
  for (const m of instructions.matchAll(/["']([^"']+)["']/g)) tokens.add(m[1].toLowerCase());

  // URL/route paths: /tag-manager-engine, /pricing, /about/team etc.
  for (const m of instructions.matchAll(/\/([a-z0-9][a-z0-9\-_\/]*)/gi)) tokens.add(m[1].toLowerCase());

  // Words after scan/rescan/check keywords
  for (const m of instructions.matchAll(/(?:re-?scan|check|audit|scan)\s+(?:the\s+)?([a-z0-9\/\-_]+(?:\s+(?:and|page|pages)\s+[a-z0-9\/\-_]+)*)/gi)) {
    m[1].split(/\s+(?:and|,)\s+/).forEach(p => tokens.add(p.toLowerCase().replace(/\s+page[s]?$/, '')));
  }

  // File path fragments: anything containing / or .tsx/.ts/.jsx
  for (const m of instructions.matchAll(/([a-z0-9\/\-_.]+\.(?:tsx|ts|jsx|js|vue))/gi)) tokens.add(m[1].toLowerCase());

  if (tokens.size === 0) return [];

  // Match tokens against current files
  const matched = new Set<string>();
  for (const token of tokens) {
    const norm = token.replace(/\s+/g, '').replace(/-/g, '');
    for (const f of currentFiles) {
      const fn = f.toLowerCase().replace(/\\/g, '/');
      const fnNorm = fn.replace(/[-_]/g, '');
      if (fn.includes(token) || fnNorm.includes(norm) ||
          path.basename(fn, path.extname(fn)).replace(/[-_]/g, '') === norm) {
        matched.add(f);
      }
    }
  }

  return [...matched];
}

function getProjectSourceFiles(projectPath: string): string[] {
  try {
    return walkSourceFiles(projectPath).slice(0, 200);
  } catch {
    return [];
  }
}

function buildDomContext(session: ReturnType<typeof readSession>): string {
  if (!session) return '';

  const compact = session.compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
  if (!compact) return `CONTEXT:\nProject path: ${session.projectPath}`;

  const summary = compact.summary as Record<string, unknown> | undefined;
  const metadata = compact.metadata as Record<string, unknown> | undefined;
  const untrackedByFile = compact.untrackedByFile as Record<string, AuditElement[]> | undefined;

  const lines: string[] = [
    'CONTEXT:',
    `Framework: ${metadata?.framework ?? 'unknown'}`,
    `Audit found: ${summary?.withoutTracking ?? '?'} untracked elements across ${Object.keys(untrackedByFile ?? {}).length} files`,
    '',
    'SCOPE:',
    'Only read and modify the files listed below.',
    'Do not open, scan, or change any other file.',
    '',
  ];

  for (const [file, elements] of Object.entries(untrackedByFile ?? {})) {
    lines.push(`File: ${file}`);
    for (const el of elements) {
      const currentId = el.id ? `id="${el.id}"` : 'no id';
      const currentClasses = el.classes.length > 0 ? `class="${el.classes.join(' ')}"` : 'no classes';
      lines.push(`  Line ${el.line}: "${el.text}" — ${currentId}, ${currentClasses}`);
      lines.push(`  Action: ${el.recommendation}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildStrategyContext(session: ReturnType<typeof readSession>): string {
  if (!session) return '';
  const lines: string[] = ['CONTEXT:'];

  const auditCompact = session.compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
  if (auditCompact) {
    const summary = auditCompact.summary as Record<string, unknown> | undefined;
    const metadata = auditCompact.metadata as Record<string, unknown> | undefined;
    const catSummary = auditCompact.catSummary as Array<{ cat: string; untracked: number }> | undefined;
    const existingTracking = auditCompact.existingTracking as { libraries?: string[] } | null | undefined;
    const topRecs = auditCompact.topRecommendations as Array<{ priority: string; action: string }> | undefined;

    lines.push(`Framework: ${metadata?.framework ?? 'unknown'}, ${metadata?.filesScanned ?? '?'} files scanned`);
    lines.push(`Coverage: ${summary?.analyticsReadiness ?? '?'} — ${summary?.withTracking ?? '?'} tracked, ${summary?.withoutTracking ?? '?'} gaps out of ${summary?.totalClickableElements ?? '?'} elements`);

    if (catSummary?.length) {
      lines.push(`Gap categories: ${catSummary.map(c => `${c.cat}: ${c.untracked} untracked`).join(', ')}`);
    }
    if (existingTracking?.libraries?.length) {
      lines.push(`Existing tracking: ${existingTracking.libraries.join(', ')}`);
    }
    if (topRecs?.length) {
      lines.push('Top recommendations from audit:');
      for (const rec of topRecs) lines.push(`  [${rec.priority}] ${rec.action}`);
    }
  }

  const domCompact = session.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
  if (domCompact) {
    const pageResults = domCompact.pageResults as Array<{ page: string; elementsFixed: number; filesModified: string[] }> | undefined;
    const appliedFiles = domCompact.appliedFiles as string[] | undefined;
    if (pageResults?.length) {
      lines.push(`DOM standardization resolved ${pageResults.length} page(s):`);
      for (const pr of pageResults) {
        lines.push(`  ${pr.page}: ${pr.elementsFixed} element(s) fixed in ${pr.filesModified.map(f => path.basename(f)).join(', ')}`);
      }
    } else if (appliedFiles?.length) {
      lines.push(`DOM standardization applied to: ${appliedFiles.map(f => path.basename(f)).join(', ')}`);
    }
  }

  lines.push('');
  lines.push('SCOPE:');
  lines.push('Do not read source files. Use the audit findings above as your input.');
  lines.push('Produce a tracking plan JSON only — no codebase scanning required.');

  return lines.join('\n');
}


function buildImplementationContext(session: ReturnType<typeof readSession>): string {
  if (!session) return '';
  const lines: string[] = ['CONTEXT:'];

  if (session.gtmConfig) {
    lines.push(`GTM Account ID: ${session.gtmConfig.accountId}`);
    lines.push(`GTM Container ID: ${session.gtmConfig.containerId}`);
  }

  // On Windows: provide OAuth credentials for GTM API calls via googleapis
  // Pass refresh_token + client credentials always — googleapis auto-refreshes expired access tokens.
  const platform = process.platform;
  if (platform === 'win32') {
    lines.push('Platform: Windows');
    const oauthTokens = getOAuthTokens(session.id);
    const hasCredentials = oauthTokens?.refresh_token && session.oauthCredentials;
    if (hasCredentials) {
      if (oauthTokens!.access_token) lines.push(`GTM OAuth Access Token: ${oauthTokens!.access_token}`);
      lines.push(`GTM OAuth Refresh Token: ${oauthTokens!.refresh_token}`);
      lines.push(`GTM OAuth Client ID: ${session.oauthCredentials!.clientId}`);
      lines.push(`GTM OAuth Client Secret: ${session.oauthCredentials!.clientSecret}`);
    } else if (oauthTokens?.access_token) {
      // Has access token but no refresh token — pass it and hope it hasn't expired
      lines.push(`GTM OAuth Access Token: ${oauthTokens.access_token}`);
      if (session.oauthCredentials) {
        lines.push(`GTM OAuth Client ID: ${session.oauthCredentials.clientId}`);
        lines.push(`GTM OAuth Client Secret: ${session.oauthCredentials.clientSecret}`);
      }
    } else {
      lines.push('GTM_AUTH_MISSING: No OAuth credentials found. Skip GTM API steps — user must authenticate in Setup first.');
    }
  } else {
    lines.push('Platform: Mac/Linux');
  }

  // Read pre-computed compact tracking plan from DB
  const planCompact = session.compactOutputs['gtm-strategy'] as Record<string, unknown> | undefined;
  let allEvents: Array<{ name: string; priority: string; implementationMethod: string; gtmResourcesToCreate: unknown; params: string[] }> = [];

  if (planCompact) {
    const summary = planCompact.summary as Record<string, unknown> | undefined;
    const events = planCompact.events as Array<{ name: string; priority: string; implementationMethod: string; gtmResourcesToCreate: unknown; params: string[] }> | undefined;
    lines.push(`Tracking plan: ${summary?.totalEvents ?? '?'} events (P0: ${summary?.p0Events ?? '?'}, P1: ${summary?.p1Events ?? '?'}, P2: ${summary?.p2Events ?? '?'})`);
    allEvents = events ?? [];
  }

  // Read pre-computed compact DOM output from DB — only files that need dataLayer events
  const domCompact = session.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
  const appliedFiles: string[] = (domCompact?.appliedFiles as string[] | undefined) ?? [];

  // Check if a previous implementation run exists — inject what was done and what remains
  const implCompact = session.compactOutputs['gtm-implementation'] as Record<string, unknown> | undefined;
  if (implCompact) {
    const doneEvents = (implCompact.eventsImplemented as string[] | undefined) ?? [];
    const doneFiles = (implCompact.filesEdited as string[] | undefined) ?? [];
    const gtmRes = implCompact.gtmResources as Record<string, unknown> | null | undefined;

    lines.push('');
    lines.push('PREVIOUS RUN — already complete, do NOT re-implement:');
    if (doneEvents.length > 0) {
      lines.push(`  Events already implemented: ${doneEvents.join(', ')}`);
    }
    if (doneFiles.length > 0) {
      lines.push('  Source files already modified:');
      for (const f of doneFiles) lines.push(`    ${f}`);
    }
    if (gtmRes) {
      const parts: string[] = [];
      if (gtmRes.variablesCreated) parts.push(`${gtmRes.variablesCreated} variables`);
      if (gtmRes.triggersCreated) parts.push(`${gtmRes.triggersCreated} triggers`);
      if (gtmRes.tagsCreated) parts.push(`${gtmRes.tagsCreated} tags`);
      if (parts.length > 0) lines.push(`  GTM resources already created: ${parts.join(', ')}${gtmRes.published ? ` (published as version ${gtmRes.versionId})` : ' (not yet published)'}`);
    }

    const remainingEvents = allEvents.filter(e => !doneEvents.includes(e.name));
    const remainingFiles = appliedFiles.filter(f => !doneFiles.includes(f));

    lines.push('');
    if (remainingEvents.length > 0) {
      lines.push('REMAINING WORK — implement only these:');
      for (const ev of remainingEvents) {
        lines.push(`  [${ev.priority}] ${ev.name} — method: ${ev.implementationMethod}, params: ${ev.params.join(', ')}`);
        if (ev.gtmResourcesToCreate) lines.push(`    gtmResourcesToCreate: ${JSON.stringify(ev.gtmResourcesToCreate)}`);
      }
    } else {
      lines.push('REMAINING WORK — all events already implemented. Only re-publish GTM if requested.');
    }

    if (remainingFiles.length > 0) {
      lines.push('');
      lines.push('SCOPE — only edit these files (not yet modified):');
      for (const f of remainingFiles) lines.push(`  ${f}`);
    } else if (appliedFiles.length > 0) {
      lines.push('');
      lines.push('SCOPE — all scoped files already modified. No source file edits needed unless adding remaining events above.');
    }
  } else {
    // First run — show all events and full file scope
    if (allEvents.length > 0) {
      lines.push('Events to implement:');
      for (const ev of allEvents) {
        lines.push(`  [${ev.priority}] ${ev.name} — method: ${ev.implementationMethod}, params: ${ev.params.join(', ')}`);
        if (ev.gtmResourcesToCreate) lines.push(`    gtmResourcesToCreate: ${JSON.stringify(ev.gtmResourcesToCreate)}`);
      }
    }

    if (appliedFiles.length > 0) {
      lines.push('');
      lines.push('SCOPE:');
      lines.push('Only add dataLayer events to these files (already standardized in DOM step):');
      for (const f of appliedFiles) lines.push(`  ${f}`);
      lines.push('Do not modify any other files.');
    }
  }

  return lines.join('\n');
}

function buildTestingContext(session: ReturnType<typeof readSession>): string {
  if (!session) return '';
  const lines: string[] = ['CONTEXT:'];

  // P0 events from compact tracking plan in DB
  const planCompact = session.compactOutputs['gtm-strategy'] as Record<string, unknown> | undefined;
  if (planCompact) {
    const events = planCompact.events as Array<{ name: string; priority: string }> | undefined;
    const p0 = events?.filter(e => e.priority === 'P0') ?? [];
    if (p0.length > 0) {
      lines.push('P0 events to verify (highest priority):');
      for (const ev of p0) lines.push(`  ${ev.name}`);
    }
  }

  // Only test files that were actually modified — read from compact outputs in DB
  const modifiedFiles: string[] = [];

  const domCompact = session.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
  const implCompact = session.compactOutputs['gtm-implementation'] as Record<string, unknown> | undefined;

  const domFiles = Array.isArray(domCompact?.appliedFiles) ? (domCompact.appliedFiles as string[]) : [];
  domFiles.forEach(f => modifiedFiles.push(f));

  const implFiles = Array.isArray(implCompact?.filesEdited) ? (implCompact.filesEdited as string[]) : [];
  implFiles.forEach(f => { if (!modifiedFiles.includes(f)) modifiedFiles.push(f); });

  if (modifiedFiles.length > 0) {
    lines.push('');
    lines.push('SCOPE:');
    lines.push('Only test these modified files:');
    for (const f of modifiedFiles) lines.push(`  ${f}`);
  }

  // GTM verification ground truth — read from compact_outputs in DB
  const gtmResources = implCompact?.gtmResources as {
    tagsFound?: number;
    triggersFound?: number;
    variablesFound?: number;
    containerName?: string;
    error?: string | null;
  } | undefined;

  if (
    gtmResources &&
    typeof gtmResources.tagsFound === 'number' &&
    (gtmResources.tagsFound > 0 || (gtmResources.triggersFound ?? 0) > 0)
  ) {
    lines.push('');
    lines.push('GTM VERIFICATION (confirmed in container post-implementation):');
    lines.push(`  Container: ${gtmResources.containerName ?? 'unknown'}`);
    lines.push(`  Tags: ${gtmResources.tagsFound}`);
    lines.push(`  Triggers: ${gtmResources.triggersFound ?? 0}`);
    lines.push(`  Variables: ${gtmResources.variablesFound ?? 0}`);
    lines.push('Treat these counts as ground truth when validating GTM state.');
  }

  return lines.join('\n');
}

function buildReportingContext(session: ReturnType<typeof readSession>): string {
  if (!session) return '';
  const lines: string[] = [
    'CONTEXT:',
    'Pipeline completion summary for reporting:',
  ];

  // Read all compact outputs from DB — counts and statuses only, no element lists
  const auditC = session.compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
  const domC = session.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
  const planC = session.compactOutputs['gtm-strategy'] as Record<string, unknown> | undefined;
  const implC = session.compactOutputs['gtm-implementation'] as Record<string, unknown> | undefined;
  const testsC = session.compactOutputs['gtm-testing'] as Record<string, unknown> | undefined;

  if (auditC) {
    const s = auditC.summary as Record<string, unknown> | undefined;
    const m = auditC.metadata as Record<string, unknown> | undefined;
    lines.push(`Audit: ${s?.totalClickableElements ?? '?'} elements, ${s?.analyticsReadiness ?? '?'} coverage, framework: ${m?.framework ?? 'unknown'}`);
  }

  if (domC) {
    lines.push(`DOM standardization: ${domC.appliedCount ?? '?'} files modified`);
  }

  if (planC) {
    const s = planC.summary as Record<string, unknown> | undefined;
    lines.push(`Tracking plan: ${s?.totalEvents ?? '?'} events (P0: ${s?.p0Events ?? '?'}, P1: ${s?.p1Events ?? '?'}, P2: ${s?.p2Events ?? '?'})`);
  }

  if (implC) {
    lines.push('Implementation: complete');
  }

  if (testsC) {
    lines.push(`Testing: ${testsC.passed ?? '?'} passed, ${testsC.failed ?? 0} failed`);
  }

  lines.push('');
  lines.push('SCOPE:');
  lines.push('Generate a markdown report from the summary above. Do not re-read source files.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// PLAN-02: structured prompt assembly with CONTEXT / SCOPE / TASK / OUTPUT blocks
// PLAN-05: token budget per skill
// ---------------------------------------------------------------------------

// Default task prompts for skills that have backend-owned instructions.
// These are used when the frontend sends no task prompt (or an empty one).
const DEFAULT_TASK_PROMPTS: Record<string, string> = {
  'gtm-implementation': `Complete ALL of the following steps in order. Do not skip any step.

STEP 1 - Edit source files: Add dataLayer.push() calls to the files in SCOPE following the tracking plan events exactly.

STEP 2 - Create GTM objects: Using the credentials in CONTEXT, create in the GTM container:
  - One dataLayer variable per event parameter listed in the tracking plan
  - One custom event trigger per event
  - One GA4 event tag per event, firing on its trigger
  On Windows: use the googleapis GTM REST API (tagmanager.accounts.containers.workspaces.*) with the OAuth token provided. Write and run a Node.js script via Bash to make the API calls.
  On Mac/Linux: use @owntag/gtm-cli (gtm variables create, gtm triggers create, gtm tags create).
  IMPORTANT: If CONTEXT contains "GTM_AUTH_MISSING", skip STEP 2 and note it in the summary.

STEP 3 - Publish: Create a new container version and publish it.

STEP 4 - Output a JSON summary: { "filesModified": N, "eventsImplemented": [...], "gtmResources": { "variablesCreated": N, "triggersCreated": N, "tagsCreated": N, "versionId": "...", "published": true/false } }`,
};

const OUTPUT_BUDGETS: Record<string, string> = {
  'gtm-analytics-audit':      'Return a JSON object matching the AuditReport schema, followed by a brief prose summary (max 300 words).',
  'gtm-dom-standardization':  'Return only file diffs in unified diff format. No prose. No explanations.',
  'gtm-strategy':             'Return a single JSON object matching the TrackingPlan schema. No prose outside the JSON.',
  'gtm-implementation':       'Return a JSON summary object: { "filesModified": N, "eventsImplemented": [...], "gtmResources": { "variablesCreated": N, "triggersCreated": N, "tagsCreated": N, "versionId": "...", "published": true/false } }. No prose outside the JSON.',
  'gtm-testing':              'Return a JSON object with fields: passed, failed, events (array of {name, status, notes}). No prose.',
  'gtm-reporting':            'Return a markdown report. Max 1500 words.',
};

function assemblePrompt(skillName: string, manifest: string, skillContext: string, taskPrompt: string, additionalInstructions?: string): string {
  const outputFormat = OUTPUT_BUDGETS[skillName] ?? 'Return structured output relevant to the task.';
  // Use backend-owned default if frontend sent no/empty task prompt
  const resolvedTaskPrompt = taskPrompt?.trim() ? taskPrompt : (DEFAULT_TASK_PROMPTS[skillName] ?? taskPrompt);

  const manifestSection = skillName === 'gtm-analytics-audit'
    ? `PROJECT FILES (scan these for tracking elements):\n${manifest}`
    : `PROJECT FILES (reference only — do not re-scan unless scoped below):\n${manifest}`;

  const sections = [
    manifestSection,
    '',
    skillContext,
    '',
    'TASK:',
    resolvedTaskPrompt,
  ];

  if (additionalInstructions?.trim()) {
    sections.push('');
    sections.push('ADDITIONAL INSTRUCTIONS (from user):');
    sections.push(additionalInstructions.trim());
  }

  sections.push('');
  sections.push('OUTPUT FORMAT:');
  sections.push(outputFormat);

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Systems-thinking: element resolution queue endpoints
// ---------------------------------------------------------------------------

// POST /api/skill/resolve-element
// Queues an element for resolution. Returns a resolutionId immediately.
// The actual Claude run is triggered separately by the frontend via /api/skill/run.
router.post('/resolve-element', (req: Request, res: Response) => {
  const { sessionId, elementId, elementType, elementContext } = req.body as {
    sessionId?: string;
    elementId?: string;
    elementType?: string;
    elementContext?: { selector: string; page: string; description: string; file: string };
  };

  if (!sessionId || !elementId || !elementType || !elementContext) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'sessionId, elementId, elementType, and elementContext are required' });
    return;
  }

  const db = getDb();
  const sessionRow = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId) as { id: string } | undefined;
  if (!sessionRow) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found` });
    return;
  }

  const resolutionId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO element_resolutions (id, session_id, element_id, element_type, element_context, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(resolutionId, sessionId, elementId, elementType, JSON.stringify(elementContext), now);

  res.json({ resolutionId, status: 'queued' });
});

// GET /api/skill/resolution-queue?sessionId=<id>
// Returns all element_resolutions for the session, ordered by created_at DESC.
router.get('/resolution-queue', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId query param required' });
    return;
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM element_resolutions
    WHERE session_id = ?
    ORDER BY created_at DESC
  `).all(sessionId) as Array<{
    id: string;
    session_id: string;
    element_id: string;
    element_type: string;
    element_context: string;
    status: string;
    resolution_output: string | null;
    created_at: string;
    resolved_at: string | null;
  }>;

  const resolutions = rows.map(r => ({
    ...r,
    element_context: (() => { try { return JSON.parse(r.element_context); } catch { return r.element_context; } })(),
  }));

  res.json({ resolutions });
});

// PATCH /api/skill/resolution/:id/skip
// Marks a resolution as skipped.
router.patch('/resolution/:id/skip', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();

  const row = db.prepare('SELECT id FROM element_resolutions WHERE id = ?').get(id) as { id: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: `Resolution ${id} not found` });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE element_resolutions SET status = 'skipped', resolved_at = ? WHERE id = ?
  `).run(now, id);

  res.json({ id, status: 'skipped', resolved_at: now });
});

// GET /api/skill/codebase-drift?sessionId=<id>
// Compares current file tree against stored snapshot from last audit.
router.get('/codebase-drift', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId query param required' });
    return;
  }

  const db = getDb();
  const row = db.prepare('SELECT project_path, file_tree_snapshot, updated_at FROM sessions WHERE id = ?').get(sessionId) as {
    project_path: string;
    file_tree_snapshot: string | null;
    updated_at: string;
  } | undefined;

  if (!row) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    return;
  }

  if (!row.file_tree_snapshot) {
    // No snapshot yet - no audit has run, no drift to report
    res.json({ hasChanges: false, newFiles: [], removedFiles: [], totalNew: 0, totalRemoved: 0, lastAuditDate: null });
    return;
  }

  let storedSnapshot: string[] = [];
  try {
    storedSnapshot = JSON.parse(row.file_tree_snapshot) as string[];
  } catch {
    res.json({ hasChanges: false, newFiles: [], removedFiles: [], totalNew: 0, totalRemoved: 0, lastAuditDate: null });
    return;
  }

  const result = detectChanges(row.project_path, storedSnapshot);
  res.json({ ...result, lastAuditDate: row.updated_at });
});

// PATCH /api/skill/acknowledge-drift?sessionId=<id>
// Marks drift as acknowledged so the warning banner is dismissed.
router.patch('/acknowledge-drift', (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId ?? req.body?.sessionId) as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId required' });
    return;
  }

  const db = getDb();
  const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId) as { id: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    return;
  }

  db.prepare('UPDATE sessions SET drift_acknowledged = 1 WHERE id = ?').run(sessionId);
  res.json({ success: true });
});

export default router;
