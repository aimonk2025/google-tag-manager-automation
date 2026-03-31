import { cn } from '@/lib/utils'
import { useLocalToggle } from '@/hooks/useLocalToggle'
import type { FileChange } from '@/types/session'

interface DiffPanelProps {
  filePath: string
  diff: string
  originalContent?: string
  proposedContent?: string
  status: FileChange['status']
  onApply: () => void
  onSkip: () => void
  className?: string
}

// Lightweight syntax tokenizer for JS/TS/JSX/TSX
type TokenType = 'keyword' | 'string' | 'comment' | 'plain'
interface Token { text: string; type: TokenType }

function tokenizeLine(line: string, ext: string): Token[] {
  if (!['ts', 'tsx', 'js', 'jsx'].includes(ext)) return [{ text: line, type: 'plain' }]

  const tokens: Token[] = []
  let i = 0
  const keywords = new Set(['const', 'let', 'var', 'function', 'return', 'export', 'import', 'default', 'from', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'async', 'await', 'new', 'this', 'true', 'false', 'null', 'undefined'])

  while (i < line.length) {
    // Line comment
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ text: line.slice(i), type: 'comment' })
      break
    }
    // String literals
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i]
      let j = i + 1
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++
        j++
      }
      tokens.push({ text: line.slice(i, j + 1), type: 'string' })
      i = j + 1
      continue
    }
    // Word boundaries (keywords)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i
      while (j < line.length && /[\w$]/.test(line[j])) j++
      const word = line.slice(i, j)
      tokens.push({ text: word, type: keywords.has(word) ? 'keyword' : 'plain' })
      i = j
      continue
    }
    // Plain characters — accumulate runs
    const last = tokens[tokens.length - 1]
    if (last?.type === 'plain') {
      last.text += line[i]
    } else {
      tokens.push({ text: line[i], type: 'plain' })
    }
    i++
  }
  return tokens
}

function renderTokens(tokens: Token[]) {
  return tokens.map((t, i) => {
    if (t.type === 'keyword') return <span key={i} className="text-violet-700">{t.text}</span>
    if (t.type === 'string') return <span key={i} className="text-amber-700">{t.text}</span>
    if (t.type === 'comment') return <span key={i} className="text-muted-foreground/60 italic">{t.text}</span>
    return <span key={i}>{t.text}</span>
  })
}

function SplitDiffView({ originalContent, proposedContent, filePath }: { originalContent: string; proposedContent: string; filePath: string }) {
  const ext = filePath.split('.').pop() ?? ''
  const origLines = originalContent.split('\n')
  const propLines = proposedContent.split('\n')
  const maxLines = Math.max(origLines.length, propLines.length)

  return (
    <div className="grid grid-cols-2 divide-x divide-border overflow-auto max-h-[480px]">
      <pre className="text-[11px] font-mono p-0 whitespace-pre-wrap">
        {Array.from({ length: maxLines }, (_, i) => {
          const line = origLines[i] ?? ''
          const propLine = propLines[i] ?? ''
          const changed = line !== propLine
          return (
            <div key={i} className={`flex gap-2 px-3 py-px ${changed ? 'bg-[oklch(0.97_0.02_20)]' : ''}`}>
              <span className="text-muted-foreground/40 select-none w-8 shrink-0 text-right text-[10px] pt-px">{i + 1}</span>
              <span className={changed ? 'text-[oklch(0.4_0.1_20)]' : ''}>{renderTokens(tokenizeLine(line || ' ', ext))}</span>
            </div>
          )
        })}
      </pre>
      <pre className="text-[11px] font-mono p-0 whitespace-pre-wrap">
        {Array.from({ length: maxLines }, (_, i) => {
          const line = propLines[i] ?? ''
          const origLine = origLines[i] ?? ''
          const changed = line !== origLine
          return (
            <div key={i} className={`flex gap-2 px-3 py-px ${changed ? 'bg-[oklch(0.97_0.02_150)]' : ''}`}>
              <span className="text-muted-foreground/40 select-none w-8 shrink-0 text-right text-[10px] pt-px">{i + 1}</span>
              <span className={changed ? 'text-[oklch(0.3_0.08_150)]' : ''}>{renderTokens(tokenizeLine(line || ' ', ext))}</span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

export function DiffPanel({ filePath, diff, originalContent, proposedContent, status, onApply, onSkip, className }: DiffPanelProps) {
  const [splitView, toggleSplitView] = useLocalToggle('diff-view-mode', false)
  const hasSplitData = Boolean(originalContent && proposedContent)

  return (
    <div className={cn('border border-border', className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted">
        <div className="flex items-center gap-3">
          <code className="text-xs font-mono text-muted-foreground">{filePath}</code>
          {hasSplitData && (
            <button
              onClick={toggleSplitView}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors border border-border px-1.5 py-0.5"
            >
              {splitView ? 'Unified' : 'Split'}
            </button>
          )}
        </div>
        {status === 'pending' ? (
          <div className="flex gap-2">
            <button
              onClick={onApply}
              className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground hover:bg-[oklch(0.145_0_0)] transition-colors"
            >
              Apply
            </button>
            <button
              onClick={onSkip}
              className="h-7 px-3 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
            >
              Skip
            </button>
          </div>
        ) : status === 'applied' ? (
          <span className="text-xs font-medium text-[oklch(0.4_0.1_150)] border border-[oklch(0.8_0.05_150)] px-2 py-0.5">Applied</span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground border border-border px-2 py-0.5">Skipped</span>
        )}
      </div>

      {splitView && hasSplitData ? (
        <SplitDiffView originalContent={originalContent!} proposedContent={proposedContent!} filePath={filePath} />
      ) : (
        <div className="font-mono text-xs overflow-x-auto">
          {diff.split('\n').map((line, i) => (
            <div
              key={i}
              className={cn(
                'px-4 py-0.5',
                line.startsWith('+') && !line.startsWith('+++') && 'bg-[oklch(0.97_0.02_150)] text-[oklch(0.3_0.08_150)]',
                line.startsWith('-') && !line.startsWith('---') && 'bg-[oklch(0.97_0.02_20)] text-[oklch(0.4_0.1_20)]',
              )}
            >
              <pre>{line}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
