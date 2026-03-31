import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'

interface ResetSessionModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ResetSessionModal({ isOpen, onClose }: ResetSessionModalProps) {
  const { resetSession } = useSession()
  const [resetting, setResetting] = useState(false)
  const navigate = useNavigate()

  async function handleConfirm() {
    setResetting(true)
    try {
      await resetSession()
      onClose()
      navigate('/setup')
    } catch (err) {
      console.error('Failed to reset session:', err)
    } finally {
      setResetting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-md">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold">Reset Session</h2>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground">
            This will clear all pipeline progress, skill outputs, and session data. You will need to run all steps again from scratch.
          </p>
          <p className="text-sm font-medium mt-2">This cannot be undone.</p>
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={resetting}
            className="h-9 px-4 text-sm font-medium border border-border bg-background hover:bg-accent disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={resetting}
            className="h-9 px-4 text-sm font-medium bg-destructive text-white hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {resetting ? 'Resetting...' : 'Reset Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
