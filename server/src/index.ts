import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import sessionRouter from './routes/session.js';
import skillRouter from './routes/skill.js';
import filesRouter from './routes/files.js';
import gtmRouter from './routes/gtm.js';
import approvalsRouter from './routes/approvals.js';
import configRouter from './routes/config.js';
import { getDb } from './db.js';
import { encryptionEnabled } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '4242', 10);

const app = express();

// Initialize DB on startup
const db = getDb();

// ---------------------------------------------------------------------------
// Daily SQLite backup
// ---------------------------------------------------------------------------
const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');
let lastBackupAt: string | null = null;
let lastBackupSizeKB: number | null = null;

function runDatabaseBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = path.join(BACKUP_DIR, `gtm-engine-${date}.db`);
    db.backup(dest).then(() => {
      lastBackupAt = new Date().toISOString();
      try {
        const stat = fs.statSync(dest);
        lastBackupSizeKB = Math.round(stat.size / 1024);
      } catch { /* non-fatal */ }

      // Prune backups older than 7 days
      try {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const file of fs.readdirSync(BACKUP_DIR)) {
          if (!file.startsWith('gtm-engine-') || !file.endsWith('.db')) continue;
          const filePath = path.join(BACKUP_DIR, file);
          if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
        }
      } catch { /* non-fatal */ }
    }).catch((err: Error) => {
      console.warn('[backup] DB backup failed:', err.message);
    });
  } catch (err) {
    console.warn('[backup] Could not start DB backup:', (err as Error).message);
  }
}

// Run backup immediately on startup, then every 24h
runDatabaseBackup();
setInterval(runDatabaseBackup, 24 * 60 * 60 * 1000);

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4242'] }));
app.use(express.json({ limit: '10mb' }));

// Health check (extended)
app.get('/api/health', async (_req, res) => {
  const checks: Record<string, string> = { server: 'ok' };

  // DB check
  try {
    db.prepare('SELECT 1').get();
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }

  // Claude CLI check
  try {
    execFileSync('claude', ['--version'], { timeout: 5000, encoding: 'utf-8' });
    checks.claudeCli = 'ok';
  } catch {
    checks.claudeCli = 'not_found';
  }

  // Disk space (best effort)
  let diskFreeGB: number | null = null;
  try {
    // Works on Windows and Linux/Mac via df
    if (process.platform === 'win32') {
      const out = execFileSync('wmic', ['logicaldisk', 'get', 'FreeSpace,Name'], { timeout: 3000, encoding: 'utf-8' });
      const lines = out.split('\n').filter(l => l.trim() && !l.includes('FreeSpace'));
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/);
        diskFreeGB = parts[0] ? Math.round(parseInt(parts[0], 10) / (1024 ** 3) * 10) / 10 : null;
      }
    } else {
      const out = execFileSync('df', ['-k', '/'], { timeout: 3000, encoding: 'utf-8' });
      const parts = out.split('\n')[1]?.split(/\s+/);
      diskFreeGB = parts?.[3] ? Math.round(parseInt(parts[3], 10) / (1024 * 1024) * 10) / 10 : null;
    }
  } catch { /* non-fatal */ }

  // Active skill runs
  let activeRuns = 0;
  try {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM skill_runs WHERE status = 'running'`).get() as { cnt: number };
    activeRuns = row.cnt;
  } catch { /* non-fatal */ }

  res.json({
    status: 'ok',
    version: '1.0.0',
    name: 'Google Tag Manager Automation Engine',
    checks,
    diskFreeGB,
    activeRuns,
    lastBackupAt,
    lastBackupSizeKB,
  });
});

// Routes
app.use('/api/session', sessionRouter);
app.use('/api/skill/config', configRouter);  // must be before /api/skill to avoid conflict
app.use('/api/skill', skillRouter);
app.use('/api/files', filesRouter);
app.use('/api/gtm', gtmRouter);
app.use('/api/approvals', approvalsRouter);

// GET /api/activity?sessionId=<id>&limit=50
app.get('/api/activity', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const limit = parseInt((req.query.limit as string) ?? '50', 10);
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId query param required' });
    return;
  }
  const db = getDb();
  const rows = db.prepare('SELECT * FROM activity_log WHERE session_id = ? ORDER BY created_at DESC LIMIT ?').all(sessionId, limit);
  res.json(rows);
});

// GET /api/costs/summary?sessionId=<id>
app.get('/api/costs/summary', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId query param required' });
    return;
  }
  const db = getDb();
  const totals = db.prepare(`
    SELECT COALESCE(SUM(cost_usd),0) as totalCostUsd, COALESCE(SUM(input_tokens),0) as totalInputTokens, COALESCE(SUM(output_tokens),0) as totalOutputTokens
    FROM cost_events WHERE session_id = ?
  `).get(sessionId) as { totalCostUsd: number; totalInputTokens: number; totalOutputTokens: number };
  const bySkill = db.prepare(`
    SELECT skill_name as skillName, COALESCE(SUM(cost_usd),0) as costUsd, COALESCE(SUM(input_tokens + output_tokens),0) as tokens
    FROM cost_events WHERE session_id = ? GROUP BY skill_name ORDER BY costUsd DESC
  `).all(sessionId);
  res.json({ ...totals, bySkill });
});

// GET /api/settings/encryption-status
app.get('/api/settings/encryption-status', (_req: Request, res: Response) => {
  res.json({ enabled: encryptionEnabled() });
});

// GET /api/settings/adapter-pricing — list current pricing per adapter
app.get('/api/settings/adapter-pricing', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT adapter_type, input_price_per_million, output_price_per_million, updated_at FROM adapter_pricing').all();
  res.json({ pricing: rows });
});

// PATCH /api/settings/adapter-pricing/:adapterType — update pricing for an adapter
app.patch('/api/settings/adapter-pricing/:adapterType', (req: Request, res: Response) => {
  const { adapterType } = req.params;
  const { inputPricePerMillion, outputPricePerMillion } = req.body as { inputPricePerMillion?: number; outputPricePerMillion?: number };
  if (inputPricePerMillion === undefined && outputPricePerMillion === undefined) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'Provide inputPricePerMillion and/or outputPricePerMillion' });
    return;
  }
  db.prepare(`
    INSERT INTO adapter_pricing (adapter_type, input_price_per_million, output_price_per_million, updated_at)
    VALUES (?, COALESCE(?, 0), COALESCE(?, 0), datetime('now'))
    ON CONFLICT(adapter_type) DO UPDATE SET
      input_price_per_million = COALESCE(?, input_price_per_million),
      output_price_per_million = COALESCE(?, output_price_per_million),
      updated_at = datetime('now')
  `).run(adapterType, inputPricePerMillion ?? null, outputPricePerMillion ?? null, inputPricePerMillion ?? null, outputPricePerMillion ?? null);
  res.json({ success: true });
});

// GET /api/session/scores?sessionId=<id>
app.get('/api/session/scores', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId query param required' });
    return;
  }
  const db = getDb();
  const rows = db.prepare(`
    SELECT skill_name, score, retry_count, duration_ms, started_at
    FROM skill_runs
    WHERE session_id = ? AND status = 'complete' AND score IS NOT NULL
    ORDER BY started_at DESC
  `).all(sessionId) as Array<{ skill_name: string; score: number; retry_count: number; duration_ms: number; started_at: string }>;

  // Deduplicate: keep only the latest run per skill
  const seen = new Set<string>();
  const bySkill: typeof rows = [];
  for (const row of rows) {
    if (!seen.has(row.skill_name)) {
      seen.add(row.skill_name);
      bySkill.push(row);
    }
  }

  res.json({ scores: bySkill });
});

// Serve cycle dashboard (always available)
const dashboardPath = path.join(__dirname, '..', '..', 'cycle-dashboard');
app.use('/cycle-dashboard', express.static(dashboardPath));

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', '..', 'app', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Google Tag Manager Automation Engine server running on http://localhost:${PORT}`);
});
