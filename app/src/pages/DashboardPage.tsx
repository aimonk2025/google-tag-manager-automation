import React, { useState, useEffect } from 'react'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { PIPELINE_STEPS } from '@/lib/constants'
import { SiteOverviewCard } from '@/components/SiteOverviewCard'
import { useSessionStats, type SessionScore } from '@/hooks/useSessionStats'
import { SkeletonDashboard } from '@/components/Skeleton'
import { checkCodebaseDrift, acknowledgeDrift, type CodebaseDriftResult } from '@/lib/api'

function SkillTimeline({ scores }: { scores: SessionScore[] }) {
  if (scores.length === 0) return null
  const sorted = [...scores].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const maxDuration = Math.max(...sorted.map(s => s.duration_ms), 1)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Run Timeline</p>
      {sorted.map(item => {
        const widthPct = Math.max(2, Math.round((item.duration_ms / maxDuration) * 100))
        const skillLabel = PIPELINE_STEPS.find(s => s.name === item.skill_name)?.label ?? item.skill_name
        const scorePct = Math.round(item.score * 100)
        const durationLabel = item.duration_ms < 60000
          ? `${(item.duration_ms / 1000).toFixed(0)}s`
          : `${Math.floor(item.duration_ms / 60000)}m`
        return (
          <div key={item.skill_name} className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground w-28 shrink-0 truncate">{skillLabel}</span>
            <div className="flex-1 h-5 bg-muted/40 relative overflow-hidden">
              <div
                className="h-full bg-foreground/80 transition-all duration-700"
                style={{ width: `${widthPct}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[9px] text-primary-foreground font-mono">
                {durationLabel}
              </span>
            </div>
            <span className="text-[11px] font-mono tabular-nums w-8 shrink-0 text-right text-muted-foreground">
              {scorePct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const { session, loading, isSkillComplete, isSkillUnlocked } = useSession()
  const navigate = useNavigate()
  const [driftData, setDriftData] = useState<CodebaseDriftResult | null>(null)
  const [driftDismissed, setDriftDismissed] = useState(false)
  const { costs, pendingApprovals, scores: sessionScores } = useSessionStats(session?.id)

  useEffect(() => {
    if (!session?.id) return
    const coverage = session.audit_coverage_pct ?? 0
    if (coverage <= 0) return
    checkCodebaseDrift(session.id)
      .then(result => setDriftData(result))
      .catch(() => {
        // Endpoint may not exist yet - silently ignore
      })
  }, [session?.id, session?.audit_coverage_pct])

  if (loading) return <SkeletonDashboard />
  if (!session) return <Navigate to="/projects" replace />

  const showDriftBanner =
    driftData !== null &&
    driftData.hasChanges &&
    !driftDismissed &&
    (session.drift_acknowledged ?? 0) !== 1

  async function handleDismissDrift() {
    if (!session?.id) return
    setDriftDismissed(true)
    try {
      await acknowledgeDrift(session.id)
    } catch {
      // Best-effort - banner is already hidden locally
    }
  }

  const completedCount = session.completedSkills.length
  const nextStep = PIPELINE_STEPS.find(s => !isSkillComplete(s.name))
  const projectName = session.name ?? session.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? session.projectPath
  const auditCompact = session.compactOutputs?.['gtm-analytics-audit'] as Record<string, unknown> | undefined
  const auditSummary = auditCompact?.summary as Record<string, unknown> | undefined

  return (
    <div className="flex flex-col gap-8 max-w-3xl">

      {/* Codebase drift warning banner */}
      {showDriftBanner && driftData && (
        <div className="border border-yellow-400 bg-yellow-50/60 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-yellow-900">
              {driftData.totalNew > 0
                ? `${driftData.totalNew} new file${driftData.totalNew !== 1 ? 's' : ''} detected since your last Audit.`
                : 'File changes detected since your last Audit.'}{' '}
              Your tracking coverage may be outdated.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/audit')}
              className="text-[12px] font-medium text-yellow-900 border border-yellow-400 px-3 py-1 hover:bg-yellow-100 transition-colors"
            >
              Re-run Audit
            </button>
            <button
              onClick={handleDismissDrift}
              className="text-[12px] text-yellow-700 hover:text-yellow-900 border border-yellow-300 px-3 py-1 hover:bg-yellow-100 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Project header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{projectName}</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono text-[12px]">{session.projectPath}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/projects"
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 transition-colors"
          >
            All Projects
          </Link>
          <Link
            to="/setup"
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 transition-colors"
          >
            Edit Setup
          </Link>
        </div>
      </div>

      {/* Site overview card */}
      <SiteOverviewCard session={session} />

      {/* Progress bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">{completedCount} of {PIPELINE_STEPS.length} steps complete</span>
          <span className="text-muted-foreground">{Math.round((completedCount / PIPELINE_STEPS.length) * 100)}%</span>
        </div>
        <div className="w-full h-1.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-foreground transition-all duration-500"
            style={{ width: `${(completedCount / PIPELINE_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Cost + approvals stat row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Session Cost"
          value={costs && costs.totalCostUsd > 0 ? `$${costs.totalCostUsd.toFixed(3)}` : '$0.00'}
          sparkline={costs?.bySkill && costs.bySkill.length > 1 ? (
            <div className="mt-2 flex items-end gap-0.5" style={{ height: 16 }}>
              {costs.bySkill.slice(0, 7).map(s => {
                const heightPx = costs.totalCostUsd > 0 ? Math.max(2, Math.round((s.costUsd / costs.totalCostUsd) * 16)) : 2
                return (
                  <div
                    key={s.skillName}
                    title={`${s.skillName}: $${s.costUsd.toFixed(4)}`}
                    className="w-2 bg-foreground/60 shrink-0"
                    style={{ height: heightPx }}
                  />
                )
              })}
            </div>
          ) : undefined}
        />
        <StatCard
          label="Tokens Used"
          value={costs && (costs.totalInputTokens + costs.totalOutputTokens) > 0
            ? `${((costs.totalInputTokens + costs.totalOutputTokens) / 1000).toFixed(1)}k`
            : '0'}
        />
        <StatCard
          label="Pending Approvals"
          value={String(pendingApprovals)}
          highlight={pendingApprovals > 0}
          linkTo={pendingApprovals > 0 ? '/approvals' : undefined}
        />
      </div>

      {/* Quick stats from completed steps */}
      {auditSummary && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Coverage" value={String(auditSummary.analyticsReadiness ?? '')} />
          <StatCard label="Tracked" value={`${auditSummary.withTracking ?? 0}/${auditSummary.totalClickableElements ?? 0}`} />
          <StatCard label="Gaps" value={String(auditSummary.withoutTracking ?? 0)} highlight={(auditSummary.withoutTracking as number ?? 0) > 0} />
        </div>
      )}

      {/* Primary CTA */}
      {nextStep ? (
        <div className="border border-border p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Next step</p>
            <p className="text-[15px] font-semibold">{nextStep.label}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">{nextStep.shortDescription}</p>
          </div>
          <Link
            to={nextStep.route}
            className="h-10 px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors inline-flex items-center shrink-0"
          >
            Continue
          </Link>
        </div>
      ) : (
        <div className="border border-border p-5 bg-muted/30 text-center">
          <p className="text-[13px] font-medium">All steps complete</p>
          <p className="text-[12px] text-muted-foreground mt-1">Your GTM implementation pipeline is finished.</p>
        </div>
      )}

      {/* Run timeline */}
      {sessionScores.length > 0 && (
        <SkillTimeline scores={sessionScores} />
      )}

      {/* Pipeline step grid */}
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline</p>
        {PIPELINE_STEPS.map((step, idx) => {
          const complete = isSkillComplete(step.name)
          const unlocked = isSkillUnlocked(step.name)
          const isNext = nextStep?.name === step.name

          return (
            <Link
              key={step.name}
              to={unlocked ? step.route : '#'}
              onClick={e => !unlocked && e.preventDefault()}
              className={`flex items-center gap-4 px-4 py-3 border transition-colors ${
                isNext
                  ? 'border-foreground bg-muted/40'
                  : complete
                  ? 'border-border hover:bg-muted/30'
                  : unlocked
                  ? 'border-border hover:bg-muted/20'
                  : 'border-border opacity-40 cursor-default'
              }`}
            >
              {/* Step number */}
              <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-5">
                {String(idx + 1).padStart(2, '0')}
              </span>

              {/* Status dot */}
              <span className={`w-2 h-2 shrink-0 ${
                complete ? 'bg-foreground' : isNext ? 'bg-foreground animate-pulse' : 'border border-current'
              }`} />

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium">{step.label}</span>
                <span className="text-[12px] text-muted-foreground ml-2">{step.shortDescription}</span>
              </div>

              {/* Status label */}
              {complete && (
                <span className="text-[11px] font-medium text-[oklch(0.4_0.1_150)] shrink-0">Done</span>
              )}
              {isNext && (
                <span className="text-[11px] font-medium text-foreground shrink-0">Up next</span>
              )}
            </Link>
          )
        })}
      </div>

    </div>
  )
}

function StatCard({ label, value, highlight, linkTo, sparkline }: { label: string; value: string; highlight?: boolean; linkTo?: string; sparkline?: React.ReactNode }) {
  const content = (
    <div className={`border border-border px-4 py-3 ${linkTo ? 'hover:bg-muted/30 transition-colors' : ''}`}>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${highlight ? 'text-[oklch(0.45_0.1_25)]' : ''}`}>{value}</p>
      {sparkline}
    </div>
  )
  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>
  }
  return content
}
