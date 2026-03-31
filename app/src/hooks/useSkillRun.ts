import { useState, useCallback, useRef, useEffect } from 'react'

export interface ActivityEvent {
  type: 'tool_use' | 'tool_result'
  tool: string
  label: string
  input?: Record<string, unknown>
}

interface SkillRunOptions {
  onComplete?: (claudeSessionId: string | null, fullOutput: string, diskReport?: unknown, score?: number) => void
  onError?: (error: string) => void
  onEvent?: (eventName: string, data: Record<string, unknown>) => void
}

function parseSkillError(rawMessage: string, code?: string): string {
  if (code === 'CLAUDE_NOT_FOUND') {
    return 'Claude CLI not found. Install Claude Code from claude.ai/code and ensure it is in your PATH.'
  }
  if (code === 'CLAUDE_AUTH_REQUIRED') {
    return 'Claude authentication required. Run `claude login` in your terminal and try again.'
  }
  if (code === 'SKILL_ALREADY_RUNNING') {
    return rawMessage
  }
  const msg = rawMessage.toLowerCase()
  if (msg.includes('malformed json') || (msg.includes('malformed') && msg.includes('json'))) {
    return `Output parsing failed: the AI produced malformed JSON. Try re-running with more specific instructions in the Additional Instructions field. (${rawMessage})`
  }
  if (msg.includes('enoent') || msg.includes('not found')) {
    return 'File not found. The project path may have changed or a file was moved. Check your project path in Settings.'
  }
  if (msg.includes('skill_timeout') || msg.includes('timed out') || msg.includes('timeout')) {
    return 'Skill timed out after 10 minutes with no output. Try reducing the project scope or re-running.'
  }
  return rawMessage
}

export function useSkillRun(options: SkillRunOptions = {}) {
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [retryCount, setRetryCount] = useState(0)
  const [retryReason, setRetryReason] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastEventIdRef = useRef<number>(0)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const run = useCallback((skillName: string, prompt: string, projectPath: string, scopedPages?: string[]) => {
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const stopTimer = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }

    const controller = new AbortController()
    abortRef.current = controller

    setIsRunning(true)
    setOutput('')
    setError(null)
    setElapsedMs(0)
    setActivity([])
    setRetryCount(0)
    setRetryReason(null)
    setScore(null)
    setActiveRunId(null)
    lastEventIdRef.current = 0
    startTimeRef.current = Date.now()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
    }, 500)

    fetch('/api/skill/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillName, prompt, projectPath, ...(scopedPages && scopedPages.length > 0 ? { scopedPages } : {}) }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(body => {
            throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
          }).catch(() => {
            throw new Error(`HTTP ${res.status} ${res.statusText || 'error'} - server returned no response body`)
          })
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        // SSE format: "id: <seq>\nevent: <name>\ndata: <json>\n\n"
        function processBuffer() {
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''

          for (const block of blocks) {
            if (!block.trim()) continue

            let eventName = 'message'
            let dataLine = ''
            let eventId = ''

            for (const line of block.split('\n')) {
              if (line.startsWith('id: ')) {
                eventId = line.slice(4).trim()
              } else if (line.startsWith('event: ')) {
                eventName = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                dataLine = line.slice(6)
              }
            }

            if (eventId) {
              const seq = parseInt(eventId, 10)
              if (!isNaN(seq)) lastEventIdRef.current = seq
            }

            if (!dataLine) continue

            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>

              if (eventName === 'run_id') {
                const runId = typeof data.runId === 'string' ? data.runId : null
                if (runId) setActiveRunId(runId)
              } else if (eventName === 'activity') {
                setActivity(prev => [...prev, data as unknown as ActivityEvent])
              } else if (eventName === 'chunk') {
                if (data.type === 'content' && typeof data.text === 'string') {
                  setOutput(prev => prev + data.text)
                }
              } else if (eventName === 'retry') {
                const attempt = typeof data.attempt === 'number' ? data.attempt : 1
                const reason = typeof data.reason === 'string' ? data.reason : 'unknown'
                setRetryCount(attempt)
                setRetryReason(reason)
                // Clear output and activity for fresh retry display
                setOutput('')
                setActivity([])
              } else if (eventName === 'complete') {
                const claudeSessionId = typeof data.sessionId === 'string' ? data.sessionId : null
                const diskReport = data.diskReport ?? undefined
                const completedScore = typeof data.score === 'number' ? data.score : null
                const completedRetryCount = typeof data.retryCount === 'number' ? data.retryCount : 0
                setScore(completedScore)
                setRetryCount(completedRetryCount)
                setRetryReason(null)
                stopTimer()
                setIsRunning(false)
                setOutput(prev => {
                  options.onComplete?.(claudeSessionId, prev, diskReport, completedScore ?? undefined)
                  return prev
                })
              } else if (eventName === 'timeout') {
                const rawMsg = typeof data.message === 'string' ? data.message : 'Skill timed out after 10 minutes.'
                stopTimer()
                setError(rawMsg)
                setIsRunning(false)
                options.onError?.(rawMsg)
              } else if (eventName === 'error') {
                const rawMsg = typeof data.message === 'string' ? data.message : 'Unknown error'
                const code = typeof data.code === 'string' ? data.code : undefined
                const msg = parseSkillError(rawMsg, code)
                stopTimer()
                setError(msg)
                setIsRunning(false)
                options.onError?.(msg)
              }

              // Emit all events to the generic onEvent callback so pages can
              // handle custom events such as confidence_update without hook changes.
              options.onEvent?.(eventName, data)
            } catch {
              // ignore parse errors
            }
          }
        }

        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (done) {
              stopTimer()
              setIsRunning(false)
              return
            }
            buffer += decoder.decode(value, { stream: true })
            processBuffer()
            return pump()
          })
        }

        return pump()
      })
      .catch(err => {
        stopTimer()
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : String(err)
        setError(parseSkillError(msg))
        setIsRunning(false)
        options.onError?.(msg)
      })
  }, [options])

  const cancel = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    abortRef.current?.abort()
    setIsRunning(false)
    setElapsedMs(0)
  }, [])

  // Reconnect to an in-progress run by runId, replaying from last received event
  const reconnect = useCallback((runId: string) => {
    if (abortRef.current) abortRef.current.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setIsRunning(true)
    setError(null)
    setActiveRunId(runId)
    startTimeRef.current = Date.now()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
    }, 500)

    const stopTimer = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }

    const headers: Record<string, string> = {}
    if (lastEventIdRef.current > 0) {
      headers['Last-Event-ID'] = String(lastEventIdRef.current)
    }

    fetch(`/api/skill/run/${runId}/stream`, { signal: controller.signal, headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')
        const decoder = new TextDecoder()
        let buffer = ''

        function processBuffer() {
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            if (!block.trim() || block.startsWith(':')) continue
            let eventName = 'message'
            let dataLine = ''
            let eventId = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('id: ')) eventId = line.slice(4).trim()
              else if (line.startsWith('event: ')) eventName = line.slice(7).trim()
              else if (line.startsWith('data: ')) dataLine = line.slice(6)
            }
            if (eventId) {
              const seq = parseInt(eventId, 10)
              if (!isNaN(seq)) lastEventIdRef.current = seq
            }
            if (!dataLine) continue
            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>
              if (eventName === 'activity') {
                setActivity(prev => [...prev, data as unknown as ActivityEvent])
              } else if (eventName === 'chunk' && data.type === 'content' && typeof data.text === 'string') {
                setOutput(prev => prev + data.text)
              } else if (eventName === 'complete') {
                const claudeSessionId = typeof data.sessionId === 'string' ? data.sessionId : null
                const completedScore = typeof data.score === 'number' ? data.score : null
                setScore(completedScore)
                stopTimer()
                setIsRunning(false)
                setOutput(prev => { options.onComplete?.(claudeSessionId, prev, undefined, completedScore ?? undefined); return prev })
              } else if (eventName === 'timeout') {
                const rawMsg = typeof data.message === 'string' ? data.message : 'Skill timed out.'
                stopTimer(); setError(rawMsg); setIsRunning(false); options.onError?.(rawMsg)
              } else if (eventName === 'error') {
                const rawMsg = typeof data.message === 'string' ? data.message : 'Unknown error'
                const code = typeof data.code === 'string' ? data.code : undefined
                const msg = parseSkillError(rawMsg, code)
                stopTimer(); setError(msg); setIsRunning(false); options.onError?.(msg)
              }
              options.onEvent?.(eventName, data)
            } catch { /* ignore */ }
          }
        }

        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (done) { stopTimer(); setIsRunning(false); return }
            buffer += decoder.decode(value, { stream: true })
            processBuffer()
            return pump()
          })
        }
        return pump()
      })
      .catch(err => {
        stopTimer()
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : String(err)
        setError(parseSkillError(msg))
        setIsRunning(false)
      })
  }, [options])

  return { output, isRunning, error, elapsedMs, activity, retryCount, retryReason, score, activeRunId, run, reconnect, stop: cancel, cancel }
}

export interface ParallelWorkerConfig {
  id: string
  prompt: string
  scope: string
}

export interface WorkerState {
  id: string
  activity: ActivityEvent[]
  output: string
  complete: boolean
}

interface ParallelSkillRunOptions {
  onAllComplete?: (results: Record<string, string>) => void
  onError?: (error: string) => void
}

export function useParallelSkillRun(options: ParallelSkillRunOptions = {}) {
  const [workers, setWorkers] = useState<WorkerState[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const outputsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const run = useCallback((skillName: string, workerConfigs: ParallelWorkerConfig[]) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const initialWorkers: WorkerState[] = workerConfigs.map(w => ({
      id: w.id, activity: [], output: '', complete: false,
    }))
    setWorkers(initialWorkers)
    setIsRunning(true)
    setError(null)
    setElapsedMs(0)
    outputsRef.current = {}
    startTimeRef.current = Date.now()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
    }, 500)

    const stopTimer = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }

    fetch('/api/skill/run-parallel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillName, workers: workerConfigs }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) return res.json().then(body => { throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`) }).catch(() => { throw new Error(`HTTP ${res.status} ${res.statusText || 'error'} - server returned no response body`) })
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')
        const decoder = new TextDecoder()
        let buffer = ''

        function processBuffer() {
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            if (!block.trim()) continue
            let eventName = 'message'
            let dataLine = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim()
              else if (line.startsWith('data: ')) dataLine = line.slice(6)
            }
            if (!dataLine) continue
            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>
              const workerId = data.workerId as string | undefined

              if (eventName === 'activity' && workerId) {
                setWorkers(prev => prev.map(w => w.id === workerId
                  ? { ...w, activity: [...w.activity, data as unknown as ActivityEvent] }
                  : w
                ))
              } else if (eventName === 'chunk' && workerId && data.type === 'content') {
                const text = data.text as string
                outputsRef.current[workerId] = (outputsRef.current[workerId] ?? '') + text
                setWorkers(prev => prev.map(w => w.id === workerId
                  ? { ...w, output: outputsRef.current[workerId] }
                  : w
                ))
              } else if (eventName === 'worker-complete' && workerId) {
                setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, complete: true } : w))
              } else if (eventName === 'all-complete') {
                stopTimer()
                setIsRunning(false)
                options.onAllComplete?.(outputsRef.current)
              } else if (eventName === 'error') {
                const msg = typeof data.message === 'string' ? data.message : 'Unknown error'
                stopTimer()
                setError(msg)
                setIsRunning(false)
                options.onError?.(msg)
              }
            } catch { /* ignore */ }
          }
        }

        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (done) { stopTimer(); setIsRunning(false); return }
            buffer += decoder.decode(value, { stream: true })
            processBuffer()
            return pump()
          })
        }
        return pump()
      })
      .catch(err => {
        stopTimer()
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setIsRunning(false)
        options.onError?.(msg)
      })
  }, [options])

  const cancel = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    abortRef.current?.abort()
    setIsRunning(false)
    setElapsedMs(0)
  }, [])

  return { workers, isRunning, error, elapsedMs, run, cancel }
}
