import { Tag } from 'lucide-react'
import { PIPELINE_STEPS } from '@/lib/constants'

const WELCOME_KEY = 'gtm-engine-welcome-seen'

export function hasSeenWelcome() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(WELCOME_KEY) === 'true'
}

export function markWelcomeSeen() {
  localStorage.setItem(WELCOME_KEY, 'true')
}

interface WelcomeOverlayProps {
  onDismiss: () => void
}

export function WelcomeOverlay({ onDismiss }: WelcomeOverlayProps) {
  function handleGetStarted() {
    markWelcomeSeen()
    onDismiss()
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-background border border-border max-w-lg w-full flex flex-col gap-6 p-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Tag size={20} className="shrink-0" />
          <div>
            <p className="text-[16px] font-bold leading-tight">Google Tag Manager Automation Engine</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">AI-powered GTM instrumentation</p>
          </div>
        </div>

        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Point this tool at your codebase and it will automatically audit your elements, propose tracking IDs, create a strategy, implement dataLayer events, and configure your GTM container.
        </p>

        {/* Steps */}
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">7 automated steps</p>
          {PIPELINE_STEPS.map((step, idx) => (
            <div key={step.name} className="flex items-center gap-3 py-1.5">
              <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
              <span className="w-1.5 h-1.5 border border-current shrink-0" />
              <div className="min-w-0">
                <span className="text-[13px] font-medium">{step.label}</span>
                <span className="text-[12px] text-muted-foreground ml-2">{step.shortDescription}</span>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">{step.estimatedTime}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-[12px] text-muted-foreground">Est. total: 20–50 min depending on codebase size</p>
          <button
            onClick={handleGetStarted}
            className="h-9 px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors shrink-0"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  )
}
