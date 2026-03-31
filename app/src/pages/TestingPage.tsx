import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, CheckCircle2, XCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useSkillRun } from '@/hooks/useSkillRun'
import { ActivityFeed } from '@/components/ActivityFeed'
import { RerunSkillModal } from '@/components/RerunSkillModal'
import { RunHistory } from '@/components/RunHistory'
import { AdditionalInstructions } from '@/components/AdditionalInstructions'
import { PIPELINE_STEPS } from '@/lib/constants'
import { StepInfo } from '@/components/StepInfo'
import { formatElapsed } from '@/lib/utils'
import { extractJson } from '@/components/AuditDisplay'

const SKILL_NAME = 'gtm-testing'
const SKILL_LABEL = 'Testing'

export interface TestEvent {
  name: string
  status: 'passed' | 'failed' | 'warning' | 'warn' | 'skipped'
  notes?: string | null
}

export interface TestResults {
  passed: number
  failed: number
  warnings?: number
  events: TestEvent[]
}

export function parseTestResults(output: string): TestResults | null {
  const raw = extractJson(output)
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.events)) return null
  return {
    passed: typeof r.passed === 'number' ? r.passed : 0,
    failed: typeof r.failed === 'number' ? r.failed : 0,
    warnings: typeof r.warnings === 'number' ? r.warnings : 0,
    events: r.events as TestEvent[],
  }
}

export default function TestingPage() {
  const { session, markSkillComplete, isSkillUnlocked, isSkillComplete } = useSession()
  const isLocked = !isSkillUnlocked(SKILL_NAME)
  const isComplete = isSkillComplete(SKILL_NAME)
  const prevCompleteRef = useRef(isComplete)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showRerunModal, setShowRerunModal] = useState(false)

  const skillIdx = PIPELINE_STEPS.findIndex(s => s.name === SKILL_NAME)
  const downstreamLabels = PIPELINE_STEPS.slice(skillIdx + 1).map(s => s.label)
  const stepMeta = PIPELINE_STEPS.find(s => s.name === SKILL_NAME)!

  const { output, isRunning, error, elapsedMs, activity, retryCount, retryReason, run, cancel } = useSkillRun({
    onComplete: (claudeSessionId, fullOutput) => {
      if (claudeSessionId) {
        const results = parseTestResults(fullOutput)
        markSkillComplete(SKILL_NAME, claudeSessionId, results ?? null)
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
    run(SKILL_NAME, `Validate tracking implementation against the P0 events listed in CONTEXT. Check: (1) dataLayer.push calls exist in the scoped files, (2) event names and parameters match the tracking plan, (3) GTM tags are configured correctly. Return a JSON test results object.`, session.projectPath)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Testing</h1>
          <p className="text-sm text-muted-foreground mt-1">Validate tracking implementation across 3 tiers: code, dataLayer, and GTM.</p>
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
            {isRunning ? 'Running...' : isComplete ? 'Re-run Testing' : 'Run Testing'}
          </button>
        </div>
      </div>

      {!isLocked && <AdditionalInstructions skillName={SKILL_NAME} />}

      {/* Locked */}
      {isLocked && (
        <div className="border border-border bg-muted px-4 py-6 flex flex-col items-center gap-2 text-center">
          <Lock size={16} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Complete Implementation first.</p>
        </div>
      )}

      {/* Step info */}
      {!isLocked && !isRunning && !output && (
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
          label="Claude is validating tracking"
        />
      )}

      {/* Results */}
      {!isRunning && output && (
        <TestingOutput output={output} />
      )}

      {/* Next step */}
      {isComplete && !isRunning && (
        <div className="flex justify-end">
          <Link
            to="/reporting"
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors inline-flex items-center"
          >
            Next: Reporting
          </Link>
        </div>
      )}

      <RunHistory skillName={SKILL_NAME} onRerun={handleRunClick} />

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

function statusIcon(status: TestEvent['status']) {
  if (status === 'passed') return <CheckCircle2 size={14} className="text-[oklch(0.4_0.1_150)] shrink-0" />
  if (status === 'warning' || status === 'warn') return <AlertCircle size={14} className="text-amber-500 shrink-0" />
  if (status === 'skipped') return <AlertCircle size={14} className="text-muted-foreground shrink-0" />
  return <XCircle size={14} className="text-destructive shrink-0" />
}

function statusLabel(status: TestEvent['status']) {
  if (status === 'passed') return 'Passed'
  if (status === 'warning' || status === 'warn') return 'Warning'
  if (status === 'skipped') return 'Skipped'
  return 'Failed'
}

function statusColor(status: TestEvent['status']) {
  if (status === 'passed') return 'text-[oklch(0.4_0.1_150)]'
  if (status === 'warning' || status === 'warn') return 'text-amber-600'
  if (status === 'skipped') return 'text-muted-foreground'
  return 'text-destructive'
}

export function TestingOutput({ output }: { output: string }) {
  const results = parseTestResults(output)

  if (!results) {
    return (
      <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-5 flex items-start gap-3">
        <AlertTriangle size={15} className="text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-destructive">Could not parse test results</p>
          <p className="text-[12px] text-destructive/70 mt-1">Claude did not return a valid JSON results object. Try re-running testing.</p>
        </div>
      </div>
    )
  }

  const warnings = results.warnings ?? 0
  const allPassed = results.failed === 0 && warnings === 0
  const hasFails = results.failed > 0

  return (
    <div className="flex flex-col gap-3">

      {/* Summary stats */}
      <div className={`border grid grid-cols-3 divide-x ${hasFails ? 'border-destructive divide-destructive/20' : allPassed ? 'border-[oklch(0.8_0.05_150)] divide-[oklch(0.8_0.05_150)]' : 'border-amber-300 divide-amber-200'}`}>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Passed</p>
          <p className={`text-2xl font-bold leading-none ${results.passed > 0 ? 'text-[oklch(0.4_0.1_150)]' : 'text-muted-foreground'}`}>{results.passed}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Failed</p>
          <p className={`text-2xl font-bold leading-none ${results.failed > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{results.failed}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Warnings</p>
          <p className={`text-2xl font-bold leading-none ${warnings > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{warnings}</p>
        </div>
      </div>

      {/* Overall status banner */}
      {allPassed && (
        <div className="border border-[oklch(0.8_0.05_150)] bg-[oklch(0.97_0.02_150)] px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-[oklch(0.4_0.1_150)] shrink-0" />
          <p className="text-[13px] text-[oklch(0.3_0.08_150)] font-medium">All checks passed. Tracking is correctly implemented.</p>
        </div>
      )}
      {hasFails && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 flex items-center gap-2">
          <XCircle size={14} className="text-destructive shrink-0" />
          <p className="text-[13px] text-destructive font-medium">{results.failed} event{results.failed !== 1 ? 's' : ''} failed validation. Fix the issues below before publishing.</p>
        </div>
      )}
      {!hasFails && warnings > 0 && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-600 shrink-0" />
          <p className="text-[13px] text-amber-800 font-medium">{warnings} warning{warnings !== 1 ? 's' : ''} found. Review before publishing.</p>
        </div>
      )}

      {/* Per-event results */}
      {results.events.length > 0 && (
        <div className="border border-border divide-y divide-border">
          {results.events.map((ev, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5">{statusIcon(ev.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold font-mono">{ev.name}</span>
                  <span className={`text-[11px] font-medium ${statusColor(ev.status)}`}>{statusLabel(ev.status)}</span>
                </div>
                {ev.notes && (
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{ev.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
