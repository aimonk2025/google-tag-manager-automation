import { useRef, useEffect } from 'react'
import { formatElapsed } from '@/lib/utils'
import type { ActivityEvent } from '@/hooks/useSkillRun'

// Map tool name to a short action verb and color class
function toolMeta(tool: string): { verb: string; color: string; icon: string } {
  const t = tool.toLowerCase()
  if (t === 'read' || t === 'read_file')
    return { verb: 'READ', color: 'text-sky-600', icon: '○' }
  if (t === 'write' || t === 'write_file')
    return { verb: 'WRITE', color: 'text-emerald-600', icon: '●' }
  if (t === 'edit' || t === 'edit_file')
    return { verb: 'EDIT', color: 'text-amber-600', icon: '◆' }
  if (t === 'glob')
    return { verb: 'GLOB', color: 'text-violet-500', icon: '◇' }
  if (t === 'grep')
    return { verb: 'GREP', color: 'text-violet-500', icon: '◇' }
  if (t === 'bash' || t === 'execute_command' || t === 'computer')
    return { verb: 'EXEC', color: 'text-orange-500', icon: '▶' }
  if (t === 'websearch' || t === 'web_search' || t === 'webfetch' || t === 'web_fetch')
    return { verb: 'WEB', color: 'text-blue-500', icon: '⊕' }
  if (t === 'system')
    return { verb: 'INIT', color: 'text-muted-foreground', icon: '·' }
  return { verb: 'TOOL', color: 'text-muted-foreground', icon: '·' }
}

// Extract the most useful display string from a label
function shortLabel(label: string): string {
  // Strip leading verb prefix if present (e.g. "Reading foo.tsx" -> "foo.tsx")
  return label
    .replace(/^(Reading|Writing|Editing|Scanning files:|Searching:|Running:)\s*/i, '')
    .trim()
}

interface ActivityFeedProps {
  activity: ActivityEvent[]
  elapsedMs: number
  label?: string
  workerId?: string
  scopedFiles?: string[]
  contextSummary?: string
  retryCount?: number
  retryReason?: string | null
}

function humanizeRetryReason(reason: string): string {
  const map: Record<string, string> = {
    incomplete_json_block: 'Output was truncated — retrying with completion reminder',
    malformed_json: 'JSON syntax error in output — retrying with format correction',
    missing_required_fields: 'Required output fields missing — retrying with schema reminder',
    timeout: 'Run timed out — retrying with reduced scope',
    unknown_error: 'Unexpected error — retrying',
  }
  return map[reason] ?? reason
}

function inferEventPhase(tool: string): string {
  const t = tool.toLowerCase()
  if (t === 'glob' || t === 'grep') return 'Scanning'
  if (t === 'read' || t === 'read_file') return 'Reading'
  if (t === 'write' || t === 'write_file' || t === 'edit' || t === 'edit_file') return 'Writing'
  if (t === 'bash' || t === 'execute_command') return 'Executing'
  return 'other'
}

export function ActivityFeed({ activity, elapsedMs, label = 'Claude is working', workerId, scopedFiles = [], contextSummary, retryCount, retryReason }: ActivityFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null)

  const toolUseEvents = activity.filter(a => a.type === 'tool_use')
  const latestEvent = toolUseEvents[toolUseEvents.length - 1]

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [activity])

  // Stats
  const filesRead = new Set(
    toolUseEvents
      .filter(a => a.tool.toLowerCase().includes('read') && a.input?.file_path)
      .map(a => String(a.input!.file_path))
  )
  const filesWritten = new Set(
    toolUseEvents
      .filter(a => (a.tool.toLowerCase().includes('write') || a.tool.toLowerCase().includes('edit')) && a.input?.file_path)
      .map(a => String(a.input!.file_path))
  )
  const searchCount = toolUseEvents.filter(a =>
    a.tool.toLowerCase() === 'glob' || a.tool.toLowerCase() === 'grep'
  ).length

  // Progress: match activity file paths against scoped files
  // A scoped file is "done" if it has been written/edited
  const scopedTotal = scopedFiles.length
  const scopedDone = scopedTotal > 0
    ? scopedFiles.filter(f => {
        const base = f.split(/[\\/]/).pop()?.toLowerCase() ?? ''
        return Array.from(filesWritten).some(w =>
          w.toLowerCase().endsWith(f.toLowerCase()) ||
          w.split(/[\\/]/).pop()?.toLowerCase() === base
        )
      }).length
    : 0
  const scopedRead = scopedTotal > 0
    ? scopedFiles.filter(f => {
        const base = f.split(/[\\/]/).pop()?.toLowerCase() ?? ''
        return Array.from(filesRead).some(r =>
          r.toLowerCase().endsWith(f.toLowerCase()) ||
          r.split(/[\\/]/).pop()?.toLowerCase() === base
        )
      }).length
    : 0
  const hasProgress = scopedTotal > 0
  const progressPct = hasProgress ? Math.round((scopedDone / scopedTotal) * 100) : 0

  // Dedupe consecutive identical labels for the log
  const dedupedEvents: ActivityEvent[] = []
  for (const ev of toolUseEvents) {
    const prev = dedupedEvents[dedupedEvents.length - 1]
    if (!prev || prev.label !== ev.label) dedupedEvents.push(ev)
  }

  // Infer phase from what Claude is doing
  function inferPhase(): string {
    if (!latestEvent) return 'Starting up...'
    const t = latestEvent.tool.toLowerCase()
    if (t === 'system') return 'Initializing Claude Code...'
    if (t === 'glob' || t === 'grep') return 'Scanning codebase...'
    if (t === 'read' || t === 'read_file') return 'Reading source files...'
    if (t === 'write' || t === 'write_file') return 'Writing changes...'
    if (t === 'edit' || t === 'edit_file') return 'Editing files...'
    if (t === 'bash' || t === 'execute_command') return 'Running commands...'
    return 'Processing...'
  }

  return (
    <div className="border border-border overflow-hidden font-mono">

      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {workerId ? `[${workerId}] ` : ''}{label}
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground tabular-nums">{formatElapsed(elapsedMs)}</span>
      </div>

      {/* Retry banner */}
      {retryCount != null && retryCount > 0 && (
        <div className="px-4 py-2 border-b border-border bg-amber-50/40 flex items-center gap-3">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest shrink-0">
            RETRY {retryCount}/3
          </span>
          {retryReason && (
            <span className="text-[11px] text-amber-700 truncate">
              {humanizeRetryReason(retryReason)}
            </span>
          )}
        </div>
      )}

      {/* Context summary — what Claude is working on */}
      {contextSummary && (
        <div className="px-4 py-2 border-b border-border bg-sky-50/30 flex items-center gap-2">
          <span className="text-[11px] text-sky-700">{contextSummary}</span>
        </div>
      )}

      {/* Progress bar — only shown when scoped files are known */}
      {hasProgress && (
        <div className="px-4 py-2.5 border-b border-border bg-muted/10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Progress</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {scopedDone} of {scopedTotal} files edited
              {scopedRead > scopedDone && <span className="ml-2 text-sky-600">· {scopedRead} read</span>}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted overflow-hidden relative">
            {/* Read progress (lighter, behind) */}
            <div
              className="h-full bg-sky-200 transition-all duration-500 absolute inset-y-0 left-0"
              style={{ width: `${hasProgress ? Math.round((scopedRead / scopedTotal) * 100) : 0}%` }}
            />
            {/* Written progress (solid, in front) */}
            <div
              className="h-full bg-emerald-500 transition-all duration-500 absolute inset-y-0 left-0"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-1 bg-emerald-500 inline-block" /> edited</span>
            <span className="flex items-center gap-1"><span className="w-2 h-1 bg-sky-300 inline-block" /> read</span>
            <span className="flex items-center gap-1"><span className="w-2 h-1 bg-muted border border-border inline-block" /> pending</span>
          </div>
        </div>
      )}

      {/* Live stats bar */}
      {(filesRead.size > 0 || filesWritten.size > 0 || searchCount > 0) && (
        <div className="px-4 py-1.5 border-b border-border flex gap-4 bg-muted/20 text-[11px]">
          {filesRead.size > 0 && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-sky-600">{filesRead.size}</span> read
            </span>
          )}
          {filesWritten.size > 0 && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-emerald-600">{filesWritten.size}</span> modified
            </span>
          )}
          {searchCount > 0 && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-violet-500">{searchCount}</span> searches
            </span>
          )}
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{toolUseEvents.length}</span> total actions
          </span>
          <span className="ml-auto text-muted-foreground italic">{inferPhase()}</span>
        </div>
      )}

      {/* Current action highlight */}
      {latestEvent && (() => {
        const meta = toolMeta(latestEvent.tool)
        return (
          <div className="px-4 py-2.5 border-b border-border bg-muted/10 flex items-center gap-3">
            <span className={`text-[10px] font-bold w-10 shrink-0 ${meta.color}`}>{meta.verb}</span>
            <span className="text-[12px] text-foreground flex-1 truncate">{shortLabel(latestEvent.label)}</span>
            <span className="text-[10px] text-muted-foreground shrink-0 animate-pulse">running</span>
          </div>
        )
      })()}

      {/* Event log — terminal style */}
      <div
        ref={feedRef}
        className="max-h-64 overflow-y-auto py-1.5 flex flex-col"
      >
        {dedupedEvents.length === 0 ? (
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground animate-pulse">Waiting for Claude...</span>
          </div>
        ) : (
          dedupedEvents.map((ev, i) => {
            const isLatest = i === dedupedEvents.length - 1
            const meta = toolMeta(ev.tool)
            const lbl = shortLabel(ev.label)
            const currentPhase = inferEventPhase(ev.tool)
            const prevPhase = i > 0 ? inferEventPhase(dedupedEvents[i - 1].tool) : null
            const showPhaseHeader = currentPhase !== prevPhase && currentPhase !== 'other'
            return (
              <div key={i}>
                {showPhaseHeader && (
                  <div className="px-4 pt-1.5 pb-0.5 flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{currentPhase}</span>
                    <span className="flex-1 h-px bg-border/40" />
                  </div>
                )}
                <div
                  className={`flex items-center gap-2.5 px-4 py-px transition-opacity ${isLatest ? 'opacity-100' : 'opacity-35'}`}
                >
                  <span className={`text-[10px] font-bold w-10 shrink-0 tabular-nums ${isLatest ? meta.color : 'text-muted-foreground'}`}>
                    {meta.verb}
                  </span>
                  <span className={`text-[12px] flex-1 truncate ${isLatest ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {lbl}
                  </span>
                  {isLatest && (
                    <span className="ml-auto shrink-0 text-[9px] font-medium text-muted-foreground animate-pulse tracking-wider">NOW</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Scoped file checklist — shows per-file status when audit scope is known */}
      {hasProgress ? (
        <div className="border-t border-border px-4 py-2.5 bg-muted/10">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Files in scope</p>
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
            {scopedFiles.map(f => {
              const base = f.split(/[\\/]/).pop()?.toLowerCase() ?? ''
              const written = Array.from(filesWritten).some(w =>
                w.toLowerCase().endsWith(f.toLowerCase()) || w.split(/[\\/]/).pop()?.toLowerCase() === base
              )
              const read = !written && Array.from(filesRead).some(r =>
                r.toLowerCase().endsWith(f.toLowerCase()) || r.split(/[\\/]/).pop()?.toLowerCase() === base
              )
              const display = f.split(/[\\/]/).slice(-2).join('/')
              return (
                <div key={f} className="flex items-center gap-2">
                  <span className={`text-[10px] shrink-0 ${written ? 'text-emerald-500' : read ? 'text-sky-500' : 'text-muted-foreground/40'}`}>
                    {written ? '✓' : read ? '→' : '·'}
                  </span>
                  <span className={`text-[11px] font-mono truncate ${written ? 'text-emerald-700' : read ? 'text-sky-600' : 'text-muted-foreground'}`}>
                    {display}
                  </span>
                  {written && <span className="ml-auto text-[9px] text-emerald-600 shrink-0">edited</span>}
                  {read && <span className="ml-auto text-[9px] text-sky-500 shrink-0">reading</span>}
                </div>
              )
            })}
          </div>
        </div>
      ) : filesWritten.size > 0 ? (
        <div className="border-t border-border px-4 py-2 bg-muted/10">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Files being modified</p>
          <div className="flex flex-col gap-0.5">
            {Array.from(filesWritten).map(f => (
              <span key={f} className="text-[11px] text-emerald-700 font-mono truncate">
                {f.split(/[\\/]/).slice(-2).join('/')}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
