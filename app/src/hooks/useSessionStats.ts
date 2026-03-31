import { useState, useEffect } from 'react'
import { api, type CostSummary, type Approval } from '@/lib/api'

export interface SessionScore {
  skill_name: string
  score: number
  retry_count: number
  duration_ms: number
  started_at: string
}

export interface SessionStats {
  costs: CostSummary | null
  pendingApprovals: number
  scores: SessionScore[]
}

/**
 * Fetches dashboard stats for the active session: costs, pending approvals, skill scores.
 * Extracted from DashboardPage to keep the component focused on rendering.
 */
export function useSessionStats(sessionId: string | undefined): SessionStats {
  const [costs, setCosts] = useState<CostSummary | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [scores, setScores] = useState<SessionScore[]>([])

  useEffect(() => {
    if (!sessionId) return
    api.getCostsSummary(sessionId).then(setCosts).catch(() => {})
    api.getApprovals(sessionId).then((approvals: Approval[]) => {
      setPendingApprovals(approvals.filter(a => a.status === 'pending').length)
    }).catch(() => {})
    api.getSessionScores(sessionId).then(data => setScores(data.scores)).catch(() => {})
  }, [sessionId])

  return { costs, pendingApprovals, scores }
}
