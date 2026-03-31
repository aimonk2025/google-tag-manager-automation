import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '@/lib/constants'

export type GtmHealthStatus = 'ok' | 'auth_error' | 'rate_limited' | 'quota_exceeded' | 'not_configured' | 'unreachable' | 'checking'

export interface GtmHealthEvent {
  status: GtmHealthStatus
  detail: string
  retryAfter?: number
  account?: string | null
}

export function useGtmHealth(sessionId: string | null | undefined) {
  const [health, setHealth] = useState<GtmHealthEvent>({ status: 'checking', detail: 'Checking GTM connection...' })
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const check = useCallback(() => {
    if (!sessionId) {
      setHealth({ status: 'not_configured', detail: 'No active session.' })
      return
    }

    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setHealth({ status: 'checking', detail: 'Checking GTM connection...' })

    const url = `${API_BASE}/gtm/health-stream?sessionId=${encodeURIComponent(sessionId)}`

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // Parse SSE lines
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as GtmHealthEvent
                setHealth(event)
                setLastChecked(new Date())
              } catch {
                // malformed event, ignore
              }
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setHealth({ status: 'unreachable', detail: 'Could not reach the GTM health endpoint.' })
        setLastChecked(new Date())
      })
  }, [sessionId])

  // Check on mount and when sessionId changes
  useEffect(() => {
    check()
    return () => { abortRef.current?.abort() }
  }, [check])

  return { health, lastChecked, recheck: check }
}
