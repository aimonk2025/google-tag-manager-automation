import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'gtm-engine.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

// ---------------------------------------------------------------------------
// Schema bootstrap — all CREATE TABLE IF NOT EXISTS in one exec
// ---------------------------------------------------------------------------

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      project_path TEXT NOT NULL,
      gtm_account_id TEXT,
      gtm_container_id TEXT,
      completed_skills TEXT DEFAULT '[]',
      current_skill TEXT,
      skill_sessions TEXT DEFAULT '{}',
      audit_report TEXT,
      tracking_plan TEXT,
      dom_changes TEXT,
      setup_config TEXT,
      implementation_result TEXT,
      test_results TEXT,
      reporting_result TEXT,
      compact_outputs TEXT DEFAULT '{}',
      file_tree_snapshot TEXT,
      audit_coverage_pct REAL DEFAULT 0,
      resolution_queue TEXT DEFAULT '[]',
      drift_acknowledged INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS element_resolutions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      element_id TEXT NOT NULL,
      element_type TEXT NOT NULL,
      element_context TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      resolution_output TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_element_resolutions_session ON element_resolutions(session_id, status);

    CREATE TABLE IF NOT EXISTS session_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, skill_name)
    );

    CREATE TABLE IF NOT EXISTS skill_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      claude_session_id TEXT,
      prompt_sent TEXT,
      output_log TEXT DEFAULT '',
      result_json TEXT,
      error_message TEXT,
      adapter_type TEXT DEFAULT 'claude_code',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      score REAL,
      retry_count INTEGER DEFAULT 0,
      progress_pct INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cost_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      skill_run_id TEXT REFERENCES skill_runs(id) ON DELETE SET NULL,
      skill_name TEXT NOT NULL,
      adapter_type TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      review_note TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS file_snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skill_config (
      skill_name TEXT PRIMARY KEY,
      section_overrides TEXT DEFAULT '{}',
      additional_instructions TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS step_instructions (
      skill_name TEXT PRIMARY KEY,
      instructions TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      session_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      scope TEXT,
      token_type TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session_outputs_session ON session_outputs(session_id, skill_name);
    CREATE INDEX IF NOT EXISTS idx_skill_runs_session ON skill_runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_skill_runs_started ON skill_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cost_events_session ON cost_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_log(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_session_skill ON file_snapshots(session_id, skill_name);
  `);

  // updated_at trigger for sessions
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS sessions_updated_at
    AFTER UPDATE ON sessions
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
    BEGIN
      UPDATE sessions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);

  // updated_at trigger for session_outputs
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS session_outputs_updated_at
    AFTER UPDATE ON session_outputs
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
    BEGIN
      UPDATE session_outputs SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);

  applyMigrations(database);

  // Mark any runs left in 'running' state from a previous server crash/restart as errored
  database.prepare(`
    UPDATE skill_runs
    SET status = 'error',
        error_message = 'Run interrupted - server was restarted',
        completed_at = datetime('now')
    WHERE status = 'running'
  `).run();
}

// ---------------------------------------------------------------------------
// Versioned migrations — each runs exactly once, tracked by version number
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  description: string;
  up: (database: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 6,
    description: 'Add oauth_tokens table for Windows OAuth2 flow',
    up: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS oauth_tokens (
          session_id TEXT PRIMARY KEY,
          access_token TEXT,
          refresh_token TEXT,
          expiry_date INTEGER,
          scope TEXT,
          token_type TEXT,
          email TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 1,
    description: 'Seed app_config adapter_type default',
    up: (d) => {
      d.prepare(`INSERT OR IGNORE INTO app_config (key, value) VALUES ('adapter_type', 'claude_code')`).run();
    },
  },
  {
    version: 5,
    description: 'Add systems-thinking columns to sessions and create element_resolutions table',
    up: (d) => {
      const alterColumns = [
        `ALTER TABLE sessions ADD COLUMN file_tree_snapshot TEXT`,
        `ALTER TABLE sessions ADD COLUMN audit_coverage_pct REAL DEFAULT 0`,
        `ALTER TABLE sessions ADD COLUMN resolution_queue TEXT DEFAULT '[]'`,
        `ALTER TABLE sessions ADD COLUMN drift_acknowledged INTEGER DEFAULT 0`,
      ];
      for (const sql of alterColumns) {
        try { d.exec(sql); } catch { /* column already exists on fresh DBs */ }
      }
      d.exec(`
        CREATE TABLE IF NOT EXISTS element_resolutions (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          element_id TEXT NOT NULL,
          element_type TEXT NOT NULL,
          element_context TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          resolution_output TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_element_resolutions_session ON element_resolutions(session_id, status);
      `);
    },
  },
  {
    version: 7,
    description: 'Add page_context column to skill_runs for per-page DOM resolve tracking',
    up: (d) => {
      try { d.exec(`ALTER TABLE skill_runs ADD COLUMN page_context TEXT`); } catch { /* already exists */ }
    },
  },
  {
    version: 4,
    description: 'Add google_client_id and google_client_secret to sessions table',
    up: (d) => {
      try { d.exec(`ALTER TABLE sessions ADD COLUMN google_client_id TEXT`); } catch { /* already exists */ }
      try { d.exec(`ALTER TABLE sessions ADD COLUMN google_client_secret TEXT`); } catch { /* already exists */ }
    },
  },
  {
    version: 3,
    description: 'Add skill_runs columns added in phases 2 and 8 to existing tables',
    up: (d) => {
      // These were previously applied via the silent try-catch array.
      // Now applied as a proper versioned migration for databases that predate our rewrite.
      const alterColumns = [
        `ALTER TABLE skill_runs ADD COLUMN adapter_type TEXT DEFAULT 'claude_code'`,
        `ALTER TABLE skill_runs ADD COLUMN input_tokens INTEGER DEFAULT 0`,
        `ALTER TABLE skill_runs ADD COLUMN output_tokens INTEGER DEFAULT 0`,
        `ALTER TABLE skill_runs ADD COLUMN cost_usd REAL DEFAULT 0`,
        `ALTER TABLE skill_runs ADD COLUMN duration_ms INTEGER DEFAULT 0`,
        `ALTER TABLE skill_runs ADD COLUMN score REAL`,
        `ALTER TABLE skill_runs ADD COLUMN retry_count INTEGER DEFAULT 0`,
        `ALTER TABLE skill_runs ADD COLUMN progress_pct INTEGER DEFAULT 0`,
        `ALTER TABLE sessions ADD COLUMN compact_outputs TEXT DEFAULT '{}'`,
        `ALTER TABLE sessions ADD COLUMN name TEXT`,
      ];
      for (const sql of alterColumns) {
        try { d.exec(sql); } catch { /* column already exists on fresh DBs */ }
      }
    },
  },
  {
    version: 2,
    description: 'Backfill session_outputs from sessions blob columns',
    up: (d) => {
      // Read all sessions that have skill output blobs and migrate them to session_outputs
      const rows = d.prepare('SELECT id, audit_report, tracking_plan, dom_changes, setup_config, implementation_result, test_results, reporting_result FROM sessions').all() as Array<{
        id: string;
        audit_report: string | null;
        tracking_plan: string | null;
        dom_changes: string | null;
        setup_config: string | null;
        implementation_result: string | null;
        test_results: string | null;
        reporting_result: string | null;
      }>;

      const skillMap: Array<[string, string]> = [
        ['gtm-analytics-audit', 'audit_report'],
        ['gtm-strategy', 'tracking_plan'],
        ['gtm-dom-standardization', 'dom_changes'],
        ['gtm-setup', 'setup_config'],
        ['gtm-implementation', 'implementation_result'],
        ['gtm-testing', 'test_results'],
        ['gtm-reporting', 'reporting_result'],
      ];

      const insert = d.prepare(`
        INSERT OR IGNORE INTO session_outputs (session_id, skill_name, output_json)
        VALUES (?, ?, ?)
      `);

      const migrate = d.transaction(() => {
        for (const row of rows) {
          for (const [skillName, col] of skillMap) {
            const val = row[col as keyof typeof row] as string | null;
            if (val && val !== 'null') {
              insert.run(row.id, skillName, val);
            }
          }
        }
      });
      migrate();
    },
  },
  {
    version: 8,
    description: 'Drop legacy blob columns from sessions table (single source of truth: session_outputs)',
    up: (d) => {
      // SQLite ALTER TABLE DROP COLUMN requires SQLite >= 3.35.
      // Use try/catch per column — if already missing, skip silently.
      const cols = [
        'audit_report',
        'tracking_plan',
        'dom_changes',
        'setup_config',
        'implementation_result',
        'test_results',
        'reporting_result',
      ];
      for (const col of cols) {
        try { d.exec(`ALTER TABLE sessions DROP COLUMN ${col}`); } catch { /* already removed or old SQLite */ }
      }
    },
  },
  {
    version: 9,
    description: 'Production readiness: revoked_reason on approvals, version on session_outputs, gtm_resources table, sse_events table',
    up: (d) => {
      // Fix #4: revoked_reason column on approvals
      try { d.exec(`ALTER TABLE approvals ADD COLUMN revoked_reason TEXT`); } catch { /* already exists */ }
      // Fix #12: version column on session_outputs + remove old UNIQUE(session_id, skill_name) constraint
      // We need to allow multiple rows per session+skill (versioning). Recreate the table without the old unique constraint.
      try {
        d.exec(`
          CREATE TABLE IF NOT EXISTS session_outputs_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            skill_name TEXT NOT NULL,
            output_json TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(session_id, skill_name, version)
          );
          INSERT OR IGNORE INTO session_outputs_v2 (id, session_id, skill_name, output_json, version, created_at, updated_at)
          SELECT id, session_id, skill_name, output_json, 1, created_at, updated_at FROM session_outputs;
          DROP TABLE session_outputs;
          ALTER TABLE session_outputs_v2 RENAME TO session_outputs;
          CREATE INDEX IF NOT EXISTS idx_session_outputs_session ON session_outputs(session_id, skill_name);
        `);
      } catch { /* may already be migrated */ }
      // Fix #3: gtm_resources table for partial state rollback
      d.exec(`
        CREATE TABLE IF NOT EXISTS gtm_resources (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          resource_type TEXT NOT NULL,
          gtm_resource_id TEXT NOT NULL,
          workspace_path TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          rolled_back_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_gtm_resources_session ON gtm_resources(session_id);
      `);
      // Fix #2: sse_events table for reconnect/replay
      d.exec(`
        CREATE TABLE IF NOT EXISTS sse_events (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          data TEXT NOT NULL,
          sequence_num INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sse_events_run ON sse_events(run_id, sequence_num);
      `);
      // Fix #9: adapter_pricing table
      d.exec(`
        CREATE TABLE IF NOT EXISTS adapter_pricing (
          adapter_type TEXT PRIMARY KEY,
          input_price_per_million REAL NOT NULL DEFAULT 0,
          output_price_per_million REAL NOT NULL DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      // Seed default pricing
      d.prepare(`INSERT OR IGNORE INTO adapter_pricing (adapter_type, input_price_per_million, output_price_per_million) VALUES ('claude_code', 3.0, 15.0)`).run();
      d.prepare(`INSERT OR IGNORE INTO adapter_pricing (adapter_type, input_price_per_million, output_price_per_million) VALUES ('gemini', 0.075, 0.30)`).run();
      d.prepare(`INSERT OR IGNORE INTO adapter_pricing (adapter_type, input_price_per_million, output_price_per_million) VALUES ('opencode', 0, 0)`).run();
    },
  },
];

function applyMigrations(database: Database.Database): void {
  const applied = new Set(
    (database.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(r => r.version)
  );

  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (version, description) VALUES (?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    try {
      const run = database.transaction(() => {
        migration.up(database);
        insertMigration.run(migration.version, migration.description);
      });
      run();
    } catch (err) {
      // Log but do not crash — migrations that fail on existing schema (e.g. column exists) are non-fatal
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[db] Migration v${migration.version} warning: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// session_outputs helpers — used by session.ts instead of blob columns
// ---------------------------------------------------------------------------

export function upsertSessionOutput(sessionId: string, skillName: string, outputJson: string): void {
  const database = getDb();
  // Versioned insert: get the next version number, insert new row, prune old versions (keep last 3)
  const upsert = database.transaction(() => {
    const maxVersionRow = database.prepare(
      'SELECT COALESCE(MAX(version), 0) as maxV FROM session_outputs WHERE session_id = ? AND skill_name = ?'
    ).get(sessionId, skillName) as { maxV: number };
    const nextVersion = maxVersionRow.maxV + 1;

    database.prepare(`
      INSERT INTO session_outputs (session_id, skill_name, output_json, version)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, skillName, outputJson, nextVersion);

    // Prune: delete rows where version < nextVersion - 2 (keep last 3)
    database.prepare(`
      DELETE FROM session_outputs
      WHERE session_id = ? AND skill_name = ? AND version < ?
    `).run(sessionId, skillName, nextVersion - 2);
  });
  upsert();
}

export function getSessionOutput(sessionId: string, skillName: string): unknown | null {
  const database = getDb();
  // Always return the latest version
  const row = database.prepare(
    'SELECT output_json FROM session_outputs WHERE session_id = ? AND skill_name = ? ORDER BY version DESC LIMIT 1'
  ).get(sessionId, skillName) as { output_json: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.output_json); } catch { return null; }
}

export function getSessionOutputVersions(sessionId: string, skillName: string): Array<{ version: number; updatedAt: string }> {
  const database = getDb();
  return database.prepare(
    'SELECT version, updated_at FROM session_outputs WHERE session_id = ? AND skill_name = ? ORDER BY version DESC'
  ).all(sessionId, skillName) as Array<{ version: number; updatedAt: string }>;
}

export function getSessionOutputAtVersion(sessionId: string, skillName: string, version: number): unknown | null {
  const database = getDb();
  const row = database.prepare(
    'SELECT output_json FROM session_outputs WHERE session_id = ? AND skill_name = ? AND version = ?'
  ).get(sessionId, skillName, version) as { output_json: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.output_json); } catch { return null; }
}

export function getAllSessionOutputs(sessionId: string): Record<string, unknown> {
  const database = getDb();
  // Get the latest version for each skill
  const rows = database.prepare(`
    SELECT skill_name, output_json FROM session_outputs s1
    WHERE session_id = ? AND version = (
      SELECT MAX(s2.version) FROM session_outputs s2
      WHERE s2.session_id = s1.session_id AND s2.skill_name = s1.skill_name
    )
  `).all(sessionId) as { skill_name: string; output_json: string }[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try { result[row.skill_name] = JSON.parse(row.output_json); } catch { /* skip */ }
  }
  return result;
}

// ---------------------------------------------------------------------------
// oauth_tokens helpers — used by Windows OAuth2 path in gtm routes
// ---------------------------------------------------------------------------

export function saveOAuthTokens(sessionId: string, tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
  email?: string | null;
}): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO oauth_tokens (session_id, access_token, refresh_token, expiry_date, scope, token_type, email, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date = excluded.expiry_date,
      scope = excluded.scope,
      token_type = excluded.token_type,
      email = excluded.email,
      updated_at = datetime('now')
  `).run(
    sessionId,
    tokens.access_token ?? null,
    tokens.refresh_token ?? null,
    tokens.expiry_date ?? null,
    tokens.scope ?? null,
    tokens.token_type ?? null,
    tokens.email ?? null,
  );
}

export function getOAuthTokens(sessionId: string): {
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;
  scope: string | null;
  token_type: string | null;
  email: string | null;
} | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM oauth_tokens WHERE session_id = ?').get(sessionId) as {
    access_token: string | null;
    refresh_token: string | null;
    expiry_date: number | null;
    scope: string | null;
    token_type: string | null;
    email: string | null;
  } | undefined;
  return row ?? null;
}
