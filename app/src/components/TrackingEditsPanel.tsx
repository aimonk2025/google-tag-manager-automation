import { FileCode, Tag, CheckCircle2 } from 'lucide-react'
import type { ParsedRunEdits } from '@/lib/api'

export function TrackingEditsPanel({ edits, status }: { edits: ParsedRunEdits; status: string }) {
  if (status !== 'complete') return null

  const files = Object.entries(edits.byFile)
  const examinedFiles = edits.filesExamined ?? []

  if (edits.noChanges) {
    return (
      <div className="flex flex-col gap-4">
        <div className="border border-border px-4 py-4 flex flex-col gap-2">
          <p className="text-sm font-medium">No changes made</p>
          {edits.summaryText ? (
            <p className="text-xs text-muted-foreground leading-relaxed">{edits.summaryText}</p>
          ) : (
            <p className="text-xs text-muted-foreground">All elements were already tracked, or nothing matched the scope.</p>
          )}
        </div>
        {examinedFiles.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pages Examined</p>
            <div className="border border-border divide-y divide-border">
              {examinedFiles.map(filePath => {
                const fileName = filePath.split('/').pop() ?? filePath
                const dir = filePath.split('/').slice(0, -1).join('/')
                return (
                  <div key={filePath} className="px-4 py-2.5 flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-[oklch(0.4_0.1_150)] shrink-0" />
                    <span className="text-[13px] font-mono font-medium">{fileName}</span>
                    {dir && <span className="text-[11px] text-muted-foreground font-mono truncate">{dir}</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground shrink-0">already tracked</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {edits.summaryText && (
        <div className="border border-border px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Summary</p>
          <p className="text-[13px] text-foreground/80 leading-relaxed">{edits.summaryText}</p>
        </div>
      )}

      {/* Stats bar */}
      <div className="border border-border grid grid-cols-2 divide-x divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Elements Tracked</p>
          <p className="text-2xl font-bold leading-none">{edits.totalEdits}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Files Modified</p>
          <p className="text-2xl font-bold leading-none">{edits.filesModified}</p>
        </div>
      </div>

      {/* Modified files with element breakdown */}
      {files.map(([filePath, fileEdits]) => {
        const fileName = filePath.split('/').pop() ?? filePath
        const dir = filePath.split('/').slice(0, -1).join('/')
        return (
          <div key={filePath} className="border border-border">
            <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
              <FileCode size={13} className="text-muted-foreground shrink-0" />
              <span className="text-[13px] font-semibold font-mono">{fileName}</span>
              {dir && <span className="text-[11px] text-muted-foreground font-mono truncate">{dir}</span>}
              <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{fileEdits.length} element{fileEdits.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-border">
              {fileEdits.map((edit, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <Tag size={12} className="text-[oklch(0.4_0.1_150)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{edit.elementText}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {edit.addedId && (
                        <code className="text-[11px] bg-muted px-1.5 py-0.5 font-mono text-foreground/70">
                          id="{edit.addedId}"
                        </code>
                      )}
                      {edit.addedClasses.map(cls => (
                        <code key={cls} className="text-[11px] bg-[oklch(0.95_0.04_150)] px-1.5 py-0.5 font-mono text-[oklch(0.35_0.1_150)]">
                          .{cls}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Files examined but already tracked */}
      {examinedFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Already Tracked</p>
          <div className="border border-border divide-y divide-border">
            {examinedFiles.map(filePath => {
              const fileName = filePath.split('/').pop() ?? filePath
              const dir = filePath.split('/').slice(0, -1).join('/')
              return (
                <div key={filePath} className="px-4 py-2.5 flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-[oklch(0.4_0.1_150)] shrink-0" />
                  <span className="text-[13px] font-mono font-medium">{fileName}</span>
                  {dir && <span className="text-[11px] text-muted-foreground font-mono truncate">{dir}</span>}
                  <span className="ml-auto text-[11px] text-muted-foreground shrink-0">no changes needed</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
