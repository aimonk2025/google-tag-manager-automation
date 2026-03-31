export interface AuditReport {
  metadata: {
    auditDate: string
    framework: string
    filesScanned: number
    componentsAnalyzed: number
  }
  summary: {
    totalClickableElements: number
    withTracking: number
    withoutTracking: number
    analyticsReadiness: string
    coveragePercent?: number
    total?: number
  }
  categorized: Record<string, {
    total: number
    tracked: number
    untracked: number
    elements?: AuditElement[]
  }>
  issues: AuditIssue[]
  recommendations: AuditRecommendation[]
  existingTracking: {
    patterns: string[]
    libraries: string[]
    coverage: string
  }
}

export interface AuditElement {
  file: string
  line: number
  text: string
  id: string | null
  classes: string[]
  tracking: boolean
  recommendation: string
}

export interface AuditIssue {
  type: string
  severity: 'high' | 'medium' | 'low'
  count: number
  description: string
  examples?: string[]
}

export interface AuditRecommendation {
  priority: 'P0' | 'P1' | 'P2'
  action: string
  reason: string
  impact?: string
  expectedValue?: string
}

export interface TrackingPlan {
  metadata: {
    createdDate: string
    businessModel: string
    framework: string
    primaryGoal: string
  }
  events: TrackingEvent[]
  summary: {
    totalEvents: number
    p0Events: number
    p1Events: number
    p2Events: number
    totalElements: number
    tracked: number
    untracked: number
  }
  recommendedReports: RecommendedReport[]
  audienceDefinitions: AudienceDefinition[]
}

export interface TrackedElement {
  id?: string
  file?: string
  text?: string
  note?: string
}

export interface TrackingEvent {
  name: string
  priority: 'P0' | 'P1' | 'P2'
  status?: 'active' | 'gap' | 'partial'
  businessValue: string
  decisionImpact: string
  parameters: EventParameter[]
  elementsFound?: number
  elementsTracked?: number
  gap?: number | string
  trackedElements?: TrackedElement[]
  untrackedElements?: TrackedElement[]
  reportingImpact?: string[]
  fix?: string
}

export interface EventParameter {
  name: string
  type: string
  example: string
  source: string
  required: boolean
}

export interface RecommendedReport {
  name: string
  type: string
  steps?: string[]
  metrics?: string[]
  businessValue: string
}

export interface AudienceDefinition {
  name: string
  criteria: string
  businessValue: string
  estimatedSize: string
  roiPotential: string
}

export interface DomChanges {
  filesModified: number
  changes: FileChange[]
}

export interface FileChange {
  filePath: string
  proposedContent: string
  diff?: string
  status: 'pending' | 'applied' | 'skipped'
}

export interface SessionData {
  id: string
  name: string | null
  projectPath: string
  gtmConfig: { accountId: string; containerId: string } | null
  oauthCredentials: { clientId: string; clientSecret: string } | null
  completedSkills: string[]
  currentSkill: string | null
  skillSessions: Record<string, string>
  compactOutputs: Record<string, unknown>
  createdAt: string
  updatedAt: string
  audit_coverage_pct: number
  resolution_queue: string
  drift_acknowledged: number
}
