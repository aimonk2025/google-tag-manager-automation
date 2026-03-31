import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SkillOutputProps {
  output: string
  isRunning: boolean
  className?: string
}

export function SkillOutput({ output, isRunning, className }: SkillOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [output])

  return (
    <div className={cn('border border-border bg-muted font-mono text-sm p-4 max-h-80 overflow-y-auto', className)}>
      <pre className="whitespace-pre-wrap break-words">{output}</pre>
      {isRunning && <span className="animate-pulse">|</span>}
      <div ref={bottomRef} />
    </div>
  )
}
