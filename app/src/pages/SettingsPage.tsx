import { useState, useEffect } from 'react'
import { useSession } from '@/context/SessionContext'
import { ResetSessionModal } from '@/components/ResetSessionModal'
import { API_BASE } from '@/lib/constants'
import { CheckCircle, XCircle, Loader2, Lock, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'

interface AdapterInfo {
  type: string
  label: string
  supportsSessionResume: boolean
}

interface AdaptersResponse {
  adapters: AdapterInfo[]
  activeType: string
}

interface TestResult {
  ok: boolean
  message: string
}

export default function SettingsPage() {
  const { session } = useSession()
  const [showResetModal, setShowResetModal] = useState(false)

  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [activeType, setActiveType] = useState<string>('claude_code')
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [encryptionEnabled, setEncryptionEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/skill/adapters`)
      .then(r => r.json())
      .then((data: AdaptersResponse) => {
        setAdapters(data.adapters)
        setActiveType(data.activeType)
      })
      .catch(() => {/* ignore */})

    api.getEncryptionStatus()
      .then(s => setEncryptionEnabled(s.enabled))
      .catch(() => setEncryptionEnabled(false))
  }, [])

  async function selectAdapter(type: string) {
    setSaving(true)
    try {
      await fetch(`${API_BASE}/skill/adapters/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      setActiveType(type)
    } finally {
      setSaving(false)
    }
  }

  async function testAdapter(type: string) {
    setTesting(type)
    try {
      const res = await fetch(`${API_BASE}/skill/adapters/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const result = await res.json() as TestResult
      setTestResults(prev => ({ ...prev, [type]: result }))
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your Google Tag Manager Automation Engine session and configuration.</p>
      </div>

      {/* Adapter Selection */}
      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">AI Adapter</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">Choose which CLI agent runs the GTM pipeline steps.</p>
        </div>
        <div className="divide-y divide-border">
          {adapters.map(adapter => {
            const isActive = adapter.type === activeType
            const testResult = testResults[adapter.type]
            const isTesting = testing === adapter.type
            return (
              <div key={adapter.type} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => selectAdapter(adapter.type)}
                    disabled={saving}
                    className={`flex-shrink-0 h-4 w-4 rounded-full border-2 transition-colors ${
                      isActive
                        ? 'border-foreground bg-foreground'
                        : 'border-border hover:border-foreground/50'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{adapter.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {adapter.supportsSessionResume ? 'Supports session resume' : 'No session resume'}
                    </p>
                    {testResult && (
                      <p className={`text-[11px] mt-0.5 ${testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                        {testResult.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {testResult && (
                    testResult.ok
                      ? <CheckCircle className="h-4 w-4 text-green-500" />
                      : <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <button
                    onClick={() => testAdapter(adapter.type)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 h-8 px-3 text-[12px] border border-border hover:bg-accent/50 transition-colors disabled:opacity-50"
                  >
                    {isTesting && <Loader2 className="h-3 w-3 animate-spin" />}
                    Test
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {session && (
        <div className="border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold">Current Session</h2>
          </div>
          <div className="px-4 py-4 flex flex-col gap-2">
            <InfoRow label="Session ID" value={session.id} mono />
            <InfoRow label="Project Path" value={session.projectPath || 'Not set'} mono />
            <InfoRow label="Completed Steps" value={`${session.completedSkills.length} / 7`} />
            <InfoRow label="Created" value={new Date(session.createdAt).toLocaleString()} />
            <InfoRow label="Updated" value={new Date(session.updatedAt).toLocaleString()} />
          </div>
        </div>
      )}

      {/* Encryption Status */}
      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Credential Encryption</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">AES-256-GCM encryption for GTM Account ID and Container ID at rest.</p>
        </div>
        <div className="px-4 py-4 flex items-start gap-3">
          {encryptionEnabled === null && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />
          )}
          {encryptionEnabled === true && (
            <Lock className="h-4 w-4 text-[oklch(0.4_0.1_150)] mt-0.5 shrink-0" />
          )}
          {encryptionEnabled === false && (
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          )}
          <div>
            {encryptionEnabled === true && (
              <>
                <p className="text-[13px] font-medium text-[oklch(0.4_0.1_150)]">Encryption enabled</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">GTM_MASTER_KEY is set. Credentials are stored encrypted.</p>
              </>
            )}
            {encryptionEnabled === false && (
              <>
                <p className="text-[13px] font-medium text-amber-600">Encryption disabled</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">GTM credentials are stored in plain text. To enable encryption, add the following to your <span className="font-mono bg-muted px-1">.env</span> file:</p>
                <pre className="mt-2 text-[12px] font-mono bg-muted px-3 py-2 text-foreground select-all">GTM_MASTER_KEY=&lt;64-char hex string&gt;</pre>
                <p className="text-[11px] text-muted-foreground mt-1.5">Generate a key: <span className="font-mono">node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</span></p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Skill Instructions */}
      <div className="border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Skill Instructions</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Customize additional instructions appended to each skill's prompt. Changes take effect on the next run.
          </p>
        </div>
        <SkillInstructionsEditor />
      </div>

      <div className="border border-destructive">
        <div className="px-4 py-3 border-b border-destructive">
          <h2 className="text-[13px] font-semibold text-destructive">Danger Zone</h2>
        </div>
        <div className="px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium">Reset Session</p>
            <p className="text-[13px] text-muted-foreground">Clear all progress and start fresh. This cannot be undone.</p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            className="h-9 px-4 text-sm font-medium border border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors shrink-0"
          >
            Reset Session
          </button>
        </div>
      </div>

      <ResetSessionModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
      />
    </div>
  )
}

const SKILLS_FOR_CONFIG = [
  { name: 'gtm-analytics-audit', label: 'Audit' },
  { name: 'gtm-dom-standardization', label: 'Prepare Elements' },
  { name: 'gtm-strategy', label: 'Strategy' },
  { name: 'gtm-implementation', label: 'Implementation' },
  { name: 'gtm-testing', label: 'Testing' },
  { name: 'gtm-reporting', label: 'Reporting' },
]

function SkillInstructionsEditor() {
  const [selected, setSelected] = useState(SKILLS_FOR_CONFIG[0].name)
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getSkillConfig(selected)
      .then(cfg => setInstructions(cfg.additionalInstructions ?? ''))
      .catch(() => setInstructions(''))
  }, [selected])

  async function save() {
    setSaving(true)
    try {
      await api.updateSkillConfig(selected, { additionalInstructions: instructions })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex border-b border-border overflow-x-auto">
        {SKILLS_FOR_CONFIG.map(s => (
          <button
            key={s.name}
            onClick={() => setSelected(s.name)}
            className={`px-4 py-2.5 text-[11px] font-medium shrink-0 border-b-2 transition-colors ${
              selected === s.name
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder={`Additional instructions for ${selected}... (e.g., "Focus on Next.js App Router components only")`}
          className="w-full min-h-[120px] text-[12px] font-mono border border-border bg-muted/10 px-3 py-2 resize-y focus:outline-none focus:border-foreground transition-colors"
          rows={5}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="h-8 px-4 text-[12px] font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Instructions'}
          </button>
          {instructions && (
            <button
              onClick={() => setInstructions('')}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[13px] text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={`text-[13px] break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
