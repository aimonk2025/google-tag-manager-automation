import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { api, type SkillRunHistory } from '@/lib/api'
import { PIPELINE_STEPS } from '@/lib/constants'
import { SkeletonRows } from '@/components/Skeleton'

const SKILL_LABELS: Record<string, string> = {
  'gtm-analytics-audit': 'Audit',
  'gtm-dom-standardization': 'Prepare Elements',
  'gtm-strategy': 'Strategy',
  'gtm-implementation': 'Implementation',
  'gtm-testing': 'Testing',
  'gtm-reporting': 'Reporting',
}

const ALL_SKILLS = PIPELINE_STEPS.map(s => s.name)

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatDate(iso: string): string {
  const normalized = iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  )
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.001) return `$${usd.toFixed(5)}`
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'text-[oklch(0.4_0.1_150)]'
  if (score >= 0.5) return 'text-amber-600'
  return 'text-destructive'
}

type RunWithSkill = SkillRunHistory & { skillName: string }

function RunTableRow({ run }: { run: RunWithSkill }) {
  const isError = run.status === 'error'
  const hasRetries = run.retry_count > 0 && !isError
  const borderClass = isError
    ? 'border-l-2 border-l-destructive'
    : hasRetries
    ? 'border-l-2 border-l-amber-400'
    : 'border-l-2 border-l-transparent'

  const statusColors: Record<string, string> = {
    complete: 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]',
    error: 'text-destructive border-destructive/40',
    running: 'text-muted-foreground border-border',
    retried: 'text-amber-600 border-amber-300',
  }

  const tokens = run.input_tokens + run.output_tokens

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 text-[12px] hover:bg-muted/20 transition-colors border-b border-border last:border-b-0 ${borderClass}`}>
      <span className="w-28 shrink-0 font-medium truncate">
        {SKILL_LABELS[run.skillName] ?? run.skillName}
      </span>
      <span className="w-32 shrink-0 text-muted-foreground tabular-nums">{formatDate(run.started_at)}</span>
      <span className="w-16 shrink-0 tabular-nums">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</span>
      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
        {tokens > 0 ? tokens.toLocaleString() : '-'}
      </span>
      <span className="w-16 shrink-0 tabular-nums">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</span>
      <span className={`w-12 shrink-0 font-mono tabular-nums ${run.score !== null ? scoreColor(run.score) : 'text-muted-foreground/40'}`}>
        {run.score !== null ? `${Math.round(run.score * 100)}%` : '-'}
      </span>
      <span className="w-14 shrink-0">
        {run.retry_count > 0 ? (
          <span className="text-[10px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
            x{run.retry_count}
          </span>
        ) : (
          <span className="text-muted-foreground/40">-</span>
        )}
      </span>
      <span className="w-20 shrink-0">
        <span className={`text-[10px] font-medium border px-1.5 py-0.5 ${statusColors[run.status] ?? 'text-muted-foreground border-border'}`}>
          {run.status}
        </span>
      </span>
      <Link
        to={`/runs/${run.id}`}
        className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors border border-border px-2 py-0.5"
      >
        View
      </Link>
    </div>
  )
}

type RunsBySkill = Record<string, SkillRunHistory[]>

export default function RunsPage() {
  const { session } = useSession()
  const [runsBySkill, setRunsBySkill] = useState<RunsBySkill>({})
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  useEffect(() => {
    if (!session?.id) { setLoading(false); return }
    setLoading(true)

    const fetches = ALL_SKILLS.map(skill =>
      api.getRunHistory(skill, session.id, 50)
        .then(runs => ({ skill, runs }))
        .catch(() => ({ skill, runs: [] as SkillRunHistory[] }))
    )

    Promise.all(fetches).then(results => {
      const map: RunsBySkill = {}
      for (const { skill, runs } of results) map[skill] = runs
      setRunsBySkill(map)
    }).finally(() => setLoading(false))
  }, [session?.id])

  const allRuns: RunWithSkill[] = ALL_SKILLS
    .flatMap(skill => (runsBySkill[skill] ?? []).map(r => ({ ...r, skillName: skill })))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  const totalCost = allRuns.reduce((sum, r) => sum + r.cost_usd, 0)
  const totalTokens = allRuns.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0)
  const scoredRuns = allRuns.filter(r => r.score !== null)
  const avgScore = scoredRuns.length > 0
    ? scoredRuns.reduce((sum, r) => sum + (r.score as number), 0) / scoredRuns.length
    : null

  const filteredRuns = activeFilter === 'all'
    ? allRuns
    : allRuns.filter(r => r.skillName === activeFilter)

  const costBySkill = ALL_SKILLS
    .map(skill => ({ skill, cost: (runsBySkill[skill] ?? []).reduce((s, r) => s + r.cost_usd, 0) }))
    .filter(i => i.cost > 0)
    .sort((a, b) => b.cost - a.cost)

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Runs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All Claude Code skill runs for the current session.
        </p>
      </div>

      {/* No session guard */}
      {!session && (
        <div className="border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No active session. Open a project to see run analytics.
        </div>
      )}

      {session && loading && <SkeletonRows rows={8} />}

      {session && !loading && (
        <>
          {/* Section 1: Summary Bar */}
          <div className="border border-border grid grid-cols-4 divide-x divide-border">
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Total Runs</p>
              <p className="text-2xl font-bold leading-none">{allRuns.length}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Total Cost</p>
              <p className="text-2xl font-bold leading-none">{formatCost(totalCost)}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Total Tokens</p>
              <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Avg Score</p>
              {avgScore !== null ? (
                <p className={`text-2xl font-bold leading-none ${scoreColor(avgScore)}`}>
                  {Math.round(avgScore * 100)}%
                </p>
              ) : (
                <p className="text-2xl font-bold leading-none text-muted-foreground/40">-</p>
              )}
            </div>
          </div>

          {/* Section 2: Pipeline Timeline */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Pipeline Timeline
            </p>
            <div className="border border-border divide-y divide-border">
              {PIPELINE_STEPS.map((step, idx) => {
                const skillRuns = runsBySkill[step.name] ?? []
                const chronoRuns = [...skillRuns].sort(
                  (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
                )
                const latestRun = skillRuns[0] ?? null

                return (
                  <div key={step.name} className="flex items-center gap-4 px-4 py-3">
                    <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[12px] font-medium w-32 shrink-0 truncate">
                      {SKILL_LABELS[step.name]}
                    </span>
                    <span className="text-[10px] border border-border px-1.5 py-0.5 text-muted-foreground w-14 shrink-0 text-center">
                      {skillRuns.length === 0 ? 'no runs' : `${skillRuns.length} run${skillRuns.length !== 1 ? 's' : ''}`}
                    </span>
                    <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
                      {chronoRuns.length === 0 && (
                        <span className="text-[10px] text-muted-foreground/40 italic">none</span>
                      )}
                      {chronoRuns.map(run => {
                        const rectColor =
                          run.status === 'error'
                            ? 'bg-destructive'
                            : run.retry_count > 0
                            ? 'bg-amber-400'
                            : 'bg-[oklch(0.55_0.12_150)]'
                        return (
                          <Link
                            key={run.id}
                            to={`/runs/${run.id}`}
                            title={`${formatDate(run.started_at)} - ${run.status}`}
                            className={`w-3 h-5 shrink-0 ${rectColor} hover:opacity-70 transition-opacity`}
                          />
                        )
                      })}
                    </div>
                    <span className={`text-[11px] font-mono tabular-nums w-10 shrink-0 text-right ${latestRun?.score != null ? scoreColor(latestRun.score) : 'text-muted-foreground/40'}`}>
                      {latestRun?.score != null ? `${Math.round(latestRun.score * 100)}%` : '-'}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums w-16 shrink-0 text-right text-muted-foreground">
                      {latestRun && latestRun.cost_usd > 0 ? formatCost(latestRun.cost_usd) : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 3: All Runs Table */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              All Runs
            </p>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveFilter('all')}
                className={`text-[11px] px-2.5 py-1 border transition-colors ${
                  activeFilter === 'all'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({allRuns.length})
              </button>
              {ALL_SKILLS.map(skill => {
                const count = (runsBySkill[skill] ?? []).length
                if (count === 0) return null
                return (
                  <button
                    key={skill}
                    onClick={() => setActiveFilter(skill)}
                    className={`text-[11px] px-2.5 py-1 border transition-colors ${
                      activeFilter === skill
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {SKILL_LABELS[skill]} ({count})
                  </button>
                )
              })}
            </div>

            {filteredRuns.length === 0 ? (
              <div className="border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No runs yet for this session.
              </div>
            ) : (
              <div className="border border-border">
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 border-l-2 border-l-transparent">
                  <span className="w-28 shrink-0">Skill</span>
                  <span className="w-32 shrink-0">Date</span>
                  <span className="w-16 shrink-0">Duration</span>
                  <span className="w-24 shrink-0">Tokens</span>
                  <span className="w-16 shrink-0">Cost</span>
                  <span className="w-12 shrink-0">Score</span>
                  <span className="w-14 shrink-0">Retries</span>
                  <span className="w-20 shrink-0">Status</span>
                  <span className="ml-auto">View</span>
                </div>
                {filteredRuns.map(run => (
                  <RunTableRow key={run.id} run={run} />
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Cost by Skill */}
          {costBySkill.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Cost by Skill
              </p>
              <div className="border border-border px-4 py-4 flex flex-col gap-2.5">
                {costBySkill.map(item => {
                  const widthPct = Math.round((item.cost / totalCost) * 100)
                  return (
                    <div key={item.skill} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-32 shrink-0 truncate">
                        {SKILL_LABELS[item.skill]}
                      </span>
                      <div className="flex-1 h-4 bg-foreground/10 relative overflow-hidden">
                        <div
                          className="h-full bg-foreground/60 transition-all duration-700"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono tabular-nums w-16 shrink-0 text-right">
                        {formatCost(item.cost)}
                      </span>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Total</span>
                  <span className="text-[13px] font-bold font-mono">{formatCost(totalCost)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
