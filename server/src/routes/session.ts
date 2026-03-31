import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  readSession,
  createSession,
  updateSession,
  resetSession,
  markSkillComplete,
  listSessions,
  activateSession,
  deleteSession,
  patchAuditReportAfterResolve,
} from '../session.js';
import { getDb, getSessionOutput } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { validate, CreateSessionSchema, PatchSessionSchema, SkillCompleteSchema, ValidatePathSchema } from '../schemas.js';
import { logActivity } from '../services/activity.js';

const router = Router();

// GET /api/session - get current active session
router.get('/', (_req: Request, res: Response) => {
  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session found' });
    return;
  }
  res.json(session);
});

// GET /api/session/output/:skillName - get full skill output from session_outputs table
router.get('/output/:skillName', (req: Request, res: Response) => {
  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session found' });
    return;
  }
  const { skillName } = req.params;
  const output = getSessionOutput(session.id, skillName);
  if (output === null) {
    res.status(404).json({ error: 'NOT_FOUND', message: `No output found for skill: ${skillName}` });
    return;
  }
  res.json(output);
});

// POST /api/session - create a new project session (always creates new)
router.post('/', (req: Request, res: Response) => {
  const body = validate(CreateSessionSchema, req, res);
  if (!body) return;

  const { projectPath, gtmConfig, name, forceNew } = body;

  // Validate path exists
  if (!fs.existsSync(projectPath)) {
    res.status(400).json({ error: 'INVALID_PATH', message: `Path does not exist: ${projectPath}` });
    return;
  }

  const stat = fs.statSync(projectPath);
  if (!stat.isDirectory()) {
    res.status(400).json({ error: 'INVALID_PATH', message: 'Path must be a directory' });
    return;
  }

  const existing = readSession();

  // forceNew=true or no existing session: always create a new project
  if (!existing || forceNew) {
    const session = createSession(projectPath, gtmConfig?.accountId, gtmConfig?.containerId, name);
    logActivity(session.id, 'session.created', 'session', session.id, { name: session.name, projectPath });
    res.status(201).json(session);
  } else {
    // Update the current active session's config (e.g. adding GTM credentials)
    const updated = updateSession(existing.id, {
      projectPath,
      name: name ?? existing.name,
      gtmConfig: gtmConfig ?? existing.gtmConfig,
    });
    res.json(updated);
  }
});

// PATCH /api/session - update current session fields (name, gtmConfig, etc.)
router.patch('/', (req: Request, res: Response) => {
  const body = validate(PatchSessionSchema, req, res);
  if (!body) return;

  const { name, gtmConfig, oauthCredentials } = body;

  const existing = readSession();
  if (!existing) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  const updated = updateSession(existing.id, {
    ...(name !== undefined && { name }),
    ...(gtmConfig !== undefined && { gtmConfig }),
    ...(oauthCredentials !== undefined && { oauthCredentials }),
  });
  res.json(updated);
});

// DELETE /api/session/:id - delete a project
// Query param: ?restoreFiles=true — restore modified files from snapshots before deleting
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const restoreFiles = req.query.restoreFiles === 'true';

  if (restoreFiles) {
    // Restore all snapshotted files before deleting
    const db = getDb();
    const snapshots = db.prepare(
      'SELECT file_path, original_content FROM file_snapshots WHERE session_id = ?'
    ).all(id) as Array<{ file_path: string; original_content: string }>;

    let restoredCount = 0;
    for (const snap of snapshots) {
      try {
        fs.writeFileSync(snap.file_path, snap.original_content, 'utf-8');
        restoredCount++;
      } catch { /* non-fatal — file may have been deleted */ }
    }

    deleteSession(id);
    res.json({ success: true, restoredFiles: restoredCount });
    return;
  }

  deleteSession(id);
  res.json({ success: true });
});

// GET /api/session/:id/snapshot-summary — check if a session has file snapshots (used before delete)
router.get('/:id/snapshot-summary', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM file_snapshots WHERE session_id = ?`).get(id) as { cnt: number };
  res.json({ hasSnapshots: row.cnt > 0, fileCount: row.cnt });
});

// GET /api/session/browse - list drives or subdirectories for folder picker
router.get('/browse', (req: Request, res: Response) => {
  const inputPath = req.query.path as string | undefined;

  // If no path given, return Windows drives (or root on Unix)
  if (!inputPath) {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // Return common Windows drives
      const drives: string[] = [];
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const drivePath = `${letter}:\\`;
        if (fs.existsSync(drivePath)) {
          drives.push(drivePath);
        }
      }
      res.json({ path: null, parent: null, entries: drives.map(d => ({ name: d, path: d, isDirectory: true })) });
    } else {
      res.json({ path: '/', parent: null, entries: [{ name: '/', path: '/', isDirectory: true }] });
    }
    return;
  }

  const normalized = path.resolve(inputPath);

  if (!fs.existsSync(normalized)) {
    res.status(404).json({ error: 'PATH_NOT_FOUND', message: `Path does not exist: ${normalized}` });
    return;
  }

  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    res.status(400).json({ error: 'NOT_A_DIRECTORY', message: 'Path is not a directory' });
    return;
  }

  try {
    const entries = fs.readdirSync(normalized, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(normalized, e.name),
        isDirectory: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = path.dirname(normalized);
    const parent = parentPath !== normalized ? parentPath : null;

    res.json({ path: normalized, parent, entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'READ_FAILED', message });
  }
});

// Directories to exclude from file counting and skill scanning
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'vendor',
  'coverage', '.cache', '.turbo', 'out', '.output', '__pycache__',
  '.venv', 'venv', 'env', '.env', 'target', 'bin', 'obj',
]);

function countFilesExcluding(dirPath: string): { count: number; excludedDirs: string[] } {
  let count = 0;
  const excludedFound: Set<string> = new Set();

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          excludedFound.add(entry.name);
        } else {
          walk(path.join(dir, entry.name));
        }
      } else {
        count++;
      }
    }
  }

  walk(dirPath);
  return { count, excludedDirs: Array.from(excludedFound) };
}

// POST /api/session/validate-path - check if path exists, is a directory, count files
router.post('/validate-path', (req: Request, res: Response) => {
  const body = validate(ValidatePathSchema, req, res);
  if (!body) return;

  const inputPath = body.path;

  const normalized = path.resolve(inputPath);

  if (!fs.existsSync(normalized)) {
    res.json({ valid: false, reason: 'PATH_NOT_FOUND' });
    return;
  }

  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    res.json({ valid: false, reason: 'NOT_A_DIRECTORY' });
    return;
  }

  // Git detection (Fix #17)
  const gitDetected = fs.existsSync(path.join(normalized, '.git'));

  // File count with exclusions (Fix #6)
  const { count: fileCount, excludedDirs } = countFilesExcluding(normalized);
  const largeCodebaseWarning = fileCount > 500
    ? `Large codebase detected (${fileCount} files). Claude may be slower or hit context limits.`
    : null;

  res.json({
    valid: true,
    path: normalized,
    gitDetected,
    fileCount,
    excludedDirs,
    largeCodebaseWarning,
  });
});

// POST /api/session/reset - clear current session
router.post('/reset', (_req: Request, res: Response) => {
  resetSession();
  res.json({ success: true });
});

// PATCH /api/session/skill-complete - mark a skill done, save output
router.patch('/skill-complete', (req: Request, res: Response) => {
  const body = validate(SkillCompleteSchema, req, res);
  if (!body) return;

  const { skillName, claudeSessionId, output } = body;

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  const updated = markSkillComplete(session.id, skillName, claudeSessionId, output ?? null);

  // Auto-create approval after strategy completes
  if (skillName === 'gtm-strategy') {
    try {
      const db = getDb();
      // Revoke any existing approved/pending approvals - strategy was re-run so they are stale
      const revokeResult = db.prepare(`
        UPDATE approvals SET status = 'revoked', revoked_reason = 'skill_rerun'
        WHERE session_id = ? AND skill_name = 'gtm-strategy' AND status IN ('pending', 'approved')
      `).run(session.id);
      if (revokeResult.changes > 0) {
        logActivity(session.id, 'approval.revoked', 'approval', null, { skillName: 'gtm-strategy', reason: 'skill_rerun' });
      }
      // Create a fresh pending approval for the new strategy output
      const approvalId = uuidv4();
      db.prepare(`
        INSERT INTO approvals (id, session_id, skill_name, status, payload, created_at)
        VALUES (?, ?, 'gtm-strategy', 'pending', ?, datetime('now'))
      `).run(approvalId, session.id, JSON.stringify(output ?? null));
      logActivity(session.id, 'approval.created', 'approval', approvalId, { skillName: 'gtm-strategy' });
    } catch (approvalErr) { console.warn('[gtm-strategy] Failed to create/revoke approval record:', approvalErr); }
  }

  res.json({ success: true, session: updated });
});

// PATCH /api/session/dom-page-result - persist per-page DOM resolve result to server
router.patch('/dom-page-result', (req: Request, res: Response) => {
  const { page, elementsFixed, filesModified } = req.body as {
    page?: string;
    elementsFixed?: number;
    filesModified?: string[];
  };

  if (!page) {
    res.status(400).json({ error: 'MISSING_PAGE', message: 'page is required' });
    return;
  }

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  // Merge into existing dom compact output
  const existing = (session.compactOutputs['gtm-dom-standardization'] ?? {}) as Record<string, unknown>;
  const pageResults = (existing.pageResults ?? []) as Array<{ page: string; elementsFixed: number; filesModified: string[] }>;

  // Upsert: replace existing entry for this page if present
  const idx = pageResults.findIndex(r => r.page === page);
  const entry = { page, elementsFixed: elementsFixed ?? 0, filesModified: filesModified ?? [] };
  if (idx >= 0) {
    pageResults[idx] = entry;
  } else {
    pageResults.push(entry);
  }

  // Recompute derived totals
  const allFiles = [...new Set(pageResults.flatMap(r => r.filesModified))];
  const updated = {
    ...existing,
    pageResults,
    appliedFiles: allFiles,
    appliedCount: allFiles.length,
  };

  const compactOutputs = { ...session.compactOutputs, 'gtm-dom-standardization': updated };
  updateSession(session.id, { compactOutputs });

  // Patch audit report: flip resolved elements to tracking:true, recalculate coverage
  if (filesModified && filesModified.length > 0) {
    patchAuditReportAfterResolve(session.id, filesModified);
  }

  res.json({ success: true });
});

// POST /api/session/recover-approval - create a pending approval if strategy is complete but no approval row exists
router.post('/recover-approval', (req: Request, res: Response) => {
  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  if (!session.completedSkills.includes('gtm-strategy')) {
    res.json({ recovered: false, reason: 'strategy_not_complete' });
    return;
  }

  const db = getDb();
  const existing = db.prepare(
    `SELECT id FROM approvals WHERE session_id = ? AND skill_name = 'gtm-strategy' AND status IN ('pending','approved')`
  ).get(session.id);

  if (existing) {
    res.json({ recovered: false, reason: 'already_exists' });
    return;
  }

  // Read strategy output from session_outputs table
  const outputRow = db.prepare(
    `SELECT output_json FROM session_outputs WHERE session_id = ? AND skill_name = 'gtm-strategy'`
  ).get(session.id) as { output_json: string } | undefined;

  const payload = outputRow ? outputRow.output_json : 'null';
  const approvalId = uuidv4();

  db.prepare(`
    INSERT INTO approvals (id, session_id, skill_name, status, payload, created_at)
    VALUES (?, ?, 'gtm-strategy', 'pending', ?, datetime('now'))
  `).run(approvalId, session.id, payload);

  logActivity(session.id, 'approval.recovered', 'approval', approvalId, { skillName: 'gtm-strategy' });

  res.json({ recovered: true, approvalId });
});

// POST /api/session/resume/:id - make a past session the active one
router.post('/resume/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = activateSession(id);
  if (!session) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
    return;
  }
  logActivity(id, 'session.switched', 'session', id, { name: session.name, projectPath: session.projectPath });
  res.json(session);
});

// GET /api/history - list past sessions
router.get('/history', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const offset = parseInt((req.query.offset as string) ?? '0', 10);
  const result = listSessions(limit, offset);
  res.json(result);
});

export default router;
