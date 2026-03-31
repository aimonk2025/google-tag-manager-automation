import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AuditReport } from '@/types/session'

export function parseRawSummary(raw: string): { tracked: number | null; total: number | null; gaps: number | null; pct: number | null; framework: string | null; filesScanned: number | null } {
  const pctMatch = raw.match(/(\d+(?:\.\d+)?)\s*%\s*(?:analytics\s*)?(?:coverage|ready|readiness)/i)
  const slashMatch = raw.match(/(\d+)\s*\/\s*(\d+)\s*(?:elements?|components?)?(?:\s*tracked)?/i)
  const ofMatch = raw.match(/(\d+)\s*of\s*(\d+)\s*(?:elements?|components?)?(?:\s*tracked)?/i)
  const trackedMatch = raw.match(/(\d+)\s*(?:elements?\s*)?(?:tracked|with\s*tracking)/i)
  const totalMatch = raw.match(/(\d+)\s*(?:total\s*)?(?:elements?|components?|clickable)/i)
  const gapsMatch = raw.match(/(\d+)\s*(?:elements?\s*)?(?:without\s*tracking|untracked|gaps?)/i)
  const filesMatch = raw.match(/(\d+)\s*files?\s*scanned/i)
  const fwMatch = raw.match(/(?:framework|detected)[:\s]+([A-Za-z][A-Za-z0-9.\s-]{1,20})/i) ??
                  raw.match(/\b(Next\.?js|React|Vue|Angular|Svelte|Nuxt|Remix)\b/i)

  const pct = pctMatch ? parseFloat(pctMatch[1]) : null

  let tracked: number | null = null
  let total: number | null = null
  if (slashMatch) {
    tracked = parseInt(slashMatch[1])
    total = parseInt(slashMatch[2])
  } else if (ofMatch) {
    tracked = parseInt(ofMatch[1])
    total = parseInt(ofMatch[2])
  } else {
    tracked = trackedMatch ? parseInt(trackedMatch[1]) : null
    total = totalMatch ? parseInt(totalMatch[1]) : null
  }

  const gaps = gapsMatch ? parseInt(gapsMatch[1]) : null
  const filesScanned = filesMatch ? parseInt(filesMatch[1]) : null
  const framework = fwMatch ? fwMatch[1].trim() : null

  return { tracked, total, gaps, pct, framework, filesScanned }
}

export function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()) } catch { /* continue */ }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch { /* ignore */ }
  }
  return null
}

export function AuditSummaryBar({ report, rawOutput }: { report: AuditReport | null; rawOutput: string }) {
  const tracked = report?.summary?.withTracking ?? null
  const total = report?.summary?.totalClickableElements ?? null
  const gaps = report?.summary?.withoutTracking
    ?? (total != null && tracked != null ? total - tracked : null)
  const analyticsReadiness = report?.summary?.analyticsReadiness ?? null
  const framework = report?.metadata?.framework ?? null
  const filesScanned = report?.metadata?.filesScanned ?? null
  const hasP0Gaps = report?.issues?.some(i => i.severity === 'high') ?? false

  const raw = (!report && rawOutput) ? parseRawSummary(rawOutput) : null

  const displayTracked = tracked ?? raw?.tracked
  const displayTotal = total ?? raw?.total
  const rawGaps = raw?.gaps ?? (raw?.total != null && raw?.tracked != null ? raw.total - raw.tracked : null)
  const displayGaps = (gaps != null && !isNaN(Number(gaps))) ? gaps : rawGaps
  const displayFramework = framework ?? raw?.framework
  const displayFiles = filesScanned ?? raw?.filesScanned

  const pct = displayTotal && displayTracked != null && displayTotal > 0
    ? Math.round((displayTracked / displayTotal) * 100)
    : raw?.pct ?? null

  const readiness = analyticsReadiness ?? (pct != null ? `${Math.round(pct)}%` : null)

  if (!readiness && displayTracked == null && displayGaps == null) return null

  return (
    <div className="border border-border grid grid-cols-4 divide-x divide-border">
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Coverage</p>
        <p className="text-2xl font-bold leading-none">{readiness ?? '—'}</p>
        {pct != null && (
          <div className="mt-2 w-full h-1 bg-muted overflow-hidden">
            <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        )}
        {!report && <p className="text-[10px] text-muted-foreground mt-1">estimated from output</p>}
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tracked</p>
        <p className="text-2xl font-bold leading-none">{displayTracked ?? '—'}</p>
        {displayTotal != null && (
          <p className="text-[12px] text-muted-foreground mt-1">of {displayTotal} elements</p>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Gaps</p>
        <p className={`text-2xl font-bold leading-none ${(hasP0Gaps || (displayGaps ?? 0) > 0) ? 'text-[oklch(0.45_0.1_25)]' : ''}`}>
          {displayGaps ?? '—'}
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          {hasP0Gaps ? 'P0 gaps detected' : displayGaps === 0 ? 'no gaps' : displayGaps != null ? 'to address' : ''}
        </p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Framework</p>
        <p className="text-[14px] font-semibold leading-none mt-1">{displayFramework ?? 'Unknown'}</p>
        {displayFiles != null && (
          <p className="text-[12px] text-muted-foreground mt-1">{displayFiles} files scanned</p>
        )}
      </div>
    </div>
  )
}

export function AuditResults({ report }: { report: AuditReport }) {
  const tracked = report.summary?.withTracking ?? 0
  const total = report.summary?.totalClickableElements ?? 0
  const gaps = report.summary?.withoutTracking ?? (total - tracked)
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0
  const readiness = report.summary?.analyticsReadiness ?? `${pct}%`

  return (
    <div className="flex flex-col gap-4">

      <div className="border border-border p-5 flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Analytics Coverage</p>
            <p className="text-3xl font-bold">{readiness}</p>
          </div>
          <div className="text-right text-[13px] text-muted-foreground">
            <p><span className="font-semibold text-foreground">{tracked}</span> tracked</p>
            <p><span className="font-semibold text-foreground">{!isNaN(gaps) ? gaps : '—'}</span> gaps</p>
          </div>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-6 text-[12px] text-muted-foreground">
          <span>{report.metadata?.framework ?? 'Unknown framework'}</span>
          <span>{report.metadata?.filesScanned ?? '?'} files scanned</span>
          <span>{total} total elements</span>
        </div>
      </div>

      {report.categorized && Object.keys(report.categorized).length > 0 && (
        <div className="border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold">Element Breakdown</h2>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(report.categorized).map(([cat, data]) => {
              const catPct = data.total > 0 ? Math.round((data.tracked / data.total) * 100) : 0
              return (
                <div key={cat} className="px-4 py-3 flex items-center gap-4">
                  <span className="text-[13px] font-medium capitalize w-28 shrink-0">{cat}</span>
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-foreground" style={{ width: `${catPct}%` }} />
                    </div>
                    <span className="text-[12px] text-muted-foreground w-8 text-right">{catPct}%</span>
                  </div>
                  <span className="text-[12px] text-muted-foreground shrink-0">
                    {data.tracked}/{data.total}
                  </span>
                  {data.untracked > 0 && (
                    <span className="text-[11px] font-medium text-[oklch(0.45_0.08_25)] bg-[oklch(0.97_0.02_20)] px-1.5 py-0.5 shrink-0">
                      {data.untracked} gap{data.untracked !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {report.issues?.length > 0 && (
        <div className="border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Issues</h2>
            <span className="text-[12px] text-muted-foreground">{report.issues.length} found</span>
          </div>
          <div className="divide-y divide-border">
            {report.issues.map((issue, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <SeverityBadge severity={issue.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium capitalize">{issue.type.replace(/_/g, ' ')}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{issue.description}</p>
                  {issue.examples && issue.examples.length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {issue.examples.slice(0, 2).map((ex, j) => (
                        <code key={j} className="text-[11px] text-muted-foreground font-mono">{ex}</code>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[13px] font-semibold text-muted-foreground shrink-0">{issue.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.recommendations?.length > 0 && (
        <div className="border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold">Recommendations</h2>
          </div>
          <div className="divide-y divide-border">
            {report.recommendations.map((rec, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <PriorityBadge priority={rec.priority} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">{rec.action}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{rec.reason}</p>
                  {(rec.impact ?? rec.expectedValue) && (
                    <p className="text-[11px] text-muted-foreground mt-1 italic">{rec.impact ?? rec.expectedValue}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.existingTracking && (
        <div className="border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold">Existing Tracking</h2>
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            {report.existingTracking.libraries?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {report.existingTracking.libraries.map((lib, i) => (
                  <span key={i} className="text-[12px] font-medium border border-border px-2 py-0.5">{lib}</span>
                ))}
              </div>
            )}
            {report.existingTracking.patterns?.map((p, i) => (
              <p key={i} className="text-[12px] text-muted-foreground font-mono">{p}</p>
            ))}
            {report.existingTracking.coverage && (
              <p className="text-[12px] text-muted-foreground">Coverage: {report.existingTracking.coverage}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function RawOutputToggle({ output }: { output: string }) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  const measure = useCallback(() => {
    if (contentRef.current) setHeight(contentRef.current.scrollHeight)
  }, [])

  useEffect(() => {
    if (open) measure()
  }, [open, output, measure])

  return (
    <div className="border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <span
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-flex' }}
        >
          <ChevronRight size={13} />
        </span>
        {open ? 'Hide' : 'View'} full output
        <span className="ml-auto text-[11px] text-muted-foreground opacity-60">
          {output.split('\n').length} lines
        </span>
      </button>
      <div
        style={{
          height: open ? height : 0,
          overflow: 'hidden',
          transition: 'height 250ms ease',
        }}
      >
        <div ref={contentRef} className="border-t border-border">
          <AuditLiveOutput output={output} isRunning={false} />
        </div>
      </div>
    </div>
  )
}

export function AuditLiveOutput({ output, isRunning }: { output: string; isRunning: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [output])

  return (
    <div className="border border-border flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/30">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Audit Output</span>
        {isRunning && (
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Running
          </span>
        )}
      </div>
      <div className="px-6 py-5 max-h-[560px] overflow-y-auto text-[13px] leading-[1.7]">
        <MarkdownText text={output} />
        {isRunning && <span className="animate-pulse text-muted-foreground ml-0.5">▋</span>}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0
  let inCodeBlock = false
  let codeLines: string[] = []
  let inTable = false
  let tableRows: string[][] = []

  const flushTable = (key: number) => {
    if (tableRows.length === 0) return null
    const [header, ...body] = tableRows
    const node = (
      <div key={`table-${key}`} className="my-3 border border-border overflow-hidden text-[12px]">
        <div className="grid bg-muted/50 border-b border-border" style={{ gridTemplateColumns: `repeat(${header.length}, 1fr)` }}>
          {header.map((cell, j) => (
            <div key={j} className="px-3 py-2 font-semibold text-foreground border-r border-border last:border-r-0 truncate">{cell}</div>
          ))}
        </div>
        {body.map((row, ri) => (
          <div key={ri} className="grid border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors" style={{ gridTemplateColumns: `repeat(${header.length}, 1fr)` }}>
            {row.map((cell, j) => {
              const trimmed = cell.trim()
              const isPriority = /^P[012]$/.test(trimmed)
              return (
                <div key={j} className="px-3 py-2 border-r border-border last:border-r-0">
                  {isPriority ? (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
                      trimmed === 'P0' ? 'bg-foreground text-background' :
                      trimmed === 'P1' ? 'border border-border text-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>{trimmed}</span>
                  ) : (
                    <span className="text-foreground">{renderInline(trimmed)}</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
    tableRows = []
    return node
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLines = []
        i++; continue
      } else {
        inCodeBlock = false
        result.push(
          <pre key={i} className="my-3 bg-muted border border-border px-4 py-3 text-[12px] font-mono overflow-x-auto leading-relaxed text-muted-foreground">
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = []
        i++; continue
      }
    }
    if (inCodeBlock) { codeLines.push(line); i++; continue }

    if (line.startsWith('|')) {
      inTable = true
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim())
      const isSep = cells.every(c => /^[-:\s]+$/.test(c))
      if (!isSep) tableRows.push(cells)
      i++; continue
    } else if (inTable) {
      inTable = false
      const flushed = flushTable(i)
      if (flushed) result.push(flushed)
    }

    if (line.startsWith('### ')) {
      result.push(<h3 key={i} className="text-[13px] font-bold text-foreground mt-5 mb-1.5">{renderInline(line.slice(4))}</h3>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      result.push(<h2 key={i} className="text-[14px] font-bold text-foreground mt-6 mb-2 pb-1.5 border-b border-border">{renderInline(line.slice(3))}</h2>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      result.push(<h1 key={i} className="text-[16px] font-bold text-foreground mt-4 mb-2">{renderInline(line.slice(2))}</h1>)
      i++; continue
    }

    if (/^---+$/.test(line.trim())) {
      result.push(<hr key={i} className="border-border my-4" />)
      i++; continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push(
        <div key={i} className="flex gap-2.5 text-[13px] my-0.5">
          <span className="text-muted-foreground mt-[3px] shrink-0">-</span>
          <span className="text-foreground">{renderInline(line.slice(2))}</span>
        </div>
      )
      i++; continue
    }

    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1]
      result.push(
        <div key={i} className="flex gap-2.5 text-[13px] my-0.5">
          <span className="text-muted-foreground shrink-0 font-mono text-[11px] mt-[3px]">{num}.</span>
          <span className="text-foreground">{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      )
      i++; continue
    }

    if (line.startsWith('> ')) {
      result.push(
        <div key={i} className="border-l-2 border-border pl-3 text-muted-foreground italic my-1 text-[13px]">
          {renderInline(line.slice(2))}
        </div>
      )
      i++; continue
    }

    if (!line.trim()) {
      result.push(<div key={i} className="h-2" />)
      i++; continue
    }

    if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      result.push(<p key={i} className="font-semibold text-foreground text-[13px] mt-3 mb-1">{line.slice(2, -2)}</p>)
      i++; continue
    }

    result.push(<p key={i} className="text-foreground text-[13px]">{renderInline(line)}</p>)
    i++
  }

  if (inTable) {
    const flushed = flushTable(i)
    if (flushed) result.push(flushed)
  }

  return <div className="flex flex-col">{result}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted border border-border px-1 py-px text-[11px] font-mono">{part.slice(1, -1)}</code>
    }
    return part
  })
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const classes = {
    high: 'bg-[oklch(0.97_0.02_20)] text-[oklch(0.4_0.1_20)] border border-[oklch(0.88_0.04_20)]',
    medium: 'bg-[oklch(0.97_0.01_60)] text-[oklch(0.45_0.08_60)] border border-[oklch(0.88_0.03_60)]',
    low: 'bg-muted text-muted-foreground border border-border',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 uppercase shrink-0 tracking-wider mt-0.5 ${classes[severity]}`}>
      {severity}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: 'P0' | 'P1' | 'P2' }) {
  const classes = {
    P0: 'bg-foreground text-background',
    P1: 'border border-border text-foreground',
    P2: 'bg-muted text-muted-foreground',
  }
  return (
    <span className={`text-[11px] font-semibold px-1.5 py-0.5 shrink-0 mt-0.5 ${classes[priority]}`}>
      {priority}
    </span>
  )
}
