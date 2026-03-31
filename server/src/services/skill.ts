import { getDb } from '../db.js';

// ---------------------------------------------------------------------------
// Skill quality scoring (0.0-1.0) — extracted from routes/skill.ts
// ---------------------------------------------------------------------------

export function computeSkillScore(
  skillName: string,
  outputLog: string,
  compactOutputs: Record<string, unknown>
): number | null {
  try {
    switch (skillName) {
      case 'gtm-analytics-audit': {
        const withTracking = outputLog.match(/"withTracking"\s*:\s*(\d+)/);
        const total = outputLog.match(/"totalClickableElements"\s*:\s*(\d+)/);
        if (withTracking && total) {
          const t = parseInt(total[1]);
          return t > 0 ? Math.min(1, parseInt(withTracking[1]) / t) : null;
        }
        return null;
      }
      case 'gtm-dom-standardization': {
        const modified = outputLog.match(/"filesModified"\s*:\s*(\d+)/);
        const auditCompact = compactOutputs['gtm-analytics-audit'] as Record<string, unknown> | undefined;
        const untrackedFiles = Object.keys((auditCompact?.untrackedByFile as Record<string, unknown> | undefined) ?? {}).length;
        if (modified && untrackedFiles > 0) return Math.min(1, parseInt(modified[1]) / untrackedFiles);
        return modified ? 1.0 : null;
      }
      case 'gtm-strategy': {
        const events = outputLog.match(/"totalEvents"\s*:\s*(\d+)/);
        if (events) return Math.min(1, parseInt(events[1]) / 10);
        return null;
      }
      case 'gtm-implementation': {
        const files = outputLog.match(/"filesModified"\s*:\s*(\d+)/);
        const tags = outputLog.match(/"tagsCreated"\s*:\s*(\d+)/);
        const planCompact = compactOutputs['gtm-strategy'] as Record<string, unknown> | undefined;
        const expectedEvents = (planCompact?.events as unknown[])?.length ?? 1;
        const f = files ? parseInt(files[1]) : 0;
        const t = tags ? parseInt(tags[1]) : 0;
        return Math.min(1, (f + t) / (expectedEvents * 2));
      }
      case 'gtm-testing': {
        const passed = outputLog.match(/"passed"\s*:\s*(\d+)/);
        const failed = outputLog.match(/"failed"\s*:\s*(\d+)/);
        if (passed) {
          const p = parseInt(passed[1]);
          const f = failed ? parseInt(failed[1]) : 0;
          return p / Math.max(1, p + f);
        }
        return null;
      }
      case 'gtm-reporting': {
        const hasHeaders = /^#{1,2} /m.test(outputLog);
        return outputLog.length > 500 && hasHeaders ? 1.0 : 0.5;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persist score to skill_runs after execution
// ---------------------------------------------------------------------------

export function persistSkillScore(skillRunId: string, score: number | null): void {
  if (score === null) return;
  const db = getDb();
  db.prepare('UPDATE skill_runs SET score = ?, progress_pct = ? WHERE id = ?')
    .run(score, Math.round(score * 100), skillRunId);
}

// ---------------------------------------------------------------------------
// Get history rows for a skill
// ---------------------------------------------------------------------------

export function getSkillHistory(sessionId: string, skillName: string, limit = 10): unknown[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, status, started_at, completed_at, duration_ms, input_tokens, output_tokens,
           cost_usd, adapter_type, error_message, score, retry_count, output_log, prompt_sent
    FROM skill_runs
    WHERE session_id = ? AND skill_name = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(sessionId, skillName, limit);
}
