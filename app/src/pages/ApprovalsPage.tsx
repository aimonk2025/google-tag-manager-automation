import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { api, type Approval } from '@/lib/api'
import type { TrackingPlan } from '@/types/session'

function StatusBadge({ status }: { status: Approval['status'] }) {
  const config: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'text-amber-700 border-amber-300 bg-amber-50' },
    approved: { label: 'Approved', cls: 'text-[oklch(0.4_0.1_150)] border-[oklch(0.8_0.05_150)] bg-[oklch(0.97_0.02_150)]' },
    rejected: { label: 'Rejected', cls: 'text-destructive border-destructive/40 bg-destructive/5' },
    revision_requested: { label: 'Revision Requested', cls: 'text-amber-700 border-amber-300 bg-amber-50' },
  }
  const { label, cls } = config[status] ?? { label: status, cls: 'text-muted-foreground border-border' }
  return <span className={`text-[10px] font-semibold border px-2 py-0.5 ${cls}`}>{label}</span>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ApprovalCard({ approval, onUpdate }: { approval: Approval; onUpdate: (updated: Approval) => void }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const plan = approval.payload as TrackingPlan | null
  const isPending = approval.status === 'pending' || approval.status === 'revision_requested'

  async function handle(action: 'approve' | 'reject' | 'revision') {
    setSaving(true)
    try {
      let updated: Approval
      if (action === 'approve') updated = await api.approveApproval(approval.id, note || undefined)
      else if (action === 'reject') updated = await api.rejectApproval(approval.id, note || undefined)
      else updated = await api.requestRevision(approval.id, note || undefined)
      onUpdate(updated)
      setNote('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[12px] font-semibold font-mono">{approval.skillName}</span>
          <StatusBadge status={approval.status} />
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(approval.createdAt)}</span>
      </div>

      {/* Tracking plan summary */}
      {plan && (
        <div className="px-4 py-4 flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Tracking Plan</h3>

          {plan.summary && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total Events', value: plan.summary.totalEvents },
                { label: 'P0 Critical', value: plan.summary.p0Events },
                { label: 'P1 Important', value: plan.summary.p1Events },
                { label: 'P2 Nice-to-have', value: plan.summary.p2Events },
              ].map(item => (
                <div key={item.label} className="border border-border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-lg font-bold leading-none mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {plan.metadata && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[12px]">
              {plan.metadata.primaryGoal && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">Primary Goal</span>
                  <span>{plan.metadata.primaryGoal}</span>
                </div>
              )}
              {plan.metadata.framework && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">Framework</span>
                  <span>{plan.metadata.framework}</span>
                </div>
              )}
            </div>
          )}

          {plan.events && plan.events.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Events (P0)</p>
              <div className="flex flex-wrap gap-1">
                {plan.events.filter(e => e.priority === 'P0').map((e, i) => (
                  <span key={i} className="text-[11px] font-mono bg-primary text-primary-foreground px-1.5 py-0.5">{e.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review note display */}
      {approval.reviewNote && !isPending && (
        <div className="px-4 py-3 border-t border-border bg-muted/10">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Review Note</p>
          <p className="text-[13px]">{approval.reviewNote}</p>
          {approval.decidedAt && (
            <p className="text-[11px] text-muted-foreground mt-1">{formatDate(approval.decidedAt)}</p>
          )}
        </div>
      )}

      {/* Decision actions */}
      {isPending && (
        <div className="px-4 py-4 border-t border-border flex flex-col gap-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional review note..."
            rows={2}
            className="w-full border border-border px-3 py-2 text-[13px] bg-background resize-none focus:outline-none focus:border-foreground transition-colors"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handle('approve')}
              disabled={saving}
              className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium bg-[oklch(0.4_0.1_150)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <CheckCircle2 size={14} />
              Approve
            </button>
            <button
              onClick={() => handle('revision')}
              disabled={saving}
              className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium border border-amber-400 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={14} />
              Request Revision
            </button>
            <button
              onClick={() => handle('reject')}
              disabled={saving}
              className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium border border-destructive text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
            >
              <XCircle size={14} />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ApprovalsPage() {
  const { session } = useSession()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.id) { setLoading(false); return }
    api.getApprovals(session.id)
      .then(setApprovals)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session?.id])

  function handleUpdate(updated: Approval) {
    setApprovals(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  const pending = approvals.filter(a => a.status === 'pending' || a.status === 'revision_requested')
  const decided = approvals.filter(a => a.status === 'approved' || a.status === 'rejected')

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and approve strategy before implementation can proceed.</p>
      </div>

      {!session && <p className="text-sm text-muted-foreground">No active session.</p>}

      {session && loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {session && !loading && approvals.length === 0 && (
        <div className="border border-border px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">No approvals yet. Complete the Strategy step to create one.</p>
          <Link to="/strategy" className="mt-3 inline-block text-[12px] text-foreground underline underline-offset-2">
            Go to Strategy
          </Link>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Pending Review</h2>
          {pending.map(a => <ApprovalCard key={a.id} approval={a} onUpdate={handleUpdate} />)}
        </div>
      )}

      {decided.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Decided</h2>
          {decided.map(a => <ApprovalCard key={a.id} approval={a} onUpdate={handleUpdate} />)}
        </div>
      )}
    </div>
  )
}
