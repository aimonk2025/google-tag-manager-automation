import { useState, useEffect } from 'react'
import { useSession } from '@/context/SessionContext'
import { api, type ActivityEvent } from '@/lib/api'
import { SkeletonRows } from '@/components/Skeleton'

const EVENT_ICONS: Record<string, string> = {
  'skill.started': '▶',
  'skill.completed': '✓',
  'skill.failed': '✗',
  'file.applied': '↓',
  'file.skipped': '–',
  'session.created': '◆',
  'session.switched': '⇄',
  'approval.created': '◎',
  'approval.approved': '✓',
  'approval.rejected': '✗',
  'approval.revision_requested': '↺',
}

const EVENT_COLORS: Record<string, string> = {
  'skill.started': 'text-muted-foreground',
  'skill.completed': 'text-[oklch(0.4_0.1_150)]',
  'skill.failed': 'text-destructive',
  'file.applied': 'text-sky-600',
  'file.skipped': 'text-muted-foreground',
  'session.created': 'text-violet-600',
  'session.switched': 'text-violet-600',
  'approval.created': 'text-amber-600',
  'approval.approved': 'text-[oklch(0.4_0.1_150)]',
  'approval.rejected': 'text-destructive',
  'approval.revision_requested': 'text-amber-600',
}

const ALL_TYPES = Object.keys(EVENT_ICONS)

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function parseDetail(detail: string | null): Record<string, unknown> | null {
  if (!detail) return null
  try { return JSON.parse(detail) as Record<string, unknown> } catch { return null }
}

function EventRow({ event }: { event: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false)
  const icon = EVENT_ICONS[event.event_type] ?? '·'
  const color = EVENT_COLORS[event.event_type] ?? 'text-muted-foreground'
  const detail = parseDetail(event.detail)

  const label = detail
    ? (detail.skillName as string ?? detail.filePath as string ?? detail.name as string ?? event.entity_id ?? '')
    : event.entity_id ?? ''

  return (
    <div className="flex gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
      <span className={`text-[12px] w-4 shrink-0 mt-0.5 font-mono ${color}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold font-mono ${color}`}>{event.event_type}</span>
          {label && <span className="text-[12px] text-foreground truncate">{String(label)}</span>}
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatTime(event.created_at)}</span>
        </div>
        {detail && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            {expanded ? 'hide details' : 'details'}
          </button>
        )}
        {expanded && detail && (
          <pre className="text-[10px] font-mono text-muted-foreground mt-1 bg-muted/30 px-2 py-1.5 whitespace-pre-wrap break-all">
            {JSON.stringify(detail, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function ActivityPage() {
  const { session } = useSession()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!session?.id) { setLoading(false); return }
    setLoading(true)
    api.getActivity(session.id, 100)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session?.id])

  const filtered = filter === 'all' ? events : events.filter(e => e.event_type === filter)

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">All actions logged for the active project.</p>
      </div>

      {!session && (
        <p className="text-sm text-muted-foreground">No active session.</p>
      )}

      {session && (
        <>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`text-[11px] px-2.5 py-1 border transition-colors ${filter === 'all' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              All ({events.length})
            </button>
            {ALL_TYPES.map(type => {
              const count = events.filter(e => e.event_type === type).length
              if (count === 0) return null
              return (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`text-[11px] px-2.5 py-1 border transition-colors ${filter === type ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  {type} ({count})
                </button>
              )
            })}
          </div>

          {loading && <SkeletonRows rows={6} />}

          {!loading && filtered.length === 0 && (
            <div className="border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No activity yet.
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="border border-border">
              {filtered.map(event => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
