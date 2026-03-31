import { PIPELINE_STEPS } from './constants'
import type { SessionData } from '../types/session'

/**
 * Pure function — determines if a skill step is accessible to the user.
 * Extracted from SessionContext so it can be tested independently.
 *
 * Rules:
 * - First step: unlocked if a project path exists
 * - Any step: all preceding steps must be complete
 * - gtm-implementation: additionally requires strategy to be approved
 *   AND audit coverage must be >= 90% (or 0 meaning no audit run yet)
 */
export function isSkillUnlocked(
  skillName: string,
  session: SessionData | null,
  strategyApproved: boolean
): boolean {
  if (!session) return false

  const idx = PIPELINE_STEPS.findIndex(s => s.name === skillName)
  if (idx < 0) return false
  if (idx === 0) return session.projectPath.length > 0

  const prevComplete = PIPELINE_STEPS.slice(0, idx).every(s =>
    session.completedSkills.includes(s.name)
  )
  if (!prevComplete) return false

  if (skillName === 'gtm-implementation') {
    if (!strategyApproved) return false
    if (session.audit_coverage_pct > 0 && session.audit_coverage_pct < 90) return false
    return true
  }

  return true
}

/**
 * Pure function — check if a skill has been completed in this session.
 */
export function isSkillComplete(skillName: string, session: SessionData | null): boolean {
  return session?.completedSkills.includes(skillName) ?? false
}
