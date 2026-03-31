import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

// GET /api/skill/config/:skillName
router.get('/:skillName', (req: Request, res: Response) => {
  const { skillName } = req.params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM skill_config WHERE skill_name = ?').get(skillName) as Record<string, string> | undefined;
  const instrRow = db.prepare('SELECT instructions FROM step_instructions WHERE skill_name = ?').get(skillName) as { instructions: string } | undefined;

  res.json({
    skillName,
    sectionOverrides: JSON.parse(row?.section_overrides ?? '{}'),
    additionalInstructions: instrRow?.instructions ?? '',
    updatedAt: row?.updated_at ?? null,
  });
});

// PUT /api/skill/config/:skillName
router.put('/:skillName', (req: Request, res: Response) => {
  const { skillName } = req.params;
  const { sectionOverrides, additionalInstructions } = req.body as {
    sectionOverrides?: Record<string, string>;
    additionalInstructions?: string;
  };

  const db = getDb();
  const now = new Date().toISOString();

  if (sectionOverrides !== undefined) {
    db.prepare(`
      INSERT INTO skill_config (skill_name, section_overrides, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(skill_name) DO UPDATE SET section_overrides = excluded.section_overrides, updated_at = excluded.updated_at
    `).run(skillName, JSON.stringify(sectionOverrides), now, now);
  }

  if (additionalInstructions !== undefined) {
    db.prepare(`
      INSERT INTO step_instructions (skill_name, instructions, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(skill_name) DO UPDATE SET instructions = excluded.instructions, updated_at = excluded.updated_at
    `).run(skillName, additionalInstructions, now);
  }

  res.json({ success: true, skillName });
});

export default router;
