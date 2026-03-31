import { getDb } from '../db.js';

// ---------------------------------------------------------------------------
// Activity log helper — replaces the copy-pasted logActivity() in each route
// ---------------------------------------------------------------------------

export function logActivity(
  sessionId: string,
  eventType: string,
  entityType: string,
  entityId: string,
  detail: unknown
): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO activity_log (session_id, event_type, entity_type, entity_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(sessionId, eventType, entityType, entityId, JSON.stringify(detail));
  } catch { /* non-fatal */ }
}
