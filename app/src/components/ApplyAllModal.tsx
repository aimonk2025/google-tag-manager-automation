interface ApplyAllModalProps {
  isOpen: boolean
  fileCount: number
  onConfirm: () => void
  onClose: () => void
}

export function ApplyAllModal({ isOpen, fileCount, onConfirm, onClose }: ApplyAllModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-md">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Apply All Changes</h2>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground">
            This will write changes to <span className="font-medium text-foreground">{fileCount} file{fileCount !== 1 ? 's' : ''}</span> in your project. Existing file contents will be overwritten.
          </p>
          <p className="text-sm text-muted-foreground mt-2">Skipped files will not be modified.</p>
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
            Apply {fileCount} File{fileCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
