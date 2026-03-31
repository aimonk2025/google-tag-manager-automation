import { API_BASE } from './constants'
import type { SessionData } from '../types/session'
import type { GtmStatusData } from '../hooks/useGtmStatus'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText, error: 'HTTP_ERROR' })) as { message?: string; error?: string }
    throw new ApiError(body.message ?? `HTTP ${res.status}`, res.status, body.error ?? 'HTTP_ERROR')
  }
  return res.json() as Promise<T>
}

export const api = {
  getSession: () => request<SessionData>(`${API_BASE}/session`),

  getSkillOutput: <T = unknown>(skillName: string) =>
    request<T>(`${API_BASE}/session/output/${encodeURIComponent(skillName)}`),

  createOrUpdateSession: (data: { projectPath: string; gtmConfig?: { accountId: string; containerId: string } | null; name?: string; forceNew?: boolean }) =>
    request<SessionData>(`${API_BASE}/session`, { method: 'POST', body: JSON.stringify(data) }),

  updateSessionMeta: (data: { name?: string; gtmConfig?: { accountId: string; containerId: string } | null; oauthCredentials?: { clientId: string; clientSecret: string } | null }) =>
    request<SessionData>(`${API_BASE}/session`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteProject: (id: string) =>
    request<{ success: boolean }>(`${API_BASE}/session/${id}`, { method: 'DELETE' }),

  validatePath: (path: string) =>
    request<{ valid: boolean; reason?: string; path?: string }>(`${API_BASE}/session/validate-path`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  resetSession: () =>
    request<{ success: boolean }>(`${API_BASE}/session/reset`, { method: 'POST' }),

  saveDomPageResult: (page: string, elementsFixed: number, filesModified: string[]) =>
    request<{ success: boolean }>(`${API_BASE}/session/dom-page-result`, {
      method: 'PATCH',
      body: JSON.stringify({ page, elementsFixed, filesModified }),
    }),

  markSkillComplete: (skillName: string, claudeSessionId: string, output: unknown) =>
    request<{ success: boolean; session: SessionData }>(`${API_BASE}/session/skill-complete`, {
      method: 'PATCH',
      body: JSON.stringify({ skillName, claudeSessionId, output }),
    }),

  getHistory: (limit = 20, offset = 0) =>
    request<{ sessions: SessionData[]; total: number }>(`${API_BASE}/session/history?limit=${limit}&offset=${offset}`),

  resumeSession: (id: string) =>
    request<SessionData>(`${API_BASE}/session/resume/${id}`, { method: 'POST' }),

  getDiff: (filePath: string, proposedContent: string) =>
    request<{ filePath: string; originalContent: string; proposedContent: string; diff: string; additions: number; deletions: number }>(
      `${API_BASE}/files/diff`,
      { method: 'POST', body: JSON.stringify({ filePath, proposedContent }) }
    ),

  applyFile: (filePath: string, content: string) =>
    request<{ success: boolean; filePath: string }>(`${API_BASE}/files/apply`, {
      method: 'POST',
      body: JSON.stringify({ filePath, content }),
    }),

  auditCoverage: () =>
    request<{ totalProjectFiles: number; auditedFiles: number; notAuditedFiles: number; notAudited: string[]; hasGaps: boolean }>(
      `${API_BASE}/files/audit-coverage`
    ),

  domCheck: () =>
    request<{ checked: boolean; reason?: string; totalElements?: number; stillUntracked?: number; done?: boolean }>(
      `${API_BASE}/files/dom-check`
    ),

  getChangedFiles: (skillName: string) =>
    request<{ changed: Array<{ filePath: string; additions: number; deletions: number }>; unchanged: string[]; missing: string[]; hasSnapshot: boolean }>(
      `${API_BASE}/files/changed/${encodeURIComponent(skillName)}`
    ),

  getGtmStatus: () =>
    request<GtmStatusData>(`${API_BASE}/gtm/status`),

  installGtmCli: () =>
    request<{ success: boolean; error?: string }>(`${API_BASE}/gtm/install`, { method: 'POST' }),

  startGtmAuth: () =>
    request<{ id: string }>(`${API_BASE}/gtm/auth-start`, { method: 'POST' }),

  pollGtmAuth: (id: string) =>
    request<{ done: boolean; success: boolean; error: string | null }>(`${API_BASE}/gtm/auth-status/${id}`),

  startGtmOAuth: (sessionId: string, clientId: string, clientSecret: string) =>
    request<{ authUrl: string; stateId: string }>(`${API_BASE}/gtm/oauth-start`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, clientId, clientSecret }),
    }),

  pollGtmOAuth: (stateId: string) =>
    request<{ done: boolean; success: boolean; error: string | null }>(`${API_BASE}/gtm/oauth-poll/${stateId}`),

  submitOAuthManualCallback: (redirectUrl: string, clientId: string, clientSecret: string, sessionId: string) =>
    request<{ success: boolean; email: string | null }>(`${API_BASE}/gtm/oauth-manual-callback`, {
      method: 'POST',
      body: JSON.stringify({ redirectUrl, clientId, clientSecret, sessionId }),
    }),

  browsePath: (browsePath?: string) => {
    const url = browsePath
      ? `${API_BASE}/session/browse?path=${encodeURIComponent(browsePath)}`
      : `${API_BASE}/session/browse`
    return request<{ path: string | null; parent: string | null; entries: { name: string; path: string; isDirectory: boolean }[] }>(url)
  },

  getHealth: () =>
    request<{ status: string; version: string; name: string }>(`${API_BASE}/health`),

  getPageRuns: (skillName: string, sessionId?: string) => {
    const params = new URLSearchParams()
    if (sessionId) params.set('sessionId', sessionId)
    return request<Record<string, { page_context: string; output_log: string; input_tokens: number; output_tokens: number; cost_usd: number; duration_ms: number; status: string; started_at: string; completed_at: string | null }>>(
      `${API_BASE}/skill/page-runs/${skillName}?${params}`
    )
  },

  getRunHistory: (skillName: string, sessionId?: string, limit = 10) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (sessionId) params.set('sessionId', sessionId)
    return request<SkillRunHistory[]>(`${API_BASE}/skill/history/${skillName}?${params}`)
  },

  getSkillRun: (runId: string) =>
    request<SkillRunDetail>(`${API_BASE}/skill/run/${encodeURIComponent(runId)}`),

  getImplementationContext: () =>
    request<ImplementationContextPreview>(`${API_BASE}/skill/context/gtm-implementation`),

  getCostsSummary: (sessionId: string) =>
    request<CostSummary>(`${API_BASE}/costs/summary?sessionId=${encodeURIComponent(sessionId)}`),

  recoverApproval: () =>
    request<{ recovered: boolean; reason?: string; approvalId?: string }>(`${API_BASE}/session/recover-approval`, { method: 'POST' }),

  getApprovals: (sessionId: string) =>
    request<Approval[]>(`${API_BASE}/approvals?sessionId=${encodeURIComponent(sessionId)}`),

  getApproval: (id: string) =>
    request<Approval>(`${API_BASE}/approvals/${id}`),

  approveApproval: (id: string, note?: string) =>
    request<Approval>(`${API_BASE}/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),

  rejectApproval: (id: string, note?: string) =>
    request<Approval>(`${API_BASE}/approvals/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  requestRevision: (id: string, note?: string) =>
    request<Approval>(`${API_BASE}/approvals/${id}/request-revision`, { method: 'POST', body: JSON.stringify({ note }) }),

  getActivity: (sessionId: string, limit = 50) =>
    request<ActivityEvent[]>(`${API_BASE}/activity?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`),

  getEncryptionStatus: () =>
    request<{ enabled: boolean }>(`${API_BASE}/settings/encryption-status`),

  snapshotFiles: (skillName: string, filePaths?: string[]) =>
    request<{ success: boolean; snapshotted: number; failed: number }>(`${API_BASE}/files/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ skillName, filePaths }),
    }),

  restoreFiles: (skillName: string) =>
    request<{ success: boolean; restored: number; failed: number }>(`${API_BASE}/files/restore`, {
      method: 'POST',
      body: JSON.stringify({ skillName }),
    }),

  getSkillConfig: (skillName: string) =>
    request<{ skillName: string; sectionOverrides: Record<string, string>; additionalInstructions: string; updatedAt: string | null }>(
      `${API_BASE}/skill/config/${skillName}`
    ),

  updateSkillConfig: (skillName: string, data: { sectionOverrides?: Record<string, string>; additionalInstructions?: string }) =>
    request<{ success: boolean; skillName: string }>(`${API_BASE}/skill/config/${skillName}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getSessionScores: (sessionId: string) =>
    request<{ scores: Array<{ skill_name: string; score: number; retry_count: number; duration_ms: number; started_at: string }> }>(
      `${API_BASE}/session/scores?sessionId=${encodeURIComponent(sessionId)}`
    ),

  verifyGtmImplementation: (sessionId: string) =>
    request<{ verified: boolean; gtmResources?: { tagsFound: number; triggersFound: number; variablesFound: number; containerName: string; verifiedAt: string; error: string | null }; createdResources?: { tagsCreated?: number; triggersCreated?: number; variablesCreated?: number; versionId?: string | null; published?: boolean } | null; error?: string }>(
      `${API_BASE}/gtm/verify-implementation`,
      { method: 'POST', body: JSON.stringify({ sessionId }) }
    ),

  getGtmContainerData: (sessionId: string) =>
    request<GtmContainerData>(
      `${API_BASE}/gtm/container-data?sessionId=${encodeURIComponent(sessionId)}`
    ),

  refreshGtmContainer: (sessionId: string) =>
    request<{ success: boolean }>(`${API_BASE}/gtm/container-data/refresh`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  cleanupGtmDupes: (sessionId: string) =>
    request<{ success: boolean; deleted: { tags: number; triggers: number; variables: number }; dupeCount: number; deletedCount: number; dupeNames: { tags: string[]; triggers: string[]; variables: string[] }; errors?: string[] }>(
      `${API_BASE}/gtm/cleanup-dupes`,
      { method: 'POST', body: JSON.stringify({ sessionId }) }
    ),

  getHealth: () =>
    request<{
      status: string;
      version: string;
      name: string;
      checks: Record<string, string>;
      diskFreeGB: number | null;
      activeRuns: number;
      lastBackupAt: string | null;
      lastBackupSizeKB: number | null;
    }>(`${API_BASE}/health`),

  getAdapterPricing: () =>
    request<{ pricing: Array<{ adapter_type: string; input_price_per_million: number; output_price_per_million: number; updated_at: string }> }>(
      `${API_BASE}/settings/adapter-pricing`
    ),

  updateAdapterPricing: (adapterType: string, inputPricePerMillion: number, outputPricePerMillion: number) =>
    request<{ success: boolean }>(`${API_BASE}/settings/adapter-pricing/${adapterType}`, {
      method: 'PATCH',
      body: JSON.stringify({ inputPricePerMillion, outputPricePerMillion }),
    }),

  validateGtmCredentials: (sessionId: string) =>
    request<{ valid: boolean; containerName?: string; error?: string }>(`${API_BASE}/gtm/validate-credentials?sessionId=${encodeURIComponent(sessionId)}`),

  checkSnapshotSummary: (sessionId: string) =>
    request<{ hasSnapshots: boolean; fileCount: number }>(`${API_BASE}/session/${sessionId}/snapshot-summary`),

  checkRestoreDivergence: (skillName: string) =>
    request<{ diverged: boolean; files: Array<{ filePath: string; snapshotHash: string; currentHash: string }>; totalFiles: number }>(
      `${API_BASE}/files/restore?check=true`,
      { method: 'POST', body: JSON.stringify({ skillName }) }
    ),

  getActiveRun: () =>
    request<{ activeRun: { id: string; skill_name: string; started_at: string } | null }>(`${API_BASE}/skill/active-run`),
}

export interface GtmTag {
  id: string
  name: string
  type: string
  status: 'active' | 'paused'
  firingTriggerIds: string[]
}

export interface GtmTrigger {
  id: string
  name: string
  type: string
  condition?: string
}

export interface GtmVariable {
  id: string
  name: string
  type: string
  value?: string
}

export interface GtmContainerData {
  containerSummary: {
    accountId: string
    containerId: string
    containerName: string
    totalTags: number
    totalTriggers: number
    totalVariables: number
    lastPublished: string | null
  }
  tags: GtmTag[]
  triggers: GtmTrigger[]
  variables: GtmVariable[]
  fetchedAt: string
  error?: string
}

export interface CodebaseDriftResult {
  hasChanges: boolean
  newFiles: string[]
  removedFiles: string[]
  totalNew: number
  totalRemoved: number
  lastAuditDate: string | null
}

export interface ResolutionQueueItem {
  id: string
  elementId: string
  elementType: string
  elementText: string
  pageOrFile: string
  status: 'pending' | 'resolved' | 'skipped'
  context: Record<string, unknown>
}

export async function getResolutionQueue(sessionId: string): Promise<ResolutionQueueItem[]> {
  return request<ResolutionQueueItem[]>(
    `${API_BASE}/skill/resolution-queue?sessionId=${encodeURIComponent(sessionId)}`
  )
}

export async function resolveElement(
  sessionId: string,
  elementId: string,
  elementType: string,
  elementContext: object
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/skill/resolve-element`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, elementId, elementType, elementContext }),
  })
}

export async function skipResolution(resolutionId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/skill/resolution/${encodeURIComponent(resolutionId)}/skip`, {
    method: 'PATCH',
  })
}

export async function checkCodebaseDrift(sessionId: string): Promise<CodebaseDriftResult> {
  return request<CodebaseDriftResult>(
    `${API_BASE}/skill/codebase-drift?sessionId=${encodeURIComponent(sessionId)}`
  )
}

export async function acknowledgeDrift(sessionId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `${API_BASE}/skill/acknowledge-drift?sessionId=${encodeURIComponent(sessionId)}`,
    { method: 'PATCH' }
  )
}

export interface ParsedEdit {
  file: string
  elementText: string
  addedId: string | null
  addedClasses: string[]
}

export interface ParsedRunEdits {
  edits: ParsedEdit[]
  byFile: Record<string, ParsedEdit[]>
  totalEdits: number
  filesModified: number
  noChanges: boolean
  summaryText: string | null
  filesExamined: string[]
}

export interface SkillRunDetail {
  id: string
  session_id: string
  skill_name: string
  status: string
  started_at: string
  completed_at: string | null
  duration_ms: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  adapter_type: string
  error_message: string | null
  score: number | null
  retry_count: number
  output_log: string | null
  prompt_sent: string | null
  result_json: string | null
  claude_session_id: string | null
  progress_pct: number
  edits: ParsedRunEdits | null
  auditReport: unknown | null
}

export interface SkillRunHistory {
  id: string
  status: string
  started_at: string
  completed_at: string | null
  duration_ms: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  adapter_type: string
  error_message: string | null
  score: number | null
  retry_count: number
  output_log: string | null
  prompt_sent: string | null
}

export interface CostSummary {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  bySkill: Array<{ skillName: string; costUsd: number; tokens: number }>
}

export interface Approval {
  id: string
  sessionId: string
  skillName: string
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested'
  reviewNote: string | null
  payload: unknown
  createdAt: string
  decidedAt: string | null
}

export interface ImplementationContextPreview {
  gtmConfig: { accountId: string; containerId: string } | null
  platform: string
  auth: { hasRefreshToken?: boolean; hasAccessToken?: boolean; authMissing?: boolean; usesCli?: boolean }
  trackingPlan: { totalEvents: unknown; p0: unknown; p1: unknown; p2: unknown } | null
  events: Array<{ name: string; priority: string; method: string; params: string[]; gtmResourcesToCreate: unknown }>
  scopeFiles: string[]
  previousRun: { doneEvents: string[]; doneFiles: string[]; gtmRes: Record<string, unknown> | null } | null
  remainingEvents: Array<{ name: string; priority: string; method: string; params: string[] }>
  remainingFiles: string[]
}

export interface ActivityEvent {
  id: number
  session_id: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  detail: string | null
  created_at: string
}
