import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useSessionHistory } from '@/hooks/useSessionHistory'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { PIPELINE_STEPS } from '@/lib/constants'
import { SkeletonRows } from '@/components/Skeleton'
import type { SessionData } from '@/types/session'
import type { SkillRunHistory } from '@/lib/api'

export default function HistoryPage() {
  const { data, isLoading, error } = useSessionHistory()
  const { session: activeSession, refreshSession } = useSession()
  const navigate = useNavigate()

  async function handleResume(id: string) {
    try {
      await api.resumeSession(id)
      await refreshSession()
      navigate('/')
    } catch (err) {
      console.error('Failed to resume session:', err)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">History</h1>
          <p className="text-sm text-muted-foreground mt-1">Previous Google Tag Manager Automation Engine sessions.</p>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="h-9 px-4 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors shrink-0"
        >
          New Session
        </button>
      </div>

      {isLoading && <SkeletonRows rows={4} />}

      {error && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          Failed to load history.
        </div>
      )}

      {data?.sessions.length === 0 && (
        <div className="border border-border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No previous sessions.</p>
        </div>
      )}

      {data && data.sessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {data.total} session{data.total !== 1 ? 's' : ''}
          </p>
          <div className="border border-border divide-y divide-border">
            {data.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={session.id === activeSession?.id}
                onResume={handleResume}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Extract Claude result summary from output_log
// ---------------------------------------------------------------------------

function extractResultSummary(outputLog: string | null | undefined): string | null {
  if (!outputLog) return null
  // The output_log is a stream of newline-delimited JSON objects.
  // Find the last {"type":"result",...} object and return its "result" text.
  const marker = '"type":"result"'
  let lastIdx = -1
  let searchFrom = 0
  while (true) {
    const idx = outputLog.indexOf(marker, searchFrom)
    if (idx === -1) break
    lastIdx = idx
    searchFrom = idx + 1
  }
  if (lastIdx === -1) return null

  // Walk back to find the opening '{' of this object
  let start = lastIdx
  while (start > 0 && outputLog[start] !== '{') start--

  // Walk forward to find the closing '}' (track brace depth)
  let depth = 0
  let end = start
  for (; end < outputLog.length; end++) {
    if (outputLog[end] === '{') depth++
    else if (outputLog[end] === '}') {
      depth--
      if (depth === 0) break
    }
  }

  try {
    const obj = JSON.parse(outputLog.slice(start, end + 1)) as Record<string, unknown>
    if (typeof obj.result === 'string' && obj.result.length > 0) {
      const text = obj.result.trim()
      return text.length > 300 ? text.slice(0, 297) + '...' : text
    }
  } catch { /* fall through */ }
  return null
}

// ---------------------------------------------------------------------------
// Number formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '-'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatCost(usd: number): string {
  if (!usd || usd <= 0) return '-'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function formatTokens(n: number): string {
  if (!n || n <= 0) return '-'
  return n.toLocaleString()
}

// ---------------------------------------------------------------------------
// Score cell
// ---------------------------------------------------------------------------

function ScoreDisplay({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground/40">-</span>
  const pct = Math.round(score * 100)
  const colorClass =
    score >= 0.8
      ? 'text-[oklch(0.4_0.1_150)]'
      : score >= 0.5
      ? 'text-amber-600'
      : 'text-destructive'
  return <span className={`tabular-nums font-mono ${colorClass}`}>{pct}%</span>
}

// ---------------------------------------------------------------------------
// Cost display with color
// ---------------------------------------------------------------------------

function CostDisplay({ usd }: { usd: number }) {
  if (!usd || usd <= 0) return <span className="text-muted-foreground/40">-</span>
  const colorClass =
    usd < 0.5
      ? 'text-[oklch(0.4_0.1_150)]'
      : usd <= 2
      ? 'text-amber-600'
      : 'text-destructive'
  return <span className={`tabular-nums font-mono ${colorClass}`}>{formatCost(usd)}</span>
}

// ---------------------------------------------------------------------------
// SessionRow
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  isActive,
  onResume,
}: {
  session: SessionData
  isActive: boolean
  onResume: (id: string) => void
}) {
  const projectName = session.projectPath.split(/[/\\]/).filter(Boolean).pop() ?? session.projectPath
  const completedCount = session.completedSkills.length
  const nextStep = PIPELINE_STEPS.find(s => !session.completedSkills.includes(s.name))
  const relativeTime = getRelativeTime(session.updatedAt)

  const [expanded, setExpanded] = useState(false)
  const [runData, setRunData] = useState<Record<string, SkillRunHistory | null>>({})
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  async function handleToggle() {
    const willExpand = !expanded
    setExpanded(willExpand)
    if (willExpand && !hasLoaded) {
      setLoadingRuns(true)
      setHasLoaded(true)
      const completedSteps = PIPELINE_STEPS.filter(s => session.completedSkills.includes(s.name))
      const results = await Promise.allSettled(
        completedSteps.map(s =>
          api.getRunHistory(s.name, session.id, 1).then(runs => ({ name: s.name, run: runs[0] ?? null }))
        )
      )
      const map: Record<string, SkillRunHistory | null> = {}
      for (const result of results) {
        if (result.status === 'fulfilled') {
          map[result.value.name] = result.value.run
        }
      }
      setRunData(map)
      setLoadingRuns(false)
    }
  }

  return (
    <div className={`${isActive ? 'bg-muted/30' : ''}`}>
      {/* Row header - clickable to toggle */}
      <div
        className="px-4 py-4 flex items-start gap-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleToggle() }}
      >
        <span className="text-muted-foreground mt-0.5 shrink-0">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[14px] font-semibold truncate">{projectName}</p>
            {isActive && (
              <span className="text-[10px] font-medium border border-[oklch(0.8_0.05_150)] text-[oklch(0.4_0.1_150)] px-1.5 py-0.5 shrink-0">Active</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono mb-2 truncate">{session.projectPath}</p>

          {/* Step pills */}
          <div className="flex flex-wrap gap-1 mb-2">
            {PIPELINE_STEPS.map(step => {
              const complete = session.completedSkills.includes(step.name)
              return (
                <span
                  key={step.name}
                  className={`text-[10px] px-1.5 py-0.5 ${
                    complete
                      ? 'bg-foreground text-background'
                      : 'border border-border text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              )
            })}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {completedCount}/{PIPELINE_STEPS.length} steps complete
            {nextStep && !isActive && <span> &middot; Next: {nextStep.label}</span>}
            <span> &middot; {relativeTime}</span>
          </p>
        </div>

        {!isActive && (
          <button
            onClick={e => { e.stopPropagation(); onResume(session.id) }}
            className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors shrink-0"
          >
            Resume
          </button>
        )}
      </div>

      {/* Expanded metrics table */}
      {expanded && (
        <div className="border-t border-border bg-muted/10">
          {loadingRuns && (
            <div className="px-6 py-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Loading run data...
            </div>
          )}

          {!loadingRuns && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Step</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Duration</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Tokens</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Cost</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Score</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Date</th>
                    <th className="text-right px-6 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">View</th>
                  </tr>
                </thead>
                <tbody>
                  {PIPELINE_STEPS.map(step => {
                    const isComplete = session.completedSkills.includes(step.name)
                    const run = runData[step.name] ?? null
                    const resultSummary = extractResultSummary(run?.output_log)
                    return (
                      <React.Fragment key={step.name}>
                        <tr className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="px-6 py-2 font-medium">
                            <span className={isComplete ? 'text-foreground' : 'text-muted-foreground/50'}>
                              {step.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {run ? formatDuration(run.duration_ms) : <span className="text-muted-foreground/40">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {run ? formatTokens(run.input_tokens + run.output_tokens) : <span className="text-muted-foreground/40">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {run ? <CostDisplay usd={run.cost_usd} /> : <span className="text-muted-foreground/40">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {run ? <ScoreDisplay score={run.score} /> : <span className="text-muted-foreground/40">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {run?.started_at ? formatShortDate(run.started_at) : <span className="text-muted-foreground/40">-</span>}
                          </td>
                          <td className="px-6 py-2 text-right">
                            {run?.id ? (
                              <Link
                                to={`/runs/${run.id}`}
                                className="text-[11px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
                              >
                                View
                              </Link>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )}
                          </td>
                        </tr>
                        {resultSummary && (
                          <tr className="border-b border-border last:border-0 bg-muted/5">
                            <td colSpan={7} className="px-6 py-2">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">{resultSummary}</p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatShortDate(isoString: string): string {
  const normalized = isoString.includes('T') || isoString.endsWith('Z') ? isoString : isoString.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(isoString).toLocaleDateString()
}
