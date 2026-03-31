import { v4 as uuidv4 } from 'uuid';
import { getDb, upsertSessionOutput, getSessionOutput } from './db.js';
import { encrypt, decrypt, isEncrypted } from './crypto.js';

export interface SessionData {
  id: string;
  name: string | null;
  projectPath: string;
  gtmConfig: { accountId: string; containerId: string } | null;
  oauthCredentials: { clientId: string; clientSecret: string } | null;
  completedSkills: string[];
  currentSkill: string | null;
  skillSessions: Record<string, string>;
  compactOutputs: Record<string, unknown>;
  audit_coverage_pct: number;
  resolution_queue: string;
  drift_acknowledged: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// App config — stores active session ID so we don't rely on updated_at ordering
// ---------------------------------------------------------------------------

function getActiveSessionId(): string | null {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('active_session_id') as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setActiveSessionId(id: string | null): void {
  const db = getDb();
  if (id === null) {
    db.prepare('DELETE FROM app_config WHERE key = ?').run('active_session_id');
  } else {
    db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('active_session_id', id);
  }
}

export function readSession(): SessionData | null {
  try {
    const db = getDb();
    const activeId = getActiveSessionId();

    let row: Record<string, string> | undefined;
    if (activeId) {
      row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(activeId) as Record<string, string> | undefined;
    }

    // Fallback: if no active ID tracked, pick most recently updated (migration path)
    if (!row) {
      row = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1').get() as Record<string, string> | undefined;
      if (row) setActiveSessionId(row.id); // backfill config
    }

    if (!row) return null;
    return rowToSession(row);
  } catch {
    return null;
  }
}

export function createSession(projectPath: string, gtmAccountId?: string, gtmContainerId?: string, name?: string): SessionData {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const sessionName = name ?? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? null;

  const encAccountId = gtmAccountId ? encrypt(gtmAccountId) : null;
  const encContainerId = gtmContainerId ? encrypt(gtmContainerId) : null;

  db.prepare(`
    INSERT INTO sessions (id, name, project_path, gtm_account_id, gtm_container_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionName, projectPath, encAccountId, encContainerId, now, now);

  setActiveSessionId(id);
  return readSessionById(id)!;
}

export function updateSession(id: string, updates: Partial<SessionData>): SessionData | null {
  const db = getDb();
  const now = new Date().toISOString();

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.projectPath !== undefined) { fields.push('project_path = ?'); values.push(updates.projectPath); }
  if (updates.gtmConfig !== undefined) {
    fields.push('gtm_account_id = ?'); values.push(updates.gtmConfig?.accountId ? encrypt(updates.gtmConfig.accountId) : null);
    fields.push('gtm_container_id = ?'); values.push(updates.gtmConfig?.containerId ? encrypt(updates.gtmConfig.containerId) : null);
  }
  if (updates.oauthCredentials !== undefined) {
    fields.push('google_client_id = ?'); values.push(updates.oauthCredentials?.clientId ? encrypt(updates.oauthCredentials.clientId) : null);
    fields.push('google_client_secret = ?'); values.push(updates.oauthCredentials?.clientSecret ? encrypt(updates.oauthCredentials.clientSecret) : null);
  }
  if (updates.completedSkills !== undefined) { fields.push('completed_skills = ?'); values.push(JSON.stringify(updates.completedSkills)); }
  if (updates.currentSkill !== undefined) { fields.push('current_skill = ?'); values.push(updates.currentSkill); }
  if (updates.skillSessions !== undefined) { fields.push('skill_sessions = ?'); values.push(JSON.stringify(updates.skillSessions)); }
  if (updates.compactOutputs !== undefined) { fields.push('compact_outputs = ?'); values.push(JSON.stringify(updates.compactOutputs)); }

  values.push(id);
  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return readSessionById(id);
}

export function resetSession(): void {
  setActiveSessionId(null);
}

export function deleteSession(id: string): boolean {
  const db = getDb();
  const activeId = getActiveSessionId();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  if (activeId === id) {
    setActiveSessionId(null);
  }
  return true;
}

export function markSkillComplete(
  sessionId: string,
  skillName: string,
  claudeSessionId: string,
  output: unknown
): SessionData | null {
  const current = readSessionById(sessionId);
  if (!current) return null;

  const completedSkills = [...current.completedSkills];
  if (!completedSkills.includes(skillName)) {
    completedSkills.push(skillName);
  }

  const skillSessions = { ...current.skillSessions, [skillName]: claudeSessionId };

  // Write to normalized session_outputs table (single source of truth)
  if (output !== null && output !== undefined) {
    upsertSessionOutput(sessionId, skillName, JSON.stringify(output));
  }

  // Compute and store compact representation so future context builders read from DB
  const compact = computeCompactOutput(skillName, output, current);
  const compactOutputs = compact
    ? { ...current.compactOutputs, [skillName]: compact }
    : current.compactOutputs;

  // Derive and persist audit_coverage_pct from the audit report when audit completes
  if (skillName === 'gtm-analytics-audit' && output && typeof output === 'object') {
    const report = output as Record<string, unknown>;
    const summary = report.summary as Record<string, unknown> | undefined;
    if (summary) {
      let pct = 0;
      if (typeof summary.coveragePercent === 'number') {
        pct = summary.coveragePercent;
      } else if (typeof summary.analyticsReadiness === 'string') {
        pct = parseFloat(summary.analyticsReadiness) || 0;
      }
      if (pct > 0) {
        const db = getDb();
        db.prepare('UPDATE sessions SET audit_coverage_pct = ? WHERE id = ?').run(pct, sessionId);
      }
    }
  }

  return updateSession(sessionId, {
    completedSkills,
    skillSessions,
    currentSkill: null,
    compactOutputs,
  });
}

/**
 * Patches the stored audit report in-place after Prepare Elements resolves gaps.
 * - Flips elements in `filesModified` to tracking: true
 * - Recalculates summary totals and coverage %
 * - Updates session_outputs and compactOutputs in DB
 * - No Claude run needed — pure code
 */
export function patchAuditReportAfterResolve(sessionId: string, filesModified: string[]): void {
  if (!filesModified.length) return;

  const raw = getSessionOutput(sessionId, 'gtm-analytics-audit');
  if (!raw || typeof raw !== 'object') return;

  const report = raw as Record<string, unknown>;
  const categorized = report.categorized as Record<string, {
    total: number; tracked: number; untracked: number;
    elements?: Array<{ file: string; tracking: boolean; [k: string]: unknown }>;
  }> | undefined;
  if (!categorized) return;

  // Normalise filesModified to lowercase basenames for fuzzy matching
  const modifiedSet = new Set(filesModified.map(f => f.replace(/\\/g, '/').toLowerCase()));

  let totalTrackedDelta = 0;

  for (const cat of Object.values(categorized)) {
    if (!cat.elements) continue;
    for (const el of cat.elements) {
      const elFile = (el.file ?? '').replace(/\\/g, '/').toLowerCase();
      const isModified = modifiedSet.has(elFile) ||
        [...modifiedSet].some(m => elFile.endsWith(m) || m.endsWith(elFile));
      if (isModified && !el.tracking) {
        el.tracking = true;
        cat.tracked = (cat.tracked ?? 0) + 1;
        cat.untracked = Math.max(0, (cat.untracked ?? 0) - 1);
        totalTrackedDelta++;
      }
    }
  }

  if (totalTrackedDelta === 0) return; // nothing changed

  // Recalculate summary
  const summary = report.summary as Record<string, unknown> | undefined;
  if (summary) {
    const withTracking = ((summary.withTracking as number) ?? 0) + totalTrackedDelta;
    const withoutTracking = Math.max(0, ((summary.withoutTracking as number) ?? 0) - totalTrackedDelta);
    const total = (summary.totalClickableElements as number) ?? (withTracking + withoutTracking);
    const pct = total > 0 ? Math.round((withTracking / total) * 100) : 0;
    summary.withTracking = withTracking;
    summary.withoutTracking = withoutTracking;
    summary.analyticsReadiness = `${pct}%`;
    summary.coveragePercent = pct;
  }

  // Persist updated report
  upsertSessionOutput(sessionId, 'gtm-analytics-audit', JSON.stringify(report));

  // Rebuild compact output from patched report
  const session = readSessionById(sessionId);
  if (!session) return;
  const compact = computeCompactOutput('gtm-analytics-audit', report, session);
  if (!compact) return;

  const compactOutputs = { ...session.compactOutputs, 'gtm-analytics-audit': compact };
  updateSession(sessionId, { compactOutputs });

  // Update coverage pct in sessions table
  const pct = (report.summary as Record<string, unknown> | undefined)?.coveragePercent as number | undefined;
  if (typeof pct === 'number' && pct > 0) {
    getDb().prepare('UPDATE sessions SET audit_coverage_pct = ? WHERE id = ?').run(pct, sessionId);
  }
}

function computeCompactOutput(skillName: string, output: unknown, session: SessionData): unknown {
  if (!output || typeof output !== 'object') return null;
  const raw = output as Record<string, unknown>;

  switch (skillName) {
    case 'gtm-analytics-audit': {
      const summary = raw.summary as Record<string, unknown> | undefined;
      const metadata = raw.metadata as Record<string, unknown> | undefined;
      const categorized = raw.categorized as Record<string, { total: number; tracked: number; untracked: number; elements?: unknown[] }> | undefined;
      const recommendations = raw.recommendations as Array<{ priority: string; action: string }> | undefined;
      const existingTracking = raw.existingTracking as { libraries?: string[]; coverage?: string } | undefined;

      // For DOM step: extract elements needing DOM standardization grouped by file.
      // An element needs DOM work if it is missing tracking, OR missing a conforming id, OR missing js-track class.
      type AuditEl = { file: string; line: number; text: string; id: string | null; classes: string[]; tracking: boolean; recommendation: string };
      const KNOWN_DOM_CATS = ['cta', 'nav', 'form', 'outbound', 'media', 'video', 'audio', 'download', 'pricing', 'auth', 'demo'];
      function hasConformingId(id: string | null | undefined): boolean {
        if (!id) return false;
        const parts = id.split('_');
        return parts.length >= 3 && KNOWN_DOM_CATS.includes(parts[0]);
      }
      function hasJsTrack(classes: string[] | undefined): boolean {
        return Array.isArray(classes) && classes.includes('js-track');
      }
      function elementNeedsDomWork(el: AuditEl): boolean {
        return !el.tracking || !hasConformingId(el.id) || !hasJsTrack(el.classes);
      }
      const byFile: Record<string, AuditEl[]> = {};
      if (categorized) {
        for (const data of Object.values(categorized)) {
          if (!data.elements) continue;
          for (const el of data.elements as AuditEl[]) {
            if (!elementNeedsDomWork(el)) continue;
            if (!byFile[el.file]) byFile[el.file] = [];
            byFile[el.file].push(el);
          }
        }
      }

      // Derive scannedFiles: use filesScannedList if Claude returned it, else fall back to
      // the union of all files mentioned in categorized elements (tracked + untracked)
      type AuditElAny = { file: string; tracking: boolean };
      let scannedFiles: string[] = [];
      if (Array.isArray(metadata?.filesScannedList)) {
        scannedFiles = (metadata.filesScannedList as string[]).filter(f => typeof f === 'string');
      } else if (categorized) {
        const fileSet = new Set<string>();
        for (const data of Object.values(categorized)) {
          for (const el of (data.elements ?? []) as AuditElAny[]) {
            if (el.file) fileSet.add(el.file);
          }
        }
        scannedFiles = Array.from(fileSet);
      }

      return {
        summary: {
          totalClickableElements: summary?.totalClickableElements,
          withTracking: summary?.withTracking,
          withoutTracking: summary?.withoutTracking,
          analyticsReadiness: summary?.analyticsReadiness,
        },
        metadata: {
          framework: metadata?.framework,
          filesScanned: metadata?.filesScanned,
        },
        catSummary: categorized
          ? Object.entries(categorized)
              .filter(([, d]) => d.untracked > 0)
              .map(([cat, d]) => ({ cat, untracked: d.untracked }))
          : [],
        existingTracking: existingTracking ?? null,
        topRecommendations: (recommendations ?? []).slice(0, 5).map(r => ({ priority: r.priority, action: r.action })),
        untrackedByFile: byFile,
        scannedFiles,
      };
    }

    case 'gtm-dom-standardization': {
      const changes = raw.changes as Array<{ filePath: string; status: string }> | undefined;
      return {
        filesModified: raw.filesModified,
        appliedFiles: changes?.filter(c => c.status === 'applied').map(c => c.filePath) ?? [],
        appliedCount: changes?.filter(c => c.status === 'applied').length ?? 0,
      };
    }

    case 'gtm-strategy': {
      const events = raw.events as Array<{ name: string; priority: string; implementationMethod?: string; gtmResourcesToCreate?: unknown; parameters: Array<{ name: string }> }> | undefined;
      const summary = raw.summary as Record<string, unknown> | undefined;
      return {
        summary,
        events: events?.map(e => ({
          name: e.name,
          priority: e.priority,
          implementationMethod: e.implementationMethod ?? 'datalayer_push',
          gtmResourcesToCreate: e.gtmResourcesToCreate ?? null,
          params: e.parameters?.map(p => p.name) ?? [],
        })) ?? [],
      };
    }

    case 'gtm-implementation': {
      const gtmRes = raw.gtmResources as Record<string, unknown> | undefined;
      return {
        filesModified: raw.filesModified,
        eventsImplemented: (raw.eventsImplemented as string[] | undefined) ?? [],
        filesEdited: (raw.filesEdited as string[] | undefined) ?? [],
        gtmResources: gtmRes ? {
          variablesCreated: gtmRes.variablesCreated ?? 0,
          triggersCreated: gtmRes.triggersCreated ?? 0,
          tagsCreated: gtmRes.tagsCreated ?? 0,
          versionId: gtmRes.versionId ?? null,
          published: gtmRes.published ?? false,
        } : null,
        // legacy field kept for reporting context
        gtmObjectsCreated: raw.gtmObjectsCreated,
      };
    }

    case 'gtm-testing': {
      return {
        passed: raw.passed,
        failed: raw.failed,
        events: raw.events,
      };
    }

    case 'gtm-reporting': {
      // Reporting output is markdown text — no structured compact needed
      return null;
    }

    default:
      return null;
  }
}


export function activateSession(id: string): SessionData | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, id);
  setActiveSessionId(id);
  return readSessionById(id);
}

function readSessionById(id: string): SessionData | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

function rowToSession(row: Record<string, string>): SessionData {
  const parseJson = (val: string | null | undefined, fallback: unknown) => {
    if (!val) return fallback;
    try { return JSON.parse(val); } catch { return fallback; }
  };

  const rawAccountId = row.gtm_account_id;
  const rawContainerId = row.gtm_container_id;
  const accountId = rawAccountId ? (isEncrypted(rawAccountId) ? decrypt(rawAccountId) : rawAccountId) : null;
  const containerId = rawContainerId ? (isEncrypted(rawContainerId) ? decrypt(rawContainerId) : rawContainerId) : null;

  const rawClientId = row.google_client_id;
  const rawClientSecret = row.google_client_secret;
  const clientId = rawClientId ? (isEncrypted(rawClientId) ? decrypt(rawClientId) : rawClientId) : null;
  const clientSecret = rawClientSecret ? (isEncrypted(rawClientSecret) ? decrypt(rawClientSecret) : rawClientSecret) : null;

  return {
    id: row.id,
    name: row.name ?? null,
    projectPath: row.project_path,
    gtmConfig: accountId
      ? { accountId, containerId: containerId ?? '' }
      : null,
    oauthCredentials: clientId
      ? { clientId, clientSecret: clientSecret ?? '' }
      : null,
    completedSkills: parseJson(row.completed_skills, []) as string[],
    currentSkill: row.current_skill ?? null,
    skillSessions: parseJson(row.skill_sessions, {}) as Record<string, string>,
    compactOutputs: parseJson(row.compact_outputs, {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audit_coverage_pct: parseFloat(row.audit_coverage_pct) || 0,
    resolution_queue: row.resolution_queue ?? '',
    drift_acknowledged: parseInt(row.drift_acknowledged) || 0,
  };
}

export function listSessions(limit = 20, offset = 0): { sessions: SessionData[]; total: number } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
  const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Record<string, string>[];
  return { sessions: rows.map(rowToSession), total };
}
