import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';
import { logActivity } from '../services/activity.js';

const router = Router();

interface ApprovalRow {
  id: string;
  session_id: string;
  skill_name: string;
  status: string;
  review_note: string | null;
  payload: string | null;
  created_at: string;
  decided_at: string | null;
}

function mapApproval(row: ApprovalRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    skillName: row.skill_name,
    status: row.status,
    reviewNote: row.review_note,
    payload: row.payload ? (() => { try { return JSON.parse(row.payload!); } catch { return row.payload; } })() : null,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

// GET /api/approvals?sessionId=<id>
router.get('/', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId query param required' });
    return;
  }
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approvals WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as ApprovalRow[];
  res.json(rows.map(mapApproval));
});

// GET /api/approvals/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Approval not found' });
    return;
  }
  res.json(mapApproval(row));
});

// POST /api/approvals/:id/approve
router.post('/:id/approve', (req: Request, res: Response) => {
  const { note } = req.body as { note?: string };
  const db = getDb();
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Approval not found' });
    return;
  }
  db.prepare(`UPDATE approvals SET status = 'approved', review_note = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(note ?? null, req.params.id);
  logActivity(row.session_id, 'approval.approved', 'approval', row.id, { skillName: row.skill_name, note });
  const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow;
  res.json(mapApproval(updated));
});

// POST /api/approvals/:id/reject
router.post('/:id/reject', (req: Request, res: Response) => {
  const { note } = req.body as { note?: string };
  const db = getDb();
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Approval not found' });
    return;
  }
  db.prepare(`UPDATE approvals SET status = 'rejected', review_note = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(note ?? null, req.params.id);
  logActivity(row.session_id, 'approval.rejected', 'approval', row.id, { skillName: row.skill_name, note });
  const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow;
  res.json(mapApproval(updated));
});

// POST /api/approvals/:id/request-revision
router.post('/:id/request-revision', (req: Request, res: Response) => {
  const { note } = req.body as { note?: string };
  const db = getDb();
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Approval not found' });
    return;
  }
  db.prepare(`UPDATE approvals SET status = 'revision_requested', review_note = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(note ?? null, req.params.id);
  logActivity(row.session_id, 'approval.revision_requested', 'approval', row.id, { skillName: row.skill_name, note });
  const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id) as ApprovalRow;
  res.json(mapApproval(updated));
});

export default router;
