interface StepInfoProps {
  what: readonly string[]
  inputs: string
  outputs: string
  estimatedTime: string
  modifiesFiles?: boolean
  contextNote?: string
}

export function StepInfo({ what, inputs, outputs, estimatedTime, modifiesFiles, contextNote }: StepInfoProps) {
  return (
    <div className="flex flex-col gap-3">
      {modifiesFiles && (
        <div className="border border-[oklch(0.82_0.06_80)] bg-[oklch(0.98_0.015_80)] px-4 py-3 flex items-start gap-3">
          <span className="text-[oklch(0.5_0.1_60)] text-[13px] shrink-0 mt-px">!</span>
          <p className="text-[13px] text-[oklch(0.4_0.08_60)]">
            <span className="font-semibold">This step will modify your codebase.</span> Commit or stash your current changes before running.
          </p>
        </div>
      )}

      {contextNote && (
        <div className="border border-border bg-muted/30 px-4 py-3">
          <p className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Using: </span>{contextNote}
          </p>
        </div>
      )}

      <div className="border border-border grid grid-cols-1 divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">What this step does</p>
          <ul className="flex flex-col gap-1.5">
            {what.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span className="text-muted-foreground shrink-0 mt-px">–</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 py-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reads</p>
            <p className="text-[12px] text-muted-foreground">{inputs}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Produces</p>
            <p className="text-[12px] text-muted-foreground">{outputs}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Est. time</p>
            <p className="text-[12px] text-muted-foreground">{estimatedTime}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
