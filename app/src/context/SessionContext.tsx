import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { SessionData } from '../types/session'
import type { Approval } from '../lib/api'
import { isSkillUnlocked as checkSkillUnlocked, isSkillComplete as checkSkillComplete } from '../lib/session'

interface SessionContextValue {
  session: SessionData | null
  loading: boolean
  error: string | null
  setSession: (updates: Partial<SessionData>) => void
  markSkillComplete: (skillName: string, claudeSessionId: string, output: unknown) => Promise<void>
  resetSession: () => Promise<void>
  switchProject: (id: string) => Promise<void>
  isSkillUnlocked: (skillName: string) => boolean
  isSkillComplete: (skillName: string) => boolean
  refreshSession: () => Promise<void>
  refreshApprovals: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [strategyApproved, setStrategyApproved] = useState(false)

  const refreshSession = useCallback(async () => {
    try {
      const data = await api.getSession()
      setSessionState(data)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('No active session') || msg.includes('404')) {
        setSessionState(null)
      } else {
        setError(msg)
      }
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    refreshSession().finally(() => setLoading(false))
  }, [refreshSession])

  // Multi-tab sync: poll for session state changes every 10s when tab is visible
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (intervalId) return
      intervalId = setInterval(() => {
        refreshSession()
      }, 10_000)
    }

    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSession()
        startPolling()
      } else {
        stopPolling()
      }
    }

    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshSession])

  // Check strategy approval status whenever session changes
  useEffect(() => {
    if (!session?.id) { setStrategyApproved(false); return }
    if (!session.completedSkills.includes('gtm-strategy')) { setStrategyApproved(false); return }
    api.getApprovals(session.id).then((approvals: Approval[]) => {
      setStrategyApproved(approvals.some(a => a.skillName === 'gtm-strategy' && a.status === 'approved'))
    }).catch(() => {})
  }, [session?.id, session?.completedSkills])

  const setSession = useCallback((updates: Partial<SessionData>) => {
    setSessionState(prev => {
      if (!prev) return prev
      return { ...prev, ...updates }
    })
  }, [])

  const markSkillComplete = useCallback(async (skillName: string, claudeSessionId: string, output: unknown) => {
    try {
      const result = await api.markSkillComplete(skillName, claudeSessionId, output)
      setSessionState(result.session)
    } catch (err) {
      console.error('Failed to mark skill complete:', err)
    }
  }, [])

  const resetSession = useCallback(async () => {
    await api.resetSession()
    setSessionState(null)
  }, [])

  const switchProject = useCallback(async (id: string) => {
    const session = await api.resumeSession(id)
    setSessionState(session)
  }, [])

  const refreshApprovals = useCallback(async () => {
    if (!session?.id) return
    try {
      const approvals = await api.getApprovals(session.id)
      setStrategyApproved(approvals.some((a: Approval) => a.skillName === 'gtm-strategy' && a.status === 'approved'))
    } catch { /* non-fatal */ }
  }, [session?.id])

  const isSkillUnlocked = useCallback((skillName: string): boolean => {
    return checkSkillUnlocked(skillName, session, strategyApproved)
  }, [session, strategyApproved])

  const isSkillComplete = useCallback((skillName: string): boolean => {
    return checkSkillComplete(skillName, session)
  }, [session])

  return (
    <SessionContext.Provider value={{
      session,
      loading,
      error,
      setSession,
      markSkillComplete,
      resetSession,
      switchProject,
      isSkillUnlocked,
      isSkillComplete,
      refreshSession,
      refreshApprovals,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
