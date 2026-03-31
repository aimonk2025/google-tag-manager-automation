import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRunHistory } from '../hooks/useRunHistory'
import { useLocalToggle } from '../hooks/useLocalToggle'
import type { SkillRunHistory } from '../lib/api'

interface RunHistoryProps {
  skillName: string
  onRerun?: () => void
  /** Called when user wants to restore a historical run's output into the page */
  onRestoreOutput?: (output: string) => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatDate(iso: string): string {
  const normalized = iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)]',
    error: 'text-destructive border-destructive/40',
    running: 'text-muted-foreground border-border',
    retried: 'text-amber-600 border-amber-300',
  }
  return (
    <span className={`text-[10px] font-medium border px-1.5 py-0.5 ${colors[status] ?? 'text-muted-foreground border-border'}`}>
      {status}
    </span>
  )
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="w-14 shrink-0 text-muted-foreground/40 text-[11px] font-mono tabular-nums">—</span>
  }
  const pct = Math.round(score * 100)
  const color = score >= 0.8
    ? 'text-[oklch(0.4_0.1_150)]'
    : score >= 0.5
      ? 'text-amber-600'
      : 'text-destructive'
  return (
    <span className={`w-14 shrink-0 text-[11px] font-mono tabular-nums ${color}`}>
      {pct}%
    </span>
  )
}

function MiniSparkline({ runs }: { runs: SkillRunHistory[] }) {
  const scores = runs.map(r => r.score).filter((s): s is number => s !== null)
  if (scores.length < 2) return null
  return (
    <span className="inline-flex items-end gap-px ml-2" style={{ height: 12 }}>
      {scores.map((s, i) => (
        <span
          key={i}
          className="w-1.5 bg-foreground/30 inline-block"
          style={{ height: `${Math.max(2, Math.round(s * 12))}px` }}
        />
      ))}
    </span>
  )
}

function RunRow({ run, onRerun, onRestoreOutput }: { run: SkillRunHistory; onRerun?: () => void; onRestoreOutput?: (output: string) => void }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <Link
        to={`/runs/${run.id}`}
        className="flex items-center gap-3 px-4 py-2.5 text-[12px] hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <span className="text-muted-foreground w-32 shrink-0">{formatDate(run.started_at)}</span>
        <span className="text-muted-foreground w-20 shrink-0 font-mono text-[11px]">{run.adapter_type}</span>
        <span className="w-16 shrink-0 tabular-nums">{run.duration_ms ? formatDuration(run.duration_ms) : '-'}</span>
        <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
          {run.input_tokens + run.output_tokens > 0 ? `${(run.input_tokens + run.output_tokens).toLocaleString()} tok` : '-'}
        </span>
        <span className="w-16 shrink-0 tabular-nums">{run.cost_usd > 0 ? formatCost(run.cost_usd) : '-'}</span>
        <ScoreCell score={run.score} />
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={run.status} />
          {run.retry_count > 0 && (
            <span className="text-[9px] font-medium text-amber-600 border border-amber-300 px-1 py-px">
              x{run.retry_count}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {onRestoreOutput && run.output_log && run.status !== 'running' && (
            <button
              onClick={e => { e.preventDefault(); onRestoreOutput(run.output_log!) }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors border border-border px-2 py-0.5"
              title="Load this run's output back into the page"
            >
              Load output
            </button>
          )}
          {onRerun && run.status !== 'running' && (
            <button
              onClick={e => { e.preventDefault(); onRerun() }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw size={11} />
              Re-run
            </button>
          )}
        </div>
      </Link>
    </div>
  )
}

export function RunHistory({ skillName, onRerun, onRestoreOutput }: RunHistoryProps) {
  const [open, toggleOpen] = useLocalToggle(`run-history-${skillName}`, false)
  const { runs, loading, refresh } = useRunHistory(skillName)

  if (!open) {
    return (
      <button
        onClick={() => { toggleOpen(); refresh() }}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight size={12} />
        Run history {runs.length > 0 && `(${runs.length})`}
        <MiniSparkline runs={runs.slice(0, 5)} />
      </button>
    )
  }

  return (
    <div className="border border-border">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <button
          onClick={toggleOpen}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
        >
          <ChevronDown size={12} />
          Run History
        </button>
        <button onClick={refresh} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="px-4 py-3 text-[12px] text-muted-foreground">Loading...</div>
      )}

      {!loading && runs.length === 0 && (
        <div className="px-4 py-3 text-[12px] text-muted-foreground">No runs yet.</div>
      )}

      {!loading && runs.length > 0 && (
        <>
          <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20">
            <span className="w-4 shrink-0" />
            <span className="w-32 shrink-0">Date</span>
            <span className="w-20 shrink-0">Adapter</span>
            <span className="w-16 shrink-0">Duration</span>
            <span className="w-24 shrink-0">Tokens</span>
            <span className="w-16 shrink-0">Cost</span>
            <span className="w-14 shrink-0">Score</span>
            <span>Status</span>
          </div>
          {runs.map(run => (
            <RunRow key={run.id} run={run} onRerun={onRerun} onRestoreOutput={onRestoreOutput} />
          ))}
        </>
      )}
    </div>
  )
}
