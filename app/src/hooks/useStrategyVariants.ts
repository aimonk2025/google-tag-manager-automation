import { useState } from 'react'
import { useParallelSkillRun } from './useSkillRun'
import { useSession } from '@/context/SessionContext'

export const VARIANT_CONFIGS = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'P0 critical events only, max 5',
    prompt: `Using the audit findings in CONTEXT, create a conservative GA4 tracking strategy. Focus on P0 critical events only, maximum 5 events. Only include the highest-value user actions. Return a TrackingPlan JSON object only.`,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'P0 + P1 events, 10-15 events',
    prompt: `Using the audit findings in CONTEXT, create a balanced GA4 tracking strategy. Include P0 critical and P1 important events, targeting 10-15 events total. Return a TrackingPlan JSON object only.`,
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: 'All events, 20+ events',
    prompt: `Using the audit findings in CONTEXT, create a comprehensive GA4 tracking strategy. Include all P0, P1, and P2 events, targeting 20+ events. Cover every user interaction and conversion point. Return a TrackingPlan JSON object only.`,
  },
]

const SKILL_NAME = 'gtm-strategy'

export interface VariantResult {
  variantId: string
  output: string
}

export function useStrategyVariants() {
  const { session, markSkillComplete } = useSession()
  const [variantOutputs, setVariantOutputs] = useState<Record<string, string>>({})

  const parallel = useParallelSkillRun({
    onAllComplete: (results) => {
      setVariantOutputs(results)
    },
  })

  function runVariants() {
    if (!session?.projectPath) return
    setVariantOutputs({})
    parallel.run(SKILL_NAME, VARIANT_CONFIGS.map(v => ({
      id: v.id,
      prompt: v.prompt,
      scope: session.projectPath,
    })))
  }

  function selectVariant(variantId: string) {
    const variantOutput = variantOutputs[variantId]
    if (!variantOutput) return
    const jsonMatch = variantOutput.match(/```(?:json)?\s*([\s\S]*?)```/) ?? variantOutput.match(/(\{[\s\S]*\})/)
    const jsonStr = jsonMatch?.[1] ?? variantOutput
    try {
      const plan = JSON.parse(jsonStr)
      markSkillComplete(SKILL_NAME, '', plan)
    } catch {
      markSkillComplete(SKILL_NAME, '', null)
    }
    setVariantOutputs({})
  }

  function resetVariants() {
    setVariantOutputs({})
  }

  const allVariantsComplete = Object.keys(variantOutputs).length === VARIANT_CONFIGS.length

  return {
    parallel,
    variantOutputs,
    allVariantsComplete,
    runVariants,
    selectVariant,
    resetVariants,
  }
}
