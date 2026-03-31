import { useGtmHealth } from '@/hooks/useGtmHealth'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle, Clock, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'

interface GtmAuthBannerProps {
  sessionId: string | null | undefined
}

export function GtmAuthBanner({ sessionId }: GtmAuthBannerProps) {
  const { health, lastChecked, recheck } = useGtmHealth(sessionId)

  if (health.status === 'ok') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border text-[12px]">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-foreground" />
        <span className="text-foreground font-medium">GTM connected</span>
        {health.account && (
          <span className="text-muted-foreground">- {health.account}</span>
        )}
        <button
          onClick={recheck}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          title="Re-check GTM connection"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    )
  }

  if (health.status === 'checking') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border text-[12px]">
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Checking GTM connection...</span>
      </div>
    )
  }

  const Icon = health.status === 'rate_limited' || health.status === 'quota_exceeded'
    ? Clock
    : health.status === 'unreachable'
      ? WifiOff
      : XCircle

  const actionLink = (health.status === 'auth_error' || health.status === 'not_configured') ? (
    <Link
      to="/setup"
      className="ml-auto text-[11px] font-medium underline underline-offset-2 text-foreground hover:text-muted-foreground whitespace-nowrap"
    >
      Go to Setup
    </Link>
  ) : null

  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-background border border-destructive text-[12px]">
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-destructive" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">
          {health.status === 'auth_error' && 'GTM authentication error'}
          {health.status === 'rate_limited' && 'GTM API rate limited'}
          {health.status === 'quota_exceeded' && 'GTM API quota exceeded'}
          {health.status === 'not_configured' && 'GTM not configured'}
          {health.status === 'unreachable' && 'GTM API unreachable'}
        </span>
        {' - '}
        <span className="text-muted-foreground">{health.detail}</span>
        {health.retryAfter && (
          <span className="text-muted-foreground ml-1">(retry in {health.retryAfter}s)</span>
        )}
        {lastChecked && (
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            Last checked: {lastChecked.toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        {actionLink}
        <button
          onClick={recheck}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Re-check GTM connection"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
