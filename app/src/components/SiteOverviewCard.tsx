import { useEffect, useState } from 'react'
import { api, type CostSummary } from '../lib/api'
import { PIPELINE_STEPS } from '../lib/constants'
import type { SessionData } from '../types/session'

interface SiteOverviewCardProps {
  session: SessionData
}

function FrameworkBadge({ framework }: { framework: string }) {
  const colors: Record<string, string> = {
    'Next.js': 'bg-black text-white',
    'React': 'bg-sky-100 text-sky-800',
    'Vue': 'bg-green-100 text-green-800',
    'Nuxt': 'bg-green-100 text-green-800',
    'Angular': 'bg-red-100 text-red-800',
    'Svelte': 'bg-orange-100 text-orange-800',
    'Remix': 'bg-blue-100 text-blue-800',
  }
  const cls = colors[framework] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 ${cls}`}>
      {framework}
    </span>
  )
}

export function SiteOverviewCard({ session }: SiteOverviewCardProps) {
  const [costs, setCosts] = useState<CostSummary | null>(null)

  useEffect(() => {
    api.getCostsSummary(session.id).then(setCosts).catch(() => {})
  }, [session.id])

  const auditCompact = session.compactOutputs?.['gtm-analytics-audit'] as Record<string, unknown> | undefined
  const domCompact = session.compactOutputs?.['gtm-dom-standardization'] as Record<string, unknown> | undefined
  const implCompact = session.compactOutputs?.['gtm-implementation'] as Record<string, unknown> | undefined
  const auditMeta = auditCompact?.metadata as Record<string, unknown> | undefined
  const framework = (auditMeta?.framework as string | undefined) ?? 'unknown'
  const containerId = session.gtmConfig?.containerId ?? null

  const completedCount = session.completedSkills.length
  const totalSteps = PIPELINE_STEPS.length

  // Count total files changed: dom applied + implementation result
  const domApplied = (domCompact?.appliedCount as number | undefined) ?? 0
  const implFiles = (implCompact?.filesModified as number | undefined) ?? 0
  const totalFilesChanged = domApplied + implFiles

  return (
    <div className="border border-border">
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold truncate">
            {session.name ?? session.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? session.id}
          </span>
          {framework !== 'unknown' && <FrameworkBadge framework={framework} />}
          {containerId && (
            <span className="flex items-center gap-1 text-[10px] text-[oklch(0.4_0.1_150)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.55_0.12_150)] shrink-0" />
              GTM
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0 font-mono">{containerId ?? 'No GTM'}</span>
      </div>

      <div className="px-4 py-2 text-[11px] text-muted-foreground font-mono truncate border-b border-border">
        {session.projectPath}
      </div>

      <div className="grid grid-cols-4 divide-x divide-border">
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Progress</p>
          <p className="text-lg font-bold leading-none">{completedCount}<span className="text-[12px] font-normal text-muted-foreground">/{totalSteps}</span></p>
          <p className="text-[11px] text-muted-foreground mt-0.5">steps done</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Files Changed</p>
          <p className="text-lg font-bold leading-none">{totalFilesChanged || '-'}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">modified</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Session Cost</p>
          <p className="text-lg font-bold leading-none">
            {costs ? (costs.totalCostUsd > 0 ? `$${costs.totalCostUsd.toFixed(3)}` : '$0.00') : '-'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {costs && costs.totalInputTokens + costs.totalOutputTokens > 0
              ? `${((costs.totalInputTokens + costs.totalOutputTokens) / 1000).toFixed(1)}k tokens`
              : 'no usage yet'}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Framework</p>
          <p className="text-[13px] font-semibold leading-none mt-1">{framework}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">detected</p>
        </div>
      </div>
    </div>
  )
}
