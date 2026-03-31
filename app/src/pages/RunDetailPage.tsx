import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronRight, Loader2, Tag, Zap, Variable } from 'lucide-react'
import { api } from '@/lib/api'
import type { SkillRunDetail, SkillRunHistory, CostSummary } from '@/lib/api'
import { extractJson } from '@/components/AuditDisplay'
import { TrackingEditsPanel } from '@/components/TrackingEditsPanel'
import {
  SlimCoverageBar,
  PagesPanel,
  GtmContainerPanel,
} from '@/components/AuditShared'
import type { AuditReport } from '@/types/session'
import type { TrackingPlan } from '@/types/session'
import { ImplementationChangedFiles } from './ImplementationPage'
import { TrackingPlanView } from './StrategyPage'
import { TestingOutput } from './TestingPage'
import { ReportOutput } from './ReportingPage'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatDate(iso: string): string {
  const normalized = iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatShortDate(iso: string): string {
  const normalized = iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]',
    error: 'text-destructive border-destructive/40',
    running: 'text-muted-foreground border-border',
    retried: 'text-amber-600 border-amber-300',
  }
  return (
    <span className={`text-xs font-medium border px-2 py-0.5 ${colors[status] ?? 'text-muted-foreground border-border'}`}>
      {status}
    </span>
  )
}

function CollapsibleSection({ title, lineCount, children }: { title: string; lineCount?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
      >
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {lineCount !== undefined && (
            <span className="text-[10px] text-muted-foreground">{lineCount} lines</span>
          )}
          {open ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
        </div>
      </button>
      {open && children}
    </div>
  )
}

const SKILL_LABELS: Record<string, string> = {
  'gtm-analytics-audit': 'Analytics Audit',
  'gtm-dom-standardization': 'Prepare Elements',
  'gtm-strategy': 'Strategy',
  'gtm-implementation': 'Implementation',
  'gtm-testing': 'Testing',
  'gtm-reporting': 'Reporting',
}

// ---------------------------------------------------------------------------
// AuditRunDetail - the full three-tab layout for audit runs
// ---------------------------------------------------------------------------

function AuditRunDetail({ run }: { run: SkillRunDetail }) {
  const [activeTab, setActiveTab] = useState<'pages' | 'gtm' | 'history'>('pages')

  // Parse audit report from output_log
  const report: AuditReport | null = (() => {
    if (run.auditReport) return run.auditReport as AuditReport
    if (!run.output_log) return null
    const parsed = extractJson(run.output_log)
    return parsed ? (parsed as AuditReport) : null
  })()

  const totalTokens = run.input_tokens + run.output_tokens

  // History tab state
  const [historyRuns, setHistoryRuns] = useState<SkillRunHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [costSummaryLoading, setCostSummaryLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const runs = await api.getRunHistory('gtm-analytics-audit', run.session_id, 20)
      setHistoryRuns(runs)
    } catch {
      // non-fatal
    } finally {
      setHistoryLoading(false)
    }
  }, [run.session_id])

  const fetchCostSummary = useCallback(async () => {
    setCostSummaryLoading(true)
    try {
      const data = await api.getCostsSummary(run.session_id)
      setCostSummary(data)
    } catch {
      // non-fatal
    } finally {
      setCostSummaryLoading(false)
    }
  }, [run.session_id])

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory()
      if (!costSummary) fetchCostSummary()
    }
  }, [activeTab, costSummary, fetchHistory, fetchCostSummary])

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Audit Run - {formatDate(run.started_at)}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Stats row */}
      <div className="border border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out
            </p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Score</p>
          {run.score !== null ? (
            <p className={`text-2xl font-bold leading-none ${run.score >= 0.8 ? 'text-[oklch(0.4_0.1_150)]' : run.score >= 0.5 ? 'text-amber-600' : 'text-destructive'}`}>
              {Math.round(run.score * 100)}%
            </p>
          ) : (
            <p className="text-2xl font-bold leading-none text-muted-foreground/40">-</p>
          )}
        </div>
      </div>

      {/* Error */}
      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {/* Coverage bar */}
      {report && <SlimCoverageBar report={report} />}

      {/* Tabs */}
      <div className="flex flex-col gap-0">
        <div className="flex items-center border-b border-border gap-0">
          <button
            onClick={() => setActiveTab('pages')}
            className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'pages'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Pages + Elements
          </button>
          <button
            onClick={() => setActiveTab('gtm')}
            className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'gtm'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            GTM Container
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
          {activeTab === 'pages' && (
            <PagesPanel
              report={report}
              isRunning={false}
            />
          )}

          {activeTab === 'gtm' && (
            <GtmContainerPanel sessionId={run.session_id} report={report} />
          )}

          {activeTab === 'history' && (
            <div className="flex flex-col gap-6">
              {/* Cost summary */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Session Cost Summary</p>
                  {costSummaryLoading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                </div>

                {!costSummaryLoading && !costSummary && (
                  <div className="border border-border px-4 py-4 text-[13px] text-muted-foreground">
                    No cost data available for this session.
                  </div>
                )}

                {!costSummaryLoading && costSummary && (
                  <div className="border border-border flex flex-col">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-8 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Cost</span>
                        <span className="text-[15px] font-semibold tabular-nums">
                          {costSummary.totalCostUsd > 0 ? `$${costSummary.totalCostUsd.toFixed(3)}` : '$0.00'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Input Tokens</span>
                        <span className="text-[15px] font-semibold tabular-nums">{costSummary.totalInputTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Output Tokens</span>
                        <span className="text-[15px] font-semibold tabular-nums">{costSummary.totalOutputTokens.toLocaleString()}</span>
                      </div>
                    </div>
                    {costSummary.bySkill.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-border bg-muted/20">
                              <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Skill</th>
                              <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Tokens</th>
                              <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costSummary.bySkill.map((row) => (
                              <tr key={row.skillName} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2 font-medium">{row.skillName}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.tokens.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {row.costUsd > 0 ? `$${row.costUsd.toFixed(3)}` : '$0.00'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Run history for this session */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Audit Runs for This Session
                </p>
                {historyLoading && (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3">
                    <Loader2 size={12} className="animate-spin" />
                    Loading...
                  </div>
                )}
                {!historyLoading && historyRuns.length === 0 && (
                  <div className="border border-border px-4 py-4 text-[13px] text-muted-foreground">
                    No previous runs found.
                  </div>
                )}
                {!historyLoading && historyRuns.length > 0 && (
                  <div className="border border-border overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Date</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Duration</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Tokens</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Cost</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Score</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Status</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRuns.map(histRun => {
                          const isCurrent = histRun.id === run.id
                          const tokens = histRun.input_tokens + histRun.output_tokens
                          const score = histRun.score !== null ? Math.round(histRun.score * 100) : null
                          const scoreColor = histRun.score !== null
                            ? histRun.score >= 0.8
                              ? 'text-[oklch(0.4_0.1_150)]'
                              : histRun.score >= 0.5
                              ? 'text-amber-600'
                              : 'text-destructive'
                            : 'text-muted-foreground/40'
                          return (
                            <tr
                              key={histRun.id}
                              className={`border-b border-border last:border-0 transition-colors ${
                                isCurrent ? 'bg-muted/30' : 'hover:bg-muted/20'
                              }`}
                            >
                              <td className="px-4 py-2 text-muted-foreground">
                                {isCurrent && (
                                  <span className="text-[10px] font-medium border border-border px-1.5 py-0.5 mr-2">current</span>
                                )}
                                {formatShortDate(histRun.started_at)}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {histRun.duration_ms ? formatDuration(histRun.duration_ms) : '-'}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                {tokens > 0 ? tokens.toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {histRun.cost_usd > 0 ? formatCost(histRun.cost_usd) : '-'}
                              </td>
                              <td className={`px-4 py-2 text-right tabular-nums font-mono ${scoreColor}`}>
                                {score !== null ? `${score}%` : '-'}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <StatusBadge status={histRun.status} />
                              </td>
                              <td className="px-4 py-2 text-right">
                                {isCurrent ? (
                                  <span className="text-[11px] text-muted-foreground/40">-</span>
                                ) : (
                                  <Link
                                    to={`/runs/${histRun.id}`}
                                    className="text-[11px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
                                  >
                                    View
                                  </Link>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ImplementationRunDetail - reuses same panels as ImplementationPage
// ---------------------------------------------------------------------------

function ImplementationRunDetail({ run }: { run: SkillRunDetail }) {
  // Derive changed files from run.edits (accurate for this specific run)
  const changedFiles: Array<{ filePath: string; additions: number; deletions: number }> | null = (() => {
    if (!run.edits || run.edits.noChanges || run.edits.filesModified === 0) return null
    return Object.entries(run.edits.byFile).map(([filePath, edits]) => ({
      filePath,
      additions: edits.length,
      deletions: 0,
    }))
  })()

  // Parse GTM resource counts from result_json
  const resultJson = (() => {
    if (!run.result_json) return null
    try { return JSON.parse(run.result_json) as Record<string, unknown> } catch { return null }
  })()
  const gtmResources = resultJson?.gtmResources as Record<string, unknown> | undefined
  const createdResources = resultJson?.createdResources as Record<string, unknown> | undefined
  const created = createdResources ?? gtmResources

  const totalTokens = run.input_tokens + run.output_tokens

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Implementation Run</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(run.started_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Stats */}
      <div className="border border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out</p>}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Score</p>
          {run.score !== null ? (
            <p className={`text-2xl font-bold leading-none ${run.score >= 0.8 ? 'text-[oklch(0.4_0.1_150)]' : run.score >= 0.5 ? 'text-amber-600' : 'text-destructive'}`}>
              {Math.round(run.score * 100)}%
            </p>
          ) : <p className="text-2xl font-bold leading-none text-muted-foreground/40">-</p>}
        </div>
      </div>

      {/* Error */}
      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {/* GTM verification grid — same layout as ImplementationPage */}
      {(created || gtmResources) && (
        <div className={`border flex flex-col ${run.error_message ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-[oklch(0.8_0.05_150)] bg-[oklch(0.97_0.02_150)]'}`}>
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="font-medium text-sm text-[oklch(0.4_0.1_150)]">GTM Resources</span>
            {!!(created?.published || gtmResources?.published) && (
              <span className="text-[10px] font-semibold bg-[oklch(0.9_0.06_150)] text-[oklch(0.3_0.1_150)] px-1.5 py-0.5">PUBLISHED</span>
            )}
          </div>
          <div className="border-t border-[oklch(0.8_0.05_150)]/40 grid grid-cols-2 divide-x divide-[oklch(0.8_0.05_150)]/40">
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Created this run</p>
              {created ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-[12px]">
                    <Tag size={11} className="text-muted-foreground shrink-0" />
                    <span className="font-medium">{String(created.tagsCreated ?? 0)}</span>
                    <span className="text-muted-foreground">tags</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Zap size={11} className="text-muted-foreground shrink-0" />
                    <span className="font-medium">{String(created.triggersCreated ?? 0)}</span>
                    <span className="text-muted-foreground">triggers</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Variable size={11} className="text-muted-foreground shrink-0" />
                    <span className="font-medium">{String(created.variablesCreated ?? 0)}</span>
                    <span className="text-muted-foreground">variables</span>
                  </div>
                  {!!created.versionId && (
                    <p className="text-[11px] text-muted-foreground mt-1">Version {String(created.versionId)}</p>
                  )}
                </div>
              ) : <p className="text-[12px] text-muted-foreground">No creation data</p>}
            </div>
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Container totals</p>
              {gtmResources?.tagsFound != null ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-[12px]">
                    <Tag size={11} className="text-muted-foreground shrink-0" />
                    <span className="font-medium">{String(gtmResources.tagsFound)}</span>
                    <span className="text-muted-foreground">tags</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Zap size={11} className="text-muted-foreground shrink-0" />
                    <span className="font-medium">{String(gtmResources.triggersFound)}</span>
                    <span className="text-muted-foreground">triggers</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Variable size={11} className="text-muted-foreground shrink-0" />
                    <span className="font-medium">{String(gtmResources.variablesFound)}</span>
                    <span className="text-muted-foreground">variables</span>
                  </div>
                </div>
              ) : <p className="text-[12px] text-muted-foreground">No container data</p>}
            </div>
          </div>
        </div>
      )}

      {/* Changed files — same component as ImplementationPage */}
      {changedFiles && changedFiles.length > 0 && (
        <ImplementationChangedFiles files={changedFiles} />
      )}
      {changedFiles === null && run.status === 'complete' && (
        <div className="border border-border px-4 py-6 text-center">
          <p className="text-sm font-medium">No file changes on record</p>
          <p className="text-xs text-muted-foreground mt-1">GTM configuration may have been created without source file edits.</p>
        </div>
      )}

      {/* Tracking edits */}
      {run.edits && (
        <TrackingEditsPanel edits={run.edits} status={run.status} />
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// DomRunDetail - stats summary + tracking edits panel
// ---------------------------------------------------------------------------

function DomRunDetail({ run }: { run: SkillRunDetail }) {
  const totalTokens = run.input_tokens + run.output_tokens

  // Parse dom result stats from result_json
  const resultJson = (() => {
    if (!run.result_json) return null
    try { return JSON.parse(run.result_json) as Record<string, unknown> } catch { return null }
  })()
  const filesModified = typeof resultJson?.filesModified === 'number' ? resultJson.filesModified : null
  const appliedFiles = Array.isArray(resultJson?.appliedFiles) ? resultJson.appliedFiles as string[] : null

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Prepare Elements Run</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(run.started_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Stats */}
      <div className="border border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out</p>}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Files Modified</p>
          <p className="text-2xl font-bold leading-none">{filesModified !== null ? filesModified : (run.edits?.filesModified ?? '-')}</p>
        </div>
      </div>

      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {/* Files list */}
      {appliedFiles && appliedFiles.length > 0 && (
        <div className="border border-border">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Modified Files</span>
          </div>
          <div className="divide-y divide-border/60">
            {appliedFiles.map((f, i) => (
              <div key={i} className="px-4 py-2 font-mono text-[12px] text-foreground/80">{f}</div>
            ))}
          </div>
        </div>
      )}

      {/* Tracking edits breakdown */}
      {run.edits && (
        <TrackingEditsPanel edits={run.edits} status={run.status} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StrategyRunDetail - full tracking plan view
// ---------------------------------------------------------------------------

function StrategyRunDetail({ run }: { run: SkillRunDetail }) {
  const totalTokens = run.input_tokens + run.output_tokens

  const plan: TrackingPlan | null = (() => {
    if (!run.output_log) return null
    const parsed = extractJson(run.output_log)
    return parsed ? (parsed as TrackingPlan) : null
  })()

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Strategy Run</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(run.started_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      <div className="border border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out</p>}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Events</p>
          <p className="text-2xl font-bold leading-none">{plan ? plan.events.length : '-'}</p>
        </div>
      </div>

      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {plan && <TrackingPlanView plan={plan} />}

      {!plan && run.output_log && (
        <CollapsibleSection title="Raw output" lineCount={run.output_log.split('\n').length}>
          <pre className="px-4 py-3 text-[12px] font-mono whitespace-pre-wrap break-words text-foreground/80 max-h-[500px] overflow-y-auto border-t border-border">
            {run.output_log}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TestingRunDetail - test results view
// ---------------------------------------------------------------------------

function TestingRunDetail({ run }: { run: SkillRunDetail }) {
  const totalTokens = run.input_tokens + run.output_tokens

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Testing Run</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(run.started_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      <div className="border border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out</p>}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Score</p>
          {run.score !== null ? (
            <p className={`text-2xl font-bold leading-none ${run.score >= 0.8 ? 'text-[oklch(0.4_0.1_150)]' : run.score >= 0.5 ? 'text-amber-600' : 'text-destructive'}`}>
              {Math.round(run.score * 100)}%
            </p>
          ) : <p className="text-2xl font-bold leading-none text-muted-foreground/40">-</p>}
        </div>
      </div>

      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {run.output_log && <TestingOutput output={run.output_log} />}

      {!run.output_log && (
        <div className="border border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No output recorded for this run.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReportingRunDetail - parsed markdown report view
// ---------------------------------------------------------------------------

function ReportingRunDetail({ run }: { run: SkillRunDetail }) {
  const totalTokens = run.input_tokens + run.output_tokens

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Reporting Run</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(run.started_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      <div className="border border-border grid grid-cols-2 sm:grid-cols-3 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out</p>}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
      </div>

      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {run.output_log && <ReportOutput output={run.output_log} />}

      {!run.output_log && (
        <div className="border border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No output recorded for this run.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main RunDetailPage
// ---------------------------------------------------------------------------

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [run, setRun] = useState<SkillRunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    api.getSkillRun(runId)
      .then(r => setRun(r))
      .catch(err => setError((err as Error).message ?? 'Failed to load run'))
      .finally(() => setLoading(false))
  }, [runId])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 max-w-4xl">
        <div className="h-5 w-20 bg-muted animate-pulse" />
        <div className="h-8 w-64 bg-muted animate-pulse" />
        <div className="h-24 bg-muted animate-pulse" />
        <div className="h-48 bg-muted animate-pulse" />
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="flex flex-col gap-4 max-w-4xl">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={12} /> Back
        </button>
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {error ?? 'Run not found'}
        </div>
      </div>
    )
  }

  // Full audit view for audit runs
  if (run.skill_name === 'gtm-analytics-audit') {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft size={12} /> Back
        </button>
        <AuditRunDetail run={run} />
      </div>
    )
  }

  // Implementation runs: rich view with GTM grid + changed files
  if (run.skill_name === 'gtm-implementation') {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft size={12} /> Back
        </button>
        <ImplementationRunDetail run={run} />
      </div>
    )
  }

  // DOM runs: stats + tracking edits
  if (run.skill_name === 'gtm-dom-standardization') {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft size={12} /> Back
        </button>
        <DomRunDetail run={run} />
      </div>
    )
  }

  // Strategy runs: tracking plan view
  if (run.skill_name === 'gtm-strategy') {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft size={12} /> Back
        </button>
        <StrategyRunDetail run={run} />
      </div>
    )
  }

  // Testing runs: test results view
  if (run.skill_name === 'gtm-testing') {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft size={12} /> Back
        </button>
        <TestingRunDetail run={run} />
      </div>
    )
  }

  // Reporting runs: markdown report view
  if (run.skill_name === 'gtm-reporting') {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft size={12} /> Back
        </button>
        <ReportingRunDetail run={run} />
      </div>
    )
  }

  // Other runs: generic layout
  const totalTokens = run.input_tokens + run.output_tokens
  const skillLabel = SKILL_LABELS[run.skill_name] ?? run.skill_name

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Back nav */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ChevronLeft size={12} /> Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{skillLabel}</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(run.started_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.retry_count > 0 && (
            <span className="text-[11px] font-medium text-amber-600 border border-amber-300 px-1.5 py-0.5">
              x{run.retry_count} retries
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="border border-border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
          <p className="text-2xl font-bold leading-none">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-2xl font-bold leading-none">{totalTokens > 0 ? totalTokens.toLocaleString() : '-'}</p>
          {totalTokens > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out
            </p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-2xl font-bold leading-none">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Score</p>
          {run.score !== null ? (
            <p className={`text-2xl font-bold leading-none ${run.score >= 0.8 ? 'text-[oklch(0.4_0.1_150)]' : run.score >= 0.5 ? 'text-amber-600' : 'text-destructive'}`}>
              {Math.round(run.score * 100)}%
            </p>
          ) : (
            <p className="text-2xl font-bold leading-none text-muted-foreground/40">-</p>
          )}
        </div>
      </div>

      {/* Error */}
      {run.error_message && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {run.error_message}
        </div>
      )}

      {/* Tracking edits panel for dom/implementation runs */}
      {run.edits && (
        <TrackingEditsPanel edits={run.edits} status={run.status} />
      )}

      {/* Collapsible raw output for non-modifying skills */}
      {run.output_log && !['gtm-dom-standardization', 'gtm-implementation'].includes(run.skill_name) && (
        <CollapsibleSection title="Raw output" lineCount={run.output_log.split('\n').length}>
          <pre className="px-4 py-3 text-[12px] font-mono whitespace-pre-wrap break-words text-foreground/80 max-h-[500px] overflow-y-auto border-t border-border">
            {run.output_log}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  )
}
