import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useSkillRun } from '@/hooks/useSkillRun'
import { ActivityFeed } from '@/components/ActivityFeed'
import { RunHistory } from '@/components/RunHistory'
import { AdditionalInstructions } from '@/components/AdditionalInstructions'
import { api } from '@/lib/api'
import { PIPELINE_STEPS } from '@/lib/constants'
import { formatElapsed } from '@/lib/utils'
import type { AuditReport } from '@/types/session'
import { groupElementsByPage } from '@/utils/groupElementsByPage'
import type { PageGroup } from '@/utils/groupElementsByPage'
import { CategoryBadge } from '@/components/AuditShared'
import type { ActivityEvent as SkillActivityEvent } from '@/hooks/useSkillRun'

const SKILL_NAME = 'gtm-dom-standardization'

export default function DomPage() {
  const { session, markSkillComplete, isSkillUnlocked, isSkillComplete } = useSession()
  const isLocked = !isSkillUnlocked(SKILL_NAME)
  const isComplete = isSkillComplete(SKILL_NAME)
  const [justCompleted, setJustCompleted] = useState(false)
  const [activeTab, setActiveTab] = useState<'elements' | 'resolved' | 'history'>('elements')
  const prevCompleteRef = useRef(isComplete)

  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 2000)
      return () => clearTimeout(t)
    }
    prevCompleteRef.current = isComplete
  }, [isComplete])

  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)

  useEffect(() => {
    if (session?.id) {
      api.getSkillOutput<AuditReport>('gtm-analytics-audit').then(setAuditReport).catch(() => {})
    }
  }, [session?.id])

  const allGroups = auditReport
    ? groupElementsByPage(auditReport as unknown as Record<string, unknown>)
    : []
  // needsDom: missing conforming id OR missing js-track class (not just audit tracking flag)
  const untrackedGroups = allGroups
    .map(g => ({ ...g, elements: g.elements.filter(e => e.needsDom) }))
    .filter(g => g.elements.length > 0)
  const totalUntracked = untrackedGroups.reduce((s, g) => s + g.elements.length, 0)

  const scopedFiles = untrackedGroups.flatMap(g => [...new Set(g.elements.map(e => e.file))])

  const { isRunning, error, elapsedMs, activity, run, cancel } = useSkillRun({
    onComplete: (claudeSessionId, fullOutput) => {
      if (claudeSessionId) {
        // Heuristic: text-match to get an initial list immediately
        const filesModified = scopedFiles.filter(f =>
          fullOutput && fullOutput.includes(f.split('/').pop() ?? f)
        )
        const uniqueFiles = filesModified.length > 0 ? [...new Set(filesModified)] : scopedFiles
        const output = { filesModified: uniqueFiles.length, appliedFiles: uniqueFiles, appliedCount: uniqueFiles.length }
        markSkillComplete(SKILL_NAME, claudeSessionId, output)
        api.saveDomPageResult('all', uniqueFiles.length, uniqueFiles).catch(() => {})

        // Follow up with diff-based accurate list from DB (file_snapshots table)
        api.getChangedFiles(SKILL_NAME).then(result => {
          if (result.changed.length > 0) {
            const diffFiles = result.changed.map(c => c.filePath)
            api.saveDomPageResult('all', diffFiles.length, diffFiles).catch(() => {})
          }
        }).catch(() => {})
      }
    },
  })

  function doResolveAll() {
    if (!session?.projectPath) return
    const prompt = auditReport
      ? `Fix ALL untracked elements listed in the audit scope. For each element at the listed file and line number, directly edit the file to add the recommended id and js-track class attributes. Edit files directly — no diffs, no questions. Fix every listed element.\n\nWhen done, write one plain sentence only: how many elements you fixed and in which files. No JSON, no markdown, no headers, no code blocks.`
      : `Find every interactive element missing analytics tracking and add id and js-track class attributes directly to files. When done, write one plain sentence only summarising what you changed. No JSON, no markdown.`
    run(SKILL_NAME, prompt, session.projectPath)
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Prepare Elements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalUntracked > 0
              ? `${totalUntracked} elements need DOM standardization across ${untrackedGroups.length} pages — resolve per page or all at once`
              : 'All elements have conforming IDs and js-track classes.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isComplete && !isRunning && (
            <span className={`text-xs font-medium border px-2 py-1 transition-all duration-500 ${justCompleted ? 'bg-foreground text-background border-foreground' : 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]'}`}>
              Complete
            </span>
          )}
          {isRunning && (
            <>
              <span className="text-xs font-medium text-muted-foreground border border-border px-2 py-1 animate-pulse">
                {formatElapsed(elapsedMs)}
              </span>
              <button onClick={cancel} className="h-9 px-4 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                Cancel
              </button>
            </>
          )}
          {!isRunning && !isLocked && totalUntracked > 0 && (
            <button
              onClick={doResolveAll}
              disabled={!session?.projectPath}
              className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Resolve All ({totalUntracked})
            </button>
          )}
          {!isRunning && !isLocked && totalUntracked === 0 && (
            <button
              onClick={doResolveAll}
              disabled={!session?.projectPath}
              className="h-9 px-4 text-sm font-medium border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              Re-run
            </button>
          )}
        </div>
      </div>

      {!isLocked && <AdditionalInstructions skillName={SKILL_NAME} />}

      {/* Locked */}
      {isLocked && (
        <div className="border border-border bg-muted px-4 py-10 flex flex-col items-center gap-2 text-center">
          <Lock size={16} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Complete the Audit step first.</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Running: activity feed */}
      {isRunning && (
        <ActivityFeed
          activity={activity}
          elapsedMs={elapsedMs}
          label="Claude is preparing elements"
          scopedFiles={scopedFiles}
          contextSummary={
            auditReport
              ? `Fixing ${totalUntracked} untracked elements across ${scopedFiles.length} file${scopedFiles.length !== 1 ? 's' : ''}`
              : undefined
          }
        />
      )}

      {/* Tabs */}
      {!isLocked && !isRunning && (
        <div className="flex flex-col gap-0">
          <div className="flex items-center border-b border-border gap-0">
            <button
              onClick={() => setActiveTab('elements')}
              className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'elements'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Elements{totalUntracked > 0 ? ` (${totalUntracked} need DOM work)` : ' (all DOM-ready)'}
            </button>
            <button
              onClick={() => setActiveTab('resolved')}
              className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'resolved'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              History
            </button>
          </div>

          <div className="pt-4">
            {activeTab === 'elements' && (
              <ElementsTab
                auditReport={auditReport}
                untrackedGroups={untrackedGroups}
                totalUntracked={totalUntracked}
                projectPath={session?.projectPath}
                sessionId={session?.id}
                skillName={SKILL_NAME}
              />
            )}

            {activeTab === 'resolved' && (
              <ResolvedTab
                untrackedGroups={untrackedGroups}
                projectPath={session?.projectPath}
                sessionId={session?.id}
                skillName={SKILL_NAME}
              />
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col gap-6">
                <RunHistory skillName={SKILL_NAME} onRerun={doResolveAll} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next step */}
      {isComplete && !isRunning && (
        <div className="flex items-center justify-between pt-2">
          <RestoreButton skillName={SKILL_NAME} />
          <Link
            to="/strategy"
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors inline-flex items-center"
          >
            Next: Strategy
          </Link>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PageRun type — row returned by GET /api/skill/page-runs/:skillName
// ---------------------------------------------------------------------------

interface PageRun {
  page_context: string
  output_log: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  status: string
  started_at: string
  completed_at: string | null
}

// ---------------------------------------------------------------------------
// CombinedResultCard — aggregates all resolved pages at the top
// ---------------------------------------------------------------------------

function CombinedResultCard({
  untrackedGroups,
  pageRuns,
}: {
  untrackedGroups: PageGroup[]
  pageRuns: Record<string, PageRun>
}) {
  const results: Array<{ page: string; result: RunResult; cost: RunCost | null }> = []
  for (const [page, run] of Object.entries(pageRuns)) {
    const parsed = parseRunResult(run.output_log)
    if (!parsed) continue
    const cost: RunCost = { inputTokens: run.input_tokens, outputTokens: run.output_tokens, costUsd: run.cost_usd, durationMs: run.duration_ms }
    results.push({ page, result: parsed, cost })
  }
  results.sort((a, b) => a.page.localeCompare(b.page))

  if (results.length === 0) return null

  const resolvedPages = new Set(results.map(r => r.page))
  const pendingGroups = untrackedGroups.filter(g => !resolvedPages.has(g.page))
  const totalPages = untrackedGroups.length

  // Aggregate totals
  const totalGapsReferenced = untrackedGroups.reduce((s, g) => s + g.elements.length, 0)
  const totalGapsFilled = results.reduce((s, r) => s + r.result.totalElementsUpdated, 0)
  const totalFilesModified = results.reduce((s, r) => s + r.result.filesModified, 0)
  const totalTokens = results.reduce((s, r) => s + (r.cost ? r.cost.inputTokens + r.cost.outputTokens : 0), 0)
  const totalCost = results.reduce((s, r) => s + (r.cost?.costUsd ?? 0), 0)
  const totalDuration = results.reduce((s, r) => s + (r.cost?.durationMs ?? 0), 0)
  const pagesResolved = results.length

  // Aggregate byCategory
  const byCategory: Record<string, number> = {}
  for (const r of results) {
    for (const [cat, count] of Object.entries(r.result.byCategory)) {
      byCategory[cat] = (byCategory[cat] ?? 0) + count
    }
  }
  const categoryEntries = Object.entries(byCategory)
  const maxCount = Math.max(...categoryEntries.map(([, v]) => v), 1)

  // All files modified
  const allFiles: Array<{ path: string; elementsUpdated: number }> = []
  for (const r of results) {
    for (const f of r.result.files) {
      allFiles.push(f)
    }
  }

  return (
    <div className="border border-border flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={13} className="text-[oklch(0.4_0.12_150)]" />
          <span className="text-[12px] font-semibold">Resolve Summary</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[oklch(0.4_0.12_150)]">{pagesResolved} of {totalPages} pages resolved</span>
          {pendingGroups.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{pendingGroups.length} pending</span>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-6 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gaps referenced</span>
          <span className="text-[18px] font-semibold tabular-nums">{totalGapsReferenced}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gaps filled</span>
          <span className={`text-[18px] font-semibold tabular-nums ${totalGapsFilled > 0 ? 'text-[oklch(0.4_0.12_150)]' : 'text-muted-foreground'}`}>
            {totalGapsFilled}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Files modified</span>
          <span className="text-[18px] font-semibold tabular-nums">{totalFilesModified}</span>
        </div>
        {totalTokens > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tokens</span>
            <span className="text-[18px] font-semibold tabular-nums">{totalTokens.toLocaleString()}</span>
          </div>
        )}
        {totalCost > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cost</span>
            <span className="text-[18px] font-semibold tabular-nums">${totalCost.toFixed(4)}</span>
          </div>
        )}
        {totalDuration > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Duration</span>
            <span className="text-[18px] font-semibold tabular-nums">{formatElapsed(totalDuration)}</span>
          </div>
        )}
      </div>

      {/* Pages breakdown */}
      <div className="px-4 py-3 border-b border-border flex flex-col gap-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pages</p>
        <div className="flex flex-col gap-1">
          {results.map(r => (
            <div key={r.page} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={11} className="text-[oklch(0.4_0.12_150)] shrink-0" />
                <span className="text-[12px] font-mono truncate">{r.page}</span>
              </div>
              <span className="text-[11px] text-[oklch(0.4_0.12_150)] font-medium shrink-0">
                {r.result.totalElementsUpdated} fixed
              </span>
            </div>
          ))}
          {pendingGroups.map(g => (
            <div key={g.page} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-[11px] h-[11px] shrink-0 rounded-full border border-muted-foreground/40" />
                <span className="text-[12px] font-mono text-muted-foreground truncate">{g.page}</span>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{g.elements.length} pending</span>
            </div>
          ))}
        </div>
      </div>

      {/* Files modified */}
      {allFiles.length > 0 && (
        <div className="px-4 py-3 border-b border-border flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Files modified</p>
          <div className="flex flex-col gap-1">
            {allFiles.map(f => (
              <div key={f.path} className="flex items-center justify-between gap-4">
                <span className="text-[12px] font-mono text-muted-foreground truncate">{f.path}</span>
                <span className="text-[11px] text-[oklch(0.4_0.12_150)] font-medium shrink-0">
                  {f.elementsUpdated} element{f.elementsUpdated !== 1 ? 's' : ''} fixed
                </span>
              </div>
            ))}
          </div>
          {/* Category breakdown */}
          {categoryEntries.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              {categoryEntries.map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground w-16 shrink-0 capitalize">{cat}</span>
                  <div className="flex-1 h-1.5 bg-muted overflow-hidden">
                    <div className="h-full bg-foreground" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-medium tabular-nums w-4 text-right shrink-0">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ElementsTab
// ---------------------------------------------------------------------------

function ElementsTab({
  auditReport,
  untrackedGroups,
  totalUntracked,
  projectPath,
  sessionId,
  skillName,
}: {
  auditReport: AuditReport | null
  untrackedGroups: PageGroup[]
  totalUntracked: number
  projectPath: string | undefined
  sessionId: string | undefined
  skillName: string
}) {
  const [pageRuns, setPageRuns] = useState<Record<string, PageRun>>({})

  useEffect(() => {
    if (!sessionId) return
    api.getPageRuns(skillName, sessionId).then(setPageRuns).catch(() => {})
  }, [sessionId, skillName])

  function onPageResolved(page: string, run: PageRun) {
    setPageRuns(prev => ({ ...prev, [page]: run }))
  }

  const resolvedPages = new Set(Object.keys(pageRuns))
  const pendingGroups = untrackedGroups.filter(g => !resolvedPages.has(g.page))
  const pendingCount = pendingGroups.reduce((s, g) => s + g.elements.length, 0)

  if (!auditReport) {
    return (
      <div className="border border-border px-4 py-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">Run the Audit first to see untracked elements.</p>
      </div>
    )
  }

  if (totalUntracked === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="border border-border px-4 py-4 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-[oklch(0.4_0.12_150)]" />
          <span className="text-[13px] font-medium text-[oklch(0.4_0.12_150)]">All elements DOM-ready</span>
          <span className="text-[13px] text-muted-foreground">- every element has conforming id and js-track classes</span>
        </div>
        <CombinedResultCard untrackedGroups={[]} pageRuns={pageRuns} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Per-page untracked groups — only pending (not yet resolved) */}
      {pendingGroups.length > 0 && (
        <div className="border border-border flex flex-col">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Untracked elements by page
            </p>
            <span className="text-[11px] text-muted-foreground">
              {pendingCount} element{pendingCount !== 1 ? 's' : ''} across {pendingGroups.length} page{pendingGroups.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-border">
            {pendingGroups.map(group => (
              <PageResolveGroup
                key={group.page}
                group={group}
                projectPath={projectPath}
                skillName={skillName}
                sessionId={sessionId}
                existingRun={pageRuns[group.page] ?? null}
                onResolved={onPageResolved}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// ResolvedTab - full tab showing resolved pages with their result cards
// ---------------------------------------------------------------------------

function ResolvedTab({
  untrackedGroups,
  sessionId,
  projectPath,
  skillName,
}: {
  untrackedGroups: PageGroup[]
  sessionId: string | undefined
  projectPath: string | undefined
  skillName: string
}) {
  const [pageRuns, setPageRuns] = useState<Record<string, PageRun>>({})

  useEffect(() => {
    if (!sessionId) return
    api.getPageRuns(skillName, sessionId).then(setPageRuns).catch(() => {})
  }, [sessionId, skillName])

  const resolvedGroups = untrackedGroups.filter(g => pageRuns[g.page])

  if (resolvedGroups.length === 0) {
    return (
      <div className="border border-border px-4 py-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">No pages resolved yet. Use the Resolve button on any page in the Elements tab.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <CombinedResultCard untrackedGroups={untrackedGroups} pageRuns={pageRuns} />
      <div className="border border-border flex flex-col divide-y divide-border">
        {resolvedGroups.map(group => (
          <PageResolveGroup
            key={group.page}
            group={group}
            projectPath={projectPath}
            skillName={skillName}
            sessionId={sessionId}
            existingRun={pageRuns[group.page] ?? null}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Run result parsing + card
// ---------------------------------------------------------------------------

interface RunResult {
  filesModified: number
  totalElementsUpdated: number
  byCategory: Record<string, number>
  files: Array<{ path: string; elementsUpdated: number }>
  alreadyTracked: boolean
}

interface RunCost {
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}

function parseRunResult(output: string): RunResult | null {
  const match = output.match(/```json\s*([\s\S]*?)```/)
  const jsonStr = match ? match[1] : output.match(/\{[\s\S]*"filesModified"[\s\S]*\}/)?.[0]
  if (!jsonStr) return null
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const filesModified = typeof parsed.filesModified === 'number' ? parsed.filesModified : 0
    const totalElementsUpdated = typeof parsed.totalElementsUpdated === 'number' ? parsed.totalElementsUpdated : 0
    const byCategory = (parsed.byCategory && typeof parsed.byCategory === 'object')
      ? Object.fromEntries(
          Object.entries(parsed.byCategory as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
            .map(([k, v]) => [k, v as number])
        )
      : {}
    const files = Array.isArray(parsed.files)
      ? (parsed.files as Array<Record<string, unknown>>).map(f => ({
          path: String(f.path ?? ''),
          elementsUpdated: typeof f.elementsUpdated === 'number' ? f.elementsUpdated : 0,
        }))
      : []
    return { filesModified, totalElementsUpdated, byCategory, files, alreadyTracked: filesModified === 0 && totalElementsUpdated === 0 }
  } catch {
    return null
  }
}


// ---------------------------------------------------------------------------
// PageResolveGroup - per-page resolve
// ---------------------------------------------------------------------------

type RunStatus = 'idle' | 'running' | 'done' | 'error'

function PageResolveGroup({
  group,
  projectPath,
  skillName,
  sessionId,
  existingRun,
  onResolved,
}: {
  group: PageGroup
  projectPath: string | undefined
  skillName: string
  sessionId: string | undefined
  existingRun: PageRun | null
  onResolved?: (page: string, run: PageRun) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [runStatus, setRunStatus] = useState<RunStatus>(() => existingRun ? 'done' : 'idle')
  const [runOutput, setRunOutput] = useState(() => existingRun?.output_log ?? '')
  const [runCost, setRunCost] = useState<RunCost | null>(() =>
    existingRun ? { inputTokens: existingRun.input_tokens, outputTokens: existingRun.output_tokens, costUsd: existingRun.cost_usd, durationMs: existingRun.duration_ms } : null
  )
  const [runError, setRunError] = useState('')
  const [activity, setActivity] = useState<SkillActivityEvent[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [changedFiles, setChangedFiles] = useState<Array<{ filePath: string; additions: number; deletions: number }> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const statusRef = useRef<RunStatus>('idle')
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const files = [...new Set(group.elements.map(e => e.file))]
  const elementList = group.elements.map(el =>
    `- "${el.text}" in ${el.file}${el.line ? `:${el.line}` : ''}${el.recommendation ? ` — ${el.recommendation}` : ''}`
  ).join('\n')

  const doResolve = useCallback(() => {
    if (!projectPath) return
    setRunStatus('running')
    statusRef.current = 'running'
    setRunOutput('')
    setRunError('')
    setActivity([])
    setElapsedMs(0)
    setChangedFiles(null)
    startTimeRef.current = Date.now()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
    }, 500)

    const prompt = `Fix untracked elements on the ${group.page} page.\n\nFiles to edit:\n${files.map(f => `- ${f}`).join('\n')}\n\nElements to fix:\n${elementList}\n\nFor each element, open its file and add the recommended id and js-track class attributes directly. Edit files — no diffs, no questions.\n\nWhen done, write one plain sentence only: how many elements you fixed and in which files. No JSON, no markdown, no headers, no code blocks.`

    const controller = new AbortController()
    abortRef.current = controller

    // Snapshot files before run so we can diff afterward
    api.snapshotFiles(skillName, files).catch(() => {/* non-fatal */})

    fetch('/api/skill/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillName, prompt, pageContext: group.page }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => { throw new Error((b as { message?: string }).message ?? `HTTP ${res.status}`) })
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedOutput = ''

        function processBuffer() {
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            let eventName = 'message', dataLine = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim()
              else if (line.startsWith('data: ')) dataLine = line.slice(6)
            }
            if (!dataLine) continue
            try {
              const data = JSON.parse(dataLine) as Record<string, unknown>
              if (eventName === 'activity') {
                setActivity(prev => [...prev, data as unknown as SkillActivityEvent])
              } else if (eventName === 'chunk' && data.type === 'content' && typeof data.text === 'string') {
                accumulatedOutput += data.text
                setRunOutput(accumulatedOutput)
              } else if (eventName === 'complete') {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                statusRef.current = 'done'; setRunStatus('done')
                const uniqueFiles = [...new Set(group.elements.map(e => e.file))]
                api.saveDomPageResult(group.page, group.elements.length, uniqueFiles).catch(() => {/* non-fatal */})
                api.getChangedFiles(skillName).then(result => {
                  if (result.changed.length > 0) setChangedFiles(result.changed)
                }).catch(() => {})
                // Fetch the DB row we just wrote (via page_context) and notify parent
                if (sessionId) {
                  api.getPageRuns(skillName, sessionId).then(runs => {
                    const run = runs[group.page]
                    if (run) {
                      setRunCost({ inputTokens: run.input_tokens, outputTokens: run.output_tokens, costUsd: run.cost_usd, durationMs: run.duration_ms })
                      onResolved?.(group.page, run)
                    } else {
                      onResolved?.(group.page, { page_context: group.page, output_log: accumulatedOutput, input_tokens: 0, output_tokens: 0, cost_usd: 0, duration_ms: 0, status: 'complete', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })
                    }
                  }).catch(() => {})
                }
              } else if (eventName === 'error') {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                statusRef.current = 'error'
                setRunError(typeof data.message === 'string' ? data.message : 'Unknown error')
                setRunStatus('error')
              }
            } catch { /* ignore */ }
          }
        }

        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (done) {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
              if (statusRef.current === 'running') { statusRef.current = 'done'; setRunStatus('done') }
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
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        if ((err as Error).name === 'AbortError') return
        statusRef.current = 'error'
        setRunError(err instanceof Error ? err.message : String(err))
        setRunStatus('error')
      })
  }, [projectPath, group.page, files, elementList, skillName])

  return (
    <div>
      {/* Page header row */}
      <div className="px-3 py-2.5 flex items-center gap-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-foreground transition-colors"
        >
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="font-mono text-[12px] font-medium truncate">{group.page}</span>
        </button>

        {/* Status indicator */}
        {runStatus === 'running' && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
            <Loader2 size={11} className="animate-spin" /> Resolving...
          </span>
        )}
        {runStatus === 'done' && (
          <span className="flex items-center gap-1.5 text-[11px] text-[oklch(0.4_0.12_150)] shrink-0">
            <CheckCircle2 size={11} /> Fixed
          </span>
        )}
        {runStatus === 'error' && (
          <span className="flex items-center gap-1.5 text-[11px] text-[oklch(0.45_0.15_25)] shrink-0">
            <AlertCircle size={11} /> Failed
          </span>
        )}

        <span className="text-[10px] font-semibold px-2 py-0.5 bg-[oklch(0.97_0.02_20)] text-[oklch(0.4_0.1_20)] shrink-0">
          {group.elements.length} untracked
        </span>

        {/* Resolve / Retry button */}
        {projectPath && runStatus !== 'running' && (
          <button
            onClick={doResolve}
            className={`text-[11px] font-medium border px-2.5 py-1 transition-colors shrink-0 flex items-center gap-1 ${
              runStatus === 'done'
                ? 'border-border text-muted-foreground hover:bg-muted/40'
                : 'border-foreground bg-foreground text-background hover:bg-[oklch(0.2_0_0)]'
            }`}
          >
            {runStatus === 'done' ? <><RefreshCw size={10} /> Re-run</> : runStatus === 'error' ? 'Retry' : 'Resolve'}
          </button>
        )}
        {runStatus === 'running' && (
          <button
            onClick={() => { abortRef.current?.abort(); setRunStatus('idle'); statusRef.current = 'idle' }}
            className="text-[11px] text-muted-foreground border border-border px-2.5 py-1 hover:bg-muted/40 transition-colors shrink-0"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Activity feed while running */}
      {runStatus === 'running' && (
        <div className="border-t border-border px-3 py-3">
          <ActivityFeed
            activity={activity}
            elapsedMs={elapsedMs}
            label={`Claude is fixing ${group.page}`}
            scopedFiles={files}
          />
        </div>
      )}

      {/* Expanded element list */}
      {expanded && (
        <div className="border-t border-border">
          {group.elements.map((el, i) => (
            <div
              key={`${el.file}-${el.line ?? i}`}
              className="pl-6 pr-3 py-2 flex items-start gap-3 border-b border-border last:border-0 hover:bg-muted/10"
            >
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-mono" title={el.text}>
                    {el.text.length > 60 ? el.text.slice(0, 60) + '...' : el.text}
                  </span>
                  <CategoryBadge category={el.category} />
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {el.file}{el.line ? `:${el.line}` : ''}
                </span>
                {el.recommendation && (
                  <span className="text-[11px] text-muted-foreground">{el.recommendation}</span>
                )}
              </div>
            </div>
          ))}

          {/* File diff panel — shown after completion with real line changes */}
          {changedFiles && changedFiles.length > 0 && runStatus === 'done' && (
            <div className="border-t border-border bg-muted/10 flex flex-col">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Files changed ({changedFiles.length})
                </span>
                <span className="text-[11px] text-[oklch(0.4_0.12_150)] font-medium">
                  +{changedFiles.reduce((s, f) => s + f.additions, 0)} / -{changedFiles.reduce((s, f) => s + f.deletions, 0)}
                </span>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {changedFiles.map(f => (
                  <div key={f.filePath} className="px-4 py-2 flex items-center justify-between gap-4">
                    <span className="text-[11px] font-mono text-muted-foreground truncate" title={f.filePath}>
                      {f.filePath.replace(/\\/g, '/').split('/').slice(-3).join('/')}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.additions > 0 && (
                        <span className="text-[11px] font-medium text-[oklch(0.4_0.12_150)] tabular-nums">+{f.additions}</span>
                      )}
                      {f.deletions > 0 && (
                        <span className="text-[11px] font-medium text-[oklch(0.45_0.15_25)] tabular-nums">-{f.deletions}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-page result card - shown when done or loaded from previous run */}
          {runOutput && (runStatus === 'done' || runStatus === 'idle') && (() => {
            const result = parseRunResult(runOutput)
            if (!result) return null
            const gapsReferenced = group.elements.map(el => ({
              text: el.text,
              file: el.file,
              line: el.line,
              category: el.category,
              recommendation: el.recommendation,
            }))
            return <PageRunResultCard result={result} cost={runCost} gapsReferenced={gapsReferenced} />
          })()}

          {/* Error message */}
          {runError && (
            <div className="px-4 py-3 border-t border-border">
              <p className="text-[12px] text-[oklch(0.45_0.15_25)]">{runError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PageRunResultCard - per-page result card shown under each page group
// ---------------------------------------------------------------------------

function PageRunResultCard({
  result,
  cost,
  gapsReferenced,
}: {
  result: RunResult
  cost: RunCost | null
  gapsReferenced: Array<{ text: string; file: string; line?: number; category: string; recommendation?: string }>
}) {
  const categoryEntries = Object.entries(result.byCategory)
  const maxCount = Math.max(...categoryEntries.map(([, v]) => v), 1)
  const gapsFilled = result.totalElementsUpdated
  const gapsTotal = gapsReferenced.length

  return (
    <div className="border-t border-border bg-muted/10 flex flex-col">
      {/* Summary strip */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-6 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gaps referenced</span>
          <span className="text-[16px] font-semibold tabular-nums">{gapsTotal}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gaps filled</span>
          <span className={`text-[16px] font-semibold tabular-nums ${gapsFilled > 0 ? 'text-[oklch(0.4_0.12_150)]' : 'text-muted-foreground'}`}>
            {result.alreadyTracked ? '0 (already tracked)' : gapsFilled}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Files modified</span>
          <span className="text-[16px] font-semibold tabular-nums">{result.filesModified}</span>
        </div>
        {cost && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tokens</span>
              <span className="text-[16px] font-semibold tabular-nums">{(cost.inputTokens + cost.outputTokens).toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cost</span>
              <span className="text-[16px] font-semibold tabular-nums">${cost.costUsd.toFixed(4)}</span>
            </div>
            {cost.durationMs > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Duration</span>
                <span className="text-[16px] font-semibold tabular-nums">{formatElapsed(cost.durationMs)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Gaps referenced */}
      <div className="px-4 py-3 border-b border-border flex flex-col gap-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Gaps referenced from audit ({gapsTotal})
        </p>
        <div className="flex flex-col gap-1">
          {gapsReferenced.map((el, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 border border-border text-muted-foreground shrink-0 capitalize">{el.category}</span>
              <div className="flex flex-col gap-0 min-w-0">
                <span className="text-[12px] text-foreground truncate">{el.text}</span>
                <span className="text-[11px] text-muted-foreground font-mono">{el.file}{el.line ? `:${el.line}` : ''}</span>
                {el.recommendation && (
                  <span className="text-[11px] text-muted-foreground">{el.recommendation}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gaps filled */}
      {!result.alreadyTracked && result.files.length > 0 && (
        <div className="px-4 py-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Gaps filled ({gapsFilled})
          </p>
          <div className="flex flex-col gap-1">
            {result.files.map(f => (
              <div key={f.path} className="flex items-center justify-between gap-4">
                <span className="text-[12px] font-mono text-muted-foreground truncate">{f.path}</span>
                <span className="text-[11px] text-[oklch(0.4_0.12_150)] font-medium shrink-0">
                  {f.elementsUpdated} element{f.elementsUpdated !== 1 ? 's' : ''} fixed
                </span>
              </div>
            ))}
          </div>
          {categoryEntries.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              {categoryEntries.map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground w-16 shrink-0 capitalize">{cat}</span>
                  <div className="flex-1 h-1.5 bg-muted overflow-hidden">
                    <div className="h-full bg-foreground" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-medium tabular-nums w-4 text-right shrink-0">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result.alreadyTracked && (
        <div className="px-4 py-3">
          <p className="text-[12px] text-muted-foreground">All elements were already tracked — no changes needed.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RestoreButton
// ---------------------------------------------------------------------------

function RestoreButton({ skillName }: { skillName: string }) {
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleRestore() {
    if (!confirm('Restore all files to their state before this skill ran? This will overwrite current file contents.')) return
    setRestoring(true)
    setResult(null)
    try {
      const r = await api.restoreFiles(skillName)
      setResult(`Restored ${r.restored} file${r.restored !== 1 ? 's' : ''}${r.failed > 0 ? ` (${r.failed} failed)` : ''}`)
    } catch {
      setResult('Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRestore}
        disabled={restoring}
        className="h-8 px-3 text-[12px] border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
      >
        {restoring ? 'Restoring...' : 'Restore to pre-run state'}
      </button>
      {result && <span className="text-[12px] text-muted-foreground">{result}</span>}
    </div>
  )
}
