interface RerunSkillModalProps {
  isOpen: boolean
  skillLabel: string
  downstreamSkills: string[]
  onConfirm: () => void
  onClose: () => void
}

export function RerunSkillModal({ isOpen, skillLabel, downstreamSkills, onConfirm, onClose }: RerunSkillModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-md">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Re-run {skillLabel}?</h2>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Re-running this step will clear its output and mark the following downstream steps as incomplete:
          </p>
          {downstreamSkills.length > 0 && (
            <ul className="mt-2 space-y-1">
              {downstreamSkills.map(s => (
                <li key={s} className="text-sm font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-foreground block shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium border border-border bg-background hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className="h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors"
          >
            Re-run
          </button>
        </div>
      </div>
    </div>
  )
}
