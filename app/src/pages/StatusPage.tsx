import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

interface HealthData {
  status: string
  version: string
  name: string
  checks: Record<string, string>
  diskFreeGB: number | null
  activeRuns: number
  lastBackupAt: string | null
  lastBackupSizeKB: number | null
}

function StatusDot({ status }: { status: string }) {
  if (status === 'ok') return <span className="inline-block w-2 h-2 rounded-full bg-[oklch(0.4_0.1_150)] shrink-0" />
  if (status === 'not_found' || status === 'error') return <span className="inline-block w-2 h-2 rounded-full bg-destructive shrink-0" />
  return <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ok: 'OK',
    not_found: 'Not found',
    error: 'Error',
    not_authenticated: 'Not authenticated',
    unreachable: 'Unreachable',
  }
  return <span className="text-[11px] font-mono text-muted-foreground">{labels[status] ?? status}</span>
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CheckRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0">
      <StatusDot status={status} />
      <span className="text-sm flex-1">{label}</span>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
      <StatusLabel status={status} />
    </div>
  )
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(() => {
    api.getHealth()
      .then(data => {
        setHealth(data)
        setLastChecked(new Date())
        setError(null)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Could not reach server')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">System Status</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live health checks for all system components. Auto-refreshes every 30 seconds.
          </p>
        </div>
        <button
          onClick={fetchHealth}
          className="text-[11px] px-3 py-1.5 border border-border hover:bg-muted/40 transition-colors"
        >
          Refresh
        </button>
      </div>

      {lastChecked && (
        <p className="text-[11px] text-muted-foreground">
          Last checked: {lastChecked.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !health && (
        <div className="border border-border">
          {['Server', 'Database', 'Claude CLI', 'GTM API'].map(label => (
            <div key={label} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0">
              <span className="inline-block w-2 h-2 rounded-full bg-muted animate-pulse shrink-0" />
              <span className="text-sm flex-1">{label}</span>
              <span className="text-[11px] text-muted-foreground">Checking...</span>
            </div>
          ))}
        </div>
      )}

      {health && (
        <>
          <div className="border border-border">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Core Services</span>
            </div>
            <CheckRow label="Server" status={health.checks.server ?? 'ok'} detail={`v${health.version}`} />
            <CheckRow label="Database" status={health.checks.db ?? 'ok'} />
            <CheckRow label="Claude CLI" status={health.checks.claudeCli ?? 'ok'} detail={health.checks.claudeCli === 'not_found' ? 'Run: claude login' : undefined} />
          </div>

          <div className="border border-border">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">System Resources</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
              <StatusDot status={health.diskFreeGB === null || health.diskFreeGB > 1 ? 'ok' : 'error'} />
              <span className="text-sm flex-1">Disk Space</span>
              <span className="text-[11px] text-muted-foreground">
                {health.diskFreeGB !== null ? `${health.diskFreeGB} GB free` : 'Unknown'}
              </span>
              <StatusLabel status={health.diskFreeGB === null || health.diskFreeGB > 1 ? 'ok' : 'error'} />
            </div>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
              <StatusDot status="ok" />
              <span className="text-sm flex-1">Active Skill Runs</span>
              <span className="text-[11px] text-muted-foreground">{health.activeRuns}</span>
              <StatusLabel status="ok" />
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <StatusDot status={health.lastBackupAt ? 'ok' : 'not_found'} />
              <span className="text-sm flex-1">Last Database Backup</span>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(health.lastBackupAt)}
                {health.lastBackupSizeKB !== null ? ` (${health.lastBackupSizeKB} KB)` : ''}
              </span>
              <StatusLabel status={health.lastBackupAt ? 'ok' : 'not_found'} />
            </div>
          </div>

          <div className="border border-border px-4 py-3 text-[11px] text-muted-foreground">
            App: {health.name} &middot; Version {health.version}
          </div>
        </>
      )}
    </div>
  )
}
