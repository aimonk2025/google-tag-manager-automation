import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Lock, ChevronRight, AlertCircle, CheckCircle2, BarChart3, Users, Clock, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useSkillRun } from '@/hooks/useSkillRun'
import { useStrategyVariants, VARIANT_CONFIGS } from '@/hooks/useStrategyVariants'
import { ActivityFeed } from '@/components/ActivityFeed'
import { RerunSkillModal } from '@/components/RerunSkillModal'
import { RunHistory } from '@/components/RunHistory'
import { AdditionalInstructions } from '@/components/AdditionalInstructions'
import { PIPELINE_STEPS } from '@/lib/constants'
import { StepInfo } from '@/components/StepInfo'
import { extractJson } from '@/components/AuditDisplay'
import { formatElapsed } from '@/lib/utils'
import { api, type Approval } from '@/lib/api'
import type { TrackingPlan, TrackingEvent, AuditReport } from '@/types/session'

const SKILL_NAME = 'gtm-strategy'
const SKILL_LABEL = 'Strategy'

export default function StrategyPage() {
  const { session, markSkillComplete, isSkillUnlocked, isSkillComplete, refreshApprovals } = useSession()
  const isLocked = !isSkillUnlocked(SKILL_NAME)
  const isComplete = isSkillComplete(SKILL_NAME)
  const prevCompleteRef = useRef(isComplete)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [compareMode, setCompareMode] = useState(false)

  const skillIdx = PIPELINE_STEPS.findIndex(s => s.name === SKILL_NAME)
  const downstreamLabels = PIPELINE_STEPS.slice(skillIdx + 1).map(s => s.label)

  const [approval, setApproval] = useState<Approval | null>(null)
  const [approvalFetchDone, setApprovalFetchDone] = useState(false)

  const { parallel, variantOutputs, allVariantsComplete, runVariants, selectVariant, resetVariants } = useStrategyVariants()

  useEffect(() => {
    if (!session?.id || !isComplete) return
    api.getApprovals(session.id).then(approvals => {
      const a = approvals.find(ap => ap.skillName === 'gtm-strategy')
      setApproval(a ?? null)
    }).catch(() => {}).finally(() => setApprovalFetchDone(true))
  }, [session?.id, isComplete])

  // If strategy is complete but no approval row exists (INSERT may have silently failed), recover it
  useEffect(() => {
    if (!session?.id || !isComplete || !approvalFetchDone || approval !== null) return
    api.recoverApproval().then(() => {
      return api.getApprovals(session.id).then(approvals => {
        const a = approvals.find(ap => ap.skillName === 'gtm-strategy')
        setApproval(a ?? null)
      })
    }).catch(() => {})
  }, [session?.id, isComplete, approvalFetchDone, approval])

  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 2000)
      return () => clearTimeout(t)
    }
    prevCompleteRef.current = isComplete
  }, [isComplete])

  const { output, isRunning, error, elapsedMs, activity, retryCount, retryReason, run, cancel } = useSkillRun({
    onComplete: (claudeSessionId, fullOutput) => {
      if (claudeSessionId) {
        const plan = extractJson(fullOutput) ?? null
        markSkillComplete(SKILL_NAME, claudeSessionId, plan)
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
    if (compareMode) {
      resetVariants()
      runVariants()
    } else {
      run(SKILL_NAME, `Using the audit findings in CONTEXT, create a GA4 tracking strategy. Define event names, parameters, priorities (P0/P1/P2), and business value for each untracked element. Return a TrackingPlan JSON object only.`, session.projectPath)
    }
  }

  function handleSelectVariant(variantId: string) {
    selectVariant(variantId)
    setCompareMode(false)
  }

  const [plan, setPlan] = useState<TrackingPlan | null>(null)
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)

  useEffect(() => {
    if (!session?.id) return
    if (isComplete) {
      api.getSkillOutput<TrackingPlan>(SKILL_NAME).then(setPlan).catch(() => {})
    }
    api.getSkillOutput<AuditReport>('gtm-analytics-audit').then(setAuditReport).catch(() => {})
  }, [session?.id, isComplete])

  const stepMeta = PIPELINE_STEPS.find(s => s.name === SKILL_NAME)!
  const contextNote = auditReport
    ? `Audit found ${auditReport.summary.withoutTracking} untracked elements — using findings to define event priorities`
    : undefined

  const anyRunning = isRunning || parallel.isRunning

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Strategy</h1>
          <p className="text-sm text-muted-foreground mt-1">Plan events and tracking priorities based on audit findings.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isComplete && !anyRunning && <span className={`text-xs font-medium border px-2 py-1 transition-all duration-500 ${justCompleted ? 'bg-foreground text-background border-foreground' : 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]'}`}>Complete</span>}
          {anyRunning && (
            <>
              <span className="text-xs font-medium text-muted-foreground border border-border px-2 py-1 animate-pulse">
                {formatElapsed(isRunning ? elapsedMs : parallel.elapsedMs)}
              </span>
              <button
                onClick={() => { cancel(); parallel.cancel?.() }}
                className="h-9 px-4 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {!anyRunning && !isLocked && (
            <button
              onClick={() => setCompareMode(v => !v)}
              className={`h-9 px-3 text-xs font-medium border transition-colors ${
                compareMode
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
              }`}
            >
              Compare 3 variants
            </button>
          )}
          <button
            onClick={handleRunClick}
            disabled={isLocked || anyRunning || !session?.projectPath}
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {anyRunning ? 'Running...' : isComplete ? 'Re-run Strategy' : compareMode ? 'Run 3 Variants' : 'Run Strategy'}
          </button>
        </div>
      </div>

      {isLocked && (
        <LockedState message="Complete Audit and Prepare Elements first." />
      )}

      {!isLocked && <AdditionalInstructions skillName={SKILL_NAME} />}

      {!isLocked && !anyRunning && !plan && !output && !allVariantsComplete && (
        <StepInfo
          what={stepMeta.what}
          inputs={stepMeta.inputs}
          outputs={stepMeta.outputs}
          estimatedTime={stepMeta.estimatedTime}
          modifiesFiles={stepMeta.modifiesFiles}
          contextNote={contextNote}
        />
      )}

      {(error || parallel.error) && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {error ?? parallel.error}
        </div>
      )}

      {isRunning && (
        <ActivityFeed
          activity={activity}
          elapsedMs={elapsedMs}
          label="Claude is building strategy"
          retryCount={retryCount}
          retryReason={retryReason}
        />
      )}

      {parallel.isRunning && (
        <div className="grid grid-cols-3 gap-3">
          {parallel.workers.map((worker, i) => (
            <div key={worker.id} className="border border-border overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {VARIANT_CONFIGS[i]?.label ?? worker.id}
                </span>
                {worker.complete && <span className="text-[10px] text-[oklch(0.4_0.1_150)]">Done</span>}
                {!worker.complete && <span className="text-[10px] text-muted-foreground animate-pulse">Running...</span>}
              </div>
              <div className="px-3 py-2 min-h-[60px]">
                <p className="text-[11px] text-muted-foreground">{VARIANT_CONFIGS[i]?.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{worker.activity.length} events</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!anyRunning && allVariantsComplete && (
        <VariantComparisonGrid
          variants={VARIANT_CONFIGS}
          outputs={variantOutputs}
          onSelect={handleSelectVariant}
        />
      )}

      {!anyRunning && plan && <TrackingPlanView plan={plan} />}

      {!anyRunning && !plan && output && (
        <div className="border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Output</span>
          </div>
          <div className="px-4 py-4 max-h-[560px] overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words text-foreground font-mono text-[12px]">{output}</pre>
          </div>
        </div>
      )}

      {isComplete && !anyRunning && approval && (
        <ApprovalPanel approval={approval} onUpdate={setApproval} onDecision={refreshApprovals} />
      )}

      {isComplete && !anyRunning && (
        <div className="flex justify-end">
          <Link
            to="/implementation"
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors inline-flex items-center"
          >
            Next: Implementation
          </Link>
        </div>
      )}

      <RunHistory skillName={SKILL_NAME} onRerun={handleRunClick} />

      <RerunSkillModal
        isOpen={showRerunModal}
        skillLabel={SKILL_LABEL}
        downstreamSkills={downstreamLabels}
        onConfirm={doRun}
        onClose={() => setShowRerunModal(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tracking Plan View
// ---------------------------------------------------------------------------

export function TrackingPlanView({ plan }: { plan: TrackingPlan }) {
  const p0 = plan.events.filter(e => e.priority === 'P0')
  const p1 = plan.events.filter(e => e.priority === 'P1')
  const p2 = plan.events.filter(e => e.priority === 'P2')
  const gaps = plan.events.filter(e => e.status === 'gap')

  return (
    <div className="flex flex-col gap-5">

      {/* Metadata bar */}
      {plan.metadata && (
        <div className="border border-border bg-muted/20 px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1.5">
          {plan.metadata.businessModel && (
            <MetaRow label="Business Model" value={plan.metadata.businessModel} />
          )}
          {plan.metadata.primaryGoal && (
            <MetaRow label="Primary Goal" value={plan.metadata.primaryGoal} />
          )}
          {(plan.metadata as Record<string, string>).gtmContainerId && (
            <MetaRow label="GTM Container" value={(plan.metadata as Record<string, string>).gtmContainerId} />
          )}
          {(plan.metadata as Record<string, string>).auditCoverage && (
            <MetaRow label="Audit Coverage" value={(plan.metadata as Record<string, string>).auditCoverage} />
          )}
          {plan.metadata.framework && (
            <MetaRow label="Framework" value={plan.metadata.framework} />
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="border border-border grid grid-cols-4 divide-x divide-border">
        <SummaryCell label="Total Events" value={plan.summary?.totalEvents ?? plan.events.length} />
        <SummaryCell label="P0 Critical" value={plan.summary?.p0Events ?? p0.length} accent="text-foreground" />
        <SummaryCell label="P1 Important" value={plan.summary?.p1Events ?? p1.length} />
        <SummaryCell label="P2 / Gaps" value={(plan.summary?.p2Events ?? p2.length) + (gaps.length > 0 ? ` (${gaps.length} gap${gaps.length !== 1 ? 's' : ''})` : '')} accent={gaps.length > 0 ? 'text-amber-600' : undefined} />
      </div>

      {/* Events by priority group */}
      {[
        { label: 'P0 — Critical', events: p0, color: 'bg-primary text-primary-foreground' },
        { label: 'P1 — Important', events: p1, color: 'border border-border text-foreground' },
        { label: 'P2 — Nice to Have / Gaps', events: p2, color: 'bg-muted text-muted-foreground' },
      ].map(group => group.events.length > 0 && (
        <div key={group.label} className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{group.label}</h3>
          {group.events.map((event, i) => (
            <EventCard key={i} event={event} priorityClass={group.color} />
          ))}
        </div>
      ))}

      {/* Recommended reports */}
      {plan.recommendedReports && plan.recommendedReports.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <BarChart3 size={11} />
            Recommended Reports
          </h3>
          <div className="border border-border divide-y divide-border">
            {plan.recommendedReports.map((r, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-semibold">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{r.businessValue}</p>
                  </div>
                  {r.type && (
                    <span className="text-[10px] font-medium text-muted-foreground border border-border px-1.5 py-0.5 shrink-0 uppercase">{r.type}</span>
                  )}
                </div>
                {r.metrics && r.metrics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.metrics.map((m, j) => (
                      <span key={j} className="text-[11px] font-mono bg-muted px-1.5 py-0.5">{m}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audience definitions */}
      {plan.audienceDefinitions && plan.audienceDefinitions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Users size={11} />
            Audience Definitions
          </h3>
          <div className="border border-border divide-y divide-border">
            {plan.audienceDefinitions.map((a, i) => (
              <div key={i} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <p className="text-[13px] font-semibold">{a.name}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{a.criteria}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">{a.businessValue}</p>
                </div>
                <div className="text-right shrink-0">
                  {a.estimatedSize && (
                    <p className="text-[12px] font-medium">{a.estimatedSize}</p>
                  )}
                  {a.roiPotential && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.roiPotential}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function EventCard({ event, priorityClass }: { event: TrackingEvent; priorityClass: string }) {
  const [expanded, setExpanded] = useState(false)
  const isGap = event.status === 'gap'
  const isPartial = event.status === 'partial'
  const hasDetails = (
    event.parameters.length > 0 ||
    (event.trackedElements && event.trackedElements.length > 0) ||
    (event.untrackedElements && event.untrackedElements.length > 0) ||
    (event.reportingImpact && event.reportingImpact.length > 0) ||
    event.fix
  )

  return (
    <div className={`border overflow-hidden ${isGap ? 'border-amber-300' : 'border-border'}`}>
      {/* Card header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${isGap ? 'bg-amber-50/40' : 'bg-muted/20'} ${hasDetails ? 'cursor-pointer hover:bg-muted/40 transition-colors select-none' : ''}`}
        onClick={() => hasDetails && setExpanded(v => !v)}
      >
        {hasDetails && (
          <span className="transition-transform duration-150 text-muted-foreground shrink-0" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-flex' }}>
            <ChevronRight size={13} />
          </span>
        )}
        {!hasDetails && <span className="w-[13px] shrink-0" />}

        {/* Priority badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 shrink-0 ${priorityClass}`}>{event.priority}</span>

        {/* Status badge */}
        {isGap && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 border border-amber-300 bg-amber-50 px-1.5 py-0.5 shrink-0">
            <AlertCircle size={9} />
            gap
          </span>
        )}
        {event.status === 'active' && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-[oklch(0.4_0.1_150)] border border-[oklch(0.8_0.05_150)] px-1.5 py-0.5 shrink-0">
            <CheckCircle2 size={9} />
            active
          </span>
        )}
        {isPartial && (
          <span className="text-[10px] font-medium text-sky-700 border border-sky-300 px-1.5 py-0.5 shrink-0">partial</span>
        )}

        {/* Event name */}
        <span className="text-[13px] font-semibold font-mono flex-1 truncate">{event.name}</span>

        {/* Element counts */}
        {(event.trackedElements || event.untrackedElements) && (
          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {event.trackedElements?.length ?? 0} element{(event.trackedElements?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Business value — always visible */}
      <div className="px-4 py-2.5 border-t border-border/50">
        <p className="text-[12px] text-muted-foreground leading-relaxed">{event.businessValue}</p>
        {event.decisionImpact && (
          <p className="text-[12px] text-muted-foreground mt-1 italic">{event.decisionImpact}</p>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border flex flex-col divide-y divide-border/60">

          {/* Parameters */}
          {event.parameters.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Parameters</p>
              <div className="flex flex-col gap-1">
                {event.parameters.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-[12px]">
                    <span className="font-mono font-medium w-40 shrink-0">{p.name}</span>
                    <span className="text-muted-foreground w-12 shrink-0">{p.type}</span>
                    <span className="text-muted-foreground font-mono flex-1 truncate">{p.example}</span>
                    {p.required && <span className="text-[10px] text-amber-600 shrink-0">required</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tracked elements */}
          {event.trackedElements && event.trackedElements.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Tracked Elements</p>
              <div className="flex flex-col gap-1">
                {event.trackedElements.map((el, i) => (
                  <div key={i} className="flex items-start gap-3 text-[11px]">
                    <span className="text-[oklch(0.4_0.1_150)] shrink-0">✓</span>
                    {el.id && <span className="font-mono text-muted-foreground shrink-0">{el.id}</span>}
                    {el.file && <span className="font-mono text-sky-600 truncate">{el.file.split(/[\\/]/).slice(-2).join('/')}</span>}
                    {el.text && <span className="text-muted-foreground truncate">{el.text}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Untracked elements / gaps */}
          {event.untrackedElements && event.untrackedElements.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest mb-2">Untracked Elements</p>
              <div className="flex flex-col gap-1">
                {event.untrackedElements.map((el, i) => (
                  <div key={i} className="flex items-start gap-3 text-[11px]">
                    <span className="text-amber-500 shrink-0">!</span>
                    {el.id && <span className="font-mono text-muted-foreground shrink-0">{el.id}</span>}
                    {el.file && <span className="font-mono text-sky-600 truncate">{el.file.split(/[\\/]/).slice(-2).join('/')}</span>}
                    {el.text && <span className="text-muted-foreground truncate">{el.text}</span>}
                    {el.note && <span className="text-muted-foreground italic truncate">{el.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fix instruction */}
          {event.fix && (
            <div className="px-4 py-3 bg-amber-50/30">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest mb-1">Recommended Fix</p>
              <p className="text-[12px] text-amber-800 font-mono leading-relaxed">{event.fix}</p>
            </div>
          )}

          {/* Reporting impact */}
          {event.reportingImpact && event.reportingImpact.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Reporting Impact</p>
              <ul className="flex flex-col gap-0.5">
                {event.reportingImpact.map((r, i) => (
                  <li key={i} className="text-[12px] text-muted-foreground flex items-start gap-1.5">
                    <span className="text-violet-500 shrink-0 mt-0.5">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0 w-28">{label}</span>
      <span className="text-[12px] text-foreground truncate">{value}</span>
    </div>
  )
}

function SummaryCell({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold leading-none ${accent ?? ''}`}>{value}</p>
    </div>
  )
}

function VariantComparisonGrid({
  variants,
  outputs,
  onSelect,
}: {
  variants: typeof VARIANT_CONFIGS
  outputs: Record<string, string>
  onSelect: (variantId: string) => void
}) {
  function parsePlan(raw: string): TrackingPlan | null {
    try {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/)
      return JSON.parse(match?.[1] ?? raw) as TrackingPlan
    } catch {
      return null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">3 Strategy Variants</p>
        <p className="text-[12px] text-muted-foreground">Select the plan that best fits your goals</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {variants.map(v => {
          const plan = parsePlan(outputs[v.id] ?? '')
          const eventCount = plan?.events.length ?? 0
          const p0Count = plan?.events.filter(e => e.priority === 'P0').length ?? 0
          const p1Count = plan?.events.filter(e => e.priority === 'P1').length ?? 0
          return (
            <div key={v.id} className="border border-border flex flex-col">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-[13px] font-semibold">{v.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
              </div>
              <div className="px-4 py-3 flex flex-col gap-1.5 flex-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Total events</span>
                  <span className="font-semibold">{eventCount}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">P0 critical</span>
                  <span className="font-semibold">{p0Count}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">P1 important</span>
                  <span className="font-semibold">{p1Count}</span>
                </div>
                {plan?.events.slice(0, 3).map((e, i) => (
                  <span key={i} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 truncate">{e.name}</span>
                ))}
                {eventCount > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{eventCount - 3} more</span>
                )}
              </div>
              <div className="px-4 py-3 border-t border-border">
                <button
                  onClick={() => onSelect(v.id)}
                  className="w-full h-8 text-[12px] font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors"
                >
                  Select this plan
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ApprovalPanel({ approval, onUpdate, onDecision }: { approval: Approval; onUpdate: (a: Approval) => void; onDecision?: () => void }) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleApprove() {
    setLoading(true)
    try {
      const updated = await api.approveApproval(approval.id, note || undefined)
      onUpdate(updated)
      setNote('')
      onDecision?.()
    } catch { /* non-fatal */ } finally { setLoading(false) }
  }

  async function handleReject() {
    setLoading(true)
    try {
      const updated = await api.rejectApproval(approval.id, note || undefined)
      onUpdate(updated)
      setNote('')
      onDecision?.()
    } catch { /* non-fatal */ } finally { setLoading(false) }
  }

  if (approval.status === 'approved') {
    return (
      <div className="border border-[oklch(0.8_0.05_150)] bg-[oklch(0.97_0.02_150)] px-4 py-3 flex items-center gap-3">
        <CheckCircle2 size={14} className="text-[oklch(0.4_0.1_150)] shrink-0" />
        <p className="text-[13px] font-medium text-[oklch(0.4_0.1_150)] flex-1">Strategy approved — Implementation is unlocked</p>
        {approval.reviewNote && <p className="text-[12px] text-muted-foreground">{approval.reviewNote}</p>}
      </div>
    )
  }

  if (approval.status === 'rejected') {
    return (
      <div className="border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-center gap-3">
        <AlertCircle size={14} className="text-destructive shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-destructive">Strategy rejected</p>
          {approval.reviewNote && <p className="text-[12px] text-muted-foreground mt-0.5">{approval.reviewNote}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-amber-300 bg-amber-50/40 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-amber-200">
        <Clock size={14} className="text-amber-600 shrink-0" />
        <p className="text-[13px] font-medium text-amber-800 flex-1">Approve this strategy to unlock Implementation</p>
      </div>
      <div className="px-4 py-3 flex flex-col gap-3">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note..."
          rows={2}
          className="w-full text-[12px] border border-border bg-background px-3 py-2 resize-none focus:outline-none focus:border-foreground placeholder:text-muted-foreground"
        />
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="h-8 px-4 text-[12px] font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <ThumbsUp size={12} />
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="h-8 px-4 text-[12px] font-medium border border-destructive text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <ThumbsDown size={12} />
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

function LockedState({ message }: { message: string }) {
  return (
    <div className="border border-border bg-muted px-4 py-6 flex flex-col items-center gap-2 text-center">
      <Lock size={16} className="text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
