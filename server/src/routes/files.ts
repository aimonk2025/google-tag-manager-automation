import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { readSession } from '../session.js';
import { getDb } from '../db.js';
import { logActivity } from '../services/activity.js';
import { validate, DiffSchema, SnapshotSchema, RestoreSchema } from '../schemas.js';

const router = Router();

// POST /api/files/diff - generate unified diff for a proposed change
router.post('/diff', (req: Request, res: Response) => {
  const body = validate(DiffSchema, req, res);
  if (!body) return;
  const { filePath, proposedContent } = body;

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  // Security: ensure path is within project directory
  const normalizedPath = path.resolve(filePath);
  const normalizedProject = path.resolve(session.projectPath);
  if (!normalizedPath.startsWith(normalizedProject)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot access files outside project directory' });
    return;
  }

  if (!fs.existsSync(normalizedPath)) {
    res.status(404).json({ error: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` });
    return;
  }

  const originalContent = fs.readFileSync(normalizedPath, 'utf-8');
  const diff = createUnifiedDiff(originalContent, proposedContent, filePath);

  const additions = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const deletions = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;

  res.json({
    filePath: normalizedPath,
    originalContent,
    proposedContent,
    diff,
    additions,
    deletions,
  });
});

// POST /api/files/apply - write proposed content to file
router.post('/apply', (req: Request, res: Response) => {
  const { filePath, content } = req.body as {
    filePath?: string;
    content?: string;
  };

  if (!filePath || content === undefined) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'filePath and content required' });
    return;
  }

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  // Security: ensure path is within project directory
  const normalizedPath = path.resolve(filePath);
  const normalizedProject = path.resolve(session.projectPath);
  if (!normalizedPath.startsWith(normalizedProject)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot write files outside project directory' });
    return;
  }

  try {
    fs.writeFileSync(normalizedPath, content, 'utf-8');
    logActivity(session.id, 'file.applied', 'file', normalizedPath, { filePath: normalizedPath });
    res.json({ success: true, filePath: normalizedPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'WRITE_FAILED', message });
  }
});

// POST /api/files/snapshot — snapshot files before a destructive skill run
router.post('/snapshot', (req: Request, res: Response) => {
  // filePaths is optional (derived from session if absent)
  const skillName = req.body?.skillName;
  if (!skillName || typeof skillName !== 'string') {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'skillName required' });
    return;
  }
  const filePaths: string[] = Array.isArray(req.body?.filePaths) ? req.body.filePaths : [];

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  // Derive file list from session compact output if not provided
  let targetFiles: string[] = filePaths ?? [];
  if (targetFiles.length === 0) {
    if (skillName === 'gtm-dom-standardization') {
      const auditCompact = session.compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
      targetFiles = Object.keys((auditCompact?.untrackedByFile as Record<string, unknown> | undefined) ?? {});
    } else if (skillName === 'gtm-implementation') {
      const domCompact = session.compactOutputs['gtm-dom-standardization'] as Record<string, unknown> | undefined;
      targetFiles = (domCompact?.appliedFiles as string[] | undefined) ?? [];
    }
  }

  if (targetFiles.length === 0) {
    res.status(400).json({ error: 'NO_FILES', message: 'No files to snapshot. Run the preceding step first.' });
    return;
  }

  const db = getDb();
  const normalizedProject = path.resolve(session.projectPath);

  // Delete existing snapshots for this skill (overwrite pattern)
  db.prepare('DELETE FROM file_snapshots WHERE session_id = ? AND skill_name = ?').run(session.id, skillName);

  const insertSnapshot = db.prepare(`
    INSERT INTO file_snapshots (id, session_id, skill_name, file_path, original_content, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  let snapshotted = 0;
  let failed = 0;

  for (const filePath of targetFiles) {
    const normalized = path.resolve(filePath);
    if (!normalized.startsWith(normalizedProject)) continue;
    try {
      const content = fs.readFileSync(normalized, 'utf-8');
      insertSnapshot.run(uuidv4(), session.id, skillName, normalized, content);
      snapshotted++;
    } catch {
      failed++;
    }
  }

  logActivity(session.id, 'files.snapshotted', 'snapshot', skillName, { count: snapshotted, skillName });
  res.json({ success: true, snapshotted, failed });
});

// POST /api/files/restore — restore files from a previous snapshot
// Query param: ?check=true — only check for divergence, don't restore
// Query param: ?force=true — restore even if files diverged (with warning)
router.post('/restore', (req: Request, res: Response) => {
  const body = validate(RestoreSchema, req, res);
  if (!body) return;
  const { skillName } = body;
  const checkOnly = req.query.check === 'true';
  const force = req.query.force === 'true';

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  const db = getDb();
  const snapshots = db.prepare(
    'SELECT file_path, original_content FROM file_snapshots WHERE session_id = ? AND skill_name = ?'
  ).all(session.id, skillName) as Array<{ file_path: string; original_content: string }>;

  if (snapshots.length === 0) {
    res.status(404).json({ error: 'NO_SNAPSHOT', message: `No snapshot found for ${skillName}` });
    return;
  }

  // Divergence detection: compare snapshot content hash vs current file hash
  const divergedFiles: Array<{ filePath: string; snapshotHash: string; currentHash: string }> = [];
  for (const snap of snapshots) {
    if (!fs.existsSync(snap.file_path)) continue;
    const snapshotHash = crypto.createHash('sha256').update(snap.original_content).digest('hex');
    const currentContent = fs.readFileSync(snap.file_path, 'utf-8');
    const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');
    // Only flag as diverged if current != snapshot AND current != original (skip if file unchanged)
    // We compare against the snapshot (original before skill ran), so if they differ, someone edited
    if (snapshotHash !== currentHash) {
      divergedFiles.push({ filePath: snap.file_path, snapshotHash, currentHash });
    }
  }

  // If check-only mode, return divergence info without restoring
  if (checkOnly) {
    res.json({ diverged: divergedFiles.length > 0, files: divergedFiles, totalFiles: snapshots.length });
    return;
  }

  // If files diverged and not forcing, return 409 so frontend can show warning
  if (divergedFiles.length > 0 && !force) {
    res.status(409).json({
      error: 'FILES_DIVERGED',
      message: `${divergedFiles.length} file(s) were manually edited after the snapshot was taken. Add ?force=true to restore anyway.`,
      divergedFiles,
    });
    return;
  }

  let restored = 0;
  let failed = 0;

  for (const snap of snapshots) {
    try {
      fs.writeFileSync(snap.file_path, snap.original_content, 'utf-8');
      restored++;
    } catch {
      failed++;
    }
  }

  logActivity(session.id, 'files.restored', 'snapshot', skillName, { count: restored, skillName, forcedOverDivergence: divergedFiles.length > 0 });
  res.json({ success: true, restored, failed, divergedFiles });
});

// Exported helper — compute changed files for a session+skill against stored snapshots
export function computeChangedFiles(sessionId: string, skillName: string): {
  changed: Array<{ filePath: string; additions: number; deletions: number }>;
  unchanged: string[];
  missing: string[];
  hasSnapshot: boolean;
} {
  const db = getDb();
  const snapshots = db.prepare(
    'SELECT file_path, original_content FROM file_snapshots WHERE session_id = ? AND skill_name = ?'
  ).all(sessionId, skillName) as Array<{ file_path: string; original_content: string }>;

  if (snapshots.length === 0) return { changed: [], unchanged: [], missing: [], hasSnapshot: false };

  const changed: Array<{ filePath: string; additions: number; deletions: number }> = [];
  const unchanged: string[] = [];
  const missing: string[] = [];

  for (const snap of snapshots) {
    if (!fs.existsSync(snap.file_path)) {
      missing.push(snap.file_path);
      continue;
    }
    const current = fs.readFileSync(snap.file_path, 'utf-8');
    if (current === snap.original_content) {
      unchanged.push(snap.file_path);
    } else {
      const diff = createUnifiedDiff(snap.original_content, current, snap.file_path);
      const additions = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
      const deletions = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;
      changed.push({ filePath: snap.file_path, additions, deletions });
    }
  }

  return { changed, unchanged, missing, hasSnapshot: true };
}

// GET /api/files/audit-coverage — compare project source files against what the audit actually scanned
router.get('/audit-coverage', (req: Request, res: Response) => {
  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  // Get all files the audit produced elements for from session outputs
  const db = getDb();
  const outputRow = db.prepare('SELECT output_json FROM session_outputs WHERE session_id = ? AND skill_name = ?')
    .get(session.id, 'gtm-analytics-audit') as { output_json: string } | undefined;

  const auditedFiles = new Set<string>();
  if (outputRow) {
    try {
      const report = JSON.parse(outputRow.output_json) as Record<string, unknown>;
      const categorized = report.categorized as Record<string, { elements?: Array<{ file: string }> }> | undefined;
      if (categorized) {
        for (const cat of Object.values(categorized)) {
          for (const el of cat.elements ?? []) {
            if (el.file) auditedFiles.add(el.file.replace(/\\/g, '/'));
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Walk only the app/ directory for page.tsx files (Next.js App Router pages)
  const projectPath = session.projectPath;
  const appDir = path.join(projectPath, 'app');
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.cache', '__pycache__', '.claude']);
  const pageFileNames = new Set(['page.tsx', 'page.jsx', 'page.ts', 'page.js']);

  const projectFiles: string[] = [];

  function walk(dir: string, depth = 0) {
    if (depth > 10) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (pageFileNames.has(entry.name)) {
        projectFiles.push(path.relative(projectPath, full).replace(/\\/g, '/'));
      }
    }
  }

  // Only walk app/ if it exists, otherwise walk project root
  walk(fs.existsSync(appDir) ? appDir : projectPath);

  // A page is considered audited if its exact path OR any file in the same directory was audited
  const notAudited = projectFiles.filter(f => {
    if (auditedFiles.has(f)) return false;
    const dir = f.split('/').slice(0, -1).join('/');
    return !Array.from(auditedFiles).some(af => af.startsWith(dir + '/') || af.startsWith(dir + '\\'));
  });
  const audited = projectFiles.filter(f => !notAudited.includes(f));

  res.json({
    totalProjectFiles: projectFiles.length,
    auditedFiles: audited.length,
    notAuditedFiles: notAudited.length,
    notAudited,
    hasGaps: notAudited.length > 0,
  });
});

// GET /api/files/dom-check — scan audit-scoped files and count elements still missing js-track
router.get('/dom-check', (req: Request, res: Response) => {
  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  const auditCompact = session.compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
  const untrackedByFile = auditCompact?.untrackedByFile as Record<string, Array<{ line: number; id: string | null; classes: string[] }>> | undefined;

  if (!untrackedByFile || Object.keys(untrackedByFile).length === 0) {
    res.json({ checked: false, reason: 'No audit data available' });
    return;
  }

  let totalElements = 0;
  let stillUntracked = 0;
  const projectPath = session.projectPath;

  const trackingPatterns = ['trackCTAClick', 'trackNavigationClick', 'trackCourseProgress', 'trackFormInteraction', 'dataLayer.push', 'data-track'];

  // Cache for component file tracking checks
  const componentCache = new Map<string, boolean>();

  function componentHasTracking(componentName: string): boolean {
    if (componentCache.has(componentName)) return componentCache.get(componentName)!;
    const candidates = [
      path.join(projectPath, 'components', `${componentName}.tsx`),
      path.join(projectPath, 'components', `${componentName}.ts`),
      path.join(projectPath, 'app', 'components', `${componentName}.tsx`),
    ];
    for (const candidate of candidates) {
      try {
        const content = fs.readFileSync(candidate, 'utf-8');
        const has = trackingPatterns.some(p => content.includes(p));
        componentCache.set(componentName, has);
        return has;
      } catch { /* not found */ }
    }
    componentCache.set(componentName, false);
    return false;
  }

  for (const [filePath, elements] of Object.entries(untrackedByFile)) {
    totalElements += elements.length;
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);
    let lines: string[];
    try {
      lines = fs.readFileSync(absolutePath, 'utf-8').split('\n');
    } catch {
      stillUntracked += elements.length;
      continue;
    }
    for (const el of elements) {
      const start = Math.max(0, el.line - 6);
      const end = Math.min(lines.length - 1, el.line + 4);
      const window = lines.slice(start, end + 1).join('\n');

      // Check for direct tracking in the window
      const hasDirectTracking = trackingPatterns.some(p => window.includes(p));
      if (hasDirectTracking) continue;

      // Check if the line is a component usage — if so, check that component's definition
      const lineContent = lines[el.line - 1] ?? '';
      const componentMatch = lineContent.match(/<([A-Z][A-Za-z0-9]+)/);
      if (componentMatch) {
        if (componentHasTracking(componentMatch[1])) continue;
        // Recurse: check what that component imports/renders (one level deep)
        const compFile = [
          path.join(projectPath, 'components', `${componentMatch[1]}.tsx`),
          path.join(projectPath, 'components', `${componentMatch[1]}.ts`),
        ].find(f => { try { fs.accessSync(f); return true; } catch { return false; } });
        if (compFile) {
          const compContent = fs.readFileSync(compFile, 'utf-8');
          const importedComponents = [...compContent.matchAll(/import\s+\w+\s+from\s+['"]\.\/([A-Za-z0-9]+)['"]/g)].map(m => m[1]);
          if (importedComponents.some(c => componentHasTracking(c))) continue;
        }
      }

      // Expand the window to ±15 lines to catch tracking on parent elements (e.g. icon inside a tracked button)
      const wideStart = Math.max(0, el.line - 16);
      const wideEnd = Math.min(lines.length - 1, el.line + 14);
      const wideWindow = lines.slice(wideStart, wideEnd + 1).join('\n');
      if (trackingPatterns.some(p => wideWindow.includes(p))) continue;

      // Check map/dynamic patterns
      if (window.includes('.map(') || window.includes('subPages')) {
        const knownTrackedComponents = ['Module2StepCard', 'StepCard', 'CourseCard', 'NavigationButton'];
        if (knownTrackedComponents.some(c => window.includes(c) || componentHasTracking(c))) continue;
      }

      stillUntracked++;
    }
  }

  res.json({
    checked: true,
    totalElements,
    stillUntracked,
    done: stillUntracked === 0,
  });
});

// GET /api/files/changed/:skillName — compare current files against snapshot to show what Claude changed
router.get('/changed/:skillName', (req: Request, res: Response) => {
  const { skillName } = req.params;

  const session = readSession();
  if (!session) {
    res.status(404).json({ error: 'NO_SESSION', message: 'No active session' });
    return;
  }

  res.json(computeChangedFiles(session.id, skillName));
});

// Simple unified diff generator
function createUnifiedDiff(original: string, proposed: string, filename: string): string {
  const origLines = original.split('\n');
  const propLines = proposed.split('\n');

  const header = `--- ${filename}\n+++ ${filename} (proposed)`;
  const hunks: string[] = [];

  // Simple line-by-line diff
  const maxLen = Math.max(origLines.length, propLines.length);
  let i = 0;
  let hunkLines: string[] = [];
  let hunkStart = -1;

  const flushHunk = () => {
    if (hunkLines.length > 0) {
      hunks.push(`@@ -${hunkStart + 1} +${hunkStart + 1} @@\n${hunkLines.join('\n')}`);
      hunkLines = [];
      hunkStart = -1;
    }
  };

  while (i < maxLen) {
    const origLine = origLines[i] ?? '';
    const propLine = propLines[i] ?? '';

    if (origLine !== propLine) {
      if (hunkStart === -1) hunkStart = i;
      if (origLines[i] !== undefined) hunkLines.push(`-${origLine}`);
      if (propLines[i] !== undefined) hunkLines.push(`+${propLine}`);
    } else {
      if (hunkLines.length > 0) {
        hunkLines.push(` ${origLine}`);
        // Flush after 3 context lines
        const contextLines = hunkLines.filter(l => l.startsWith(' ')).length;
        if (contextLines >= 3) flushHunk();
      }
    }
    i++;
  }

  flushHunk();

  if (hunks.length === 0) return `${header}\n(no changes)`;
  return `${header}\n${hunks.join('\n')}`;
}

export default router;
