import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const skillNameSchema = z.string().min(1, 'skillName is required');

const gtmConfigSchema = z.object({
  accountId: z.string().min(1),
  containerId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Session routes
// ---------------------------------------------------------------------------

export const CreateSessionSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
  gtmConfig: gtmConfigSchema.optional(),
  name: z.string().optional(),
  forceNew: z.boolean().optional(),
});

const oauthCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const PatchSessionSchema = z.object({
  name: z.string().optional(),
  gtmConfig: gtmConfigSchema.nullable().optional(),
  oauthCredentials: oauthCredentialsSchema.nullable().optional(),
});

export const SkillCompleteSchema = z.object({
  skillName: skillNameSchema,
  claudeSessionId: z.string().min(1, 'claudeSessionId is required'),
  output: z.unknown().optional(),
});

export const ValidatePathSchema = z.object({
  path: z.string().min(1, 'path is required'),
});

// ---------------------------------------------------------------------------
// Skill routes
// ---------------------------------------------------------------------------

export const RunSkillSchema = z.object({
  skillName: skillNameSchema,
  prompt: z.string().default(''),
  adapterType: z.string().optional(),
  scopedPages: z.array(z.string()).optional(),
  pageContext: z.string().optional(),
});

export const RunParallelSchema = z.object({
  skillName: skillNameSchema,
  workers: z.array(z.object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    scope: z.string().min(1),
  })).min(1),
});

export const SelectAdapterSchema = z.object({
  type: z.string().min(1, 'type is required'),
});

export const TestAdapterSchema = z.object({
  type: z.string().min(1, 'type is required'),
});

// ---------------------------------------------------------------------------
// Files routes
// ---------------------------------------------------------------------------

export const DiffSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
  proposedContent: z.string(),
});

export const ApplyFilesSchema = z.object({
  changes: z.array(z.object({
    filePath: z.string().min(1),
    proposedContent: z.string(),
    action: z.enum(['apply', 'skip']),
  })).min(1),
});

export const SnapshotSchema = z.object({
  skillName: skillNameSchema,
  filePaths: z.array(z.string().min(1)).min(1),
});

export const RestoreSchema = z.object({
  skillName: skillNameSchema,
});

// ---------------------------------------------------------------------------
// Approvals routes
// ---------------------------------------------------------------------------

export const ApprovalNoteSchema = z.object({
  note: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Config routes
// ---------------------------------------------------------------------------

export const PutSkillConfigSchema = z.object({
  sectionOverrides: z.record(z.string(), z.string()).optional(),
  additionalInstructions: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Validation helper — returns 400 with structured error on failure
// ---------------------------------------------------------------------------

import type { Request, Response } from 'express';

export function validate<T>(
  schema: z.ZodSchema<T>,
  req: Request,
  res: Response
): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issues = result.error.issues.map((e: z.ZodIssue) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({ error: 'VALIDATION_ERROR', message: issues[0]?.message ?? 'Invalid request', errors: issues });
    return null;
  }
  return result.data;
}
