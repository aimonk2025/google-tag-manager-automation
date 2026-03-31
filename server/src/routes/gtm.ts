import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { getDb, saveOAuthTokens, getOAuthTokens } from '../db.js';
import { readSession, updateSession } from '../session.js';
import { decrypt, isEncrypted } from '../crypto.js';

const router = Router();

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function getPlatform(): 'windows' | 'mac' | 'linux' {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

// ---------------------------------------------------------------------------
// googleapis lazy import helper — returns null if not installed
// ---------------------------------------------------------------------------

async function tryImportGoogleapis(): Promise<typeof import('googleapis') | null> {
  try {
    const mod = await import('googleapis');
    return mod;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/gtm/status - check if gtm cli is installed and authenticated
// ---------------------------------------------------------------------------

router.get('/status', (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string | undefined) ?? null;
  checkGtmStatus(sessionId).then((status) => {
    res.json(status);
  }).catch(() => {
    res.json({
      cliInstalled: false,
      authenticated: false,
      authMethod: null,
      account: null,
      platform: getPlatform(),
      requiresOAuthCredentials: getPlatform() === 'windows',
    });
  });
});

async function isGtmInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('gtm', ['--version'], {
      shell: process.platform === 'win32',
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => {
      // On Windows with shell:true, a missing command exits non-zero with "not recognized" in stderr
      const combined = stdout + stderr;
      if (code !== 0 && (combined.includes('not recognized') || combined.includes('not found') || combined.includes('No such file'))) {
        resolve(false);
      } else {
        resolve(code === 0);
      }
    });
  });
}

async function checkGtmStatus(sessionId?: string | null): Promise<{
  cliInstalled: boolean;
  authenticated: boolean;
  authMethod: 'cli' | 'oauth_api' | null;
  account: string | null;
  platform: 'windows' | 'mac' | 'linux';
  requiresOAuthCredentials: boolean;
}> {
  const platform = getPlatform();

  if (platform === 'windows') {
    // On Windows: skip CLI entirely, check oauth_tokens table
    const activeSessionId = sessionId ?? readSession()?.id ?? null;
    let authenticated = false;
    let account: string | null = null;

    if (activeSessionId) {
      try {
        const tokens = getOAuthTokens(activeSessionId);
        if (tokens) {
          // Authenticated if we have a refresh_token (googleapis auto-renews)
          // or a non-expired access_token
          const hasRefreshToken = !!tokens.refresh_token;
          const accessTokenValid = tokens.access_token && (!tokens.expiry_date || tokens.expiry_date > Date.now());
          if (hasRefreshToken || accessTokenValid) {
            authenticated = true;
            account = tokens.email ?? null;
          }
        }
      } catch {
        authenticated = false;
      }
    }

    return {
      cliInstalled: false,
      authenticated,
      authMethod: authenticated ? 'oauth_api' : null,
      account,
      platform: 'windows',
      requiresOAuthCredentials: true,
    };
  }

  // Mac / Linux: use existing CLI flow
  const installed = await isGtmInstalled();
  if (!installed) {
    return {
      cliInstalled: false,
      authenticated: false,
      authMethod: null,
      account: null,
      platform,
      requiresOAuthCredentials: false,
    };
  }

  return new Promise((resolve) => {
    const proc = spawn('gtm', ['auth', 'status', '--output', 'json'], {
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', () => {
      resolve({ cliInstalled: true, authenticated: false, authMethod: null, account: null, platform, requiresOAuthCredentials: false });
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ cliInstalled: true, authenticated: false, authMethod: null, account: null, platform, requiresOAuthCredentials: false });
        return;
      }
      try {
        const data = JSON.parse(stdout) as Record<string, unknown>;
        resolve({
          cliInstalled: true,
          authenticated: Boolean(data.authenticated),
          authMethod: 'cli',
          account: (data.account as string) ?? (data.email as string) ?? null,
          platform,
          requiresOAuthCredentials: false,
        });
      } catch {
        const combined = stdout + stderr;
        const authenticated = combined.toLowerCase().includes('authenticated');
        resolve({ cliInstalled: true, authenticated, authMethod: authenticated ? 'cli' : null, account: null, platform, requiresOAuthCredentials: false });
      }
    });
  });
}

// POST /api/gtm/install - install @owntag/gtm-cli globally via npm
router.post('/install', (_req: Request, res: Response) => {
  const proc = spawn('npm', ['install', '-g', '@owntag/gtm-cli'], {
    shell: process.platform === 'win32',
  });

  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
  proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });

  proc.on('error', (err) => {
    res.status(500).json({ success: false, error: err.message });
  });

  proc.on('close', (code) => {
    if (code === 0) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: (stderr || stdout).trim().slice(0, 500) });
    }
  });
});

// POST /api/gtm/auth-start - spawn gtm auth login, let it open the browser and handle the callback on port 8085
// Returns a run ID. Poll GET /api/gtm/auth-status/:id to check if it completed.
const authSessions = new Map<string, { done: boolean; success: boolean; error: string | null }>();

router.post('/auth-start', (_req: Request, res: Response) => {
  const id = Math.random().toString(36).slice(2);
  authSessions.set(id, { done: false, success: false, error: null });

  // Spawn gtm auth login - it opens the browser itself and listens on localhost:8085 for the OAuth callback
  const proc = spawn('gtm', ['auth', 'login'], {
    shell: process.platform === 'win32',
    detached: false,
  });

  let stderr = '';
  proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

  proc.on('error', (err) => {
    authSessions.set(id, {
      done: true,
      success: false,
      error: err.message.includes('ENOENT') ? 'gtm CLI not installed' : err.message,
    });
  });

  proc.on('close', (code) => {
    if (code === 0) {
      authSessions.set(id, { done: true, success: true, error: null });
    } else {
      authSessions.set(id, {
        done: true,
        success: false,
        error: stderr.trim() || `gtm auth login exited with code ${code}`,
      });
    }
    // Clean up session after 5 minutes
    setTimeout(() => authSessions.delete(id), 5 * 60 * 1000);
  });

  res.json({ id });
});

// GET /api/gtm/auth-status/:id - poll whether the auth login process has completed
router.get('/auth-status/:id', (req: Request, res: Response) => {
  const session = authSessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Auth session not found' });
    return;
  }
  res.json(session);
});

// ---------------------------------------------------------------------------
// Windows OAuth2 endpoints
// ---------------------------------------------------------------------------

// In-memory map for pending OAuth flows: stateId -> { sessionId, clientId, clientSecret, done, success, error }
const pendingOAuthSessions = new Map<string, {
  sessionId: string;
  clientId: string;
  clientSecret: string;
  done: boolean;
  success: boolean;
  error: string | null;
}>();

const OAUTH_REDIRECT_URI = 'http://localhost:4242/api/gtm/oauth-callback';

// POST /api/gtm/oauth-start
// Body: { sessionId: string, clientId: string, clientSecret: string }
router.post('/oauth-start', async (req: Request, res: Response) => {
  const { sessionId, clientId, clientSecret } = req.body as {
    sessionId?: string;
    clientId?: string;
    clientSecret?: string;
  };

  if (!sessionId || !clientId || !clientSecret) {
    res.status(400).json({ error: 'missing_fields', message: 'sessionId, clientId, and clientSecret are required' });
    return;
  }

  const googleapis = await tryImportGoogleapis();
  if (!googleapis) {
    res.status(500).json({ error: 'googleapis_not_installed' });
    return;
  }

  // Save credentials to session (encrypted via updateSession)
  try {
    updateSession(sessionId, {
      oauthCredentials: { clientId, clientSecret },
    });
  } catch {
    // non-fatal, still proceed
  }

  const stateId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const oauth2Client = new googleapis.google.auth.OAuth2(clientId, clientSecret, OAUTH_REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
      'https://www.googleapis.com/auth/tagmanager.manage.accounts',
      'https://www.googleapis.com/auth/tagmanager.publish',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
    state: stateId,
  });

  pendingOAuthSessions.set(stateId, {
    sessionId,
    clientId,
    clientSecret,
    done: false,
    success: false,
    error: null,
  });

  // Clean up after 10 minutes if never completed
  setTimeout(() => pendingOAuthSessions.delete(stateId), 10 * 60 * 1000);

  res.json({ authUrl, stateId });
});

// GET /api/gtm/oauth-callback
// Redirect URI that Google calls after user consents
router.get('/oauth-callback', async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (oauthError) {
    const friendlyError = mapOAuthError(oauthError);
    res.status(400).send(buildOAuthResultHtml(false, friendlyError));
    return;
  }

  if (!state || !code) {
    res.status(400).send(buildOAuthResultHtml(false, 'Missing code or state parameter'));
    return;
  }

  const pending = pendingOAuthSessions.get(state);
  if (!pending) {
    res.status(400).send(buildOAuthResultHtml(false, 'Unknown or expired state. Please start authentication again.'));
    return;
  }

  const googleapis = await tryImportGoogleapis();
  if (!googleapis) {
    pendingOAuthSessions.set(state, { ...pending, done: true, success: false, error: 'googleapis_not_installed' });
    res.status(500).send(buildOAuthResultHtml(false, 'googleapis package is not installed on the server'));
    return;
  }

  try {
    const oauth2Client = new googleapis.google.auth.OAuth2(pending.clientId, pending.clientSecret, OAUTH_REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    let email: string | null = null;
    try {
      const oauth2Api = googleapis.google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfoRes = await oauth2Api.userinfo.get();
      email = userInfoRes.data.email ?? null;
    } catch {
      // email is non-critical
    }

    // Persist tokens
    saveOAuthTokens(pending.sessionId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: typeof tokens.expiry_date === 'number' ? tokens.expiry_date : null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      email,
    });

    pendingOAuthSessions.set(state, { ...pending, done: true, success: true, error: null });

    res.send(buildOAuthResultHtml(true, null));
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const friendlyMsg = mapOAuthError(rawMsg);
    pendingOAuthSessions.set(state, { ...pending, done: true, success: false, error: friendlyMsg });
    res.status(500).send(buildOAuthResultHtml(false, friendlyMsg));
  }
});

function mapOAuthError(error: string): string {
  const e = error.toLowerCase();
  if (e.includes('invalid_grant') || e.includes('invalid grant')) {
    return 'Authorization code expired. Google codes expire in ~10 minutes. Please click "Try Again" to restart the authentication flow.';
  }
  if (e.includes('invalid_client') || e.includes('invalid client')) {
    return 'Invalid Client Secret. Check that you copied the Client Secret correctly from Google Cloud Console. It should start with "GOCSPX-".';
  }
  if (e.includes('redirect_uri_mismatch') || e.includes('redirect uri')) {
    return 'Redirect URI mismatch. In Google Cloud Console, ensure your OAuth app has exactly this URI added: http://localhost:4242/api/gtm/oauth-callback';
  }
  if (e.includes('access_denied') || e.includes('access denied')) {
    return 'Access denied. You declined the permission request. Please try again and click "Allow" to grant access.';
  }
  if (e.includes('scope') || e.includes('insufficient')) {
    return 'Insufficient permissions. Ensure your Google Cloud project has the Tag Manager API enabled and the OAuth scopes include tagmanager.edit.containers.';
  }
  return error;
}

function buildOAuthResultHtml(success: boolean, errorMsg: string | null): string {
  if (success) {
    return `<html><body><script>window.close()</script><p>Authentication successful. You can close this tab.</p></body></html>`;
  }
  return `<html><body style="font-family:sans-serif;padding:20px"><h3>Authentication Failed</h3><p>${errorMsg ?? 'Unknown error'}</p><p>You can close this tab and try again in the app.</p></body></html>`;
}

// GET /api/gtm/oauth-poll/:stateId
// Returns { done, success, error } from the pending OAuth map
router.get('/oauth-poll/:stateId', (req: Request, res: Response) => {
  const pending = pendingOAuthSessions.get(req.params.stateId);
  if (!pending) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'OAuth session not found or expired' });
    return;
  }
  res.json({ done: pending.done, success: pending.success, error: pending.error });
});

// POST /api/gtm/oauth-manual-callback
// Accepts the full redirect URL pasted by the user after completing Google auth in browser.
// Body: { redirectUrl: string, clientId: string, clientSecret: string, sessionId: string }
// stateId is optional - extracted from URL if present, otherwise skipped.
router.post('/oauth-manual-callback', async (req: Request, res: Response) => {
  const { redirectUrl, clientId, clientSecret, sessionId } = req.body as {
    redirectUrl?: string;
    clientId?: string;
    clientSecret?: string;
    sessionId?: string;
  };

  if (!redirectUrl || !clientId || !clientSecret || !sessionId) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'redirectUrl, clientId, clientSecret, and sessionId are required' });
    return;
  }

  // Parse code from the pasted URL — ignore state entirely, no pending session needed
  let code: string | null = null;
  try {
    const parsed = new URL(redirectUrl);
    code = parsed.searchParams.get('code');
    // Also support if user pasted just the code itself (not a full URL)
    if (!code && !redirectUrl.startsWith('http')) {
      code = redirectUrl.trim();
    }
  } catch {
    // URL parse failed — treat the whole value as a raw code
    code = redirectUrl.trim();
  }

  if (!code) {
    res.status(400).json({ error: 'MISSING_CODE', message: 'No authorization code found in the URL.' });
    return;
  }

  const googleapis = await tryImportGoogleapis();
  if (!googleapis) {
    res.status(500).json({ error: 'googleapis_not_installed' });
    return;
  }

  try {
    const oauth2Client = new googleapis.google.auth.OAuth2(clientId, clientSecret, OAUTH_REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let email: string | null = null;
    try {
      const oauth2Api = googleapis.google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfoRes = await oauth2Api.userinfo.get();
      email = userInfoRes.data.email ?? null;
    } catch { /* email non-critical */ }

    saveOAuthTokens(sessionId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: typeof tokens.expiry_date === 'number' ? tokens.expiry_date : null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      email,
    });

    res.json({ success: true, email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'TOKEN_EXCHANGE_FAILED', message: msg });
  }
});

// ---------------------------------------------------------------------------
// Container data types
// ---------------------------------------------------------------------------

interface ContainerTag {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused';
  firingTriggerIds: string[];
}

interface ContainerTrigger {
  id: string;
  name: string;
  type: string;
  condition?: string;
}

interface ContainerVariable {
  id: string;
  name: string;
  type: string;
  value?: string;
}

interface ContainerSummary {
  accountId: string;
  containerId: string;
  containerName: string;
  totalTags: number;
  totalTriggers: number;
  totalVariables: number;
  lastPublished: string | null;
}

interface ContainerDataResponse {
  containerSummary: ContainerSummary;
  tags: ContainerTag[];
  triggers: ContainerTrigger[];
  variables: ContainerVariable[];
  fetchedAt: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Container data helpers
// ---------------------------------------------------------------------------

function spawnCommand(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        resolve({ stdout, stderr, code: null });
      }
    }, timeoutMs);

    proc.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, code: -1 });
      }
    });

    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      }
    });
  });
}

function parseTags(raw: unknown): ContainerTag[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).tags ?? (raw as Record<string, unknown>).items ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.map((t: Record<string, unknown>) => ({
    id: String(t.tagId ?? t.id ?? ''),
    name: String(t.name ?? ''),
    type: String(t.type ?? ''),
    status: (t.paused || t.status === 'paused') ? 'paused' : 'active',
    firingTriggerIds: Array.isArray(t.firingTriggerId)
      ? (t.firingTriggerId as unknown[]).map(String)
      : Array.isArray(t.firingTriggerIds)
        ? (t.firingTriggerIds as unknown[]).map(String)
        : [],
  }));
}

function parseTriggers(raw: unknown): ContainerTrigger[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).triggers ?? (raw as Record<string, unknown>).items ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.map((t: Record<string, unknown>) => ({
    id: String(t.triggerId ?? t.id ?? ''),
    name: String(t.name ?? ''),
    type: String(t.type ?? ''),
    condition: t.condition !== undefined ? String(t.condition) : undefined,
  }));
}

function parseVariables(raw: unknown): ContainerVariable[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).variables ?? (raw as Record<string, unknown>).items ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.map((v: Record<string, unknown>) => ({
    id: String(v.variableId ?? v.id ?? ''),
    name: String(v.name ?? ''),
    type: String(v.type ?? ''),
    value: v.value !== undefined ? String(v.value) : undefined,
  }));
}

function getSessionGtmConfig(sessionId: string): { accountId: string; containerId: string } | null {
  try {
    const db = getDb();
    const row = db.prepare('SELECT gtm_account_id, gtm_container_id FROM sessions WHERE id = ?').get(sessionId) as
      | { gtm_account_id: string | null; gtm_container_id: string | null }
      | undefined;

    if (!row || !row.gtm_account_id) return null;

    const accountId = isEncrypted(row.gtm_account_id) ? decrypt(row.gtm_account_id) : row.gtm_account_id;
    const rawContainerId = row.gtm_container_id ?? '';
    const containerId = rawContainerId && isEncrypted(rawContainerId) ? decrypt(rawContainerId) : rawContainerId;

    return { accountId, containerId };
  } catch {
    return null;
  }
}

function getSessionOAuthCredentials(sessionId: string): { clientId: string; clientSecret: string } | null {
  try {
    const db = getDb();
    const row = db.prepare('SELECT google_client_id, google_client_secret FROM sessions WHERE id = ?').get(sessionId) as
      | { google_client_id: string | null; google_client_secret: string | null }
      | undefined;

    if (!row || !row.google_client_id) return null;

    const clientId = isEncrypted(row.google_client_id) ? decrypt(row.google_client_id) : row.google_client_id;
    const rawSecret = row.google_client_secret ?? '';
    const clientSecret = rawSecret && isEncrypted(rawSecret) ? decrypt(rawSecret) : rawSecret;

    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Windows OAuth2 GTM API fetch
// ---------------------------------------------------------------------------

async function fetchContainerDataViaApi(
  sessionId: string,
  accountId: string,
  containerId: string,
): Promise<ContainerDataResponse> {
  const fetchedAt = new Date().toISOString();

  const notAuthResponse = (): ContainerDataResponse => ({
    containerSummary: {
      accountId,
      containerId,
      containerName: containerId,
      totalTags: 0,
      totalTriggers: 0,
      totalVariables: 0,
      lastPublished: null,
    },
    tags: [],
    triggers: [],
    variables: [],
    fetchedAt,
    error: 'not_authenticated',
  });

  const googleapis = await tryImportGoogleapis();
  if (!googleapis) {
    return { ...notAuthResponse(), error: 'googleapis_not_installed' };
  }

  const tokens = getOAuthTokens(sessionId);
  if (!tokens || !tokens.access_token) {
    return notAuthResponse();
  }

  const creds = getSessionOAuthCredentials(sessionId);
  if (!creds) {
    return notAuthResponse();
  }

  const oauth2Client = new googleapis.google.auth.OAuth2(creds.clientId, creds.clientSecret, OAUTH_REDIRECT_URI);
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
  });

  // Auto-save refreshed tokens
  oauth2Client.on('tokens', (newTokens) => {
    saveOAuthTokens(sessionId, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: typeof newTokens.expiry_date === 'number' ? newTokens.expiry_date : tokens.expiry_date,
      scope: newTokens.scope ?? tokens.scope,
      token_type: newTokens.token_type ?? tokens.token_type,
      email: tokens.email,
    });
  });

  const tagmanager = googleapis.google.tagmanager({ version: 'v2', auth: oauth2Client });

  // GTM API v2 requires a numeric container ID, not the public GTM-XXXXXXX tag ID.
  // If the stored containerId looks like GTM-XXXXX, resolve it to the numeric ID first.
  let numericContainerId = containerId;
  const isPublicId = /^GTM-/i.test(containerId);
  let containerName = containerId;

  if (isPublicId) {
    try {
      const containersRes = await tagmanager.accounts.containers.list({
        parent: `accounts/${accountId}`,
      });
      const match = (containersRes.data.container ?? []).find(
        (c) => c.publicId?.toUpperCase() === containerId.toUpperCase()
      );
      if (match?.containerId) {
        numericContainerId = String(match.containerId);
        containerName = match.name ?? containerId;
      }
    } catch {
      // If listing fails, attempt to use the public ID directly and let the API surface the error
    }
  }

  // Discover the first available workspace (usually Default Workspace)
  let workspaceId = '1';
  try {
    const wsRes = await tagmanager.accounts.containers.workspaces.list({
      parent: `accounts/${accountId}/containers/${numericContainerId}`,
    });
    const firstWs = wsRes.data.workspace?.[0];
    if (firstWs?.workspaceId) {
      workspaceId = String(firstWs.workspaceId);
    }
  } catch {
    // fall back to workspace 1
  }

  const parent = `accounts/${accountId}/containers/${numericContainerId}/workspaces/${workspaceId}`;

  const errors: string[] = [];
  let tags: ContainerTag[] = [];
  let triggers: ContainerTrigger[] = [];
  let variables: ContainerVariable[] = [];

  // Fetch tags
  try {
    const tagsRes = await tagmanager.accounts.containers.workspaces.tags.list({ parent });
    const rawTags = tagsRes.data.tag ?? [];
    tags = rawTags.map((t) => ({
      id: String(t.tagId ?? ''),
      name: String(t.name ?? ''),
      type: String(t.type ?? ''),
      status: t.paused ? 'paused' : 'active',
      firingTriggerIds: (t.firingTriggerId ?? []).map(String),
    }));
  } catch (err) {
    errors.push(`tags fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fetch triggers
  try {
    const triggersRes = await tagmanager.accounts.containers.workspaces.triggers.list({ parent });
    const rawTriggers = triggersRes.data.trigger ?? [];
    triggers = rawTriggers.map((t) => ({
      id: String(t.triggerId ?? ''),
      name: String(t.name ?? ''),
      type: String(t.type ?? ''),
      condition: t.filter ? JSON.stringify(t.filter) : undefined,
    }));
  } catch (err) {
    errors.push(`triggers fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fetch variables
  try {
    const variablesRes = await tagmanager.accounts.containers.workspaces.variables.list({ parent });
    const rawVariables = variablesRes.data.variable ?? [];
    variables = rawVariables.map((v) => ({
      id: String(v.variableId ?? ''),
      name: String(v.name ?? ''),
      type: String(v.type ?? ''),
      value: v.parameter ? JSON.stringify(v.parameter) : undefined,
    }));
  } catch (err) {
    errors.push(`variables fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const response: ContainerDataResponse = {
    containerSummary: {
      accountId,
      containerId,
      containerName,
      totalTags: tags.length,
      totalTriggers: triggers.length,
      totalVariables: variables.length,
      lastPublished: null,
    },
    tags,
    triggers,
    variables,
    fetchedAt,
  };

  if (errors.length > 0) {
    response.error = errors.join('; ');
  }

  return response;
}

// ---------------------------------------------------------------------------
// CLI-based fetch (Mac/Linux)
// ---------------------------------------------------------------------------

async function fetchContainerDataViaCli(sessionId: string, accountId: string, containerId: string): Promise<ContainerDataResponse> {
  const fetchedAt = new Date().toISOString();

  // Check auth first
  const authResult = await spawnCommand('gtm', ['auth', 'status', '--output', 'json'], 10000);
  let authenticated = false;
  try {
    const authData = JSON.parse(authResult.stdout) as Record<string, unknown>;
    authenticated = Boolean(authData.authenticated);
  } catch {
    const combined = authResult.stdout + authResult.stderr;
    authenticated = combined.toLowerCase().includes('authenticated');
  }

  if (!authenticated) {
    return {
      containerSummary: {
        accountId,
        containerId,
        containerName: containerId,
        totalTags: 0,
        totalTriggers: 0,
        totalVariables: 0,
        lastPublished: null,
      },
      tags: [],
      triggers: [],
      variables: [],
      fetchedAt,
      error: 'not_authenticated',
    };
  }

  // Fetch tags, triggers, variables in parallel
  const baseArgs = ['--account', accountId, '--container', containerId, '--output', 'json'];
  const [tagsResult, triggersResult, variablesResult] = await Promise.all([
    spawnCommand('gtm', ['tags', 'list', ...baseArgs], 10000),
    spawnCommand('gtm', ['triggers', 'list', ...baseArgs], 10000),
    spawnCommand('gtm', ['variables', 'list', ...baseArgs], 10000),
  ]);

  let tags: ContainerTag[] = [];
  let triggers: ContainerTrigger[] = [];
  let variables: ContainerVariable[] = [];
  const errors: string[] = [];

  // Parse tags
  try {
    const parsed = JSON.parse(tagsResult.stdout);
    tags = parseTags(parsed);
  } catch {
    if (tagsResult.code === null) {
      errors.push('tags fetch timed out');
    } else if (tagsResult.code !== 0) {
      errors.push('tags fetch failed');
    } else {
      errors.push('tags response was not valid JSON');
    }
  }

  // Parse triggers
  try {
    const parsed = JSON.parse(triggersResult.stdout);
    triggers = parseTriggers(parsed);
  } catch {
    if (triggersResult.code === null) {
      errors.push('triggers fetch timed out');
    } else if (triggersResult.code !== 0) {
      errors.push('triggers fetch failed');
    } else {
      errors.push('triggers response was not valid JSON');
    }
  }

  // Parse variables
  try {
    const parsed = JSON.parse(variablesResult.stdout);
    variables = parseVariables(parsed);
  } catch {
    if (variablesResult.code === null) {
      errors.push('variables fetch timed out');
    } else if (variablesResult.code !== 0) {
      errors.push('variables fetch failed');
    } else {
      errors.push('variables response was not valid JSON');
    }
  }

  // Derive container name from metadata if available in the raw tags payload
  let containerName = containerId;
  try {
    const rawTags = JSON.parse(tagsResult.stdout) as Record<string, unknown>;
    const meta = rawTags.container ?? rawTags.metadata;
    if (meta && typeof meta === 'object') {
      const metaObj = meta as Record<string, unknown>;
      containerName = String(metaObj.name ?? metaObj.containerName ?? containerId);
    }
  } catch {
    // leave containerName as containerId
  }

  const response: ContainerDataResponse = {
    containerSummary: {
      accountId,
      containerId,
      containerName,
      totalTags: tags.length,
      totalTriggers: triggers.length,
      totalVariables: variables.length,
      lastPublished: null,
    },
    tags,
    triggers,
    variables,
    fetchedAt,
  };

  if (errors.length > 0) {
    response.error = errors.join('; ');
  }

  return response;
}

// ---------------------------------------------------------------------------
// Unified fetchContainerData - branches by platform
// ---------------------------------------------------------------------------

async function fetchContainerData(sessionId: string, accountId: string, containerId: string): Promise<ContainerDataResponse> {
  let data: ContainerDataResponse;

  if (getPlatform() === 'windows') {
    data = await fetchContainerDataViaApi(sessionId, accountId, containerId);
  } else {
    data = await fetchContainerDataViaCli(sessionId, accountId, containerId);
  }

  return data;
}

// ---------------------------------------------------------------------------
// GET /api/gtm/container-data?sessionId=<id>
// Cached: only hits GTM API once per 5 minutes to avoid quota exhaustion
// ---------------------------------------------------------------------------

const containerDataCache = new Map<string, { data: ContainerDataResponse; fetchedAt: number }>();
const CONTAINER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

router.get('/container-data', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (!sessionId) {
    res.json({ error: 'no_container' });
    return;
  }

  const gtmConfig = getSessionGtmConfig(sessionId);
  if (!gtmConfig || !gtmConfig.accountId) {
    res.json({ error: 'no_container' });
    return;
  }

  // Return cached data if within TTL
  const cached = containerDataCache.get(sessionId);
  if (cached && (Date.now() - cached.fetchedAt) < CONTAINER_CACHE_TTL_MS) {
    res.json(cached.data);
    return;
  }

  try {
    const data = await fetchContainerData(sessionId, gtmConfig.accountId, gtmConfig.containerId);
    if (data.error === 'not_authenticated') {
      res.json({ error: 'not_authenticated' });
      return;
    }
    containerDataCache.set(sessionId, { data, fetchedAt: Date.now() });
    res.json(data);
  } catch {
    res.json({ error: 'fetch_failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gtm/verify-implementation
// Fetches live GTM container counts and stores them in compactOutputs['gtm-implementation'].gtmResources
// Rate-limited: only hits GTM API once per 5 minutes per session, returns cached result otherwise
// ---------------------------------------------------------------------------

const verificationCache = new Map<string, { result: unknown; fetchedAt: number }>();
const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

router.post('/verify-implementation', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION' });
    return;
  }

  // Return cached result if within TTL - avoids hammering GTM API
  const cached = verificationCache.get(sessionId);
  if (cached && (Date.now() - cached.fetchedAt) < VERIFY_CACHE_TTL_MS) {
    res.json(cached.result);
    return;
  }

  const gtmConfig = getSessionGtmConfig(sessionId);
  if (!gtmConfig || !gtmConfig.accountId) {
    res.json({ verified: false, error: 'no_gtm_config' });
    return;
  }

  try {
    // Reuse fetchContainerData which handles public ID -> numeric ID resolution
    const data = await fetchContainerData(sessionId, gtmConfig.accountId, gtmConfig.containerId);

    // Container live counts (what exists in GTM right now)
    const containerCounts = {
      tagsFound: data.containerSummary.totalTags,
      triggersFound: data.containerSummary.totalTriggers,
      variablesFound: data.containerSummary.totalVariables,
      containerName: data.containerSummary.containerName,
      verifiedAt: data.fetchedAt,
      error: data.error ?? null,
    };

    // Merge into compactOutputs['gtm-implementation'] — preserve creation counts from Claude's summary
    const db = getDb();
    const row = db.prepare('SELECT compact_outputs FROM sessions WHERE id = ?').get(sessionId) as { compact_outputs: string } | undefined;
    const compact = row ? JSON.parse(row.compact_outputs || '{}') as Record<string, unknown> : {};
    const existing = (compact['gtm-implementation'] ?? {}) as Record<string, unknown>;
    // Preserve existing gtmResources (creation counts) under createdResources; store live counts separately
    const existingGtmResources = existing.gtmResources as Record<string, unknown> | undefined;
    const createdResources = existingGtmResources?.variablesCreated !== undefined
      ? existingGtmResources  // already has creation counts from Claude's summary
      : existing.createdResources as Record<string, unknown> | undefined;
    compact['gtm-implementation'] = {
      ...existing,
      containerCounts,
      gtmResources: containerCounts, // keep gtmResources for backwards compat with verify UI
      createdResources: createdResources ?? null,
    };
    db.prepare('UPDATE sessions SET compact_outputs = ? WHERE id = ?').run(JSON.stringify(compact), sessionId);

    const result = {
      verified: true,
      gtmResources: containerCounts,
      createdResources: createdResources ?? null,
    };
    verificationCache.set(sessionId, { result, fetchedAt: Date.now() });
    res.json(result);
  } catch (err) {
    const result = { verified: false, error: err instanceof Error ? err.message : String(err) };
    // Cache errors too - don't retry a failed call immediately
    verificationCache.set(sessionId, { result, fetchedAt: Date.now() });
    res.json(result);
  }
});

// ---------------------------------------------------------------------------
// GET /api/gtm/health-stream
// SSE endpoint that does a real lightweight GTM API ping and streams one health event.
// Classifies the result into: ok | auth_error | rate_limited | quota_exceeded | not_configured | unreachable
// ---------------------------------------------------------------------------

type HealthStatus = 'ok' | 'auth_error' | 'rate_limited' | 'quota_exceeded' | 'not_configured' | 'unreachable';

interface HealthEvent {
  status: HealthStatus;
  detail: string;
  retryAfter?: number; // seconds, present when rate_limited
  account?: string | null;
}

async function pingGtmHealth(sessionId: string): Promise<HealthEvent> {
  const platform = getPlatform();

  if (platform === 'windows') {
    // Windows: try to list accounts via googleapis - lightweight call
    const googleapis = await tryImportGoogleapis();
    if (!googleapis) {
      return { status: 'unreachable', detail: 'googleapis package is not installed' };
    }

    const tokens = getOAuthTokens(sessionId);
    if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
      return { status: 'auth_error', detail: 'No OAuth tokens found. Re-authenticate in Setup.' };
    }

    const creds = getSessionOAuthCredentials(sessionId);
    if (!creds) {
      return { status: 'auth_error', detail: 'OAuth credentials (Client ID/Secret) missing. Re-enter in Setup.' };
    }

    const oauth2Client = new googleapis.google.auth.OAuth2(creds.clientId, creds.clientSecret, OAUTH_REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
    });

    // Save refreshed tokens automatically
    oauth2Client.on('tokens', (newTokens) => {
      saveOAuthTokens(sessionId, {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
        expiry_date: typeof newTokens.expiry_date === 'number' ? newTokens.expiry_date : tokens.expiry_date,
        scope: newTokens.scope ?? tokens.scope,
        token_type: newTokens.token_type ?? tokens.token_type,
        email: tokens.email,
      });
    });

    const tagmanager = googleapis.google.tagmanager({ version: 'v2', auth: oauth2Client });

    try {
      const res = await tagmanager.accounts.list();
      const accountCount = res.data.account?.length ?? 0;
      return {
        status: 'ok',
        detail: `Connected. ${accountCount} GTM account${accountCount !== 1 ? 's' : ''} accessible.`,
        account: tokens.email ?? null,
      };
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; errors?: Array<{ domain?: string; reason?: string }> };
      const code = error.code;
      const message = error.message ?? String(err);
      const reason = error.errors?.[0]?.reason ?? '';

      if (code === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
        return { status: 'rate_limited', detail: `GTM API rate limit hit. ${message}`, retryAfter: 60 };
      }
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        return { status: 'quota_exceeded', detail: `GTM API quota exceeded. ${message}` };
      }
      if (code === 401 || reason === 'authError' || message.toLowerCase().includes('invalid_grant') || message.toLowerCase().includes('token has been expired')) {
        return { status: 'auth_error', detail: 'OAuth token expired or revoked. Re-authenticate in Setup.' };
      }
      if (code === 403 || reason === 'forbidden' || reason === 'insufficientPermissions') {
        return { status: 'auth_error', detail: 'Insufficient GTM permissions. Check OAuth scopes or GTM account access.' };
      }
      return { status: 'unreachable', detail: message.slice(0, 200) };
    }
  }

  // Mac/Linux: check auth status via CLI
  const installed = await isGtmInstalled();
  if (!installed) {
    return { status: 'not_configured', detail: 'gtm CLI is not installed. Run npm install -g @owntag/gtm-cli' };
  }

  const authResult = await spawnCommand('gtm', ['auth', 'status', '--output', 'json'], 8000);

  if (authResult.code === null) {
    return { status: 'unreachable', detail: 'gtm auth status check timed out' };
  }

  let authenticated = false;
  let account: string | null = null;
  try {
    const data = JSON.parse(authResult.stdout) as Record<string, unknown>;
    authenticated = Boolean(data.authenticated);
    account = (data.account as string) ?? (data.email as string) ?? null;
  } catch {
    const combined = authResult.stdout + authResult.stderr;
    authenticated = combined.toLowerCase().includes('authenticated');
  }

  if (!authenticated) {
    return { status: 'auth_error', detail: 'gtm CLI is not authenticated. Run "gtm auth login" or use the Setup screen.' };
  }

  return { status: 'ok', detail: 'GTM CLI authenticated and ready.', account };
}

router.get('/health-stream', async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string | undefined) ?? readSession()?.id ?? null;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event: HealthEvent) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (!sessionId) {
    send({ status: 'not_configured', detail: 'No active session. Create a project in Setup first.' });
    res.end();
    return;
  }

  try {
    const event = await pingGtmHealth(sessionId);
    send(event);
  } catch (err) {
    send({ status: 'unreachable', detail: err instanceof Error ? err.message : 'Unexpected error during GTM health check' });
  }

  res.end();
});

// ---------------------------------------------------------------------------
// GET /api/gtm/validate-credentials
// Validates GTM accountId + containerId by making a real API call.
// Returns { valid, containerName, error } so the Setup page can show a green checkmark.
// ---------------------------------------------------------------------------

router.get('/validate-credentials', async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string | undefined) ?? readSession()?.id ?? null;

  if (!sessionId) {
    res.status(400).json({ valid: false, error: 'No active session' });
    return;
  }

  const gtmCreds = getSessionGtmConfig(sessionId);
  if (!gtmCreds?.accountId || !gtmCreds.containerId) {
    res.json({ valid: false, error: 'GTM Account ID or Container ID not configured. Save them in Setup first.' });
    return;
  }

  const platform = getPlatform();

  if (platform === 'windows') {
    const googleapis = await tryImportGoogleapis();
    if (!googleapis) {
      res.json({ valid: false, error: 'googleapis package is not installed on the server' });
      return;
    }

    const tokens = getOAuthTokens(sessionId);
    if (!tokens?.refresh_token && !tokens?.access_token) {
      res.json({ valid: false, error: 'Not authenticated. Complete OAuth flow in Setup first.' });
      return;
    }

    const oauthCreds = getSessionOAuthCredentials(sessionId);
    if (!oauthCreds) {
      res.json({ valid: false, error: 'OAuth credentials missing. Re-enter Client ID and Secret in Setup.' });
      return;
    }

    try {
      const oauth2Client = new googleapis.google.auth.OAuth2(oauthCreds.clientId, oauthCreds.clientSecret, OAUTH_REDIRECT_URI);
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date ?? undefined,
      });

      const tagmanager = googleapis.google.tagmanager({ version: 'v2', auth: oauth2Client });
      const containerPath = `accounts/${gtmCreds.accountId}/containers/${gtmCreds.containerId}`;

      const resp = await tagmanager.accounts.containers.get({ path: containerPath });
      const containerName = resp.data.name ?? 'Unknown container';

      res.json({ valid: true, containerName });
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string };
      let message = error.message ?? String(err);
      if (error.code === 404) message = `Container not found. Check that Account ID "${gtmCreds.accountId}" and Container ID "${gtmCreds.containerId}" are correct.`;
      else if (error.code === 403) message = 'Access denied. Your Google account does not have access to this GTM container.';
      else if (error.code === 401) message = 'OAuth token expired. Re-authenticate in Setup.';
      res.json({ valid: false, error: message });
    }
  } else {
    // Mac/Linux: use gtm CLI to check
    const installed = await isGtmInstalled();
    if (!installed) {
      res.json({ valid: false, error: 'gtm CLI not installed. Run: npm install -g @owntag/gtm-cli' });
      return;
    }
    // Just do an auth status check — container validation on CLI requires a separate command
    const result = await spawnCommand('gtm', ['auth', 'status', '--output', 'json'], 8000);
    let authenticated = false;
    try {
      const data = JSON.parse(result.stdout) as Record<string, unknown>;
      authenticated = Boolean(data.authenticated);
    } catch {
      authenticated = (result.stdout + result.stderr).toLowerCase().includes('authenticated');
    }

    if (!authenticated) {
      res.json({ valid: false, error: 'Not authenticated. Run "gtm auth login" first.' });
      return;
    }

    res.json({ valid: true, containerName: `Container ${gtmCreds.containerId}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gtm/cleanup-dupes
// Detects and deletes duplicate snake_case GTM objects (tags, triggers, variables).
// A "dupe" is an object whose name matches the snake_case pattern (all lowercase after the prefix dash)
// AND a Title Case variant of the same name already exists in the same workspace.
// e.g. "GA4 - course_section_click" is a dupe if "GA4 - Course Section Click" also exists.
// ---------------------------------------------------------------------------

function toTitleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isDupeSnakeCase(name: string, allNames: Set<string>): boolean {
  // Match prefix patterns: "GA4 - xxx", "DLV - xxx", "CE - xxx"
  const match = name.match(/^(GA4|DLV|CE) - (.+)$/);
  if (!match) return false;
  const [, prefix, suffix] = match;
  // If the suffix contains underscores and is all lowercase (i.e. snake_case)
  if (!suffix.includes('_')) return false;
  if (suffix !== suffix.toLowerCase()) return false;
  // Check if a Title Case version exists
  const titleCaseVersion = `${prefix} - ${toTitleCase(suffix)}`;
  return allNames.has(titleCaseVersion);
}

router.post('/cleanup-dupes', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION' });
    return;
  }

  const gtmConfig = getSessionGtmConfig(sessionId);
  if (!gtmConfig || !gtmConfig.accountId) {
    res.status(400).json({ error: 'no_gtm_config' });
    return;
  }

  const googleapis = await tryImportGoogleapis();
  if (!googleapis) {
    res.status(500).json({ error: 'googleapis_not_installed' });
    return;
  }

  const tokens = getOAuthTokens(sessionId);
  if (!tokens || !tokens.access_token) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const creds = getSessionOAuthCredentials(sessionId);
  if (!creds) {
    res.status(401).json({ error: 'no_oauth_credentials' });
    return;
  }

  const oauth2Client = new googleapis.google.auth.OAuth2(creds.clientId, creds.clientSecret, OAUTH_REDIRECT_URI);
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
  });

  oauth2Client.on('tokens', (newTokens) => {
    saveOAuthTokens(sessionId, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: typeof newTokens.expiry_date === 'number' ? newTokens.expiry_date : tokens.expiry_date,
      scope: newTokens.scope ?? tokens.scope,
      token_type: newTokens.token_type ?? tokens.token_type,
      email: tokens.email,
    });
  });

  const tagmanager = googleapis.google.tagmanager({ version: 'v2', auth: oauth2Client });
  const { accountId, containerId } = gtmConfig;

  // Resolve numeric container ID
  let numericContainerId = containerId;
  const isPublicId = /^GTM-/i.test(containerId);
  if (isPublicId) {
    try {
      const containersRes = await tagmanager.accounts.containers.list({ parent: `accounts/${accountId}` });
      const match = (containersRes.data.container ?? []).find(
        (c) => c.publicId?.toUpperCase() === containerId.toUpperCase()
      );
      if (match?.containerId) numericContainerId = String(match.containerId);
    } catch { /* fall through */ }
  }

  // Get workspace ID
  let workspaceId = '1';
  try {
    const wsRes = await tagmanager.accounts.containers.workspaces.list({
      parent: `accounts/${accountId}/containers/${numericContainerId}`,
    });
    const ws = wsRes.data.workspace?.[0];
    if (ws?.workspaceId) workspaceId = String(ws.workspaceId);
  } catch { /* fall through */ }

  const parent = `accounts/${accountId}/containers/${numericContainerId}/workspaces/${workspaceId}`;

  try {
    // Fetch all objects
    const [tagsRes, triggersRes, variablesRes] = await Promise.all([
      tagmanager.accounts.containers.workspaces.tags.list({ parent }),
      tagmanager.accounts.containers.workspaces.triggers.list({ parent }),
      tagmanager.accounts.containers.workspaces.variables.list({ parent }),
    ]);

    const allTags = tagsRes.data.tag ?? [];
    const allTriggers = triggersRes.data.trigger ?? [];
    const allVariables = variablesRes.data.variable ?? [];

    const tagNames = new Set(allTags.map((t) => t.name ?? ''));
    const triggerNames = new Set(allTriggers.map((t) => t.name ?? ''));
    const varNames = new Set(allVariables.map((v) => v.name ?? ''));

    // Find dupes
    const dupeTags = allTags.filter((t) => isDupeSnakeCase(t.name ?? '', tagNames));
    const dupeTriggers = allTriggers.filter((t) => isDupeSnakeCase(t.name ?? '', triggerNames));
    const dupeVariables = allVariables.filter((v) => isDupeSnakeCase(v.name ?? '', varNames));

    const deleted = { tags: 0, triggers: 0, variables: 0 };
    const errors: string[] = [];

    // Delete dupe tags
    for (const tag of dupeTags) {
      try {
        const path = `${parent}/tags/${tag.tagId}`;
        await tagmanager.accounts.containers.workspaces.tags.delete({ path });
        deleted.tags++;
      } catch (err) {
        errors.push(`tag ${tag.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Delete dupe triggers
    for (const trigger of dupeTriggers) {
      try {
        const path = `${parent}/triggers/${trigger.triggerId}`;
        await tagmanager.accounts.containers.workspaces.triggers.delete({ path });
        deleted.triggers++;
      } catch (err) {
        errors.push(`trigger ${trigger.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Delete dupe variables
    for (const variable of dupeVariables) {
      try {
        const path = `${parent}/variables/${variable.variableId}`;
        await tagmanager.accounts.containers.workspaces.variables.delete({ path });
        deleted.variables++;
      } catch (err) {
        errors.push(`variable ${variable.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Bust container cache so next fetch reflects the cleanup
    containerDataCache.delete(sessionId);
    verificationCache.delete(sessionId);

    res.json({
      success: true,
      deleted,
      dupeCount: dupeTags.length + dupeTriggers.length + dupeVariables.length,
      deletedCount: deleted.tags + deleted.triggers + deleted.variables,
      dupeNames: {
        tags: dupeTags.map((t) => t.name ?? ''),
        triggers: dupeTriggers.map((t) => t.name ?? ''),
        variables: dupeVariables.map((v) => v.name ?? ''),
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gtm/refresh-container
// ---------------------------------------------------------------------------

router.post('/refresh-container', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.json({ error: 'no_container' });
    return;
  }

  const gtmConfig = getSessionGtmConfig(sessionId);
  if (!gtmConfig || !gtmConfig.accountId) {
    res.json({ error: 'no_container' });
    return;
  }

  try {
    const data = await fetchContainerData(sessionId, gtmConfig.accountId, gtmConfig.containerId);
    if (data.error === 'not_authenticated') {
      res.json({ error: 'not_authenticated' });
      return;
    }
    res.json(data);
  } catch {
    res.json({ error: 'fetch_failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gtm/resources — record a GTM resource created during implementation
// Called by the skill output parser after a successful resource creation
// ---------------------------------------------------------------------------

router.post('/resources', (req: Request, res: Response) => {
  const { sessionId, resourceType, gtmResourceId, workspacePath } = req.body as {
    sessionId?: string;
    resourceType?: string;
    gtmResourceId?: string;
    workspacePath?: string;
  };

  if (!sessionId || !resourceType || !gtmResourceId) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'sessionId, resourceType, and gtmResourceId are required' });
    return;
  }

  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO gtm_resources (id, session_id, resource_type, gtm_resource_id, workspace_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), sessionId, resourceType, gtmResourceId, workspacePath ?? null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB_ERROR', message: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gtm/rollback — delete all GTM resources tracked for a session
// ---------------------------------------------------------------------------

router.post('/rollback', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: 'MISSING_SESSION' });
    return;
  }

  const db = getDb();
  const resources = db.prepare(
    'SELECT id, resource_type, gtm_resource_id, workspace_path FROM gtm_resources WHERE session_id = ? AND rolled_back_at IS NULL ORDER BY created_at DESC'
  ).all(sessionId) as Array<{ id: string; resource_type: string; gtm_resource_id: string; workspace_path: string | null }>;

  if (resources.length === 0) {
    res.json({ success: true, rolledBack: 0, message: 'No tracked GTM resources to roll back' });
    return;
  }

  const platform = getPlatform();
  const rollbackResults: Array<{ resourceType: string; resourceId: string; success: boolean; error?: string }> = [];

  if (platform === 'windows') {
    const googleapis = await tryImportGoogleapis();
    if (!googleapis) {
      res.json({ success: false, error: 'googleapis not installed - cannot roll back via API' });
      return;
    }

    const tokens = getOAuthTokens(sessionId);
    const oauthCreds = getSessionOAuthCredentials(sessionId);

    if (!tokens || !oauthCreds) {
      res.json({ success: false, error: 'Not authenticated - cannot roll back GTM resources' });
      return;
    }

    const oauth2Client = new googleapis.google.auth.OAuth2(oauthCreds.clientId, oauthCreds.clientSecret, OAUTH_REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ?? undefined,
    });

    const tagmanager = googleapis.google.tagmanager({ version: 'v2', auth: oauth2Client });

    for (const resource of resources) {
      try {
        const path = resource.gtm_resource_id;
        if (resource.resource_type === 'tag') {
          await tagmanager.accounts.containers.workspaces.tags.delete({ path });
        } else if (resource.resource_type === 'trigger') {
          await tagmanager.accounts.containers.workspaces.triggers.delete({ path });
        } else if (resource.resource_type === 'variable') {
          await tagmanager.accounts.containers.workspaces.variables.delete({ path });
        } else {
          rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: false, error: 'Unknown resource type' });
          continue;
        }

        db.prepare('UPDATE gtm_resources SET rolled_back_at = datetime("now") WHERE id = ?').run(resource.id);
        rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: true });
      } catch (err) {
        rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } else {
    // Mac/Linux: use gtm CLI to delete resources
    for (const resource of resources) {
      try {
        const typeMap: Record<string, string> = { tag: 'tags', trigger: 'triggers', variable: 'variables' };
        const cliType = typeMap[resource.resource_type];
        if (!cliType) {
          rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: false, error: 'Unknown resource type' });
          continue;
        }

        const result = await spawnCommand('gtm', [cliType, 'delete', '--id', resource.gtm_resource_id], 15_000);
        if (result.code === 0) {
          db.prepare('UPDATE gtm_resources SET rolled_back_at = datetime("now") WHERE id = ?').run(resource.id);
          rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: true });
        } else {
          rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: false, error: result.stderr.slice(0, 200) });
        }
      } catch (err) {
        rollbackResults.push({ resourceType: resource.resource_type, resourceId: resource.gtm_resource_id, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const succeeded = rollbackResults.filter(r => r.success).length;
  res.json({ success: succeeded === resources.length, rolledBack: succeeded, total: resources.length, results: rollbackResults });
});

export default router;
