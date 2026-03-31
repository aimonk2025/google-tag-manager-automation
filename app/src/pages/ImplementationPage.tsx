import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { Link } from 'react-router-dom'
import { Lock, FileCode, ChevronRight, ChevronDown, Tag, Zap, Variable, Trash2, Eye, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { ImplementationContextPreview } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import { useSkillRun } from '@/hooks/useSkillRun'
import { ActivityFeed } from '@/components/ActivityFeed'
import { RerunSkillModal } from '@/components/RerunSkillModal'
import { RunHistory } from '@/components/RunHistory'
import { AdditionalInstructions } from '@/components/AdditionalInstructions'
import { PIPELINE_STEPS } from '@/lib/constants'
import { StepInfo } from '@/components/StepInfo'
import { formatElapsed } from '@/lib/utils'
import { useGtmStatus } from '@/hooks/useGtmStatus'
import { GtmAuthBanner } from '@/components/GtmAuthBanner'
import type { TrackingPlan } from '@/types/session'

const SKILL_NAME = 'gtm-implementation'
const SKILL_LABEL = 'Implementation'

export default function ImplementationPage() {
  const { session, markSkillComplete, isSkillUnlocked, isSkillComplete, refreshApprovals } = useSession()
  const { data: gtmStatus } = useGtmStatus()
  const isLocked = !isSkillUnlocked(SKILL_NAME)
  const isComplete = isSkillComplete(SKILL_NAME)
  const prevCompleteRef = useRef(isComplete)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [changedFiles, setChangedFiles] = useState<Array<{ filePath: string; additions: number; deletions: number }> | null>(null)
  const [gtmVerification, setGtmVerification] = useState<{ verified: boolean; tagsFound?: number; triggersFound?: number; variablesFound?: number; tagsCreated?: number; triggersCreated?: number; variablesCreated?: number; published?: boolean; versionId?: string | null; error?: string | null } | null>(null)
  const [gtmVerifying, setGtmVerifying] = useState(false)
  const [cleaningDupes, setCleaningDupes] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{ deletedCount: number; errors?: string[] } | null>(null)

  useEffect(() => {
    if (isComplete && session?.id) {
      api.getChangedFiles(SKILL_NAME).then(result => {
        if (result.changed.length > 0) setChangedFiles(result.changed)
      }).catch(() => {})
      // Load GTM verification from compactOutputs if already stored
      const implCompact = session.compactOutputs?.['gtm-implementation'] as Record<string, unknown> | undefined
      const stored = implCompact?.gtmResources as { tagsFound: number; triggersFound: number; variablesFound: number; error?: string } | undefined
      const created = (implCompact?.createdResources ?? implCompact?.gtmResources) as { tagsCreated?: number; triggersCreated?: number; variablesCreated?: number; versionId?: string | null; published?: boolean } | undefined
      if (stored) {
        setGtmVerification({
          verified: true,
          tagsFound: stored.tagsFound,
          triggersFound: stored.triggersFound,
          variablesFound: stored.variablesFound,
          error: stored.error,
          tagsCreated: created?.tagsCreated,
          triggersCreated: created?.triggersCreated,
          variablesCreated: created?.variablesCreated,
          published: created?.published,
          versionId: created?.versionId,
        })
      }
    }
  }, [isComplete, session?.id])

  const skillIdx = PIPELINE_STEPS.findIndex(s => s.name === SKILL_NAME)
  const downstreamLabels = PIPELINE_STEPS.slice(skillIdx + 1).map(s => s.label)
  const stepMeta = PIPELINE_STEPS.find(s => s.name === SKILL_NAME)!

  const { isRunning, error, elapsedMs, activity, retryCount, retryReason, run, cancel } = useSkillRun({
    onComplete: (claudeSessionId, fullOutput) => {
      if (claudeSessionId) {
        // Parse JSON summary Claude outputs at the end of implementation
        let parsedOutput: unknown = null
        try {
          const match = fullOutput.match(/\{[\s\S]*\}/)
          if (match) parsedOutput = JSON.parse(match[0])
        } catch { /* use null if parse fails */ }
        markSkillComplete(SKILL_NAME, claudeSessionId, parsedOutput)
        api.getChangedFiles(SKILL_NAME).then(result => {
          if (result.changed.length > 0) setChangedFiles(result.changed)
        }).catch(() => {})
        // Verify GTM container has real resources after implementation
        if (session?.id) {
          setGtmVerifying(true)
          api.verifyGtmImplementation(session.id)
            .then(result => {
              setGtmVerification({
                verified: result.verified,
                tagsFound: result.gtmResources?.tagsFound,
                triggersFound: result.gtmResources?.triggersFound,
                variablesFound: result.gtmResources?.variablesFound,
                error: result.gtmResources?.error ?? result.error,
                tagsCreated: result.createdResources?.tagsCreated,
                triggersCreated: result.createdResources?.triggersCreated,
                variablesCreated: result.createdResources?.variablesCreated,
                published: result.createdResources?.published,
                versionId: result.createdResources?.versionId,
              })
            })
            .catch(err => {
              setGtmVerification({ verified: false, error: err?.message ?? 'GTM verification failed' })
            })
            .finally(() => setGtmVerifying(false))
        }
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

  async function handleRecoverApproval() {
    try {
      await api.recoverApproval()
      await refreshApprovals()
    } catch { /* ignore */ }
  }

  async function handleCleanupDupes() {
    if (!session?.id) return
    setCleaningDupes(true)
    setCleanupResult(null)
    try {
      const result = await api.cleanupGtmDupes(session.id)
      setCleanupResult({ deletedCount: result.deletedCount, errors: result.errors })
      // Re-verify to update counts
      if (result.deletedCount > 0) {
        setGtmVerifying(true)
        api.verifyGtmImplementation(session.id)
          .then(r => setGtmVerification({
            verified: r.verified,
            tagsFound: r.gtmResources?.tagsFound,
            triggersFound: r.gtmResources?.triggersFound,
            variablesFound: r.gtmResources?.variablesFound,
            error: r.gtmResources?.error ?? r.error,
            tagsCreated: r.createdResources?.tagsCreated,
            triggersCreated: r.createdResources?.triggersCreated,
            variablesCreated: r.createdResources?.variablesCreated,
            published: r.createdResources?.published,
            versionId: r.createdResources?.versionId,
          }))
          .catch(() => {})
          .finally(() => setGtmVerifying(false))
      }
    } catch (err) {
      setCleanupResult({ deletedCount: 0, errors: [(err as Error)?.message ?? 'Cleanup failed'] })
    } finally {
      setCleaningDupes(false)
    }
  }

  function handleRunClick() {
    if (isComplete) {
      setShowRerunModal(true)
    } else {
      doRun()
    }
  }

  function doRun() {
    if (!session?.projectPath) return
    setChangedFiles(null)
    api.snapshotFiles(SKILL_NAME).catch(() => {})
    run(SKILL_NAME, '', session.projectPath)
  }

  const [trackingPlan, setTrackingPlan] = useState<TrackingPlan | null>(null)
  const [contextPreview, setContextPreview] = useState<ImplementationContextPreview | null>(null)
  const [showContext, setShowContext] = useState(false)

  useEffect(() => {
    if (!session?.id) return
    api.getSkillOutput<TrackingPlan>('gtm-strategy').then(setTrackingPlan).catch(() => {})
  }, [session?.id])

  useEffect(() => {
    if (!session?.id) return
    api.getImplementationContext().then(setContextPreview).catch(() => {})
  }, [session?.id, isComplete])

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Implementation</h1>
          <p className="text-sm text-muted-foreground mt-1">Create GTM tags, triggers, and variables. Also adds dataLayer.push() calls to source files where needed.</p>
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
            {isRunning ? 'Running...' : isComplete ? 'Re-run Implementation' : 'Run Implementation'}
          </button>
        </div>
      </div>

      {/* Coverage warning — non-blocking */}
      {!isLocked && !isRunning && (() => {
        const coverage = session?.audit_coverage_pct ?? 0
        if (coverage === 0 || coverage >= 90) return null
        return (
          <div className="border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-600 text-[13px] font-semibold shrink-0 mt-0.5">!</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-amber-800">Audit coverage is {coverage}%</span>
              <span className="text-[12px] text-amber-700">Some elements may not have IDs yet. GTM tags could target elements incorrectly. Consider resolving untracked elements and re-running the audit first.</span>
            </div>
          </div>
        )
      })()}

      {!isLocked && <AdditionalInstructions skillName={SKILL_NAME} />}

      {/* GTM auth status - real-time health check */}
      {!isLocked && <GtmAuthBanner sessionId={session?.id} />}

      {/* Locked */}
      {isLocked && (
        <div className="border border-border bg-muted px-4 py-6 flex flex-col items-center gap-2 text-center">
          <Lock size={16} className="text-muted-foreground" />
          {(() => {
            const coverage = session?.audit_coverage_pct ?? 0
            if (coverage > 0 && coverage < 90) {
              return (
                <>
                  <p className="text-sm text-muted-foreground">Audit coverage is {coverage}% — reach 90% to run implementation.</p>
                  <Link to="/audit" className="text-[12px] text-foreground underline underline-offset-2 mt-1">
                    Go to Audit to improve coverage
                  </Link>
                </>
              )
            }
            if (session?.completedSkills.includes('gtm-strategy')) {
              return (
                <>
                  <p className="text-sm text-muted-foreground">Strategy must be approved before implementation can run.</p>
                  <Link to="/strategy" className="text-[12px] text-foreground underline underline-offset-2 mt-1">
                    Go to Strategy to approve
                  </Link>
                  <button
                    onClick={handleRecoverApproval}
                    className="text-[12px] text-muted-foreground underline underline-offset-2 mt-1 hover:text-foreground transition-colors"
                  >
                    Re-trigger approval check
                  </button>
                </>
              )
            }
            return <p className="text-sm text-muted-foreground">Complete all previous steps first.</p>
          })()}
        </div>
      )}

      {/* GTM Verification Status */}
      {isComplete && !isLocked && (
        <div className={`border text-sm flex flex-col ${gtmVerifying ? 'border-border text-muted-foreground' : gtmVerification?.error ? 'border-yellow-500/40 bg-yellow-500/5' : gtmVerification ? 'border-[oklch(0.8_0.05_150)] bg-[oklch(0.97_0.02_150)]' : 'border-border'}`}>
          {/* Header row */}
          <div className="px-4 py-3 flex items-center gap-2">
            {gtmVerifying ? (
              <span className="text-muted-foreground text-xs animate-pulse flex-1">Verifying GTM container...</span>
            ) : gtmVerification ? (
              <>
                <span className={`font-medium ${gtmVerification.error ? 'text-yellow-600 dark:text-yellow-400' : 'text-[oklch(0.4_0.1_150)]'}`}>
                  {gtmVerification.error ? 'GTM Verified with warnings' : 'GTM Verified'}
                </span>
                {gtmVerification.published && (
                  <span className="text-[10px] font-semibold bg-[oklch(0.9_0.06_150)] text-[oklch(0.3_0.1_150)] px-1.5 py-0.5">PUBLISHED</span>
                )}
                <span className="flex-1" />
              </>
            ) : (
              <span className="text-muted-foreground text-xs flex-1">GTM verification pending</span>
            )}
            {session?.id && gtmStatus?.authenticated && (
              <button
                onClick={handleCleanupDupes}
                disabled={cleaningDupes}
                title="Remove duplicate snake_case GTM objects"
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 px-2 py-1 transition-colors disabled:opacity-50 shrink-0"
              >
                <Trash2 size={11} />
                {cleaningDupes ? 'Cleaning...' : 'Clean Dupes'}
              </button>
            )}
          </div>

          {/* Created this run vs container totals */}
          {gtmVerification && !gtmVerifying && (
            <div className="border-t border-[oklch(0.8_0.05_150)]/40 grid grid-cols-2 divide-x divide-[oklch(0.8_0.05_150)]/40">
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Created this run</p>
                {gtmVerification.tagsCreated !== undefined ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[12px]">
                      <Tag size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{gtmVerification.tagsCreated}</span>
                      <span className="text-muted-foreground">tags</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Zap size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{gtmVerification.triggersCreated}</span>
                      <span className="text-muted-foreground">triggers</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Variable size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{gtmVerification.variablesCreated}</span>
                      <span className="text-muted-foreground">variables</span>
                    </div>
                    {gtmVerification.versionId && (
                      <p className="text-[11px] text-muted-foreground mt-1">Version {gtmVerification.versionId}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No creation data recorded</p>
                )}
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Container totals</p>
                {gtmVerification.tagsFound !== undefined ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[12px]">
                      <Tag size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{gtmVerification.tagsFound}</span>
                      <span className="text-muted-foreground">tags</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Zap size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{gtmVerification.triggersFound}</span>
                      <span className="text-muted-foreground">triggers</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Variable size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{gtmVerification.variablesFound}</span>
                      <span className="text-muted-foreground">variables</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Pending verification</p>
                )}
              </div>
            </div>
          )}

          {gtmVerification?.error && (
            <p className="px-4 pb-3 text-xs text-yellow-700 dark:text-yellow-300">{gtmVerification.error}</p>
          )}
          {cleanupResult && (
            <p className={`px-4 pb-3 text-xs ${cleanupResult.errors?.length ? 'text-yellow-700' : 'text-muted-foreground'}`}>
              {cleanupResult.deletedCount > 0
                ? `Removed ${cleanupResult.deletedCount} duplicate object${cleanupResult.deletedCount !== 1 ? 's' : ''}`
                : 'No duplicates found'}
              {cleanupResult.errors?.length ? ` (${cleanupResult.errors.length} error${cleanupResult.errors.length !== 1 ? 's' : ''})` : ''}
            </p>
          )}
        </div>
      )}

      {/* What Claude reads — context preview */}
      {!isLocked && contextPreview && (
        <ContextPreviewPanel context={contextPreview} open={showContext} onToggle={() => setShowContext(v => !v)} />
      )}

      {/* Full implementation preview */}
      {!isLocked && !isRunning && trackingPlan && (
        <ImplementationPreview trackingPlan={trackingPlan} session={session} />
      )}

      {/* Step info — only before first run with no plan context */}
      {!isLocked && !isRunning && !isComplete && !trackingPlan && (
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
          label="Claude is implementing tracking"
        />
      )}

      {/* Results: show what files Claude actually changed on disk */}
      {!isRunning && isComplete && changedFiles && changedFiles.length > 0 && (
        <ImplementationChangedFiles files={changedFiles} />
      )}

      {!isRunning && isComplete && changedFiles && changedFiles.length === 0 && (
        <div className="border border-border px-4 py-6 text-center">
          <p className="text-sm font-medium">No file changes detected</p>
          <p className="text-xs text-muted-foreground mt-1">Claude may have created GTM configuration only, or no snapshot was available to compare.</p>
        </div>
      )}

      {/* Restore + Next step */}
      {isComplete && !isRunning && (
        <div className="flex items-center justify-between">
          <RestoreButton skillName={SKILL_NAME} />
          <Link
            to="/testing"
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors inline-flex items-center"
          >
            Next: Testing
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

const METHOD_LABELS: Record<string, string> = {
  datalayer_push: 'dataLayer.push()',
  css_selector_trigger: 'CSS selector trigger',
  built_in_trigger: 'built-in trigger',
  custom_html: 'custom HTML tag',
  auto_event: 'auto event listener',
}

function ContextPreviewPanel({ context, open, onToggle }: { context: ImplementationContextPreview; open: boolean; onToggle: () => void }) {
  const authOk = context.auth.usesCli || context.auth.hasRefreshToken || context.auth.hasAccessToken
  const authMissing = context.auth.authMissing

  return (
    <div className="border border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye size={13} className="text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            What Claude reads
          </span>
          {authMissing && (
            <span className="text-[10px] text-destructive border border-destructive/30 px-1.5 py-px">GTM auth missing</span>
          )}
        </div>
        {open ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border flex flex-col divide-y divide-border">
          {/* GTM Config + Platform + Auth */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-4 text-[12px]">
              {context.gtmConfig ? (
                <>
                  <span><span className="text-muted-foreground">Account</span> <span className="font-medium font-mono">{context.gtmConfig.accountId}</span></span>
                  <span><span className="text-muted-foreground">Container</span> <span className="font-medium font-mono">{context.gtmConfig.containerId}</span></span>
                </>
              ) : (
                <span className="text-muted-foreground">No GTM container configured</span>
              )}
              <span><span className="text-muted-foreground">Platform</span> <span className="font-medium">{context.platform}</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-[12px]">
              {context.auth.usesCli ? (
                <><CheckCircle2 size={12} className="text-[oklch(0.4_0.1_150)]" /><span>Uses <span className="font-mono">@owntag/gtm-cli</span></span></>
              ) : authMissing ? (
                <><XCircle size={12} className="text-destructive" /><span className="text-destructive">No OAuth credentials — GTM API calls will be skipped</span></>
              ) : context.auth.hasRefreshToken ? (
                <><CheckCircle2 size={12} className="text-[oklch(0.4_0.1_150)]" /><span>OAuth authenticated (refresh token present — auto-renews)</span></>
              ) : (
                <><AlertTriangle size={12} className="text-amber-500" /><span className="text-amber-700">Access token only — may expire during long runs</span></>
              )}
            </div>
          </div>

          {/* Events */}
          {context.events.length > 0 && (
            <div className="px-4 py-3 flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Events ({context.events.length})
                {context.trackingPlan && ` — P0: ${context.trackingPlan.p0}, P1: ${context.trackingPlan.p1}, P2: ${context.trackingPlan.p2}`}
              </p>
              <div className="flex flex-col gap-1">
                {context.events.map((ev, i) => {
                  const isDone = context.previousRun?.doneEvents.includes(ev.name)
                  return (
                    <div key={i} className={`flex items-start gap-2 text-[12px] ${isDone ? 'opacity-40' : ''}`}>
                      <span className={`shrink-0 text-[10px] font-semibold px-1 py-px mt-0.5 ${ev.priority === 'P0' ? 'bg-primary text-primary-foreground' : ev.priority === 'P1' ? 'border border-border' : 'bg-muted text-muted-foreground'}`}>
                        {ev.priority}
                      </span>
                      <span className="font-medium font-mono">{ev.name}</span>
                      <span className="text-muted-foreground shrink-0">{METHOD_LABELS[ev.method] ?? ev.method}</span>
                      {ev.params.length > 0 && (
                        <span className="text-muted-foreground text-[11px]">{ev.params.join(', ')}</span>
                      )}
                      {isDone && <span className="text-[10px] text-muted-foreground ml-auto shrink-0">done</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Scope files */}
          {context.scopeFiles.length > 0 && (
            <div className="px-4 py-3 flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Source files in scope ({context.scopeFiles.length})</p>
              <div className="flex flex-col gap-0.5">
                {context.scopeFiles.map((f, i) => {
                  const done = context.previousRun?.doneFiles.includes(f)
                  return (
                    <div key={i} className={`flex items-center gap-2 text-[12px] ${done ? 'opacity-40' : ''}`}>
                      <FileCode size={11} className="text-muted-foreground shrink-0" />
                      <span className="font-mono text-[11px]">{f.replace(/\\/g, '/')}</span>
                      {done && <span className="text-[10px] text-muted-foreground ml-auto">already edited</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Previous run summary */}
          {context.previousRun && (
            <div className="px-4 py-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Previous run</p>
              <div className="text-[12px] text-muted-foreground flex flex-wrap gap-3">
                <span>{context.previousRun.doneEvents.length} events done</span>
                <span>{context.previousRun.doneFiles.length} files edited</span>
                {context.previousRun.gtmRes && (
                  <>
                    {context.previousRun.gtmRes.variablesCreated != null && <span>{String(context.previousRun.gtmRes.variablesCreated)} variables</span>}
                    {context.previousRun.gtmRes.triggersCreated != null && <span>{String(context.previousRun.gtmRes.triggersCreated)} triggers</span>}
                    {context.previousRun.gtmRes.tagsCreated != null && <span>{String(context.previousRun.gtmRes.tagsCreated)} tags</span>}
                    {context.previousRun.gtmRes.published && <span className="text-[oklch(0.4_0.1_150)]">published v{String(context.previousRun.gtmRes.versionId)}</span>}
                  </>
                )}
              </div>
              {context.remainingEvents.length > 0 ? (
                <p className="text-[12px] text-amber-700">{context.remainingEvents.length} event{context.remainingEvents.length !== 1 ? 's' : ''} still to implement</p>
              ) : (
                <p className="text-[12px] text-[oklch(0.4_0.1_150)]">All events implemented</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ImplementationPreview({ trackingPlan, session }: { trackingPlan: TrackingPlan; session: import('@/types/session').SessionData | null }) {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())

  function toggleEvent(i: number) {
    setExpandedEvents(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const allEvents = trackingPlan.events
  const p0 = allEvents.filter(e => e.priority === 'P0')
  const p1 = allEvents.filter(e => e.priority === 'P1')
  const p2 = allEvents.filter(e => e.priority === 'P2')

  const codeChangeEvents = allEvents.filter(e => (e as unknown as Record<string,unknown>).codeChangesRequired === true)
  const gtmOnlyEvents = allEvents.filter(e => (e as unknown as Record<string,unknown>).codeChangesRequired !== true)

  // Files to be modified - from DOM compact page results
  const domCompact = session?.compactOutputs?.['gtm-dom-standardization'] as Record<string, unknown> | undefined
  const pageResults = domCompact?.pageResults as Array<{ page: string; filesModified: string[] }> | undefined
  const filesToModify = pageResults ? [...new Set(pageResults.flatMap(r => r.filesModified))] : []

  const groups = [
    { label: 'P0 — Critical', events: p0, badgeClass: 'bg-primary text-primary-foreground' },
    { label: 'P1 — Important', events: p1, badgeClass: 'border border-border text-foreground' },
    { label: 'P2 — Nice to Have', events: p2, badgeClass: 'bg-muted text-muted-foreground' },
  ]

  const uniqueVariableCount = [...new Set(allEvents.flatMap(e => (e.parameters ?? []).map(p => p.name)))].length

  return (
    <div className="flex flex-col gap-4">
      {/* GTM objects — primary deliverable */}
      <div className="border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
          <Tag size={12} className="text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">GTM container objects</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="px-4 py-3 flex items-start gap-2">
            <Tag size={13} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xl font-bold leading-none">{allEvents.length}</p>
              <p className="text-[11px] font-medium mt-1">Tags</p>
              <p className="text-[11px] text-muted-foreground">GA4 event tags</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-start gap-2">
            <Zap size={13} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xl font-bold leading-none">{allEvents.length}</p>
              <p className="text-[11px] font-medium mt-1">Triggers</p>
              <p className="text-[11px] text-muted-foreground">custom event triggers</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-start gap-2">
            <Variable size={13} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xl font-bold leading-none">{uniqueVariableCount}</p>
              <p className="text-[11px] font-medium mt-1">Variables</p>
              <p className="text-[11px] text-muted-foreground">dataLayer variables</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary bar — secondary stats */}
      <div className="border border-border grid grid-cols-3 divide-x divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Total Events</p>
          <p className="text-2xl font-bold leading-none">{allEvents.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{p0.length} critical, {p1.length} important</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Need Code Changes</p>
          <p className="text-2xl font-bold leading-none">{codeChangeEvents.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{gtmOnlyEvents.length} GTM-only</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Source Files</p>
          <p className="text-2xl font-bold leading-none">{filesToModify.length > 0 ? filesToModify.length : codeChangeEvents.length > 0 ? '?' : '0'}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {filesToModify.length > 0
              ? filesToModify.map(f => f.replace(/\\/g, '/').split('/').pop()).join(', ').slice(0, 40) + (filesToModify.length > 3 ? '…' : '')
              : 'to be edited'}
          </p>
        </div>
      </div>

      {/* All events breakdown */}
      <div className="border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Events to implement</span>
        </div>
        <div className="divide-y divide-border">
          {groups.map(group => group.events.length > 0 && (
            <div key={group.label}>
              <div className="px-4 py-2 bg-muted/20">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{group.label}</span>
              </div>
              {group.events.map((event, i) => {
                const ev = event as TrackingPlan['events'][number] & {
                  implementationMethod?: string
                  codeChangesRequired?: boolean
                  implementationReason?: string
                  gtmResourcesToCreate?: { variables?: string[]; triggers?: string[]; tags?: string[]; builtinVariablesToEnable?: string[] }
                  elementsFound?: number
                  gap?: number
                }
                const idx = allEvents.indexOf(event)
                const isExpanded = expandedEvents.has(idx)
                const method = ev.implementationMethod ?? 'datalayer_push'
                const methodLabel: Record<string, string> = {
                  datalayer_push: 'dataLayer code',
                  css_selector_trigger: 'CSS selector',
                  builtin_click: 'GTM click trigger',
                  builtin_form: 'GTM form trigger',
                  builtin_scroll: 'GTM scroll trigger',
                  builtin_visibility: 'GTM visibility trigger',
                  builtin_youtube: 'GTM YouTube trigger',
                  dom_variable: 'DOM variable',
                }
                const methodColor = ev.codeChangesRequired ? 'border-amber-300 text-amber-700' : 'border-border text-muted-foreground'
                const gtm = ev.gtmResourcesToCreate
                return (
                  <div key={i} className="border-t border-border/50">
                    <div
                      className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
                      onClick={() => toggleEvent(idx)}
                    >
                      <span className="transition-transform duration-150 shrink-0 text-muted-foreground" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-flex' }}>
                        <ChevronRight size={12} />
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 shrink-0 ${group.badgeClass}`}>{event.priority}</span>
                      <span className="text-[13px] font-mono font-semibold flex-1">{event.name}</span>
                      <span className={`text-[10px] font-medium border px-1.5 py-0.5 shrink-0 ${methodColor}`}>{methodLabel[method] ?? method}</span>
                      {ev.elementsFound != null && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{ev.elementsFound} elements</span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-3 flex flex-col gap-3 border-t border-border/40 bg-muted/10">
                        {event.businessValue && (
                          <p className="text-[12px] text-muted-foreground pt-2">{event.businessValue}</p>
                        )}

                        {ev.implementationReason && (
                          <div className={`px-3 py-2 border text-[11px] leading-relaxed ${ev.codeChangesRequired ? 'border-amber-200 bg-amber-50/40 text-amber-800' : 'border-border text-muted-foreground'}`}>
                            <span className="font-semibold">{ev.codeChangesRequired ? 'Requires code changes: ' : 'GTM-only: '}</span>
                            {ev.implementationReason}
                          </div>
                        )}

                        {gtm && (gtm.tags?.length || gtm.triggers?.length || gtm.variables?.length) ? (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">GTM objects to create</p>
                            <div className="flex flex-col gap-1">
                              {gtm.tags?.map((t, j) => (
                                <div key={j} className="flex items-center gap-2 text-[11px]">
                                  <Tag size={10} className="text-muted-foreground shrink-0" />
                                  <span className="font-mono">{t}</span>
                                  <span className="text-muted-foreground">tag</span>
                                </div>
                              ))}
                              {gtm.triggers?.map((t, j) => (
                                <div key={j} className="flex items-center gap-2 text-[11px]">
                                  <Zap size={10} className="text-muted-foreground shrink-0" />
                                  <span className="font-mono">{t}</span>
                                  <span className="text-muted-foreground">trigger</span>
                                </div>
                              ))}
                              {gtm.variables?.map((v, j) => (
                                <div key={j} className="flex items-center gap-2 text-[11px]">
                                  <Variable size={10} className="text-muted-foreground shrink-0" />
                                  <span className="font-mono">{v}</span>
                                  <span className="text-muted-foreground">variable</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {event.parameters?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Parameters</p>
                            <div className="flex flex-col gap-1">
                              {event.parameters.map((p, j) => (
                                <div key={j} className="flex items-center gap-3 text-[12px]">
                                  <span className="font-mono font-medium w-44 shrink-0 truncate">{p.name}</span>
                                  <span className="text-muted-foreground w-14 shrink-0 text-[11px]">{p.type}</span>
                                  {!!(p as unknown as Record<string,unknown>).example && <span className="text-muted-foreground font-mono text-[11px] truncate flex-1">{String((p as unknown as Record<string,unknown>).example)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ImplementationChangedFiles({ files }: { files: Array<{ filePath: string; additions: number; deletions: number }> }) {
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="border border-border grid grid-cols-2 divide-x divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Files Modified</p>
          <p className="text-2xl font-bold leading-none">{files.length}</p>
          <p className="text-[12px] text-muted-foreground mt-1">with dataLayer events</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Lines Added</p>
          <p className="text-2xl font-bold leading-none text-[oklch(0.4_0.1_150)]">+{totalAdditions}</p>
        </div>
      </div>
      <div className="border border-border divide-y divide-border">
        {files.map((f) => {
          const filename = f.filePath.split(/[/\\]/).pop() ?? f.filePath
          const dir = f.filePath.split(/[/\\]/).slice(0, -1).join('/')
          return (
            <div key={f.filePath} className="px-4 py-3 flex items-center gap-3">
              <FileCode size={13} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-semibold font-mono">{filename}</span>
                {dir && <span className="text-[11px] text-muted-foreground font-mono ml-2 truncate hidden sm:inline">{dir}</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
                {f.additions > 0 && <span className="text-[oklch(0.35_0.1_150)]">+{f.additions}</span>}
                {f.deletions > 0 && <span className="text-[oklch(0.4_0.1_20)]">-{f.deletions}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
