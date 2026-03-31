import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Trash2, ChevronRight } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { api, type CostSummary, type SkillRunHistory } from '@/lib/api'
import { PIPELINE_STEPS } from '@/lib/constants'
import type { SessionData } from '@/types/session'

interface ProjectEnrichment {
  cost: CostSummary | null
  lastRun: SkillRunHistory | null
}

function useProjectEnrichments(projects: SessionData[]) {
  const [data, setData] = useState<Record<string, ProjectEnrichment>>({})

  useEffect(() => {
    if (projects.length === 0) return
    projects.forEach(p => {
      Promise.all([
        api.getCostsSummary(p.id).catch(() => null),
        // Get most recent run across all skills by fetching first step history
        api.getRunHistory('gtm-analytics-audit', p.id, 1).catch(() => [] as SkillRunHistory[]),
      ]).then(([cost, runs]) => {
        setData(prev => ({
          ...prev,
          [p.id]: {
            cost: cost as CostSummary | null,
            lastRun: (runs as SkillRunHistory[])[0] ?? null,
          },
        }))
      })
    })
  }, [projects.map(p => p.id).join(',')])

  return data
}

function useProjects() {
  const [projects, setProjects] = useState<SessionData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await api.getHistory(100, 0)
      setProjects(result.sessions)
      setTotal(result.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  return { projects, total, loading, error, load, setProjects }
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-muted overflow-hidden">
        <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{completed}/{total}</span>
    </div>
  )
}

function DeleteModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border w-[400px] p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-[15px] font-semibold">Delete Project</h2>
        <p className="text-[13px] text-muted-foreground">
          Are you sure you want to delete <span className="font-medium text-foreground">{name}</span>? All pipeline results for this project will be permanently removed.
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-border hover:bg-accent transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="h-9 px-4 text-sm bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { switchProject, session } = useSession()
  const { projects, loading, error, load, setProjects } = useProjects()
  const enrichments = useProjectEnrichments(projects)
  const [deleteTarget, setDeleteTarget] = useState<SessionData | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function handleOpen(project: SessionData) {
    if (switching) return
    setSwitching(project.id)
    try {
      await switchProject(project.id)
      navigate('/')
    } finally {
      setSwitching(null)
    }
  }

  async function handleDelete(project: SessionData) {
    await api.deleteProject(project.id)
    setProjects(prev => prev.filter(p => p.id !== project.id))
    setDeleteTarget(null)
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const total = PIPELINE_STEPS.length

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Each project is an independent website with its own pipeline state.</p>
        </div>
        <button
          onClick={() => navigate('/setup?new=1')}
          className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors flex items-center gap-2 shrink-0"
        >
          <Plus size={14} />
          New Project
        </button>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading projects...</div>
      )}

      {error && (
        <div className="border border-destructive bg-[oklch(0.97_0.02_20)] px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="border border-border px-6 py-12 flex flex-col items-center gap-3 text-center">
          <FolderOpen size={24} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects yet. Create your first project to get started.</p>
          <button
            onClick={() => navigate('/setup?new=1')}
            className="mt-2 h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors"
          >
            Create Project
          </button>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="flex flex-col gap-2">
          {projects.map(project => {
            const completed = project.completedSkills.length
            const displayName = project.name ?? project.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? project.id
            const isActive = session?.id === project.id
            const isSwitching = switching === project.id
            const enrich = enrichments[project.id]

            // Framework from audit compact output
            const auditCompact = project.compactOutputs?.['gtm-analytics-audit'] as Record<string, unknown> | undefined
            const auditMeta = auditCompact?.metadata as Record<string, unknown> | undefined
            const framework = (auditMeta?.framework as string | undefined) ?? null

            // GTM configured
            const hasGtm = Boolean(project.gtmConfig?.accountId && project.gtmConfig?.containerId)

            // Files changed from compact outputs
            const domCompact = project.compactOutputs?.['gtm-dom-standardization'] as Record<string, unknown> | undefined
            const implCompact = project.compactOutputs?.['gtm-implementation'] as Record<string, unknown> | undefined
            const domApplied = (domCompact?.appliedCount as number | undefined) ?? 0
            const implFiles = (implCompact?.filesModified as number | undefined) ?? 0
            const totalFiles = domApplied + implFiles

            // Cost
            const totalCost = enrich?.cost?.totalCostUsd ?? 0

            // Next incomplete step
            const nextStep = PIPELINE_STEPS.find(s => !project.completedSkills.includes(s.name))

            // Last run
            const lastRun = enrich?.lastRun
            const lastRunStatus = lastRun?.status
            const lastRunTime = lastRun?.completed_at ?? lastRun?.started_at

            return (
              <div
                key={project.id}
                className={`border ${isActive ? 'border-foreground' : 'border-border'} bg-background hover:bg-muted/30 transition-colors`}
              >
                <div className="px-4 py-3 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Name row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold truncate">{displayName}</span>
                      {isActive && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 border border-foreground/30 text-muted-foreground shrink-0">
                          active
                        </span>
                      )}
                      {framework && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-muted text-muted-foreground shrink-0">
                          {framework}
                        </span>
                      )}
                      {hasGtm && (
                        <span className="flex items-center gap-1 text-[10px] text-[oklch(0.4_0.1_150)] shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.55_0.12_150)]" />
                          GTM
                        </span>
                      )}
                      {lastRunStatus && (
                        <span className={`text-[10px] px-1.5 py-0.5 border shrink-0 ${
                          lastRunStatus === 'complete' ? 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]' :
                          lastRunStatus === 'error' ? 'text-destructive border-destructive/30' :
                          'text-muted-foreground border-border'
                        }`}>
                          {lastRunStatus}
                          {lastRunTime && ` · ${formatDate(lastRunTime)}`}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5" title={project.projectPath}>
                      {project.projectPath}
                    </p>

                    <div className="mt-2">
                      <ProgressBar completed={completed} total={total} />
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">
                        Updated {formatDate(project.updatedAt)}
                      </span>
                      {totalFiles > 0 && (
                        <span className="text-[11px] text-muted-foreground">{totalFiles} file{totalFiles !== 1 ? 's' : ''} changed</span>
                      )}
                      {totalCost > 0 && (
                        <span className="text-[11px] text-muted-foreground">${totalCost.toFixed(3)}</span>
                      )}
                      {completed === total && (
                        <span className="text-[11px] text-[oklch(0.55_0.12_150)]">Pipeline complete</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {nextStep && !isActive && (
                      <button
                        onClick={async () => { await switchProject(project.id); navigate(nextStep.route) }}
                        className="h-8 px-3 text-[11px] font-medium border border-border hover:bg-accent transition-colors"
                        title={`Run ${nextStep.label}`}
                      >
                        {nextStep.label}
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(project)}
                      className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => handleOpen(project)}
                      disabled={isSwitching || isActive}
                      className="h-8 px-3 text-[12px] font-medium border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {isSwitching ? 'Opening...' : isActive ? 'Current' : 'Open'}
                      {!isActive && <ChevronRight size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          name={deleteTarget.name ?? deleteTarget.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? deleteTarget.id}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
