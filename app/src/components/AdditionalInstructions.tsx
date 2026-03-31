import { useState, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface AdditionalInstructionsProps {
  skillName: string
}

const SKILL_TOOLTIPS: Record<string, string> = {
  'gtm-analytics-audit': 'e.g. "Focus only on the checkout and signup flows" or "Ignore legacy /blog pages"',
  'gtm-dom-standardization': 'e.g. "Prefix all IDs with shop_ for the e-commerce section" or "Skip elements inside .legacy-widget"',
  'gtm-strategy': 'e.g. "Prioritise lead gen events over engagement" or "We use Segment, so skip direct GA4 calls"',
  'gtm-implementation': 'e.g. "Use TypeScript-style imports" or "Do not modify files under /vendor"',
  'gtm-testing': 'e.g. "Skip form validation events, tested manually" or "Also check the GA4 measurement ID matches production"',
  'gtm-reporting': 'e.g. "Include a section on what was intentionally skipped and why" or "Max 800 words"',
}

export function AdditionalInstructions({ skillName }: AdditionalInstructionsProps) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)

  const tooltip = SKILL_TOOLTIPS[skillName]

  useEffect(() => {
    api.getSkillConfig(skillName)
      .then(cfg => setText(cfg.additionalInstructions ?? ''))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [skillName])

  async function handleSave() {
    await api.updateSkillConfig(skillName, { additionalInstructions: text })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return null

  return (
    <div className="border border-border">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Additional Instructions
          </span>
          {tooltip && (
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onFocus={() => setShowTooltip(true)}
                onBlur={() => setShowTooltip(false)}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                aria-label="Additional instructions help"
              >
                <HelpCircle size={12} />
              </button>
              {showTooltip && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-foreground text-background text-[11px] leading-relaxed px-3 py-2 shadow-lg">
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Optional instructions appended to every run..."
        className="w-full px-4 py-3 text-[12px] font-mono bg-transparent resize-none focus:outline-none min-h-[72px]"
        rows={3}
      />
    </div>
  )
}
