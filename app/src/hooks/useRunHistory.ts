import { useState, useEffect, useCallback } from 'react'
import { api, type SkillRunHistory } from '../lib/api'
import { useSession } from '../context/SessionContext'

export function useRunHistory(skillName: string) {
  const { session } = useSession()
  const [runs, setRuns] = useState<SkillRunHistory[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!session?.id) return
    setLoading(true)
    try {
      const data = await api.getRunHistory(skillName, session.id, 10)
      setRuns(data)
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }, [skillName, session?.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { runs, loading, refresh }
}
