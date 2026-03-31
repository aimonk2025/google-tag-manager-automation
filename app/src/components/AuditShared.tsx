import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { GtmContainerData } from '@/lib/api'
import { useGtmContainerData } from '@/hooks/useGtmContainerData'
import { groupElementsByPage } from '@/utils/groupElementsByPage'
import type { PageGroup, AuditElement } from '@/utils/groupElementsByPage'
import type { AuditReport } from '@/types/session'

// ---------------------------------------------------------------------------
// Shared constants and types
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, string> = {
  cta: 'CTA',
  nav: 'Nav',
  form: 'Form',
  outbound: 'Outbound',
  media: 'Media',
}

export const MAX_ITEMS = 50

export type GtmTab = 'tags' | 'triggers' | 'variables'

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

export function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// SlimCoverageBar
// ---------------------------------------------------------------------------

export function SlimCoverageBar({ report }: { report: AuditReport }) {
  const tracked = report.summary?.withTracking ?? 0
  const total = report.summary?.totalClickableElements ?? 0
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0
  const gaps = report.summary?.withoutTracking ?? (total - tracked)
  const framework = report.metadata?.framework ?? null
  const filesScanned = report.metadata?.filesScanned ?? null

  const colorClass =
    pct >= 90
      ? 'text-[oklch(0.4_0.12_150)]'
      : pct >= 70
      ? 'text-[oklch(0.55_0.12_80)]'
      : 'text-[oklch(0.45_0.15_25)]'

  const barColor =
    pct >= 90
      ? 'bg-[oklch(0.55_0.15_150)]'
      : pct >= 70
      ? 'bg-[oklch(0.65_0.15_80)]'
      : 'bg-[oklch(0.55_0.15_25)]'

  return (
    <div className="border border-border px-4 py-2.5 flex items-center gap-4 flex-wrap">
      <span className={`text-2xl font-bold leading-none tabular-nums ${colorClass}`}>{pct}%</span>
      <div className="flex-1 min-w-[120px] h-1.5 bg-muted overflow-hidden">
        <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
        <span>{total} elements scanned</span>
        {gaps > 0 && (
          <span className="text-[oklch(0.5_0.1_25)]">{gaps} with gaps</span>
        )}
        {framework && (
          <span className="border border-border px-1.5 py-0.5 text-[11px] font-medium">{framework}</span>
        )}
        {filesScanned != null && <span>{filesScanned} files</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CategoryBadge
// ---------------------------------------------------------------------------

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="text-[10px] font-medium text-muted-foreground border border-border px-1.5 py-0.5 shrink-0">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ElementRow
// ---------------------------------------------------------------------------

export function ElementRow({ element }: { element: AuditElement }) {
  const text = element.text.length > 40 ? element.text.slice(0, 40) + '...' : element.text

  return (
    <div className="pl-6 pr-3 py-2 flex items-center gap-3 hover:bg-muted/20 transition-colors border-b border-border last:border-0">
      <span className="text-[12px] font-mono flex-1 truncate min-w-0" title={element.text}>{text}</span>
      <CategoryBadge category={element.category} />
      {element.tracking ? (
        <span className="text-[10px] font-semibold px-2 py-0.5 bg-[oklch(0.95_0.06_150)] text-[oklch(0.35_0.1_150)] shrink-0">Tracked</span>
      ) : (
        <span className="text-[10px] font-semibold px-2 py-0.5 bg-[oklch(0.97_0.02_20)] text-[oklch(0.4_0.1_20)] shrink-0">Untracked</span>
      )}
      {!element.tracking && element.recommendation && (
        <span className="text-[11px] text-muted-foreground truncate min-w-0 max-w-[200px]" title={element.recommendation}>
          {element.recommendation}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PageSection (collapsible)
// ---------------------------------------------------------------------------

export function PageSection({ group }: { group: PageGroup }) {
  const defaultExpanded = group.untrackedCount > 0
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/20 transition-colors text-left"
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className="font-mono text-[12px] font-medium flex-1 truncate min-w-0">
          {group.page}
        </span>
        {group.trackedCount > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 bg-[oklch(0.95_0.06_150)] text-[oklch(0.35_0.1_150)] shrink-0">
            {group.trackedCount} tracked
          </span>
        )}
        {group.untrackedCount > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 bg-[oklch(0.97_0.02_20)] text-[oklch(0.4_0.1_20)] shrink-0">
            {group.untrackedCount} untracked
          </span>
        )}
      </button>
      {expanded && (
        <div>
          {group.elements.map((el, i) => (
            <ElementRow
              key={`${el.file}-${el.line ?? i}-${el.text}`}
              element={el}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PagesPanel
// ---------------------------------------------------------------------------

export function PagesPanel({
  report,
  isRunning,
}: {
  report: AuditReport | null
  isRunning: boolean
}) {
  if (isRunning) {
    return (
      <div className="border border-border flex flex-col gap-2 p-4 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pages + Elements</p>
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[13px]">Running audit...</span>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="border border-border flex flex-col gap-2 p-4 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pages + Elements</p>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-muted-foreground">Run the audit to see page coverage.</p>
        </div>
      </div>
    )
  }

  const groups = groupElementsByPage(report as unknown as Record<string, unknown>)

  if (groups.length === 0) {
    return (
      <div className="border border-border flex flex-col gap-2 p-4 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pages + Elements</p>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-muted-foreground">No elements found in audit report.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border flex flex-col">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Pages + Elements
          <span className="ml-2 font-normal normal-case">({groups.length} pages)</span>
        </p>
      </div>
      <div className="overflow-y-auto max-h-[560px]">
        {groups.map(group => (
          <PageSection
            key={group.page}
            group={group}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GtmInsightsPanel
// ---------------------------------------------------------------------------

export function GtmInsightsPanel({ report, gtmData }: { report: AuditReport; gtmData: GtmContainerData }) {
  const groups = groupElementsByPage(report as unknown as Record<string, unknown>)
  const allElements: AuditElement[] = groups.flatMap(g => g.elements)
  const untrackedElements = allElements.filter(el => !el.tracking)
  const tagNames = gtmData.tags.map(t => t.name.toLowerCase())
  const missingTags = untrackedElements.filter(el => {
    const elText = el.text.toLowerCase()
    return !tagNames.some(name => name.includes(elText) || elText.includes(name))
  })

  const pausedTags = gtmData.tags.filter(t => t.status === 'paused')

  const unusedVariables = gtmData.variables.filter(v => {
    const vName = v.name.toLowerCase()
    const usedInTag = gtmData.tags.some(t => t.name.toLowerCase().includes(vName))
    const usedInTrigger = gtmData.triggers.some(tr =>
      tr.name.toLowerCase().includes(vName) || (tr.condition ?? '').toLowerCase().includes(vName)
    )
    return !usedInTag && !usedInTrigger
  })

  const hasInsights = missingTags.length > 0 || pausedTags.length > 0 || unusedVariables.length > 0

  if (!hasInsights) return null

  return (
    <div className="border-t border-border px-3 py-3 flex flex-col gap-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">What Claude recommends</p>

      {missingTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-foreground">Missing tags ({missingTags.length})</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {missingTags.slice(0, 20).map((el, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.55_0.15_25)] shrink-0" />
                <span className="text-[11px] font-mono text-muted-foreground truncate" title={el.text}>
                  {el.text.length > 50 ? el.text.slice(0, 50) + '...' : el.text}
                </span>
              </div>
            ))}
            {missingTags.length > 20 && (
              <p className="text-[11px] text-muted-foreground">...and {missingTags.length - 20} more</p>
            )}
          </div>
        </div>
      )}

      {pausedTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-foreground">Paused tags ({pausedTags.length})</p>
          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
            {pausedTags.map(tag => (
              <div key={tag.id} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.65_0.15_80)] shrink-0" />
                <span className="text-[11px] font-mono text-muted-foreground truncate" title={tag.name}>
                  {tag.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unusedVariables.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-foreground">Potentially unused variables ({unusedVariables.length})</p>
          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
            {unusedVariables.slice(0, 15).map(v => (
              <div key={v.id} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                <span className="text-[11px] font-mono text-muted-foreground truncate" title={v.name}>
                  {v.name}
                </span>
              </div>
            ))}
            {unusedVariables.length > 15 && (
              <p className="text-[11px] text-muted-foreground">...and {unusedVariables.length - 15} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GtmContainerPanel
// ---------------------------------------------------------------------------

export function GtmContainerPanel({ sessionId, report }: { sessionId: string | undefined; report: AuditReport | null }) {
  const { data, isLoading, isError, refetch, isFetching } = useGtmContainerData(sessionId)
  const [activeTab, setActiveTab] = useState<GtmTab>('tags')

  const handleRefresh = async () => {
    if (!sessionId) return
    await api.refreshGtmContainer(sessionId)
    refetch()
  }

  if (!sessionId) {
    return (
      <div className="border border-border p-4 flex flex-col gap-2 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">GTM Container</p>
        <div className="border-t border-border mt-1 pt-3 flex flex-col gap-2">
          <p className="text-[13px] text-muted-foreground">No active session.</p>
        </div>
      </div>
    )
  }

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="border border-border p-4 flex flex-col gap-2 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">GTM Container</p>
        <div className="border-t border-border mt-1 pt-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[13px]">Fetching GTM data...</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="border border-border p-4 flex flex-col gap-3 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">GTM Container</p>
        <div className="border-t border-border mt-1 pt-3 flex flex-col gap-3">
          <p className="text-[13px] text-muted-foreground">Could not load GTM data.</p>
          <button
            onClick={() => refetch()}
            className="self-start text-[12px] font-medium border border-border px-3 py-1.5 hover:bg-muted/40 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const gtmData = data as GtmContainerData | undefined

  if (!gtmData || gtmData.error === 'not_authenticated' || gtmData.error === 'no_container') {
    return (
      <div className="border border-border p-4 flex flex-col gap-2 h-full min-h-[200px]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">GTM Container</p>
        <div className="border-t border-border mt-1 pt-3 flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground border border-border px-2 py-0.5 self-start">Not connected</span>
          <p className="text-[13px] text-muted-foreground mt-1">GTM is not authenticated.</p>
          <Link
            to="/setup"
            className="self-start text-[12px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            Go to Setup
          </Link>
        </div>
      </div>
    )
  }

  const { containerSummary, tags, triggers, variables, fetchedAt } = gtmData

  const tabItems = { tags, triggers, variables }
  const currentItems = tabItems[activeTab]
  const hasMore = currentItems.length > MAX_ITEMS
  const displayItems = hasMore ? currentItems.slice(0, MAX_ITEMS) : currentItems

  return (
    <div className="border border-border flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">GTM Container</p>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          title="Refresh GTM data"
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Account info */}
      <div className="px-3 py-2.5 border-b border-border flex flex-col gap-1">
        <p className="text-[12px] text-muted-foreground">
          Account: <span className="text-foreground font-medium">{containerSummary.accountId}</span>
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted-foreground">
            Container: <span className="text-foreground font-medium font-mono">{containerSummary.containerId}</span>
          </p>
          {fetchedAt && (
            <p className="text-[11px] text-muted-foreground shrink-0">
              Last synced: {relativeTime(fetchedAt)}
            </p>
          )}
        </div>
      </div>

      {/* Summary pills */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-medium border border-border px-2 py-0.5">
          {containerSummary.totalTags} Tags
        </span>
        <span className="text-[11px] font-medium border border-border px-2 py-0.5">
          {containerSummary.totalTriggers} Triggers
        </span>
        <span className="text-[11px] font-medium border border-border px-2 py-0.5">
          {containerSummary.totalVariables} Variables
        </span>
      </div>

      {/* Tabs */}
      <div className="px-3 border-b border-border flex items-center gap-0">
        {(['tags', 'triggers', 'variables'] as GtmTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-[12px] font-medium capitalize px-3 py-2.5 border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="overflow-y-auto max-h-96">
        {displayItems.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">No {activeTab} found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeTab === 'tags' &&
              (displayItems as typeof tags).map(tag => (
                <div key={tag.id} className="px-3 py-2.5 flex items-center gap-2">
                  <span className="text-[12px] flex-1 truncate min-w-0" title={tag.name}>
                    {tag.name}
                  </span>
                  <span className="text-[10px] font-medium border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {tag.type}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 shrink-0 ${
                      tag.status === 'active'
                        ? 'bg-[oklch(0.95_0.06_150)] text-[oklch(0.35_0.1_150)]'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {tag.status === 'active' ? 'Active' : 'Paused'}
                  </span>
                </div>
              ))}

            {activeTab === 'triggers' &&
              (displayItems as typeof triggers).map(trigger => (
                <div key={trigger.id} className="px-3 py-2.5 flex items-center gap-2">
                  <span className="text-[12px] flex-1 truncate min-w-0" title={trigger.name}>
                    {trigger.name}
                  </span>
                  <span className="text-[10px] font-medium border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {trigger.type}
                  </span>
                </div>
              ))}

            {activeTab === 'variables' &&
              (displayItems as typeof variables).map(variable => (
                <div key={variable.id} className="px-3 py-2.5 flex items-center gap-2">
                  <span className="text-[12px] flex-1 truncate min-w-0" title={variable.name}>
                    {variable.name}
                  </span>
                  <span className="text-[10px] font-medium border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {variable.type}
                  </span>
                  {variable.value && (
                    <span
                      className="text-[11px] text-muted-foreground font-mono truncate max-w-[100px] shrink-0"
                      title={variable.value}
                    >
                      {variable.value}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}

        {hasMore && (
          <div className="px-3 py-2.5 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              Showing {MAX_ITEMS} of {currentItems.length} - refine in GTM directly
            </p>
          </div>
        )}
      </div>

      {/* Insights panel - shown when both audit report and GTM data are loaded */}
      {report && gtmData && (
        <GtmInsightsPanel report={report} gtmData={gtmData} />
      )}
    </div>
  )
}
