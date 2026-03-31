import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { useGtmStatus } from '@/hooks/useGtmStatus'
import { GtmAuthBanner } from '@/components/GtmAuthBanner'
import { api } from '@/lib/api'
import { WelcomeOverlay, hasSeenWelcome } from '@/components/WelcomeOverlay'
import { CheckCircle2, Loader2 } from 'lucide-react'

type BrowseEntry = { name: string; path: string; isDirectory: boolean }
type BrowseResult = { path: string | null; parent: string | null; entries: BrowseEntry[] }

function FolderBrowser({ onSelect, onClose }: { onSelect: (p: string) => void; onClose: () => void }) {
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  async function navigate(browsePath?: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await api.browsePath(browsePath)
      setResult(data)
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { navigate() }, [])

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  const currentPath = selected ?? result?.path ?? null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-background border border-border w-[520px] max-h-[480px] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Select Folder</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">x</button>
        </div>

        {/* Current path breadcrumb */}
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <p className="text-[12px] text-muted-foreground font-mono truncate">
            {result?.path ?? 'Select a drive or root folder'}
          </p>
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-[13px] text-muted-foreground">Loading...</div>
          )}
          {error && (
            <div className="px-4 py-6 text-[13px] text-destructive">{error}</div>
          )}
          {!loading && !error && result && (
            <ul>
              {result.parent !== null && (
                <li>
                  <button
                    onClick={() => navigate(result.parent!)}
                    className="w-full text-left px-4 py-2 text-[13px] hover:bg-accent flex items-center gap-2 text-muted-foreground"
                  >
                    <span>../</span>
                    <span className="font-mono text-[11px]">{result.parent}</span>
                  </button>
                </li>
              )}
              {result.entries.length === 0 && (
                <li className="px-4 py-3 text-[13px] text-muted-foreground">No subfolders</li>
              )}
              {result.entries.map(entry => (
                <li key={entry.path}>
                  <button
                    onClick={() => {
                      setSelected(entry.path)
                      navigate(entry.path)
                    }}
                    className={`w-full text-left px-4 py-2 text-[13px] hover:bg-accent flex items-center gap-2 ${selected === entry.path ? 'bg-accent' : ''}`}
                  >
                    <span className="text-muted-foreground">+</span>
                    <span>{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted-foreground truncate flex-1">
            {currentPath ? currentPath : 'No folder selected'}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="h-8 px-3 text-[13px] border border-border hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => currentPath && onSelect(currentPath)}
              disabled={!currentPath}
              className="h-8 px-3 text-[13px] bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[oklch(0.145_0_0)]"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SetupPage() {
  const { session, refreshSession } = useSession()
  const [searchParams] = useSearchParams()
  const isNewProject = searchParams.get('new') === '1'
  const navigate = useNavigate()

  // When creating a new project, don't pre-fill from the active session
  const [name, setName] = useState(isNewProject ? '' : (session?.name ?? ''))
  const [path, setPath] = useState(isNewProject ? '' : (session?.projectPath ?? ''))
  const [accountId, setAccountId] = useState(isNewProject ? '' : (session?.gtmConfig?.accountId ?? ''))
  const [containerId, setContainerId] = useState(isNewProject ? '' : (session?.gtmConfig?.containerId ?? ''))
  const [validating, setValidating] = useState(false)
  const [pathError, setPathError] = useState<string | null>(null)
  const [pathValid, setPathValid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showWelcome, setShowWelcome] = useState(!hasSeenWelcome() && !session)

  // GTM auth state (CLI path)
  const [cliInstalling, setCliInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [authPolling, setAuthPolling] = useState(false)
  const [authSessionId, setAuthSessionId] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // GTM auth state (Windows OAuth path) — pre-fill from saved session credentials
  const [oauthClientId, setOauthClientId] = useState(isNewProject ? '' : (session?.oauthCredentials?.clientId ?? ''))
  const [oauthClientSecret, setOauthClientSecret] = useState(isNewProject ? '' : (session?.oauthCredentials?.clientSecret ?? ''))
  const [oauthStateId, setOauthStateId] = useState<string | null>(null)
  const [oauthPolling, setOauthPolling] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [oauthManualUrl, setOauthManualUrl] = useState('')
  const [oauthManualSubmitting, setOauthManualSubmitting] = useState(false)
  const [oauthSubmitEmail, setOauthSubmitEmail] = useState<string | null>(null)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync OAuth credentials from session when it loads
  useEffect(() => {
    if (isNewProject) return
    if (session?.oauthCredentials?.clientId && !oauthClientId) {
      setOauthClientId(session.oauthCredentials.clientId)
    }
    if (session?.oauthCredentials?.clientSecret && !oauthClientSecret) {
      setOauthClientSecret(session.oauthCredentials.clientSecret)
    }
  }, [session?.oauthCredentials?.clientId, session?.oauthCredentials?.clientSecret, isNewProject])

  const gtmStatusQuery = useGtmStatus()
  const gtmStatus = gtmStatusQuery.data

  // Clean up poll intervals on unmount
  useEffect(() => {
    return () => {
      if (authPollRef.current) clearInterval(authPollRef.current)
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    }
  }, [])

  async function handleValidate() {
    setValidating(true)
    setPathError(null)
    setPathValid(false)
    try {
      const result = await api.validatePath(path)
      if (!result.valid) {
        setPathError(result.reason ?? 'Invalid path')
      } else {
        setPathValid(true)
      }
    } catch (err) {
      setPathError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  async function handleInstallCli() {
    setCliInstalling(true)
    setInstallError(null)
    try {
      await api.installGtmCli()
      await gtmStatusQuery.refetch()
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setCliInstalling(false)
    }
  }

  const pollAuth = (id: string) => {
    authPollRef.current = setInterval(async () => {
      try {
        const result = await api.pollGtmAuth(id)
        if (result.done) {
          if (authPollRef.current) clearInterval(authPollRef.current)
          setAuthPolling(false)
          setAuthSessionId(null)
          if (result.success) {
            gtmStatusQuery.refetch()
          } else {
            setAuthError(result.error || 'Authentication failed')
          }
        }
      } catch {
        if (authPollRef.current) clearInterval(authPollRef.current)
        setAuthPolling(false)
        setAuthSessionId(null)
        setAuthError('Lost connection to server')
      }
    }, 2000)
  }

  async function handleStartAuth() {
    setAuthError(null)
    setAuthPolling(true)
    try {
      const { id } = await api.startGtmAuth()
      setAuthSessionId(id)
      pollAuth(id)
    } catch (err) {
      setAuthPolling(false)
      setAuthError(err instanceof Error ? err.message : 'Failed to start authentication')
    }
  }

  async function handleStartOAuth() {
    if (!session?.id || !oauthClientId || !oauthClientSecret) return
    setOauthError(null)
    setOauthPolling(true)
    try {
      const { authUrl, stateId } = await api.startGtmOAuth(session.id, oauthClientId, oauthClientSecret)
      setOauthStateId(stateId)
      window.open(authUrl, '_blank')
      oauthPollRef.current = setInterval(async () => {
        try {
          const result = await api.pollGtmOAuth(stateId)
          if (result.done) {
            if (oauthPollRef.current) clearInterval(oauthPollRef.current)
            setOauthPolling(false)
            setOauthStateId(null)
            if (result.success) {
              gtmStatusQuery.refetch()
            } else {
              setOauthError(result.error || 'Authentication failed')
            }
          }
        } catch {
          if (oauthPollRef.current) clearInterval(oauthPollRef.current)
          setOauthPolling(false)
          setOauthError('Lost connection to server')
        }
      }, 2000)
    } catch (err) {
      setOauthPolling(false)
      setOauthError(err instanceof Error ? err.message : 'Failed to start OAuth flow')
    }
  }

  async function handleManualCallback() {
    if (!oauthManualUrl || !session?.id) return
    // Use typed credentials if filled, fall back to what's saved in the session
    const clientId = oauthClientId || session.oauthCredentials?.clientId || ''
    const clientSecret = oauthClientSecret || session.oauthCredentials?.clientSecret || ''
    if (!clientId || !clientSecret) {
      setOauthError('Enter Client ID and Client Secret above before submitting.')
      return
    }
    setOauthManualSubmitting(true)
    setOauthError(null)
    try {
      const result = await api.submitOAuthManualCallback(oauthManualUrl, clientId, clientSecret, session.id)
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
      setOauthPolling(false)
      setOauthStateId(null)
      setOauthManualUrl('')
      setOauthSubmitEmail(result.email)
      gtmStatusQuery.refetch()
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to complete authentication')
    } finally {
      setOauthManualSubmitting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.createOrUpdateSession({
        projectPath: path,
        gtmConfig: accountId && containerId ? { accountId, containerId } : null,
        name: name.trim() || undefined,
        forceNew: isNewProject,
      })
      await refreshSession()
      navigate('/audit')
    } catch (err) {
      console.error('Failed to save session:', err)
    } finally {
      setSaving(false)
    }
  }

  const isReadyToStart =
    pathValid &&
    !!accountId &&
    !!containerId &&
    !!gtmStatus?.authenticated

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      {showWelcome && (
        <WelcomeOverlay onDismiss={() => setShowWelcome(false)} />
      )}

      {showBrowser && (
        <FolderBrowser
          onSelect={(selected) => {
            setPath(selected)
            setPathError(null)
            setPathValid(true)
            setShowBrowser(false)
            // Auto-suggest name from selected folder if not already set
            if (!name) {
              const suggested = selected.split(/[\\/]/).filter(Boolean).pop() ?? ''
              if (suggested) setName(suggested)
            }
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold">{isNewProject ? 'New Project' : 'Setup'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isNewProject
            ? 'Set up a new website project. Each project runs the full pipeline independently.'
            : 'Configure your project path and optional GTM credentials to begin the pipeline.'}
        </p>
      </div>

      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Project Name</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">A display name for this project. Auto-suggested from the folder name.</p>
        </div>
        <div className="px-4 py-4">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Acme Corp Website"
            className="w-full h-10 border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Project Path</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Absolute path to the local codebase you want to instrument.</p>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={path}
              onChange={e => {
                const v = e.target.value
                setPath(v)
                setPathValid(false)
                setPathError(null)
                // Auto-suggest name from folder
                if (!name) {
                  const suggested = v.split(/[\\/]/).filter(Boolean).pop() ?? ''
                  if (suggested) setName(suggested)
                }
              }}
              placeholder="/Users/you/projects/my-app"
              className="flex-1 h-10 border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => setShowBrowser(true)}
              className="h-10 px-4 text-sm font-medium border border-border bg-background hover:bg-accent transition-colors"
            >
              Browse
            </button>
            <button
              onClick={handleValidate}
              disabled={!path || validating}
              className="h-10 px-4 text-sm font-medium border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {validating ? 'Checking...' : 'Validate'}
            </button>
          </div>
          {pathError && (
            <p className="text-sm text-destructive">{pathError}</p>
          )}
          {pathValid && !pathError && (
            <p className="text-sm text-green-600">Path is valid</p>
          )}
        </div>
      </div>

      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Google Tag Manager Config (Optional)</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Required for GTM Setup and Implementation steps. Can be added later.</p>
        </div>
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium">GTM Account ID</label>
            <input
              type="text"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              placeholder="123456789"
              className="h-10 border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium">GTM Container ID</label>
            <input
              type="text"
              value={containerId}
              onChange={e => setContainerId(e.target.value)}
              placeholder="GTM-XXXXXXX"
              className="h-10 border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Section 3: GTM Authentication */}
      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">GTM Authentication</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Sign in with Google to allow GTM access for this project.
          </p>
        </div>
        <div className="px-4 py-4 flex flex-col gap-4">

          {gtmStatusQuery.isLoading && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              <span>Detecting platform...</span>
            </div>
          )}

          {!gtmStatusQuery.isLoading && !gtmStatus && (
            <p className="text-[13px] text-muted-foreground">Could not check GTM status.</p>
          )}

          {/* Platform method badge */}
          {gtmStatus && (
            <div className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Auth method</span>
              <span className="text-[12px] font-mono font-medium">
                {gtmStatus.requiresOAuthCredentials ? 'GTM API via OAuth (Windows)' : `GTM CLI — @owntag/gtm-cli (${gtmStatus.platform ?? 'Mac/Linux'})`}
              </span>
            </div>
          )}

          {/* Windows path - GTM API via OAuth */}
          {gtmStatus && gtmStatus.requiresOAuthCredentials && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-muted-foreground">
                Windows uses the GTM REST API directly. You need a Google Cloud OAuth 2.0 app with the Tag Manager API enabled.{' '}
                <a
                  href="https://developers.google.com/tag-platform/tag-manager/api/v2/authorization"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-primary hover:opacity-80"
                >
                  How to create OAuth credentials
                </a>
              </p>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium">Client ID</label>
                  <input
                    type="text"
                    value={oauthClientId}
                    onChange={e => setOauthClientId(e.target.value)}
                    placeholder="xxxxxxxx.apps.googleusercontent.com"
                    className="h-10 border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium">Client Secret</label>
                  <input
                    type="text"
                    value={oauthClientSecret}
                    onChange={e => setOauthClientSecret(e.target.value)}
                    placeholder="Your client secret"
                    className="h-10 border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {gtmStatus.authenticated && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[oklch(0.4_0.1_150)] shrink-0" />
                  <span className="text-[13px] font-medium text-[oklch(0.4_0.1_150)]">
                    Authenticated{gtmStatus.account ? ` as ${gtmStatus.account}` : ''}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {oauthError && (
                  <p className="text-[12px] text-destructive">{oauthError}</p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleStartOAuth}
                    disabled={!oauthClientId || !oauthClientSecret || oauthPolling}
                    className="h-8 px-3 text-[12px] font-medium border border-border hover:bg-accent transition-colors self-start disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {gtmStatus.authenticated ? 'Re-authenticate' : 'Login with Google'}
                  </button>
                  {oauthPolling && (
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Waiting for sign-in...</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] text-muted-foreground">
                    After sign-in, copy the full redirect URL from your browser and paste it here.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={oauthManualUrl}
                      onChange={e => { setOauthManualUrl(e.target.value); setOauthSubmitEmail(null) }}
                      placeholder="http://localhost:4242/api/gtm/oauth-callback?code=..."
                      className="flex-1 h-9 border border-input bg-background px-3 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={handleManualCallback}
                      disabled={!oauthManualUrl || oauthManualSubmitting}
                      className="h-9 px-3 text-[12px] font-medium border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {oauthManualSubmitting ? 'Verifying...' : 'Submit'}
                    </button>
                  </div>
                  {oauthSubmitEmail && (
                    <div className="flex items-center gap-2 mt-1">
                      <CheckCircle2 size={13} className="text-[oklch(0.4_0.1_150)] shrink-0" />
                      <span className="text-[12px] font-medium text-[oklch(0.4_0.1_150)]">Token saved — authenticated as {oauthSubmitEmail}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mac/Linux/Darwin path - GTM CLI */}
          {gtmStatus && !gtmStatus.requiresOAuthCredentials && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-muted-foreground">
                Mac and Linux use the <span className="font-mono text-[12px]">@owntag/gtm-cli</span> to authenticate and manage GTM resources directly from the terminal.
              </p>

              {/* Step 1: Install CLI */}
              {!gtmStatus.cliInstalled && (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-medium">Step 1 — Install GTM CLI</p>
                  {installError && (
                    <p className="text-[12px] text-destructive">{installError}</p>
                  )}
                  <button
                    onClick={handleInstallCli}
                    disabled={cliInstalling}
                    className="h-8 px-3 text-[12px] font-medium border border-border hover:bg-accent transition-colors flex items-center gap-1.5 self-start disabled:opacity-50"
                  >
                    {cliInstalling && <Loader2 size={11} className="animate-spin" />}
                    {cliInstalling ? 'Installing...' : 'Install @owntag/gtm-cli'}
                  </button>
                </div>
              )}

              {/* Step 2: Sign in */}
              {gtmStatus.cliInstalled && !gtmStatus.authenticated && (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] font-medium">Step 2 — Sign in with Google</p>
                  <p className="text-[12px] text-muted-foreground">Opens a browser window to complete Google sign-in.</p>
                  {authPolling ? (
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Loader2 size={13} className="animate-spin" />
                      <span>Waiting for browser sign-in...</span>
                    </div>
                  ) : (
                    <>
                      {authError && (
                        <p className="text-[12px] text-destructive">{authError}</p>
                      )}
                      <button
                        onClick={handleStartAuth}
                        className="h-8 px-3 text-[12px] font-medium border border-border hover:bg-accent transition-colors self-start"
                      >
                        Login with Google
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Authenticated */}
              {gtmStatus.cliInstalled && gtmStatus.authenticated && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[oklch(0.4_0.1_150)] shrink-0" />
                  <span className="text-[13px] font-medium text-[oklch(0.4_0.1_150)]">
                    Authenticated{gtmStatus.account ? ` as ${gtmStatus.account}` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Live GTM connection health */}
          {session?.id && gtmStatus?.authenticated && (
            <GtmAuthBanner sessionId={session.id} />
          )}

        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {!isReadyToStart && (
          <p className="text-[12px] text-muted-foreground">Complete all sections above to continue</p>
        )}
        <button
          onClick={handleSave}
          disabled={!path || saving}
          className="h-10 px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save and Continue'}
        </button>
      </div>
    </div>
  )
}
