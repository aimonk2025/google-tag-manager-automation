import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Lock,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import type { CostSummary } from '@/lib/api'
import { api, getResolutionQueue, resolveElement, skipResolution } from '@/lib/api'
import type { ResolutionQueueItem } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import { useSkillRun } from '@/hooks/useSkillRun'
import { useGtmContainerData } from '@/hooks/useGtmContainerData'
import { RerunSkillModal } from '@/components/RerunSkillModal'
import { StepInfo } from '@/components/StepInfo'
import { ActivityFeed } from '@/components/ActivityFeed'
import { RunHistory } from '@/components/RunHistory'
import { AdditionalInstructions } from '@/components/AdditionalInstructions'
import { RawOutputToggle, AuditLiveOutput, extractJson } from '@/components/AuditDisplay'
import {
  SlimCoverageBar,
  PagesPanel,
  GtmContainerPanel,
} from '@/components/AuditShared'
import { PIPELINE_STEPS } from '@/lib/constants'
import { formatElapsed } from '@/lib/utils'
import type { AuditReport } from '@/types/session'
import { groupElementsByPage } from '@/utils/groupElementsByPage'

interface ConfidenceMetrics {
  coveragePct: number
  confidence: 'High' | 'Medium' | 'Low'
  flaggedIssues: string[]
}

const SKILL_NAME = 'gtm-analytics-audit'
const SKILL_LABEL = 'Audit'
const STEP_META = PIPELINE_STEPS.find(s => s.name === SKILL_NAME)!

// (SlimCoverageBar, CategoryBadge, ElementRow, PageSection, PagesPanel,
//  relativeTime, GtmTab, MAX_ITEMS, GtmContainerPanel, GtmInsightsPanel
//  are all imported from @/components/AuditShared)

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AuditPage() {
  const { session, markSkillComplete, isSkillUnlocked, isSkillComplete } = useSession()
  const { data: gtmContainerDataForTab } = useGtmContainerData(session?.id)
  const isLocked = !isSkillUnlocked(SKILL_NAME)
  const isComplete = isSkillComplete(SKILL_NAME)
  const prevCompleteRef = useRef(isComplete)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [scopeInput, setScopeInput] = useState('')
  const [coverage, setCoverage] = useState<{ notAudited: string[]; totalProjectFiles: number; auditedFiles: number } | null>(null)
  const [coverageSearch, setCoverageSearch] = useState('')
  const [addedToScan, setAddedToScan] = useState<Set<string>>(new Set())

  // Resolution queue state
  const [resolutionQueue, setResolutionQueue] = useState<ResolutionQueueItem[]>([])
  const [resolutionLoading, setResolutionLoading] = useState(false)
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())
  const [skippingIds, setSkippingIds] = useState<Set<string>>(new Set())

  // Confidence metrics state
  const [confidenceMetrics, setConfidenceMetrics] = useState<ConfidenceMetrics | null>(null)
  const [flaggedIssuesOpen, setFlaggedIssuesOpen] = useState(false)

  const fetchResolutionQueue = useCallback(async () => {
    if (!session?.id) return
    setResolutionLoading(true)
    try {
      const items = await getResolutionQueue(session.id)
      setResolutionQueue(items)
    } catch {
      try {
        const raw = session?.resolution_queue
        if (raw) {
          const parsed = JSON.parse(raw) as ResolutionQueueItem[]
          setResolutionQueue(parsed)
        }
      } catch {
        // malformed JSON or missing - leave empty
      }
    } finally {
      setResolutionLoading(false)
    }
  }, [session?.id, session?.resolution_queue])

  useEffect(() => {
    if (isComplete && session?.id) {
      fetchResolutionQueue()
    }
  }, [isComplete, session?.id, fetchResolutionQueue])

  async function handleResolve(item: ResolutionQueueItem) {
    setResolvingIds(prev => new Set(prev).add(item.id))
    try {
      await resolveElement(session!.id, item.elementId, item.elementType, item.context)
      setResolutionQueue(prev =>
        prev.map(q => q.id === item.id ? { ...q, status: 'resolved' as const } : q)
      )
    } catch {
      // leave status unchanged on error
    } finally {
      setResolvingIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  async function handleSkip(item: ResolutionQueueItem) {
    setSkippingIds(prev => new Set(prev).add(item.id))
    try {
      await skipResolution(item.id)
      setResolutionQueue(prev =>
        prev.map(q => q.id === item.id ? { ...q, status: 'skipped' as const } : q)
      )
    } catch {
      // leave status unchanged on error
    } finally {
      setSkippingIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  useEffect(() => {
    const currentParts = new Set(scopeInput.split(',').map(s => s.trim()).filter(Boolean))
    setAddedToScan(prev => {
      const next = new Set<string>()
      prev.forEach(f => { if (currentParts.has(f)) next.add(f) })
      return next
    })
  }, [scopeInput])

  const scopeInputRef = useRef<HTMLInputElement>(null)
  const storageKey = `audit-output-${session?.id ?? 'default'}`
  const [savedOutput, setSavedOutput] = useState<string>('')

  useEffect(() => {
    if (session?.id) {
      const key = `audit-output-${session.id}`
      setSavedOutput(localStorage.getItem(key) ?? '')
    }
  }, [session?.id])

  const [report, setReport] = useState<AuditReport | null>(null)

  useEffect(() => {
    if (isComplete && session?.id) {
      api.auditCoverage().then(r => setCoverage(r)).catch(() => {})
      api.getSkillOutput<AuditReport>(SKILL_NAME).then(setReport).catch(() => {})
    }
  }, [isComplete, session?.id])

  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 2000)
      return () => clearTimeout(t)
    }
    prevCompleteRef.current = isComplete
  }, [isComplete])

  const skillIdx = PIPELINE_STEPS.findIndex(s => s.name === SKILL_NAME)
  const downstreamLabels = PIPELINE_STEPS.slice(skillIdx + 1).map(s => s.label)

  const { output, isRunning, error, elapsedMs, activity, retryCount, retryReason, run, cancel } = useSkillRun({
    onComplete: (claudeSessionId, fullOutput, diskReport) => {
      if (claudeSessionId) {
        const report = extractJson(fullOutput) ?? diskReport ?? null
        markSkillComplete(SKILL_NAME, claudeSessionId, report)
        localStorage.setItem(storageKey, fullOutput)
        setSavedOutput(fullOutput)
        api.auditCoverage().then(r => setCoverage(r)).catch(() => {})
        fetchResolutionQueue()
      }
    },
    onEvent: (eventName, data) => {
      if (eventName === 'confidence_update') {
        const coveragePct = typeof data.coveragePct === 'number' ? data.coveragePct : 0
        const rawConfidence = typeof data.confidence === 'string' ? data.confidence : ''
        const confidence: 'High' | 'Medium' | 'Low' =
          rawConfidence === 'High' || rawConfidence === 'Medium' || rawConfidence === 'Low'
            ? rawConfidence
            : 'Medium'
        const flaggedIssues = Array.isArray(data.flaggedIssues)
          ? (data.flaggedIssues as unknown[]).map(i => String(i))
          : []
        setConfidenceMetrics({ coveragePct, confidence, flaggedIssues })
      }
    },
  })

  function handleRunClick() {
    if (isComplete) {
      setShowRerunModal(true)
    } else {
      doRun()
    }
  }

  function doRun() {
    if (!session?.projectPath) return
    setSavedOutput('')
    localStorage.removeItem(storageKey)
    setAddedToScan(new Set())
    const scopedPages = scopeInput.trim()
      ? scopeInput.split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    run(
      SKILL_NAME,
      `Audit this codebase for all trackable interactive elements. Identify buttons, links, forms, CTAs, and navigation items. For each element record: file path, line number, element text, existing id/class attributes, whether it already has tracking, and a recommended id to add. Return a structured AuditReport JSON.`,
      session.projectPath,
      scopedPages
    )
  }

  const displayOutput = output || savedOutput

  // Tab state
  const [activeTab, setActiveTab] = useState<'pages' | 'gtm' | 'history'>('pages')

  // Cost summary for History tab
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [costSummaryLoading, setCostSummaryLoading] = useState(false)

  const fetchCostSummary = useCallback(async () => {
    if (!session?.id) return
    setCostSummaryLoading(true)
    try {
      const data = await api.getCostsSummary(session.id)
      setCostSummary(data)
    } catch {
      // non-fatal
    } finally {
      setCostSummaryLoading(false)
    }
  }, [session?.id])

  useEffect(() => {
    if (activeTab === 'history' && !costSummary && session?.id) {
      fetchCostSummary()
    }
  }, [activeTab, costSummary, session?.id, fetchCostSummary])

  // Compute tab badge values
  const allGroups = report ? groupElementsByPage(report as unknown as Record<string, unknown>) : []
  const untrackedCount = allGroups.reduce((sum, g) => sum + g.untrackedCount, 0)

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">Scan your codebase for all trackable elements.</p>
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
              <button
                onClick={cancel}
                className="h-9 px-4 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          <button
            onClick={handleRunClick}
            disabled={isLocked || isRunning || !session?.projectPath}
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : isComplete ? 'Re-run Audit' : 'Run Audit'}
          </button>
        </div>
      </div>

      <AdditionalInstructions skillName={SKILL_NAME} />

      {/* Scope input - only shown when previous audit exists and not currently running */}
      {!isLocked && !isRunning && isComplete && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Re-scan specific pages (optional)
          </label>
          <input
            ref={scopeInputRef}
            type="text"
            value={scopeInput}
            onChange={e => setScopeInput(e.target.value)}
            placeholder="e.g. pricing page, checkout, dashboard - leave blank to re-scan everything"
            className="h-9 px-3 text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors w-full"
          />
          <p className="text-[11px] text-muted-foreground">
            Use plain descriptions. Claude will find the files. Separate multiple pages with commas.
          </p>
        </div>
      )}

      {/* Locked */}
      {isLocked && (
        <div className="border border-border bg-muted px-4 py-10 flex flex-col items-center gap-2 text-center">
          <Lock size={16} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Complete Setup first to configure your project path.</p>
        </div>
      )}

      {!isLocked && !isRunning && !displayOutput && (
        <StepInfo
          what={STEP_META.what}
          inputs={STEP_META.inputs}
          outputs={STEP_META.outputs}
          estimatedTime={STEP_META.estimatedTime}
          modifiesFiles={STEP_META.modifiesFiles}
        />
      )}

      {/* Error */}
      {error && <ErrorBanner message={error} />}

      {/* Slim coverage bar - visible after audit completes with a report */}
      {!isRunning && report && (
        <SlimCoverageBar report={report} />
      )}

      {/* When running: show activity feed */}
      {isRunning && (
        <ActivityFeed
          activity={activity}
          elapsedMs={elapsedMs}
          retryCount={retryCount}
          retryReason={retryReason}
        />
      )}

      {/* Tabbed layout */}
      {!isLocked && (
        <div className="flex flex-col gap-0">
          {/* Tab bar */}
          <div className="flex items-center border-b border-border gap-0">
            <button
              onClick={() => setActiveTab('pages')}
              className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'pages'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Pages + Elements{untrackedCount > 0 ? ` (${untrackedCount})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('gtm')}
              className={`text-[15px] font-semibold px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'gtm'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              GTM Container{gtmContainerDataForTab?.containerSummary?.totalTags != null ? ` (${gtmContainerDataForTab.containerSummary.totalTags} tags)` : ''}
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

          {/* Tab content */}
          <div className="pt-4">
            {activeTab === 'pages' && (
              <PagesPanel
                report={report}
                isRunning={isRunning}
              />
            )}

            {activeTab === 'gtm' && (
              <div className="flex flex-col gap-4">
                <GtmContainerPanel sessionId={session?.id} report={report} />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col gap-6">
                {/* Cost summary */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Session Cost Summary</p>
                    {costSummaryLoading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                    {!costSummaryLoading && costSummary && (
                      <button
                        onClick={fetchCostSummary}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        <RefreshCw size={11} />
                        Refresh
                      </button>
                    )}
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

                {/* Run history for this skill */}
                <RunHistory
                  skillName={SKILL_NAME}
                  onRerun={handleRunClick}
                  onRestoreOutput={(historicalOutput) => {
                    setSavedOutput(historicalOutput)
                    localStorage.setItem(storageKey, historicalOutput)
                    const restoredReport = extractJson(historicalOutput)
                    if (restoredReport) markSkillComplete(SKILL_NAME, 'restored', restoredReport)
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coverage gap panel */}
      {!isRunning && isComplete && coverage && coverage.notAudited.length > 0 && (
        <div className="border border-amber-300 bg-amber-50/40">
          <div className="px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-600 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              {coverage.notAudited.length} file{coverage.notAudited.length !== 1 ? 's' : ''} not yet audited
            </span>
            <span className="ml-auto text-[11px] text-amber-600">
              {coverage.auditedFiles} of {coverage.totalProjectFiles} scanned
            </span>
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            <input
              type="text"
              value={coverageSearch}
              onChange={e => setCoverageSearch(e.target.value)}
              placeholder="Search files..."
              className="h-8 px-3 text-[12px] border border-amber-200 bg-white/60 text-foreground placeholder:text-amber-400 focus:outline-none focus:border-amber-400 transition-colors w-full"
            />
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-5">
              {coverage.notAudited
                .filter(f => !coverageSearch.trim() || f.toLowerCase().includes(coverageSearch.toLowerCase()))
                .map(f => (
                  <div key={f} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-mono text-foreground/70 truncate">{f}</span>
                    <button
                      onClick={() => {
                        setScopeInput(prev => {
                          const parts = prev ? prev.split(',').map(s => s.trim()).filter(Boolean) : []
                          if (parts.includes(f)) return prev
                          return [...parts, f].join(', ')
                        })
                        setAddedToScan(prev => new Set(prev).add(f))
                        setTimeout(() => {
                          scopeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          scopeInputRef.current?.focus()
                        }, 50)
                      }}
                      disabled={addedToScan.has(f)}
                      className={`text-[11px] shrink-0 border px-2 py-0.5 transition-colors ${addedToScan.has(f) ? 'text-green-700 border-green-300 bg-green-50 cursor-default' : 'text-amber-700 hover:text-amber-900 border-amber-300 hover:border-amber-500'}`}
                    >
                      {addedToScan.has(f) ? 'added' : '+ add to scan'}
                    </button>
                  </div>
                ))}
            </div>
            <button
              onClick={() => {
                setScopeInput(coverage.notAudited.join(', '))
                setTimeout(() => {
                  scopeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  scopeInputRef.current?.focus()
                }, 50)
              }}
              className="self-start text-[11px] font-medium text-amber-700 hover:text-amber-900 border border-amber-300 px-3 py-1 hover:border-amber-500 transition-colors mt-1"
            >
              Add all to scan
            </button>
          </div>
        </div>
      )}

      {/* Raw output toggle (when complete without structured report: show directly) */}
      {!isRunning && !report && displayOutput && (
        <AuditLiveOutput output={displayOutput} isRunning={false} />
      )}

      {/* Raw output behind toggle when report exists */}
      {!isRunning && report && displayOutput && (
        <RawOutputToggle output={displayOutput} />
      )}

      {/* Confidence metrics bar - full width, below two panels */}
      {!isRunning && isComplete && confidenceMetrics && (
        <div className="border border-border px-4 py-3 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Audit Confidence</p>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">Coverage</span>
              <span className="text-[15px] font-semibold tabular-nums">{confidenceMetrics.coveragePct}%</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">Confidence</span>
              <span className={`text-[13px] font-semibold ${
                confidenceMetrics.confidence === 'High'
                  ? 'text-[oklch(0.4_0.12_150)]'
                  : confidenceMetrics.confidence === 'Medium'
                  ? 'text-[oklch(0.55_0.12_80)]'
                  : 'text-[oklch(0.45_0.15_25)]'
              }`}>
                {confidenceMetrics.confidence}
              </span>
            </div>
            {confidenceMetrics.flaggedIssues.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">Flagged Issues</span>
                <button
                  onClick={() => setFlaggedIssuesOpen(prev => !prev)}
                  className="flex items-center gap-1 text-[13px] font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  {confidenceMetrics.flaggedIssues.length}
                  {flaggedIssuesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            )}
          </div>
          {flaggedIssuesOpen && confidenceMetrics.flaggedIssues.length > 0 && (
            <div className="border-t border-border pt-2 mt-1 flex flex-col gap-1">
              {confidenceMetrics.flaggedIssues.map((issue, i) => (
                <p key={i} className="text-[12px] text-muted-foreground">{issue}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resolution queue - full width, below two panels */}
      {!isRunning && isComplete && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Resolution Queue</p>
            {resolutionLoading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
            {!resolutionLoading && resolutionQueue.length > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {resolutionQueue.filter(q => q.status === 'pending').length} unresolved / {resolutionQueue.length} total
              </span>
            )}
          </div>

          {!resolutionLoading && resolutionQueue.length === 0 && (
            <div className="border border-border px-4 py-6 flex items-center justify-center gap-2 text-center">
              <CheckCircle size={14} className="text-[oklch(0.4_0.12_150)]" />
              <span className="text-[13px] text-muted-foreground">All elements resolved</span>
            </div>
          )}

          {!resolutionLoading && resolutionQueue.length > 0 && (
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Element</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Page / File</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Status</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutionQueue.map(item => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono truncate max-w-[160px]" title={item.elementText}>
                        {item.elementText || item.elementId}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.elementType}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[180px]" title={item.pageOrFile}>
                        {item.pageOrFile}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          item.status === 'resolved'
                            ? 'bg-[oklch(0.95_0.06_150)] text-[oklch(0.35_0.1_150)]'
                            : item.status === 'skipped'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {item.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResolve(item)}
                              disabled={resolvingIds.has(item.id)}
                              className="text-[11px] font-medium border border-border px-2 py-0.5 hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            >
                              {resolvingIds.has(item.id) && <Loader2 size={10} className="animate-spin" />}
                              Resolve
                            </button>
                            <button
                              onClick={() => handleSkip(item)}
                              disabled={skippingIds.has(item.id)}
                              className="text-[11px] text-muted-foreground border border-border px-2 py-0.5 hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            >
                              {skippingIds.has(item.id) && <Loader2 size={10} className="animate-spin" />}
                              Skip
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Next step */}
      {isComplete && !isRunning && (
        <div className="flex justify-end pt-2">
          <Link
            to="/dom"
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors inline-flex items-center"
          >
            Next: Prepare Elements
          </Link>
        </div>
      )}

      <RerunSkillModal
        isOpen={showRerunModal}
        skillLabel={SKILL_LABEL}
        downstreamSkills={downstreamLabels}
        onConfirm={() => { doRun(); setShowRerunModal(false) }}
        onClose={() => setShowRerunModal(false)}
      />
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}
