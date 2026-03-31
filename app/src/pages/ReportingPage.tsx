import { useState, useEffect, useRef } from 'react'
import { Lock, ChevronRight, CheckCircle2 } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useSkillRun } from '@/hooks/useSkillRun'
import { ActivityFeed } from '@/components/ActivityFeed'
import { RerunSkillModal } from '@/components/RerunSkillModal'
import { RunHistory } from '@/components/RunHistory'
import { AdditionalInstructions } from '@/components/AdditionalInstructions'
import { StepInfo } from '@/components/StepInfo'
import { PIPELINE_STEPS } from '@/lib/constants'
import { formatElapsed } from '@/lib/utils'
import { api } from '@/lib/api'
import type { AuditReport, TrackingPlan } from '@/types/session'

const SKILL_NAME = 'gtm-reporting'
const SKILL_LABEL = 'Reporting'

export default function ReportingPage() {
  const { session, markSkillComplete, isSkillUnlocked, isSkillComplete } = useSession()
  const isLocked = !isSkillUnlocked(SKILL_NAME)
  const isComplete = isSkillComplete(SKILL_NAME)
  const prevCompleteRef = useRef(isComplete)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showRerunModal, setShowRerunModal] = useState(false)

  const stepMeta = PIPELINE_STEPS.find(s => s.name === SKILL_NAME)!

  const { output, isRunning, error, elapsedMs, activity, retryCount, retryReason, run, cancel } = useSkillRun({
    onComplete: (claudeSessionId) => {
      if (claudeSessionId) {
        markSkillComplete(SKILL_NAME, claudeSessionId, null)
      }
    },
  })

  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      setJustCompleted(true)
      const t = setTimeout(() => setJustCompleted(false), 2000)
      return () => clearTimeout(t)
    }
    prevCompleteRef.current = isComplete
  }, [isComplete])

  function handleRunClick() {
    if (isComplete) {
      setShowRerunModal(true)
    } else {
      doRun()
    }
  }

  function doRun() {
    if (!session?.projectPath) return
    run(SKILL_NAME, `Generate a concise implementation report from the pipeline summary in CONTEXT. Include: coverage improvement, events implemented, files modified, test results. Max 1500 words markdown format.`, session.projectPath)
  }

  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)
  const [trackingPlan, setTrackingPlan] = useState<TrackingPlan | null>(null)

  useEffect(() => {
    if (!session?.id) return
    api.getSkillOutput<AuditReport>('gtm-analytics-audit').then(setAuditReport).catch(() => {})
    api.getSkillOutput<TrackingPlan>('gtm-strategy').then(setTrackingPlan).catch(() => {})
  }, [session?.id])

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Reporting</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate documentation and summaries of the completed implementation.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isComplete && !isRunning && (
            <span className={`text-xs font-medium border px-2 py-1 transition-all duration-500 ${justCompleted ? 'bg-foreground text-background border-foreground' : 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]'}`}>Complete</span>
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
          <button
            onClick={handleRunClick}
            disabled={isLocked || isRunning || !session?.projectPath}
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : isComplete ? 'Re-run Reporting' : 'Generate Report'}
          </button>
        </div>
      </div>

      {!isLocked && <AdditionalInstructions skillName={SKILL_NAME} />}

      {/* Locked */}
      {isLocked && (
        <div className="border border-border bg-muted px-4 py-6 flex flex-col items-center gap-2 text-center">
          <Lock size={16} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Complete Testing first.</p>
        </div>
      )}

      {/* Pipeline summary — what we're reporting on */}
      {!isLocked && !isRunning && (auditReport || trackingPlan) && (
        <div className="border border-border">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Pipeline Summary</h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            {auditReport && (
              <>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Coverage</p>
                  <p className="text-2xl font-bold leading-none">
                    {auditReport.summary.coveragePercent != null ? `${auditReport.summary.coveragePercent}%` : '?'}
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1">after implementation</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Elements Tracked</p>
                  <p className="text-2xl font-bold leading-none">
                    {auditReport.summary.withTracking ?? '?'}
                    <span className="text-base font-normal text-muted-foreground"> / {auditReport.summary.total ?? '?'}</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1">from audit baseline</p>
                </div>
              </>
            )}
            {trackingPlan && (
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Events Defined</p>
                <p className="text-2xl font-bold leading-none">{trackingPlan.events.length}</p>
                <p className="text-[12px] text-muted-foreground mt-1">in tracking plan</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step info */}
      {!isLocked && !isRunning && !output && !auditReport && !trackingPlan && (
        <StepInfo
          what={stepMeta.what}
          inputs={stepMeta.inputs}
          outputs={stepMeta.outputs}
          estimatedTime={stepMeta.estimatedTime}
          modifiesFiles={stepMeta.modifiesFiles}
        />
      )}

      {/* Error */}
      {error && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Activity feed while running */}
      {isRunning && (
        <ActivityFeed
          activity={activity}
          elapsedMs={elapsedMs}
          label="Claude is generating report"
        />
      )}

      {/* Report output */}
      {!isRunning && output && (
        <ReportOutput output={output} />
      )}

      {/* Recommended Reports */}
      {isComplete && !isRunning && (
        <RecommendedReports />
      )}

      {/* Pipeline complete */}
      {isComplete && !isRunning && (
        <div className="border border-[oklch(0.8_0.05_150)] bg-[oklch(0.97_0.02_150)] px-5 py-4 flex items-start gap-3">
          <CheckCircle2 size={16} className="text-[oklch(0.4_0.1_150)] mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-[oklch(0.3_0.08_150)]">Pipeline Complete</p>
            <p className="text-[13px] text-[oklch(0.4_0.1_150)] mt-0.5">All 6 steps completed. Your analytics tracking implementation is live.</p>
          </div>
        </div>
      )}

      <RunHistory skillName={SKILL_NAME} onRerun={handleRunClick} />

      <RerunSkillModal
        isOpen={showRerunModal}
        skillLabel={SKILL_LABEL}
        downstreamSkills={[]}
        onConfirm={() => { doRun(); setShowRerunModal(false) }}
        onClose={() => setShowRerunModal(false)}
      />
    </div>
  )
}

interface RecommendedReport {
  name: string
  description: string
  type: string
  metrics?: string[]
}

const RECOMMENDED_REPORTS: RecommendedReport[] = [
  {
    name: 'Course Completion Funnel',
    description: 'End-to-end course engagement measurement - identify which modules cause learner drop-off',
    type: 'GA4 Funnel Exploration',
  },
  {
    name: 'LedgerOS Waitlist Conversion',
    description: 'Measures which LedgerOS product angle drives highest waitlist intent',
    type: 'GA4 Funnel Exploration',
  },
  {
    name: 'Developer Activation Funnel',
    description: 'Full developer journey from GTM page discovery to lead capture',
    type: 'GA4 Funnel Exploration',
  },
  {
    name: 'Navigation Efficiency Report',
    description: 'Optimize site architecture and nav copy based on actual usage patterns',
    type: 'Custom Dashboard',
    metrics: [
      'navigation_click count by nav_destination (top paths)',
      'navigation_click by nav_location (header vs footer vs sidebar)',
      'Mobile toggle open rate vs desktop nav usage',
      'Navigation click to next page_view conversion rate',
    ],
  },
]

function RecommendedReports() {
  return (
    <div className="border border-border">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Recommended Reports</h2>
      </div>
      <div className="divide-y divide-border/50">
        {RECOMMENDED_REPORTS.map((report) => (
          <div key={report.name} className="px-4 py-3 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-medium">{report.name}</span>
                <span className="text-[10px] font-mono border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">{report.type}</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{report.description}</p>
              {report.metrics && (
                <ul className="mt-2 flex flex-col gap-0.5">
                  {report.metrics.map((m) => (
                    <li key={m} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <span className="mt-0.5 shrink-0 opacity-40">·</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReportOutput({ output }: { output: string }) {
  const [showRaw, setShowRaw] = useState(false)

  // Parse markdown into sections
  const sections = parseMarkdownSections(output)

  if (sections.length === 0) {
    return (
      <div className="border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Report</span>
        </div>
        <pre className="px-4 py-4 text-[13px] font-mono whitespace-pre-wrap break-words max-h-[560px] overflow-y-auto">{output}</pre>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, i) => (
        <ReportSection key={i} section={section} defaultOpen={i === 0} />
      ))}

      <div className="border border-border overflow-hidden">
        <button
          onClick={() => setShowRaw(v => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors text-left"
        >
          <span className="transition-transform duration-200" style={{ transform: showRaw ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-flex' }}>
            <ChevronRight size={13} />
          </span>
          {showRaw ? 'Hide' : 'View'} raw markdown
          <span className="ml-auto text-[11px] opacity-60">{output.split('\n').length} lines</span>
        </button>
        {showRaw && (
          <div className="border-t border-border">
            <pre className="px-4 py-4 text-[12px] font-mono whitespace-pre-wrap break-words text-foreground/80 max-h-[480px] overflow-y-auto">{output}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

interface MarkdownSection {
  heading: string
  level: number
  body: string
}

function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split('\n')
  const sections: MarkdownSection[] = []
  let current: MarkdownSection | null = null

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/)
    const h3 = line.match(/^###\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)

    if (h2 || h3 || h1) {
      if (current) sections.push(current)
      const level = h1 ? 1 : h2 ? 2 : 3
      const heading = (h1 ?? h2 ?? h3)![1]
      current = { heading, level, body: '' }
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) sections.push(current)
  return sections.filter(s => s.body.trim())
}

function ReportSection({ section, defaultOpen }: { section: MarkdownSection; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-muted/30 transition-colors text-left bg-muted/10"
      >
        <span className="transition-transform duration-150" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-flex' }}>
          <ChevronRight size={13} className="text-muted-foreground" />
        </span>
        <span className="text-[13px] font-semibold flex-1">{section.heading}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4">
          <ReportBody text={section.body} />
        </div>
      )}
    </div>
  )
}

function ReportBody({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />

        // Bullet points
        const bullet = line.match(/^[-*]\s+(.+)/)
        if (bullet) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5 shrink-0">·</span>
              <span className="text-[13px] leading-relaxed">{bullet[1]}</span>
            </div>
          )
        }

        // Bold key-value like **Label**: value
        const kv = line.match(/^\*\*(.+?)\*\*[:：]\s*(.+)/)
        if (kv) {
          return (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-[12px] font-semibold w-40 shrink-0">{kv[1]}</span>
              <span className="text-[13px] text-muted-foreground">{kv[2]}</span>
            </div>
          )
        }

        // Subheading
        const sub = line.match(/^###\s+(.+)/)
        if (sub) {
          return <p key={i} className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">{sub[1]}</p>
        }

        return <p key={i} className="text-[13px] leading-relaxed">{line}</p>
      })}
    </div>
  )
}
